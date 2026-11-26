/**
 * 效率模块类型与 IPC 通道
 *
 * 覆盖：任务、待办、日程、项目、定时任务。
 * 数据全部落盘在 data/ 下的 JSONL / JSON，可随仓库整体迁移。
 */

/** 优先级 */
export type Priority = 'low' | 'medium' | 'high'

/** 任务（新建任务） */
export interface Task {
  id: string
  title: string
  note?: string
  /** 关联项目 id */
  projectId?: string | null
  priority: Priority
  /** 截止日期 YYYY-MM-DD */
  dueDate?: string | null
  done: boolean
  createdAt: number
  updatedAt: number
}

/** 待办（轻量清单） */
export interface Todo {
  id: string
  title: string
  done: boolean
  createdAt: number
  updatedAt: number
}

/** 日程事件 */
export interface CalendarEvent {
  id: string
  title: string
  /** 日期 YYYY-MM-DD */
  date: string
  /** 开始时间 HH:mm，全天事件为空 */
  startTime?: string | null
  endTime?: string | null
  location?: string
  note?: string
  createdAt: number
  updatedAt: number
}

/** 项目状态 */
export type ProjectStatus = 'active' | 'paused' | 'done'

/** 项目 */
export interface Project {
  id: string
  name: string
  description?: string
  status: ProjectStatus
  /** 开始日期 YYYY-MM-DD */
  startDate?: string | null
  /** 结束日期 YYYY-MM-DD */
  endDate?: string | null
  createdAt: number
  updatedAt: number
}

/** 定时任务类型：提醒（系统通知）；预留 agent / hotspot 由后续里程碑接入 */
export type ScheduledJobType = 'reminder'

/** 定时任务 */
export interface ScheduledJob {
  id: string
  name: string
  /** 标准 5 段 cron 表达式 */
  cron: string
  type: ScheduledJobType
  /** 提醒内容 */
  payload: string
  enabled: boolean
  lastRunAt?: number | null
  /** 下次执行时间（运行时计算，仅内存展示） */
  nextRunAt?: number | null
  createdAt: number
  updatedAt: number
}

/** 定时任务执行记录 */
export interface SchedulerRun {
  id: string
  jobId: string
  jobName: string
  startedAt: number
  ok: boolean
  message?: string
}

// ===== 输入类型（渲染进程 / 主进程共用） =====

export interface TaskInput {
  title: string
  note?: string
  projectId?: string | null
  priority?: Priority
  dueDate?: string | null
  done?: boolean
}

export interface TodoInput {
  title: string
  done?: boolean
}

export interface EventInput {
  title: string
  date: string
  startTime?: string | null
  endTime?: string | null
  location?: string
  note?: string
}

export interface ProjectInput {
  name: string
  description?: string
  status?: ProjectStatus
  startDate?: string | null
  endDate?: string | null
}

export interface JobInput {
  name: string
  cron: string
  type?: ScheduledJobType
  payload: string
  enabled?: boolean
}

/** 效率模块 IPC 通道 */
export const EFFICIENCY_IPC_CHANNELS = {
  TASKS_LIST: 'tasks:list',
  TASKS_CREATE: 'tasks:create',
  TASKS_UPDATE: 'tasks:update',
  TASKS_REMOVE: 'tasks:remove',

  TODOS_LIST: 'todos:list',
  TODOS_CREATE: 'todos:create',
  TODOS_UPDATE: 'todos:update',
  TODOS_REMOVE: 'todos:remove',

  EVENTS_LIST: 'calendar:list',
  EVENTS_CREATE: 'calendar:create',
  EVENTS_UPDATE: 'calendar:update',
  EVENTS_REMOVE: 'calendar:remove',

  PROJECTS_LIST: 'projects:list',
  PROJECTS_CREATE: 'projects:create',
  PROJECTS_UPDATE: 'projects:update',
  PROJECTS_REMOVE: 'projects:remove',

  JOBS_LIST: 'scheduler:list',
  JOBS_CREATE: 'scheduler:create',
  JOBS_UPDATE: 'scheduler:update',
  JOBS_REMOVE: 'scheduler:remove',
  JOBS_RUN_NOW: 'scheduler:run-now',
} as const
