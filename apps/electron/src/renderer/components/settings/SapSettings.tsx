/**
 * SapSettings - SAP 多环境（arc-1 MCP）
 *
 * - 环境配置保存在 data/sap/environments.json，密码写入 .env（不回显）
 * - 默认只读；勾选「允许写操作」会弹出系统授权确认并记审计日志
 * - 可把环境接入当前 Agent 工作区，接入时密码以 ${SAP_<CODE>_PASSWORD} 引用
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import {
  Database,
  Plus,
  Pencil,
  Trash2,
  Download,
  Link2,
  Unlink,
  KeyRound,
  AlertTriangle,
  Copy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsSection, SettingsCard } from './primitives'
import { cn } from '@/lib/utils'
import { agentWorkspacesAtom, currentAgentWorkspaceIdAtom } from '@/atoms/agent-atoms'
import type { SapEnvironment, SapEnvironmentInput, SapWorkspaceBinding } from '../../../types'

/** 表单状态 */
interface FormState {
  id?: string
  code: string
  name: string
  url: string
  client: string
  language: string
  user: string
  password: string
  allowWrites: boolean
  nodePath: string
  serverPath: string
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  url: '',
  client: '300',
  language: 'ZH',
  user: '',
  password: '',
  allowWrites: false,
  nodePath: '',
  serverPath: '',
}

