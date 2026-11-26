/**
 * AgentHeader — Agent 会话头部
 *
 * 显示会话标题（可点击编辑），右侧提供会话操作按钮组（参考 ABAP Forge 对话框设计）：
 * 复制会话 / 派生探索副本 / 回退最近一轮 / 标记待办 / 沉淀到 WOLAI。
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import {
  Pencil, Check, X, NotebookPen, Loader2, ExternalLink,
  Copy, Telescope, Undo2, CircleCheckBig,
} from 'lucide-react'
import {
  currentAgentSessionAtom,
  agentSessionsAtom,
  currentAgentSessionIdAtom,
} from '@/atoms/agent-atoms'

export function AgentHeader(): React.ReactElement | null {
  const session = useAtomValue(currentAgentSessionAtom)
  const setAgentSessions = useSetAtom(agentSessionsAtom)
  const setCurrentSessionId = useSetAtom(currentAgentSessionIdAtom)
  const [editing, setEditing] = React.useState(false)
  const [editTitle, setEditTitle] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  /** 操作进行中标记（避免并发点击） */
  const [busy, setBusy] = React.useState<'deposit' | 'copy' | 'rollback' | null>(null)
  /** 沉淀状态 */
  const [depositUrl, setDepositUrl] = React.useState<string | null>(null)

  if (!session) return null

  /** 刷新会话列表 */
  const refreshSessions = async (): Promise<void> => {
    const sessions = await window.electronAPI.listAgentSessions()
    setAgentSessions(sessions)
  }

  /** 进入编辑模式 */
  const startEdit = (): void => {
    setEditTitle(session.title)
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  /** 保存标题 */
  const saveTitle = async (): Promise<void> => {
    const trimmed = editTitle.trim()
    if (!trimmed || trimmed === session.title) {
      setEditing(false)
      return
    }

    try {
      await window.electronAPI.updateAgentSessionTitle(session.id, trimmed)
      await refreshSessions()
    } catch (error) {
      console.error('[AgentHeader] 更新标题失败:', error)
    }
    setEditing(false)
  }

  /** 键盘事件 */
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveTitle()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  /** 将当前会话沉淀到 WOLAI */
  const handleDeposit = async (): Promise<void> => {
    if (busy === 'deposit') return

    if (depositUrl) {
      void window.electronAPI.openExternal(depositUrl)
      return
    }

    setBusy('deposit')
    try {
      const result = await window.electronAPI.depositSessionToWolai(session.id)
      if (result.ok && result.url) {
        setDepositUrl(result.url)
        toast.success('已沉淀到 WOLAI，点击按钮可打开')
      } else {
        toast.error(result.error ?? '沉淀失败，请检查 WOLAI Token 配置')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '沉淀失败')
    } finally {
      setBusy(null)
    }
  }

  /** 复制会话（普通副本 / 探索副本） */
  const handleDuplicate = async (mode: 'copy' | 'explore'): Promise<void> => {
    if (busy) return
    setBusy('copy')
    try {
      const next = await window.electronAPI.duplicateAgentSession(session.id, mode)
      await refreshSessions()
      setCurrentSessionId(next.id)
      toast.success(mode === 'explore' ? '已派生探索副本，原会话不受影响' : '已复制会话')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '复制会话失败')
    } finally {
      setBusy(null)
    }
  }

  /** 回退最近一轮对话（最后一条用户消息及其后的全部消息） */
  const handleRollback = async (): Promise<void> => {
    if (busy) return
    if (!confirm('回退会撤掉最近一轮问答（最后一条用户消息及其回复），且无法恢复。确定继续？')) return

    setBusy('rollback')
    try {
      const removed = await window.electronAPI.rollbackAgentSession(session.id)
      await refreshSessions()
      toast.success(`已回退，移除 ${removed} 条消息。下次发送将开启新的 SDK 会话衔接`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '回退失败')
    } finally {
      setBusy(null)
    }
  }

  /** 标记 / 取消待办 */
  const handleToggleTodo = async (): Promise<void> => {
    if (busy) return
    try {
      await window.electronAPI.setAgentSessionFlags(session.id, { isTodo: !session.isTodo })
      await refreshSessions()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '标记失败')
    }
  }

  /** 会话操作按钮（统一样式） */
  const actionButton = (
    key: string,
    title: string,
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    options?: { active?: boolean; disabled?: boolean; loading?: boolean },
  ): React.ReactElement => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      disabled={options?.disabled || Boolean(options?.loading)}
      title={title}
      className={
        'titlebar-no-drag flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors disabled:opacity-60 ' +
        (options?.active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground')
      }
    >
      {options?.loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {label && <span>{label}</span>}
    </button>
  )

  return (
    <div className="relative z-[51] flex items-center gap-1.5 px-4 h-[48px] titlebar-drag-region">
      {editing ? (
        <div className="flex items-center gap-1.5 flex-1 min-w-0 titlebar-no-drag">
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={saveTitle}
            className="flex-1 bg-transparent text-sm font-medium border-b border-primary/50 outline-none px-0 py-0.5 min-w-0"
            maxLength={100}
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={saveTitle}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setEditing(false)}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {session.isExplore && (
            <Telescope className="size-3.5 shrink-0 text-violet-500" />
          )}
          <span className="truncate text-sm font-medium text-foreground">
            {session.title}
          </span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={startEdit}
            className="titlebar-no-drag p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="编辑标题"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      )}

      {/* 复制会话 */}
      {actionButton('copy', '复制当前会话（消息完整拷贝到新会话）', <Copy className="size-3.5" />, '', () => void handleDuplicate('copy'), {
        loading: busy === 'copy',
      })}

      {/* 派生探索副本 */}
      {actionButton('explore', '派生探索副本：在新会话中随意追问，原会话不受影响', <Telescope className="size-3.5" />, '', () => void handleDuplicate('explore'), {
        active: session.isExplore === true,
        loading: busy === 'copy',
      })}

      {/* 回退最近一轮 */}
      {actionButton('rollback', '回退最近一轮问答（撤掉最后一条用户消息及其回复）', <Undo2 className="size-3.5" />, '', () => void handleRollback(), {
        loading: busy === 'rollback',
      })}

      {/* 标记待办 */}
      {actionButton(
        'todo',
        session.isTodo ? '取消待办标记' : '标记为待办（侧栏显示标记，稍后继续）',
        <CircleCheckBig className="size-3.5" />,
        '',
        () => void handleToggleTodo(),
        { active: session.isTodo === true },
      )}

      {/* 沉淀到 WOLAI */}
      {actionButton(
        'deposit',
        depositUrl ? '在 WOLAI 中打开' : '把本次会话精华沉淀到 WOLAI',
        depositUrl ? <ExternalLink className="size-3.5" /> : <NotebookPen className="size-3.5" />,
        depositUrl ? '已沉淀' : '沉淀到 WOLAI',
        () => void handleDeposit(),
        { loading: busy === 'deposit' },
      )}
    </div>
  )
}
