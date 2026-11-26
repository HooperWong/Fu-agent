/**
 * 效率模块服务
 *
 * 任务 / 待办 / 日程 / 项目：JSONL 落盘，通用增删改查
 * 定时任务：jobs.json 持久化 + node-cron 调度，执行记录写 runs.jsonl
 */

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { Notification } from 'electron'
import cron from 'node-cron'
import type { ScheduledTask } from 'node-cron'
import { getConfigDir } from '../config-paths'
import { getSettings } from '../settings-service'
import { readJsonl, replaceJsonl, readJson, writeJson, appendJsonl } from '../storage/json-store'
import type {
  Task,
  Todo,
  CalendarEvent,
  Project,
  ScheduledJob,
  SchedulerRun,
  TaskInput,
  TodoInput,
  EventInput,
  ProjectInput,
  JobInput,
} from '../../../types'

/** 带公共字段的实体 */
interface Entity {
  id: string
  createdAt: number
  updatedAt: number
}

/** 数据文件路径 */
const FILES = {
  tasks: (): string => join(getConfigDir(), 'tasks.jsonl'),
  todos: (): string => join(getConfigDir(), 'todos.jsonl'),
  events: (): string => join(getConfigDir(), 'calendar', 'events.jsonl'),
  projects: (): string => join(getConfigDir(), 'projects', 'projects.jsonl'),
  jobs: (): string => join(getConfigDir(), 'scheduler', 'jobs.json'),
  runs: (): string => join(getConfigDir(), 'scheduler', 'runs.jsonl'),
}

// ===== 通用 JSONL 增删改查 =====

function listAll<T>(file: string): T[] {
  return readJsonl<T>(file)
}

function createEntity<T extends Entity>(file: string, data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): T {
  const now = Date.now()
  const entity = { ...data, id: randomUUID(), createdAt: now, updatedAt: now } as T
  const items = listAll<T>(file)
  items.push(entity)
  replaceJsonl(file, items)
  return entity
}

function updateEntity<T extends Entity>(
  file: string,
  id: string,
  patch: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>
): T {
  const items = listAll<T>(file)
  const index = items.findIndex((item) => item.id === id)
  if (index < 0) throw new Error('记录不存在')

  const updated = { ...items[index], ...patch, updatedAt: Date.now() } as T
  items[index] = updated
  replaceJsonl(file, items)
  return updated
}

function removeEntity(file: string, id: string): void {
  const items = listAll<Entity>(file).filter((item) => item.id !== id)
  replaceJsonl(file, items)
}

// ===== 任务 =====

export function listTasks(): Task[] {
  return listAll<Task>(FILES.tasks()).sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return b.createdAt - a.createdAt
  })
}

export function createTask(input: TaskInput): Task {
  const title = input.title.trim()
  if (!title) throw new Error('任务标题不能为空')
  return createEntity<Task>(FILES.tasks(), {
    title,
    note: input.note?.trim() || '',
    projectId: input.projectId ?? null,
    priority: input.priority ?? 'medium',
    dueDate: input.dueDate ?? null,
    done: input.done ?? false,
  })
}

export function updateTask(id: string, patch: Partial<TaskInput>): Task {
  return updateEntity<Task>(FILES.tasks(), id, patch)
}

export function removeTask(id: string): void {
  removeEntity(FILES.tasks(), id)
}

// ===== 待办 =====

export function listTodos(): Todo[] {
  return listAll<Todo>(FILES.todos()).sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return b.createdAt - a.createdAt
  })
}

export function createTodo(input: TodoInput): Todo {
  const title = input.title.trim()
  if (!title) throw new Error('待办内容不能为空')
  return createEntity<Todo>(FILES.todos(), { title, done: input.done ?? false })
}

export function updateTodo(id: string, patch: Partial<TodoInput>): Todo {
  return updateEntity<Todo>(FILES.todos(), id, patch)
}

export function removeTodo(id: string): void {
  removeEntity(FILES.todos(), id)
}

// ===== 日程 =====

export function listEvents(): CalendarEvent[] {
  return listAll<CalendarEvent>(FILES.events()).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    return (a.startTime ?? '') < (b.startTime ?? '') ? -1 : 1
  })
}

export function createEvent(input: EventInput): CalendarEvent {
  const title = input.title.trim()
  if (!title) throw new Error('日程标题不能为空')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('日期格式应为 YYYY-MM-DD')

  return createEntity<CalendarEvent>(FILES.events(), {
    title,
    date: input.date,
    startTime: input.startTime || null,
    endTime: input.endTime || null,
    location: input.location?.trim() || '',
    note: input.note?.trim() || '',
  })
}

export function updateEvent(id: string, patch: Partial<EventInput>): CalendarEvent {
  return updateEntity<CalendarEvent>(FILES.events(), id, patch)
}

export function removeEvent(id: string): void {
  removeEntity(FILES.events(), id)
}

// ===== 项目 =====

export function listProjects(): Project[] {
  return listAll<Project>(FILES.projects()).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'done' ? 1 : -1
    return b.createdAt - a.createdAt
  })
}

