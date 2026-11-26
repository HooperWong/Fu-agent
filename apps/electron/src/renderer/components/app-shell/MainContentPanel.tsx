/**
 * MainContentPanel - 主内容面板
 *
 * 根据当前活跃视图显示不同内容：
 * - conversations: 根据 App 模式显示 Chat/Agent 内容
 * - settings: 显示设置面板
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { appModeAtom } from '@/atoms/app-mode'
import { activeViewAtom } from '@/atoms/active-view'
import { Panel } from './Panel'
import { ChatView } from '@/components/chat'
import { AgentView } from '@/components/agent'
import { SettingsPanel } from '@/components/settings'
import { EfficiencyView } from '@/components/efficiency/EfficiencyView'
import { NotesView } from '@/components/notes/NotesView'

export function MainContentPanel(): React.ReactElement {
  const mode = useAtomValue(appModeAtom)
  const activeView = useAtomValue(activeViewAtom)

  /** 渲染对话视图内容 */
  const renderConversations = (): React.ReactElement => {
    return mode === 'chat' ? <ChatView /> : <AgentView />
  }

  /** 渲染主内容 */
  const renderContent = (): React.ReactElement => {
    if (activeView === 'settings') return <SettingsPanel />
    if (
      activeView === 'tasks' ||
      activeView === 'todos' ||
      activeView === 'calendar' ||
      activeView === 'projects' ||
      activeView === 'scheduler'
    ) {
      return <EfficiencyView kind={activeView} />
    }
    if (activeView === 'notes') return <NotesView />
    return renderConversations()
  }

  return (
    <Panel
      variant="grow"
      className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl shadow-xl border border-border/50"
    >
      {renderContent()}
    </Panel>
  )
}
