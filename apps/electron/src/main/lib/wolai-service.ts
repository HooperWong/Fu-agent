/**
 * WOLAI 服务（开放 API + MCP 双通道）
 *
 * - 开放 API: https://openapi.wolai.com/v1（需要开放 API Token）
 * - MCP 通道: 工作区 mcp.json 中配置的 wolai MCP（https://api.wolai.com/v1/mcp，sk- Token）
 * - Token 来源优先级：设置页填写 → .env → MCP 配置的 Authorization header
 * - sk- 开头的 Token 是 MCP Token，开放 API 不识别，此时自动走 MCP 通道
 * - 所有写入需要一个 parent_id（用户 WOLAI 某个页面的 ID，URL 末尾那段）
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSettings } from './settings-service'
import { getAgentSessionMessages, getAgentSessionMeta } from './agent-session-manager'
import { listAgentWorkspaces, getWorkspaceMcpConfig } from './agent-workspace-manager'

const API_BASE = 'https://openapi.wolai.com/v1'

// ===== .env 读取 =====

function readEnvFile(): Map<string, string> {
  const env = new Map<string, string>()
  try {
    const candidates = [
      join(__dirname, '..', '..', '..', '.env'),
      join(process.cwd(), '.env'),
    ]
    for (const p of candidates) {
      if (existsSync(p)) {
        const content = readFileSync(p, 'utf-8')
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          const eq = trimmed.indexOf('=')
          if (eq > 0) {
            const k = trimmed.slice(0, eq).trim()
            let v = trimmed.slice(eq + 1).trim()
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.slice(1, -1)
            }
            env.set(k, v)
          }
        }
        break
      }
    }
  } catch {
    // ignore
  }
  return env
}

// ===== Token 解析 =====

export type WolaiTokenSource = 'settings' | 'env' | 'mcp' | 'none'

/** 清洗 Token：去掉包裹的尖括号、引号、多余空白与 Bearer 前缀 */
function normalizeToken(raw: string | null | undefined): string | null {
  if (!raw) return null
  let token = raw.trim()
  token = token.replace(/^Bearer\s+/i, '').trim()
  token = token.replace(/^[<("']+/, '').replace(/[>)"']+$/, '').trim()
  return token || null
}

/** 从各工作区 mcp.json 中找到 wolai MCP 服务器（url 含 wolai 的 HTTP 服务） */
function findWolaiMcpServer(): { name: string; url: string; token: string | null } | null {
  try {
    for (const ws of listAgentWorkspaces()) {
      const config = getWorkspaceMcpConfig(ws.slug)
      for (const [name, entry] of Object.entries(config.servers ?? {})) {
        if (entry.type !== 'http' && entry.type !== 'sse') continue
        if (!entry.url || !entry.url.includes('wolai')) continue
        const auth = entry.headers?.Authorization ?? entry.headers?.authorization ?? ''
        const token = normalizeToken(auth)
        return { name, url: entry.url, token }
      }
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * 解析可用的 WOLAI Token 及其来源
 *
 * 优先级：设置页填写 → .env → MCP 配置的 Authorization header
 */
export function resolveWolaiToken(): { token: string | null; source: WolaiTokenSource; mcpUrl: string | null } {
  const settings = getSettings()
  const fromSettings = normalizeToken(settings.wolaiToken)
  if (fromSettings) return { token: fromSettings, source: 'settings', mcpUrl: findWolaiMcpServer()?.url ?? null }

  // 进程环境变量（.env 未被读到时的兜底）
  const fromProcess = normalizeToken(process.env.WOLAI_TOKEN) ?? normalizeToken(process.env.WOLAI_APP_TOKEN)
  if (fromProcess) return { token: fromProcess, source: 'env', mcpUrl: findWolaiMcpServer()?.url ?? null }

  const env = readEnvFile()
  const fromEnv = normalizeToken(env.get('WOLAI_TOKEN')) ?? normalizeToken(env.get('WOLAI_APP_TOKEN'))
  if (fromEnv) return { token: fromEnv, source: 'env', mcpUrl: findWolaiMcpServer()?.url ?? null }

  const mcp = findWolaiMcpServer()
  if (mcp?.token) return { token: mcp.token, source: 'mcp', mcpUrl: mcp.url }

  return { token: null, source: 'none', mcpUrl: mcp?.url ?? null }
}

function getWolaiToken(): string | null {
  return resolveWolaiToken().token
}

function getWolaiParentId(): string | null {
  // 进程环境变量（启动脚本可能注入）也纳入兜底
  for (const key of ['WOLAI_DEPOSIT_PARENT', 'WOLAI_PARENT_ID', 'WOLAI_PARENT_PAGE_ID']) {
    const fromProcess = process.env[key]?.trim()
    if (fromProcess) return fromProcess
  }
  const env = readEnvFile()
  for (const key of ['WOLAI_DEPOSIT_PARENT', 'WOLAI_PARENT_ID', 'WOLAI_PARENT_PAGE_ID']) {
    const value = env.get(key)?.trim()
    if (value) return value
  }

  const settings = getSettings()
  return settings.wolaiDepositParentId?.trim() ?? null
}

// ===== 开放 API（REST） =====

async function wolaiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getWolaiToken()
  if (!token) throw new Error('未配置 WOLAI_TOKEN')

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    ...((init?.headers ?? {}) as Record<string, string>),
  }

  const fetchImpl = (globalThis as unknown as { fetch: typeof fetch }).fetch
  return fetchImpl(`${API_BASE}${path}`, { ...init, headers })
}

/** 创建一个新的 page 类型块（顶层页），返回该 page 的 id 和 URL */
async function createPageBlock(parentId: string, title: string): Promise<{ id: string; url: string }> {
  const resp = await wolaiFetch('/blocks', {
    method: 'POST',
    body: JSON.stringify({
      parent_id: parentId,
      blocks: [{ type: 'page', content: title }],
    }),
  })

  const body = await resp.text().catch(() => '')
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`
    try {
      const j = JSON.parse(body) as { message?: string }
      msg = j.message ?? `HTTP ${resp.status}`
    } catch {
      if (body) msg = body.slice(0, 200)
    }
    throw new Error(`创建 WOLAI 页面失败 (${msg})`)
  }

  let id = ''
  let url = ''
  try {
    const j = JSON.parse(body) as { data?: string; id?: string; url?: string }
    if (typeof j.data === 'string') {
      url = j.data
      const match = url.match(/wolai\.com\/([A-Za-z0-9]+)/)
      if (match && match[1]) id = match[1]
    } else if (typeof j.id === 'string') {
      id = j.id
      url = `https://www.wolai.com/${id}`
    }
  } catch {
    // ignore
  }

  if (!id) throw new Error(`无法解析新建页面 ID，响应：${body.slice(0, 200)}`)
  return { id, url }
}

/** 向指定父块追加文本/标题/列表块（单次最多 20 个） */
async function appendBlocks(parentId: string, blocks: Array<{ type: string; content: string; level?: number }>): Promise<void> {
  const resp = await wolaiFetch('/blocks', {
    method: 'POST',
    body: JSON.stringify({
      parent_id: parentId,
      blocks,
    }),
  })

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    let msg = `HTTP ${resp.status}`
    try {
      const j = JSON.parse(body) as { message?: string }
      msg = j.message ?? msg
    } catch {
      if (body) msg = body.slice(0, 200)
    }
    throw new Error(`追加 WOLAI 块失败 (${msg})`)
  }
}

/** 开放 API：列出指定页面的子页面（用于目录浏览） */
async function listChildrenViaOpenApi(parentId: string): Promise<Array<{ id: string; title: string; url?: string }>> {
  const resp = await wolaiFetch(`/blocks/${encodeURIComponent(parentId)}/children`, { method: 'GET' })
  const body = await resp.text().catch(() => '')
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`
    try {
      const j = JSON.parse(body) as { message?: string }
      msg = j.message ?? msg
    } catch {
      if (body) msg = body.slice(0, 200)
    }
    throw new Error(`读取 WOLAI 目录失败 (${msg})`)
  }

  const out: Array<{ id: string; title: string; url?: string }> = []
  try {
    const j = JSON.parse(body) as { data?: Array<{ id?: string; type?: string; content?: unknown; children?: unknown[] }> }
    for (const block of j.data ?? []) {
      if (!block.id) continue
      // page 类块才是页面；content 可能是字符串或富文本数组
      let title = ''
      if (typeof block.content === 'string') title = block.content
      else if (Array.isArray(block.content)) {
        title = (block.content as Array<{ text?: string }>).map((c) => c.text ?? '').join('')
      }
      out.push({ id: block.id, title: title || block.id, url: `https://www.wolai.com/${block.id}` })
    }
  } catch {
    // ignore
  }
  return out
}