export function createProject(input: ProjectInput): Project {
  const name = input.name.trim()
  if (!name) throw new Error('项目名称不能为空')

  return createEntity<Project>(FILES.projects(), {
    name,
    description: input.description?.trim() || '',
    status: input.status ?? 'active',
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
  })
}

export function updateProject(id: string, patch: Partial<ProjectInput>): Project {
  return updateEntity<Project>(FILES.projects(), id, patch)
}

export function removeProject(id: string): void {
  removeEntity(FILES.projects(), id)
}

// ===== 定时任务 =====

/** 已注册的 cron 任务 */
const timers = new Map<string, ScheduledTask>()

function readJobs(): ScheduledJob[] {
  return readJson<ScheduledJob[]>(FILES.jobs(), [])
}

function writeJobs(jobs: ScheduledJob[]): void {
  writeJson(FILES.jobs(), jobs)
}

export function listJobs(): ScheduledJob[] {
  const jobs = readJobs()
  return jobs.map((job) => ({ ...job, nextRunAt: getNextRun(job) }))
}

/** 计算下次执行时间（仅内存展示，不落盘） */
function getNextRun(job: ScheduledJob): number | null {
  if (!job.enabled) return null
  const task = timers.get(job.id)
  if (!task) return null
  try {
    const next = task.getNextRun()
    return next ? next.getTime() : null
  } catch {
    return null
  }
}

function scheduleJob(job: ScheduledJob): void {
  stopJob(job.id)
  if (!job.enabled) return

  if (!cron.validate(job.cron)) {
    console.warn(`[定时任务] 非法的 cron 表达式，已跳过: ${job.name} (${job.cron})`)
    return
  }

  const task = cron.schedule(job.cron, () => {
    runJob(job.id).catch((error) => {
      console.error(`[定时任务] 执行失败: ${job.name}`, error)
    })
  })
  timers.set(job.id, task)
}

function stopJob(id: string): void {
  const task = timers.get(id)
  if (task) {
    task.stop()
    timers.delete(id)
  }
}

/** 执行一次任务（`run-now` 与 cron 触发共用） */
export async function runJob(id: string): Promise<SchedulerRun> {
  const jobs = readJobs()
  const job = jobs.find((item) => item.id === id)
  if (!job) throw new Error('定时任务不存在')

  const run: SchedulerRun = {
    id: randomUUID(),
    jobId: job.id,
    jobName: job.name,
    startedAt: Date.now(),
    ok: true,
  }

  try {
    if (!getSettings().notificationsEnabled) {
      run.message = '已跳过：桌面通知已关闭'
    } else if (Notification.isSupported()) {
      new Notification({ title: `Fu Agent 提醒 · ${job.name}`, body: job.payload }).show()
      run.message = '已发送系统提醒'
    } else {
      run.message = '系统不支持通知'
    }
  } catch (error) {
    run.ok = false
    run.message = error instanceof Error ? error.message : '执行失败'
  }

  appendJsonl(FILES.runs(), run)

  job.lastRunAt = Date.now()
  job.updatedAt = Date.now()
  writeJobs(jobs)

  console.log(`[定时任务] 已执行: ${job.name}`)
  return run
}

export function createJob(input: JobInput): ScheduledJob {
  const name = input.name.trim()
  const payload = input.payload.trim()
  if (!name) throw new Error('任务名称不能为空')
  if (!payload) throw new Error('提醒内容不能为空')
  if (!cron.validate(input.cron)) throw new Error('cron 表达式不合法，例如：0 9 * * *')

  const now = Date.now()
  const job: ScheduledJob = {
    id: randomUUID(),
    name,
    cron: input.cron.trim(),
    type: input.type ?? 'reminder',
    payload,
    enabled: input.enabled ?? true,
    lastRunAt: null,
    createdAt: now,
    updatedAt: now,
  }

  const jobs = readJobs()
  jobs.push(job)
  writeJobs(jobs)
  scheduleJob(job)
  return job
}

export function updateJob(id: string, patch: Partial<JobInput>): ScheduledJob {
  const jobs = readJobs()
  const index = jobs.findIndex((item) => item.id === id)
  const current = jobs[index]
  if (index < 0 || !current) throw new Error('定时任务不存在')

  if (patch.cron && !cron.validate(patch.cron)) {
    throw new Error('cron 表达式不合法，例如：0 9 * * *')
  }

  const updated: ScheduledJob = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  }
  jobs[index] = updated
  writeJobs(jobs)
  scheduleJob(updated)
  return updated
}

export function removeJob(id: string): void {
  stopJob(id)
  writeJobs(readJobs().filter((job) => job.id !== id))
}

/** 应用启动时加载已启用的定时任务 */
export function initScheduler(): void {
  const jobs = readJobs()
  let count = 0

  for (const job of jobs) {
    if (job.enabled) {
      scheduleJob(job)
      count += 1
    }
  }

  if (count > 0) {
    console.log(`[定时任务] 已加载 ${count} 个启用的任务`)
  }
}
