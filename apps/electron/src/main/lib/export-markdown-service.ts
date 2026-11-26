/**
 * 导出 Markdown 服务
 *
 * 将对话/Agent 会话的消息导出为 Markdown 文件。
 * 通过系统保存对话框让用户选择保存位置。
 */

import { dialog, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import type { ChatMessage } from '@proma/shared'
import type { AgentMessage, AgentEvent } from '@proma/shared'
import { getConversationMessages } from './conversation-manager'
import { getAgentSessionMessages } from './agent-session-manager'

/**
 * 将 ChatMessage[] 转换为 Markdown 字符串
 */
function chatMessagesToMarkdown(title: string, messages: ChatMessage[]): string {
  const lines: string[] = [`# ${title}`, '']

  for (const msg of messages) {
    const roleLabel = msg.role === 'user' ? '👤 用户' : msg.role === 'assistant' ? '🤖 助手' : '⚙️ 系统'
    lines.push(`## ${roleLabel}`)
    lines.push('')
    if (msg.model) {
      lines.push(`> 模型: ${msg.model}`)
      lines.push('')
    }
    if (msg.reasoning) {
      lines.push('<details>')
      lines.push('<summary>💭 推理过程</summary>')
      lines.push('')
      lines.push(msg.reasoning)
      lines.push('')
      lines.push('</details>')
      lines.push('')
    }
    lines.push(msg.content)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 从 AgentEvent[] 中提取工具调用摘要
 */
function extractToolSummary(events: AgentEvent[]): string {
  const lines: string[] = []
  for (const ev of events) {
    if (ev.type === 'tool_start') {
      lines.push(`- 🔧 \`${ev.toolName}\``)
    }
  }
  return lines.length > 0 ? lines.join('\n') : ''
}

/**
 * 将 AgentMessage[] 转换为 Markdown 字符串
 */
function agentMessagesToMarkdown(title: string, messages: AgentMessage[]): string {
  const lines: string[] = [`# ${title}`, '']

  for (const msg of messages) {
    // 跳过 status 类型消息（错误信息等）
    if (msg.role === 'status') continue

    const roleLabel = msg.role === 'user' ? '👤 用户' : msg.role === 'assistant' ? '🤖 助手' : '🔧 工具'
    lines.push(`## ${roleLabel}`)
    lines.push('')
    if (msg.model) {
      lines.push(`> 模型: ${msg.model}`)
      lines.push('')
    }
    // 工具调用摘要
    if (msg.events && msg.events.length > 0) {
      const toolSummary = extractToolSummary(msg.events)
      if (toolSummary) {
        lines.push('<details>')
        lines.push('<summary>🛠️ 工具调用</summary>')
        lines.push('')
        lines.push(toolSummary)
        lines.push('')
        lines.push('</details>')
        lines.push('')
      }
    }
    lines.push(msg.content)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 导出 Chat 对话为 Markdown
 *
 * @returns 保存路径，如果用户取消则返回 null
 */
export async function exportChatAsMarkdown(conversationId: string, title: string): Promise<string | null> {
  const messages = getConversationMessages(conversationId)
  if (messages.length === 0) return null

  const markdown = chatMessagesToMarkdown(title, messages)
  const safeTitle = title.replace(/[/\\:*?"<>|]/g, '_').slice(0, 100)

  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!win) return null

  const result = await dialog.showSaveDialog(win, {
    title: '导出对话为 Markdown',
    defaultPath: `${safeTitle}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })

  if (result.canceled || !result.filePath) return null

  writeFileSync(result.filePath, markdown, 'utf-8')
  return result.filePath
}

/**
 * 导出 Agent 会话为 Markdown
 *
 * @returns 保存路径，如果用户取消则返回 null
 */
export async function exportAgentSessionAsMarkdown(sessionId: string, title: string): Promise<string | null> {
  const messages = getAgentSessionMessages(sessionId)
  if (messages.length === 0) return null

  const markdown = agentMessagesToMarkdown(title, messages)
  const safeTitle = title.replace(/[/\\:*?"<>|]/g, '_').slice(0, 100)

  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!win) return null

  const result = await dialog.showSaveDialog(win, {
    title: '导出会话为 Markdown',
    defaultPath: `${safeTitle}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })

  if (result.canceled || !result.filePath) return null

  writeFileSync(result.filePath, markdown, 'utf-8')
  return result.filePath
}
