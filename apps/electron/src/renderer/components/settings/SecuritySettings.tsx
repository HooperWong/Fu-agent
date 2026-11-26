/**
 * SecuritySettings - 安全设置页
 *
 * 展示密钥配置状态（只回显掩码）、写入 .env，以及最近的授权审计记录。
 * 密钥明文只在输入时经过主进程，页面上永不回显。
 */

import * as React from 'react'
import { CheckCircle2, ShieldAlert, ShieldCheck, RefreshCw, CircleSlash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsSection, SettingsCard } from './primitives'
import type { SecretStatus, AuditEntry, ApprovalRisk } from '../../../types'

/** 风险等级中文名 */
const RISK_LABELS: Record<ApprovalRisk, string> = {
  destructive: '破坏性操作',
  external: '对外发布',
  paid: '付费',
}

export function SecuritySettings(): React.ReactElement {
  const [secrets, setSecrets] = React.useState<SecretStatus[]>([])
  const [audit, setAudit] = React.useState<AuditEntry[]>([])
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const [statuses, entries] = await Promise.all([
        window.electronAPI.getSecretStatuses(),
        window.electronAPI.getAuditLog(50),
      ])
      setSecrets(statuses)
      setAudit(entries)
    } catch (error) {
      console.error('[安全设置] 加载失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const handleSaveSecret = async (key: string): Promise<void> => {
    const value = drafts[key]?.trim()
    if (!value) return

    setSavingKey(key)
    try {
      const statuses = await window.electronAPI.setSecret(key, value)
      setSecrets(statuses)
      setDrafts((prev) => ({ ...prev, [key]: '' }))
    } catch (error) {
      console.error('[安全设置] 保存密钥失败:', error)
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">加载中...</div>
  }

  return (
    <div className="space-y-8">
      <SettingsSection
        title="密钥与凭证"
        description="密钥只保存在应用根目录的 .env（已加入 .gitignore），不会进入 data/、不入库、不写日志"
      >
        <SettingsCard divided>
          {secrets.map((secret) => (
            <div key={secret.key} className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{secret.key}</span>
                    {secret.configured ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={12} /> 已配置
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <CircleSlash size={12} /> 未配置
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{secret.description}</div>
                </div>
                <span className="text-xs font-mono text-muted-foreground shrink-0">
                  {secret.masked ?? '—'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  placeholder={secret.configured ? '输入新值以覆盖（留空不改）' : '输入密钥后保存'}
                  value={drafts[secret.key] ?? ''}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [secret.key]: e.target.value }))
                  }
                />
                <Button
                  size="sm"
                  disabled={savingKey === secret.key || !(drafts[secret.key] ?? '').trim()}
                  onClick={() => void handleSaveSecret(secret.key)}
                >
                  {savingKey === secret.key ? '保存中...' : '保存'}
                </Button>
              </div>
            </div>
          ))}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="授权记录"
        description="删除数据、对外发布等敏感操作会在此留痕（最近 50 条，新的在前）"
        action={
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw size={14} className="mr-1.5" /> 刷新
          </Button>
        }
      >
        <SettingsCard divided={audit.length > 0}>
          {audit.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground text-center">
              暂无授权记录
            </div>
          ) : (
            audit.map((entry, index) => (
              <div key={`${entry.ts}-${index}`} className="px-4 py-2.5 flex items-center gap-3">
                {entry.approved ? (
                  <ShieldCheck size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <ShieldAlert size={15} className="text-amber-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{entry.action}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {RISK_LABELS[entry.risk]} · {entry.approved ? '已允许' : '已取消'}
                    {entry.detail ? ` · ${entry.detail}` : ''}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(entry.ts).toLocaleString('zh-CN', { hour12: false })}
                </span>
              </div>
            ))
          )}
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
