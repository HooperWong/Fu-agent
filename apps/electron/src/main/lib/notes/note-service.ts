/**
 * 笔记服务
 *
 * 存储结构（全部在 data/notes 下，随仓库迁移）：
 * - notes.json        笔记元数据
 * - groups.json       分组
 * - content/<id>.md   笔记正文（Markdown）
 * - assets/           图片等附件，通过 fu-asset:// 协议在应用内展示
 */

import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import MiniSearch from 'minisearch'
import { getConfigDir } from '../config-paths'
import { ensureDir, readJson, writeJson, readText, writeTextAtomic } from '../storage/json-store'
import type {
  Note,
  NoteMeta,
  NoteInput,
  NoteGroup,
  NoteGroupInput,
  NoteSearchResult,
} from '../../../types'

/** 笔记根目录 */
function notesDir(): string {
  const dir = join(getConfigDir(), 'notes')
  ensureDir(dir)
  return dir
}

function contentDir(): string {
  const dir = join(notesDir(), 'content')
  ensureDir(dir)
  return dir
}

/** 附件目录（同时用于 fu-asset 协议读取） */
export function getNoteAssetsDir(): string {
  const dir = join(notesDir(), 'assets')
  ensureDir(dir)
  return dir
}

function notesFile(): string {
  return join(notesDir(), 'notes.json')
}

function groupsFile(): string {
  return join(notesDir(), 'groups.json')
}

function contentFile(id: string): string {
  return join(contentDir(), `${id}.md`)
}

// ===== 内部工具 =====

/** 生成摘要：去掉 Markdown 标记，截取前 110 字 */
function buildExcerpt(content: string): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.slice(0, 110)
}

function readMetas(): NoteMeta[] {
  return readJson<NoteMeta[]>(notesFile(), [])
}

function writeMetas(metas: NoteMeta[]): void {
  writeJson(notesFile(), metas)
}

function readGroups(): NoteGroup[] {
  return readJson<NoteGroup[]>(groupsFile(), [])
}

function writeGroups(groups: NoteGroup[]): void {
  writeJson(groupsFile(), groups)
}

// ===== 笔记 CRUD =====

export function listNotes(): NoteMeta[] {
  return readMetas().sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt - a.updatedAt
  })
}

export function getNote(id: string): Note | null {
  const meta = readMetas().find((item) => item.id === id)
  if (!meta) return null
  return { ...meta, content: readText(contentFile(id), '') }
}

export function createNote(input: NoteInput = {}): Note {
  const id = randomUUID()
  const now = Date.now()
  const content = input.content ?? ''
  const meta: NoteMeta = {
    id,
    title: input.title?.trim() || '未命名笔记',
    groupId: input.groupId ?? null,
    pinned: input.pinned ?? false,
    excerpt: buildExcerpt(content),
    createdAt: now,
    updatedAt: now,
  }

  writeTextAtomic(contentFile(id), content)
  const metas = readMetas()
  metas.push(meta)
  writeMetas(metas)

  return { ...meta, content }
}

export function updateNote(id: string, patch: NoteInput): Note {
  const metas = readMetas()
  const index = metas.findIndex((item) => item.id === id)
  const current = metas[index]
  if (index < 0 || !current) throw new Error('笔记不存在')

  let content: string | undefined
  if (patch.content !== undefined) {
    content = patch.content
    writeTextAtomic(contentFile(id), content)
  }

  const updated: NoteMeta = {
    ...current,
    title: patch.title !== undefined ? patch.title.trim() || '未命名笔记' : current.title,
    groupId: patch.groupId !== undefined ? patch.groupId : current.groupId,
    pinned: patch.pinned !== undefined ? patch.pinned : current.pinned,
    excerpt: content !== undefined ? buildExcerpt(content) : current.excerpt,
    updatedAt: Date.now(),
  }

  metas[index] = updated
  writeMetas(metas)

  return { ...updated, content: content ?? readText(contentFile(id), '') }
}

export function removeNote(id: string): void {
  const file = contentFile(id)
  if (existsSync(file)) unlinkSync(file)
  writeMetas(readMetas().filter((item) => item.id !== id))
}

