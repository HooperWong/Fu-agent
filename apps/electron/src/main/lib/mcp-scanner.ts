/**
 * MCP / Skill 扫描器
 *
 * 扫描本机各 AI Agent 已配置的 MCP 与 Skill：
 *   - Trae / Trae CN
 *   - WorkBuddy
 *   - CodeBuddy
 *   - Cherry Studio
 *
 * 支持扫描结果导入到当前 Fu Agent 工作区。只读扫描源文件，不修改其他应用配置。
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  ImportCapabilityResult,
  LocalCapabilityScanResult,
  LocalMcpSource,
  LocalSkillSource,
  McpServerEntry,
  WorkspaceMcpConfig,
} from '@proma/shared'
import { getWorkspaceMcpPath, getWorkspaceSkillsDir } from './config-paths'
import { getWorkspaceSkills } from './agent-workspace-manager'

/** 候选扫描位置 */
interface ScanLocation {
  label: string
  /** 返回 mcp.json 候选路径 */
  resolveMcpPaths: () => string[]
  /** 返回 skills 目录候选路径 */
  resolveSkillDirs: () => string[]
}

/** 展开 %APPDATA% / ~ 等路径占位符 */
function expandPath(p: string): string {
  let out = p
  if (out.includes('%APPDATA%')) {
    out = out.replace(/%APPDATA%/gi, process.env.APPDATA ?? join(process.env.USERPROFILE ?? '', 'AppData', 'Roaming'))
  }
  if (out.includes('%USERPROFILE%')) {
    out = out.replace(/%USERPROFILE%/gi, process.env.USERPROFILE ?? '')
  }
  if (out.startsWith('~')) {
    out = join(process.env.USERPROFILE ?? process.env.HOME ?? '', out.slice(1))
  }
  return out
}

const LOCATIONS: ScanLocation[] = [
  {
    label: 'Trae',
    resolveMcpPaths: () => [
      expandPath('%APPDATA%\\Trae\\User\\mcp.json'),
      expandPath('%APPDATA%\\Trae CN\\User\\mcp.json'),
      expandPath('~/.trae/mcp.json'),
      expandPath('~/.trae-cn/mcp.json'),
    ],
    resolveSkillDirs: () => [
      expandPath('%APPDATA%\\Trae\\User\\skills'),
      expandPath('%APPDATA%\\Trae CN\\User\\skills'),
      expandPath('~/.trae/skills'),
      expandPath('~/.trae-cn/skills'),
    ],
  },
  {
    label: 'WorkBuddy',
    resolveMcpPaths: () => {
      const base = expandPath('%APPDATA%\\WorkBuddy')
      if (!existsSync(base)) return []
      const paths: string[] = []
      try {
        for (const dir of readdirSync(base, { withFileTypes: true })) {
          if (!dir.isDirectory()) continue
          const candidate = join(base, dir.name, 'mcp.json')
          if (existsSync(candidate)) paths.push(candidate)
        }
      } catch {
        // 忽略无权限目录
      }
      return paths
    },
    resolveSkillDirs: () => [expandPath('~/.workbuddy/skills'), expandPath('%APPDATA%\\WorkBuddy\\skills')].filter(existsSync),
  },
  {
    label: 'CodeBuddy',
    resolveMcpPaths: () => [expandPath('~/.codebuddy/mcp.json')].filter(existsSync),
    resolveSkillDirs: () => {
      const base = expandPath('~/.codebuddy')
      if (!existsSync(base)) return []
      try {
        return readdirSync(base, { withFileTypes: true })
          .filter((d) => d.isDirectory() && d.name.toLowerCase().includes('skill'))
          .map((d) => join(base, d.name))
      } catch {
        return []
      }
    },
  },
  {
    // 通用 Agent 技能目录（如 lark 等插件把技能软链接到这里）
    label: '本机 Agents',
    resolveMcpPaths: () => [],
    resolveSkillDirs: () => [expandPath('~/.agents/skills')].filter(existsSync),
  },
  {
    label: 'Cherry Studio',
    resolveMcpPaths: () => {
      if (process.platform === 'win32') return [expandPath('%APPDATA%\\Cherry Studio\\mcp.json')].filter(existsSync)
      if (process.platform === 'darwin') {
        return [expandPath('~/Library/Application Support/CherryStudio/mcp.json')].filter(existsSync)
      }
      return [expandPath('~/.config/CherryStudio/mcp.json')].filter(existsSync)
    },
    resolveSkillDirs: () => [],
  },
]

