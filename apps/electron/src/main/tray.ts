import { Tray, Menu, app, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

let tray: Tray | null = null

/**
 * 获取托盘图标路径
 * macOS 使用 Template 单色图标；Windows 使用多尺寸 ICO（系统按 DPI 选取）；Linux 使用 PNG
 */
function getTrayIconPath(): string {
  // resources 在 build:resources 阶段被复制到 dist/ 下，与 main.cjs 同级
  const resourcesDir = join(__dirname, 'resources')
  if (process.platform === 'darwin') {
    return join(resourcesDir, 'proma-logos/iconTemplate.png')
  }
  if (process.platform === 'win32') {
    return join(resourcesDir, 'tray-icon.ico')
  }
  return join(resourcesDir, 'tray-icon.png')
}

/** 显示主窗口 */
function showMainWindow(): void {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length === 0) return
  const mainWindow = windows[0]!
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
}

/**
 * 创建系统托盘图标和菜单
 */
export function createTray(): Tray | null {
  const iconPath = getTrayIconPath()

  if (!existsSync(iconPath)) {
    console.warn('Tray icon not found at:', iconPath)
    return null
  }

  try {
    let image = nativeImage.createFromPath(iconPath)

    // macOS: 标记为 Template 图像
    // Template 图像必须是单色的，使用 alpha 通道定义形状
    // 系统会自动根据菜单栏主题填充颜色
    if (process.platform === 'darwin') {
      image.setTemplateImage(true)
    } else if (process.platform !== 'win32') {
      // Linux 托盘按 16px 渲染，缩小避免模糊（Windows 由 ICO 自带多尺寸）
      image = image.resize({ width: 16, height: 16 })
    }

    tray = new Tray(image)

    // 设置 tooltip
    tray.setToolTip('Fu Agent')

    // 创建右键菜单
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示 Fu Agent',
        click: () => showMainWindow()
      },
      {
        type: 'separator'
      },
      {
        label: '退出 Fu Agent',
        click: () => {
          app.quit()
        }
      }
    ])

    tray.setContextMenu(contextMenu)

    // 点击行为：始终弹出菜单（与右键一致）
    tray.on('click', () => {
      tray?.popUpContextMenu()
    })

    console.log('System tray created')
    return tray
  } catch (error) {
    console.error('Failed to create system tray:', error)
    return null
  }
}

/**
 * 销毁系统托盘
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

/**
 * 获取当前托盘实例
 */
export function getTray(): Tray | null {
  return tray
}
