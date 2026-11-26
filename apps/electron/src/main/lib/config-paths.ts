/**
 * 配置路径工具
 *
 * 管理应用本地数据文件路径。
 * 数据统一存储在应用仓库内的 data/ 目录下（可整体拷贝迁移）。
 */

import { join, resolve } from 'node:path'
import { mkdirSync, existsSync, cpSync, readdirSync } from 'node:fs'
import { isProductionBuild } from './app-mode'

/** 数据目录名称 */
const DATA_DIR_NAME = 'data'

/**
 * 解析数据根目录
 *
 * 优先级：
 * 1. 环境变量 PROMA_DATA_DIR（支持绝对/相对路径，便于自定义迁移位置）
 * 2. <应用根>/data/：
 *    - 开发模式：apps/electron/dist → 上溯三级 = 仓库根目录
 *    - 打包模式：resources/app.asar/dist → 上溯三级 = 安装目录
 *    整目录拷贝即可迁移。
 */
function resolveDataRoot(): string {
  const envDir = process.env.PROMA_DATA_DIR?.trim()
  if (envDir) return resolve(envDir)

  return join(__dirname, '..', '..', '..', DATA_DIR_NAME)
}

/**
 * 获取数据目录路径
 *
 * 返回 <应用根>/data/，如果目录不存在则自动创建。
 */
export function getConfigDir(): string {
  const configDir = resolveDataRoot()

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
    console.log(`[配置] 已创建数据目录: ${configDir}`)
  }

  return configDir
}

/**
 * 获取应用根目录
 *
 * 开发模式指向仓库根（agent-desktop/），打包模式指向安装目录。
 */
export function getAppRootDir(): string {
  return resolve(join(__dirname, '..', '..', '..'))
}

/**
 * 获取 .env 文件路径
 *
 * .env 跟随应用根目录，不随 PROMA_DATA_DIR 迁移，避免密钥进入数据目录。
 */
export function getEnvPath(): string {
  return join(getAppRootDir(), '.env')
}

/**
 * 初始化个人数据目录结构
 *
 * 应用启动时调用，缺失的目录自动补齐。所有数据均可随仓库整体迁移。
 */
export function ensureDataLayout(): void {
  const dirs = [
    'conversations',
    'agent-sessions',
    'agent-workspaces',
    'notes',
    join('notes', 'assets'),
    'playground',
    'sap',
    join('sap', 'vendor'),
    'todos',
    'calendar',
    'projects',
    'scheduler',
    'hotspots',
    'skills',
    'mcp',
    'memory',
    'security',
  ]

  const root = getConfigDir()
  const created: string[] = []

  for (const name of dirs) {
    const dir = join(root, name)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      created.push(name)
    }
  }

  if (created.length > 0) {
    console.log(`[配置] 已初始化数据子目录: ${created.join(', ')}`)
  }
}

/**
 * 获取授权审计日志路径
 */
export function getAuditLogPath(): string {
  const dir = join(getConfigDir(), 'security')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'audit.jsonl')
}

/**
 * 获取渠道配置文件路径
 *
 * @returns ~/.proma/channels.json
 */
export function getChannelsPath(): string {
  return join(getConfigDir(), 'channels.json')
}

/**
 * 获取对话索引文件路径
 *
 * @returns ~/.proma/conversations.json
 */
export function getConversationsIndexPath(): string {
  return join(getConfigDir(), 'conversations.json')
}

/**
 * 获取对话消息目录路径
 *
 * 如果目录不存在则自动创建。
 *
 * @returns ~/.proma/conversations/
 */
export function getConversationsDir(): string {
  const dir = join(getConfigDir(), 'conversations')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建对话目录: ${dir}`)
  }

  return dir
}

/**
 * 获取指定对话的消息文件路径
 *
 * @param id 对话 ID
 * @returns ~/.proma/conversations/{id}.jsonl
 */
export function getConversationMessagesPath(id: string): string {
  return join(getConversationsDir(), `${id}.jsonl`)
}

/**
 * 获取附件存储根目录
 *
 * 如果目录不存在则自动创建。
 *
 * @returns ~/.proma/attachments/
 */
export function getAttachmentsDir(): string {
  const dir = join(getConfigDir(), 'attachments')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建附件目录: ${dir}`)
  }

  return dir
}

/**
 * 获取指定对话的附件目录
 *
 * 如果目录不存在则自动创建。
 *
 * @param conversationId 对话 ID
 * @returns ~/.proma/attachments/{conversationId}/
 */
