/**
 * NotesView - 笔记模块
 *
 * 三栏布局：分组 / 笔记列表 / 编辑器
 * - 数据通过 window.electronAPI.notes 读写，落盘在 data/notes/
 * - Markdown 编辑 + 预览，支持粘贴图片（自动保存到 assets 并插入 fu-asset:// 链接）
 * - 全文搜索由主进程 minisearch 完成
 */

import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  NotebookPen,
  Plus,
  Search,
  Trash2,
  Pin,
  PinOff,
  Eye,
  Pencil,
  FolderPlus,
  MoreHorizontal,
  Link2,
  Files,
  Inbox,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { NoteGroup, NoteMeta, NoteSearchResult } from '../../../types'

// ===== 工具 =====

/** 时间戳 → 简短时间 */
function formatTime(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

/** 当前分组筛选 */
type GroupFilter = 'all' | 'ungrouped' | string

// ===== 分组树 =====

interface GroupNode {
  group: NoteGroup
  children: GroupNode[]
}

function buildGroupTree(groups: NoteGroup[]): GroupNode[] {
  const map = new Map<string, GroupNode>()
  for (const group of groups) map.set(group.id, { group, children: [] })

  const roots: GroupNode[] = []
  for (const group of groups) {
    const node = map.get(group.id)
    if (!node) continue
    const parent = group.parentId ? map.get(group.parentId) : null
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

function GroupBranch({
  node,
  depth,
  filter,
  counts,
  renaming,
  onSelect,
  onCreateChild,
  onStartRename,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onRemove,
}: {
  node: GroupNode
  depth: number
  filter: GroupFilter
  counts: Map<string, number>
  renaming: { id: string; name: string } | null
  onSelect: (id: string) => void
  onCreateChild: (id: string) => void
  onStartRename: (group: NoteGroup) => void
  onRenameChange: (name: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  onRemove: (group: NoteGroup) => void
}): React.ReactElement {
  const { group, children } = node
  const active = filter === group.id
  const isRenaming = renaming?.id === group.id

  return (
    <>
      {isRenaming ? (
        <div style={{ paddingLeft: 8 + depth * 14 }} className="py-0.5 pr-1">
          <Input
            autoFocus
            value={renaming.name}
            className="h-7 text-xs"
            onChange={(event) => onRenameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onRenameCommit()
              if (event.key === 'Escape') onRenameCancel()
            }}
            onBlur={onRenameCommit}
          />
        </div>
      ) : (
        <div
          className={cn(
            'group flex items-center gap-1 rounded-md pr-1',
            active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          <button
            onClick={() => onSelect(group.id)}
            className="flex-1 flex items-center gap-1.5 py-1.5 text-[13px] text-left truncate"
          >
            <ChevronRight
              size={12}
              className={cn('flex-shrink-0 opacity-40', children.length === 0 && 'invisible')}
            />
            <span className="truncate">{group.name}</span>
            <span className="ml-auto text-[11px] opacity-50">{counts.get(group.id) ?? 0}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-foreground/10"
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal size={13} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onCreateChild(group.id)}>新建子分组</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onStartRename(group)}>重命名</DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={() => onRemove(group)}>
                删除分组
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {children.map((child) => (
        <GroupBranch
          key={child.group.id}
          node={child}
          depth={depth + 1}
          filter={filter}
          counts={counts}
          renaming={renaming}
          onSelect={onSelect}
          onCreateChild={onCreateChild}
          onStartRename={onStartRename}
          onRenameChange={onRenameChange}
          onRenameCommit={onRenameCommit}
          onRenameCancel={onRenameCancel}
          onRemove={onRemove}
        />
      ))}
    </>
  )
}

// ===== 主组件 =====

export function NotesView(): React.ReactElement {
  const [metas, setMetas] = React.useState<NoteMeta[]>([])
  const [groups, setGroups] = React.useState<NoteGroup[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [title, setTitle] = React.useState('')
  const [content, setContent] = React.useState('')
  const [preview, setPreview] = React.useState(false)
  const [savedAt, setSavedAt] = React.useState<number | null>(null)

  /** 分组筛选 */
  const [filter, setFilter] = React.useState<GroupFilter>('all')
  /** 新建分组：父级 + 输入框 */
  const [groupDraft, setGroupDraft] = React.useState<{ parentId: string | null; name: string } | null>(null)
  /** 重命名分组：id + 输入框 */
  const [renameDraft, setRenameDraft] = React.useState<{ id: string; name: string } | null>(null)

  /** 搜索 */
  const [query, setQuery] = React.useState('')
  const [searchResults, setSearchResults] = React.useState<NoteSearchResult[] | null>(null)

  const dirtyRef = React.useRef(false)
  const draftRef = React.useRef({ title: '', content: '' })
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    draftRef.current = { title, content }
  }, [title, content])

  /** 初次加载 */
  const reloadNotes = React.useCallback(async (): Promise<NoteMeta[]> => {
    const list = await window.electronAPI.notes.list()
    setMetas(list)
    return list
  }, [])

  const reloadGroups = React.useCallback(async (): Promise<void> => {
    const list = await window.electronAPI.notes.groups.list()
    setGroups(list)
  }, [])

  React.useEffect(() => {
    void (async () => {
      try {
        const [list] = await Promise.all([reloadNotes(), reloadGroups()])
        const first = list[0]
        if (first) await openNote(first.id)
      } catch (error) {
        console.error('[笔记] 加载失败:', error)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 打开笔记（先落盘当前未保存内容） */
  const openNote = async (id: string): Promise<void> => {
    await flushSave()
    const note = await window.electronAPI.notes.get(id)
    if (!note) return
    dirtyRef.current = false
    setSelectedId(id)
    setTitle(note.title)
    setContent(note.content)
    setSavedAt(note.updatedAt)
  }

  /** 立即保存当前笔记 */
  const flushSave = async (): Promise<void> => {
    if (!selectedId || !dirtyRef.current) return

    const draft = draftRef.current
    dirtyRef.current = false
    try {
      const updated = await window.electronAPI.notes.update(selectedId, {
        title: draft.title,
        content: draft.content,
      })
      setSavedAt(updated.updatedAt)
      setMetas((prev) =>
        prev.map((item) =>
          item.id === updated.id
            ? {
                id: updated.id,
                title: updated.title,
                groupId: updated.groupId,
                pinned: updated.pinned,
                excerpt: updated.excerpt,
                createdAt: updated.createdAt,
                updatedAt: updated.updatedAt,
              }
            : item
        )
      )
    } catch (error) {
      dirtyRef.current = true
      console.error('[笔记] 保存失败:', error)
    }
  }

  /** 自动保存（600ms 防抖） */
  React.useEffect(() => {
    if (!selectedId || !dirtyRef.current) return
    const timer = setTimeout(() => {
      void flushSave()
    }, 600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, selectedId])

  /** 搜索（250ms 防抖） */
  React.useEffect(() => {
    const keyword = query.trim()
    if (!keyword) {
      setSearchResults(null)
      return
    }
    const timer = setTimeout(() => {
      window.electronAPI.notes
        .search(keyword)
        .then(setSearchResults)
        .catch((error) => console.error('[笔记] 搜索失败:', error))
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  /** 新建笔记 */
  const handleCreate = async (): Promise<void> => {
    try {
      const note = await window.electronAPI.notes.create({
        title: '',
        content: '',
        groupId: filter !== 'all' && filter !== 'ungrouped' ? filter : null,
      })
      await reloadNotes()
      await openNote(note.id)
      setQuery('')
      setPreview(false)
    } catch (error) {
      console.error('[笔记] 新建失败:', error)
    }
  }

  /** 删除当前笔记 */
  const handleRemove = async (): Promise<void> => {
    if (!selectedId) return
    const target = metas.find((item) => item.id === selectedId)
    const ok = window.confirm(`确定删除笔记「${target?.title ?? '未命名笔记'}」？删除后无法恢复。`)
    if (!ok) return

    try {
      await window.electronAPI.notes.remove(selectedId)
      dirtyRef.current = false
      const list = await reloadNotes()
      const next = list[0]
      setSelectedId(null)
      setTitle('')
      setContent('')
      if (next) await openNote(next.id)
    } catch (error) {
      console.error('[笔记] 删除失败:', error)
    }
  }

  /** 切换置顶 */
  const handleTogglePin = async (): Promise<void> => {
    if (!selectedId) return
    const target = metas.find((item) => item.id === selectedId)
    if (!target) return

    try {
      await window.electronAPI.notes.update(selectedId, { pinned: !target.pinned })
      await reloadNotes()
    } catch (error) {
      console.error('[笔记] 置顶失败:', error)
    }
  }

  /** 移动笔记到分组 */
  const handleMoveGroup = async (value: string): Promise<void> => {
    if (!selectedId) return
    try {
      await window.electronAPI.notes.update(selectedId, { groupId: value === 'none' ? null : value })
      await reloadNotes()
    } catch (error) {
      console.error('[笔记] 移动分组失败:', error)
    }
  }

  /** 提交新建分组 */
  const handleCreateGroup = async (): Promise<void> => {
    if (!groupDraft) return
    const name = groupDraft.name.trim()
    if (!name) {
      setGroupDraft(null)
      return
    }
    try {
      const group = await window.electronAPI.notes.groups.create({
        name,
        parentId: groupDraft.parentId,
      })
      await reloadGroups()
      setGroupDraft(null)
      setFilter(group.id)
    } catch (error) {
      console.error('[笔记] 新建分组失败:', error)
    }
  }

  /** 提交分组重命名 */
  const handleCommitRename = async (): Promise<void> => {
    if (!renameDraft) return
    const name = renameDraft.name.trim()
    const group = groups.find((item) => item.id === renameDraft.id)
    setRenameDraft(null)
    if (!name || !group || name === group.name) return

    try {
      await window.electronAPI.notes.groups.update(group.id, { name })
      await reloadGroups()
    } catch (error) {
      console.error('[笔记] 重命名分组失败:', error)
    }
  }

  /** 删除分组（笔记自动上移） */
  const handleRemoveGroup = async (group: NoteGroup): Promise<void> => {
    const ok = window.confirm(`确定删除分组「${group.name}」？分组内笔记会移动到上一级，不会删除。`)
    if (!ok) return
    try {
      await window.electronAPI.notes.groups.remove(group.id)
      if (filter === group.id) setFilter('all')
      await Promise.all([reloadGroups(), reloadNotes()])
    } catch (error) {
      console.error('[笔记] 删除分组失败:', error)
    }
  }

  /** 粘贴图片到编辑器 */
  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>): Promise<void> => {
    const item = Array.from(event.clipboardData.items).find((entry) =>
      entry.type.startsWith('image/')
    )
    if (!item || !selectedId) return

    const file = item.getAsFile()
    if (!file) return

    event.preventDefault()
    try {
      const dataUrl = await readFileAsDataUrl(file)
      const markdown = await window.electronAPI.notes.importImage(
        selectedId,
        file.name || 'image.png',
        dataUrl
      )
      const textarea = textareaRef.current
      const start = textarea?.selectionStart ?? content.length
      const end = textarea?.selectionEnd ?? content.length
      const next = `${content.slice(0, start)}${markdown}${content.slice(end)}`
      dirtyRef.current = true
      setContent(next)
      if (textarea) {
        requestAnimationFrame(() => {
          const pos = start + markdown.length
          textarea.focus()
          textarea.setSelectionRange(pos, pos)
        })
      }
    } catch (error) {
      console.error('[笔记] 插入图片失败:', error)
    }
  }

  /** 在光标处插入链接语法 */
  const handleInsertLink = (): void => {
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? content.length
    const end = textarea?.selectionEnd ?? content.length
    const selected = content.slice(start, end)
    const label = selected || '链接文字'
    const snippet = `[${label}](https://)`
    const next = `${content.slice(0, start)}${snippet}${content.slice(end)}`
    dirtyRef.current = true
    setContent(next)
    if (textarea) {
      requestAnimationFrame(() => {
        const pos = start + snippet.length
        textarea.focus()
        textarea.setSelectionRange(pos, pos)
      })
    }
  }

  /** 分组笔记数 */
  const groupCounts = React.useMemo(() => {
    const counts = new Map<string, number>()
    let ungrouped = 0
    for (const meta of metas) {
      if (!meta.groupId) ungrouped += 1
      else counts.set(meta.groupId, (counts.get(meta.groupId) ?? 0) + 1)
    }
    return { counts, ungrouped }
  }, [metas])

  const groupTree = React.useMemo(() => buildGroupTree(groups), [groups])

  /** 列表数据：搜索优先，其次按分组筛选 */
  const listItems = React.useMemo(() => {
    if (searchResults) return searchResults.map((item) => item.note)
    if (filter === 'all') return metas
    if (filter === 'ungrouped') return metas.filter((item) => !item.groupId)
    return metas.filter((item) => item.groupId === filter)
  }, [metas, filter, searchResults])

  const snippetMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const item of searchResults ?? []) map.set(item.note.id, item.snippet)
    return map
  }, [searchResults])

  const currentMeta = metas.find((item) => item.id === selectedId)
  const isEmpty = !selectedId

  return (
    <div className="flex h-full">
      {/* 左栏：搜索 + 分组 */}
      <div className="w-[210px] flex-shrink-0 border-r border-border/50 flex flex-col pt-14">
        <div className="px-3 pb-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索笔记"
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>

        <div className="px-2 pb-1 flex items-center justify-between">
          <span className="text-[11px] font-medium text-foreground/40 px-2">分组</span>
          <button
            onClick={() => setGroupDraft({ parentId: null, name: '' })}
            className="p-1 rounded text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            title="新建分组"
          >
            <FolderPlus size={13} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3 scrollbar-none">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[13px]',
              filter === 'all'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50'
            )}
          >
            <Files size={13} />
            <span>全部笔记</span>
            <span className="ml-auto text-[11px] opacity-50">{metas.length}</span>
          </button>
          <button
            onClick={() => setFilter('ungrouped')}
            className={cn(
              'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[13px]',
              filter === 'ungrouped'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50'
            )}
          >
            <Inbox size={13} />
            <span>未分组</span>
            <span className="ml-auto text-[11px] opacity-50">{groupCounts.ungrouped}</span>
          </button>

          <div className="mt-1">
            {groupTree.map((node) => (
              <GroupBranch
                key={node.group.id}
                node={node}
                depth={0}
                filter={filter}
                counts={groupCounts.counts}
                renaming={renameDraft}
                onSelect={setFilter}
                onCreateChild={(parentId) => setGroupDraft({ parentId, name: '' })}
                onStartRename={(group) => setRenameDraft({ id: group.id, name: group.name })}
                onRenameChange={(name) =>
                  setRenameDraft((prev) => (prev ? { ...prev, name } : prev))
                }
                onRenameCommit={() => void handleCommitRename()}
                onRenameCancel={() => setRenameDraft(null)}
                onRemove={handleRemoveGroup}
              />
            ))}
          </div>

          {groupDraft && (
            <div className="mt-1 px-1">
              <Input
                autoFocus
                value={groupDraft.name}
                placeholder={groupDraft.parentId ? '子分组名称' : '分组名称'}
                className="h-7 text-xs"
                onChange={(event) =>
                  setGroupDraft((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleCreateGroup()
                  if (event.key === 'Escape') setGroupDraft(null)
                }}
                onBlur={() => void handleCreateGroup()}
              />
            </div>
          )}
        </div>
      </div>

      {/* 中栏：笔记列表 */}
      <div className="w-[250px] flex-shrink-0 border-r border-border/50 flex flex-col pt-14">
        <div className="px-3 pb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium text-foreground/40">
            {searchResults ? `搜索到 ${searchResults.length} 条` : `共 ${listItems.length} 条`}
          </span>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={handleCreate}>
            <Plus size={13} />
            新建
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-none">
          {listItems.length === 0 && (
            <div className="py-14 text-center text-xs text-muted-foreground">
              {searchResults ? '没有匹配的笔记' : '暂无笔记'}
            </div>
          )}
          {listItems.map((meta) => {
            const active = meta.id === selectedId
            const snippet = snippetMap.get(meta.id)
            return (
              <button
                key={meta.id}
                onClick={() => void openNote(meta.id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 border-b border-border/40 transition-colors',
                  active ? 'bg-muted/70' : 'hover:bg-muted/40'
                )}
              >
                <div className="flex items-center gap-1.5">
                  {meta.pinned && <Pin size={11} className="flex-shrink-0 text-amber-500" />}
                  <span className="flex-1 truncate text-[13px] font-medium">{meta.title}</span>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                    {formatTime(meta.updatedAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                  {snippet || meta.excerpt || '空笔记'}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* 右栏：编辑器 */}
      <div className="flex-1 flex flex-col pt-14 min-w-0">
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <NotebookPen size={28} className="opacity-40" />
            <p className="text-sm">选择或新建一条笔记</p>
            <Button size="sm" variant="outline" className="mt-1 gap-1" onClick={handleCreate}>
              <Plus size={13} />
              新建笔记
            </Button>
          </div>
        ) : (
          <>
            <div className="px-6 pb-2 flex items-center gap-2">
              <Input
                value={title}
                onChange={(event) => {
                  dirtyRef.current = true
                  setTitle(event.target.value)
                }}
                placeholder="笔记标题"
                className="flex-1 h-9 border-none bg-transparent px-0 text-base font-semibold shadow-none focus-visible:ring-0"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground"
                title={currentMeta?.pinned ? '取消置顶' : '置顶'}
                onClick={() => void handleTogglePin()}
              >
                {currentMeta?.pinned ? <PinOff size={14} /> : <Pin size={14} />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground"
                title={preview ? '编辑' : '预览'}
                onClick={() => setPreview((prev) => !prev)}
              >
                {preview ? <Pencil size={14} /> : <Eye size={14} />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-red-600"
                title="删除笔记"
                onClick={() => void handleRemove()}
              >
                <Trash2 size={14} />
              </Button>
            </div>

            <div className="px-6 pb-3 flex items-center gap-3 text-[11px] text-muted-foreground border-b border-border/50">
              <Select
                value={currentMeta?.groupId ?? 'none'}
                onValueChange={(value) => void handleMoveGroup(value)}
              >
                <SelectTrigger className="h-7 w-[150px] text-xs">
                  <SelectValue placeholder="选择分组" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未分组</SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!preview && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px] gap-1"
                  onClick={handleInsertLink}
                >
                  <Link2 size={12} />
                  插入链接
                </Button>
              )}
              <span className="ml-auto">
                {savedAt ? `已保存 ${formatTime(savedAt)}` : '尚未保存'}
              </span>
            </div>

            {preview ? (
              <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-none">
                <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || '*空笔记*'}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={(event) => {
                  dirtyRef.current = true
                  setContent(event.target.value)
                }}
                onPaste={(event) => void handlePaste(event)}
                placeholder="开始记录…支持 Markdown，直接粘贴图片即可插入"
                className="flex-1 resize-none border-none rounded-none bg-transparent px-6 py-4 text-sm leading-6 shadow-none focus-visible:ring-0 scrollbar-none"
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
