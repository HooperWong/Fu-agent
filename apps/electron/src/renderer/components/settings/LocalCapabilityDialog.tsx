/**
 * LocalCapabilityDialog — 从本机其他 Agent 导入 MCP / Skill
 *
 * 只读扫描 Trae、WorkBuddy、CodeBuddy、Cherry Studio 的配置，
 * 勾选后复制/合并到当前工作区，不修改来源应用的任何文件。
 */

import * as React from 'react'
import { toast } from 'sonner'
import { Loader2, RefreshCw, Plug, Sparkles, AlertCircle, Check } from 'lucide-react'
import type { LocalCapabilityScanResult, McpServerEntry } from '@proma/shared'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface LocalCapabilityDialogProps {
  workspaceSlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 导入完成后回调（刷新列表） */
  onImported: () => void
}

export function LocalCapabilityDialog({
  workspaceSlug,
  open,
  onOpenChange,
  onImported,
}: LocalCapabilityDialogProps): React.ReactElement {
  const [loading, setLoading] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [result, setResult] = React.useState<LocalCapabilityScanResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  /** 选中的 MCP：key = `${来源路径}::${服务器名}` */
  const [selectedMcp, setSelectedMcp] = React.useState<Set<string>>(new Set())
  /** 选中的 Skill：key = 目录路径 */
  const [selectedSkills, setSelectedSkills] = React.useState<Set<string>>(new Set())

  const scan = React.useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.electronAPI.scanLocalCapabilities(workspaceSlug)
      setResult(res)
      // 默认全选可用项
      const mcpKeys = new Set<string>()
      for (const source of res.mcp) {
        for (const name of Object.keys(source.servers)) {
          mcpKeys.add(`${source.path}::${name}`)
        }
      }
      const skillKeys = new Set<string>()
      for (const skill of res.skills) {
        if (!skill.exists) skillKeys.add(skill.path)
      }
      setSelectedMcp(mcpKeys)
      setSelectedSkills(skillKeys)
    } catch (err) {
      setError(err instanceof Error ? err.message : '扫描失败')
    } finally {
      setLoading(false)
    }
  }, [workspaceSlug])

  React.useEffect(() => {
    if (open) void scan()
  }, [open, scan])

  const toggleMcp = (key: string): void => {
    setSelectedMcp((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleSkill = (path: string): void => {
    setSelectedSkills((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const handleImport = async (): Promise<void> => {
    if (!result) return
    setImporting(true)

    try {
      // 1. 聚合选中的 MCP 服务器
      const servers: Record<string, McpServerEntry> = {}
      for (const source of result.mcp) {
        for (const [name, entry] of Object.entries(source.servers)) {
          if (selectedMcp.has(`${source.path}::${name}`)) {
            servers[name] = entry
          }
        }
      }

      // 2. 聚合选中的 Skill 目录
      const skills = result.skills
        .filter((s) => selectedSkills.has(s.path))
        .map((s) => ({ path: s.path, name: s.name }))

      const messages: string[] = []
      const failedMessages: string[] = []
      let total = 0
      let targetDir: string | undefined

      if (Object.keys(servers).length > 0) {
        const mcpRes = await window.electronAPI.importMcpServers(workspaceSlug, servers)
        total += mcpRes.imported
        targetDir = mcpRes.targetDir ?? targetDir
        messages.push(`MCP 导入 ${mcpRes.imported} 个`)
        if (mcpRes.skipped.length > 0) {
          messages.push(`跳过重名 ${mcpRes.skipped.join('、')}`)
        }
        for (const item of mcpRes.failed ?? []) {
          failedMessages.push(`${item.name}：${item.error}`)
        }
      }

      if (skills.length > 0) {
        const skillRes = await window.electronAPI.importSkills(workspaceSlug, skills)
        total += skillRes.imported
        targetDir = skillRes.targetDir ?? targetDir
        messages.push(`Skill 导入 ${skillRes.imported} 个`)
        if (skillRes.skipped.length > 0) {
          messages.push(`跳过 ${skillRes.skipped.join('、')}`)
        }
        for (const item of skillRes.failed ?? []) {
          failedMessages.push(`${item.name}：${item.error}`)
        }
      }

      const description = [
        targetDir ? `写入位置：${targetDir}` : '',
        failedMessages.length > 0 ? `失败：${failedMessages.join('；')}` : '',
      ].filter(Boolean).join('\n')

      if (total === 0) {
        if (failedMessages.length > 0) {
          toast.error('导入失败', { description })
        } else {
          toast.info('没有新增条目', { description: description || '所选条目均已在当前工作区中存在' })
        }
      } else {
        toast.success(messages.join('；'), { description })
        onImported()
        onOpenChange(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  const totalMcpCount = result
    ? result.mcp.reduce((sum, s) => sum + Object.keys(s.servers).length, 0)
    : 0
  const totalSelected = selectedMcp.size + selectedSkills.size

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            从本机其他 Agent 导入
            <Button
              variant="ghost"
              size="icon"
              className="size-7 ml-auto"
              onClick={() => void scan()}
              disabled={loading}
              title="重新扫描"
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            </Button>
          </DialogTitle>
          <DialogDescription className="text-xs">
            只读扫描 Trae、WorkBuddy、CodeBuddy、Cherry Studio 的配置，导入时不会修改这些应用的原始文件
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[52vh] overflow-y-auto px-5 py-4 space-y-6">
          {error && (
            <div className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && !result && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              正在扫描本机配置…
            </div>
          )}

          {result && (
            <>
              {/* MCP 区块 */}
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <Plug size={13} />
                  MCP 服务器（{totalMcpCount}）
                </h3>

                {result.mcp.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">未发现其他应用的 MCP 配置</p>
                ) : (
                  result.mcp.map((source) => (
                    <div key={source.path} className="rounded-lg border border-border/60 overflow-hidden">
                      <div className="px-3 py-2 bg-muted/40">
                        <div className="text-xs font-medium">{source.source}</div>
                        <div className="text-[11px] text-muted-foreground break-all">{source.path}</div>
                        {source.error && (
                          <div className="text-[11px] text-amber-600 mt-1">{source.error}</div>
                        )}
                      </div>
                      {Object.entries(source.servers).map(([name, entry]) => {
                        const key = `${source.path}::${name}`
                        const checked = selectedMcp.has(key)
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleMcp(key)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
                          >
                            <span
                              className={cn(
                                'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                                checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
                              )}
                            >
                              {checked && <Check className="size-3" />}
                            </span>
                            <span className="text-xs font-medium">{name}</span>
                            <span className="text-[11px] text-muted-foreground">{entry.type}</span>
                            <span className="ml-auto text-[11px] text-muted-foreground truncate max-w-[260px]">
                              {entry.url ?? [entry.command, ...(entry.args ?? [])].filter(Boolean).join(' ')}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ))
                )}
              </section>

              {/* Skill 区块 */}
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <Sparkles size={13} />
                  Skills（{result.skills.length}）
                </h3>

                {result.skills.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">未发现其他应用的 Skill 目录</p>
                ) : (
                  <div className="rounded-lg border border-border/60 overflow-hidden divide-y divide-border/60">
                    {result.skills.map((skill) => {
                      const checked = selectedSkills.has(skill.path)
                      return (
                        <button
                          key={skill.path}
                          type="button"
                          disabled={skill.exists}
                          onClick={() => toggleSkill(skill.path)}
                          className={cn(
                            'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                            skill.exists ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/40'
                          )}
                        >
                          <span
                            className={cn(
                              'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                              checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
                            )}
                          >
                            {checked && <Check className="size-3" />}
                          </span>
                          <span className="text-xs font-medium">{skill.name}</span>
                          <span className="text-[11px] text-muted-foreground">{skill.source}</span>
                          {skill.exists && (
                            <span className="text-[11px] text-amber-600">当前工作区已存在</span>
                          )}
                          <span className="ml-auto text-[11px] text-muted-foreground truncate max-w-[220px]">
                            {skill.path}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border">
          <span className="mr-auto text-[11px] text-muted-foreground break-all">
            导入到：data/agent-workspaces/{workspaceSlug || 'default'}/skills/
          </span>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" onClick={() => void handleImport()} disabled={importing || totalSelected === 0}>
            {importing && <Loader2 className="size-3.5 animate-spin" />}
            导入选中（{totalSelected}）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
