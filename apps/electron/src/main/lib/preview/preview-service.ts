/**
 * 代码预览服务
 *
 * 保存分栏「代码预览」面板的 HTML/CSS/JS 草稿，
 * 落盘 data/playground/state.json，随数据目录整体迁移。
 */

import { join } from 'node:path'
import { getConfigDir } from '../config-paths'
import { ensureDir, readJson, writeJson } from '../storage/json-store'
import type { PlaygroundState } from '../../../types'

const DEFAULT_STATE: PlaygroundState = {
  html: '<h1>你好，Fu Agent</h1>\n<p>左侧「对话」，右侧实时预览。</p>\n<button id="btn">点我</button>',
  css: 'body {\n  font-family: -apple-system, "PingFang SC", sans-serif;\n  padding: 24px;\n  color: #1f2937;\n}\nbutton {\n  padding: 6px 14px;\n  border-radius: 6px;\n  border: 1px solid #d1d5db;\n  background: #3a82e6;\n  color: #fff;\n}',
  js: "document.getElementById('btn')?.addEventListener('click', () => {\n  alert('已点击');\n})",
}

function stateFile(): string {
  const dir = join(getConfigDir(), 'playground')
  ensureDir(dir)
  return join(dir, 'state.json')
}

export function loadPlayground(): PlaygroundState {
  return readJson<PlaygroundState>(stateFile(), DEFAULT_STATE)
}

export function savePlayground(state: PlaygroundState): void {
  writeJson(stateFile(), {
    html: state.html ?? '',
    css: state.css ?? '',
    js: state.js ?? '',
  })
}
