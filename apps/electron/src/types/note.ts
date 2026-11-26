/**
 * 笔记模块类型与 IPC 通道
 *
 * 笔记内容以 Markdown 文件存放（data/notes/content/<id>.md），
 * 元数据存 data/notes/notes.json，分组存 data/notes/groups.json，
 * 图片等附件放 data/notes/assets/，整体可随仓库迁移。
 */

/** 笔记分组（支持一级嵌套） */
export interface NoteGroup {
  id: string
  name: string
  /** 上级分组，null 表示根分组 */
  parentId: string | null
  createdAt: number
  updatedAt: number
}

/** 笔记元数据（不含正文） */
export interface NoteMeta {
  id: string
  title: string
  groupId: string | null
  pinned: boolean
  /** 正文摘要，用于列表展示 */
  excerpt: string
  createdAt: number
  updatedAt: number
}

/** 笔记完整内容 */
export interface Note extends NoteMeta {
  content: string
}

/** 笔记创建 / 更新入参 */
export interface NoteInput {
  title?: string
  content?: string
  groupId?: string | null
  pinned?: boolean
}

/** 分组创建 / 更新入参 */
export interface NoteGroupInput {
  name: string
  parentId?: string | null
}

/** 搜索结果 */
export interface NoteSearchResult {
  note: NoteMeta
  /** 命中片段 */
  snippet: string
}

/** 笔记模块 IPC 通道 */
export const NOTE_IPC_CHANNELS = {
  NOTES_LIST: 'notes:list',
  NOTES_GET: 'notes:get',
  NOTES_CREATE: 'notes:create',
  NOTES_UPDATE: 'notes:update',
  NOTES_REMOVE: 'notes:remove',
  NOTES_SEARCH: 'notes:search',
  NOTES_IMPORT_IMAGE: 'notes:import-image',
  GROUPS_LIST: 'notes:groups:list',
  GROUPS_CREATE: 'notes:groups:create',
  GROUPS_UPDATE: 'notes:groups:update',
  GROUPS_REMOVE: 'notes:groups:remove',
} as const
