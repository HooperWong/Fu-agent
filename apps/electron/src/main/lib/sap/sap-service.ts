/**
 * SAP 多环境服务（arc-1 MCP）
 *
 * - 环境配置落盘 data/sap/environments.json
 * - 密码只写 .env（SAP_<CODE>_PASSWORD），JSON 只存 hasPassword
 * - 注入工作区 mcp.json 时密码使用 ${SAP_<CODE>_PASSWORD} 引用，主进程启动 MCP 前再解析
 * - 默认只读：SAP_ALLOW_WRITES=false + 完整写操作禁用列表
 */

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { cp, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import { getConfigDir } from '../config-paths'
import { ensureDir, readJson, writeJson } from '../storage/json-store'
import { hasSecret, setSecret } from '../security/secret-service'
import {
  getWorkspaceMcpConfig,
  saveWorkspaceMcpConfig,
  listAgentWorkspaces,
} from '../agent-workspace-manager'
import type { McpServerEntry } from '@proma/shared'
import type {
  SapEnvironment,
  SapEnvironmentInput,
  SapImportResult,
  SapRuntimeStatus,
  SapVendorResult,
  SapWorkspaceBinding,
} from '../../../types'

/**
 * 数据目录占位符
 *
 * 复制到应用数据目录的运行文件路径以此开头存储，迁移 data/ 后仍然有效。
 */
const DATA_TOKEN = '${FU_DATA_DIR}/'

/** 只读模式禁用列表（来自 arc-1 官方配置） */
const READ_ONLY_DENY_ACTIONS = [
  'SAPWrite',
  'SAPActivate',
  'SAPTransport.create',
  'SAPTransport.release',
  'SAPTransport.release_recursive',
  'SAPTransport.reassign',
  'SAPTransport.delete',
  'SAPTransport.remove_object',
  'SAPGit.clone',
  'SAPGit.pull',
  'SAPGit.push',
  'SAPGit.stage',
  'SAPGit.unlink',
  'SAPGit.create_branch',
  'SAPGit.switch_branch',
  'SAPGit.external_info',
  'SAPManage.create_package',
  'SAPManage.delete_package',
  'SAPManage.change_package',
  'SAPManage.set_api_state',
  'SAPManage.flp_create_catalog',
  'SAPManage.flp_create_group',
  'SAPManage.flp_create_tile',
  'SAPManage.flp_add_tile_to_group',
  'SAPManage.flp_delete_catalog',
  'SAPLint.set_formatter_settings',
  'SAPDiagnose.apply_quickfix',
  'SAPDiagnose.trace_start',
  'SAPDiagnose.trace_cancel',
  'SAPDiagnose.set_sql_trace_state',
].join(',')

/** 授权写模式仍然禁用的高风险动作（传输 / Git / 删包） */
const WRITE_DENY_ACTIONS = [
  'SAPTransport.create',
  'SAPTransport.release',
  'SAPTransport.release_recursive',
  'SAPTransport.reassign',
  'SAPTransport.delete',
  'SAPTransport.remove_object',
  'SAPGit.clone',
  'SAPGit.pull',
  'SAPGit.push',
  'SAPGit.stage',
  'SAPGit.unlink',
  'SAPGit.create_branch',
  'SAPGit.switch_branch',
  'SAPGit.external_info',
  'SAPManage.delete_package',
  'SAPManage.set_api_state',
].join(',')

function filePath(): string {
  const dir = join(getConfigDir(), 'sap')
  ensureDir(dir)
  return join(dir, 'environments.json')
}

/** 代号规范化：大写字母数字，其余转下划线 */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')
}

/** 密码在 .env 中的键名 */
export function secretKeyFor(code: string): string {
  return `SAP_${normalizeCode(code)}_PASSWORD`
}

/** MCP 服务器名称，如 arc-1-QAS300 */
export function serverNameFor(code: string): string {
  return `arc-1-${normalizeCode(code)}`
}

/** 把 data/ 内的绝对路径转为可迁移的存储形式（迁移 data/ 后仍有效） */
function toStoredPath(absPath: string): string {
  const dataDir = getConfigDir()
  const rel = relative(dataDir, absPath)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return absPath
  return DATA_TOKEN + rel.split('\\').join('/')
}

/** 解析存储路径中的 ${FU_DATA_DIR} 前缀 */
export function resolveStoredPath(storedPath: string): string {
  if (!storedPath.startsWith(DATA_TOKEN)) return storedPath
  return join(getConfigDir(), storedPath.slice(DATA_TOKEN.length))
}

