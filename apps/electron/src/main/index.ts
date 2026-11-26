import { app, BrowserWindow, Menu, net, protocol, screen, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { pathToFileURL } from 'url'
import { basename } from 'path'
import { createApplicationMenu } from './menu'
import { registerIpcHandlers } from './ipc'
import { createTray, destroyTray } from './tray'
import { getSettings } from './lib/settings-service'
import { initializeRuntime } from './lib/runtime-init'
import { seedDefaultSkills, ensureDataLayout } from './lib/config-paths'
import { installLogRedaction } from './lib/security/log-redaction'
import { loadDotEnv } from './lib/security/secret-service'
import { initScheduler } from './lib/efficiency/efficiency-service'
import { getNoteAssetsDir } from './lib/notes/note-service'
import { stopAllAgents } from './lib/agent-service'
import { stopAllGenerations } from './lib/chat-service'
import { initAutoUpdater, cleanupUpdater } from './lib/updater/auto-updater'
import { startWorkspaceWatcher, stopWorkspaceWatcher } from './lib/workspace-watcher'
import { getIsQuitting, setQuitting, isUpdating } from './lib/app-lifecycle'
import { isDevMode, isProductionBuild } from './lib/app-mode'

let mainWindow: BrowserWindow | null = null

// 安全底座：先接管日志脱敏，再加载密钥，确保后续任何输出/读取都受保护
installLogRedaction()
loadDotEnv()

// 笔记图片等附件通过自定义协议在应用内展示（需在 app ready 前注册）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'fu-asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true },
  },
])

/**
 * 检查窗口是否在可用显示器范围内
 * 处理外接显示器断开后窗口位于不可见区域的情况
 */
function ensureWindowOnScreen(win: BrowserWindow): void {
  const bounds = win.getBounds()
  const displays = screen.getAllDisplays()
  // 检查窗口中心点是否在任一显示器范围内
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const isOnScreen = displays.some((display) => {
    const { x, y, width, height } = display.workArea
    return centerX >= x && centerX <= x + width && centerY >= y && centerY <= y + height
  })
  if (!isOnScreen) {
    // 窗口不在任何屏幕内，移动到主显示器居中位置
    const primary = screen.getPrimaryDisplay()
    const { x, y, width, height } = primary.workArea
    win.setBounds({
      x: x + Math.round((width - bounds.width) / 2),
      y: y + Math.round((height - bounds.height) / 2),
      width: bounds.width,
      height: bounds.height,
    })
    console.log('[窗口] 窗口已重新定位到主显示器')
  }
}

/** 显示并聚焦主窗口，确保窗口在可见区域；若窗口已销毁则重新创建 */
function showAndFocusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  ensureWindowOnScreen(mainWindow)
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
}

/**
 * Get the appropriate app icon path for the current platform
 */
function getIconPath(): string {
  // resources 在 build:resources 阶段被复制到 dist/ 下，与 main.cjs 同级
  const resourcesDir = join(__dirname, 'resources')

  if (process.platform === 'darwin') {
    return join(resourcesDir, 'icon.icns')
  } else if (process.platform === 'win32') {
    return join(resourcesDir, 'icon.ico')
  } else {
    return join(resourcesDir, 'icon.png')
  }
}

