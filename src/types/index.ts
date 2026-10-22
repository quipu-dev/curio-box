export type CaptureMode = 'auto' | 'canvas' | 'dom' | 'screen';

export type PatchAction =
  | 'patch_file'
  | 'write_file'
  | 'add_tag'
  | 'remove_tag'
  | 'set_description'
  | 'commit';

export interface PatchCommand {
  action: PatchAction;
  oldDoc: string;
  newDoc: string;
  tags?: string[];
  description?: string;
  commitMessage?: string;
}

export interface Tag {
  raw: string;
  namespace?: string;
  value: string;
}

/**
 * 历史快照版本提交记录（对标 Git Commit）
 */
export interface CommitLogEntry {
  revision: number;
  timestamp: string;
  action: 'genesis' | 'patch' | 'rollback';
  message: string;
}

/**
 * 自包含工件沙盒元档案模型 (Schema v2)
 * 严格存储于 .gallery/artifacts/<artifactId>/meta.json
 */
export interface ArtifactBundleMeta {
  schemaVersion: 2;
  id: string;
  filename: string;
  name: string;
  tags: string[];
  currentRevision: number;
  createdAt: string;
  updatedAt: string;
  rating?: number;
  description?: string;
  history: CommitLogEntry[];
}

/**
 * 派生函数：获取工件 HEAD 当前版本的最新 Commit 提交说明
 */
export function getLastCommitMessage(meta: ArtifactBundleMeta): string {
  if (!meta.history || meta.history.length === 0) return '初始版本';
  const head = meta.history.find((item) => item.revision === meta.currentRevision);
  return head?.message || meta.history[meta.history.length - 1]?.message || '初始版本';
}

export interface Artifact {
  meta: ArtifactBundleMeta;
  sourceCode?: string;
  posterBlobUrl?: string;
}

/**
 * IndexedDB 内部维持的高速索引快照投影
 */
export interface ProjectedIndexRecord {
  id: string;
  filename: string;
  htmlLastModified: number;
  bundleLastModified: number;
  meta: ArtifactBundleMeta;
  hasPoster: boolean;
}

export type AlbumSortOption =
  | 'date-desc'
  | 'date-asc'
  | 'updated-desc'
  | 'rating-desc'
  | 'name-asc';

export type AlbumType = 'manual' | 'smart';

export interface AlbumBaseMeta {
  schemaVersion: 1;
  id: string; // 机器不可变键，格式: alb_<timestamp36><random36>
  title: string; // 用户可见的画册名称（可任意修改，不触发底层文件重命名）
  description?: string; // 策展导言 / 专题备注
  type: AlbumType;
  rating?: number; // 画册评级 (1-5)
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface ManualAlbumItem {
  artifactId: string; // 引用工件沙盒 ID (并非 filename，解耦重命名)
  note?: string; // 该工件在画册内的专属小注
}

export interface ManualAlbumMeta extends AlbumBaseMeta {
  type: 'manual';
  items: ManualAlbumItem[];
  customCoverArtifactId?: string; // 用户手动指定的封面工件 ID (可选)
}

export interface SmartAlbumMeta extends AlbumBaseMeta {
  type: 'smart';
  query: string; // 标签查询表达式，如 "形态:webgl 物理:粒子"
  sortBy?: AlbumSortOption; // 智能册内排序规则
}

export type AlbumMeta = ManualAlbumMeta | SmartAlbumMeta;

export type CreateAlbumInput =
  | Omit<ManualAlbumMeta, 'schemaVersion' | 'id' | 'createdAt' | 'updatedAt'>
  | Omit<SmartAlbumMeta, 'schemaVersion' | 'id' | 'createdAt' | 'updatedAt'>;

export interface Album {
  meta: AlbumMeta;
  coverBlobUrl?: string; // 计算出的封面 Blob URL
  artifactCount: number; // 当前解析生效的工件总数
}

/**
 * 工作区档案元数据模型 (Schema v1)
 * 物理持久化于 .gallery/workspace.json
 */
export interface WorkspaceMeta {
  schemaVersion: 1;
  id: string; // 机器不可变键，格式: ws_<timestamp36><random36>
  name: string; // 用户可见的工作区/陈列室名称（可编辑）
  description?: string; // 工作区专题导言 / 备注（可编辑）
}

export type StorageDriverType = 'fsa-physical' | 'opfs-sandbox';

export interface WorkspaceMeta {
  schemaVersion: 1;
  id: string; // 机器不可变键，格式: ws_<timestamp36><random36>
  name: string; // 用户可见的工作区/陈列室名称（可编辑）
  description?: string; // 工作区专题导言 / 备注（可编辑）
  driverType?: StorageDriverType; // 存储驱动类型：外部真实物理目录 或 浏览器私有 OPFS 沙箱
}

export type UpdateWorkspaceInput = Pick<WorkspaceMeta, 'name' | 'description'>;
