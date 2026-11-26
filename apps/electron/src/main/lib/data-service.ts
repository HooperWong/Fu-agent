/**
 * 数据目录服务
 *
 * 负责数据目录概览、打开目录、整体导出与恢复。
 * 备份以目录为单位复制，包含 conversations / notes / sap 等全部数据；
 * 凭据存于应用根 .env（数据目录之外），默认不进入备份，可选随备份复制。
 */

import { app, dialog, shell } from 'electron'
import { copyFile, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { getConfigDir, getEnvPath, getAppRootDir } from './config-paths'
import { requestApproval } from './security/approval-service'
import { createZipFromDirectory } from './zip-writer'
import { BACKUP_MANIFEST_NAME, type BackupManifest, type DataOverview, type DataTransferResult } from '../../types'

/** 备份目录名中的时间戳，如 20261120-153012 */
function timestamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/** 日志与临时目录不进入备份 */
function isEphemeral(dataDir: string, target: string): boolean {
  const rel = relative(dataDir, target)
  if (!rel) return false
  const first = rel.split(/[\\/]/)[0]
  return first === 'logs' || first === 'tmp'
}

/** 递归统计文件数与占用空间（可跳过指定数据根下的 logs/tmp） */
async function measure(dir: string, skipRoot?: string): Promise<{ sizeBytes: number; fileCount: number }> {
  let sizeBytes = 0
  let fileCount = 0

  const walk = async (current: string): Promise<void> => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        if (skipRoot && isEphemeral(skipRoot, fullPath)) continue
        await walk(fullPath)
      } else if (entry.isFile()) {
        fileCount += 1
        try {
          sizeBytes += (await stat(fullPath)).size
        } catch {
          // 文件被占用等情况忽略统计
        }
      }
    }
  }

  await walk(dir)
  return { sizeBytes, fileCount }
}

/** 获取数据目录概览 */
export async function getDataOverview(): Promise<DataOverview> {
  const dataDir = getConfigDir()
  const { sizeBytes, fileCount } = await measure(dataDir)
  return { dataDir, appDir: getAppRootDir(), sizeBytes, fileCount, envPath: getEnvPath() }
}

/** 在文件管理器中打开数据目录 */
export async function openDataDir(): Promise<void> {
  const error = await shell.openPath(getConfigDir())
  if (error) throw new Error(`打开数据目录失败：${error}`)
}

/** 判断目录是否像一个 Fu Agent 数据备份 */
function looksLikeBackup(dir: string): boolean {
  const markers = ['settings.json', 'conversations.json', 'agent-workspaces.json', 'sap', 'notes', 'conversations', BACKUP_MANIFEST_NAME]
  return markers.some((name) => existsSync(join(dir, name)))
}

/** 读取备份清单（不存在或损坏时返回 null） */
async function readManifest(dir: string): Promise<BackupManifest | null> {
  const file = join(dir, BACKUP_MANIFEST_NAME)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(await readFile(file, 'utf-8')) as BackupManifest
  } catch {
    return null
  }
}

/**
 * 导出数据备份到用户选择的目录（新建 FuAgent备份-时间 子目录）
 *
 * @param includeSecrets 是否同时复制应用根 .env（含密钥）
 */
