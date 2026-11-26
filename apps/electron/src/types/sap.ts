/**
 * SAP 多环境（arc-1 MCP）相关类型
 *
 * 安全约定：
 * - 密码不落 data/，统一存 .env（键名 SAP_<CODE>_PASSWORD），JSON 中只记录是否已配置
 * - 默认只读：allowWrites 为 false 时，注入 MCP 的 SAP_ALLOW_WRITES=false 且带完整写操作禁用列表
 */

export interface SapEnvironment {
  id: string
  /** 环境代号，如 QAS300（用于生成 MCP 名称与密钥键名） */
  code: string
  /** 展示名称，如 QAS 300 测试环境 */
  name: string
  /** SAP 系统地址，如 http://s4qas.kedachina.com.cn:8000 */
  url: string
  /** SAP Client，如 300 */
  client: string
  /** 登录语言，如 ZH */
  language: string
  /** 登录账号 */
  user: string
  /** 密码是否已保存到 .env */
  hasPassword: boolean
  /** 是否允许写操作（默认 false，需授权开启） */
  allowWrites: boolean
  /** Node 可执行文件路径（留空使用系统 node） */
  nodePath: string
  /** arc-1 脚本路径（arc1.js） */
  serverPath: string
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface SapEnvironmentInput {
  code: string
  name?: string
  url: string
  client: string
  language?: string
  user: string
  /** 仅新建/覆盖时传入，主进程写入 .env 后丢弃 */
  password?: string
  allowWrites?: boolean
  nodePath?: string
  serverPath?: string
  enabled?: boolean
}

/** 环境在当前工作区的接入状态 */
export interface SapWorkspaceBinding {
  envId: string
  envCode: string
  /** MCP 服务器名称，如 arc-1-QAS300 */
  serverName: string
  applied: boolean
}

/** 从 CodeBuddy 配置导入的结果 */
export interface SapImportResult {
  imported: number
  skipped: number
  message: string
}

/** 复制 arc-1 运行文件到应用数据目录的结果 */
export interface SapVendorResult {
  /** 本次是否实际复制了文件 */
  copied: boolean
  message: string
  /** 复制后保存的 Node 路径（可能带 ${FU_DATA_DIR} 前缀） */
  nodePath?: string
  /** 复制后保存的 arc1.js 路径（可能带 ${FU_DATA_DIR} 前缀） */
  serverPath?: string
}

/** SAP 运行文件自检状态 */
export interface SapRuntimeStatus {
  envId: string
  code: string
  /** arc1.js 路径（可能带 ${FU_DATA_DIR} 前缀） */
  serverPath: string
  /** Node 路径（空表示使用系统 node） */
  nodePath: string
  /** arc1.js 文件是否存在 */
  serverExists: boolean
  /** Node 可执行文件是否存在（未配置视为可用） */
  nodeExists: boolean
  /** 是否已复制到应用数据目录 */
  vendored: boolean
}

export const SAP_IPC_CHANNELS = {
  LIST: 'sap:list',
  CREATE: 'sap:create',
  UPDATE: 'sap:update',
  REMOVE: 'sap:remove',
  BINDINGS: 'sap:bindings',
  APPLY: 'sap:apply',
  DETACH: 'sap:detach',
  IMPORT: 'sap:import',
  VENDOR: 'sap:vendor',
  RUNTIME_STATUS: 'sap:runtime-status',
} as const
