/**
 * Split Panel Atom - 右侧分栏状态
 *
 * - browser: 内嵌浏览器（<webview>）
 * - code: HTML/CSS/JS 代码实时预览
 */

import { atom } from 'jotai'

export type SplitPane = 'browser' | 'code'

export interface SplitPanelState {
  /** 是否展开分栏 */
  open: boolean
  /** 当前分栏内容 */
  pane: SplitPane
}

export const splitPanelAtom = atom<SplitPanelState>({ open: false, pane: 'browser' })