// ===== 分组 =====

export function listGroups(): NoteGroup[] {
  return readGroups().sort((a, b) => a.createdAt - b.createdAt)
}

export function createGroup(input: NoteGroupInput): NoteGroup {
  const name = input.name.trim()
  if (!name) throw new Error('分组名称不能为空')

  const now = Date.now()
  const group: NoteGroup = {
    id: randomUUID(),
    name,
    parentId: input.parentId ?? null,
    createdAt: now,
    updatedAt: now,
  }

  const groups = readGroups()
  groups.push(group)
  writeGroups(groups)
  return group
}

export function updateGroup(id: string, patch: Partial<NoteGroupInput>): NoteGroup {
  const groups = readGroups()
  const index = groups.findIndex((item) => item.id === id)
  const current = groups[index]
  if (index < 0 || !current) throw new Error('分组不存在')

  if (patch.parentId && patch.parentId === id) {
    throw new Error('分组不能设为自己的上级')
  }

  const updated: NoteGroup = {
    ...current,
    name: patch.name !== undefined ? patch.name.trim() || current.name : current.name,
    parentId: patch.parentId !== undefined ? patch.parentId : current.parentId,
    updatedAt: Date.now(),
  }

  groups[index] = updated
  writeGroups(groups)
  return updated
}

/** 删除分组：笔记与子分组上移到父级，不丢内容 */
export function removeGroup(id: string): void {
  const groups = readGroups()
  const target = groups.find((item) => item.id === id)
  if (!target) return

  const nextGroups = groups
    .filter((item) => item.id !== id)
    .map((item) => (item.parentId === id ? { ...item, parentId: target.parentId } : item))
  writeGroups(nextGroups)

  const metas = readMetas().map((item) =>
    item.groupId === id ? { ...item, groupId: target.parentId } : item
  )
  writeMetas(metas)
}

// ===== 搜索 =====

/** 生成命中片段 */
function buildSnippet(content: string, query: string): string {
  const plain = content.replace(/\s+/g, ' ')
  const lower = plain.toLowerCase()
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0)

  let hit = -1
  for (const token of tokens) {
    hit = lower.indexOf(token)
    if (hit >= 0) break
  }

  if (hit < 0) return plain.slice(0, 100)

  const start = Math.max(0, hit - 35)
  const end = Math.min(plain.length, hit + 75)
  return `${start > 0 ? '…' : ''}${plain.slice(start, end)}${end < plain.length ? '…' : ''}`
}

export function searchNotes(query: string): NoteSearchResult[] {
  const keyword = query.trim()
  if (!keyword) return []

  const docs = readMetas().map((meta) => ({
    ...meta,
    content: readText(contentFile(meta.id), ''),
  }))

  const index = new MiniSearch<(typeof docs)[number]>({
    fields: ['title', 'content'],
    storeFields: ['id'],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      boost: { title: 2 },
    },
  })
  index.addAll(docs)

  const hits = index.search(keyword).slice(0, 40)
  const metaMap = new Map(readMetas().map((meta) => [meta.id, meta]))

  return hits
    .map((hit) => {
      const meta = metaMap.get(String(hit.id))
      if (!meta) return null
      const doc = docs.find((item) => item.id === meta.id)
      return { note: meta, snippet: buildSnippet(doc?.content ?? '', keyword) }
    })
    .filter((item): item is NoteSearchResult => item !== null)
}

// ===== 图片导入 =====

/**
 * 导入图片到附件目录
 *
 * @returns 可直接插入 Markdown 的图片语法
 */
export function importNoteImage(fileName: string, dataUrl: string): string {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('图片数据格式不正确')

  const ext = (extname(fileName) || '.png').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.png'
  const safeName = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`
  const buffer = Buffer.from(match[2] ?? '', 'base64')

  const filePath = join(getNoteAssetsDir(), safeName)
  writeFileSync(filePath, buffer)

  const alt = basename(fileName, extname(fileName)) || 'image'
  return `![${alt}](fu-asset://${safeName})`
}
