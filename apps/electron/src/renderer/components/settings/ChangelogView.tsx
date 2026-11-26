/**
 * ChangelogView - 版本更新日志
 *
 * 读取仓库内 CHANGELOG.md（随应用一起迁移），按版本分条展示，
 * 让每次功能新增与改动都清晰可见。
 */

import * as React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Loader2, ChevronDown, ChevronUp, ScrollText } from 'lucide-react'
import { CodeBlock } from '@proma/ui'
import { SettingsCard } from './primitives'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface ChangelogEntry {
  /** 版本号，如 0.1.0 */
  version: string
  /** 发布日期，如 2026-11-20 */
  date: string
  /** 该版本的 Markdown 正文 */
  content: string
}

/**
 * 将 CHANGELOG.md 解析为版本条目
 *
 * 以二级标题 `## [版本号] - 日期` 作为分隔。
 */
function parseChangelog(markdown: string): ChangelogEntry[] {
  return markdown
    .split(/^## /m)
    .slice(1)
    .map((part) => {
      const [headerLine = '', ...rest] = part.split(/\r?\n/)
      const match = headerLine.match(/^\[?([^\]\s]+)\]?\s*(?:-\s*(.+))?$/)
      return {
        version: match?.[1] ?? headerLine.trim(),
        date: (match?.[2] ?? '').trim(),
        content: rest.join('\n').trim(),
      }
    })
    .filter((entry) => entry.version)
}

/** 单个版本条目 */
function ChangelogItem({
  entry,
  expanded,
  onToggle,
}: {
  entry: ChangelogEntry
  expanded: boolean
  onToggle: () => void
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/40 transition-colors"
      >
        <Badge variant="secondary" className="font-mono text-xs">
          v{entry.version}
        </Badge>
        {entry.date && (
          <span className="text-xs text-muted-foreground">{entry.date}</span>
        )}
        <span className="flex-1" />
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div
          className={cn(
            'px-3 pb-3 pt-1',
            'prose dark:prose-invert max-w-none text-sm',
            'prose-p:my-1.5 prose-p:leading-[1.6] prose-li:leading-[1.6]',
            '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0'
          )}
        >
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
            }}
          >
            {entry.content}
          </Markdown>
        </div>
      )}
    </div>
  )
}

/** ChangelogView 组件 */
export function ChangelogView(): React.ReactElement {
  const [entries, setEntries] = React.useState<ChangelogEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [expandedVersions, setExpandedVersions] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    window.electronAPI
      .getChangelog()
      .then((markdown) => {
        const parsed = parseChangelog(markdown ?? '')
        setEntries(parsed)
        // 默认展开最新版本
        if (parsed[0]) {
          setExpandedVersions(new Set([parsed[0].version]))
        }
      })
      .catch((err) => console.error('[更新日志] 加载失败:', err))
      .finally(() => setLoading(false))
  }, [])

  const toggle = (version: string): void => {
    setExpandedVersions((prev) => {
      const next = new Set(prev)
      if (next.has(version)) {
        next.delete(version)
      } else {
        next.add(version)
      }
      return next
    })
  }

  return (
    <SettingsCard>
      <div className="flex items-center gap-2 px-3 pt-3">
        <ScrollText className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">版本更新日志</span>
        <span className="text-xs text-muted-foreground">（随应用本地保存）</span>
      </div>

      <div className="p-3 space-y-2">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载更新日志…
          </div>
        )}

        {!loading && entries.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">暂无更新日志记录</p>
        )}

        {entries.map((entry) => (
          <ChangelogItem
            key={entry.version}
            entry={entry}
            expanded={expandedVersions.has(entry.version)}
            onToggle={() => toggle(entry.version)}
          />
        ))}
      </div>
    </SettingsCard>
  )
}
