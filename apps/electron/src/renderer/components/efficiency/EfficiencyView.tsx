/**
 * EfficiencyView - 效率模块视图
 *
 * 包含：任务、待办、日程、项目管理、定时任务。
 * 数据通过 preload 暴露的 window.electronAPI.efficiency 读写，落盘在 data/。
 */

import * as React from 'react'
import {
  ListTodo,
  CheckSquare,
  CalendarDays,
  FolderKanban,
  Clock,
  Plus,
  Trash2,
  Play,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type {
  Task,
  Todo,
  CalendarEvent,
  Project,
  ScheduledJob,
  Priority,
  ProjectStatus,
} from '../../../types'

// ===== 通用工具 =====

/** 本地日期 YYYY-MM-DD */
function todayString(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** 日期标签：今天 / 明天 / 原始日期 */
function dateLabel(date: string): string {
  const today = todayString()
  if (date === today) return '今天'
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  if (date === tomorrowStr) return '明天'
  return date
}

/** 时间戳 → 中文时间 */
function formatTime(ts?: number | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

const PRIORITY_LABELS: Record<Priority, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

const PRIORITY_STYLES: Record<Priority, string> = {
  high: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  low: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20',
}

const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: '进行中',
  paused: '已暂停',
  done: '已完成',
}

/** 页面骨架 */
function PageShell({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pt-14 pb-4 border-b border-border/50">
        <h1 className="text-base font-semibold flex items-center gap-2">
          {icon}
          {title}
        </h1>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-5 scrollbar-none">{children}</div>
    </div>
  )
}

/** 空状态 */
function EmptyHint({ text }: { text: string }): React.ReactElement {
  return <div className="py-12 text-center text-sm text-muted-foreground">{text}</div>
}

/** 顶部新建表单容器 */
function FormCard({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4 mb-5 space-y-3">{children}</div>
  )
}

/** 列表行容器 */
function ListCard({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="rounded-xl border border-border/60 divide-y divide-border/50">{children}</div>
  )
}

/** 列表行 */
function Row({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}): React.ReactElement {
  return (
    <div className={cn('group flex items-center gap-3 px-4 py-3 hover:bg-muted/30', className)}>
      {children}
    </div>
  )
}

/** 删除按钮 */
function DeleteButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
      title="删除"
    >
      <Trash2 size={15} />
    </button>
  )
}

/** 加载数据的小 hook */
function useList<T>(load: () => Promise<T[]>): [T[], () => Promise<void>] {
  const [items, setItems] = React.useState<T[]>([])

  const reload = React.useCallback(async (): Promise<void> => {
    try {
      setItems(await load())
    } catch (error) {
      console.error('[效率] 加载失败:', error)
    }
  }, [load])

  React.useEffect(() => {
    void reload()
  }, [reload])

  return [items, reload]
}

// ===== 任务 =====

