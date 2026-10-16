export type PatchAction = 'patch_file' | 'write_file';

export interface PatchCommand {
  action: PatchAction;
  oldDoc: string;
  newDoc: string;
}

export interface Tag {
  raw: string;
  namespace?: string;
  value: string;
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
}

export interface Artifact {
  meta: ArtifactMeta;
  sourceCode: string;
  posterBlobUrl?: string;
}