import type { ArtifactBundleMeta } from '@/types';

export interface ExtractedMeta {
  tags?: string[];
  description?: string;
  rating?: number;
  revision?: number;
}

const META_BLOCK_REGEX = /<!--\s*@(curio|meta)[\r\n]+([\s\S]*?)-->/i;

export const MetaSealEngine = {
  /**
   * 从 HTML 源码前部提取元数据符印（优先解析标准 JSON，降级兼容行文本）
   */
  extract(html: string): ExtractedMeta | null {
    const headChunk = html.slice(0, 4096);
    const match = headChunk.match(META_BLOCK_REGEX);
    if (!match?.[2]) return null;

    const rawContent = match[2].trim();

    // 严格按照标准扁平 JSON 符印解析
    if (rawContent.startsWith('{') && rawContent.endsWith('}')) {
      try {
        const parsed = JSON.parse(rawContent);
        if (parsed && typeof parsed === 'object') {
          const result: ExtractedMeta = {};

          if (Array.isArray(parsed.tags)) {
            result.tags = parsed.tags.map((t: unknown) => String(t).trim()).filter(Boolean);
          } else if (typeof parsed.tags === 'string') {
            result.tags = parsed.tags.split(/\s+/).filter(Boolean);
          }

          const desc = parsed.description || parsed.desc;
          if (typeof desc === 'string') {
            result.description = desc.trim();
          }

          const rating = Number.parseInt(String(parsed.rating || parsed.star), 10);
          if (!Number.isNaN(rating) && rating >= 1 && rating <= 5) {
            result.rating = rating;
          }

          const rev = Number.parseInt(String(parsed.revision || parsed.rev), 10);
          if (!Number.isNaN(rev) && rev > 0) {
            result.revision = rev;
          }

          return result;
        }
      } catch {
        return null;
      }
    }

    return null;
  },

  /**
   * 将元数据格式化为标准扁平 JSON 符印注释块（不包含 name，文件名是名称的唯一事实来源）
   */
  buildSealBlock(meta: {
    tags?: string[];
    description?: string;
    rating?: number;
    currentRevision?: number;
  }): string {
    const payload: Record<string, unknown> = {};

    if (meta.tags && meta.tags.length > 0) {
      payload.tags = meta.tags;
    }

    if (meta.description?.trim()) {
      payload.description = meta.description.trim();
    }

    if (meta.rating && meta.rating > 0) {
      payload.rating = meta.rating;
    }

    if (meta.currentRevision && meta.currentRevision > 0) {
      payload.revision = meta.currentRevision;
    }

    const jsonString = JSON.stringify(payload, null, 2);
    return `<!--@curio\n${jsonString}\n-->\n`;
  },

  /**
   * 将符印注入或更新至 HTML 文件最顶部
   */
  inject(
    html: string,
    meta: Partial<Pick<ArtifactBundleMeta, 'tags' | 'description' | 'rating' | 'currentRevision'>>,
  ): string {
    const cleanHtml = this.strip(html).trimStart();
    const seal = this.buildSealBlock(meta);
    return `${seal}${cleanHtml}`;
  },

  /**
   * 纯净化剥离头部内嵌符印（供大模型提示词注入及精确 Diff 运算）
   */
  strip(html: string): string {
    return html.replace(META_BLOCK_REGEX, '').trimStart();
  },
};