export async function exportDataBackup(includeSecrets = false): Promise<DataTransferResult> {
  const picked = await dialog.showOpenDialog({
    title: '选择备份保存位置',
    buttonLabel: '保存到这里',
    properties: ['openDirectory', 'createDirectory'],
  })
  const parent = picked.filePaths[0]
  if (picked.canceled || !parent) {
    return { canceled: true, message: '已取消导出' }
  }

  const dataDir = getConfigDir()
  const target = join(parent, `FuAgent备份-${timestamp()}`)

  const insideData = relative(resolve(dataDir), resolve(target))
  if (insideData && !insideData.startsWith('..') && !isAbsolute(insideData)) {
    throw new Error('备份位置不能位于数据目录内部，请选择其他位置')
  }

  let secretsCopied = false

  try {
    await mkdir(target, { recursive: true })
    await cp(dataDir, target, {
      recursive: true,
      filter: (source) => !isEphemeral(dataDir, source),
    })

    if (includeSecrets) {
      const envPath = getEnvPath()
      if (existsSync(envPath)) {
        await copyFile(envPath, join(target, '.env'))
        secretsCopied = true
      }
    }

    const { sizeBytes, fileCount } = await measure(target)
    const manifest: BackupManifest = {
      appVersion: app.getVersion(),
      createdAt: new Date().toISOString(),
      includesSecrets: secretsCopied,
      fileCount,
      sizeBytes,
    }
    await writeFile(join(target, BACKUP_MANIFEST_NAME), JSON.stringify(manifest, null, 2), 'utf-8')
  } catch (error) {
    console.error('[数据] 导出备份失败:', error)
    throw new Error(`导出失败：${error instanceof Error ? error.message : String(error)}`)
  }

  const { sizeBytes } = await measure(target)
  const sizeText = `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`
  console.log(`[数据] 已导出备份: ${target}（凭据: ${secretsCopied ? '包含' : '不包含'}）`)
  return {
    canceled: false,
    message: secretsCopied
      ? `已导出到 ${target}（${sizeText}），已包含 .env 凭据，请妥善保管该备份`
      : `已导出到 ${target}（${sizeText}），密码不在备份中，迁移后需重新填写`,
    target,
  }
}

/**
 * 导出迁移包（ZIP）
 *
 * 流程：选择保存路径 → 展示导出范围并确认 → 压缩数据目录（只读）。
 * 原始数据不会被删除、移动或修改；仅清理本次生成的半成品 ZIP。
 */
