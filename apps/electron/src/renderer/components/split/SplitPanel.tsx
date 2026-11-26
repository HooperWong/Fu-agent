/**
 * SplitPanel - 右侧分栏容器
 *
 * 顶部页签切换「浏览器 / 代码预览」，可关闭；两个面板保持挂载以保留各自状态。
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { Globe, Code2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { splitPanelAtom } from '@/atoms/split-panel'
import type { SplitPane } from '@/atoms/split-panel'
import { BrowserPane } from './BrowserPane'
import { CodePane } from './CodePane'

const TABS: Array<{ id: SplitPane; label: string; icon: React.ReactNode }> = [
  { id: 'browser', label: '浏览器', icon: <Globe size={13} /> },
  { id: 'code', label: '代码预览', icon: <Code2 size={13} /> },
]

export function SplitPanel(): React.ReactElement {
  const [state, setState] = useAtom(splitPanelAtom)

  return (
    <div className="flex flex-col h-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl shadow-xl border border-border/50 overflow-hidden">
      {/* 页签栏 */}
      <div className="flex items-center gap-1 px-2 pt-14 pb-1.5 border-b border-border/50">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setState((prev) => ({ ...prev, pane: tab.id }))}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors',
              state.pane === tab.id
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted/50'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => setState((prev) => ({ ...prev, open: false }))}
          className="ml-auto p-1.5 rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          title="关闭分栏"
        >
          <X size={14} />
        </button>
      </div>

      {/* 内容：两个面板都保持挂载 */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className={cn('flex-1 min-h-0', state.pane === 'browser' ? 'flex flex-col' : 'hidden')}>
          <BrowserPane />
        </div>
        <div className={cn('flex-1 min-h-0', state.pane === 'code' ? 'flex flex-col' : 'hidden')}>
          <CodePane />
        </div>
      </div>
    </div>
  )
}
