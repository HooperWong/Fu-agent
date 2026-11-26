/**
 * 分栏预览相关类型
 *
 * 代码预览面板的 HTML/CSS/JS 内容，落盘在 data/playground/state.json。
 */

export interface PlaygroundState {
  html: string
  css: string
  js: string
}

export const PREVIEW_IPC_CHANNELS = {
  LOAD: 'preview:load',
  SAVE: 'preview:save',
} as const
