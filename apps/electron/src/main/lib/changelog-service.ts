/**
 * 版本更新日志服务
 *
 * 读取仓库根目录的 CHANGELOG.md（随应用一起迁移），
 * 供「设置 → 关于 → 版本更新日志」展示本地版本进展。
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isProductionBuild } from './app-mode'

/**
 * CHANGELOG.md 路径
 *
 * - 打包模式：由 electron-builder extraResources 放到 resources/CHANGELOG.md
 * - 开发模式：dist/main.cjs → 上溯三级即仓库根目录
 */
const CHANGELOG_PATH = isProductionBuild()
  ? join(process.resourcesPath, 'CHANGELOG.md')
  : join(__dirname, '..', '..', '..', 'CHANGELOG.md')

/**
 * 读取更新日志内容
 *
 * @returns Markdown 文本；文件缺失或读取失败时返回空字符串
 */
export function getChangelog(): string {
  try {
    if (!existsSync(CHANGELOG_PATH)) {
      console.warn(`[更新日志] 未找到文件: ${CHANGELOG_PATH}`)
      return ''
    }
    return readFileSync(CHANGELOG_PATH, 'utf-8')
  } catch (error) {
    console.error('[更新日志] 读取失败:', error)
    return ''
  }
}

/**
 * 通用本地文档读取（与 CHANGELOG 同一资源目录约定）
 *
 * - 打包模式：resources/<文件名>
 * - 开发模式：仓库根目录/<文件名>
 */
function readRootDoc(filename: string): string {
  const path = isProductionBuild()
    ? join(process.resourcesPath, filename)
    : join(__dirname, '..', '..', '..', filename)

  try {
    if (!existsSync(path)) {
      console.warn(`[许可文档] 未找到文件: ${path}`)
      return ''
    }
    return readFileSync(path, 'utf-8')
  } catch (error) {
    console.error(`[许可文档] ${filename} 读取失败:`, error)
    return ''
  }
}

/** 读取上游分发声明（NOTICE.md） */
export function getAppNotice(): string {
  return readRootDoc('NOTICE.md')
}

/** 读取第三方组件声明（THIRD-PARTY-NOTICES.md） */
export function getThirdPartyNotices(): string {
  return readRootDoc('THIRD-PARTY-NOTICES.md')
}