function TasksPage(): React.ReactElement {
  const api = window.electronAPI.efficiency
  const [tasks, reloadTasks] = useList<Task>(React.useCallback(() => api.tasks.list(), [api]))
  const [projects] = useList<Project>(React.useCallback(() => api.projects.list(), [api]))

  const [title, setTitle] = React.useState('')
  const [note, setNote] = React.useState('')
  const [priority, setPriority] = React.useState<Priority>('medium')
  const [dueDate, setDueDate] = React.useState('')
  const [projectId, setProjectId] = React.useState<string>('none')

  const handleCreate = async (): Promise<void> => {
    if (!title.trim()) return
    await api.tasks.create({
      title,
      note,
      priority,
      dueDate: dueDate || null,
      projectId: projectId === 'none' ? null : projectId,
    })
    setTitle('')
    setNote('')
    setDueDate('')
    await reloadTasks()
  }

  const projectName = (id?: string | null): string | undefined =>
    projects.find((project) => project.id === id)?.name

  const openTasks = tasks.filter((task) => !task.done)

  return (
    <PageShell
      icon={<ListTodo size={18} className="text-primary" />}
      title="新建任务"
      description="记录工作项，关联项目与截止日期；数据保存在 data/tasks.jsonl"
    >
      <FormCard>
        <div className="flex gap-2">
          <Input
            placeholder="任务标题，回车快速创建"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate()
            }}
          />
          <Button onClick={() => void handleCreate()} disabled={!title.trim()}>
            <Plus size={15} className="mr-1" /> 添加
          </Button>
        </div>
        <div className="grid grid-cols-[1fr_140px_130px_150px] gap-2">
          <Input placeholder="备注（可选）" value={note} onChange={(e) => setNote(e.target.value)} />
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger>
              <SelectValue placeholder="关联项目" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">不关联项目</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={(value) => setPriority(value as Priority)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">高优先级</SelectItem>
              <SelectItem value="medium">中优先级</SelectItem>
              <SelectItem value="low">低优先级</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            title="截止日期"
          />
        </div>
      </FormCard>

      {tasks.length === 0 ? (
        <EmptyHint text="还没有任务，从上方添加第一条" />
      ) : (
        <ListCard>
          {tasks.map((task) => (
            <Row key={task.id}>
              <button
                onClick={() => {
                  void api.tasks.update(task.id, { done: !task.done }).then(reloadTasks)
                }}
                className={cn(
                  'w-[18px] h-[18px] rounded-full border flex items-center justify-center shrink-0',
                  task.done
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-border hover:border-primary'
                )}
              >
                {task.done && <Check size={12} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className={cn('text-sm truncate', task.done && 'line-through text-muted-foreground')}>
                  {task.title}
                </div>
                {task.note && (
                  <div className="text-xs text-muted-foreground truncate mt-0.5">{task.note}</div>
                )}
              </div>
              {projectName(task.projectId) && (
                <Badge variant="outline" className="text-[11px] shrink-0">
                  {projectName(task.projectId)}
                </Badge>
              )}
              <Badge
                variant="outline"
                className={cn('text-[11px] shrink-0', PRIORITY_STYLES[task.priority])}
              >
                {PRIORITY_LABELS[task.priority]}
              </Badge>
              {task.dueDate && (
                <span className="text-xs text-muted-foreground shrink-0">{task.dueDate}</span>
              )}
              <DeleteButton
                onClick={() => {
                  void api.tasks.remove(task.id).then(reloadTasks)
                }}
              />
            </Row>
          ))}
        </ListCard>
      )}

      {openTasks.length > 0 && (
        <div className="text-xs text-muted-foreground mt-3">待完成 {openTasks.length} 项</div>
      )}
    </PageShell>
  )
}

// ===== 待办 =====

function TodosPage(): React.ReactElement {
  const api = window.electronAPI.efficiency
  const [todos, reload] = useList<Todo>(React.useCallback(() => api.todos.list(), [api]))
  const [title, setTitle] = React.useState('')

  const handleCreate = async (): Promise<void> => {
    if (!title.trim()) return
    await api.todos.create({ title })
    setTitle('')
    await reload()
  }

  const open = todos.filter((todo) => !todo.done)
  const done = todos.filter((todo) => todo.done)

  const renderItem = (todo: Todo): React.ReactElement => (
    <Row key={todo.id}>
      <button
        onClick={() => void api.todos.update(todo.id, { done: !todo.done }).then(reload)}
        className={cn(
          'w-[18px] h-[18px] rounded-full border flex items-center justify-center shrink-0',
          todo.done
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-border hover:border-primary'
        )}
      >
        {todo.done && <Check size={12} />}
      </button>
      <span className={cn('text-sm flex-1 truncate', todo.done && 'line-through text-muted-foreground')}>
        {todo.title}
      </span>
      <span className="text-xs text-muted-foreground shrink-0">{formatTime(todo.createdAt)}</span>
      <DeleteButton onClick={() => void api.todos.remove(todo.id).then(reload)} />
    </Row>
  )

  return (
    <PageShell
      icon={<CheckSquare size={18} className="text-primary" />}
      title="待办"
      description="轻量清单，回车快速添加；数据保存在 data/todos.jsonl"
    >
      <FormCard>
        <div className="flex gap-2">
          <Input
            placeholder="要做什么？回车添加"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate()
            }}
          />
          <Button onClick={() => void handleCreate()} disabled={!title.trim()}>
            <Plus size={15} className="mr-1" /> 添加
          </Button>
        </div>
      </FormCard>

      {todos.length === 0 && <EmptyHint text="暂无待办" />}

      {open.length > 0 && (
        <div className="mb-5">
          <div className="text-xs font-medium text-muted-foreground mb-2">未完成 · {open.length}</div>
          <ListCard>{open.map(renderItem)}</ListCard>
        </div>
      )}

      {done.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">已完成 · {done.length}</div>
          <ListCard>{done.map(renderItem)}</ListCard>
        </div>
      )}
    </PageShell>
  )
}

