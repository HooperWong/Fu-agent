/**
 * AboutSettings - 关于页面
 *
 * 显示应用版本号等基本信息，以及自动更新状态和控制。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { RefreshCw, Download, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Scale } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
} from './primitives'
import { updateStatusAtom, updaterAvailableAtom, checkForUpdates, installUpdate } from '@/atoms/updater'
import { ReleaseNotesViewer } from './ReleaseNotesViewer'
import { ChangelogView } from './ChangelogView'

/** 从 package.json 构建时由 Vite define 注入 */
declare const __APP_VERSION__: string
const APP_VERSION = __APP_VERSION__

/** 更新状态卡片 */
function UpdateCard(): React.ReactElement | null {
  const available = useAtomValue(updaterAvailableAtom)
  const status = useAtomValue(updateStatusAtom)
  const [checking, setChecking] = React.useState(false)
  const [showReleaseNotes, setShowReleaseNotes] = React.useState(false)
  const [release, setRelease] = React.useState<import('@proma/shared').GitHubRelease | null>(null)

  // updater 不可用时不渲染
  if (!available) return null

  const handleCheck = async (): Promise<void> => {
    setChecking(true)
    try {
      await checkForUpdates()
    } finally {
      // 状态由 atom 订阅自动更新，延迟重置 checking 避免按钮闪烁
      setTimeout(() => setChecking(false), 1000)
    }
  }

  const handleInstall = async (): Promise<void> => {
    await installUpdate()
  }

  // 当检测到新版本时，获取完整的 release 信息
  React.useEffect(() => {
    if (status.status === 'available' && status.version && !release) {
      // 从 GitHub 获取完整的 release 信息
      window.electronAPI
        .getReleaseByTag(`v${status.version}`)
        .then((r) => {
          if (r) {
            setRelease(r)
            setShowReleaseNotes(true)
          }
        })
        .catch((err) => {
          console.error('[更新] 获取 Release 信息失败:', err)
        })
    }
  }, [status.status, status.version, release])

  const isChecking = checking || status.status === 'checking'
  const hasReleaseNotes = status.releaseNotes || release?.body

  return (
    <SettingsCard>
      <SettingsRow label="软件更新">
        <div className="flex items-center gap-3">
          {/* 状态文字 */}
          <StatusText status={status.status} version={status.version} error={status.error} />

          {/* 操作按钮 */}
          {status.status === 'installing' ? (
            <button
              disabled
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground opacity-50 cursor-not-allowed"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在安装...
            </button>
          ) : status.status === 'downloaded' ? (
            <button
              onClick={handleInstall}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              立即安装
            </button>
          ) : (
            <button
              onClick={handleCheck}
              disabled={isChecking}
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {isChecking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              检查更新
            </button>
          )}
        </div>
      </SettingsRow>

      {/* 下载进度条 */}
      {status.status === 'downloading' && status.progress && (
        <div className="px-4 pb-4 -mt-2">
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${Math.round(status.progress.percent)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            下载中 {Math.round(status.progress.percent)}%
          </p>
        </div>
      )}

      {/* Release Notes（新版本可用或已下载时显示） */}
      {(status.status === 'available' || status.status === 'downloaded') && hasReleaseNotes && (
        <div className="px-4 pb-4 border-t">
          <button
            onClick={() => setShowReleaseNotes(!showReleaseNotes)}
            className="w-full flex items-center justify-between py-3 text-left hover:opacity-80 transition-opacity"
          >
            <span className="text-sm font-medium">更新日志</span>
            {showReleaseNotes ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showReleaseNotes && release && (
            <div className="mt-2">
              <ReleaseNotesViewer
                release={release}
                showHeader={false}
                compact
              />
            </div>
          )}
        </div>
      )}
    </SettingsCard>
  )
}

/** 状态文字组件 */
function StatusText({ status, version, error }: {
  status: string
  version?: string
  error?: string
}): React.ReactElement {
  switch (status) {
    case 'checking':
      return <span className="text-xs text-muted-foreground">正在检查...</span>
    case 'available':
      return (
        <span className="text-xs text-primary flex items-center gap-1">
          <Download className="h-3 w-3" />
          新版本 v{version} 可用
        </span>
      )
    case 'downloading':
      return <span className="text-xs text-muted-foreground">正在下载更新...</span>
    case 'downloaded':
      return (
        <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          v{version} 已就绪，重启后生效
        </span>
      )
    case 'installing':
      return (
        <span className="text-xs text-primary flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          正在安装更新，即将重启...
        </span>
      )
    case 'not-available':
      return (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          已是最新版本
        </span>
      )
    case 'error':
      return (
        <span className="text-xs text-destructive flex items-center gap-1" title={error}>
          <AlertCircle className="h-3 w-3" />
          检查失败
        </span>
      )
    default:
      return <span className="text-xs text-muted-foreground">未检查</span>
  }
}

/** 许可文档查看卡片（NOTICE / 第三方声明，Markdown 折叠展示） */
function LicenseDocCard({ title, description, load }: {
  title: string
  description: string
  load: () => Promise<string>
}): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const [content, setContent] = React.useState<string | null>(null)
  const [error, setError] = React.useState(false)

  const toggle = async (): Promise<void> => {
    const next = !open
    setOpen(next)
    if (next && content === null && !error) {
      try {
        const text = await load()
        if (text) setContent(text)
        else setError(true)
      } catch {
        setError(true)
      }
    }
  }

  return (
    <SettingsCard>
      <button
        type="button"
        onClick={() => void toggle()}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:opacity-80 transition-opacity"
      >
        <div>
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{title}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t">
          {error ? (
            <p className="text-xs text-muted-foreground py-2">许可文档文件缺失（LICENSE / NOTICE.md / THIRD-PARTY-NOTICES.md）</p>
          ) : content === null ? (
            <p className="text-xs text-muted-foreground py-2">加载中…</p>
          ) : (
            <div
              className={cn(
                'mt-3 max-h-96 overflow-y-auto rounded-lg border border-border/60 bg-muted/20 p-3',
                'prose dark:prose-invert max-w-none text-xs',
                'prose-p:my-1.5 prose-table:text-xs prose-th:p-1.5 prose-td:p-1.5'
              )}
            >
              <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
            </div>
          )}
        </div>
      )}
    </SettingsCard>
  )
}

