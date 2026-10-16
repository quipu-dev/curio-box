import type { Tag } from '@/types';

export class TagQueryEngine {
  public static parseTag(rawTag: string): Tag {
    const parts = rawTag.trim().toLowerCase().split(':');
    if (parts.length > 1) {
      return { raw: rawTag, namespace: parts[0], value: parts.slice(1).join(':') };
    }
    return { raw: rawTag, value: parts[0] };
  }

  public static match(artifactTags: string[], queryString: string): boolean {
    const tokens = queryString.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;

    const tagSet = new Set(artifactTags.map((t) => t.toLowerCase()));

    for (const token of tokens) {
      if (token.startsWith('-')) {
        const excludeTarget = token.slice(1);
        if (tagSet.has(excludeTarget)) return false;
      } else {
        if (!tagSet.has(token)) return false;
      }
    }
    return true;
  }
}