// ===== 日程 =====

function CalendarPage(): React.ReactElement {
  const api = window.electronAPI.efficiency
  const [events, reload] = useList<CalendarEvent>(
    React.useCallback(() => api.calendar.list(), [api])
  )

  const [title, setTitle] = React.useState('')
  const [date, setDate] = React.useState(todayString())
  const [startTime, setStartTime] = React.useState('')
  const [endTime, setEndTime] = React.useState('')
  const [location, setLocation] = React.useState('')

  const handleCreate = async (): Promise<void> => {
    if (!title.trim() || !date) return
    await api.calendar.create({ title, date, startTime, endTime, location })
    setTitle('')
    setStartTime('')
    setEndTime('')
    setLocation('')
    await reload()
  }

  const grouped = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const list = map.get(event.date) ?? []
      list.push(event)
      map.set(event.date, list)
    }
    return Array.from(map.entries())
  }, [events])

  return (
    <PageShell
      icon={<CalendarDays size={18} className="text-primary" />}
      title="日程"
      description="按日期记录安排；数据保存在 data/calendar/events.jsonl"
    >
      <FormCard>
        <div className="flex gap-2">
          <Input
            placeholder="日程标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate()
            }}
          />
          <Button onClick={() => void handleCreate()} disabled={!title.trim()}>
            <Plus size={15} className="mr-1" /> 添加
          </Button>
        </div>
        <div className="grid grid-cols-[150px_130px_130px_1fr] gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} title="开始时间" />
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} title="结束时间" />
          <Input placeholder="地点（可选）" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
      </FormCard>

      {events.length === 0 && <EmptyHint text="暂无日程安排" />}

      <div className="space-y-5">
        {grouped.map(([groupDate, list]) => (
          <div key={groupDate}>
            <div className="text-xs font-medium text-muted-foreground mb-2">
              {dateLabel(groupDate)} · {list.length} 项
            </div>
            <ListCard>
              {list.map((event) => (
                <Row key={event.id}>
                  <span className="text-xs tabular-nums text-muted-foreground w-[92px] shrink-0">
                    {event.startTime
                      ? `${event.startTime}${event.endTime ? ` - ${event.endTime}` : ''}`
                      : '全天'}
                  </span>
                  <span className="text-sm flex-1 truncate">{event.title}</span>
                  {event.location && (
                    <span className="text-xs text-muted-foreground shrink-0">{event.location}</span>
                  )}
                  <DeleteButton
                    onClick={() => void api.calendar.remove(event.id).then(reload)}
                  />
                </Row>
              ))}
            </ListCard>
          </div>
        ))}
      </div>
    </PageShell>
  )
}

// ===== 项目管理 =====

function ProjectsPage(): React.ReactElement {
  const api = window.electronAPI.efficiency
  const [projects, reload] = useList<Project>(
    React.useCallback(() => api.projects.list(), [api])
  )

  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [status, setStatus] = React.useState<ProjectStatus>('active')
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')

  const handleCreate = async (): Promise<void> => {
    if (!name.trim()) return
    await api.projects.create({ name, description, status, startDate: startDate || null, endDate: endDate || null })
    setName('')
    setDescription('')
    setStartDate('')
    setEndDate('')
    await reload()
  }

  return (
    <PageShell
      icon={<FolderKanban size={18} className="text-primary" />}
      title="项目管理"
      description="项目可在任务中关联；数据保存在 data/projects/projects.jsonl"
    >
      <FormCard>
        <div className="flex gap-2">
          <Input
            placeholder="项目名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate()
            }}
          />
          <Button onClick={() => void handleCreate()} disabled={!name.trim()}>
            <Plus size={15} className="mr-1" /> 添加
          </Button>
        </div>
        <Textarea
          placeholder="项目描述（可选）"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
        <div className="grid grid-cols-[1fr_160px_150px_150px] gap-2">
          <div />
          <Select value={status} onValueChange={(value) => setStatus(value as ProjectStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">进行中</SelectItem>
              <SelectItem value="paused">已暂停</SelectItem>
              <SelectItem value="done">已完成</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} title="开始日期" />
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} title="结束日期" />
        </div>
      </FormCard>

      {projects.length === 0 ? (
        <EmptyHint text="还没有项目" />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group rounded-xl border border-border/60 p-4 hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium flex-1 truncate">{project.name}</span>
                <Badge variant="outline" className="text-[11px]">
                  {PROJECT_STATUS_LABELS[project.status]}
                </Badge>
                <DeleteButton
                  onClick={() => void api.projects.remove(project.id).then(reload)}
                />
              </div>
              {project.description && (
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{project.description}</p>
              )}
              <div className="text-xs text-muted-foreground mt-2">
                {project.startDate || project.endDate
                  ? `${project.startDate ?? '—'} ~ ${project.endDate ?? '—'}`
                  : '未设置周期'}
              </div>
              <div className="mt-3">
                <Select
                  value={project.status}
                  onValueChange={(value) => {
                    void api.projects
                      .update(project.id, { status: value as ProjectStatus })
                      .then(reload)
                  }}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">进行中</SelectItem>
                    <SelectItem value="paused">已暂停</SelectItem>
                    <SelectItem value="done">已完成</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  )
}