export function getConversationAttachmentsDir(conversationId: string): string {
  const dir = join(getAttachmentsDir(), conversationId)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 解析附件相对路径为完整路径
 *
 * @param localPath 相对路径 {conversationId}/{uuid}.ext
 * @returns 完整路径 ~/.proma/attachments/{conversationId}/{uuid}.ext
 */
export function resolveAttachmentPath(localPath: string): string {
  return join(getAttachmentsDir(), localPath)
}

/**
 * 获取应用设置文件路径
 *
 * @returns ~/.proma/settings.json
 */
export function getSettingsPath(): string {
  return join(getConfigDir(), 'settings.json')
}

/**
 * 获取用户档案文件路径
 *
 * @returns ~/.proma/user-profile.json
 */
export function getUserProfilePath(): string {
  return join(getConfigDir(), 'user-profile.json')
}

/**
 * 获取代理配置文件路径
 *
 * @returns ~/.proma/proxy-settings.json
 */
export function getProxySettingsPath(): string {
  return join(getConfigDir(), 'proxy-settings.json')
}

/**
 * 获取系统提示词配置文件路径
 *
 * @returns ~/.proma/system-prompts.json
 */
export function getSystemPromptsPath(): string {
  return join(getConfigDir(), 'system-prompts.json')
}

/**
 * 获取记忆配置文件路径
 *
 * @returns ~/.proma/memory.json
 */
export function getMemoryConfigPath(): string {
  return join(getConfigDir(), 'memory.json')
}

/**
 * 获取 Agent 会话索引文件路径
 *
 * @returns ~/.proma/agent-sessions.json
 */
export function getAgentSessionsIndexPath(): string {
  return join(getConfigDir(), 'agent-sessions.json')
}

/**
 * 获取 Agent 会话消息目录路径
 *
 * 如果目录不存在则自动创建。
 *
 * @returns ~/.proma/agent-sessions/
 */
export function getAgentSessionsDir(): string {
  const dir = join(getConfigDir(), 'agent-sessions')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建 Agent 会话目录: ${dir}`)
  }

  return dir
}

/**
 * 获取指定 Agent 会话的消息文件路径
 *
 * @param id 会话 ID
 * @returns ~/.proma/agent-sessions/{id}.jsonl
 */
export function getAgentSessionMessagesPath(id: string): string {
  return join(getAgentSessionsDir(), `${id}.jsonl`)
}

/**
 * 获取 Agent 工作区索引文件路径
 *
 * @returns ~/.proma/agent-workspaces.json
 */
export function getAgentWorkspacesIndexPath(): string {
  return join(getConfigDir(), 'agent-workspaces.json')
}

/**
 * 获取 Agent 工作区根目录路径
 *
 * 如果目录不存在则自动创建。
 *
 * @returns ~/.proma/agent-workspaces/
 */
export function getAgentWorkspacesDir(): string {
  const dir = join(getConfigDir(), 'agent-workspaces')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建 Agent 工作区目录: ${dir}`)
  }

  return dir
}

/**
 * 获取指定 Agent 工作区的目录路径
 *
 * 如果目录不存在则自动创建。
 *
 * @param slug 工作区 slug
 * @returns ~/.proma/agent-workspaces/{slug}/
 */
export function getAgentWorkspacePath(slug: string): string {
  const dir = join(getAgentWorkspacesDir(), slug)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建 Agent 工作区: ${dir}`)
  }

  return dir
}

/**
 * 获取指定工作区的 MCP 配置文件路径
 *
 * @param slug 工作区 slug
 * @returns ~/.proma/agent-workspaces/{slug}/mcp.json
 */
export function getWorkspaceMcpPath(slug: string): string {
  return join(getAgentWorkspacePath(slug), 'mcp.json')
}

/**
 * 获取指定工作区的 Skills 目录路径
 *
 * 如果目录不存在则自动创建。
 *
 * @param slug 工作区 slug
 * @returns ~/.proma/agent-workspaces/{slug}/skills/
 */
export function getWorkspaceSkillsDir(slug: string): string {
  const dir = join(getAgentWorkspacePath(slug), 'skills')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 获取默认 Skills 模板目录路径
 *
 * 新建工作区时自动复制此目录的内容到工作区 skills/ 下。
 *
 * @returns ~/.proma/default-skills/
 */
export function getDefaultSkillsDir(): string {
  const dir = join(getConfigDir(), 'default-skills')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 从 app bundle 同步默认 Skills 到 ~/.proma/default-skills/
 *
 * 打包模式下从 process.resourcesPath/default-skills 复制。
 * 仅补充缺失的 Skill 目录，不覆盖用户已有的内容。
 * 开发模式下从源码 default-skills/ 目录复制。
 */
export function seedDefaultSkills(): void {
  const bundledDir = isProductionBuild()
    ? join(process.resourcesPath, 'default-skills')
    : join(__dirname, '../../default-skills')

  if (!existsSync(bundledDir)) {
    console.log('[配置] 未找到内置 default-skills 目录，跳过')
    return
  }

  const userDir = getDefaultSkillsDir()

  try {
    const entries = readdirSync(bundledDir, { withFileTypes: true })

    for (const entry of entries) {
      const target = join(userDir, entry.name)
      if (!existsSync(target)) {
        const source = join(bundledDir, entry.name)
        cpSync(source, target, { recursive: true })
        console.log(`[配置] 已同步默认 Skill: ${entry.name}`)
      }
    }
  } catch (err) {
    console.warn('[配置] 同步默认 Skills 失败:', err)
  }
}

/**
 * 获取指定 Agent 会话的工作路径
 *
 * 在工作区目录下创建以 sessionId 命名的子文件夹，
 * 作为该会话的独立 Agent cwd。如果目录不存在则自动创建。
 *
 * @param workspaceSlug 工作区 slug
 * @param sessionId 会话 ID
 * @returns ~/.proma/agent-workspaces/{slug}/{sessionId}/
 */
export function getAgentSessionWorkspacePath(workspaceSlug: string, sessionId: string): string {
  const dir = join(getAgentWorkspacePath(workspaceSlug), sessionId)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建 Agent 会话工作目录: ${dir}`)
  }

  return dir
}
