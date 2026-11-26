/**
 * 授权审批服务
 *
 * 安全底线：破坏性操作、对外发送/发布、付费行为必须先经用户确认。
 * - 统一弹窗（主进程原生模态框），默认按钮为「取消」
 * - 每次决策写入 data/security/audit.jsonl 审计日志（内容已脱敏）
 */

import { BrowserWindow, dialog } from 'electron'
import { getAuditLogPath } from '../config-paths'
import { appendJsonl, readJsonl } from '../storage/json-store'
import type { ApprovalRequest, ApprovalResult, AuditEntry, ApprovalRisk } from '../../../types'
import { redactText } from './log-redaction'

/** 风险等级中文名 */
const RISK_LABELS: Record<ApprovalRisk, string> = {
  destructive: '破坏性操作',
  external: '对外发送 / 发布',
  paid: '可能产生费用',
}

/** 写入审计日志 */
function appendAudit(entry: AuditEntry): void {
  try {
    appendJsonl(getAuditLogPath(), entry)
  } catch (error) {
    console.error('[授权] 写入审计日志失败:', error)
  }
}

/**
 * 请求用户授权
 *
 * 无可用窗口时一律拒绝（默认安全）。
 */
export async function requestApproval(request: ApprovalRequest): Promise<ApprovalResult> {
  const parent =
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows().find((win) => !win.isDestroyed()) ??
    null

  if (!parent) {
    appendAudit({
      ts: Date.now(),
      action: request.action,
      risk: request.risk,
      approved: false,
      detail: redactText(request.detail ?? request.description),
    })
    return { approved: false, reason: 'no-window' }
  }

  const detailLines = [
    `风险等级：${RISK_LABELS[request.risk]}`,
    request.description,
  ]
  if (request.detail) {
    detailLines.push('', request.detail)
  }

  const { response } = await dialog.showMessageBox(parent, {
    type: 'warning',
    title: '需要你的确认',
    message: request.title,
    detail: detailLines.join('\n'),
    buttons: ['取消', '允许执行'],
    // 默认聚焦「取消」，回车/意外关闭都不会放行
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  })

  const approved = response === 1

  appendAudit({
    ts: Date.now(),
    action: request.action,
    risk: request.risk,
    approved,
    detail: redactText(request.detail ?? request.description),
  })

  console.log(`[授权] ${request.action} → ${approved ? '已允许' : '已取消'}`)

  return approved ? { approved: true } : { approved: false, reason: 'denied-by-user' }
}

/** 读取最近的审计记录（新的在前） */
export function getAuditLog(limit = 50): AuditEntry[] {
  const entries = readJsonl<AuditEntry>(getAuditLogPath())
  return entries.slice(-Math.max(1, limit)).reverse()
}
