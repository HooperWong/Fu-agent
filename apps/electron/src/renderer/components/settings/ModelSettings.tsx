/**
 * ModelSettings - 默认模型与对话参数
 *
 * 统一设置 Agent 默认渠道/模型，以及单次查询的最大轮次与思考预算。
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import type { Channel } from '@proma/shared'
import { Loader2 } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsSelect, SettingsInput } from './primitives'
import { agentChannelIdAtom, agentModelIdAtom } from '@/atoms/agent-atoms'

/** 默认最大轮次，与主进程保持一致 */
const DEFAULT_MAX_TURNS = 30

export function ModelSettings(): React.ReactElement {
  const [channels, setChannels] = React.useState<Channel[]>([])
  const [loading, setLoading] = React.useState(true)
  const [agentChannelId, setAgentChannelId] = useAtom(agentChannelIdAtom)
  const [agentModelId, setAgentModelId] = useAtom(agentModelIdAtom)
  const [maxTurns, setMaxTurns] = React.useState(String(DEFAULT_MAX_TURNS))
  const [thinkingTokens, setThinkingTokens] = React.useState('')
  const [notice, setNotice] = React.useState<string | null>(null)

  React.useEffect(() => {
    void (async () => {
      try {
        const [list, settings] = await Promise.all([
          window.electronAPI.listChannels(),
          window.electronAPI.getSettings(),
        ])
        setChannels(list.filter((channel) => channel.enabled))
        setMaxTurns(String(settings.agentMaxTurns ?? DEFAULT_MAX_TURNS))
        setThinkingTokens(
          settings.agentMaxThinkingTokens ? String(settings.agentMaxThinkingTokens) : ''
        )
      } catch (error) {
        console.error('[模型设置] 加载失败:', error)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const currentChannel = channels.find((channel) => channel.id === agentChannelId)
  const modelOptions = (currentChannel?.models ?? [])
    .filter((model) => model.enabled)
    .map((model) => ({ value: model.id, label: model.name || model.id }))

  /** 切换默认渠道，并自动选中该渠道第一个启用模型 */
  const handleChannelChange = async (channelId: string): Promise<void> => {
    const channel = channels.find((item) => item.id === channelId)
    const firstModel = channel?.models.find((model) => model.enabled)?.id ?? ''
    setAgentChannelId(channelId)
    setAgentModelId(firstModel || null)
    await window.electronAPI.updateSettings({
      agentChannelId: channelId,
      agentModelId: firstModel || undefined,
    })
  }

  const handleModelChange = async (modelId: string): Promise<void> => {
    setAgentModelId(modelId)
    await window.electronAPI.updateSettings({ agentModelId: modelId })
  }

  /** 保存最大轮次（1-200） */
  const handleMaxTurnsBlur = async (): Promise<void> => {
    const parsed = Number.parseInt(maxTurns, 10)
    const value = Number.isFinite(parsed) ? Math.min(200, Math.max(1, parsed)) : DEFAULT_MAX_TURNS
    setMaxTurns(String(value))
    await window.electronAPI.updateSettings({ agentMaxTurns: value })
    setNotice(`已保存：最大轮次 ${value}`)
  }

  /** 保存思考预算（0 或留空表示不限制） */
  const handleThinkingBlur = async (): Promise<void> => {
    const parsed = Number.parseInt(thinkingTokens, 10)
    const value = Number.isFinite(parsed) && parsed > 0 ? Math.min(100000, parsed) : 0
    setThinkingTokens(value > 0 ? String(value) : '')
    await window.electronAPI.updateSettings({
      agentMaxThinkingTokens: value > 0 ? value : undefined,
    })
    setNotice(value > 0 ? `已保存：思考预算 ${value} tokens` : '已保存：思考预算交由模型默认')
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载中…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        title="默认模型"
        description="新建 Agent 会话时使用的渠道与模型"
      >
        <SettingsCard>
          {channels.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted-foreground text-center">
              没有已启用的渠道，请先在「渠道」中配置
            </div>
          ) : (
            <>
              <SettingsSelect
                label="默认渠道"
                description="仅列出已启用的渠道"
                value={agentChannelId ?? ''}
                onValueChange={(value) => void handleChannelChange(value)}
                options={channels.map((channel) => ({ value: channel.id, label: channel.name }))}
                placeholder="选择渠道"
              />
              <SettingsSelect
                label="默认模型"
                description="该渠道下已启用的模型"
                value={agentModelId ?? ''}
                onValueChange={(value) => void handleModelChange(value)}
                options={modelOptions}
                placeholder={modelOptions.length > 0 ? '选择模型' : '该渠道暂无可用模型'}
                disabled={modelOptions.length === 0}
              />
            </>
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="对话参数"
        description="控制单次 Agent 查询的执行深度"
      >
        <SettingsCard>
          <SettingsInput
            label="最大轮次"
            description="单次查询允许的最大工具调用轮次，1-200，默认 30"
            value={maxTurns}
            onChange={setMaxTurns}
            type="number"
          />
          <SettingsInput
            label="思考预算（tokens）"
            description="扩展思考 token 上限；旧模型按数值生效，新模型按自适应处理，留空或 0 表示关闭"
            value={thinkingTokens}
            onChange={setThinkingTokens}
            placeholder="留空表示关闭"
            type="number"
          />
          <div className="px-4 pb-4 flex items-center gap-2">
            <button
              onClick={() => {
                void handleMaxTurnsBlur()
                void handleThinkingBlur()
              }}
              className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              保存参数
            </button>
            {notice && <span className="text-xs text-muted-foreground">{notice}</span>}
          </div>
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