/**
 * 规范化 MCP 条目
 *
 * 不同应用的 mcp.json 结构略有差异，这里只保留 Fu Agent 支持的字段。
 * 返回 null 表示结构不可用。
 */
function normalizeServer(raw: unknown): McpServerEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>

  // http/sse：有 url
  if (typeof entry.url === 'string' && entry.url.trim()) {
    const type = entry.type === 'sse' ? 'sse' : 'http'
    return {
      type,
      url: entry.url.trim(),
      headers: (entry.headers as Record<string, string> | undefined) ?? undefined,
      enabled: entry.enabled !== false,
    }
  }

  // stdio：有 command
  if (typeof entry.command === 'string' && entry.command.trim()) {
    return {
      type: 'stdio',
      command: entry.command.trim(),
      args: Array.isArray(entry.args) ? (entry.args as string[]) : undefined,
      env: (entry.env as Record<string, string> | undefined) ?? undefined,
      enabled: entry.enabled !== false,
    }
  }

  return null
}

/** 扫描本机 MCP 配置（不依赖工作区） */
export function scanMcpConfigs(): LocalMcpSource[] {
  const results: LocalMcpSource[] = []

  for (const loc of LOCATIONS) {
    for (const rawPath of loc.resolveMcpPaths()) {
      const path = rawPath
      if (!existsSync(path)) continue

      try {
        // 去除 BOM 后再解析（外部工具写入可能带 BOM）
        const json = JSON.parse(readFileSync(path, 'utf-8').replace(/^\uFEFF/, '')) as Record<string, unknown>
        const rawServers = (json.servers ?? json.mcpServers) as Record<string, unknown> | undefined

        if (!rawServers || typeof rawServers !== 'object') {
          results.push({ source: loc.label, path, servers: {}, error: '配置文件缺少 servers 字段' })
          continue
        }

        const servers: Record<string, McpServerEntry> = {}
        for (const [name, value] of Object.entries(rawServers)) {
          const normalized = normalizeServer(value)
          if (normalized) servers[name] = normalized
        }

        results.push({
          source: loc.label,
          path,
          servers,
          error: Object.keys(servers).length === 0 ? '未找到可识别的服务器条目' : undefined,
        })
      } catch (error) {
        results.push({
          source: loc.label,
          path,
          servers: {},
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  return results
}

/** 扫描本机 Skill 目录 */
export function scanSkillDirs(workspaceSlug: string): LocalSkillSource[] {
  const results: LocalSkillSource[] = []
  const slug = resolveWorkspaceSlug(workspaceSlug)
  const existing = new Set(getWorkspaceSkills(slug).map((s) => s.slug))

  for (const loc of LOCATIONS) {
    for (const dir of loc.resolveSkillDirs()) {
      if (!existsSync(dir)) continue
      let entries
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch {
        continue
      }

      for (const entry of entries) {
        // 软链接到目录的技能（如 ~/.agents/skills 下的 lark 系列）也要识别
        let isDir = entry.isDirectory()
        if (!isDir && entry.isSymbolicLink()) {
          try {
            isDir = statSync(join(dir, entry.name)).isDirectory()
          } catch {
            isDir = false
          }
        }
        if (!isDir) continue
        const skillDir = join(dir, entry.name)

        // 只认包含 SKILL.md 的目录，避免把普通目录当作 Skill
        if (!existsSync(join(skillDir, 'SKILL.md'))) continue

        let files: string[] = []
        try {
          files = readdirSync(skillDir).slice(0, 30)
        } catch {
          // 忽略
        }

        results.push({
          source: loc.label,
          path: skillDir,
          name: entry.name,
          files,
          exists: existing.has(entry.name),
        })
      }
    }
  }

  return results
}

/** 完整扫描：MCP + Skill，并标记工作区是否已存在同名 Skill */
export function scanLocalCapabilities(workspaceSlug: string): LocalCapabilityScanResult {
  return {
    mcp: scanMcpConfigs(),
    skills: scanSkillDirs(workspaceSlug),
  }
}

/** 规范化目标工作区 slug：空值回落到默认工作区，避免静默失败 */
function resolveWorkspaceSlug(workspaceSlug: string | undefined | null): string {
  const slug = (workspaceSlug ?? '').trim()
  return slug || 'default'
}

/** 把选中的 MCP 服务器导入当前工作区（同名不覆盖） */
export function importMcpServers(
  workspaceSlug: string,
  servers: Record<string, McpServerEntry>,
): ImportCapabilityResult {
  const slug = resolveWorkspaceSlug(workspaceSlug)
  const configPath = getWorkspaceMcpPath(slug)
  let current: WorkspaceMcpConfig = { servers: {} }

  if (existsSync(configPath)) {
    try {
      current = JSON.parse(readFileSync(configPath, 'utf-8').replace(/^\uFEFF/, '')) as WorkspaceMcpConfig
      if (!current.servers) current.servers = {}
    } catch {
      current = { servers: {} }
    }
  }

  const skipped: string[] = []
  const failed: Array<{ name: string; error: string }> = []
  let imported = 0

  for (const [name, entry] of Object.entries(servers)) {
    try {
      if (current.servers[name]) {
        skipped.push(name)
        continue
      }
      current.servers[name] = { ...entry, enabled: entry.enabled !== false }
      imported += 1
    } catch (error) {
      failed.push({ name, error: error instanceof Error ? error.message : String(error) })
    }
  }

  try {
    mkdirSync(join(configPath, '..'), { recursive: true })
    writeFileSync(configPath, JSON.stringify(current, null, 2), 'utf-8')
  } catch (error) {
    throw new Error(`写入 MCP 配置失败（${configPath}）：${error instanceof Error ? error.message : String(error)}`)
  }

  console.log(`[能力导入] MCP → ${configPath}，成功 ${imported}，跳过 ${skipped.length}，失败 ${failed.length}`)
  return { imported, skipped, failed, targetDir: configPath }
}

/** 把选中的 Skill 目录复制到当前工作区（同名不覆盖） */
export function importSkills(
  workspaceSlug: string,
  sources: Array<{ path: string; name: string }>,
): ImportCapabilityResult {
  const slug = resolveWorkspaceSlug(workspaceSlug)
  const skillsDir = getWorkspaceSkillsDir(slug)
  const skipped: string[] = []
  const failed: Array<{ name: string; error: string }> = []
  let imported = 0

  for (const source of sources) {
    try {
      const name = (source.name ?? '').trim()
      const sourcePath = (source.path ?? '').trim()
      if (!name || !sourcePath) {
        skipped.push(source.name || '(未知)')
        continue
      }

      const target = join(skillsDir, name)
      if (existsSync(target)) {
        skipped.push(name)
        continue
      }
      if (!existsSync(join(sourcePath, 'SKILL.md'))) {
        failed.push({ name, error: '源目录缺少 SKILL.md' })
        continue
      }

      // dereference: 源目录里的软链接（如 ~/.agents/skills 的 lark 系列）按内容实体复制，
      // 避免 Windows 下无权限创建符号链接导致 EPERM
      cpSync(sourcePath, target, { recursive: true, dereference: true })
      imported += 1
    } catch (error) {
      failed.push({
        name: source.name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  console.log(`[能力导入] Skill → ${skillsDir}，成功 ${imported}，跳过 ${skipped.length}，失败 ${failed.length}`)
  return { imported, skipped, failed, targetDir: skillsDir }
}
