/**
 * AgentSettings - Agent 设置页
 *
 * 包含两个区块：
 * 1. MCP 服务器 — 管理当前工作区的 MCP 服务器配置
 * 2. Skills — 只读展示当前工作区的 Skill 列表
 *
 * 视图模式：list / create / edit（复用 ChannelSettings 的模式）
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Plus, Plug, Pencil, Trash2, Sparkles, MessageSquare, ShieldCheck, ScanLine, BookOpen, SaveAll } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  agentWorkspacesAtom,
  currentAgentWorkspaceIdAtom,
  agentChannelIdAtom,
  agentModelIdAtom,
  agentSessionsAtom,
  currentAgentSessionIdAtom,
  agentPendingPromptAtom,
  workspaceCapabilitiesVersionAtom,
} from '@/atoms/agent-atoms'
import { activeViewAtom } from '@/atoms/active-view'
import { appModeAtom } from '@/atoms/app-mode'
import type { McpServerEntry, SkillMeta, WorkspaceMcpConfig } from '@proma/shared'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { McpServerForm } from './McpServerForm'
import { LocalCapabilityDialog } from './LocalCapabilityDialog'

/** 组件视图模式 */
type ViewMode = 'list' | 'create' | 'edit'

/** 编辑中的服务器信息 */
interface EditingServer {
  name: string
  entry: McpServerEntry
}

