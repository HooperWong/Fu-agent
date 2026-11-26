/**
 * BrowserPane - 分栏内嵌浏览器
 *
 * 使用 Electron <webview> 加载外部网页（主进程已开启 webviewTag 并做了安全约束）。
 * 支持前进/后退/刷新、地址栏输入、用系统浏览器打开当前页。
 */

import * as React from 'react'
import { ArrowLeft, ArrowRight, RotateCw, ExternalLink, Home, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** webview 自定义元素的最小类型 */
interface WebviewElement extends HTMLElement {
  getURL: () => string
  loadURL: (url: string) => Promise<void>
  goBack: () => void
  goForward: () => void
  reload: () => void
  stop: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
}

const HOME_URL = 'https://www.bing.com'

/** 补全协议前缀 */
function normalizeUrl(input: string): string {
  const value = input.trim()
  if (!value) return HOME_URL
  if (/^https?:\/\//i.test(value)) return value
  return `https://${value}`
}

export function BrowserPane(): React.ReactElement {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const viewRef = React.useRef<WebviewElement | null>(null)
  const [url, setUrl] = React.useState(HOME_URL)
  const [inputValue, setInputValue] = React.useState(HOME_URL)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [canBack, setCanBack] = React.useState(false)
  const [canForward, setCanForward] = React.useState(false)

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const view = document.createElement('webview') as WebviewElement
    view.setAttribute('src', HOME_URL)
    view.style.display = 'flex'
    view.style.width = '100%'
    view.style.height = '100%'
    container.appendChild(view)
    viewRef.current = view

    const syncNav = (): void => {
      try {
        const current = view.getURL()
        if (current && !current.startsWith('about:')) {
          setUrl(current)
          setInputValue(current)
        }
        setCanBack(view.canGoBack())
        setCanForward(view.canGoForward())
      } catch {
        // webview 尚未完成初始化时忽略
      }
    }

    const handleStart = (): void => setLoading(true)
    const handleStop = (): void => {
      setLoading(false)
      syncNav()
    }
    const handleNavigate = (event: Event): void => {
      const detail = event as Event & { url?: string }
      if (detail.url) {
        setUrl(detail.url)
        setInputValue(detail.url)
      }
      syncNav()
    }
    const handleFail = (event: Event): void => {
      const detail = event as Event & { errorDescription?: string; isMainFrame?: boolean }
      if (detail.isMainFrame === false) return
      setError(detail.errorDescription || '页面加载失败')
      setLoading(false)
    }

    view.addEventListener('did-start-loading', handleStart)
    view.addEventListener('did-stop-loading', handleStop)
    view.addEventListener('did-navigate', handleNavigate)
    view.addEventListener('did-navigate-in-page', handleNavigate)
    view.addEventListener('did-fail-load', handleFail)

    return () => {
      view.removeEventListener('did-start-loading', handleStart)
      view.removeEventListener('did-stop-loading', handleStop)
      view.removeEventListener('did-navigate', handleNavigate)
      view.removeEventListener('did-navigate-in-page', handleNavigate)
      view.removeEventListener('did-fail-load', handleFail)
      view.remove()
      viewRef.current = null
    }
  }, [])

  const go = (target: string): void => {
    const next = normalizeUrl(target)
    setError(null)
    setLoading(true)
    void viewRef.current?.loadURL(next)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 工具栏 */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/50">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={!canBack}
          title="后退"
          onClick={() => viewRef.current?.goBack()}
        >
          <ArrowLeft size={14} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={!canForward}
          title="前进"
          onClick={() => viewRef.current?.goForward()}
        >
          <ArrowRight size={14} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title={loading ? '停止' : '刷新'}
          onClick={() => {
            if (loading) viewRef.current?.stop()
            else viewRef.current?.reload()
          }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title="回到首页"
          onClick={() => go(HOME_URL)}
        >
          <Home size={14} />
        </Button>

        <form
          className="flex-1 min-w-0 mx-1"
          onSubmit={(event) => {
            event.preventDefault()
            go(inputValue)
          }}
        >
          <Input
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="输入网址后回车"
            className="h-7 text-xs"
          />
        </form>

        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title="在系统浏览器打开"
          onClick={() => void window.electronAPI.openExternal(url)}
        >
          <ExternalLink size={14} />
        </Button>
      </div>

      {/* 页面区域 */}
      <div className="relative flex-1 min-h-0 bg-white">
        <div ref={containerRef} className="absolute inset-0" />
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/95 px-6 text-center">
            <p className="text-sm font-medium">无法打开该网页</p>
            <p className="text-xs text-muted-foreground break-all">{error}</p>
            <Button size="sm" variant="outline" className="mt-1" onClick={() => go(url)}>
              重试
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
