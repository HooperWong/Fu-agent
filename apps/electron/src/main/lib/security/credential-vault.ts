/**
 * 凭据保险库
 *
 * 基于 Electron safeStorage 的凭据加密存储：
 * - Windows 上使用 DPAPI（与当前系统用户绑定），macOS 使用 Keychain
 * - 加密结果为 base64 字符串，带 "enc:v1:" 前缀，可安全存放在 settings.json
 * - safeStorage 不可用时降级返回 null，调用方决定回退策略（保持明文并提示）
 *
 * 与 .env 密钥服务的边界：.env 保存「需要注入 MCP 进程环境」的密钥（SAP 密码等），
 * 本模块保存「应用内部使用」的凭据（WOLAI Token 等），落盘前加密、读取时解密。
 */

import { safeStorage } from 'electron'

/** 加密值前缀，用于区分密文与历史遗留明文 */
const ENC_PREFIX = 'enc:v1:'

/** 判断字符串是否为本模块产生的密文 */
export function isEncryptedValue(value: string): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX)
}

/** safeStorage 是否可用于加密 */
export function isVaultAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/**
 * 加密明文凭据
 *
 * @returns 带前缀的 base64 密文；加密不可用时返回 null（调用方需回退明文）
 */
export function encryptCredential(plain: string): string | null {
  if (!plain) return null
  if (!isVaultAvailable()) return null

  try {
    return ENC_PREFIX + safeStorage.encryptString(plain).toString('base64')
  } catch (error) {
    console.error('[凭据保险库] 加密失败:', error)
    return null
  }
}

/**
 * 解密密文凭据
 *
 * @returns 明文；输入不是密文或解密失败时返回 null
 */
export function decryptCredential(value: string | undefined | null): string | null {
  if (!value || !isEncryptedValue(value)) return null

  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64'))
  } catch (error) {
    console.error('[凭据保险库] 解密失败（密文可能与当前系统用户不匹配）:', error)
    return null
  }
}
