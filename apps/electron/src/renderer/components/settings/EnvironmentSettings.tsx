/**
 * EnvironmentSettings - 环境与运行时自检
 *
 * 汇总 Node.js / Git / Windows Shell / SAP MCP 运行文件的状态，
 * 统一提供重新检测入口，异常时在设置导航上标红。
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { RefreshCw, Loader2, Info, AlertCircle, Terminal, HardDrive } from 'lucide-react'
import type { EnvironmentCheckResult, RuntimeStatus } from '@proma/shared'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { environmentCheckResultAtom, hasEnvironmentIssuesAtom } from '@/atoms/environment'
import { EnvironmentCheckCard } from '@/components/environment/EnvironmentCheckCard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import type { SapRuntimeStatus } from '../../../types'

/** Node.js / Git 环境检测 */
function BaseEnvironmentCard(): React.ReactElement {
  const hasIssues = useAtomValue(hasEnvironmentIssuesAtom)
  const setEnvironmentResult = useSetAtom(environmentCheckResultAtom)
  const [result, setResult] = React.useState<EnvironmentCheckResult | null>(null)
  const [isChecking, setIsChecking] = React.useState(false)

  React.useEffect(() => {
    window.electronAPI.getSettings().then((settings) => {
      if (settings.lastEnvironmentCheck) {
        setResult(settings.lastEnvironmentCheck)
        setEnvironmentResult(settings.lastEnvironmentCheck)
      }
    })
  }, [])

  const handleCheck = async (): Promise<void> => {
    setIsChecking(true)
    try {
      const checkResult = await window.electronAPI.checkEnvironment()
      setResult(checkResult)
      setEnvironmentResult(checkResult)
    } catch (error) {
      console.error('[环境检测] 检测失败:', error)
    } finally {
      setIsChecking(false)
    }
  }

  const nodejsStatus = !result
    ? 'checking'
    : result.nodejs.installed && result.nodejs.meetsMinimum
      ? result.nodejs.meetsRecommended
        ? 'success'
        : 'warning'
      : 'error'

  const gitStatus = !result
    ? 'checking'
    : result.git.installed && result.git.meetsRequirement
      ? 'success'
      : 'error'

  return (
    <SettingsCard>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">基础环境</h3>
            {hasIssues && <Badge variant="destructive">!</Badge>}
          </div>
          <button
            onClick={() => void handleCheck()}
            disabled={isChecking}
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            {isChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {isChecking ? '检测中...' : '重新检查'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Agent 模式需要 Node.js 和 Git 支持</p>
      </div>

      <div className="p-4 space-y-3">
        <EnvironmentCheckCard
          name="Node.js"
          status={nodejsStatus}
          version={result?.nodejs.version}
          requirement="推荐 22 LTS，最低 18 LTS"
          downloadUrl={result?.nodejs.downloadUrl || 'https://nodejs.org/'}
          statusText={
            result && nodejsStatus === 'warning'
              ? `v${result.nodejs.version} (建议升级到 22 LTS 以获得最佳体验)`
              : undefined
          }
        />
        <EnvironmentCheckCard
          name="Git"
          status={gitStatus}
          version={result?.git.version}
          requirement="版本 >= 2.0"
          downloadUrl={result?.git.downloadUrl || 'https://git-scm.com/'}
        />
        {result?.platform === 'win32' && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Windows 用户建议：</strong>
              安装时请选择默认路径（C:\Program Files\...），并确保勾选"添加到 PATH"选项
            </AlertDescription>
          </Alert>
        )}
      </div>
    </SettingsCard>
  )
}

/** Shell 环境检测（Windows） */
function ShellEnvironmentCard(): React.ReactElement | null {
  const [runtimeStatus, setRuntimeStatus] = React.useState<RuntimeStatus | null>(null)
  const [isChecking, setIsChecking] = React.useState(false)

  React.useEffect(() => {
    window.electronAPI.getRuntimeStatus().then(setRuntimeStatus)
  }, [])

  const handleCheck = async (): Promise<void> => {
    setIsChecking(true)
    try {
      setRuntimeStatus(await window.electronAPI.getRuntimeStatus())
    } catch (error) {
      console.error('[Shell 环境检测] 检测失败:', error)
    } finally {
      setIsChecking(false)
    }
  }

  if (!runtimeStatus || !runtimeStatus.shell) return null

  const { shell } = runtimeStatus
  const hasShell = Boolean(shell.gitBash?.available || shell.wsl?.available)

  return (
    <SettingsCard>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Shell 环境（Windows）</h3>
            {!hasShell && <Badge variant="destructive">!</Badge>}
          </div>
          <button
            onClick={() => void handleCheck()}
            disabled={isChecking}
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            {isChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {isChecking ? '检测中...' : '重新检查'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Agent 模式需要 Git Bash 或 WSL 支持</p>
      </div>

      <div className="p-4 space-y-3">
        <EnvironmentCheckCard
          name="Git Bash"
          status={shell.gitBash?.available ? 'success' : 'error'}
          version={shell.gitBash?.version ?? undefined}
          requirement="Git for Windows 自带"
          downloadUrl="https://git-scm.com/download/win"
          statusText={shell.gitBash?.available ? shell.gitBash.path ?? undefined : shell.gitBash?.error || '未安装'}
        />
        <EnvironmentCheckCard
          name="WSL"
          status={shell.wsl?.available ? 'success' : 'error'}
          version={shell.wsl?.version ? `WSL ${shell.wsl.version}` : undefined}
          requirement="WSL 1 或 WSL 2"
          downloadUrl="https://learn.microsoft.com/zh-cn/windows/wsl/install"
          statusText={
            shell.wsl?.available
              ? `默认发行版: ${shell.wsl.defaultDistro || '未设置'} (${shell.wsl.distros.join(', ')})`
              : shell.wsl?.error || '未安装'
          }
        />
        {shell.recommended && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>当前使用：</strong>
              {shell.recommended === 'git-bash' ? 'Git Bash（推荐）' : 'WSL'}
            </AlertDescription>
          </Alert>
        )}
        {!hasShell && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>未检测到可用的 Shell 环境！</strong>
              <br />
              Agent 模式需要 Git Bash 或 WSL 才能运行。请安装其中之一后重启应用。
            </AlertDescription>
          </Alert>
        )}
      </div>
    </SettingsCard>
  )
}

/** SAP MCP 运行文件自检 */
function SapRuntimeCard(): React.ReactElement {
  const [statuses, setStatuses] = React.useState<SapRuntimeStatus[] | null>(null)
  const [isChecking, setIsChecking] = React.useState(false)

  const load = React.useCallback(async (): Promise<void> => {
    setIsChecking(true)
    try {
      setStatuses(await window.electronAPI.sap.runtimeStatus())
    } catch (error) {
      console.error('[SAP 自检] 读取失败:', error)
      setStatuses([])
    } finally {
      setIsChecking(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <SettingsCard>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">SAP MCP 运行文件</h3>
            {statuses?.some((item) => !item.serverExists || !item.nodeExists) && (
              <Badge variant="destructive">!</Badge>
            )}
          </div>
          <button
            onClick={() => void load()}
            disabled={isChecking}
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            {isChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {isChecking ? '检测中...' : '重新检查'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          检测 arc-1 与 Node 是否已在本地，缺失时可在「SAP」页点「复制运行文件」
        </p>
      </div>

      <div className="divide-y">
        {statuses === null ? (
          <div className="px-4 py-6 text-xs text-muted-foreground text-center">读取中…</div>
        ) : statuses.length === 0 ? (
          <div className="px-4 py-6 text-xs text-muted-foreground text-center">
            尚未创建 SAP 环境，可在「SAP」页从 CodeBuddy 导入
          </div>
        ) : (
          statuses.map((item) => {
            const ok = item.serverExists && item.nodeExists
            return (
              <SettingsRow
                key={item.envId}
                label={item.code}
                description={item.serverPath || '未配置脚本路径'}
              >
                <div className="flex items-center gap-2 text-xs">
                  {item.vendored && (
                    <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-600 dark:text-sky-400">
                      已本地化
                    </span>
                  )}
                  <span className={ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>
                    {ok ? '可用' : item.nodeExists ? '脚本缺失' : 'Node 缺失'}
                  </span>
                </div>
              </SettingsRow>
            )
          })
        )}
      </div>
    </SettingsCard>
  )
}

export function EnvironmentSettings(): React.ReactElement {
  return (
    <div className="space-y-6">
      <SettingsSection title="环境自检" description="检查 Agent 与 SAP 依赖是否就绪">
        <div className="space-y-6">
          <BaseEnvironmentCard />
          <ShellEnvironmentCard />
          <SapRuntimeCard />
        </div>
      </SettingsSection>
    </div>
  )
}