// ===== MCP 通道（Streamable HTTP JSON-RPC） =====

interface McpTool {
  name: string
  description?: string
  inputSchema?: { properties?: Record<string, unknown> }
}

interface McpSession {
  url: string
  token: string
  sessionId: string | null
  tools: McpTool[]
}

/** 解析 MCP 响应体（可能是纯 JSON 或 SSE 流） */
function parseMcpBody(text: string, contentType: string): Record<string, unknown> | null {
  if (contentType.includes('text/event-stream')) {
    for (const event of text.split(/\r?\n\r?\n/)) {
      for (const line of event.split(/\r?\n/)) {
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim()
          if (data && data !== '[DONE]') {
            try {
              return JSON.parse(data) as Record<string, unknown>
            } catch {
              // 继续找下一个 data
            }
          }
        }
      }
    }
    return null
  }
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
}

async function mcpPost(session: McpSession, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.token}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  }
  if (session.sessionId) headers['mcp-session-id'] = session.sessionId

  const fetchImpl = (globalThis as unknown as { fetch: typeof fetch }).fetch
  const resp = await fetchImpl(session.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  const sid = resp.headers.get('mcp-session-id')
  if (sid) session.sessionId = sid

  const text = await resp.text().catch(() => '')
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`
    try {
      const j = JSON.parse(text) as { error?: { message?: string } }
      msg = j.error?.message ?? msg
    } catch {
      if (text) msg = text.slice(0, 200)
    }
    if (resp.status === 401) {
      msg += '。请检查 wolai MCP 配置的 Token 是否有效、是否带了多余的 < > 括号或引号'
    }
    throw new Error(`WOLAI MCP 请求失败 (${msg})`)
  }

  const body = parseMcpBody(text, resp.headers.get('content-type') ?? '')
  if (!body) throw new Error('WOLAI MCP 响应解析失败')
  const err = body.error as { message?: string } | undefined
  if (err) throw new Error(`WOLAI MCP 错误 (${err.message ?? '未知错误'})`)
  return body
}

/** 初始化 MCP 会话并获取工具列表 */
async function mcpConnect(url: string, token: string): Promise<McpSession> {
  const session: McpSession = { url, token, sessionId: null, tools: [] }

  const initResp = await mcpPost(session, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'Fu Agent', version: '1.0.0' },
    },
  })
  if (!initResp.result) throw new Error('WOLAI MCP 初始化失败')

  // initialized 通知（无 id）
  try {
    await mcpPost(session, { jsonrpc: '2.0', method: 'notifications/initialized' })
  } catch {
    // 部分服务端不需要，忽略失败
  }

  const listResp = await mcpPost(session, { jsonrpc: '2.0', id: 2, method: 'tools/list' })
  const result = listResp.result as { tools?: McpTool[] } | undefined
  session.tools = result?.tools ?? []
  return session
}

/** 调用 MCP 工具，返回文本结果 */
async function mcpCallTool(session: McpSession, name: string, args: Record<string, unknown>): Promise<string> {
  const resp = await mcpPost(session, {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: { name, arguments: args },
  })
  const result = resp.result as { content?: Array<{ type?: string; text?: string }> } | undefined
  return (result?.content ?? [])
    .filter((c) => typeof c.text === 'string')
    .map((c) => c.text)
    .join('\n')
}

/** 按正则在工具列表里挑工具 */
function pickTool(tools: McpTool[], patterns: RegExp[]): McpTool | null {
  for (const p of patterns) {
    const found = tools.find((t) => p.test(t.name))
    if (found) return found
  }
  return null
}

/** 从工具 inputSchema 中挑出第一个匹配的参数名 */
function pickArg(schema: McpTool['inputSchema'], patterns: RegExp[]): string | null {
  const keys = Object.keys(schema?.properties ?? {})
  for (const p of patterns) {
    const found = keys.find((k) => p.test(k))
    if (found) return found
  }
  return null
}

/** 从文本中提取可能的 JSON 串（支持 markdown 围栏、前后缀文本包裹） */
function extractJsonCandidates(text: string): string[] {
  const out: string[] = []
  // 1. markdown 围栏 ```json ... ```
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) {
    if (match[1]) out.push(match[1].trim())
  }
  // 2. 整段原文
  out.push(text.trim())
  // 3. 第一个 { 或 [ 到最后一个 } 或 ]
  const start = text.search(/[{[]/)
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))
  if (start >= 0 && end > start) out.push(text.slice(start, end + 1))
  return out
}

/** 从 MCP 文本结果里提取页面（JSON 结构 / wolai URL / 裸 ID） */
function parsePagesFromText(text: string): Array<{ id: string; title: string; url?: string }> {
  const out: Array<{ id: string; title: string; url?: string }> = []
  const seen = new Set<string>()

  const collect = (arr: unknown[]): void => {
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const id = (o.id ?? o.page_id ?? o.block_id ?? o.doc_id) as unknown
      const url = (o.url ?? o.link) as unknown
      const title = (o.title ?? o.name ?? o.text ?? o.content) as unknown
      const resolvedId = (typeof id === 'string' && id ? id : undefined)
        ?? (typeof url === 'string' ? url.match(/wolai\.com\/([A-Za-z0-9]+)/)?.[1] : undefined)
      if (resolvedId && !seen.has(resolvedId)) {
        seen.add(resolvedId)
        out.push({
          id: resolvedId,
          title: typeof title === 'string' && title.trim() ? title.trim().slice(0, 80) : resolvedId,
          url: typeof url === 'string' ? url : `https://www.wolai.com/${resolvedId}`,
        })
      }
    }
  }

  // 1. JSON 解析（围栏/包裹文本内提取候选）
  for (const candidate of extractJsonCandidates(text)) {
    try {
      const j = JSON.parse(candidate) as unknown
      const j2 = j as { results?: unknown[]; data?: unknown[]; pages?: unknown[]; docs?: unknown[]; documents?: unknown[] }
      const arr = Array.isArray(j) ? j : j2.results ?? j2.data ?? j2.docs ?? j2.documents ?? j2.pages
      if (Array.isArray(arr) && arr.length > 0) {
        collect(arr)
        if (out.length > 0) return out
      }
      // 单对象也接受（如 create_doc 返回 { id, title, url }）
      if (!Array.isArray(j) && j && typeof j === 'object') {
        collect([j])
        if (out.length > 0) return out
      }
    } catch {
      // 候选不是合法 JSON，继续下一个
    }
  }

  // 2. 正则提取 wolai URL 行
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/wolai\.com\/([A-Za-z0-9]{6,})/)
    if (!match) continue
    const id = match[1]!
    if (seen.has(id)) continue
    seen.add(id)
    const title = line.replace(/https?:\/\/[^\s)]+/g, '').replace(/[|\-—·]+\s*$/, '').trim() || id
    out.push({ id, title: title.slice(0, 80), url: `https://www.wolai.com/${id}` })
  }

  // 3. 裸 ID 兜底：wolai 页面 ID 是 20~25 位字母数字（如 moiWmi6pxQYPLMndz9H7TA）
  if (out.length === 0) {
    for (const line of text.split(/\r?\n/)) {
      if (line.length > 300) continue
      const match = line.match(/\b([A-Za-z0-9]{20,25})\b/)
      if (!match) continue
      const id = match[1]!
      if (seen.has(id)) continue
      seen.add(id)
      // 行内去掉 ID 后剩余部分作为标题，过滤 JSON 键名残留（如 "id": "）
      let title = line.replace(new RegExp(id, 'g'), '').replace(/["'`,:{}[\]]/g, '').trim()
      title = title.replace(/^(id|doc_id|page_id|title|name)\s*/, '').trim() || id
      out.push({ id, title: title.slice(0, 80), url: `https://www.wolai.com/${id}` })
    }
  }

  return out
}

// ===== MCP 工具参数自适应构造 =====

interface JsonSchemaProp {
  type?: string
  enum?: unknown[]
  properties?: Record<string, JsonSchemaProp>
  required?: string[]
  items?: JsonSchemaProp
}

/**
 * 为「位置类」参数构造值：
 * - 若 schema 声明为对象（如 create_doc 的 location），按其子属性构造 { id/pageId: parentId, ...枚举默认 }
 * - 若为字符串，直接用 parentId
 */
function buildLocationArg(prop: JsonSchemaProp | undefined, parentId: string): unknown {
  if (!prop) return parentId
  if (prop.type === 'string') return parentId
  const props = prop.properties
  if (props && typeof props === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, sub] of Object.entries(props)) {
      if (/^(id|pageid|page_id|blockid|block_id|docid|doc_id|parentid|parent_id)$/i.test(key)) {
        out[key] = parentId
      } else if (sub.type === 'string' && Array.isArray(sub.enum) && sub.enum.length > 0) {
        // 枚举字段给第一个值（如 type: page|database → page）
        out[key] = sub.enum[0]
      }
    }
    if (Object.keys(out).length > 0) return out
  }
  return parentId
}

