/**
 * IPC 处理器模块
 *
 * 负责注册主进程和渲染进程之间的通信处理器
 */

import { ipcMain, nativeTheme, shell, dialog, BrowserWindow, Menu, Notification } from 'electron'
import { IPC_CHANNELS, CHANNEL_IPC_CHANNELS, CHAT_IPC_CHANNELS, AGENT_IPC_CHANNELS, ENVIRONMENT_IPC_CHANNELS, PROXY_IPC_CHANNELS, GITHUB_RELEASE_IPC_CHANNELS, SYSTEM_PROMPT_IPC_CHANNELS, MEMORY_IPC_CHANNELS } from '@proma/shared'
import { USER_PROFILE_IPC_CHANNELS, SETTINGS_IPC_CHANNELS, SECURITY_IPC_CHANNELS, EFFICIENCY_IPC_CHANNELS, NOTE_IPC_CHANNELS, PREVIEW_IPC_CHANNELS, SAP_IPC_CHANNELS, DATA_IPC_CHANNELS } from '../types'
import type {
  RuntimeStatus,
  GitRepoStatus,
  Channel,
  ChannelCreateInput,
  ChannelUpdateInput,
  ChannelTestResult,
  FetchModelsInput,
  FetchModelsResult,
  ConversationMeta,
  ChatMessage,
  ChatSendInput,
  GenerateTitleInput,
  AttachmentSaveInput,
  AttachmentSaveResult,
  FileDialogResult,
  RecentMessagesResult,
  AgentSessionMeta,
  AgentMessage,
  AgentSendInput,
  AgentWorkspace,
  AgentGenerateTitleInput,
  AgentSaveFilesInput,
  AgentSavedFile,
  AgentCopyFolderInput,
  GetTaskOutputInput,
  GetTaskOutputResult,
  StopTaskInput,
  WorkspaceMcpConfig,
  SkillMeta,
  WorkspaceCapabilities,
  FileEntry,
  EnvironmentCheckResult,
  ProxyConfig,
  SystemProxyDetectResult,
  GitHubRelease,
  GitHubReleaseListOptions,
  PermissionResponse,
  PromaPermissionMode,
  AskUserResponse,
  SystemPromptConfig,
  SystemPrompt,
  SystemPromptCreateInput,
  SystemPromptUpdateInput,
  MemoryConfig,
} from '@proma/shared'
import type { UserProfile, AppSettings, SecretStatus, AuditEntry, ApprovalRequest, ApprovalResult, DataOverview, DataTransferResult, SapRuntimeStatus } from '../types'
import type { Task, Todo, CalendarEvent, Project, ScheduledJob, SchedulerRun } from '../types'
import { getSecretStatuses, setSecret } from './lib/security/secret-service'
import { requestApproval, getAuditLog } from './lib/security/approval-service'
import {
  listTasks,
  createTask,
  updateTask,
  removeTask,
  listTodos,
  createTodo,
  updateTodo,
  removeTodo,
  listEvents,
  createEvent,
  updateEvent,
  removeEvent,
  listProjects,
  createProject,
  updateProject,
  removeProject,
  listJobs,
  createJob,
  updateJob,
  removeJob,
  runJob,
} from './lib/efficiency/efficiency-service'
import type {
  TaskInput,
  TodoInput,
  EventInput,
  ProjectInput,
  JobInput,
} from '../types'
import type { Note, NoteMeta, NoteInput, NoteGroup, NoteGroupInput, NoteSearchResult, PlaygroundState, SapEnvironment, SapEnvironmentInput, SapWorkspaceBinding, SapImportResult, SapVendorResult } from '../types'
import {
  listNotes,
  getNote,
  createNote,
  updateNote,
  removeNote,
  listGroups,
  createGroup,
  updateGroup,
  removeGroup,
  searchNotes,
  importNoteImage,
} from './lib/notes/note-service'
import { loadPlayground, savePlayground } from './lib/preview/preview-service'
import {
  listSapEnvironments,
  createSapEnvironment,
  updateSapEnvironment,
  removeSapEnvironment,
  applySapToWorkspace,
  detachSapFromWorkspace,
  getSapBindings,
  importFromCodeBuddy,
  vendorSapRuntime,
  getSapRuntimeStatus,
} from './lib/sap/sap-service'
import {
  getDataOverview,
  openDataDir,
  exportDataBackup,
  exportDataZip,
  importDataBackup,
} from './lib/data-service'
import { getRuntimeStatus, getGitRepoStatus } from './lib/runtime-init'
import { registerUpdaterIpc } from './lib/updater/updater-ipc'
import {
  listChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  decryptApiKey,
  testChannel,
  testChannelDirect,
  fetchModels,
} from './lib/channel-manager'
import {
  listConversations,
  createConversation,
  getConversationMessages,
  getRecentMessages,
  updateConversationMeta,
  deleteConversation,
  deleteMessage,
  truncateMessagesFrom,
  updateContextDividers,
} from './lib/conversation-manager'
import { sendMessage, stopGeneration, generateTitle } from './lib/chat-service'
import {
  saveAttachment,
  readAttachmentAsBase64,
  deleteAttachment,
  openFileDialog,
} from './lib/attachment-service'
import { extractTextFromAttachment } from './lib/document-parser'
import { getUserProfile, updateUserProfile } from './lib/user-profile-service'
import { getSettings, updateSettings } from './lib/settings-service'
import { createTray, destroyTray, getTray } from './tray'
import { checkEnvironment } from './lib/environment-checker'
import { getProxySettings, saveProxySettings } from './lib/proxy-settings-service'
import { detectSystemProxy } from './lib/system-proxy-detector'
import {
  listAgentSessions,
  createAgentSession,
  getAgentSessionMessages,
  updateAgentSessionMeta,
  deleteAgentSession,
  duplicateAgentSession,
  rollbackAgentSession,
  setAgentSessionFlags,
} from './lib/agent-session-manager'
import { runAgent, stopAgent, generateAgentTitle, saveFilesToAgentSession, copyFolderToSession } from './lib/agent-service'
import { permissionService } from './lib/agent-permission-service'
import { askUserService } from './lib/agent-ask-user-service'
import { getAgentSessionWorkspacePath, getAgentWorkspacesDir } from './lib/config-paths'
import {
  listAgentWorkspaces,
  createAgentWorkspace,
  updateAgentWorkspace,
  deleteAgentWorkspace,
  ensureDefaultWorkspace,
  getWorkspaceMcpConfig,
  saveWorkspaceMcpConfig,
  getWorkspaceSkills,
  getWorkspaceCapabilities,
  getAgentWorkspace,
  deleteWorkspaceSkill,
  copyWorkspaceSkillAsPersonal,
  getWorkspacePermissionMode,
  setWorkspacePermissionMode,
} from './lib/agent-workspace-manager'
import { getMemoryConfig, setMemoryConfig } from './lib/memory-service'
import { exportChatAsMarkdown, exportAgentSessionAsMarkdown } from './lib/export-markdown-service'
import {
  getSystemPromptConfig,
  createSystemPrompt,
  updateSystemPrompt,
  deleteSystemPrompt,
  updateAppendSetting,
  setDefaultPrompt,
} from './lib/system-prompt-manager'
import {
  getLatestRelease,
  listReleases as listGitHubReleases,
  getReleaseByTag,
} from './lib/github-release-service'
import { getChangelog, getAppNotice, getThirdPartyNotices } from './lib/changelog-service'

