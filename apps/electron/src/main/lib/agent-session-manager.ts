/**
 * Agent 会话管理器
 *
 * 负责 Agent 会话的 CRUD 操作和消息持久化。
 * - 会话索引：~/.proma/agent-sessions.json（轻量元数据）
 * - 消息存储：~/.proma/agent-sessions/{id}.jsonl（JSONL 格式，逐行追加）
 *
 * 照搬 conversation-manager.ts 的模式。
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  getAgentSessionsIndexPath,
  getAgentSessionsDir,
  getAgentSessionMessagesPath,
  getAgentSessionWorkspacePath,
} from './config-paths'
import { getAgentWorkspace } from './agent-workspace-manager'
import type { AgentSessionMeta, AgentMessage } from '@proma/shared'

/**
 * 会话索引文件格式
 */
interface AgentSessionsIndex {
  /** 配置版本号 */
  version: number
  /** 会话元数据列表 */
  sessions: AgentSessionMeta[]
}

/** 当前索引版本 */
const INDEX_VERSION = 1

/**
 * 读取会话索引文件
 */
function readIndex(): AgentSessionsIndex {
  const indexPath = getAgentSessionsIndexPath()

  if (!existsSync(indexPath)) {
    return { version: INDEX_VERSION, sessions: [] }
  }

  try {
    const raw = readFileSync(indexPath, 'utf-8')
    return JSON.parse(raw) as AgentSessionsIndex
  } catch (error) {
    console.error('[Agent 会话] 读取索引文件失败:', error)
    return { version: INDEX_VERSION, sessions: [] }
  }
}

/**
 * 写入会话索引文件
 */
function writeIndex(index: AgentSessionsIndex): void {
  const indexPath = getAgentSessionsIndexPath()

  try {
    writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8')
  } catch (error) {
    console.error('[Agent 会话] 写入索引文件失败:', error)
    throw new Error('写入 Agent 会话索引失败')
  }
}

/**
 * 获取所有会话（按 updatedAt 降序）
 */
export function listAgentSessions(): AgentSessionMeta[] {
  const index = readIndex()
  return index.sessions.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * 获取单个会话的元数据
 */
export function getAgentSessionMeta(id: string): AgentSessionMeta | undefined {
  const index = readIndex()
  return index.sessions.find((s) => s.id === id)
}

/**
 * 创建新会话
 */
export function createAgentSession(
  title?: string,
  channelId?: string,
  workspaceId?: string,
): AgentSessionMeta {
  const index = readIndex()
  const now = Date.now()

  const meta: AgentSessionMeta = {
    id: randomUUID(),
    title: title || '新 Agent 会话',
    channelId,
    workspaceId,
    createdAt: now,
    updatedAt: now,
  }

  index.sessions.push(meta)
  writeIndex(index)

  // 确保消息目录存在
  getAgentSessionsDir()

  // 若有工作区，创建 session 级别子文件夹
  if (workspaceId) {
    const ws = getAgentWorkspace(workspaceId)
    if (ws) {
      getAgentSessionWorkspacePath(ws.slug, meta.id)
    }
  }

  console.log(`[Agent 会话] 已创建会话: ${meta.title} (${meta.id})`)
  return meta
}

/**
 * 读取会话的所有消息
 */
export function getAgentSessionMessages(id: string): AgentMessage[] {
  const filePath = getAgentSessionMessagesPath(id)

  if (!existsSync(filePath)) {
    return []
  }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const lines = raw.split('\n').filter((line) => line.trim())
    return lines.map((line) => JSON.parse(line) as AgentMessage)
  } catch (error) {
    console.error(`[Agent 会话] 读取消息失败 (${id}):`, error)
    return []
  }
}

/**
 * 追加一条消息到会话的 JSONL 文件
 */
export function appendAgentMessage(id: string, message: AgentMessage): void {
  const filePath = getAgentSessionMessagesPath(id)

  try {
    const line = JSON.stringify(message) + '\n'
    appendFileSync(filePath, line, 'utf-8')
  } catch (error) {
    console.error(`[Agent 会话] 追加消息失败 (${id}):`, error)
    throw new Error('追加 Agent 消息失败')
  }
}

/**
 * 更新会话元数据
 */
export function updateAgentSessionMeta(
  id: string,
  updates: Partial<Pick<AgentSessionMeta, 'title' | 'channelId' | 'sdkSessionId' | 'workspaceId' | 'isTodo' | 'isExplore'>>,
): AgentSessionMeta {
  const index = readIndex()
  const idx = index.sessions.findIndex((s) => s.id === id)

  if (idx === -1) {
    throw new Error(`Agent 会话不存在: ${id}`)
  }

  const existing = index.sessions[idx]!
  const updated: AgentSessionMeta = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  }

  index.sessions[idx] = updated
  writeIndex(index)

  console.log(`[Agent 会话] 已更新会话: ${updated.title} (${updated.id})`)
  return updated
}

/**
 * 删除会话
 */
