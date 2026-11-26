/**
 * CodePane - 分栏代码实时预览
 *
 * 上：HTML / CSS / JS 三个编辑页签
 * 下：iframe 实时渲染（沙箱模式，只允许脚本与弹窗）
 * 草稿自动保存到 data/playground/state.json，随数据目录迁移。
 */

import * as React from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { PlaygroundState } from '../../../types'

type Lang = 'html' | 'css' | 'js'

const LANG_LABELS: Array<{ id: Lang; label: string; placeholder: string }> = [
  { id: 'html', label: 'HTML', placeholder: '<!-- 页面结构 -->' },
  { id: 'css', label: 'CSS', placeholder: '/* 样式 */' },
  { id: 'js', label: 'JS', placeholder: '// 交互脚本' },
]

/** 组装预览文档 */
function buildDoc(state: PlaygroundState): string {
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8" />',
    `<style>${state.css}</style></head><body>`,
    state.html,
    `<script>${state.js}<\/script>`,
    '</body></html>',
  ].join('')
}

export function CodePane(): React.ReactElement {
  const [state, setState] = React.useState<PlaygroundState>({ html: '', css: '', js: '' })
  const [tab, setTab] = React.useState<Lang>('html')
  const [srcDoc, setSrcDoc] = React.useState('')
  const loadedRef = React.useRef(false)

  /** 初次加载草稿 */
  React.useEffect(() => {
    window.electronAPI.preview
      .load()
      .then((data) => {
        setState(data)
        setSrcDoc(buildDoc(data))
        loadedRef.current = true
      })
      .catch((error) => console.error('[代码预览] 加载失败:', error))
  }, [])

  /** 编辑后 500ms 刷新预览并保存草稿 */
  React.useEffect(() => {
    if (!loadedRef.current) return
    const timer = setTimeout(() => {
      setSrcDoc(buildDoc(state))
      window.electronAPI.preview
        .save(state)
        .catch((error) => console.error('[代码预览] 保存失败:', error))
    }, 500)
    return () => clearTimeout(timer)
  }, [state])

  const current = LANG_LABELS.find((item) => item.id === tab) ?? LANG_LABELS[0]!

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 页签 + 刷新 */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/50">
        {LANG_LABELS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs transition-colors',
              tab === item.id
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted/50'
            )}
          >
            {item.label}
          </button>
        ))}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 ml-auto"
          title="刷新预览"
          onClick={() => setSrcDoc(buildDoc(state))}
        >
          <RefreshCw size={13} />
        </Button>
      </div>

      {/* 编辑器 */}
      <Textarea
        key={tab}
        value={state[tab]}
        spellCheck={false}
        placeholder={current.placeholder}
        onChange={(event) =>
          setState((prev) => ({ ...prev, [tab]: event.target.value }))
        }
        className="flex-1 resize-none border-none rounded-none bg-transparent px-3 py-2 font-mono text-xs leading-5 shadow-none focus-visible:ring-0 scrollbar-none"
      />

      {/* 实时预览 */}
      <div className="h-[45%] min-h-[140px] border-t border-border/50 bg-white">
        <iframe
          title="代码预览"
          sandbox="allow-scripts allow-modals allow-forms"
          srcDoc={srcDoc}
          className="w-full h-full border-0 bg-white"
        />
      </div>
    </div>
  )
}