export async function exportDataZip(includeSecrets = false): Promise<DataTransferResult> {
  const dataDir = getConfigDir()
  const { sizeBytes, fileCount } = await measure(dataDir, dataDir)

  const saved = await dialog.showSaveDialog({
    title: '保存迁移包',
    buttonLabel: '保存',
    defaultPath: join(app.getPath('documents'), `FuAgent迁移包-${timestamp()}.zip`),
    filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
  })
  const target = saved.filePath
  if (saved.canceled || !target) {
    return { canceled: true, message: '已取消导出' }
  }

  const insideData = relative(resolve(dataDir), resolve(target))
  if (!insideData.startsWith('..') && !isAbsolute(insideData)) {
    throw new Error('迁移包不能保存在数据目录内部，请选择其他位置')
  }

  const envPath = getEnvPath()
  const secretsPlanned = includeSecrets && existsSync(envPath)

  // 压缩前先展示范围，由用户确认
  const confirm = await dialog.showMessageBox({
    type: 'question',
    title: '确认导出范围',
    message: '即将把当前数据目录压缩为一个 ZIP 迁移包',
    detail: [
      `源目录：${dataDir}`,
      `目标文件：${target}`,
      `规模：${fileCount} 个文件，约 ${(sizeBytes / 1024 / 1024).toFixed(1)} MB`,
      '',
      '包含：会话记录（conversations/、agent-sessions/）、工作区配置（agent-workspaces/、mcp/、skills/）、笔记与附件（notes/）、SAP 运行文件（sap/）、待办/日程/项目/记忆等本地文件及 settings.json 等配置',
      '排除：logs/、tmp/',
      `凭据：${secretsPlanned ? `包含应用根 .env（${envPath}）` : '不包含 .env，新机器需重新填写密钥'}`,
      '',
      '导出只读取数据，不会删除、移动或修改原始文件。',
    ].join('\n'),
    buttons: ['开始压缩', '取消'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })
  if (confirm.response !== 0) {
    return { canceled: true, message: '已取消导出' }
  }

  try {
    const manifest: BackupManifest = {
      appVersion: app.getVersion(),
      createdAt: new Date().toISOString(),
      includesSecrets: secretsPlanned,
      fileCount,
      sizeBytes,
    }

    await createZipFromDirectory(dataDir, target, {
      filter: (item) => !isEphemeral(dataDir, item),
      extraFiles: secretsPlanned ? [{ name: '.env', path: envPath }] : [],
      extraEntries: [{ name: BACKUP_MANIFEST_NAME, data: JSON.stringify(manifest, null, 2) }],
    })

    const zipText = `${((await stat(target)).size / 1024 / 1024).toFixed(1)} MB`
    console.log(`[数据] 已生成迁移包: ${target}（${zipText}，凭据: ${secretsPlanned ? '包含' : '不包含'}）`)
    return {
      canceled: false,
      message: `已生成迁移包：${target}（${zipText}，${fileCount} 个文件）。原始数据未改动${
        secretsPlanned ? '；已包含 .env 凭据，请通过可信方式传输' : '；未包含 .env，新机器需重新填写密钥'
      }`,
      target,
    }
  } catch (error) {
    // 仅清理本次生成的半成品文件，不触碰原始数据
    await rm(target, { force: true }).catch(() => undefined)
    console.error('[数据] 生成迁移包失败:', error)
    throw new Error(`生成迁移包失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 从用户选择的备份目录恢复数据（当前数据保留为同级 data.bak-时间 目录） */
export async function importDataBackup(): Promise<DataTransferResult> {
  const picked = await dialog.showOpenDialog({
    title: '选择要恢复的备份目录',
    buttonLabel: '选择此目录',
    properties: ['openDirectory'],
  })
  const source = picked.filePaths[0]
  if (picked.canceled || !source) {
    return { canceled: true, message: '已取消恢复' }
  }

  const dataDir = getConfigDir()
  const insideData = relative(resolve(dataDir), resolve(source))
  if (!insideData.startsWith('..') && !isAbsolute(insideData)) {
    throw new Error('不能选择数据目录内部的路径作为恢复来源')
  }
  if (!looksLikeBackup(source)) {
    return {
      canceled: false,
      message: '所选目录不像 Fu Agent 备份（缺少 settings.json、conversations 等标志），已取消恢复',
      target: source,
    }
  }

  const manifest = await readManifest(source)
  const backupEnvPath = join(source, '.env')
  const hasBackupEnv = existsSync(backupEnvPath)

  const approval = await requestApproval({
    action: 'data.import',
    title: '恢复数据备份',
    description: '将用所选备份内容替换当前数据目录',
    detail: hasBackupEnv
      ? '当前数据会整体移动到同级 data.bak-<时间> 目录保留；备份中的 .env 凭据将一并还原到应用根目录。恢复完成后需要重启应用生效。'
      : '当前数据会整体移动到同级 data.bak-<时间> 目录保留，恢复完成后需要重启应用生效。',
    risk: 'destructive',
  })
  if (!approval.approved) {
    return { canceled: true, message: '未授权恢复数据' }
  }

  const safetyDir = `${dataDir}.bak-${timestamp()}`
  const hadData = existsSync(dataDir)

  try {
    if (hadData) await rename(dataDir, safetyDir)
    await mkdir(dataDir, { recursive: true })
    await cp(source, dataDir, {
      recursive: true,
      // 清单与 .env 属于备份元数据/凭据，不写入数据目录
      filter: (item) => {
        const rel = relative(source, item)
        return rel !== '' && rel !== BACKUP_MANIFEST_NAME && rel !== '.env'
      },
    })
  } catch (error) {
    console.error('[数据] 恢复备份失败:', error)
    // 失败时尽量回滚，避免数据目录处于半成品状态
    try {
      await rm(dataDir, { recursive: true, force: true })
      if (hadData) await rename(safetyDir, dataDir)
    } catch (rollbackError) {
      console.error('[数据] 回滚失败，请手动从备份目录恢复:', rollbackError)
    }
    throw new Error(`恢复失败：${error instanceof Error ? error.message : String(error)}`)
  }

  // 凭据还原：备份含 .env 时覆盖到应用根（旧 .env 先备份）
  let envRestored = false
  let envWarning = ''
  if (hasBackupEnv) {
    try {
      const envPath = getEnvPath()
      if (existsSync(envPath)) {
        await rename(envPath, `${envPath}.bak-${timestamp()}`)
      }
      await copyFile(backupEnvPath, envPath)
      envRestored = true
    } catch (error) {
      console.warn('[数据] .env 还原失败:', error)
      envWarning = `，但 .env 凭据还原失败（${error instanceof Error ? error.message : String(error)}），请手动复制`
    }
  }

  console.log(`[数据] 已从备份恢复: ${source}（原数据: ${safetyDir}，凭据: ${envRestored ? '已还原' : '未包含'}）`)
  return {
    canceled: false,
    message: `已从备份恢复数据${manifest ? `（备份版本 ${manifest.appVersion}）` : ''}，原数据保留在 ${safetyDir}${
      envRestored ? '，.env 凭据已还原' : ''
    }${envWarning}。请重启应用生效`,
    target: source,
  }
}