export function deleteAgentSession(id: string): void {
  const index = readIndex()
  const idx = index.sessions.findIndex((s) => s.id === id)

  if (idx === -1) {
    throw new Error(`Agent 会话不存在: ${id}`)
  }

  const removed = index.sessions.splice(idx, 1)[0]!
  writeIndex(index)

  // 删除消息文件
  const filePath = getAgentSessionMessagesPath(id)
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath)
    } catch (error) {
      console.warn(`[Agent 会话] 删除消息文件失败 (${id}):`, error)
    }
  }

  // 清理 session 工作目录
  if (removed.workspaceId) {
    const ws = getAgentWorkspace(removed.workspaceId)
    if (ws) {
      try {
        const sessionDir = getAgentSessionWorkspacePath(ws.slug, id)
        if (existsSync(sessionDir)) {
          rmSync(sessionDir, { recursive: true, force: true })
          console.log(`[Agent 会话] 已清理 session 工作目录: ${sessionDir}`)
        }
      } catch (error) {
        console.warn(`[Agent 会话] 清理 session 工作目录失败 (${id}):`, error)
      }
    }
  }

  console.log(`[Agent 会话] 已删除会话: ${removed.title} (${removed.id})`)
}

/**
 * 复制 / 派生探索会话
 *
 * 复制原会话的全部消息到新会话（新 ID、新元数据）。
 * - mode='copy'：普通副本，标题追加「（副本）」
 * - mode='explore'：探索副本，标题追加「（探索）」并标记 isExplore，
 *   用于在不影响原会话的前提下随意追问
 *
 * 注意：不复用 sdkSessionId（新会话从消息历史出发重新开始），
 * 也不复制会话工作目录（其中文件归属于原会话）。
 *
 * @returns 新会话元数据
 */
export function duplicateAgentSession(
  id: string,
  mode: 'copy' | 'explore' = 'copy',
): AgentSessionMeta {
  const meta = getAgentSessionMeta(id)
  if (!meta) throw new Error(`Agent 会话不存在: ${id}`)

  const index = readIndex()
  const now = Date.now()
  const suffix = mode === 'explore' ? '（探索）' : '（副本）'

  const newMeta: AgentSessionMeta = {
    id: randomUUID(),
    title: `${meta.title.slice(0, 90)}${suffix}`,
    channelId: meta.channelId,
    workspaceId: meta.workspaceId,
    createdAt: now,
    updatedAt: now,
    isExplore: mode === 'explore' ? true : undefined,
  }

  // 复制消息文件
  const sourcePath = getAgentSessionMessagesPath(id)
  const targetPath = getAgentSessionMessagesPath(newMeta.id)
  if (existsSync(sourcePath)) {
    try {
      writeFileSync(targetPath, readFileSync(sourcePath, 'utf-8'), 'utf-8')
    } catch (error) {
      console.error(`[Agent 会话] 复制消息文件失败 (${id}):`, error)
      throw new Error('复制会话消息失败')
    }
  }

  index.sessions.push(newMeta)
  writeIndex(index)

  console.log(`[Agent 会话] 已${mode === 'explore' ? '派生探索会话' : '复制会话'}: ${newMeta.title} (${newMeta.id})`)
  return newMeta
}

/**
 * 回退会话最近一轮对话
 *
 * 删除最后一条用户消息及其之后的所有消息（最后的问答交换）。
 * 同时清除 sdkSessionId：下次发送将开启新的 SDK 会话，
 * 避免 resume 时把已回退的上下文重新带回来。
 *
 * @returns 移除的消息条数
 */
export function rollbackAgentSession(id: string): number {
  const meta = getAgentSessionMeta(id)
  if (!meta) throw new Error(`Agent 会话不存在: ${id}`)

  const filePath = getAgentSessionMessagesPath(id)
  if (!existsSync(filePath)) return 0

  const raw = readFileSync(filePath, 'utf-8')
  const lines = raw.split('\n').filter((line) => line.trim())
  if (lines.length === 0) return 0

  // 找到最后一条用户消息的位置
  let lastUserIndex = -1
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const msg = JSON.parse(lines[i]!) as { role?: string }
      if (msg.role === 'user') {
        lastUserIndex = i
        break
      }
    } catch {
      // 跳过无法解析的行
    }
  }

  if (lastUserIndex <= 0) {
    throw new Error('没有可回退的对话轮次（需要至少一轮已完成的问答）')
  }

  const kept = lines.slice(0, lastUserIndex)
  const removedCount = lines.length - kept.length

  try {
    writeFileSync(filePath, kept.length > 0 ? `${kept.join('\n')}\n` : '', 'utf-8')
  } catch (error) {
    console.error(`[Agent 会话] 回退写回失败 (${id}):`, error)
    throw new Error('回退会话失败')
  }

  // 清除 SDK 会话衔接 ID
  updateAgentSessionMeta(id, { sdkSessionId: undefined })

  console.log(`[Agent 会话] 已回退会话 ${id}：移除 ${removedCount} 条消息`)
  return removedCount
}

/**
 * 更新会话标记（待办 / 探索）
 */
export function setAgentSessionFlags(
  id: string,
  flags: { isTodo?: boolean; isExplore?: boolean },
): AgentSessionMeta {
  const updates: Partial<Pick<AgentSessionMeta, 'isTodo' | 'isExplore'>> = {}
  if (flags.isTodo !== undefined) updates.isTodo = flags.isTodo || undefined
  if (flags.isExplore !== undefined) updates.isExplore = flags.isExplore || undefined
  return updateAgentSessionMeta(id, updates)
}