export function AboutSettings(): React.ReactElement {
  return (
    <SettingsSection
      title="关于 Fu Agent"
      description="个人专属、本地优先的通用 AI Agent 桌面应用"
    >
      <SettingsCard>
        <SettingsRow label="版本">
          <span className="text-sm text-muted-foreground font-mono">{APP_VERSION}</span>
        </SettingsRow>
        <SettingsRow label="运行时">
          <span className="text-sm text-muted-foreground">Electron + React</span>
        </SettingsRow>
        <SettingsRow
          label="开源协议"
          description="本应用是 Proma 的修改发行版，须遵循上游 AGPL-3.0；以源码或网络服务形式分发时均需开放对应源码"
        >
          <a
            href="https://www.gnu.org/licenses/agpl-3.0.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            GNU AGPL-3.0
          </a>
        </SettingsRow>
        <SettingsRow label="基于开源项目">
          <a
            href="https://github.com/HeLongaa/Proma"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            github.com/HeLongaa/Proma
          </a>
        </SettingsRow>
        <SettingsRow label="上游项目">
          <a
            href="https://github.com/ErlichLiu/Proma"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            github.com/ErlichLiu/Proma
          </a>
        </SettingsRow>
      </SettingsCard>

      {/* 许可与第三方声明 */}
      <LicenseDocCard
        title="分发声明（NOTICE）"
        description="上游项目、修改内容与 AGPLv3 对应源码义务说明"
        load={() => window.electronAPI.getAppNotice()}
      />
      <LicenseDocCard
        title="第三方组件声明"
        description="本应用包含的第三方开源组件及许可索引"
        load={() => window.electronAPI.getThirdPartyNotices()}
      />

      {/* 自动更新卡片（updater 不可用时不渲染） */}
      <UpdateCard />

      {/* 版本更新日志（本地 CHANGELOG） */}
      <ChangelogView />
    </SettingsSection>
  )
}
