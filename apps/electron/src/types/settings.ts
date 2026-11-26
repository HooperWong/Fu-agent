/**
 * 应用设置类型
 *
 * 主题模式、IPC 通道等设置相关定义。
 */

import type { EnvironmentCheckResult } from '@proma/shared'

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'system'

/** 默认主题模式 */
export const DEFAULT_THEME_MODE: ThemeMode = 'dark'

/** 应用设置 */
export interface AppSettings {
  /** 主题模式 */
  themeMode: ThemeMode
  /** Agent 默认渠道 ID（仅限 Anthropic 渠道） */
  agentChannelId?: string
  /** Agent 默认模型 ID */
  agentModelId?: string
  /** Agent 当前工作区 ID */
  agentWorkspaceId?: string
  /** WOLAI 开放 API Token（留空则使用 .env 的 WOLAI_TOKEN；对外读取用，落盘前已加密为 wolaiTokenEncrypted） */
  wolaiToken?: string
  /**
   * WOLAI Token 密文（内部存储字段：Electron safeStorage 加密后的 base64，enc:v1: 前缀）
   * settings.json 中不再保存明文 wolaiToken
   */
  wolaiTokenEncrypted?: string
  /** WOLAI 沉淀父页面 ID（WOLAI 页面 URL 末尾那一段） */
  wolaiDepositParentId?: string
  /** 是否已完成 Onboarding 流程 */
  onboardingCompleted?: boolean
  /** 是否跳过了环境检测 */
  environmentCheckSkipped?: boolean
  /** 最后一次环境检测结果（缓存） */
  lastEnvironmentCheck?: EnvironmentCheckResult
  /** 是否启用桌面通知 */
  notificationsEnabled?: boolean
  /** 是否显示状态栏（托盘）图标 */
  showTrayIcon?: boolean
  /** 新建对话快捷键（如 "meta+n"、"ctrl+n"）——已废弃，迁移到 shortcuts */
  newConversationShortcut?: string
  /**
   * 多快捷键集合：key 为动作标识，value 为内部快捷键格式（如 "ctrl+n"）
   *
   * 可配置动作：
   * - newConversation    新建对话/Agent 会话
   * - toggleAgentMode    切换 Chat / Agent 模式
   * - openSettings       打开设置
   * - closeSettings      关闭设置（返回对话）
   * - sendMessage        发送当前输入（Ctrl+Enter）
   * - clearContext       清空当前对话上下文
   * - focusInput         聚焦输入框
   */
  shortcuts?: Record<string, string>
  /** Agent 单次查询最大轮次（默认 30） */
  agentMaxTurns?: number
  /** 扩展思考 token 预算（0 或未设置表示不限制） */
  agentMaxThinkingTokens?: number
}

/** 设置 IPC 通道 */
export const SETTINGS_IPC_CHANNELS = {
  GET: 'settings:get',
  UPDATE: 'settings:update',
  GET_DATA_DIR: 'settings:get-data-dir',
  GET_SYSTEM_THEME: 'settings:get-system-theme',
  ON_SYSTEM_THEME_CHANGED: 'settings:system-theme-changed',
  TEST_NOTIFICATION: 'settings:test-notification',
} as const
