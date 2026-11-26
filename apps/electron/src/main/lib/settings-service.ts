/**
 * 应用设置服务
 *
 * 管理应用设置（主题模式等）的读写。
 * 存储在 ~/.proma/settings.json
 *
 * 凭据安全：
 * - wolaiToken 等凭据落盘前经 Electron safeStorage 加密（enc:v1: 前缀），settings.json 不存明文
 * - 读取时解密为内存明文供主进程使用；safeStorage 不可用时回退明文并打日志提示
 * - 历史遗留的明文 wolaiToken 在首次读取时自动完成加密迁移
 * - 日志输出对凭据脱敏
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { getSettingsPath } from './config-paths'
import { DEFAULT_THEME_MODE } from '../../types'
import type { AppSettings } from '../../types'
import {
  decryptCredential,
  encryptCredential,
  isEncryptedValue,
  isVaultAvailable,
} from './security/credential-vault'
import { maskSecret } from './security/log-redaction'

/** 需要加密落盘的凭据字段 */
const ENCRYPTED_FIELDS = ['wolaiToken'] as const

/**
 * 获取应用设置
 *
 * 如果文件不存在，返回默认设置。
 */
export function getSettings(): AppSettings {
  const filePath = getSettingsPath()

  if (!existsSync(filePath)) {
    return {
      themeMode: DEFAULT_THEME_MODE,
      onboardingCompleted: false,
      environmentCheckSkipped: false,
      notificationsEnabled: true,
      showTrayIcon: true,
    }
  }

  try {
    const raw = readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '')
    const data = JSON.parse(raw) as Partial<AppSettings>

    // 凭据解密：优先读密文；历史明文读取后自动迁移为密文
    let wolaiToken: string | undefined
    let wolaiTokenEncrypted = data.wolaiTokenEncrypted
    const legacyPlain = data.wolaiToken
    if (legacyPlain && !isEncryptedValue(legacyPlain)) {
      const encrypted = encryptCredential(legacyPlain)
      if (encrypted) {
        wolaiTokenEncrypted = encrypted
        wolaiToken = legacyPlain
        // 就地迁移：settings.json 改存密文
        try {
          const migrated = { ...data, wolaiTokenEncrypted: encrypted }
          delete migrated.wolaiToken
          writeFileSync(filePath, JSON.stringify(migrated, null, 2), 'utf-8')
          console.log('[设置] 已将明文 WOLAI Token 加密迁移（safeStorage）')
        } catch (error) {
          console.error('[设置] 凭据迁移写回失败（内存中仍可用）:', error)
        }
      } else {
        wolaiToken = legacyPlain
        console.warn('[设置] safeStorage 不可用，WOLAI Token 暂以明文保留')
      }
    } else if (wolaiTokenEncrypted) {
      wolaiToken = decryptCredential(wolaiTokenEncrypted) ?? undefined
      if (!wolaiToken) {
        console.warn('[设置] WOLAI Token 密文解密失败（可能来自其他系统用户），请重新填写')
      }
    }

    return {
      themeMode: data.themeMode || DEFAULT_THEME_MODE,
      agentChannelId: data.agentChannelId,
      agentModelId: data.agentModelId,
      agentWorkspaceId: data.agentWorkspaceId,
      wolaiToken,
      wolaiTokenEncrypted,
      wolaiDepositParentId: data.wolaiDepositParentId,
      onboardingCompleted: data.onboardingCompleted ?? false,
      environmentCheckSkipped: data.environmentCheckSkipped ?? false,
      lastEnvironmentCheck: data.lastEnvironmentCheck,
      notificationsEnabled: data.notificationsEnabled ?? true,
      showTrayIcon: data.showTrayIcon ?? true,
      newConversationShortcut: data.newConversationShortcut,
      // 多快捷键集合，向下兼容旧的 newConversationShortcut
      shortcuts: data.shortcuts ?? {
        ...(data.newConversationShortcut ? { newConversation: data.newConversationShortcut } : undefined),
      },
      agentMaxTurns: data.agentMaxTurns,
      agentMaxThinkingTokens: data.agentMaxThinkingTokens,
    }
  } catch (error) {
    console.error('[设置] 读取失败:', error)
    return {
      themeMode: DEFAULT_THEME_MODE,
      onboardingCompleted: false,
      environmentCheckSkipped: false,
      notificationsEnabled: true,
      showTrayIcon: true,
    }
  }
}

/**
 * 更新应用设置
 *
 * 合并更新字段并写入文件；凭据字段加密落盘、日志脱敏。
 */
export function updateSettings(updates: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const updated: AppSettings = {
    ...current,
    ...updates,
    // shortcuts 做浅合并，避免 renderer 每次只传一条导致其他键位丢失
    shortcuts: updates.shortcuts
      ? { ...(current.shortcuts ?? {}), ...updates.shortcuts }
      : current.shortcuts,
  }

  // 凭据加密落盘：settings.json 中只保留密文，内存对象保留明文
  const persistData: Record<string, unknown> = { ...updated }
  for (const field of ENCRYPTED_FIELDS) {
    const encKey = `${field}Encrypted`
    if (field in updates) {
      // 调用方显式传入了凭据：有值则加密替换，空值则清除
      const plain = updated[field]
      if (plain) {
        const encrypted = encryptCredential(plain)
        if (encrypted) {
          persistData[encKey] = encrypted
          delete persistData[field]
        } else if (!isVaultAvailable()) {
          console.warn(`[设置] safeStorage 不可用，${field} 暂以明文落盘`)
        }
      } else {
        delete persistData[encKey]
        delete persistData[field]
      }
    } else {
      // 未传入凭据：保留已有密文，不落明文
      if (updated[`${field}Encrypted` as keyof AppSettings]) {
        delete persistData[field]
      }
    }
  }

  const filePath = getSettingsPath()

  try {
    writeFileSync(filePath, JSON.stringify(persistData, null, 2), 'utf-8')
    console.log('[设置] 已更新:', redactSettings(persistData))
  } catch (error) {
    console.error('[设置] 写入失败:', error)
    throw new Error('写入应用设置失败')
  }

  return updated
}

/** 日志脱敏：凭据字段只输出掩码 */
function redactSettings(data: Record<string, unknown>): string {
  const safe: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (/token|password|secret|key/i.test(key) && typeof value === 'string' && value) {
      safe[key] = maskSecret(value)
    } else {
      safe[key] = value
    }
  }
  return JSON.stringify(safe)
}
