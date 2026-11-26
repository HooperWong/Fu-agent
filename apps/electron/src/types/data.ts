/**
 * 数据目录与备份迁移类型
 *
 * 数据统一位于 data/ 下，备份/恢复以目录为单位整体复制。
 */

/** 数据目录概览 */
export interface DataOverview {
  /** 数据根目录绝对路径 */
  dataDir: string
  /** 应用目录绝对路径（程序所在位置，含 resources/） */
  appDir: string
  /** 占用空间（字节） */
  sizeBytes: number
  /** 文件数量 */
  fileCount: number
  /** 应用根 .env 路径（凭据文件，不在数据目录内） */
  envPath: string
}

/** 备份清单文件名（位于备份根目录） */
export const BACKUP_MANIFEST_NAME = 'fu-agent-backup.json'

/** 备份清单 */
export interface BackupManifest {
  /** 生成该备份的应用版本 */
  appVersion: string
  /** 备份时间（ISO 字符串） */
  createdAt: string
  /** 是否包含 .env 凭据 */
  includesSecrets: boolean
  /** 备份文件数量 */
  fileCount: number
  /** 备份占用空间（字节） */
  sizeBytes: number
}

/** 数据导出/恢复结果 */
export interface DataTransferResult {
  /** 用户取消操作 */
  canceled: boolean
  /** 结果说明 */
  message: string
  /** 导出目标目录或恢复来源目录 */
  target?: string
}

/** 数据目录相关 IPC 通道 */
export const DATA_IPC_CHANNELS = {
  INFO: 'data:info',
  OPEN: 'data:open',
  EXPORT: 'data:export',
  EXPORT_ZIP: 'data:export-zip',
  IMPORT: 'data:import',
} as const
