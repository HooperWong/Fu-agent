/**
 * 快捷键系统（renderer 层）
 *
 * - 从 types/shortcut.ts re-export 纯常量和工具
 * - 定义 renderer 特有的 atom 和持久化辅助
 */

import { atom } from 'jotai'
import {
  SHORTCUT_ACTIONS,
  getDefaultShortcuts,
  shortcutFromEvent,
  formatShortcutDisplay,
  matchesShortcut,
} from '../../types/shortcut'

export { SHORTCUT_ACTIONS, getDefaultShortcuts, shortcutFromEvent, formatShortcutDisplay, matchesShortcut }

/** 全部快捷键 atom（从 settings.shortcuts 加载，缺失时使用默认） */
export const shortcutsAtom = atom<Record<string, string>>({})

/** 从主进程加载 shortcuts 到 atom */
export async function initializeShortcuts(
  setShortcuts: (value: Record<string, string>) => void,
): Promise<void> {
  try {
    const settings = await window.electronAPI.getSettings()
    const defaults = getDefaultShortcuts()

    const loaded: Record<string, string> = { ...defaults }
    if (settings.shortcuts) {
      Object.assign(loaded, settings.shortcuts)
    } else if (settings.newConversationShortcut) {
      loaded.newConversation = settings.newConversationShortcut
    }

    try {
      await window.electronAPI.updateSettings({ shortcuts: loaded })
    } catch {
      // 忽略写回失败
    }

    setShortcuts(loaded)
  } catch {
    setShortcuts(getDefaultShortcuts())
  }
}

/** 更新单条快捷键（atom + 持久化） */
export async function updateShortcut(
  id: string,
  shortcut: string,
): Promise<void> {
  await window.electronAPI.updateSettings({
    shortcuts: { [id]: shortcut },
  })
}
