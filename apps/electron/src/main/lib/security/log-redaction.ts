/**
 * 日志脱敏
 *
 * 安全底线：日志、审计记录中不得出现明文密钥。
 * 该模块做两件事：
 * 1. redactText / maskSecret 提供字符串级脱敏
 * 2. installLogRedaction 全局接管 console，所有日志输出前统一过滤
 */

import { format } from 'node:util'

/** 需要在日志中隐去的已知密钥值（由 secret-service 注册） */
const knownSecrets = new Set<string>()

/** 注册一个需要脱敏的密钥值（长度过短的值跳过，避免误伤普通文本） */
export function registerSecretValue(value: string | null | undefined): void {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.length < 6) return
  knownSecrets.add(trimmed)
}

/** 清空已注册密钥（.env 变更后重新注册用） */
export function clearRegisteredSecrets(): void {
  knownSecrets.clear()
}

/**
 * 密钥掩码：保留前 4 位与后 4 位，中间用 * 代替
 * 例如 sk-kScZ9...3zb3 → sk-k****3zb3
 */
export function maskSecret(value: string): string {
  const v = value.trim()
  if (v.length <= 8) return '********'
  return `${v.slice(0, 4)}****${v.slice(-4)}`
}

/** 文本脱敏规则（顺序敏感：先处理带引号的结构化输出） */
const REDACT_RULES: Array<[RegExp, string]> = [
  // Authorization: Bearer xxx
  [/(Bearer\s+)[A-Za-z0-9\-._~+/]{8,}=*/gi, '$1***'],
  // OpenAI / DeepSeek 风格 sk- 密钥
  [/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-***'],
  // Slack token
  [/\bxox[baprs]-[A-Za-z0-9-]{6,}\b/gi, 'xox*-***'],
  // JSON / inspect 风格：token: 'xxx'、"password": "xxx"
  [
    /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|pwd|authorization)["']?\s*[:=]\s*)(["'])([^"'\n]{4,})\2/gi,
    '$1$2***$2',
  ],
  // 无引号赋值：password=xxx、SAP_PASSWORD=xxx
  [/((?:password|passwd|pwd|token|secret|api[_-]?key)\s*=\s*)([^\s"'&,;}]{4,})/gi, '$1***'],
  // URL 查询参数：?token=xxx&key=xxx
  [/([?&](?:token|key|secret|password|access_token)=)[^&\s]+/gi, '$1***'],
]

/**
 * 对文本做脱敏
 *
 * @param text 原始文本
 * @returns 脱敏后的文本
 */
export function redactText(text: string): string {
  let result = text

  for (const [pattern, replacement] of REDACT_RULES) {
    result = result.replace(pattern, replacement)
  }

  // 已知密钥值整体替换（长的先替换，避免部分匹配残留）
  const values = Array.from(knownSecrets).sort((a, b) => b.length - a.length)
  for (const value of values) {
    if (result.includes(value)) {
      result = result.split(value).join(maskSecret(value))
    }
  }

  return result
}

/** 对任意值做脱敏（对象会先转字符串再过滤） */
export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactText(value)
  if (value instanceof Error) {
    return redactText(value.stack || value.message)
  }
  if (value && typeof value === 'object') {
    try {
      return redactText(JSON.stringify(value))
    } catch {
      return value
    }
  }
  return value
}

/** 是否已安装日志脱敏 */
let installed = false

/**
 * 全局接管 console 输出
 *
 * 所有日志在打印前统一走 redactText，确保任何模块（包括第三方库）
 * 都不会把明文密钥写进控制台/日志文件。
 */
export function installLogRedaction(): void {
  if (installed) return
  installed = true

  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const

  for (const method of methods) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      try {
        original(redactText(format(...args)))
      } catch {
        // 脱敏失败时退化为原始输出内容，但绝不让异常中断调用方
        original(...args)
      }
    }
  }
}
