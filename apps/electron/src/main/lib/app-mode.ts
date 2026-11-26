/**
 * 运行模式判定
 *
 * Electron 40 起，`electron .` 开发模式下 app.isPackaged 也会返回 true，
 * 导致"打包/开发"分支判断失效。这里改用渲染产物是否存在来判定：
 * 开发模式由 Vite 提供页面，dist/renderer/index.html 不存在。
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** 是否为开发模式（页面由 Vite dev server 提供） */
export function isDevMode(): boolean {
  return !existsSync(join(__dirname, 'renderer', 'index.html'))
}

/** 是否为完整的生产构建（含渲染产物） */
export function isProductionBuild(): boolean {
  return !isDevMode()
}
