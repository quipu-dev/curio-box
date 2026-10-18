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

export interface NegativeLedgerEntry {
  revision: number;
  timestamp: string;
  action: 'genesis' | 'patch' | 'rollback';
  description?: string;
}

export interface NegativeRevision {
  revision: number;
  timestamp: string;
  type: 'snapshot' | 'patch';
  content: string;
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
  lastCommitMessage?: string;
  history: NegativeLedgerEntry[];
}

/**
 * 兼容旧命名的元数据类型别名
 */
export type ArtifactMeta = ArtifactBundleMeta;

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
