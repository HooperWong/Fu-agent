/**
 * 快捷键定义（主进程可 import 的纯常量）
 *
 * 所有纯数据、纯工具函数都放这里，避免 renderer/atoms/shortcut.ts
 * 里的 DOM / jotai 依赖被拉入主进程构建。
 */

/** 平台判断（运行时可用，Node 和浏览器都安全） */
const _isMac =
  typeof navigator !== 'undefined'
    ? navigator.platform.toLowerCase().includes('mac')
    : process.platform === 'darwin'

/** 可配置的快捷键动作定义 */
export interface ShortcutActionDef {
  /** 动作标识（settings.shortcuts 的 key） */
  id: string
  /** 中文标签 */
  label: string
  /** 说明 */
  description: string
  /** 默认快捷键（内部格式，如 "ctrl+n"） */
  defaultShortcut: string
  /** 只读（系统保留，不允许录制修改） */
  readOnly?: boolean
}

/**
 * 全部可配置动作
 *
 * 顺序即设置页展示顺序。
 */
export const SHORTCUT_ACTIONS: ShortcutActionDef[] = [
  {
    id: 'newConversation',
    label: '新建对话 / 会话',
    description: '在任意页面快速创建新的对话或 Agent 会话',
    defaultShortcut: _isMac ? 'meta+n' : 'ctrl+n',
  },
  {
    id: 'toggleAgentMode',
    label: '切换 Chat / Agent 模式',
    description: '在普通对话与 Agent 会话之间切换',
    defaultShortcut: _isMac ? 'meta+shift+a' : 'ctrl+shift+a',
  },
  {
    id: 'openSettings',
    label: '打开设置',
    description: '打开偏好设置面板',
    defaultShortcut: _isMac ? 'meta+,' : 'ctrl+,',
  },
  {
    id: 'closeSettings',
    label: '关闭设置',
    description: '从设置返回对话视图',
    defaultShortcut: 'escape',
  },
  {
    id: 'sendMessage',
    label: '发送消息',
    description: '输入框聚焦时发送当前消息',
    defaultShortcut: _isMac ? 'meta+enter' : 'ctrl+enter',
  },
  {
    id: 'clearContext',
    label: '清空上下文',
    description: '清空当前对话的历史上下文',
    defaultShortcut: _isMac ? 'meta+k' : 'ctrl+k',
  },
  {
    id: 'focusInput',
    label: '聚焦输入框',
    description: '将光标移到输入框，方便快速输入',
    defaultShortcut: _isMac ? 'meta+/ ' : 'ctrl+/',
  },
  {
    id: 'reloadWindow',
    label: '重新加载窗口',
    description: '重新加载界面（不丢失数据）',
    defaultShortcut: _isMac ? 'meta+r' : 'ctrl+r',
  },
  {
    id: 'toggleDevTools',
    label: '开发者工具',
    description: '打开/关闭调试控制台',
    defaultShortcut: _isMac ? 'alt+meta+i' : 'ctrl+shift+i',
  },
]

/** 默认快捷键集合 */
export function getDefaultShortcuts(): Record<string, string> {
  return Object.fromEntries(SHORTCUT_ACTIONS.map((a) => [a.id, a.defaultShortcut]))
}

/**
 * 从 KeyboardEvent 构建内部快捷键字符串（浏览器专用）
 */
export function shortcutFromEvent(e: KeyboardEvent): string | null {
  const ignoredKeys = new Set(['Meta', 'Control', 'Alt', 'Shift', 'CapsLock'])
  if (ignoredKeys.has(e.key)) return null

  if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    return 'escape'
  }

  const parts: string[] = []
  if (e.metaKey) parts.push('meta')
  if (e.ctrlKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')

  if (parts.length === 0) return null

  parts.push(e.key.toLowerCase())
  return parts.join('+')
}

/** 显示给用户的文本 */
export function formatShortcutDisplay(shortcut: string): string {
  if (!shortcut) return ''
  if (shortcut.toLowerCase() === 'escape') return 'Esc'

  const parts = shortcut.toLowerCase().split('+')
  const key = parts[parts.length - 1] ?? ''
  const modifiers = parts.slice(0, -1)

  if (_isMac) {
    const modMap: Record<string, string> = { meta: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧' }
    const modStr = modifiers.map((m) => modMap[m] ?? m).join('')
    return `${modStr} ${key.toUpperCase()}`
  }

  const modMap: Record<string, string> = { meta: 'Win', ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift' }
  const modStr = modifiers.map((m) => modMap[m] ?? m).join('+')
  return modStr ? `${modStr}+${key.toUpperCase()}` : key.toUpperCase()
}

/** 检测 KeyboardEvent 是否匹配内部格式快捷键 */
export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  if (!shortcut) return false

  const parts = shortcut.toLowerCase().split('+')
  const key = parts[parts.length - 1] ?? ''
  const modifiers = new Set(parts.slice(0, -1))

  if (e.key.toLowerCase() !== key) return false
  if (modifiers.has('meta') !== e.metaKey) return false
  if (modifiers.has('ctrl') !== e.ctrlKey) return false
  if (modifiers.has('alt') !== e.altKey) return false
  if (modifiers.has('shift') !== e.shiftKey) return false

  return true
}
