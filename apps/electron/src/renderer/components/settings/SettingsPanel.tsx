/**
 * SettingsPanel - 设置面板
 *
 * 左侧导航 + 右侧 ScrollArea 内容区域。
 * 四个标签页：通用 / 渠道配置 / 外观 / 关于
 * 使用 Jotai atom 管理当前标签页状态。
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { cn } from '@/lib/utils'
import {
  Settings,
  Radio,
  Palette,
  Info,
  Plug,
  Globe,
  BookOpen,
  Brain,
  ShieldCheck,
  Database,
  Cpu,
  HardDrive,
  Activity,
  Bell,
  Keyboard,
  X,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { settingsTabAtom } from '@/atoms/settings-tab'
import type { SettingsTab } from '@/atoms/settings-tab'
import { activeViewAtom } from '@/atoms/active-view'
import { appModeAtom } from '@/atoms/app-mode'
import { hasUpdateAtom } from '@/atoms/updater'
import { hasEnvironmentIssuesAtom } from '@/atoms/environment'
import { ChannelSettings } from './ChannelSettings'
import { GeneralSettings } from './GeneralSettings'
import { ProxySettings } from './ProxySettings'
import { AppearanceSettings } from './AppearanceSettings'
import { AboutSettings } from './AboutSettings'
import { AgentSettings } from './AgentSettings'
import { PromptSettings } from './PromptSettings'
import { MemorySettings } from './MemorySettings'
import { SecuritySettings } from './SecuritySettings'
import { SapSettings } from './SapSettings'
import { ModelSettings } from './ModelSettings'
import { DataSettings } from './DataSettings'
import { EnvironmentSettings } from './EnvironmentSettings'
import { NotificationsSettings } from './NotificationsSettings'
import { ShortcutSettings } from './ShortcutSettings'

/** 设置 Tab 定义 */
interface TabItem {
  id: SettingsTab
  label: string
  icon: React.ReactNode
}

/** 基础 Tabs（所有模式都有） */
const BASE_TABS: TabItem[] = [
  { id: 'general', label: '通用', icon: <Settings size={16} /> },
  { id: 'channels', label: '渠道', icon: <Radio size={16} /> },
  { id: 'prompts', label: '提示词', icon: <BookOpen size={16} /> },
  { id: 'proxy', label: '代理', icon: <Globe size={16} /> },
]

/** Agent 模式专属 Tab */
const AGENT_TAB: TabItem = { id: 'agent', label: '配置', icon: <Plug size={16} /> }
const MODEL_TAB: TabItem = { id: 'model', label: '模型', icon: <Cpu size={16} /> }
const MEMORY_TAB: TabItem = { id: 'memory', label: '记忆', icon: <Brain size={16} /> }
const SAP_TAB: TabItem = { id: 'sap', label: 'SAP', icon: <Database size={16} /> }
const DATA_TAB: TabItem = { id: 'data', label: '数据', icon: <HardDrive size={16} /> }
const ENVIRONMENT_TAB: TabItem = { id: 'environment', label: '环境', icon: <Activity size={16} /> }
const NOTIFICATION_TAB: TabItem = { id: 'notifications', label: '通知', icon: <Bell size={16} /> }
const SHORTCUT_TAB: TabItem = { id: 'shortcuts', label: '快捷键', icon: <Keyboard size={16} /> }

/** 尾部 Tabs */
const TAIL_TABS: TabItem[] = [
  { id: 'security', label: '安全', icon: <ShieldCheck size={16} /> },
  { id: 'appearance', label: '外观', icon: <Palette size={16} /> },
  { id: 'about', label: '关于', icon: <Info size={16} /> },
]

/** 根据标签页 id 渲染对应内容 */
function renderTabContent(tab: SettingsTab): React.ReactElement {
  switch (tab) {
    case 'general':
      return <GeneralSettings />
    case 'channels':
      return <ChannelSettings />
    case 'prompts':
      return <PromptSettings />
    case 'proxy':
      return <ProxySettings />
    case 'agent':
      return <AgentSettings />
    case 'memory':
      return <MemorySettings />
    case 'security':
      return <SecuritySettings />
    case 'sap':
      return <SapSettings />
    case 'model':
      return <ModelSettings />
    case 'data':
      return <DataSettings />
    case 'environment':
      return <EnvironmentSettings />
    case 'notifications':
      return <NotificationsSettings />
    case 'shortcuts':
      return <ShortcutSettings />
    case 'appearance':
      return <AppearanceSettings />
    case 'about':
      return <AboutSettings />
  }
}

export function SettingsPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useAtom(settingsTabAtom)
  const appMode = useAtomValue(appModeAtom)
  const hasUpdate = useAtomValue(hasUpdateAtom)
  const hasEnvironmentIssues = useAtomValue(hasEnvironmentIssuesAtom)
  const setActiveView = useSetAtom(activeViewAtom)

  /** 关闭设置面板，返回对话视图 */
  const closeSettings = React.useCallback((): void => {
    setActiveView('conversations')
  }, [setActiveView])

  // Esc 关闭设置
  React.useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeSettings()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closeSettings])

  // Agent 模式时在渠道后插入 Agent Tab，其余模块两种模式都显示
  const tabs = React.useMemo(() => {
    const common = [MEMORY_TAB, SAP_TAB, MODEL_TAB, DATA_TAB, ENVIRONMENT_TAB, NOTIFICATION_TAB, SHORTCUT_TAB]
    if (appMode === 'agent') {
      return [...BASE_TABS, AGENT_TAB, ...common, ...TAIL_TABS]
    }
    return [...BASE_TABS, ...common, ...TAIL_TABS]
  }, [appMode])

  return (
    <div className="flex h-full">
      {/* 左侧 Tab 导航 */}
      <div className="w-[180px] border-r border-border/50 pt-14 px-2">
        <div className="flex items-center justify-between px-3 mb-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            设置
          </h2>
          <button
            onClick={closeSettings}
            title="返回（Esc）"
            aria-label="关闭设置"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <nav className="flex flex-col gap-1 overflow-y-auto max-h-[calc(100vh-9rem)] pr-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                activeTab === tab.id
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.id === 'about' && hasUpdate && (
                <span className="w-2 h-2 rounded-full bg-red-500" />
              )}
              {tab.id === 'environment' && hasEnvironmentIssues && (
                <span className="w-2 h-2 rounded-full bg-red-500" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* 右侧内容区域 */}
      <ScrollArea className="flex-1 pt-14">
        <div className="px-6 pb-6">
          {renderTabContent(activeTab)}
        </div>
      </ScrollArea>
    </div>
  )
}