export function AgentSettings(): React.ReactElement {
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const agentChannelId = useAtomValue(agentChannelIdAtom)
  const agentModelId = useAtomValue(agentModelIdAtom)
  const setAgentSessions = useSetAtom(agentSessionsAtom)
  const setCurrentSessionId = useSetAtom(currentAgentSessionIdAtom)
  const setPendingPrompt = useSetAtom(agentPendingPromptAtom)
  const setActiveView = useSetAtom(activeViewAtom)
  const setAppMode = useSetAtom(appModeAtom)
  const bumpCapabilitiesVersion = useSetAtom(workspaceCapabilitiesVersionAtom)

  // 派生当前工作区 slug
  // 优先使用当前选中的工作区；未选择时回落到第一个工作区，最终回落到 default，
  // 避免 slug 为空导致扫描导入静默失败（导入需要写入具体工作区目录）
  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) ?? workspaces[0]
  const workspaceSlug = currentWorkspace?.slug?.trim() || 'default'
  const workspaceName = currentWorkspace?.name ?? '默认工作区'

  // 视图模式
  const [viewMode, setViewMode] = React.useState<ViewMode>('list')
  const [editingServer, setEditingServer] = React.useState<EditingServer | null>(null)

  // MCP 配置
  const [mcpConfig, setMcpConfig] = React.useState<WorkspaceMcpConfig>({ servers: {} })
  const [skills, setSkills] = React.useState<SkillMeta[]>([])
  const [loading, setLoading] = React.useState(true)
  /** 本机扫描导入弹窗 */
  const [scanOpen, setScanOpen] = React.useState(false)
  /** 当前数据目录 */
  const [dataDir, setDataDir] = React.useState<string | null>(null)

  /** 加载 MCP 配置和 Skills */
  const loadData = React.useCallback(async () => {
    try {
      const [config, skillList] = await Promise.all([
        window.electronAPI.getWorkspaceMcpConfig(workspaceSlug),
        window.electronAPI.getWorkspaceSkills(workspaceSlug),
      ])
      setMcpConfig(config)
      setSkills(skillList)
    } catch (error) {
      console.error('[Agent 设置] 加载工作区配置失败:', error)
    } finally {
      setLoading(false)
    }
  }, [workspaceSlug])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  // ===== WOLAI 沉淀配置 =====
  const [wolaiParentId, setWolaiParentId] = React.useState('')
  const [wolaiToken, setWolaiToken] = React.useState('')
  const [wolaiBusy, setWolaiBusy] = React.useState<'save' | 'test' | 'browse' | null>(null)
  const [wolaiNotice, setWolaiNotice] = React.useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  /** WOLAI 目录浏览结果 */
  const [wolaiPages, setWolaiPages] = React.useState<Array<{ id: string; title: string; url?: string }> | null>(null)

  React.useEffect(() => {
    window.electronAPI.getSettings().then((settings) => {
      setWolaiParentId(settings.wolaiDepositParentId ?? '')
      setWolaiToken(settings.wolaiToken ?? '')
    }).catch(console.error)
    // 记录当前数据目录，用于发现「启动方式不同导致数据目录漂移」的问题
    window.electronAPI.getDataDir().then(setDataDir).catch(console.error)
  }, [])

  /** 保存 WOLAI 配置（Token 留空表示沿用 .env / MCP 配置） */
  const handleSaveWolai = async (): Promise<boolean> => {
    setWolaiBusy('save')
    setWolaiNotice(null)
    try {
      await window.electronAPI.updateSettings({
        wolaiDepositParentId: wolaiParentId.trim(),
        wolaiToken: wolaiToken.trim() || undefined,
      })
      setWolaiNotice({ kind: 'ok', text: '已保存' })
      return true
    } catch (error) {
      setWolaiNotice({ kind: 'error', text: error instanceof Error ? error.message : '保存失败' })
      return false
    } finally {
      setWolaiBusy(null)
    }
  }

  /** 保存并测试 WOLAI 连接（自动识别开放 API / MCP 通道） */
  const handleTestWolai = async (): Promise<void> => {
    const saved = await handleSaveWolai()
    if (!saved) return

    setWolaiBusy('test')
    try {
      const result = await window.electronAPI.testWolaiConnection()
      if (result.ok) {
        const label = result.channel === 'mcp'
          ? `已连接（MCP 通道${result.tools?.length ? `，${result.tools.length} 个工具` : ''}）`
          : '已连接（开放 API）'
        setWolaiNotice({ kind: 'ok', text: label })
      } else {
        setWolaiNotice({ kind: 'error', text: result.error ?? '连接失败' })
      }
    } catch (error) {
      setWolaiNotice({ kind: 'error', text: error instanceof Error ? error.message : '连接失败' })
    } finally {
      setWolaiBusy(null)
    }
  }

  /** 浏览 WOLAI 目录：优先 MCP 搜索；填了父页面 ID 时用开放 API 列子页面 */
  const handleBrowseWolai = async (): Promise<void> => {
    setWolaiBusy('browse')
    setWolaiNotice(null)
    try {
      const result = await window.electronAPI.listWolaiPages({
        parentId: wolaiParentId.trim() || undefined,
        query: '',
      })
      if (result.ok && result.pages.length > 0) {
        setWolaiPages(result.pages)
        setWolaiNotice({ kind: 'ok', text: `找到 ${result.pages.length} 个页面（${result.channel === 'mcp' ? 'MCP' : '开放 API'}），点击选择沉淀父页面` })
      } else if (result.ok) {
        setWolaiPages([])
        setWolaiNotice({ kind: 'error', text: '没有找到页面' })
      } else {
        setWolaiPages([])
        setWolaiNotice({ kind: 'error', text: result.error ?? '浏览失败' })
      }
    } catch (error) {
      setWolaiNotice({ kind: 'error', text: error instanceof Error ? error.message : '浏览失败' })
    } finally {
      setWolaiBusy(null)
    }
  }

  /** 构建 MCP 配置提示词 */
  const buildMcpPrompt = (): string => {
    const configPath = `data/agent-workspaces/${workspaceSlug}/mcp.json`
    const currentConfig = JSON.stringify(mcpConfig, null, 2)

    return `请帮我配置当前工作区的 MCP 服务器，你要主动来帮我实现，你可以采用联网搜索深度研究来尝试，当前环境已经有 Claude Agent SDK 了，除非不确定的时候才来问我，否则默认将帮我完成安装，而不是指导我。

## 工作区信息
- 工作区: ${workspaceName}
- MCP 配置文件: ${configPath}

## 当前配置
\`\`\`json
${currentConfig}
\`\`\`

## 配置格式
mcp.json 格式如下：
\`\`\`json
{
  "servers": {
    "服务器名称": {
      "type": "stdio | http | sse",
      "command": "可执行命令",
      "args": ["参数1", "参数2"],
      "env": { "KEY": "VALUE" },
      "url": "http://...",
      "headers": { "Key": "Value" },
      "enabled": true
    }
  }
}
\`\`\`
其中 stdio 类型使用 command/args/env，http/sse 类型使用 url/headers。

请读取当前配置文件，根据我的需求添加或修改 MCP 服务器，然后写回文件。`
  }

  /** 构建 Skill 配置提示词 */
  const buildSkillPrompt = (): string => {
    const skillsDir = `data/agent-workspaces/${workspaceSlug}/skills/`
    const skillList = skills.length > 0
      ? skills.map((s) => `- ${s.name}: ${s.description ?? '无描述'}`).join('\n')
      : '暂无 Skill'

    return `请帮我配置当前工作区的 Skills，你要主动来帮我实，现你可以采用联网搜索深度研究来尝试，当前环境已经有 Claude Agent SDK 了，除非不确定的时候才来问我，否则默认将帮我完成安装，而不是指导我。

## 工作区信息
- 工作区: ${workspaceName}
- Skills 目录: ${skillsDir}

## Skill 格式
每个 Skill 是 skills/ 目录下的一个子目录，目录名即 slug。
目录内包含 SKILL.md 文件，格式：

\`\`\`markdown
---
name: Skill 显示名称
description: 简要描述
---

Skill 的详细指令内容...
\`\`\`

## 当前 Skills
${skillList}

请查看 skills/ 目录了解现有配置，根据我的需求创建或编辑 Skill。`
  }

  /** 通过 Agent 对话完成配置 */
  const handleConfigViaChat = async (promptMessage: string): Promise<void> => {
    if (!agentChannelId) {
      alert('请先在渠道设置中选择 Agent 供应商')
      return
    }

    try {
      // 创建新会话
      const session = await window.electronAPI.createAgentSession(
        undefined,
        agentChannelId,
        currentWorkspaceId ?? undefined,
      )

      // 刷新会话列表
      const sessions = await window.electronAPI.listAgentSessions()
      setAgentSessions(sessions)

      // 设置当前会话
      setCurrentSessionId(session.id)

      // 设置 pending prompt
      setPendingPrompt({ sessionId: session.id, message: promptMessage })

      // 跳转到 Agent 对话视图
      setAppMode('agent')
      setActiveView('conversations')
    } catch (error) {
      console.error('[Agent 设置] 创建配置会话失败:', error)
    }
  }

  /** 删除 MCP 服务器 */
  const handleDelete = async (serverName: string): Promise<void> => {
    // 内置 MCP 不可删除
    const entry = mcpConfig.servers[serverName]
    if (entry?.isBuiltin) return

    if (!confirm(`确定删除 MCP 服务器「${serverName}」？此操作不可恢复。`)) return

    try {
      const newServers = { ...mcpConfig.servers }
      delete newServers[serverName]
      const newConfig: WorkspaceMcpConfig = { servers: newServers }
      await window.electronAPI.saveWorkspaceMcpConfig(workspaceSlug, newConfig)
      setMcpConfig(newConfig)
      bumpCapabilitiesVersion((v) => v + 1)
    } catch (error) {
      console.error('[Agent 设置] 删除 MCP 服务器失败:', error)
    }
  }

  /** 切换 MCP 服务器启用状态 */
  const handleToggle = async (serverName: string): Promise<void> => {
    try {
      const entry = mcpConfig.servers[serverName]
      if (!entry) return

      const newConfig: WorkspaceMcpConfig = {
        servers: {
          ...mcpConfig.servers,
          [serverName]: { ...entry, enabled: !entry.enabled },
        },
      }
      await window.electronAPI.saveWorkspaceMcpConfig(workspaceSlug, newConfig)
      setMcpConfig(newConfig)
      bumpCapabilitiesVersion((v) => v + 1)
    } catch (error) {
      console.error('[Agent 设置] 切换 MCP 服务器状态失败:', error)
    }
  }

  /** 删除 Skill（内置技能受保护） */
  const handleDeleteSkill = async (skillSlug: string, skillName: string): Promise<void> => {
    if (!confirm(`确定删除 Skill「${skillName}」？此操作不可恢复。`)) return

    try {
      await window.electronAPI.deleteWorkspaceSkill(workspaceSlug, skillSlug)
      setSkills((prev) => prev.filter((s) => s.slug !== skillSlug))
      bumpCapabilitiesVersion((v) => v + 1)
    } catch (error) {
      console.error('[Agent 设置] 删除 Skill 失败:', error)
      alert(error instanceof Error ? error.message : '删除失败')
    }
  }

  /** 把内置技能另存为个性化副本 */
  const handleCopySkillAsPersonal = async (skillSlug: string, skillName: string): Promise<void> => {
    const input = prompt(`为「${skillName}」的个性化副本命名（副本可自由修改，不影响内置原版）：`, `${skillName}-个性化`)
    const newName = input?.trim()
    if (!newName) return

    try {
      const newSlug = await window.electronAPI.copyWorkspaceSkillAsPersonal(workspaceSlug, skillSlug, newName)
      await loadData()
      bumpCapabilitiesVersion((v) => v + 1)
      alert(`已创建个性化副本「${newName}」（目录：${newSlug}），可在技能列表中修改`)
    } catch (error) {
      console.error('[Agent 设置] 另存副本失败:', error)
      alert(error instanceof Error ? error.message : '另存副本失败')
    }
  }

  /** 表单保存回调 */
  const handleFormSaved = (): void => {
    setViewMode('list')
    setEditingServer(null)
    loadData()
    bumpCapabilitiesVersion((v) => v + 1)
  }

  /** 取消表单 */
  const handleFormCancel = (): void => {
    setViewMode('list')
    setEditingServer(null)
  }

  // 表单视图
  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <McpServerForm
        server={editingServer}
        workspaceSlug={workspaceSlug}
        onSaved={handleFormSaved}
        onCancel={handleFormCancel}
      />
    )
  }

  const serverEntries = Object.entries(mcpConfig.servers ?? {}).filter(
    ([name]) => name !== 'memos-cloud', // 记忆功能已迁移到独立配置，隐藏旧 MCP 条目
  )

  // 列表视图
  return (
    <div className="space-y-8">
      {/* 数据目录提示：打包应用若未通过启动脚本运行，数据会写到临时目录导致配置"丢失" */}
      {dataDir && (
        <div className="px-3 py-2 rounded-lg border border-border/60 bg-muted/30 text-xs">
          <span className="text-muted-foreground">数据目录：</span>
          <span className="text-foreground break-all">{dataDir}</span>
          {(dataDir.includes('win-unpacked') || dataDir.includes('node_modules')) && (
            <div className="mt-1 text-amber-600 dark:text-amber-400">
              警告：当前数据目录不稳定（未通过「启动 Fu Agent.cmd」启动）。MCP / 技能 / 会话会写入临时位置并在重打包时丢失，请改用桌面快捷方式启动。
            </div>
          )}
        </div>
      )}

      {/* 区块零：WOLAI 沉淀 */}
      <SettingsSection
        title="WOLAI 沉淀"
        description="把 Agent 会话总结写入 WOLAI 页面（通过 WOLAI 开放 API）"
      >
        <SettingsCard>
          <div className="px-4 py-3 space-y-3">
            <div>
              <label className="text-xs font-medium text-foreground">沉淀父页面 ID *</label>
              <Input
                className="mt-1"
                value={wolaiParentId}
                placeholder="例如 oyKuZbAmufkA3r7ocrBxW2"
                onChange={(event) => setWolaiParentId(event.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                打开 WOLAI 目标页面，复制浏览器地址栏 URL 末尾那一段（<code>#</code> 之前）；或点击「浏览 WOLAI 目录」直接选择。
                也可在 .env 中设置 <code>WOLAI_DEPOSIT_PARENT</code>。
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">API Token</label>
              <Input
                className="mt-1"
                type="password"
                value={wolaiToken}
                placeholder="留空则自动使用 .env 的 WOLAI_TOKEN 或 wolai MCP 的 Token"
                onChange={(event) => setWolaiToken(event.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                自动识别 Token 类型：sk- 开头的 MCP Token 走 MCP 通道沉淀，开放 API Token 走 REST API，无需手动区分。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void handleSaveWolai()} disabled={wolaiBusy !== null}>
                <BookOpen size={14} />
                <span>保存</span>
              </Button>
              <Button size="sm" variant="outline" onClick={() => void handleTestWolai()} disabled={wolaiBusy !== null}>
                {wolaiBusy === 'test' ? '测试中...' : '测试连接'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void handleBrowseWolai()} disabled={wolaiBusy !== null}>
                {wolaiBusy === 'browse' ? '读取目录...' : '浏览 WOLAI 目录'}
              </Button>
              {wolaiNotice && (
                <span
                  className={
                    wolaiNotice.kind === 'ok'
                      ? 'text-xs text-emerald-600 dark:text-emerald-400'
                      : 'text-xs text-destructive'
                  }
                >
                  {wolaiNotice.text}
                </span>
              )}
            </div>
            {wolaiPages && wolaiPages.length > 0 && (
              <div className="rounded-lg border border-border/60 divide-y divide-border/60 max-h-56 overflow-y-auto">
                {wolaiPages.map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => {
                      setWolaiParentId(page.id)
                      setWolaiNotice({ kind: 'ok', text: `已选择：${page.title}` })
                    }}
                    className={
                      'w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60 transition-colors flex items-center gap-2 ' +
                      (wolaiParentId === page.id ? 'bg-primary/10' : '')
                    }
                  >
                    <BookOpen size={12} className="shrink-0 text-muted-foreground" />
                    <span className="truncate">{page.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{page.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* 区块一：MCP 服务器 */}
      <SettingsSection
        title="MCP 服务器"
        description={`当前工作区: ${workspaceName}`}
        action={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setScanOpen(true)}>
              <ScanLine size={16} />
              <span>扫描本机</span>
            </Button>
            <Button size="sm" onClick={() => setViewMode('create')}>
              <Plus size={16} />
              <span>添加服务器</span>
            </Button>
          </div>
        }
      >
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">加载中...</div>
        ) : serverEntries.length === 0 ? (
          <SettingsCard divided={false}>
            <div className="text-sm text-muted-foreground py-12 text-center">
              还没有配置任何 MCP 服务器，点击上方"添加服务器"开始
            </div>
          </SettingsCard>
        ) : (
          <SettingsCard>
            {serverEntries.map(([name, entry]) => (
              <McpServerRow
                key={name}
                name={name}
                entry={entry}
                onEdit={() => {
                  setEditingServer({ name, entry })
                  setViewMode('edit')
                }}
                onDelete={() => handleDelete(name)}
                onToggle={() => handleToggle(name)}
              />
            ))}
          </SettingsCard>
        )}
      </SettingsSection>

      <Button
        size="sm"
        className="w-full"
        onClick={() => handleConfigViaChat(buildMcpPrompt())}
      >
        <MessageSquare size={14} />
        <span>跟 Fu Agent 对话完成配置</span>
      </Button>

      {/* 区块二：Skills（只读） */}
      <SettingsSection
        title="Skills"
        description="将 SKILL.md 放入工作区 skills/ 目录即可被 Agent 自动发现"
        action={
          <Button size="sm" variant="outline" onClick={() => setScanOpen(true)}>
            <ScanLine size={16} />
            <span>扫描导入</span>
          </Button>
        }
      >
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">加载中...</div>
        ) : skills.length === 0 ? (
          <SettingsCard divided={false}>
            <div className="text-sm text-muted-foreground py-8 text-center">
              暂无 Skill
            </div>
          </SettingsCard>
        ) : (
          <SettingsCard>
            {skills.map((skill) => (
              <SettingsRow
                key={skill.slug}
                label={skill.name}
                icon={<Sparkles size={18} className={skill.builtin ? 'text-blue-500' : 'text-amber-500'} />}
                description={skill.description ?? skill.slug}
                className="group"
              >
                <div className="flex items-center gap-2">
                  {skill.builtin && (
                    <span className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                      <ShieldCheck size={12} />
                      内置
                    </span>
                  )}
                  {skill.builtin && (
                    <button
                      onClick={() => void handleCopySkillAsPersonal(skill.slug, skill.name)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100"
                      title="另存为个性化副本（副本可自由修改，不影响内置原版）"
                    >
                      <SaveAll size={14} />
                    </button>
                  )}
                  {!skill.builtin && (
                    <button
                      onClick={() => void handleDeleteSkill(skill.slug, skill.name)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </SettingsRow>
            ))}
          </SettingsCard>
        )}
        <p className="text-xs text-muted-foreground px-1">
          路径: data/agent-workspaces/{workspaceSlug}/skills/
        </p>

        <Button
          size="sm"
          className="w-full"
          onClick={() => handleConfigViaChat(buildSkillPrompt())}
        >
          <MessageSquare size={14} />
          <span>跟 Fu Agent 对话完成配置</span>
        </Button>
      </SettingsSection>

      {/* 本机能力扫描导入弹窗 */}
      <LocalCapabilityDialog
        workspaceSlug={workspaceSlug}
        open={scanOpen}
        onOpenChange={setScanOpen}
        onImported={() => {
          void loadData()
          // 通知 Agent 输入框刷新可引用的技能 / MCP 列表
          bumpCapabilitiesVersion((v) => v + 1)
        }}
      />
    </div>
  )
}

// ===== MCP 服务器行子组件 =====

/** 传输类型显示标签 */
const TRANSPORT_LABELS: Record<string, string> = {
  stdio: 'stdio',
  http: 'HTTP',
  sse: 'SSE',
}

interface McpServerRowProps {
  name: string
  entry: McpServerEntry
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}

function McpServerRow({ name, entry, onEdit, onDelete, onToggle }: McpServerRowProps): React.ReactElement {
  const isBuiltin = entry.isBuiltin === true

  return (
    <SettingsRow
      label={name}
      icon={<Plug size={18} className="text-blue-500" />}
      description={entry.type === 'stdio' ? entry.command : entry.url}
      className="group"
    >
      <div className="flex items-center gap-2">
        {isBuiltin && (
          <span className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
            <ShieldCheck size={12} />
            内置
          </span>
        )}
        <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
          {TRANSPORT_LABELS[entry.type] ?? entry.type}
        </span>
        <button
          onClick={onEdit}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100"
          title="编辑"
        >
          <Pencil size={14} />
        </button>
        {!isBuiltin && (
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        )}
        <Switch
          checked={entry.enabled}
          onCheckedChange={onToggle}
        />
      </div>
    </SettingsRow>
  )
}
