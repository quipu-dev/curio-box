export type PatchAction = 'patch_file' | 'write_file' | 'add_tag' | 'remove_tag';

export interface PatchCommand {
  action: PatchAction;
  oldDoc: string;
  newDoc: string;
  tags?: string[];
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

export interface ArtifactMeta {
  id: string;
  name: string;
  filename: string;
  tags: string[];
  currentRevision: number;
  updatedAt: string;
  rating?: number;
}

export interface Artifact {
  meta: ArtifactMeta;
  sourceCode: string;
  posterBlobUrl?: string;
}
