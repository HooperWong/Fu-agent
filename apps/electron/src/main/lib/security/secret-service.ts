/**
 * 密钥服务
 *
 * 安全底线：
 * - 密钥只存放于应用根目录的 .env（已 gitignore），不写入 data/、不入库、不入日志
 * - 渲染进程只能拿到「是否已配置 + 掩码值」，永远拿不到明文
 * - 写入 .env 时保留原有注释与其他条目
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { getEnvPath } from '../config-paths'
import type { SecretStatus } from '../../../types'
import { maskSecret, registerSecretValue, clearRegisteredSecrets } from './log-redaction'

/** 内置可配置密钥（key 必须与 .env 中的变量名一致） */
const KNOWN_SECRETS: Array<{ key: string; description: string }> = [
  { key: 'WOLAI_TOKEN', description: 'WOLAI 个人访问令牌（笔记同步）' },
  { key: 'SAP_QAS300_USER', description: 'SAP QAS 300 登录账号' },
  { key: 'SAP_QAS300_PASSWORD', description: 'SAP QAS 300 登录密码' },
]

/** .env 中的键值（仅主进程内存） */
const envValues = new Map<string, string>()

/** 是否已加载 */
let loaded = false

/** 解析 .env 文本为键值对（支持 # 注释、export 前缀、引号包裹） */
function parseEnv(content: string): Array<[string, string]> {
  const entries: Array<[string, string]> = []

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line
    const eqIndex = withoutExport.indexOf('=')
    if (eqIndex <= 0) continue

    const key = withoutExport.slice(0, eqIndex).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue

    let value = withoutExport.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    entries.push([key, value])
  }

  return entries
}

/**
 * 加载 .env 到内存与 process.env
 *
 * 应用启动时调用一次。已存在的进程环境变量优先，不被 .env 覆盖。
 */
export function loadDotEnv(): void {
  loaded = true
  clearRegisteredSecrets()
  envValues.clear()

  const envPath = getEnvPath()
  if (!existsSync(envPath)) {
    console.log('[密钥] 未找到 .env，跳过加载')
    return
  }

  try {
    const entries = parseEnv(readFileSync(envPath, 'utf-8'))
    let count = 0

    for (const [key, value] of entries) {
      if (!value) continue
      envValues.set(key, value)
      // 密钥值注册到日志脱敏器
      if (/(TOKEN|PASSWORD|SECRET|KEY)/i.test(key)) {
        registerSecretValue(value)
      }
      if (!process.env[key]) {
        process.env[key] = value
      }
      count += 1
    }

    console.log(`[密钥] 已从 .env 加载 ${count} 项配置`)
  } catch (error) {
    console.error('[密钥] 读取 .env 失败:', error)
  }
}

/** 确保 .env 已加载 */
function ensureLoaded(): void {
  if (!loaded) loadDotEnv()
}

/**
 * 读取密钥明文（仅主进程内部使用，禁止直接返回给渲染进程）
 */
export function getSecret(key: string): string | undefined {
  ensureLoaded()
  const fromEnv = process.env[key]
  if (fromEnv) return fromEnv
  return envValues.get(key)
}

/** 要求密钥必须存在，否则抛错（错误信息中不含密钥值） */
export function requireSecret(key: string): string {
  const value = getSecret(key)
  if (!value) {
    throw new Error(`缺少必要配置：${key}，请在 .env 或 设置 → 安全 中配置`)
  }
  return value
}

/** 是否存在该密钥 */
export function hasSecret(key: string): boolean {
  return Boolean(getSecret(key))
}

/** 替换字符串中的 ${VAR} 引用 */
export function resolveEnvRefs<T>(input: T): T {
  if (typeof input === 'string') {
    return input.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, key: string) => {
      const value = getSecret(key)
      return value ?? match
    }) as unknown as T
  }

  if (Array.isArray(input)) {
    return input.map((item) => resolveEnvRefs(item)) as unknown as T
  }

  if (input && typeof input === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      result[key] = resolveEnvRefs(value)
    }
    return result as T
  }

  return input
}

/**
 * 获取密钥状态列表（给设置页展示，不含明文）
 */
export function getSecretStatuses(): SecretStatus[] {
  ensureLoaded()

  return KNOWN_SECRETS.map(({ key, description }) => {
    const value = getSecret(key)
    return {
      key,
      description,
      configured: Boolean(value),
      masked: value ? maskSecret(value) : null,
    }
  })
}

/**
 * 写入密钥到 .env
 *
 * - 已存在的同名条目就地替换，其余行（含注释）原样保留
 * - 传空字符串表示删除该条目
 */
export function setSecret(key: string, value: string): SecretStatus[] {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error('非法的密钥名称')
  }

  ensureLoaded()

  const envPath = getEnvPath()
  const content = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : ''
  const lines = content.split(/\r?\n/)
  const nextLines: string[] = []
  let replaced = false

  for (const line of lines) {
    const trimmed = line.trim()
    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed
    const eqIndex = withoutExport.indexOf('=')

    if (eqIndex > 0 && withoutExport.slice(0, eqIndex).trim() === key) {
      if (!replaced) {
        if (value) nextLines.push(`${key}=${value}`)
        replaced = true
      }
      continue
    }

    nextLines.push(line)
  }

  if (!replaced && value) {
    // 追加到末尾，前面留一个空行便于阅读
    const lastLine = nextLines[nextLines.length - 1] ?? ''
    if (nextLines.length > 0 && lastLine.trim() !== '') {
      nextLines.push('')
    }
    nextLines.push(`${key}=${value}`)
  }

  // 去掉文件末尾多余空行
  while (nextLines.length > 0 && (nextLines[nextLines.length - 1] ?? '').trim() === '') {
    nextLines.pop()
  }

  try {
    writeFileSync(envPath, `${nextLines.join('\n')}\n`, 'utf-8')
  } catch (error) {
    console.error('[密钥] 写入 .env 失败:', error)
    throw new Error('写入 .env 失败，请检查文件权限')
  }

  // 同步内存与进程环境
  if (value) {
    envValues.set(key, value)
    process.env[key] = value
    if (/(TOKEN|PASSWORD|SECRET|KEY)/i.test(key)) registerSecretValue(value)
  } else {
    envValues.delete(key)
    delete process.env[key]
  }

  console.log(`[密钥] 已更新 ${key}（值不落日志）`)
  return getSecretStatuses()
}