/** 按工具 inputSchema 构造调用参数（只填认识的键，避免 Unrecognized key 校验失败） */
function buildToolArgs(
  tool: McpTool,
  intent: { parentId?: string; title?: string; contentText?: string; blocks?: Array<Record<string, unknown>> },
): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  const props = tool.inputSchema?.properties ?? {}
  for (const [key, rawProp] of Object.entries(props)) {
    const prop = rawProp as JsonSchemaProp
    if (/location|parent|target|destination/i.test(key)) {
      args[key] = buildLocationArg(prop, intent.parentId ?? '')
    } else if (/title|^name$/i.test(key) && intent.title !== undefined && prop.type === 'string') {
      args[key] = intent.title
    } else if (/blocks?$/i.test(key) && intent.blocks !== undefined && (prop.type === 'array' || !prop.type)) {
      args[key] = intent.blocks
    } else if (/content|body|paragraph|text/i.test(key) && intent.contentText !== undefined && (prop.type === 'string' || !prop.type)) {
      args[key] = intent.contentText
    }
  }
  return args
}

// ===== 对外能力 =====

export interface WolaiPageItem {
  id: string
  title: string
  url?: string
}

/**
 * 浏览 WOLAI 目录（供设置页选择沉淀父页面）
 *
 * 优先走 MCP 的 search/list 工具；若提供了 parentId 且 Token 是开放 API Token，
 * 则用 GET /blocks/{id}/children 列子页面。
 */
