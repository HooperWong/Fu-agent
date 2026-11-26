/**
 * NotificationsSettings - 通知设置
 *
 * - 桌面通知总开关与测试通知
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { Bell, Loader2 } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow, SettingsToggle } from './primitives'
import {
  notificationsEnabledAtom,
  updateNotificationsEnabled,
} from '@/atoms/notifications'

export function NotificationsSettings(): React.ReactElement {
  const [notificationsEnabled, setNotificationsEnabled] = useAtom(notificationsEnabledAtom)
  const [testing, setTesting] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)

  const handleTestNotification = async (): Promise<void> => {
    setTesting(true)
    setNotice(null)
    try {
      const supported = await window.electronAPI.testNotification()
      setNotice(supported ? '已发送测试通知，请查看系统通知中心' : '当前系统不支持桌面通知')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '发送测试通知失败')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      <SettingsSection title="通知" description="Agent 完成任务或定时提醒时通知你">
        <SettingsCard>
          <SettingsToggle
            label="桌面通知"
            description="关闭后，应用与定时任务都不会发送系统通知"
            checked={notificationsEnabled}
            onCheckedChange={(checked) => {
              setNotificationsEnabled(checked)
              void updateNotificationsEnabled(checked)
            }}
          />
          <SettingsRow
            label="测试通知"
            description="立即发送一条系统通知，验证是否可用"
            icon={<Bell size={16} className="text-foreground/50" />}
          >
            <button
              onClick={() => void handleTestNotification()}
              disabled={testing || !notificationsEnabled}
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
              发送测试通知
            </button>
          </SettingsRow>
          {notice && (
            <div className="px-4 pb-4 text-xs text-muted-foreground">{notice}</div>
          )}
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
