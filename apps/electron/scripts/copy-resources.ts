/**
 * 复制 resources/ 到 dist/resources/
 *
 * 跨平台替代 `cp -r resources dist/`，供 electron-builder 打包与开发模式使用。
 */

import { cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const appDir = join(import.meta.dir, '..')
const src = join(appDir, 'resources')
const dest = join(appDir, 'dist', 'resources')

if (!existsSync(src)) {
  console.log('[构建] 未找到 resources 目录，跳过复制')
  process.exit(0)
}

cpSync(src, dest, { recursive: true, force: true })
console.log(`[构建] 已复制 resources → ${dest}`)