/** 从 arc1.js 路径向上定位包含 node_modules/arc-1 的工具根目录 */
function findArc1Root(serverPath: string): string | null {
  if (!serverPath) return null
  let dir = dirname(serverPath)
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, 'node_modules', 'arc-1'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function readAll(): SapEnvironment[] {
  return readJson<SapEnvironment[]>(filePath(), [])
}

function writeAll(items: SapEnvironment[]): void {
  writeJson(filePath(), items)
}

function withPasswordFlag(item: SapEnvironment): SapEnvironment {
  return { ...item, hasPassword: hasSecret(secretKeyFor(item.code)) }
}

function validate(input: SapEnvironmentInput): void {
  if (!normalizeCode(input.code)) throw new Error('环境代号不能为空')
  if (!/^https?:\/\//i.test(input.url.trim())) throw new Error('SAP 地址需以 http:// 或 https:// 开头')
  if (!/^\d{3}$/.test(input.client.trim())) throw new Error('Client 应为 3 位数字，如 300')
  if (!input.user.trim()) throw new Error('SAP 登录账号不能为空')
}

export function listSapEnvironments(): SapEnvironment[] {
  return readAll()
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(withPasswordFlag)
}

export function createSapEnvironment(input: SapEnvironmentInput): SapEnvironment {
  const code = normalizeCode(input.code)
  const items = readAll()
  if (items.some((item) => normalizeCode(item.code) === code)) {
    throw new Error(`环境代号 ${code} 已存在`)
  }
  validate(input)

  // 密码写入 .env，不进入 JSON
  if (input.password) {
    setSecret(secretKeyFor(code), input.password)
  }

  const now = Date.now()
  const env: SapEnvironment = {
    id: randomUUID(),
    code,
    name: input.name?.trim() || code,
    url: input.url.trim(),
    client: input.client.trim(),
    language: input.language?.trim() || 'ZH',
    user: input.user.trim(),
    hasPassword: false,
    allowWrites: input.allowWrites ?? false,
    nodePath: input.nodePath?.trim() || '',
    serverPath: input.serverPath?.trim() || '',
    enabled: input.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  }

  items.push(env)
  writeAll(items)
  console.log(`[SAP] 已创建环境 ${code}（只读=${!env.allowWrites}）`)
  return withPasswordFlag(env)
}

export function updateSapEnvironment(id: string, patch: Partial<SapEnvironmentInput>): SapEnvironment {
  const items = readAll()
  const index = items.findIndex((item) => item.id === id)
  const current = items[index]
  if (index < 0 || !current) throw new Error('SAP 环境不存在')

  if (patch.code && normalizeCode(patch.code) !== normalizeCode(current.code)) {
    throw new Error('环境代号创建后不可修改')
  }
  validate({
    code: current.code,
    url: patch.url ?? current.url,
    client: patch.client ?? current.client,
    user: patch.user ?? current.user,
  })

  if (patch.password) {
    setSecret(secretKeyFor(current.code), patch.password)
  }

  const updated: SapEnvironment = {
    ...current,
    name: patch.name?.trim() || current.name,
    url: patch.url?.trim() || current.url,
    client: patch.client?.trim() || current.client,
    language: patch.language?.trim() || current.language,
    user: patch.user?.trim() || current.user,
    allowWrites: patch.allowWrites ?? current.allowWrites,
    nodePath: patch.nodePath !== undefined ? patch.nodePath.trim() : current.nodePath,
    serverPath: patch.serverPath !== undefined ? patch.serverPath.trim() : current.serverPath,
    enabled: patch.enabled ?? current.enabled,
    updatedAt: Date.now(),
  }

  items[index] = updated
  writeAll(items)
  return withPasswordFlag(updated)
}

export function removeSapEnvironment(id: string): void {
  const items = readAll()
  const target = items.find((item) => item.id === id)
  if (!target) return

  writeAll(items.filter((item) => item.id !== id))
  setSecret(secretKeyFor(target.code), '')
  console.log(`[SAP] 已删除环境 ${target.code}`)
}

/**
 * 构建注入工作区的 MCP 配置
 *
 * 密码使用 ${SAP_<CODE>_PASSWORD} 占位，主进程启动 MCP 前由 resolveEnvRefs 解析，
 * 避免明文密码进入 data/（data 目录会随仓库迁移）。
 */
export function buildSapMcpEntry(env: SapEnvironment): McpServerEntry {
  return {
    type: 'stdio',
    command: env.nodePath ? resolveStoredPath(env.nodePath) : 'node',
    args: env.serverPath ? [resolveStoredPath(env.serverPath)] : [],
    env: {
      SAP_URL: env.url,
      SAP_CLIENT: env.client,
      SAP_LANGUAGE: env.language,
      SAP_USER: env.user,
      SAP_PASSWORD: `\${${secretKeyFor(env.code)}}`,
      SAP_TRANSPORT: 'stdio',
      SAP_ALLOW_WRITES: String(env.allowWrites),
      SAP_ALLOW_TRANSPORT_WRITES: 'false',
      SAP_ALLOW_GIT_WRITES: 'false',
      SAP_ALLOW_DATA_PREVIEW: 'true',
      SAP_ALLOW_FREE_SQL: 'false',
      SAP_DENY_ACTIONS: env.allowWrites ? WRITE_DENY_ACTIONS : READ_ONLY_DENY_ACTIONS,
      ARC1_LOG_LEVEL: 'info',
    },
    enabled: true,
  }
}

/** 把环境接入指定工作区 */
export function applySapToWorkspace(workspaceSlug: string, envId: string): void {
  const env = readAll().find((item) => item.id === envId)
  if (!env) throw new Error('SAP 环境不存在')

  const config = getWorkspaceMcpConfig(workspaceSlug)
  config.servers = config.servers ?? {}
  config.servers[serverNameFor(env.code)] = buildSapMcpEntry(env)
  saveWorkspaceMcpConfig(workspaceSlug, config)
  console.log(`[SAP] 已接入工作区 ${workspaceSlug}: ${serverNameFor(env.code)}`)
}

/** 从工作区移除环境 */
export function detachSapFromWorkspace(workspaceSlug: string, envId: string): void {
  const env = readAll().find((item) => item.id === envId)
  if (!env) throw new Error('SAP 环境不存在')

  const config = getWorkspaceMcpConfig(workspaceSlug)
  const name = serverNameFor(env.code)
  if (config.servers && config.servers[name]) {
    delete config.servers[name]
    saveWorkspaceMcpConfig(workspaceSlug, config)
    console.log(`[SAP] 已从工作区 ${workspaceSlug} 移除: ${name}`)
  }
}

/** 检测各环境运行文件是否可用（供设置页环境自检） */
export function getSapRuntimeStatus(): SapRuntimeStatus[] {
  return readAll().map((env) => ({
    envId: env.id,
    code: env.code,
    serverPath: env.serverPath,
    nodePath: env.nodePath,
    serverExists: Boolean(env.serverPath) && existsSync(resolveStoredPath(env.serverPath)),
    nodeExists: !env.nodePath || existsSync(resolveStoredPath(env.nodePath)),
    vendored: env.serverPath.startsWith(DATA_TOKEN),
  }))
}

/** 环境路径变化后，同步刷新已接入工作区的 mcp.json，避免仍指向 CodeBuddy 目录 */
function refreshWorkspaceBindings(env: SapEnvironment): number {
  const name = serverNameFor(env.code)
  let updated = 0

  for (const workspace of listAgentWorkspaces()) {
    const config = getWorkspaceMcpConfig(workspace.slug)
    if (!config.servers?.[name]) continue
    config.servers[name] = buildSapMcpEntry(env)
    saveWorkspaceMcpConfig(workspace.slug, config)
    updated += 1
  }

  return updated
}

/** 查询各环境在工作区的接入状态 */
export function getSapBindings(workspaceSlug: string): SapWorkspaceBinding[] {
  const servers = getWorkspaceMcpConfig(workspaceSlug).servers ?? {}
  return readAll().map((env) => {
    const serverName = serverNameFor(env.code)
    return {
      envId: env.id,
      envCode: env.code,
      serverName,
      applied: Boolean(servers[serverName]),
    }
  })
}

/**
 * 复制 arc-1 运行文件（node_modules 与 node.exe）到应用数据目录
 *
 * 复制后环境配置的 nodePath / serverPath 指向 data/sap/vendor/，
 * 即使 CodeBuddy 删除自身文件也不影响启动。已复制则跳过（幂等）。
 */
export async function vendorSapRuntime(envId: string): Promise<SapVendorResult> {
  const items = readAll()
  const index = items.findIndex((item) => item.id === envId)
  const env = items[index]
  if (index < 0 || !env) throw new Error('SAP 环境不存在')

  const serverSource = resolveStoredPath(env.serverPath)
  if (env.serverPath.startsWith(DATA_TOKEN) && existsSync(serverSource)) {
    const synced = refreshWorkspaceBindings(env)
    return {
      copied: false,
      message:
        synced > 0
          ? `运行文件已在应用数据目录，并同步了 ${synced} 个工作区接入配置`
          : '运行文件已在应用数据目录，无需重复复制',
      nodePath: env.nodePath,
      serverPath: env.serverPath,
    }
  }

  const arcRoot = findArc1Root(serverSource)
  if (!arcRoot) {
    throw new Error('未找到 arc-1 运行目录（node_modules/arc-1），请检查脚本路径或重新从 CodeBuddy 导入')
  }

  const destRoot = join(getConfigDir(), 'sap', 'vendor', 'arc-1')
  const targetServer = join(destRoot, relative(arcRoot, serverSource))
  let copied = false

  if (!existsSync(targetServer)) {
    await mkdir(destRoot, { recursive: true })
    await cp(arcRoot, destRoot, { recursive: true, force: true })
    copied = true
    console.log(`[SAP] 已复制 arc-1 运行文件: ${arcRoot} → ${destRoot}`)
  }

  // Node 可执行文件一并复制；原文件不存在时回退系统 node
  let newNodePath = ''
  const nodeSource = resolveStoredPath(env.nodePath)
  if (env.nodePath && existsSync(nodeSource)) {
    const nodeDestDir = join(getConfigDir(), 'sap', 'vendor', 'node')
    const nodeDest = join(nodeDestDir, basename(nodeSource))
    if (!existsSync(nodeDest)) {
      await mkdir(nodeDestDir, { recursive: true })
      await cp(nodeSource, nodeDest)
      copied = true
      console.log(`[SAP] 已复制 Node 运行文件: ${nodeSource} → ${nodeDest}`)
    }
    newNodePath = toStoredPath(nodeDest)
  }

  const newServerPath = toStoredPath(targetServer)
  const updated: SapEnvironment = {
    ...env,
    nodePath: newNodePath,
    serverPath: newServerPath,
    updatedAt: Date.now(),
  }
  items[index] = updated
  writeAll(items)

  // 已接入的工作区同步改用本地运行文件
  const synced = refreshWorkspaceBindings(updated)
  const base = copied
    ? '运行文件已复制到应用数据目录，之后可脱离 CodeBuddy 启动'
    : '环境路径已指向应用数据目录（文件已存在，无需重复复制）'

  return {
    copied,
    message: synced > 0 ? `${base}；已同步 ${synced} 个工作区接入配置` : base,
    nodePath: newNodePath,
    serverPath: newServerPath,
  }
}

/**
 * 从 CodeBuddy 的 mcp.json 导入 arc-1 配置
 *
 * 仅当文件存在时可用；密码写入 .env，不进入 data/。
 * 导入后自动复制运行文件到应用数据目录，摆脱对 CodeBuddy 安装的依赖。
 */
export async function importFromCodeBuddy(): Promise<SapImportResult> {
  const configPath = join(homedir(), '.codebuddy', 'mcp.json')
  if (!existsSync(configPath)) {
    return { imported: 0, skipped: 0, message: '未找到 CodeBuddy 的 mcp.json 配置' }
  }

  let parsed: { mcpServers?: Record<string, Record<string, unknown>> }
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf-8').replace(/^\uFEFF/, '')) as typeof parsed
  } catch {
    return { imported: 0, skipped: 0, message: 'CodeBuddy 的 mcp.json 解析失败' }
  }

  const entries = Object.entries(parsed.mcpServers ?? {}).filter(([name]) =>
    name.toLowerCase().startsWith('arc-1')
  )
  if (entries.length === 0) {
    return { imported: 0, skipped: 0, message: 'CodeBuddy 配置中没有 arc-1 服务器' }
  }

  const items = readAll()
  const addedIds: string[] = []
  let imported = 0
  let skipped = 0

  for (const [name, raw] of entries) {
    const env = (raw.env ?? {}) as Record<string, string>
    const code = normalizeCode(name.replace(/^arc-1-?/i, '') || `SAP${env.SAP_CLIENT ?? ''}`)
    if (!code || items.some((item) => normalizeCode(item.code) === code)) {
      skipped += 1
      continue
    }

    if (env.SAP_PASSWORD) {
      setSecret(secretKeyFor(code), env.SAP_PASSWORD)
    }

    const id = randomUUID()
    const now = Date.now()
    items.push({
      id,
      code,
      name,
      url: env.SAP_URL ?? '',
      client: env.SAP_CLIENT ?? '',
      language: env.SAP_LANGUAGE ?? 'ZH',
      user: env.SAP_USER ?? '',
      hasPassword: false,
      allowWrites: env.SAP_ALLOW_WRITES === 'true',
      nodePath: String(raw.command ?? ''),
      serverPath: Array.isArray(raw.args) ? String(raw.args[0] ?? '') : '',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })
    addedIds.push(id)
    imported += 1
  }

  if (imported > 0) writeAll(items)

  // 自动复制运行文件，CodeBuddy 之后删除自身文件也不影响启动
  let copiedCount = 0
  const failures: string[] = []
  for (const id of addedIds) {
    try {
      const result = await vendorSapRuntime(id)
      if (result.copied) copiedCount += 1
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
  }

  let message = `已导入 ${imported} 个环境${skipped > 0 ? `，跳过 ${skipped} 个已存在` : ''}`
  if (copiedCount > 0) message += '；运行文件已复制到应用数据目录'
  if (failures.length > 0) message += `；运行文件复制失败：${failures[0]}`

  return { imported, skipped, message }
}