function createWindow(): void {
  const iconPath = getIconPath()
  const iconExists = existsSync(iconPath)

  if (!iconExists) {
    console.warn('App icon not found at:', iconPath)
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: iconExists ? iconPath : undefined,
    show: false, // Don't show until ready
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // 分栏「浏览器」使用 <webview> 加载外部网页
      webviewTag: true,
    },
    titleBarStyle: 'hiddenInset', // macOS style
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'under-window', // macOS glass effect
    visualEffectState: 'active',
  })

  // Load the renderer
  const isDev = isDevMode()
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, 'renderer', 'index.html'))
  }

  // 窗口就绪后最大化显示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })

  // 拦截页面内导航，外部链接用系统浏览器打开，防止 Electron 窗口被覆盖
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // 允许开发模式下的 Vite HMR 热重载
    if (isDev && url.startsWith('http://localhost:')) return
    event.preventDefault()
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
  })

  // 拦截 window.open / target="_blank" 链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // 分栏网页视图安全约束：不注入 preload、禁用 Node，保持沙箱
  mainWindow.webContents.on('will-attach-webview', (_event, webPreferences) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
  })

  // macOS: 点击关闭按钮时隐藏窗口+应用，而不是退出
  // 同时隐藏应用（类似 Cmd+H），确保点击 Dock 图标时 macOS 能正确触发 activate 事件
  if (process.platform === 'darwin') {
    mainWindow.on('close', (event) => {
      if (!getIsQuitting()) {
        event.preventDefault()
        mainWindow?.hide()
        app.hide()
      }
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  // Windows 任务栏图标：注册 AppUserModelID。
  // 机制说明：electron.exe（开发/便携启动方式）内嵌的是 Electron 原子图标，
  // Windows 任务栏按钮图标取「AUMID 关联的快捷方式图标」，找不到关联时回退 exe 内嵌图标。
  // 快捷方式的显式 AUMID 属性经三种 COM 途径均无法可靠写入 .lnk 文件（已实测），
  // 但 Windows 会给「开始菜单\Programs\Fu Agent.lnk」自动分配一个由路径哈希生成的稳定 AUMID，
  // 因此应用直接注册这个系统分配的 AUMID，即可与快捷方式（Fu 图标）关联。
  // 注意：若移动/删除该开始菜单快捷方式，AUMID 会变化，任务栏图标将回退为原子图标；
  // 可用环境变量 FU_APP_AUMID 覆盖。
  if (process.platform === 'win32') {
    const aumid =
      process.env.FU_APP_AUMID?.trim() ||
      'Microsoft.AutoGenerated.{753755D3-CF21-8310-9689-7A09BE953A62}'
    app.setAppUserModelId(aumid)
  }

  // 初始化个人数据目录结构（缺失子目录自动补齐）
  ensureDataLayout()

  // 加载已启用的定时任务
  initScheduler()

  // 笔记附件协议：fu-asset://<文件名> → data/notes/assets/<文件名>
  protocol.handle('fu-asset', (request) => {
    try {
      const fileName = decodeURIComponent(new URL(request.url).hostname)
      // 只允许纯文件名，阻断目录穿越
      if (!fileName || basename(fileName) !== fileName) {
        return new Response('forbidden', { status: 403 })
      }
      const filePath = join(getNoteAssetsDir(), fileName)
      if (!existsSync(filePath)) {
        return new Response('not found', { status: 404 })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('bad request', { status: 400 })
    }
  })

  // 初始化运行时环境（Shell 环境 + Bun + Git 检测）
  // 必须在其他初始化之前执行，确保环境变量正确加载
  await initializeRuntime()

  // 同步默认 Skills 模板到 ~/.proma/default-skills/
  seedDefaultSkills()

  // Create application menu
  const menu = createApplicationMenu()
  Menu.setApplicationMenu(menu)

  // Register IPC handlers
  registerIpcHandlers()

  // Set dock icon on macOS (required for dev mode, bundled apps use Info.plist)
  if (process.platform === 'darwin' && app.dock) {
    const dockIconPath = join(__dirname, 'resources/icon.png')
    if (existsSync(dockIconPath)) {
      app.dock.setIcon(dockIconPath)
    }
  }

  // Create system tray icon (if enabled in settings)
  const settings = getSettings()
  if (settings.showTrayIcon !== false) {
    createTray()
  }

  // Create main window (will be shown when ready)
  createWindow()

  // 启动工作区文件监听（Agent MCP/Skills + 文件浏览器自动刷新）
  if (mainWindow) {
    startWorkspaceWatcher(mainWindow)
  }

  // 生产环境下初始化自动更新
  if (isProductionBuild() && mainWindow) {
    initAutoUpdater(mainWindow)
  }

  app.on('activate', () => {
    // 直接检查 mainWindow 引用，避免 getAllWindows() 包含 DevTools 等其他窗口导致误判
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
    } else {
      // 窗口已存在但可能被隐藏（macOS 关闭按钮 = hide），重新显示
      showAndFocusMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // 非 macOS：关闭所有窗口时退出应用
  // macOS：保持应用运行（可通过 tray 或 Dock 重新打开）
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // 标记正在退出，让 close 事件不再阻止关闭
  setQuitting()

  // 正在安装更新时，让 electron-updater 控制退出流程，不做额外操作
  if (isUpdating()) {
    console.log('[应用] 正在安装更新，跳过额外清理')
    return
  }

  // 中止所有活跃的 Agent 和 Chat 子进程
  stopAllAgents()
  stopAllGenerations()
  // 清理更新器定时器
  cleanupUpdater()
  // 停止工作区文件监听
  stopWorkspaceWatcher()
  // Clean up system tray before quitting
  destroyTray()
})