export async function listWolaiPages(options?: { parentId?: string; query?: string }): Promise<{
  ok: boolean
  pages: WolaiPageItem[]
  channel?: 'mcp' | 'openapi'
  error?: string
}> {
  const { token, source } = resolveWolaiToken()
  if (!token) return { ok: false, pages: [], error: '未配置 WOLAI Token（设置页、.env 或 MCP 配置任一即可）' }

  const mcpServer = findWolaiMcpServer()

  // MCP 浏览：list_docs / search_docs（本机 wolai MCP 的实际工具名），失败或为空时带出原始返回便于排查
  if (mcpServer?.token) {
    try {
      const session = await mcpConnect(mcpServer.url, mcpServer.token)
      const listTool = pickTool(session.tools, [/^list_docs?$/i, /^list_pages?$/i, /^search_docs?$/i, /^search/i, /list/i])
      const searchTool = pickTool(session.tools, [/^search_docs?$/i, /^search/i, /query/i])
      let raw = ''
      let lastErr = ''

      if (listTool) {
        const args: Record<string, unknown> = {}
        const limitKey = pickArg(listTool.inputSchema, [/limit/i, /count/i, /size/i])
        if (limitKey) args[limitKey] = 30
        try {
          raw = await mcpCallTool(session, listTool.name, args)
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e)
        }
      }
      if (parsePagesFromText(raw).length === 0 && searchTool) {
        const qKey = pickArg(searchTool.inputSchema, [/query/i, /keyword/i, /search/i, /q$/i]) ?? 'query'
        try {
          raw = await mcpCallTool(session, searchTool.name, { [qKey]: options?.query ?? '' })
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e)
        }
      }

      const pages = parsePagesFromText(raw)
      if (pages.length > 0) return { ok: true, pages: pages.slice(0, 50), channel: 'mcp' }
      return {
        ok: false,
        pages: [],
        error: `MCP 浏览未解析出页面。${lastErr ? `调用错误：${lastErr}。` : ''}原始返回：${raw.slice(0, 300) || '（空）'}`,
      }
    } catch (error) {
      // MCP 整体失败，继续尝试开放 API
      if (!options?.parentId) {
        return { ok: false, pages: [], error: error instanceof Error ? error.message : String(error) }
      }
    }
  }

  // 2. 开放 API 子页面浏览
  if (options?.parentId) {
    try {
      const pages = await listChildrenViaOpenApi(options.parentId)
      return { ok: true, pages: pages.slice(0, 50), channel: 'openapi' }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return { ok: false, pages: [], error: msg.includes('无效') || msg.includes('Token') ? `${msg}。提示：sk- 开头的是 MCP Token，不能用于开放 API 目录浏览` : msg }
    }
  }

  return { ok: false, pages: [], error: '没有可用的浏览通道：请在上方填入父页面 ID（用开放 API 列子页面），或确认 wolai MCP 已配置' }
}

