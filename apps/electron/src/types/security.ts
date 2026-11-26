/**
 * 安全相关类型与 IPC 通道
 *
 * 覆盖密钥状态、授权审批、审计日志。
 */

/** 密钥条目的展示状态（不回传明文） */
export interface SecretStatus {
  /** 环境变量名，如 WOLAI_TOKEN */
  key: string
  /** 中文说明 */
  description: string
  /** 是否已配置 */
  configured: boolean
  /** 掩码后的值，未配置为 null */
  masked: string | null
}

/** 授权风险等级 */
export type ApprovalRisk = 'destructive' | 'external' | 'paid'

/** 授权请求 */
export interface ApprovalRequest {
  /** 动作标识，如 delete-conversation */
  action: string
  /** 弹窗标题 */
  title: string
  /** 一句话说明 */
  description: string
  /** 详细内容（文件路径、影响范围等） */
  detail?: string
  /** 风险等级 */
  risk: ApprovalRisk
}

/** 授权结果 */
export interface ApprovalResult {
  /** 是否放行 */
  approved: boolean
  /** 拒绝原因：用户拒绝 / 无可用窗口 */
  reason?: 'denied-by-user' | 'no-window'
}

/** 审计日志条目 */
export interface AuditEntry {
  /** 时间戳（毫秒） */
  ts: number
  /** 动作标识 */
  action: string
  /** 风险等级 */
  risk: ApprovalRisk
  /** 是否放行 */
  approved: boolean
  /** 详情（已脱敏） */
  detail?: string
}

/** 安全相关 IPC 通道 */
export const SECURITY_IPC_CHANNELS = {
  GET_SECRET_STATUS: 'security:get-secret-status',
  SET_SECRET: 'security:set-secret',
  GET_AUDIT_LOG: 'security:get-audit-log',
  REQUEST_APPROVAL: 'security:request-approval',
} as const