/**
 * SAP 写操作授权
 *
 * 安全底线：默认只读，开启写能力前必须由用户确认并记入审计日志。
 */
async function ensureSapWritesApproved(code: string): Promise<void> {
  const approval = await requestApproval({
    action: 'sap.enable-writes',
    title: '开启 SAP 写操作',
    description: `环境 ${code} 将允许 arc-1 执行写操作（创建 / 修改 / 激活对象等）`,
    detail: '写操作会直接修改 SAP 系统内容，请确认已获得授权。传输、Git、删包等高危动作仍保持禁用。',
    risk: 'destructive',
  })
  if (!approval.approved) {
    throw new Error('未授权开启 SAP 写操作，环境保持只读')
  }
}

/**
 * 注册 IPC 处理器
 */
export function registerIpcHandlers(): void {
  console.log('[IPC] 正在注册 IPC 处理器...')

  // ===== 运行时相关 =====

  // 获取运行时状态
  ipcMain.handle(
    IPC_CHANNELS.GET_RUNTIME_STATUS,
    async (): Promise<RuntimeStatus | null> => {
      return getRuntimeStatus()
    }
  )

  // 获取指定目录的 Git 仓库状态
  ipcMain.handle(
    IPC_CHANNELS.GET_GIT_REPO_STATUS,
    async (_, dirPath: string): Promise<GitRepoStatus | null> => {
      if (!dirPath || typeof dirPath !== 'string') {
        console.warn('[IPC] git:get-repo-status 收到无效的目录路径')
        return null
      }

      return getGitRepoStatus(dirPath)
    }
  )

  // 在系统默认浏览器中打开外部链接
  ipcMain.handle(
    IPC_CHANNELS.OPEN_EXTERNAL,
    async (_, url: string): Promise<void> => {
      if (!url || typeof url !== 'string') {
        console.warn('[IPC] shell:open-external 收到无效的 URL')
        return
      }
      // 仅允许 http/https 协议，防止安全风险
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.warn('[IPC] shell:open-external 仅支持 http/https 协议:', url)
        return
      }
      await shell.openExternal(url)
    }
  )

  // 获取本地版本更新日志（CHANGELOG.md）
  ipcMain.handle(
    IPC_CHANNELS.GET_CHANGELOG,
    async (): Promise<string> => {
      return getChangelog()
    }
  )

  // 获取上游分发声明（NOTICE.md）
  ipcMain.handle(
    IPC_CHANNELS.GET_APP_NOTICE,
    async (): Promise<string> => {
      return getAppNotice()
    }
  )

  // 获取第三方组件声明（THIRD-PARTY-NOTICES.md）
  ipcMain.handle(
    IPC_CHANNELS.GET_THIRD_PARTY_NOTICES,
    async (): Promise<string> => {
      return getThirdPartyNotices()
    }
  )

  // ===== 渠道管理相关 =====

  // 获取所有渠道（apiKey 保持加密态）
  ipcMain.handle(
    CHANNEL_IPC_CHANNELS.LIST,
    async (): Promise<Channel[]> => {
      return listChannels()
    }
  )

  // 创建渠道
  ipcMain.handle(
    CHANNEL_IPC_CHANNELS.CREATE,
    async (_, input: ChannelCreateInput): Promise<Channel> => {
      return createChannel(input)
    }
  )

  // 更新渠道
  ipcMain.handle(
    CHANNEL_IPC_CHANNELS.UPDATE,
    async (_, id: string, input: ChannelUpdateInput): Promise<Channel> => {
      return updateChannel(id, input)
    }
  )

  // 删除渠道
  ipcMain.handle(
    CHANNEL_IPC_CHANNELS.DELETE,
    async (_, id: string): Promise<void> => {
      return deleteChannel(id)
    }
  )

  // 解密 API Key（仅在用户查看时调用）
  ipcMain.handle(
    CHANNEL_IPC_CHANNELS.DECRYPT_KEY,
    async (_, channelId: string): Promise<string> => {
      return decryptApiKey(channelId)
    }
  )

  // 测试渠道连接
  ipcMain.handle(
    CHANNEL_IPC_CHANNELS.TEST,
    async (_, channelId: string): Promise<ChannelTestResult> => {
      return testChannel(channelId)
    }
  )

  // 直接测试连接（无需已保存渠道，传入明文凭证）
  ipcMain.handle(
    CHANNEL_IPC_CHANNELS.TEST_DIRECT,
    async (_, input: FetchModelsInput): Promise<ChannelTestResult> => {
      return testChannelDirect(input)
    }
  )

  // 从供应商拉取可用模型列表（直接传入凭证，无需已保存渠道）
  ipcMain.handle(
    CHANNEL_IPC_CHANNELS.FETCH_MODELS,
    async (_, input: FetchModelsInput): Promise<FetchModelsResult> => {
      return fetchModels(input)
    }
  )

  // ===== 对话管理相关 =====

  // 获取对话列表
  ipcMain.handle(
    CHAT_IPC_CHANNELS.LIST_CONVERSATIONS,
    async (): Promise<ConversationMeta[]> => {
      return listConversations()
    }
  )

  // 创建对话
  ipcMain.handle(
    CHAT_IPC_CHANNELS.CREATE_CONVERSATION,
    async (_, title?: string, modelId?: string, channelId?: string): Promise<ConversationMeta> => {
      return createConversation(title, modelId, channelId)
    }
  )

  // 获取对话消息
  ipcMain.handle(
    CHAT_IPC_CHANNELS.GET_MESSAGES,
    async (_, id: string): Promise<ChatMessage[]> => {
      return getConversationMessages(id)
    }
  )

  // 获取对话最近 N 条消息（分页加载）
  ipcMain.handle(
    CHAT_IPC_CHANNELS.GET_RECENT_MESSAGES,
    async (_, id: string, limit: number): Promise<RecentMessagesResult> => {
      return getRecentMessages(id, limit)
    }
  )

  // 更新对话标题
  ipcMain.handle(
    CHAT_IPC_CHANNELS.UPDATE_TITLE,
    async (_, id: string, title: string): Promise<ConversationMeta> => {
      return updateConversationMeta(id, { title })
    }
  )

  // 更新对话使用的模型/渠道
  ipcMain.handle(
    CHAT_IPC_CHANNELS.UPDATE_MODEL,
    async (_, id: string, modelId: string, channelId: string): Promise<ConversationMeta> => {
      return updateConversationMeta(id, { modelId, channelId })
    }
  )

  // 删除对话
  ipcMain.handle(
    CHAT_IPC_CHANNELS.DELETE_CONVERSATION,
    async (_, id: string): Promise<void> => {
      const approval = await requestApproval({
        action: 'delete-conversation',
        title: '删除对话',
        description: '该对话及其消息记录将被永久删除，无法恢复。',
        detail: `对话 ID：${id}`,
        risk: 'destructive',
      })
      if (!approval.approved) return
      return deleteConversation(id)
    }
  )

  // 切换对话置顶状态
  ipcMain.handle(
    CHAT_IPC_CHANNELS.TOGGLE_PIN,
    async (_, id: string): Promise<ConversationMeta> => {
      const conversations = listConversations()
      const current = conversations.find((c) => c.id === id)
      if (!current) throw new Error(`对话不存在: ${id}`)
      return updateConversationMeta(id, { pinned: !current.pinned })
    }
  )

  // 导出对话为 Markdown
  ipcMain.handle(
    CHAT_IPC_CHANNELS.EXPORT_MARKDOWN,
    async (_, conversationId: string, title: string): Promise<string | null> => {
      return exportChatAsMarkdown(conversationId, title)
    }
  )

  // 发送消息（触发 AI 流式响应）
  // 注意：通过 event.sender 获取 webContents 用于推送流式事件
  ipcMain.handle(
    CHAT_IPC_CHANNELS.SEND_MESSAGE,
    async (event, input: ChatSendInput): Promise<void> => {
      await sendMessage(input, event.sender)
    }
  )

  // 中止生成
  ipcMain.handle(
    CHAT_IPC_CHANNELS.STOP_GENERATION,
    async (_, conversationId: string): Promise<void> => {
      stopGeneration(conversationId)
    }
  )

  // 删除消息
  ipcMain.handle(
    CHAT_IPC_CHANNELS.DELETE_MESSAGE,
    async (_, conversationId: string, messageId: string): Promise<ChatMessage[]> => {
      return deleteMessage(conversationId, messageId)
    }
  )

  // 从指定消息开始截断（包含该消息）
  ipcMain.handle(
    CHAT_IPC_CHANNELS.TRUNCATE_MESSAGES_FROM,
    async (
      _,
      conversationId: string,
      messageId: string,
      preserveFirstMessageAttachments?: boolean,
    ): Promise<ChatMessage[]> => {
      return truncateMessagesFrom(
        conversationId,
        messageId,
        preserveFirstMessageAttachments ?? false,
      )
    }
  )

  // 更新上下文分隔线
  ipcMain.handle(
    CHAT_IPC_CHANNELS.UPDATE_CONTEXT_DIVIDERS,
    async (_, conversationId: string, dividers: string[]): Promise<ConversationMeta> => {
      return updateContextDividers(conversationId, dividers)
    }
  )

  // 生成对话标题
  ipcMain.handle(
    CHAT_IPC_CHANNELS.GENERATE_TITLE,
    async (_, input: GenerateTitleInput): Promise<string | null> => {
      return generateTitle(input)
    }
  )

  // ===== 附件管理相关 =====

  // 保存附件到本地
  ipcMain.handle(
    CHAT_IPC_CHANNELS.SAVE_ATTACHMENT,
    async (_, input: AttachmentSaveInput): Promise<AttachmentSaveResult> => {
      return saveAttachment(input)
    }
  )

  // 读取附件（返回 base64）
  ipcMain.handle(
    CHAT_IPC_CHANNELS.READ_ATTACHMENT,
    async (_, localPath: string): Promise<string> => {
      return readAttachmentAsBase64(localPath)
    }
  )

  // 删除附件
  ipcMain.handle(
    CHAT_IPC_CHANNELS.DELETE_ATTACHMENT,
    async (_, localPath: string): Promise<void> => {
      deleteAttachment(localPath)
    }
  )

  // 打开文件选择对话框
  ipcMain.handle(
    CHAT_IPC_CHANNELS.OPEN_FILE_DIALOG,
    async (): Promise<FileDialogResult> => {
      return openFileDialog()
    }
  )

  // 提取附件文档的文本内容
  ipcMain.handle(
    CHAT_IPC_CHANNELS.EXTRACT_ATTACHMENT_TEXT,
    async (_, localPath: string): Promise<string> => {
      return extractTextFromAttachment(localPath)
    }
  )

  // ===== 用户档案相关 =====

  // 获取用户档案
  ipcMain.handle(
    USER_PROFILE_IPC_CHANNELS.GET,
    async (): Promise<UserProfile> => {
      return getUserProfile()
    }
  )

  // 更新用户档案
  ipcMain.handle(
    USER_PROFILE_IPC_CHANNELS.UPDATE,
    async (_, updates: Partial<UserProfile>): Promise<UserProfile> => {
      return updateUserProfile(updates)
    }
  )

  // ===== 应用设置相关 =====

  // 获取应用设置
  ipcMain.handle(
    SETTINGS_IPC_CHANNELS.GET,
    async (): Promise<AppSettings> => {
      return getSettings()
    }
  )

  // 获取当前数据目录（用于设置页展示，帮助发现数据目录漂移）
  ipcMain.handle(
    SETTINGS_IPC_CHANNELS.GET_DATA_DIR,
    async (): Promise<string> => {
      const { getConfigDir } = await import('./lib/config-paths')
      return getConfigDir()
    }
  )

  // 更新应用设置
  ipcMain.handle(
    SETTINGS_IPC_CHANNELS.UPDATE,
    async (_, updates: Partial<AppSettings>): Promise<AppSettings> => {
      const result = updateSettings(updates)

      // 快捷键变更时重建菜单
      if (updates.newConversationShortcut !== undefined || updates.shortcuts !== undefined) {
        const { createApplicationMenu } = await import('./menu')
        const newMenu = createApplicationMenu()
        Menu.setApplicationMenu(newMenu)
      }

      // 响应托盘图标显隐设置变更
      if (updates.showTrayIcon !== undefined) {
        if (updates.showTrayIcon) {
          if (!getTray()) createTray()
        } else {
          destroyTray()
        }
      }

      return result
    }
  )

  // 获取系统主题（是否深色模式）
  ipcMain.handle(
    SETTINGS_IPC_CHANNELS.GET_SYSTEM_THEME,
    async (): Promise<boolean> => {
      return nativeTheme.shouldUseDarkColors
    }
  )

  // 监听系统主题变化，推送给所有渲染进程窗口
  nativeTheme.on('updated', () => {
    const isDark = nativeTheme.shouldUseDarkColors
    console.log(`[设置] 系统主题变化: ${isDark ? '深色' : '浅色'}`)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(SETTINGS_IPC_CHANNELS.ON_SYSTEM_THEME_CHANGED, isDark)
    })
  })

  // ===== 安全相关（密钥状态 / 授权审批 / 审计日志） =====

  // 获取密钥配置状态（只返回掩码，不回传明文）
  ipcMain.handle(
    SECURITY_IPC_CHANNELS.GET_SECRET_STATUS,
    async (): Promise<SecretStatus[]> => {
      return getSecretStatuses()
    }
  )

  // 写入密钥到 .env
  ipcMain.handle(
    SECURITY_IPC_CHANNELS.SET_SECRET,
    async (_, key: string, value: string): Promise<SecretStatus[]> => {
      return setSecret(key, value)
    }
  )

  // 读取授权审计日志
  ipcMain.handle(
    SECURITY_IPC_CHANNELS.GET_AUDIT_LOG,
    async (_, limit?: number): Promise<AuditEntry[]> => {
      return getAuditLog(limit ?? 50)
    }
  )

  // 供渲染进程主动发起的授权请求
  ipcMain.handle(
    SECURITY_IPC_CHANNELS.REQUEST_APPROVAL,
    async (_, request: ApprovalRequest): Promise<ApprovalResult> => {
      return requestApproval(request)
    }
  )

  // ===== 效率模块：任务 =====

  ipcMain.handle(EFFICIENCY_IPC_CHANNELS.TASKS_LIST, async (): Promise<Task[]> => listTasks())

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.TASKS_CREATE,
    async (_, input: TaskInput): Promise<Task> => createTask(input)
  )

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.TASKS_UPDATE,
    async (_, id: string, patch: Partial<TaskInput>): Promise<Task> => updateTask(id, patch)
  )

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.TASKS_REMOVE,
    async (_, id: string): Promise<void> => removeTask(id)
  )

  // ===== 效率模块：待办 =====

  ipcMain.handle(EFFICIENCY_IPC_CHANNELS.TODOS_LIST, async (): Promise<Todo[]> => listTodos())

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.TODOS_CREATE,
    async (_, input: TodoInput): Promise<Todo> => createTodo(input)
  )

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.TODOS_UPDATE,
    async (_, id: string, patch: Partial<TodoInput>): Promise<Todo> => updateTodo(id, patch)
  )

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.TODOS_REMOVE,
    async (_, id: string): Promise<void> => removeTodo(id)
  )

  // ===== 效率模块：日程 =====

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.EVENTS_LIST,
    async (): Promise<CalendarEvent[]> => listEvents()
  )

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.EVENTS_CREATE,
    async (_, input: EventInput): Promise<CalendarEvent> => createEvent(input)
  )

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.EVENTS_UPDATE,
    async (_, id: string, patch: Partial<EventInput>): Promise<CalendarEvent> =>
      updateEvent(id, patch)
  )

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.EVENTS_REMOVE,
    async (_, id: string): Promise<void> => removeEvent(id)
  )

  // ===== 效率模块：项目 =====

  ipcMain.handle(EFFICIENCY_IPC_CHANNELS.PROJECTS_LIST, async (): Promise<Project[]> => listProjects())

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.PROJECTS_CREATE,
    async (_, input: ProjectInput): Promise<Project> => createProject(input)
  )

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.PROJECTS_UPDATE,
    async (_, id: string, patch: Partial<ProjectInput>): Promise<Project> =>
      updateProject(id, patch)
  )

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.PROJECTS_REMOVE,
    async (_, id: string): Promise<void> => removeProject(id)
  )

  // ===== 效率模块：定时任务 =====

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.JOBS_LIST,
    async (): Promise<ScheduledJob[]> => listJobs()
  )

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.JOBS_CREATE,
    async (_, input: JobInput): Promise<ScheduledJob> => createJob(input)
  )

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.JOBS_UPDATE,
    async (_, id: string, patch: Partial<JobInput>): Promise<ScheduledJob> => updateJob(id, patch)
  )

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.JOBS_REMOVE,
    async (_, id: string): Promise<void> => removeJob(id)
  )

  ipcMain.handle(
    EFFICIENCY_IPC_CHANNELS.JOBS_RUN_NOW,
    async (_, id: string): Promise<SchedulerRun> => runJob(id)
  )

  // ===== 笔记模块 =====

  ipcMain.handle(NOTE_IPC_CHANNELS.NOTES_LIST, async (): Promise<NoteMeta[]> => listNotes())

  ipcMain.handle(
    NOTE_IPC_CHANNELS.NOTES_GET,
    async (_, id: string): Promise<Note | null> => getNote(id)
  )

  ipcMain.handle(
    NOTE_IPC_CHANNELS.NOTES_CREATE,
    async (_, input: NoteInput): Promise<Note> => createNote(input)
  )

  ipcMain.handle(
    NOTE_IPC_CHANNELS.NOTES_UPDATE,
    async (_, id: string, patch: NoteInput): Promise<Note> => updateNote(id, patch)
  )

  ipcMain.handle(
    NOTE_IPC_CHANNELS.NOTES_REMOVE,
    async (_, id: string): Promise<void> => removeNote(id)
  )

  ipcMain.handle(
    NOTE_IPC_CHANNELS.NOTES_SEARCH,
    async (_, query: string): Promise<NoteSearchResult[]> => searchNotes(query)
  )

  ipcMain.handle(
    NOTE_IPC_CHANNELS.NOTES_IMPORT_IMAGE,
    async (_, noteId: string, fileName: string, dataUrl: string): Promise<string> =>
      importNoteImage(fileName, dataUrl)
  )

  ipcMain.handle(NOTE_IPC_CHANNELS.GROUPS_LIST, async (): Promise<NoteGroup[]> => listGroups())

  ipcMain.handle(
    NOTE_IPC_CHANNELS.GROUPS_CREATE,
    async (_, input: NoteGroupInput): Promise<NoteGroup> => createGroup(input)
  )

  ipcMain.handle(
    NOTE_IPC_CHANNELS.GROUPS_UPDATE,
    async (_, id: string, patch: Partial<NoteGroupInput>): Promise<NoteGroup> =>
      updateGroup(id, patch)
  )

  ipcMain.handle(
    NOTE_IPC_CHANNELS.GROUPS_REMOVE,
    async (_, id: string): Promise<void> => removeGroup(id)
  )

  // ===== 分栏代码预览 =====

  ipcMain.handle(PREVIEW_IPC_CHANNELS.LOAD, async (): Promise<PlaygroundState> => loadPlayground())

  ipcMain.handle(
    PREVIEW_IPC_CHANNELS.SAVE,
    async (_, state: PlaygroundState): Promise<void> => savePlayground(state)
  )

  // ===== SAP 多环境（arc-1 MCP） =====

  ipcMain.handle(SAP_IPC_CHANNELS.LIST, async (): Promise<SapEnvironment[]> => listSapEnvironments())

  ipcMain.handle(
    SAP_IPC_CHANNELS.CREATE,
    async (_, input: SapEnvironmentInput): Promise<SapEnvironment> => {
      if (input.allowWrites) await ensureSapWritesApproved(input.code)
      return createSapEnvironment(input)
    }
  )

  ipcMain.handle(
    SAP_IPC_CHANNELS.UPDATE,
    async (_, id: string, patch: Partial<SapEnvironmentInput>): Promise<SapEnvironment> => {
      if (patch.allowWrites === true) {
        const current = listSapEnvironments().find((item) => item.id === id)
        if (!current?.allowWrites) await ensureSapWritesApproved(current?.code ?? id)
      }
      return updateSapEnvironment(id, patch)
    }
  )

  ipcMain.handle(
    SAP_IPC_CHANNELS.REMOVE,
    async (_, id: string): Promise<void> => removeSapEnvironment(id)
  )

  ipcMain.handle(
    SAP_IPC_CHANNELS.BINDINGS,
    async (_, workspaceSlug: string): Promise<SapWorkspaceBinding[]> => getSapBindings(workspaceSlug)
  )

  ipcMain.handle(
    SAP_IPC_CHANNELS.APPLY,
    async (_, workspaceSlug: string, envId: string): Promise<void> =>
      applySapToWorkspace(workspaceSlug, envId)
  )

  ipcMain.handle(
    SAP_IPC_CHANNELS.DETACH,
    async (_, workspaceSlug: string, envId: string): Promise<void> =>
      detachSapFromWorkspace(workspaceSlug, envId)
  )

  ipcMain.handle(SAP_IPC_CHANNELS.IMPORT, async (): Promise<SapImportResult> => importFromCodeBuddy())

  ipcMain.handle(
    SAP_IPC_CHANNELS.VENDOR,
    async (_, envId: string): Promise<SapVendorResult> => vendorSapRuntime(envId)
  )

  // SAP 运行文件自检
  ipcMain.handle(
    SAP_IPC_CHANNELS.RUNTIME_STATUS,
    async (): Promise<SapRuntimeStatus[]> => getSapRuntimeStatus()
  )

  // ===== 数据目录与备份迁移 =====

  ipcMain.handle(DATA_IPC_CHANNELS.INFO, async (): Promise<DataOverview> => getDataOverview())

  ipcMain.handle(DATA_IPC_CHANNELS.OPEN, async (): Promise<void> => openDataDir())

  ipcMain.handle(
    DATA_IPC_CHANNELS.EXPORT,
    async (_event, includeSecrets?: boolean): Promise<DataTransferResult> =>
      exportDataBackup(includeSecrets === true)
  )

  ipcMain.handle(
    DATA_IPC_CHANNELS.EXPORT_ZIP,
    async (_event, includeSecrets?: boolean): Promise<DataTransferResult> =>
      exportDataZip(includeSecrets === true)
  )

  ipcMain.handle(
    DATA_IPC_CHANNELS.IMPORT,
    async (): Promise<DataTransferResult> => importDataBackup()
  )

  // 发送一条测试通知
  ipcMain.handle(
    SETTINGS_IPC_CHANNELS.TEST_NOTIFICATION,
    async (): Promise<boolean> => {
      if (!Notification.isSupported()) return false
      new Notification({
        title: 'Fu Agent',
        body: '桌面通知已开启，这是一条测试消息',
      }).show()
      return true
    }
  )

  // ===== 环境检测相关 =====

  // 执行环境检测
  ipcMain.handle(
    ENVIRONMENT_IPC_CHANNELS.CHECK,
    async (): Promise<EnvironmentCheckResult> => {
      const result = await checkEnvironment()
      // 自动保存检测结果到设置
      await updateSettings({
        lastEnvironmentCheck: result,
      })
      return result
    }
  )

  // ===== 代理配置相关 =====

  // 获取代理配置
  ipcMain.handle(
    PROXY_IPC_CHANNELS.GET_SETTINGS,
    async (): Promise<ProxyConfig> => {
      return getProxySettings()
    }
  )

  // 更新代理配置
  ipcMain.handle(
    PROXY_IPC_CHANNELS.UPDATE_SETTINGS,
    async (_, config: ProxyConfig): Promise<void> => {
      await saveProxySettings(config)
    }
  )

  // 检测系统代理
  ipcMain.handle(
    PROXY_IPC_CHANNELS.DETECT_SYSTEM,
    async (): Promise<SystemProxyDetectResult> => {
      return detectSystemProxy()
    }
  )

  // ===== Agent 会话管理相关 =====

  // 获取 Agent 会话列表
  ipcMain.handle(
    AGENT_IPC_CHANNELS.LIST_SESSIONS,
    async (): Promise<AgentSessionMeta[]> => {
      return listAgentSessions()
    }
  )

  // 创建 Agent 会话
  ipcMain.handle(
    AGENT_IPC_CHANNELS.CREATE_SESSION,
    async (_, title?: string, channelId?: string, workspaceId?: string): Promise<AgentSessionMeta> => {
      return createAgentSession(title, channelId, workspaceId)
    }
  )

  // 获取 Agent 会话消息
  ipcMain.handle(
    AGENT_IPC_CHANNELS.GET_MESSAGES,
    async (_, id: string): Promise<AgentMessage[]> => {
      return getAgentSessionMessages(id)
    }
  )

  // 更新 Agent 会话标题
  ipcMain.handle(
    AGENT_IPC_CHANNELS.UPDATE_TITLE,
    async (_, id: string, title: string): Promise<AgentSessionMeta> => {
      return updateAgentSessionMeta(id, { title })
    }
  )

  // 生成 Agent 会话标题
  ipcMain.handle(
    AGENT_IPC_CHANNELS.GENERATE_TITLE,
    async (_, input: AgentGenerateTitleInput): Promise<string | null> => {
      return generateAgentTitle(input)
    }
  )

  // 复制 / 派生探索会话
  ipcMain.handle(
    AGENT_IPC_CHANNELS.DUPLICATE_SESSION,
    async (_, id: string, mode: 'copy' | 'explore' = 'copy'): Promise<AgentSessionMeta> => {
      return duplicateAgentSession(id, mode)
    }
  )

  // 回退会话最近一轮对话
  ipcMain.handle(
    AGENT_IPC_CHANNELS.ROLLBACK_SESSION,
    async (_, id: string): Promise<number> => {
      return rollbackAgentSession(id)
    }
  )

  // 更新会话标记（待办 / 探索）
  ipcMain.handle(
    AGENT_IPC_CHANNELS.SET_SESSION_FLAGS,
    async (_, id: string, flags: { isTodo?: boolean; isExplore?: boolean }): Promise<AgentSessionMeta> => {
      return setAgentSessionFlags(id, flags)
    }
  )

  // 删除 Agent 会话
  ipcMain.handle(
    AGENT_IPC_CHANNELS.DELETE_SESSION,
    async (_, id: string): Promise<void> => {
      // 删除入口已有二次确认弹窗，这里不再重复弹出破坏性操作授权
      // 清理权限服务中该会话的白名单
      permissionService.clearSessionWhitelist(id)
      permissionService.clearSessionPending(id)
      // 清理 AskUser 服务中的待处理请求
      askUserService.clearSessionPending(id)
      return deleteAgentSession(id)
    }
  )

  // 导出 Agent 会话为 Markdown
  ipcMain.handle(
    AGENT_IPC_CHANNELS.EXPORT_MARKDOWN,
    async (_, sessionId: string, title: string): Promise<string | null> => {
      return exportAgentSessionAsMarkdown(sessionId, title)
    }
  )

  // ===== Agent 工作区管理相关 =====

  // 确保默认工作区存在
  ensureDefaultWorkspace()

  // 获取 Agent 工作区列表
  ipcMain.handle(
    AGENT_IPC_CHANNELS.LIST_WORKSPACES,
    async (): Promise<AgentWorkspace[]> => {
      return listAgentWorkspaces()
    }
  )

  // 创建 Agent 工作区
  ipcMain.handle(
    AGENT_IPC_CHANNELS.CREATE_WORKSPACE,
    async (_, name: string): Promise<AgentWorkspace> => {
      return createAgentWorkspace(name)
    }
  )

  // 更新 Agent 工作区
  ipcMain.handle(
    AGENT_IPC_CHANNELS.UPDATE_WORKSPACE,
    async (_, id: string, updates: { name: string }): Promise<AgentWorkspace> => {
      return updateAgentWorkspace(id, updates)
    }
  )

  // 删除 Agent 工作区
  ipcMain.handle(
    AGENT_IPC_CHANNELS.DELETE_WORKSPACE,
    async (_, id: string): Promise<void> => {
      const approval = await requestApproval({
        action: 'delete-agent-workspace',
        title: '删除 Agent 工作区',
        description: '工作区内的会话、Skills 与文件将被删除，无法恢复。',
        detail: `工作区 ID：${id}`,
        risk: 'destructive',
      })
      if (!approval.approved) return
      return deleteAgentWorkspace(id)
    }
  )

  // ===== 工作区能力（MCP + Skill） =====

  // 获取工作区能力摘要
  ipcMain.handle(
    AGENT_IPC_CHANNELS.GET_CAPABILITIES,
    async (_, workspaceSlug: string): Promise<WorkspaceCapabilities> => {
      return getWorkspaceCapabilities(workspaceSlug)
    }
  )

  // 获取工作区 MCP 配置
  ipcMain.handle(
    AGENT_IPC_CHANNELS.GET_MCP_CONFIG,
    async (_, workspaceSlug: string): Promise<WorkspaceMcpConfig> => {
      return getWorkspaceMcpConfig(workspaceSlug)
    }
  )

  // 保存工作区 MCP 配置
  ipcMain.handle(
    AGENT_IPC_CHANNELS.SAVE_MCP_CONFIG,
    async (_, workspaceSlug: string, config: WorkspaceMcpConfig): Promise<void> => {
      return saveWorkspaceMcpConfig(workspaceSlug, config)
    }
  )

  // 测试 MCP 服务器连接
  ipcMain.handle(
    AGENT_IPC_CHANNELS.TEST_MCP_SERVER,
    async (_, name: string, entry: import('@proma/shared').McpServerEntry): Promise<{ success: boolean; message: string }> => {
      const { validateMcpServer } = await import('./lib/mcp-validator')
      const result = await validateMcpServer(name, entry)
      return {
        success: result.valid,
        message: result.valid ? '连接成功' : (result.reason || '连接失败'),
      }
    }
  )

  // 获取工作区 Skill 列表
  ipcMain.handle(
    AGENT_IPC_CHANNELS.GET_SKILLS,
    async (_, workspaceSlug: string): Promise<SkillMeta[]> => {
      return getWorkspaceSkills(workspaceSlug)
    }
  )

  // 删除工作区 Skill
  ipcMain.handle(
    AGENT_IPC_CHANNELS.DELETE_SKILL,
    async (_, workspaceSlug: string, skillSlug: string): Promise<void> => {
      return deleteWorkspaceSkill(workspaceSlug, skillSlug)
    }
  )

  // 把内置技能另存为个性化副本
  ipcMain.handle(
    AGENT_IPC_CHANNELS.COPY_SKILL_AS_PERSONAL,
    async (_, workspaceSlug: string, skillSlug: string, newName: string): Promise<string> => {
      return copyWorkspaceSkillAsPersonal(workspaceSlug, skillSlug, newName)
    }
  )

  // 扫描本机其他 Agent 的 MCP 配置与 Skill 目录
  ipcMain.handle(
    AGENT_IPC_CHANNELS.SCAN_LOCAL_CAPABILITIES,
    async (_, workspaceSlug: string): Promise<import('@proma/shared').LocalCapabilityScanResult> => {
      const { scanLocalCapabilities } = await import('./lib/mcp-scanner')
      return scanLocalCapabilities(workspaceSlug)
    }
  )

  // 导入 MCP 服务器到当前工作区
  ipcMain.handle(
    AGENT_IPC_CHANNELS.IMPORT_MCP_SERVERS,
    async (
      _,
      workspaceSlug: string,
      servers: Record<string, import('@proma/shared').McpServerEntry>,
    ): Promise<import('@proma/shared').ImportCapabilityResult> => {
      const { importMcpServers } = await import('./lib/mcp-scanner')
      return importMcpServers(workspaceSlug, servers)
    }
  )

  // 导入 Skill 目录到当前工作区
  ipcMain.handle(
    AGENT_IPC_CHANNELS.IMPORT_SKILLS,
    async (
      _,
      workspaceSlug: string,
      sources: Array<{ path: string; name: string }>,
    ): Promise<import('@proma/shared').ImportCapabilityResult> => {
      const { importSkills } = await import('./lib/mcp-scanner')
      return importSkills(workspaceSlug, sources)
    }
  )

  // 将会话沉淀到 WOLAI
  ipcMain.handle(
    AGENT_IPC_CHANNELS.WOLAI_DEPOSIT,
    async (
      _,
      sessionId: string,
    ): Promise<{ ok: boolean; url?: string; error?: string }> => {
      const { depositAgentSession } = await import('./lib/wolai-service')
      return depositAgentSession(sessionId)
    }
  )

  // 测试 WOLAI 连接
  ipcMain.handle(
    AGENT_IPC_CHANNELS.WOLAI_TEST,
    async (): Promise<{ ok: boolean; error?: string; channel?: string; tokenSource?: string; tools?: string[] }> => {
      const { testWolaiConnection } = await import('./lib/wolai-service')
      return testWolaiConnection()
    }
  )

  // 浏览 WOLAI 目录（供沉淀父页面选择）
  ipcMain.handle(
    AGENT_IPC_CHANNELS.WOLAI_LIST_PAGES,
    async (
      _,
      options?: { parentId?: string; query?: string },
    ): Promise<{ ok: boolean; pages: Array<{ id: string; title: string; url?: string }>; channel?: string; error?: string }> => {
      const { listWolaiPages } = await import('./lib/wolai-service')
      return listWolaiPages(options)
    }
  )

  // 发送 Agent 消息（触发 Agent SDK 流式响应）
  ipcMain.handle(
    AGENT_IPC_CHANNELS.SEND_MESSAGE,
    async (event, input: AgentSendInput): Promise<void> => {
      await runAgent(input, event.sender)
    }
  )

  // 中止 Agent 执行
  ipcMain.handle(
    AGENT_IPC_CHANNELS.STOP_AGENT,
    async (_, sessionId: string): Promise<void> => {
      stopAgent(sessionId)
    }
  )

  // ===== Agent 后台任务管理 =====

  // 获取任务输出（保留接口，供未来扩展）
  ipcMain.handle(
    AGENT_IPC_CHANNELS.GET_TASK_OUTPUT,
    async (_, input: GetTaskOutputInput): Promise<GetTaskOutputResult> => {
      try {
        // TODO: 实现通过 SDK 的 TaskOutput 获取任务输出
        console.warn('[IPC] GET_TASK_OUTPUT: 当前版本暂未实现，返回空输出')
        return {
          output: '',
          isComplete: false,
        }
      } catch (error) {
        console.error('[IPC] 获取任务输出失败:', error)
        throw error
      }
    }
  )

  // ===== Agent 权限系统 =====

  // 响应权限请求
  ipcMain.handle(
    AGENT_IPC_CHANNELS.PERMISSION_RESPOND,
    async (event, response: PermissionResponse): Promise<void> => {
      const { requestId, behavior, alwaysAllow } = response
      const sessionId = permissionService.respondToPermission(requestId, behavior, alwaysAllow)

      // 发送 permission_resolved 事件给渲染进程
      if (sessionId) {
        event.sender.send(AGENT_IPC_CHANNELS.STREAM_EVENT, {
          sessionId,
          event: { type: 'permission_resolved', requestId, behavior },
        })
      }
    }
  )

  // 停止任务
  ipcMain.handle(
    AGENT_IPC_CHANNELS.STOP_TASK,
    async (_, input: StopTaskInput): Promise<void> => {
      try {
        if (input.type === 'shell') {
          console.warn('[IPC] STOP_TASK: Shell 任务停止功能待实现')
        } else {
          console.warn('[IPC] STOP_TASK: Agent 任务暂不支持单独停止')
        }
      } catch (error) {
        console.error('[IPC] 停止任务失败:', error)
        throw error
      }
    }
  )

  // 获取工作区权限模式
  ipcMain.handle(
    AGENT_IPC_CHANNELS.GET_PERMISSION_MODE,
    async (_, workspaceSlug: string): Promise<PromaPermissionMode> => {
      return getWorkspacePermissionMode(workspaceSlug)
    }
  )

  // 设置工作区权限模式
  ipcMain.handle(
    AGENT_IPC_CHANNELS.SET_PERMISSION_MODE,
    async (_, workspaceSlug: string, mode: PromaPermissionMode): Promise<void> => {
      const validModes = new Set<string>(['auto', 'smart', 'supervised'])
      if (!validModes.has(mode)) {
        throw new Error(`无效的权限模式: ${mode}`)
      }
      setWorkspacePermissionMode(workspaceSlug, mode)
    }
  )

  // 全局记忆配置
  ipcMain.handle(
    MEMORY_IPC_CHANNELS.GET_CONFIG,
    async (): Promise<MemoryConfig> => {
      return getMemoryConfig()
    }
  )

  ipcMain.handle(
    MEMORY_IPC_CHANNELS.SET_CONFIG,
    async (_, config: MemoryConfig): Promise<void> => {
      setMemoryConfig(config)
    }
  )

  ipcMain.handle(
    MEMORY_IPC_CHANNELS.TEST_CONNECTION,
    async (): Promise<{ success: boolean; message: string }> => {
      const config = getMemoryConfig()
      if (!config.apiKey) {
        return { success: false, message: '请先填写 API Key' }
      }
      try {
        const { searchMemory } = await import('./lib/memos-client')
        const result = await searchMemory(
          { apiKey: config.apiKey, userId: config.userId?.trim() || 'proma-user', baseUrl: config.baseUrl },
          'test connection',
          1,
        )
        return { success: true, message: `连接成功，已检索到 ${result.facts.length} 条事实、${result.preferences.length} 条偏好` }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        return { success: false, message: `连接失败: ${msg}` }
      }
    }
  )

  // ===== AskUserQuestion 交互式问答 =====

  // 响应 AskUser 请求
  ipcMain.handle(
    AGENT_IPC_CHANNELS.ASK_USER_RESPOND,
    async (event, response: AskUserResponse): Promise<void> => {
      const { requestId, answers } = response
      const sessionId = askUserService.respondToAskUser(requestId, answers)

      if (sessionId) {
        event.sender.send(AGENT_IPC_CHANNELS.STREAM_EVENT, {
          sessionId,
          event: { type: 'ask_user_resolved', requestId },
        })
      }
    }
  )

  // ===== Agent 附件 =====

  // 保存文件到 Agent session 工作目录
  ipcMain.handle(
    AGENT_IPC_CHANNELS.SAVE_FILES_TO_SESSION,
    async (_, input: AgentSaveFilesInput): Promise<AgentSavedFile[]> => {
      return saveFilesToAgentSession(input)
    }
  )

  // 打开文件夹选择对话框
  ipcMain.handle(
    AGENT_IPC_CHANNELS.OPEN_FOLDER_DIALOG,
    async (): Promise<{ path: string; name: string } | null> => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      if (!win) return null

      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: '选择文件夹',
      })

      if (result.canceled || result.filePaths.length === 0) return null

      const folderPath = result.filePaths[0]!
      const name = folderPath.split('/').filter(Boolean).pop() || 'folder'
      return { path: folderPath, name }
    }
  )

  // 复制文件夹到 Agent session 工作目录
  ipcMain.handle(
    AGENT_IPC_CHANNELS.COPY_FOLDER_TO_SESSION,
    async (_, input: AgentCopyFolderInput): Promise<AgentSavedFile[]> => {
      return copyFolderToSession(input)
    }
  )

  // ===== Agent 文件系统操作 =====

  // 获取 session 工作路径
  ipcMain.handle(
    AGENT_IPC_CHANNELS.GET_SESSION_PATH,
    async (_, workspaceId: string, sessionId: string): Promise<string | null> => {
      const ws = getAgentWorkspace(workspaceId)
      if (!ws) return null
      return getAgentSessionWorkspacePath(ws.slug, sessionId)
    }
  )

  // 列出目录内容（浅层，安全校验）
  ipcMain.handle(
    AGENT_IPC_CHANNELS.LIST_DIRECTORY,
    async (_, dirPath: string): Promise<FileEntry[]> => {
      const { readdirSync, statSync } = await import('node:fs')
      const { resolve } = await import('node:path')

      // 安全校验：路径必须在 agent-workspaces 目录下
      const safePath = resolve(dirPath)
      const workspacesRoot = resolve(getAgentWorkspacesDir())
      if (!safePath.startsWith(workspacesRoot)) {
        throw new Error('访问路径超出 Agent 工作区范围')
      }

      const entries: FileEntry[] = []
      const items = readdirSync(safePath, { withFileTypes: true })

      for (const item of items) {
        // 跳过隐藏文件
        if (item.name.startsWith('.')) continue

        const fullPath = resolve(safePath, item.name)
        entries.push({
          name: item.name,
          path: fullPath,
          isDirectory: item.isDirectory(),
        })
      }

      // 目录在前，文件在后，各自按名称排序
      entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      return entries
    }
  )

  // 删除文件或目录
  ipcMain.handle(
    AGENT_IPC_CHANNELS.DELETE_FILE,
    async (_, filePath: string): Promise<void> => {
      const { rmSync } = await import('node:fs')
      const { resolve } = await import('node:path')

      // 安全校验：路径必须在 agent-workspaces 目录下
      const safePath = resolve(filePath)
      const workspacesRoot = resolve(getAgentWorkspacesDir())
      if (!safePath.startsWith(workspacesRoot)) {
        throw new Error('访问路径超出 Agent 工作区范围')
      }

      rmSync(safePath, { recursive: true, force: true })
      console.log(`[Agent 文件] 已删除: ${safePath}`)
    }
  )

  // 用系统默认应用打开文件
  ipcMain.handle(
    AGENT_IPC_CHANNELS.OPEN_FILE,
    async (_, filePath: string): Promise<void> => {
      const { resolve } = await import('node:path')

      const safePath = resolve(filePath)
      const workspacesRoot = resolve(getAgentWorkspacesDir())
      if (!safePath.startsWith(workspacesRoot)) {
        throw new Error('访问路径超出 Agent 工作区范围')
      }

      await shell.openPath(safePath)
    }
  )

  // 在系统文件管理器中显示文件
  ipcMain.handle(
    AGENT_IPC_CHANNELS.SHOW_IN_FOLDER,
    async (_, filePath: string): Promise<void> => {
      const { resolve } = await import('node:path')

      const safePath = resolve(filePath)
      const workspacesRoot = resolve(getAgentWorkspacesDir())
      if (!safePath.startsWith(workspacesRoot)) {
        throw new Error('访问路径超出 Agent 工作区范围')
      }

      shell.showItemInFolder(safePath)
    }
  )

  // ===== 系统提示词管理 =====

  // 获取系统提示词配置
  ipcMain.handle(
    SYSTEM_PROMPT_IPC_CHANNELS.GET_CONFIG,
    async (): Promise<SystemPromptConfig> => {
      return getSystemPromptConfig()
    }
  )

  // 创建提示词
  ipcMain.handle(
    SYSTEM_PROMPT_IPC_CHANNELS.CREATE,
    async (_, input: SystemPromptCreateInput): Promise<SystemPrompt> => {
      return createSystemPrompt(input)
    }
  )

  // 更新提示词
  ipcMain.handle(
    SYSTEM_PROMPT_IPC_CHANNELS.UPDATE,
    async (_, id: string, input: SystemPromptUpdateInput): Promise<SystemPrompt> => {
      return updateSystemPrompt(id, input)
    }
  )

  // 删除提示词
  ipcMain.handle(
    SYSTEM_PROMPT_IPC_CHANNELS.DELETE,
    async (_, id: string): Promise<void> => {
      return deleteSystemPrompt(id)
    }
  )

  // 更新追加日期时间和用户名开关
  ipcMain.handle(
    SYSTEM_PROMPT_IPC_CHANNELS.UPDATE_APPEND_SETTING,
    async (_, enabled: boolean): Promise<void> => {
      return updateAppendSetting(enabled)
    }
  )

  // 设置默认提示词
  ipcMain.handle(
    SYSTEM_PROMPT_IPC_CHANNELS.SET_DEFAULT,
    async (_, id: string | null): Promise<void> => {
      return setDefaultPrompt(id)
    }
  )

  // ===== GitHub Release =====

  // 获取最新 Release
  ipcMain.handle(
    GITHUB_RELEASE_IPC_CHANNELS.GET_LATEST_RELEASE,
    async (): Promise<GitHubRelease | null> => {
      return getLatestRelease()
    }
  )

  // 获取 Release 列表
  ipcMain.handle(
    GITHUB_RELEASE_IPC_CHANNELS.LIST_RELEASES,
    async (_, options?: GitHubReleaseListOptions): Promise<GitHubRelease[]> => {
      return listGitHubReleases(options)
    }
  )

  // 获取指定版本的 Release
  ipcMain.handle(
    GITHUB_RELEASE_IPC_CHANNELS.GET_RELEASE_BY_TAG,
    async (_, tag: string): Promise<GitHubRelease | null> => {
      return getReleaseByTag(tag)
    }
  )

  console.log('[IPC] IPC 处理器注册完成')

  // 注册更新 IPC 处理器
  registerUpdaterIpc()
}
