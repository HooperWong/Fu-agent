/**
 * DataSettings - 数据目录与备份迁移
 *
 * - 查看数据目录位置与占用
 * - 一键导出整个 data/ 到指定位置
 * - 从备份恢复（覆盖前自动保留旧数据，需重启生效）
 */

import * as React from 'react'
import { HardDrive, FolderOpen, Download, Upload, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import type { DataOverview } from '../../../types'

type NoticeKind = 'ok' | 'warn' | 'error'

interface Notice {
  kind: NoticeKind
  text: string
}

/** 格式化字节数为可读文本 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** 拼接展示用路径（跟随当前系统的分隔符） */
function joinPath(base: string, ...parts: string[]): string {
  const separator = base.includes('\\') ? '\\' : '/'
  return [base.replace(/[\\/]+$/, ''), ...parts].join(separator)
}

export function DataSettings(): React.ReactElement {
  const [overview, setOverview] = React.useState<DataOverview | null>(null)
  const [busy, setBusy] = React.useState<'export' | 'zip' | 'import' | 'open' | null>(null)
  const [notice, setNotice] = React.useState<Notice | null>(null)
  const [includeSecrets, setIncludeSecrets] = React.useState(false)

  const loadOverview = React.useCallback(async (): Promise<void> => {
    try {
      setOverview(await window.electronAPI.getDataOverview())
    } catch (error) {
      console.error('[数据设置] 读取数据目录失败:', error)
    }
  }, [])

  React.useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  const handleOpen = async (): Promise<void> => {
    setBusy('open')
    try {
      await window.electronAPI.openDataDir()
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '打开目录失败' })
    } finally {
      setBusy(null)
    }
  }

  const handleExport = async (): Promise<void> => {
    setBusy('export')
    setNotice(null)
    try {
      const result = await window.electronAPI.exportDataBackup(includeSecrets)
      if (!result.canceled) {
        setNotice({ kind: 'ok', text: result.message })
      }
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '导出失败' })
    } finally {
      setBusy(null)
    }
  }

  const handleExportZip = async (): Promise<void> => {
    setBusy('zip')
    setNotice(null)
    try {
      const result = await window.electronAPI.exportDataZip(includeSecrets)
      if (!result.canceled) {
        setNotice({ kind: 'ok', text: result.message })
      }
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '生成迁移包失败' })
    } finally {
      setBusy(null)
    }
  }

  const handleImport = async (): Promise<void> => {
    setBusy('import')
    setNotice(null)
    try {
      const result = await window.electronAPI.importDataBackup()
      if (result.canceled) {
        // 用户取消或未授权，不提示
      } else if (result.message.includes('已从备份恢复')) {
        setNotice({ kind: 'warn', text: result.message })
        await loadOverview()
      } else {
        setNotice({ kind: 'warn', text: result.message })
      }
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '恢复失败' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        title="数据目录"
        description="所有个人数据集中存放在 data/ 下，可整体迁移到新机器"
      >
        <SettingsCard>
          <SettingsRow label="应用目录" description="程序本体（Fu Agent.exe、resources/）所在位置，数据不在此目录内">
            <code className="text-xs text-muted-foreground break-all max-w-[420px] text-right">
              {overview?.appDir ?? '读取中…'}
            </code>
          </SettingsRow>
          <SettingsRow label="位置" icon={<HardDrive size={16} className="text-foreground/50" />}>
            <code className="text-xs text-muted-foreground break-all max-w-[420px] text-right">
              {overview?.dataDir ?? '读取中…'}
            </code>
          </SettingsRow>
          <SettingsRow label="占用" description="包含 SAP 运行文件等全部本地数据">
            <span className="text-sm text-muted-foreground">
              {overview ? `${formatSize(overview.sizeBytes)} · ${overview.fileCount} 个文件` : '—'}
            </span>
          </SettingsRow>
          <SettingsRow label="凭据文件" description="渠道密钥等保存在应用根 .env，不随数据目录移动，默认不导出">
            <code className="text-xs text-muted-foreground break-all max-w-[420px] text-right">
              {overview?.envPath ?? '读取中…'}
            </code>
          </SettingsRow>
          <SettingsRow label="打开目录" description="在文件管理器中查看 data/">
            <button
              onClick={() => void handleOpen()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {busy === 'open' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
              打开
            </button>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="备份与恢复"
        description="整目录复制，日志与临时文件不参与备份；凭据默认不备份，可勾选一并导出"
      >
        <SettingsCard>
          <SettingsRow
            label="包含凭据"
            description="将应用根 .env（渠道密钥等）一并写入备份，便于整机迁移；备份文件请妥善保管"
          >
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeSecrets}
                onChange={(event) => setIncludeSecrets(event.target.checked)}
                disabled={busy !== null}
                className="h-4 w-4 accent-primary"
              />
              {includeSecrets ? '已包含 .env' : '不包含 .env'}
            </label>
          </SettingsRow>
          <SettingsRow
            label="导出迁移包（ZIP）"
            description="压缩前会先展示源目录、目标路径与包含范围，确认后生成单个 ZIP；只读取数据，不改动原数据"
          >
            <button
              onClick={() => void handleExportZip()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {busy === 'zip' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {busy === 'zip' ? '压缩中…' : '生成迁移包'}
            </button>
          </SettingsRow>
          <SettingsRow
            label="导出备份（目录）"
            description="选择保存位置后，生成 FuAgent备份-时间 目录（含 SAP 运行文件）"
          >
            <button
              onClick={() => void handleExport()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {busy === 'export' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {busy === 'export' ? '导出中…' : '导出备份'}
            </button>
          </SettingsRow>
          <SettingsRow
            label="从备份恢复"
            description="选择备份目录；当前数据会保留为 data.bak-时间，恢复后需重启应用"
          >
            <button
              onClick={() => void handleImport()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {busy === 'import' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {busy === 'import' ? '恢复中…' : '恢复数据'}
            </button>
          </SettingsRow>
          {notice && (
            <div className="px-4 pb-4">
              <div
                className={[
                  'flex items-start gap-2 rounded-md px-3 py-2 text-xs leading-5',
                  notice.kind === 'error'
                    ? 'bg-destructive/10 text-destructive'
                    : notice.kind === 'warn'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                ].join(' ')}
              >
                {notice.kind === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                <span className="break-all">{notice.text}</span>
              </div>
            </div>
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="迁移到新电脑"
        description="按下列步骤操作，可保证会话、工作区与本地文件完整迁移且不失真"
      >
        <SettingsCard>
          <div className="space-y-5 px-4 py-4 text-xs leading-6 text-muted-foreground">
            <div>
              <p className="font-medium text-foreground/80">第一步：确认当前路径（旧电脑）</p>
              <div className="mt-1 space-y-1">
                <div>
                  应用程序：
                  <code className="ml-1 rounded bg-secondary px-1 py-0.5 break-all">
                    {overview?.appDir ?? '读取中…'}
                  </code>
                  <span className="ml-1">（Fu Agent.exe、resources 所在目录，不含个人数据）</span>
                </div>
                <div>
                  数据根目录：
                  <code className="ml-1 rounded bg-secondary px-1 py-0.5 break-all">
                    {overview?.dataDir ?? '读取中…'}
                  </code>
                </div>
                <div>
                  会话记录：
                  <code className="ml-1 rounded bg-secondary px-1 py-0.5 break-all">
                    {overview ? joinPath(overview.dataDir, 'agent-sessions') : '读取中…'}
                  </code>
                  <span className="ml-1">
                    每个会话一个 <code>&lt;会话ID&gt;.jsonl</code>，索引为数据根目录下的{' '}
                    <code>agent-sessions.json</code>
                  </span>
                </div>
                <div>
                  工作区数据：
                  <code className="ml-1 rounded bg-secondary px-1 py-0.5 break-all">
                    {overview ? joinPath(overview.dataDir, 'agent-workspaces') : '读取中…'}
                  </code>
                  <span className="ml-1">
                    每个工作区一个子目录（含 <code>mcp.json</code>、<code>skills/</code> 与各会话工作目录），索引为{' '}
                    <code>agent-workspaces.json</code>
                  </span>
                </div>
                <div>
                  笔记与附件：
                  <code className="ml-1 rounded bg-secondary px-1 py-0.5 break-all">
                    {overview ? joinPath(overview.dataDir, 'notes') : '读取中…'}
                  </code>
                  <span className="mx-1">、</span>
                  <code className="rounded bg-secondary px-1 py-0.5">
                    {overview ? joinPath(overview.dataDir, 'attachments') : ''}
                  </code>
                </div>
                <div>
                  凭据文件：
                  <code className="ml-1 rounded bg-secondary px-1 py-0.5 break-all">
                    {overview?.envPath ?? '读取中…'}
                  </code>
                  <span className="ml-1">（不在数据目录内，默认不导出）</span>
                </div>
              </div>
              <ul className="mt-2 space-y-1">
                <li>迁移包默认保存到「文档」目录，文件名形如 <code className="rounded bg-secondary px-1 py-0.5">FuAgent迁移包-时间.zip</code>，保存前会再次展示完整范围供确认。</li>
                <li>迁移包会包含会话记录、工作区配置和你放在工作区里的本地文件，请勿公开发送。</li>
                <li>
                  你电脑上的本地项目目录（如 <code className="rounded bg-secondary px-1 py-0.5">D:\项目\xxx</code>）不在数据根目录内，ZIP 不会包含，需要单独拷贝。
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground/80">第二步：打包（旧电脑）</p>
              <p className="mt-1">
                点击上方「生成迁移包」：先选保存位置 → 弹窗确认源目录/目标路径/包含范围 → 开始压缩 → 完成后提示 ZIP 路径与大小。
                导出全程只读取数据，不会删除、移动或修改原始数据目录。
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground/80">第三步：传输</p>
              <p className="mt-1">
                用可信方式拷贝到新电脑（U 盘、加密压缩、私有网盘等），不要通过公开链接或聊天群转发。
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground/80">第四步：新电脑解压与导入</p>
              <ol className="mt-1 list-decimal list-inside space-y-1">
                <li>安装并启动 Fu Agent（1.0.0 及以上），确认应用可正常打开后再进行恢复。</li>
                <li>
                  解压 ZIP 到任意有足够空间的目录（如 <code className="rounded bg-secondary px-1 py-0.5">D:\FuAgent迁移</code>）：
                  顶层应直接看到 <code className="rounded bg-secondary px-1 py-0.5">fu-agent-backup.json</code>、
                  <code className="rounded bg-secondary px-1 py-0.5">agent-sessions</code>、
                  <code className="rounded bg-secondary px-1 py-0.5">agent-workspaces</code>、
                  <code className="rounded bg-secondary px-1 py-0.5">notes</code> 等目录，而不是再多一层 <code>data</code> 目录。
                </li>
                <li>
                  进入「设置 → 数据 → 从备份恢复」，选择刚才的解压目录（包含 <code>fu-agent-backup.json</code> 的那一层），授权后等待复制完成。
                </li>
                <li>恢复完成后重启应用；历史会话会重新出现在会话列表中，工作区也会恢复（数据保留在数据根目录下）。</li>
                <li>
                  打开工作区逐个核对本地项目：工作区记录的本地路径若与旧电脑不同，需要重新指定为新电脑上的实际目录；
                  本地项目文件本身请单独拷贝（ZIP 不包含），确认文件可访问后再继续对话。
                </li>
                <li>如需额外保险，可先在「设置 → 数据」查看数据根目录，确认恢复后文件数与占用符合预期；旧数据会保留为 <code className="rounded bg-secondary px-1 py-0.5">data.bak-时间</code>，确认无误后可自行删除。</li>
                <li>如迁移包内含 <code className="rounded bg-secondary px-1 py-0.5">.env</code>，需手动放回应用根目录（与 Fu Agent.exe 同级）后重启；否则请在「渠道」中重新填写 API Key。</li>
              </ol>
            </div>

            <div>
              <p className="font-medium text-foreground/80">迁移包包含的内容</p>
              <ul className="mt-1 space-y-0.5">
                <li>会话记录：<code>conversations/</code>、<code>agent-sessions/</code>、<code>conversations.json</code>、<code>agent-sessions.json</code></li>
                <li>工作区配置与本地文件：<code>agent-workspaces/</code>、<code>agent-workspaces.json</code>、<code>mcp/</code>、<code>skills/</code>、<code>default-skills/</code></li>
                <li>笔记与附件：<code>notes/</code>、<code>notes/assets/</code>、<code>attachments/</code></li>
                <li>设置与个人数据：<code>settings.json</code>、<code>user-profile.json</code>、<code>system-prompts.json</code>、<code>proxy-settings.json</code>、<code>memory.json</code>、<code>memory/</code></li>
                <li>业务数据：<code>sap/</code>（含运行文件）、<code>todos/</code>、<code>calendar/</code>、<code>projects/</code>、<code>scheduler/</code>、<code>hotspots/</code>、<code>playground/</code></li>
                <li>安全审计：<code>security/</code>；清单文件：<code>fu-agent-backup.json</code>（记录版本、时间、文件数与是否含凭据）</li>
                <li>不包含：<code>logs/</code>、<code>tmp/</code>（日志与临时文件，无需迁移）</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground/80">不会迁移、需在新电脑重新配置的内容</p>
              <ul className="mt-1 space-y-0.5">
                <li>系统钥匙串、OAuth 登录态、浏览器/系统账号授权</li>
                <li>SAP 客户端登录凭据与系统级证书（应用内只保存连接配置）</li>
                <li>MCP 服务自身的密钥与登录状态（需在对应服务重新授权）</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground/80">索引与搜索</p>
              <p className="mt-1">
                笔记搜索索引由 <code>notes/</code> 下的文件在应用内构建，恢复后无需手动重建；若搜索异常，重启应用即可重新加载。
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground/80">可选：不恢复直接指向</p>
              <p className="mt-1">
                也可设置环境变量 <code className="rounded bg-secondary px-1 py-0.5">PROMA_DATA_DIR</code> 指向已有的 data 目录，
                应用会直接读取该位置的数据（适合移动硬盘或固定的同步目录）。
              </p>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