/** 通过 MCP 通道沉淀：创建页面 + 追加内容块 */
async function depositViaMcp(
  parentId: string,
  title: string,
  blocks: Array<{ type: string; content: string; level?: number }>,
): Promise<{ ok: boolean; pageId?: string; url?: string; error?: string }> {
  const mcpServer = findWolaiMcpServer()
  if (!mcpServer?.token) return { ok: false, error: 'MCP 通道不可用：工作区 mcp.json 中未配置 wolai MCP' }

  try {
    const session = await mcpConnect(mcpServer.url, mcpServer.token)

    // 1. 创建文档工具（本机 wolai MCP 实际名为 create_doc，参数为 location 对象 + title）
    const createTool = pickTool(session.tools, [
      /^create_doc/i, /^create_pages?$/i, /^create_page/i, /create.*doc/i, /create.*page/i, /new.*page/i,
    ])
    if (!createTool) {
      return { ok: false, error: `WOLAI MCP 未提供创建文档工具（可用：${session.tools.map((t) => t.name).join(', ') || '无'}）` }
    }

    const contentText = blocks.map((b) => (b.type === 'heading' ? `${'#'.repeat(b.level ?? 3)} ${b.content}` : b.content)).join('\n')
    const createArgs = buildToolArgs(createTool, { parentId, title, contentText })
    // 若创建工具已接收初始正文，就不再用 create_block 重复追加
    const contentFilled = Object.keys(createArgs).some((k) => /content|body|paragraph|text/i.test(k))
    const missingKeys: string[] = []
    // 校验必填键是否都填上了
    for (const req of (createTool.inputSchema as { required?: string[] } | undefined)?.required ?? []) {
      if (!(req in createArgs)) missingKeys.push(req)
    }

    let createText: string
    try {
      createText = await mcpCallTool(session, createTool.name, createArgs)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const schemaHint = JSON.stringify(createTool.inputSchema ?? {}).slice(0, 500)
      const hint = missingKeys.length > 0 ? `；缺少必填参数：${missingKeys.join(', ')}` : ''
      throw new Error(`调用 ${createTool.name} 失败：${msg}${hint}。工具参数定义：${schemaHint}`)
    }

    const created = parsePagesFromText(createText)
    const pageId = created[0]?.id ?? createText.match(/wolai\.com\/([A-Za-z0-9]+)/)?.[1]
    if (!pageId) {
      return { ok: false, error: `无法从 MCP 结果解析新页面 ID：${createText.slice(0, 200)}` }
    }
    const pageUrl = `https://www.wolai.com/${pageId}`

    // 2. 追加块工具（create_block / patch_block_content 等），没有或已带正文就跳过，文档已创建成功
    const appendTool = pickTool(session.tools, [
      /^create_block/i, /^add_blocks?$/i, /add.*block/i, /patch_block/i, /append/i, /insert/i, /^write/i,
    ])
    if (appendTool && !contentFilled) {
      const appendArgs = buildToolArgs(appendTool, {
        parentId: pageId,
        blocks: blocks.map((b) => ({ type: b.type, content: b.content, ...(b.level ? { level: b.level } : {}) })),
        contentText: blocks.map((b) => b.content).join('\n\n'),
      })
      try {
        await mcpCallTool(session, appendTool.name, appendArgs)
      } catch {
        // 追加失败不视为整体失败
      }
    }

    return { ok: true, pageId, url: pageUrl }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 沉淀：优先走与 Token 匹配的通道
 * - sk- Token（MCP Token）→ MCP 通道优先
 * - 其他 Token → 开放 API 优先，失败后尝试 MCP
 */
export async function depositAgentSession(
  sessionId: string,
  options?: { targetParentId?: string },
): Promise<{ ok: boolean; pageId?: string; url?: string; error?: string }> {
  try {
    const { token, source } = resolveWolaiToken()
    if (!token) {
      return {
        ok: false,
        error: '未配置 WOLAI Token。请在「设置 → Agent → WOLAI 沉淀」中填写，或在 .env 设置 WOLAI_TOKEN，或在工作区 MCP 中配置 wolai 服务',
      }
    }

    const parentId = (options?.targetParentId ?? getWolaiParentId() ?? '').trim()
    if (!parentId) {
      return {
        ok: false,
        error: '未设置 WOLAI 父页面 ID。请在「设置 → Agent → WOLAI 沉淀」中填入父页面 ID（WOLAI 页面 URL 末尾那段），或点击「浏览 WOLAI 目录」选择',
      }
    }

    const meta = getAgentSessionMeta(sessionId)
    if (!meta) return { ok: false, error: '会话不存在' }

    const messages = getAgentSessionMessages(sessionId)
    const lastMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-20)

    if (lastMessages.length === 0) return { ok: false, error: '会话无有效消息' }

    const title = meta.title || `Agent 会话 ${sessionId.slice(0, 8)}`

    // 组装块（单次最多 20）
    const blocks: Array<{ type: string; content: string; level?: number }> = []
    for (const msg of lastMessages) {
      const textContent = Array.isArray(msg.content)
        ? (msg.content as Array<{ type: string; text?: string }>)
            .filter((c) => c.type === 'text')
            .map((c) => c.text ?? '')
            .join('\n')
        : String(msg.content ?? '')

      if (!textContent.trim()) continue

      blocks.push({
        type: msg.role === 'user' ? 'heading' as const : 'text' as const,
        level: msg.role === 'user' ? 3 : undefined,
        content: (msg.role === 'user' ? '**用户** ' : '**助手** ') + textContent.slice(0, 1800),
      })

      if (blocks.length >= 20) break
    }

    const pageTitle = `📝 ${title} — ${new Date(meta.createdAt).toLocaleString('zh-CN')}`
    const mcpServer = findWolaiMcpServer()
    const useMcpFirst = token.startsWith('sk-') || source === 'mcp'

    if (useMcpFirst) {
      // sk- 是 MCP Token，开放 API 必然拒绝，直接以 MCP 通道结果为准
      return await depositViaMcp(parentId, pageTitle, blocks)
    }

    try {
      const page = await createPageBlock(parentId, pageTitle)
      if (blocks.length > 0) {
        await appendBlocks(page.id, blocks)
      }
      return { ok: true, pageId: page.id, url: page.url }
    } catch (apiError) {
      const apiMsg = apiError instanceof Error ? apiError.message : String(apiError)
      // 开放 API 失败且 MCP 可用 → 走 MCP
      if (mcpServer?.token) {
        const mcpResult = await depositViaMcp(parentId, pageTitle, blocks)
        if (mcpResult.ok) return mcpResult
        const hint = token.startsWith('sk-')
          ? '。提示：sk- 开头的是 wolai MCP Token，不能用于开放 API；已尝试 MCP 通道也失败'
          : ''
        return { ok: false, error: `开放 API：${apiMsg}；MCP：${mcpResult.error ?? '不可用'}${hint}` }
      }
      throw apiError
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return { ok: false, error: msg }
  }
}

/**
 * 测试 WOLAI 连接
 *
 * - MCP 通道（sk- Token 或工作区配置了 wolai MCP）：initialize + tools/list
 * - 开放 API：GET /blocks/{id}/children（配置了父页面 ID 时）或轻量请求
 */
export async function testWolaiConnection(): Promise<{
  ok: boolean
  error?: string
  channel?: 'mcp' | 'openapi'
  tokenSource?: WolaiTokenSource
  tools?: string[]
}> {
  const { token, source, mcpUrl } = resolveWolaiToken()
  if (!token) return { ok: false, error: '未配置 WOLAI Token', tokenSource: source }

  const mcpServer = findWolaiMcpServer()

  // sk- Token 只能走 MCP
  if (token.startsWith('sk-') && mcpServer?.token) {
    try {
      const session = await mcpConnect(mcpServer.url, mcpServer.token)
      return {
        ok: true,
        channel: 'mcp',
        tokenSource: source,
        tools: session.tools.map((t) => t.name).slice(0, 20),
      }
    } catch (error) {
      return {
        ok: false,
        error: `MCP 连接失败：${error instanceof Error ? error.message : String(error)}`,
        channel: 'mcp',
        tokenSource: source,
      }
    }
  }

  // 开放 API 轻量验证
  try {
    const settings = getSettings()
    const parentId = settings.wolaiDepositParentId?.trim() || readEnvFile().get('WOLAI_DEPOSIT_PARENT')?.trim()
    const path = parentId ? `/blocks/${encodeURIComponent(parentId)}/children` : '/blocks'
    const resp = await wolaiFetch(path, { method: 'GET' })
    if (resp.status === 401 || resp.status === 403) {
      const msg = resp.status === 401 ? 'Token 无效或已过期' : '权限不足'
      // 如果是 MCP Token 误配到开放 API，给出明确提示
      if (mcpServer?.token) {
        return {
          ok: false,
          error: `开放 API 校验失败（${msg}）。提示：sk- 开头的是 MCP Token，与开放 API Token 不通用；但 MCP 通道已配置，沉淀时会自动走 MCP`,
          channel: 'openapi',
          tokenSource: source,
        }
      }
      return { ok: false, error: msg, channel: 'openapi', tokenSource: source }
    }
    return { ok: true, channel: 'openapi', tokenSource: source }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      channel: 'openapi',
      tokenSource: source,
    }
  }
}