// ===== 定时任务 =====

/** 常用 cron 预设 */
const CRON_PRESETS: Array<{ label: string; value: string }> = [
  { label: '每天 09:00', value: '0 9 * * *' },
  { label: '每小时', value: '0 * * * *' },
  { label: '每周一 09:00', value: '0 9 * * 1' },
  { label: '工作日 18:00', value: '0 18 * * 1-5' },
]

function SchedulerPage(): React.ReactElement {
  const api = window.electronAPI.efficiency
  const [jobs, reload] = useList<ScheduledJob>(
    React.useCallback(() => api.scheduler.list(), [api])
  )

  const [name, setName] = React.useState('')
  const [cronExpr, setCronExpr] = React.useState('0 9 * * *')
  const [payload, setPayload] = React.useState('')

  const handleCreate = async (): Promise<void> => {
    if (!name.trim() || !payload.trim()) return
    await api.scheduler.create({ name, cron: cronExpr, payload, enabled: true })
    setName('')
    setPayload('')
    await reload()
  }

  return (
    <PageShell
      icon={<Clock size={18} className="text-primary" />}
      title="定时任务"
      description="到点发送系统通知；关掉应用后不再触发。数据保存在 data/scheduler/"
    >
      <FormCard>
        <div className="flex gap-2">
          <Input placeholder="任务名称，如：每日站会提醒" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            placeholder="cron 表达式"
            value={cronExpr}
            onChange={(e) => setCronExpr(e.target.value)}
            className="w-[160px] font-mono"
          />
          <Button onClick={() => void handleCreate()} disabled={!name.trim() || !payload.trim()}>
            <Plus size={15} className="mr-1" /> 添加
          </Button>
        </div>
        <Input
          placeholder="提醒内容，如：整理今日 MM 采购流程问题"
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          {CRON_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => setCronExpr(preset.value)}
              className={cn(
                'px-2 py-1 rounded-md text-[11px] border transition-colors',
                cronExpr === preset.value
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/60 text-muted-foreground hover:text-foreground'
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </FormCard>

      {jobs.length === 0 ? (
        <EmptyHint text="还没有定时任务" />
      ) : (
        <ListCard>
          {jobs.map((job) => (
            <Row key={job.id}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{job.name}</span>
                  <Badge variant="outline" className="text-[11px] font-mono">
                    {job.cron}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">{job.payload}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  下次：{formatTime(job.nextRunAt)} · 上次：{formatTime(job.lastRunAt)}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void api.scheduler.runNow(job.id).then(reload)}
                title="立即执行一次"
              >
                <Play size={14} />
              </Button>
              <Switch
                checked={job.enabled}
                onCheckedChange={(checked) => {
                  void api.scheduler.update(job.id, { enabled: checked }).then(reload)
                }}
              />
              <DeleteButton onClick={() => void api.scheduler.remove(job.id).then(reload)} />
            </Row>
          ))}
        </ListCard>
      )}
    </PageShell>
  )
}

// ===== 视图路由 =====

export type EfficiencyViewKind = 'tasks' | 'todos' | 'calendar' | 'projects' | 'scheduler'

export function EfficiencyView({ kind }: { kind: EfficiencyViewKind }): React.ReactElement {
  switch (kind) {
    case 'tasks':
      return <TasksPage />
    case 'todos':
      return <TodosPage />
    case 'calendar':
      return <CalendarPage />
    case 'projects':
      return <ProjectsPage />
    case 'scheduler':
      return <SchedulerPage />
  }
}
