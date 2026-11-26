/**
 * ShortcutSettings - 快捷键设置（全量可配置）
 *
 * - 所有内置快捷键都可点击按键区录制，ESC 取消
 * - 每条都可一键重置
 * - 系统级快捷键（Ctrl+Alt+Del 等）不可覆盖
 */

import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Keyboard, RotateCcw } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { cn } from '@/lib/utils'
import {
  shortcutsAtom,
  getDefaultShortcuts,
  SHORTCUT_ACTIONS,
  formatShortcutDisplay,
  shortcutFromEvent,
  updateShortcut,
} from '@/atoms/shortcut'

/** 系统级/主进程 role 提供的快捷键，只读不允许覆盖 */
const SYSTEM_RESERVED = new Set(['Alt+F4', 'Ctrl+Alt+Del', 'Ctrl+Shift+Esc', 'Ctrl+Alt+Tab'])

export function ShortcutSettings(): React.ReactElement {
  const [shortcuts, setShortcuts] = useAtom(shortcutsAtom)
  const defaults = getDefaultShortcuts()
  const [recordingId, setRecordingId] = React.useState<string | null>(null)
  const recordBtnRef = React.useRef<HTMLButtonElement | null>(null)

  /** 当前值（用户配置或默认） */
  const current = (id: string): string => shortcuts[id] ?? defaults[id] ?? ''

  /** 是否与默认值不同 */
  const isModified = (id: string): boolean => current(id) !== defaults[id]

  /** 录制快捷键 */
  React.useEffect(() => {
    if (!recordingId) return

    const handler = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        setRecordingId(null)
        return
      }

      const result = shortcutFromEvent(e)
      if (!result) return

      // 系统保留键位阻止
      const displayKey = result.toLowerCase()
      if (SYSTEM_RESERVED.has(displayKey)) {
        console.warn('[快捷键] 系统保留键位，已忽略:', result)
        return
      }

      setShortcuts((prev) => ({ ...prev, [recordingId]: result }))
      void updateShortcut(recordingId, result)
      setRecordingId(null)
    }

    const clickHandler = (e: MouseEvent): void => {
      if (recordBtnRef.current && !recordBtnRef.current.contains(e.target as Node)) {
        setRecordingId(null)
      }
    }

    document.addEventListener('keydown', handler, true)
    document.addEventListener('mousedown', clickHandler)
    return () => {
      document.removeEventListener('keydown', handler, true)
      document.removeEventListener('mousedown', clickHandler)
    }
  }, [recordingId, setShortcuts])

  const resetOne = (id: string): void => {
    setShortcuts((prev) => {
      const next = { ...prev }
      delete next[id] // 让它重新回落到默认
      return next
    })
    // 写入 settings 触发菜单重建
    void window.electronAPI.updateSettings({
      shortcuts: { [id]: defaults[id] ?? '' },
    })
  }

  const resetAll = (): void => {
    setShortcuts(defaults)
    void window.electronAPI.updateSettings({ shortcuts: defaults })
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        title="应用快捷键"
        description="点击按键区域后，直接按下新的组合键完成录制（除 Esc 外需要包含 Ctrl / Alt / Shift 等修饰键）"
      >
        <SettingsCard>
          {SHORTCUT_ACTIONS.map((action, idx) => {
            const value = current(action.id)
            const modified = isModified(action.id)
            const isRecording = recordingId === action.id
            const rowRef = (btn: HTMLButtonElement | null): void => {
              if (isRecording) recordBtnRef.current = btn
            }
            return (
              <SettingsRow
                key={action.id}
                label={action.label}
                description={action.description}
              >
                <div className="flex items-center gap-3">
                  <button
                    ref={rowRef}
                    onClick={() => setRecordingId(action.id)}
                    className={cn(
                      'px-5 py-1.5 rounded-lg text-[13px] font-mono tracking-widest transition-all duration-200 min-w-[120px] text-center',
                      isRecording
                        ? 'bg-primary/15 text-primary border border-primary/30 animate-pulse'
                        : modified
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/[0.1] hover:text-foreground border border-transparent',
                    )}
                  >
                    {isRecording ? '请按下…' : formatShortcutDisplay(value)}
                  </button>
                  {modified && (
                    <button
                      onClick={() => resetOne(action.id)}
                      className="inline-flex items-center gap-1 text-[12px] text-foreground/40 hover:text-foreground/70 transition-colors"
                      title={`重置为默认: ${formatShortcutDisplay(defaults[action.id] ?? '')}`}
                    >
                      <RotateCcw size={12} />
                    </button>
                  )}
                </div>
              </SettingsRow>
            )
          })}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="系统级快捷键" description="由操作系统或 Electron role 提供，不允许覆盖">
        <SettingsCard>
          {[
            { label: '关闭窗口（非 Mac）', keys: 'Alt+F4' },
            { label: '切断进程', keys: 'Ctrl+Alt+Del' },
            { label: '任务管理器', keys: 'Ctrl+Shift+Esc' },
          ].map((item) => (
            <SettingsRow key={item.label} label={item.label} description="系统保留">
              <kbd className="rounded-md border border-border/60 bg-foreground/[0.04] px-2.5 py-1 text-[12px] font-mono text-foreground/70">
                {item.keys}
              </kbd>
            </SettingsRow>
          ))}
        </SettingsCard>
      </SettingsSection>

      <div className="flex justify-end">
        <button
          onClick={resetAll}
          className="inline-flex items-center gap-1.5 text-[12px] text-foreground/50 hover:text-foreground/80 transition-colors"
        >
          <RotateCcw size={12} />
          全部重置为默认
        </button>
      </div>
    </div>
  )
}
