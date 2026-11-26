/**
 * 极简 ZIP 写入器（无第三方依赖）
 *
 * 仅支持应用内迁移包场景：deflate 压缩、UTF-8 文件名、单文件 < 4GB。
 * 不处理 ZIP64、加密、目录条目，解压端（资源管理器 / Expand-Archive）可正常识别。
 */

import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { deflateRawSync } from 'node:zlib'

/** 单个文件大小上限（ZIP 非 ZIP64 格式限制） */
const MAX_ENTRY_SIZE = 0xffffffff

/** CRC32 查表 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** 转换为 MS-DOS 日期时间格式 */
function toDosTime(date: Date): { time: number; date: number } {
  const year = Math.max(date.getFullYear(), 1980)
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

interface ZipEntry {
  name: Buffer
  crc: number
  compressedSize: number
  uncompressedSize: number
  time: number
  date: number
  offset: number
}

export interface ZipWriteOptions {
  /** 文件过滤器，返回 false 则跳过 */
  filter?: (absolutePath: string) => boolean
  /** 追加内存中的文本/二进制条目（如备份清单） */
  extraEntries?: Array<{ name: string; data: string | Buffer }>
  /** 追加外部文件（如 .env），name 为压缩包内名称 */
  extraFiles?: Array<{ name: string; path: string }>
}

/**
 * 将目录压缩为单个 ZIP 文件
 *
 * 只读取源目录，不修改源文件；失败时由调用方清理半成品。
 */
export async function createZipFromDirectory(
  sourceDir: string,
  targetPath: string,
  options: ZipWriteOptions = {},
): Promise<{ fileCount: number }> {
  const targetDir = dirname(targetPath)
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })

  const out = createWriteStream(targetPath)
  let writeError: Error | null = null
  out.on('error', (error) => {
    writeError = error
  })

  const write = (buffer: Buffer): Promise<void> =>
    new Promise((resolvePromise, rejectPromise) => {
      if (writeError) {
        rejectPromise(writeError)
        return
      }
      if (out.write(buffer)) {
        resolvePromise()
        return
      }
      out.once('drain', () => resolvePromise())
    })

  const entries: ZipEntry[] = []
  let offset = 0
  let fileCount = 0

  /** 写入一个文件条目 */
  const appendEntry = async (name: string, data: Buffer, mtime: Date): Promise<void> => {
    if (data.length > MAX_ENTRY_SIZE) {
      throw new Error(`文件过大（超过 4GB），暂不支持：${name}`)
    }

    const nameBuffer = Buffer.from(name, 'utf8')
    const compressed = deflateRawSync(data, { level: 6 })
    const crc = crc32(data)
    const { time, date } = toDosTime(mtime)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // UTF-8 文件名
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuffer.length, 26)
    local.writeUInt16LE(0, 28)

    entries.push({
      name: nameBuffer,
      crc,
      compressedSize: compressed.length,
      uncompressedSize: data.length,
      time,
      date,
      offset,
    })

    await write(local)
    await write(nameBuffer)
    await write(compressed)
    offset += local.length + nameBuffer.length + compressed.length
    fileCount += 1
  }

  /** 递归收集并写入目录内容 */
  const walk = async (current: string, prefix: string): Promise<void> => {
    const items = await readdir(current, { withFileTypes: true })

    for (const item of items) {
      const fullPath = join(current, item.name)
      if (options.filter && !options.filter(fullPath)) continue

      if (item.isDirectory()) {
        await walk(fullPath, prefix ? `${prefix}/${item.name}` : item.name)
      } else if (item.isFile()) {
        const info = await stat(fullPath)
        const data = await readFile(fullPath)
        await appendEntry(prefix ? `${prefix}/${item.name}` : item.name, data, info.mtime)
      }
    }
  }

  await walk(sourceDir, '')

  for (const entry of options.extraFiles ?? []) {
    const info = await stat(entry.path)
    await appendEntry(entry.name, await readFile(entry.path), info.mtime)
  }

  const now = new Date()
  for (const entry of options.extraEntries ?? []) {
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8')
    await appendEntry(entry.name, data, now)
  }

  // 中央目录
  const centralStart = offset
  for (const entry of entries) {
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(0x0800, 8)
    header.writeUInt16LE(8, 10)
    header.writeUInt16LE(entry.time, 12)
    header.writeUInt16LE(entry.date, 14)
    header.writeUInt32LE(entry.crc, 16)
    header.writeUInt32LE(entry.compressedSize, 20)
    header.writeUInt32LE(entry.uncompressedSize, 24)
    header.writeUInt16LE(entry.name.length, 28)
    header.writeUInt16LE(0, 30)
    header.writeUInt16LE(0, 32)
    header.writeUInt16LE(0, 34)
    header.writeUInt16LE(0, 36)
    header.writeUInt32LE(0, 38)
    header.writeUInt32LE(entry.offset, 42)

    await write(header)
    await write(entry.name)
    offset += header.length + entry.name.length
  }

  const centralSize = offset - centralStart
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(centralStart, 16)
  eocd.writeUInt16LE(0, 20)

  await write(eocd)

  await new Promise<void>((resolvePromise, rejectPromise) => {
    out.end(() => {
      if (writeError) rejectPromise(writeError)
      else resolvePromise()
    })
  })

  return { fileCount }
}
