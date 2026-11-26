/**
 * 本地文件存储底座
 *
 * 数据全部以 JSON / JSONL 落盘在 data/ 下，无数据库，便于整体拷贝迁移。
 * 提供原子写入与容错读取，供待办、日程、笔记、项目等模块复用。
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { dirname } from 'node:path'

/** 确保目录存在 */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * 原子写入文本
 *
 * 先写临时文件再重命名，避免进程中断产生半截文件。
 */
export function writeTextAtomic(filePath: string, content: string): void {
  ensureDir(dirname(filePath))
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, content, 'utf-8')
  renameSync(tmpPath, filePath)
}

/** 读取文本，文件不存在返回默认值 */
export function readText(filePath: string, fallback = ''): string {
  if (!existsSync(filePath)) return fallback
  return readFileSync(filePath, 'utf-8')
}

/**
 * 读取 JSON，文件缺失或损坏时返回默认值
 *
 * 损坏文件会被重命名为 .bak 保留现场，避免下次读取继续失败。
 */
export function readJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback

  try {
    const raw = readFileSync(filePath, 'utf-8').trim()
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch (error) {
    console.error(`[存储] JSON 解析失败，将使用默认值: ${filePath}`, error)
    try {
      rmSync(filePath, { force: true })
    } catch {
      // 忽略清理失败
    }
    return fallback
  }
}

/** 写入 JSON（2 空格缩进，原子写） */
export function writeJson(filePath: string, data: unknown): void {
  writeTextAtomic(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

/**
 * 读取 JSONL，逐行解析，坏行跳过
 */
export function readJsonl<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return []

  const items: T[] = []
  const lines = readFileSync(filePath, 'utf-8').split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      items.push(JSON.parse(trimmed) as T)
    } catch {
      console.warn(`[存储] 跳过无法解析的行: ${filePath}`)
    }
  }

  return items
}

/** 追加一行 JSONL */
export function appendJsonl(filePath: string, record: unknown): void {
  ensureDir(dirname(filePath))
  const line = `${JSON.stringify(record)}\n`

  if (existsSync(filePath)) {
    writeFileSync(filePath, line, { encoding: 'utf-8', flag: 'a' })
  } else {
    writeFileSync(filePath, line, 'utf-8')
  }
}

/** 用给定记录整体重写 JSONL */
export function replaceJsonl(filePath: string, records: unknown[]): void {
  const content = records.map((record) => JSON.stringify(record)).join('\n')
  writeTextAtomic(filePath, records.length > 0 ? `${content}\n` : '')
}