export function SapSettings(): React.ReactElement {
  const [envs, setEnvs] = React.useState<SapEnvironment[]>([])
  const [bindings, setBindings] = React.useState<SapWorkspaceBinding[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [form, setForm] = React.useState<FormState | null>(null)
  const [confirmText, setConfirmText] = React.useState<string | null>(null)

  const workspaces = useAtomValue(agentWorkspacesAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const currentWorkspace = React.useMemo(
    () => workspaces.find((item) => item.id === currentWorkspaceId) ?? null,
    [workspaces, currentWorkspaceId]
  )

  const bindingMap = React.useMemo(() => {
    const map = new Map<string, SapWorkspaceBinding>()
    for (const item of bindings) map.set(item.envId, item)
    return map
  }, [bindings])

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const [list, bound] = await Promise.all([
        window.electronAPI.sap.list(),
        currentWorkspace
          ? window.electronAPI.sap.bindings(currentWorkspace.slug)
          : Promise.resolve([] as SapWorkspaceBinding[]),
      ])
      setEnvs(list)
      setBindings(bound)
    } catch (error) {
      console.error('[SAP 设置] 加载失败:', error)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace])

  React.useEffect(() => {
    void load()
  }, [load])

  /** 提交表单 */
  const handleSubmit = async (): Promise<void> => {
    if (!form) return
    setBusy('save')
    setNotice(null)

    const input: SapEnvironmentInput = {
      code: form.code,
      name: form.name,
      url: form.url,
      client: form.client,
      language: form.language,
      user: form.user,
      allowWrites: form.allowWrites,
      nodePath: form.nodePath,
      serverPath: form.serverPath,
      ...(form.password.trim() && { password: form.password.trim() }),
    }

    try {
      if (form.id) {
        await window.electronAPI.sap.update(form.id, input)
      } else {
        await window.electronAPI.sap.create(input)
      }
      setForm(null)
      setNotice({ kind: 'ok', text: '已保存' })
      await load()
    } catch (error) {
      setNotice({
        kind: 'error',
        text: error instanceof Error ? error.message : '保存失败',
      })
    } finally {
      setBusy(null)
    }
  }

  /** 接入工作区 */
  const handleApply = async (env: SapEnvironment): Promise<void> => {
    if (!currentWorkspace) return
    setBusy(`apply-${env.id}`)
    try {
      await window.electronAPI.sap.apply(currentWorkspace.slug, env.id)
      await load()
      setNotice({ kind: 'ok', text: `已接入工作区 ${currentWorkspace.name}` })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '接入失败' })
    } finally {
      setBusy(null)
    }
  }

  /** 从工作区移出 */
  const handleDetach = async (env: SapEnvironment): Promise<void> => {
    if (!currentWorkspace) return
    setBusy(`apply-${env.id}`)
    try {
      await window.electronAPI.sap.detach(currentWorkspace.slug, env.id)
      await load()
      setNotice({ kind: 'ok', text: `已从工作区移除 ${env.code}` })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '移除失败' })
    } finally {
      setBusy(null)
    }
  }

  /** 删除环境 */
  const handleRemove = async (env: SapEnvironment): Promise<void> => {
    if (confirmText !== env.id) {
      setConfirmText(env.id)
      return
    }
    setBusy(`remove-${env.id}`)
    try {
      await window.electronAPI.sap.remove(env.id)
      setConfirmText(null)
      await load()
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '删除失败' })
    } finally {
      setBusy(null)
    }
  }

  /** 复制 arc-1 运行文件到应用数据目录 */
  const handleVendor = async (env: SapEnvironment): Promise<void> => {
    setBusy(`vendor-${env.id}`)
    setNotice(null)
    try {
      const result = await window.electronAPI.sap.vendor(env.id)
      setNotice({ kind: 'ok', text: result.message })
      await load()
    } catch (error) {
      setNotice({
        kind: 'error',
        text: error instanceof Error ? error.message : '复制运行文件失败',
      })
    } finally {
      setBusy(null)
    }
  }

  /** 从 CodeBuddy 导入 */
  const handleImport = async (): Promise<void> => {
    setBusy('import')
    try {
      const result = await window.electronAPI.sap.importFromCodeBuddy()
      setNotice({ kind: 'ok', text: result.message })
      await load()
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '导入失败' })
    } finally {
      setBusy(null)
    }
  }

  const updateForm = (patch: Partial<FormState>): void => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  return (
    <div>
      <SettingsSection
        title="SAP 多环境"
        description="通过 arc-1 MCP 接入不同 SAP 系统。默认只读；密码保存在 .env，不写入 data/。"
      >
        {/* 当前工作区 */}
        <SettingsCard>
          <div className="px-4 py-3 flex items-center gap-3">
            <Database size={16} className="text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">
                当前工作区：{currentWorkspace?.name ?? '未选择'}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {currentWorkspace
                  ? '接入后会写入该工作区的 mcp.json，新会话自动生效。'
                  : '请先在 Agent 模式左侧选择一个工作区，再接入 SAP 环境。'}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={busy === 'import'}
              onClick={() => void handleImport()}
            >
              <Download size={13} />
              从 CodeBuddy 导入
            </Button>
            <Button
              size="sm"
              className="gap-1"
              onClick={() => {
                setForm({ ...EMPTY_FORM })
                setNotice(null)
              }}
            >
              <Plus size={13} />
              新建环境
            </Button>
          </div>
        </SettingsCard>

        {notice && (
          <div
            className={cn(
              'mt-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2',
              notice.kind === 'ok'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400'
            )}
          >
            {notice.kind === 'error' && <AlertTriangle size={13} />}
            {notice.text}
          </div>
        )}

        {/* 新建 / 编辑表单 */}
        {form && (
          <SettingsCard className="mt-3">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">{form.id ? '编辑环境' : '新建环境'}</span>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setForm(null)}
                >
                  取消
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="环境代号 *">
                  <Input
                    value={form.code}
                    disabled={Boolean(form.id)}
                    placeholder="QAS300"
                    onChange={(event) => updateForm({ code: event.target.value })}
                  />
                </Field>
                <Field label="名称">
                  <Input
                    value={form.name}
                    placeholder="QAS 300 测试环境"
                    onChange={(event) => updateForm({ name: event.target.value })}
                  />
                </Field>
                <Field label="SAP 地址 *" className="col-span-2">
                  <Input
                    value={form.url}
                    placeholder="http://s4qas.example.com:8000"
                    onChange={(event) => updateForm({ url: event.target.value })}
                  />
                </Field>
                <Field label="Client *">
                  <Input
                    value={form.client}
                    placeholder="300"
                    onChange={(event) => updateForm({ client: event.target.value })}
                  />
                </Field>
                <Field label="语言">
                  <Input
                    value={form.language}
                    placeholder="ZH"
                    onChange={(event) => updateForm({ language: event.target.value })}
                  />
                </Field>
                <Field label="登录账号 *">
                  <Input
                    value={form.user}
                    placeholder="SAP_USER"
                    onChange={(event) => updateForm({ user: event.target.value })}
                  />
                </Field>
                <Field label={form.id ? '密码（留空不修改）' : '密码'}>
                  <Input
                    type="password"
                    value={form.password}
                    placeholder="写入 .env，不落 data/"
                    onChange={(event) => updateForm({ password: event.target.value })}
                  />
                </Field>
                <Field label="Node 路径（可留空）">
                  <Input
                    value={form.nodePath}
                    placeholder="留空使用系统 node"
                    onChange={(event) => updateForm({ nodePath: event.target.value })}
                  />
                </Field>
                <Field label="arc-1 脚本路径">
                  <Input
                    value={form.serverPath}
                    placeholder="...\\arc-1\\bin\\arc1.js"
                    onChange={(event) => updateForm({ serverPath: event.target.value })}
                  />
                </Field>
              </div>

              <label className="mt-3 flex items-start gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.allowWrites}
                  onChange={(event) => updateForm({ allowWrites: event.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  允许写操作（默认关闭，仅只读）
                  <span className="block text-muted-foreground">
                    开启时需系统弹窗授权；传输、Git、删包等高危动作始终禁用。
                  </span>
                </span>
              </label>

              <div className="mt-3 flex justify-end">
                <Button size="sm" disabled={busy === 'save'} onClick={() => void handleSubmit()}>
                  {busy === 'save' ? '保存中…' : '保存'}
                </Button>
              </div>
            </div>
          </SettingsCard>
        )}

        {/* 环境列表 */}
        <div className="mt-3 space-y-2">
          {loading && <p className="text-xs text-muted-foreground px-1">加载中…</p>}
          {!loading && envs.length === 0 && (
            <p className="text-xs text-muted-foreground px-1">
              还没有 SAP 环境。可新建，或从 CodeBuddy 配置一键导入 arc-1。
            </p>
          )}

          {envs.map((env) => {
            const bound = bindingMap.get(env.id)?.applied ?? false
            const busyKey =
              busy === `apply-${env.id}` || busy === `remove-${env.id}` || busy === `vendor-${env.id}`
            const confirming = confirmText === env.id
            const vendored = env.serverPath.startsWith('${FU_DATA_DIR}')

            return (
              <SettingsCard key={env.id}>
                <div className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{env.name}</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {env.code}
                        </span>
                        <span
                          className={cn(
                            'text-[11px] px-1.5 py-0.5 rounded',
                            env.allowWrites
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                              : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          )}
                        >
                          {env.allowWrites ? '可写（已授权）' : '只读'}
                        </span>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <KeyRound size={11} />
                          {env.hasPassword ? '密码已配置' : '未配置密码'}
                        </span>
                        {bound && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            已接入工作区
                          </span>
                        )}
                        {vendored && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400">
                            运行文件已本地化
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground break-all">
                        {env.url} · Client {env.client} · {env.user} · {env.language}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs gap-1"
                        title="把 arc-1 与 Node 运行文件复制到应用数据目录，不依赖 CodeBuddy"
                        disabled={busyKey}
                        onClick={() => void handleVendor(env)}
                      >
                        <Copy size={12} />
                        {busy === `vendor-${env.id}` ? '复制中…' : vendored ? '重新复制' : '复制运行文件'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs gap-1"
                        disabled={!currentWorkspace || busyKey}
                        onClick={() => (bound ? void handleDetach(env) : void handleApply(env))}
                      >
                        {bound ? <Unlink size={12} /> : <Link2 size={12} />}
                        {bound ? '移出' : '接入'}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="编辑"
                        onClick={() => {
                          setForm({
                            id: env.id,
                            code: env.code,
                            name: env.name,
                            url: env.url,
                            client: env.client,
                            language: env.language,
                            user: env.user,
                            password: '',
                            allowWrites: env.allowWrites,
                            nodePath: env.nodePath,
                            serverPath: env.serverPath,
                          })
                        }}
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn(
                          'h-7 w-7',
                          confirming ? 'text-red-600' : 'text-muted-foreground'
                        )}
                        title={confirming ? '再次点击确认删除' : '删除'}
                        disabled={busyKey}
                        onClick={() => void handleRemove(env)}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                  {confirming && (
                    <p className="mt-2 text-[11px] text-red-600">
                      删除会同时清除 .env 中的密码，再次点击删除按钮确认。
                    </p>
                  )}
                </div>
              </SettingsCard>
            )
          })}
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground leading-5">
          说明：接入后 MCP 名称为 <code>arc-1-&lt;代号&gt;</code>；密码以
          <code>{' ${SAP_<代号>_PASSWORD} '}</code>引用，启动 MCP 时由主进程解析，data/ 中不出现明文。
          导入时会自动把 arc-1 与 Node 运行文件复制到 <code>data/sap/vendor/</code>，路径以
          <code>{' ${FU_DATA_DIR} '}</code>记录，之后即使 CodeBuddy 删除自身文件也能正常启动。
        </p>
      </SettingsSection>
    </div>
  )
}

/** 表单字段容器 */
function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  )
}
