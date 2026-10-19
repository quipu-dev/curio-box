import type { Tag } from '@/types';

export interface CursorTokenInfo {
  token: string;
  startIndex: number;
  endIndex: number;
  prefixModifier: string; // 如 '-' 负向排除符号
  rawQuery: string; // 剔除修饰符后的查询文本
  namespace?: string;
  value?: string;
  hasColon: boolean;
}

export interface TagSuggestion {
  type: 'namespace' | 'full_tag' | 'value';
  insertText: string;
  displayText: string;
  subText?: string;
  count?: number;
}

export const DEFAULT_BUILTIN_TAGS = [
  '形态:原生html',
  '形态:webgl',
  '形态:canvas',
  '形态:threejs',
  '形态:svg',
  '状态:新建',
  '状态:未分类',
  '状态:精选',
  '领域:图形学',
  '领域:流体仿真',
  '领域:生成艺术',
  '领域:数学可视化',
  '物理:粒子',
  '物理:流体',
  '物理:引力',
];

export const TagQueryEngine = {
  parseTag(rawTag: string): Tag {
    const parts = rawTag.trim().toLowerCase().split(':');
    if (parts.length > 1) {
      return { raw: rawTag, namespace: parts[0], value: parts.slice(1).join(':') };
    }
    return { raw: rawTag, value: parts[0] };
  },

  match(artifactTags: string[], queryString: string): boolean {
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
  },

  /**
   * 基于当前光标位置分析所在的 Token 词法片段
   */
  extractCursorToken(fullText: string, cursorIndex: number): CursorTokenInfo {
    const safeCursor = Math.max(0, Math.min(fullText.length, cursorIndex));
    let start = safeCursor;
    while (start > 0 && !/\s/.test(fullText[start - 1])) {
      start--;
    }

    let end = safeCursor;
    while (end < fullText.length && !/\s/.test(fullText[end])) {
      end++;
    }

    const rawToken = fullText.slice(start, end);
    let prefixModifier = '';
    let content = rawToken;

    if (content.startsWith('-')) {
      prefixModifier = '-';
      content = content.slice(1);
    }

    const colonIndex = content.indexOf(':');
    if (colonIndex !== -1) {
      const namespace = content.slice(0, colonIndex);
      const value = content.slice(colonIndex + 1);
      return {
        token: rawToken,
        startIndex: start,
        endIndex: end,
        prefixModifier,
        rawQuery: content,
        namespace,
        value,
        hasColon: true,
      };
    }

    return {
      token: rawToken,
      startIndex: start,
      endIndex: end,
      prefixModifier,
      rawQuery: content,
      hasColon: false,
    };
  },

  /**
   * 计算与当前 Token 匹配的标签建议列表
   */
  getSuggestions(allTags: string[], tokenInfo: CursorTokenInfo): TagSuggestion[] {
    const query = tokenInfo.rawQuery.trim().toLowerCase();
    const suggestions: TagSuggestion[] = [];

    // 合并内置推荐标签与已有标签池
    const combinedTags = Array.from(new Set([...DEFAULT_BUILTIN_TAGS, ...allTags]));

    // 统计标签频次与命名空间结构
    const tagFreqMap = new Map<string, number>();
    const namespaceValuesMap = new Map<string, Set<string>>();
    const allNamespaces = new Set<string>();

    for (const tag of combinedTags) {
      const lower = tag.trim().toLowerCase();
      if (!lower) continue;
      // 已有传入的标签频次权重更高
      const isCustomTag = allTags.some((t) => t.toLowerCase() === lower);
      tagFreqMap.set(lower, (tagFreqMap.get(lower) || 0) + (isCustomTag ? 1 : 0));

      const parsed = this.parseTag(tag);
      if (parsed.namespace) {
        allNamespaces.add(parsed.namespace);
        let valSet = namespaceValuesMap.get(parsed.namespace);
        if (!valSet) {
          valSet = new Set();
          namespaceValuesMap.set(parsed.namespace, valSet);
        }
        valSet.add(parsed.value);
      }
    }

    // 场景 1：已输入命名空间（如 "形态:" 或 "形态:w"）
    if (tokenInfo.hasColon && tokenInfo.namespace) {
      const currentNs = tokenInfo.namespace.toLowerCase();
      const valQuery = (tokenInfo.value || '').toLowerCase();
      const valSet = namespaceValuesMap.get(currentNs);

      if (valSet) {
        for (const val of valSet) {
          if (!valQuery || val.toLowerCase().includes(valQuery)) {
            const fullTagName = `${tokenInfo.namespace}:${val}`;
            suggestions.push({
              type: 'value',
              insertText: `${tokenInfo.prefixModifier}${fullTagName}`,
              displayText: val,
              subText: `${tokenInfo.namespace}:`,
              count: tagFreqMap.get(fullTagName.toLowerCase()),
            });
          }
        }
      }
      return suggestions.slice(0, 10);
    }

    // 场景 2：尚未输入冒号（如 ""、"形"、"webgl"）
    // 优先提供匹配的命名空间分类
    for (const ns of allNamespaces) {
      if (!query || ns.includes(query)) {
        suggestions.push({
          type: 'namespace',
          insertText: `${tokenInfo.prefixModifier}${ns}:`,
          displayText: `${ns}:`,
          subText: '分类前缀',
        });
      }
    }

    // 提供完整匹配的标签项（按使用频次排序）
    const matchedFullTags: { tag: string; count: number }[] = [];
    for (const [tag, count] of tagFreqMap.entries()) {
      if (!query || tag.includes(query)) {
        matchedFullTags.push({ tag, count });
      }
    }

    matchedFullTags.sort((a, b) => b.count - a.count);

    for (const item of matchedFullTags) {
      suggestions.push({
        type: 'full_tag',
        insertText: `${tokenInfo.prefixModifier}${item.tag}`,
        displayText: item.tag,
        count: item.count,
      });
    }

    return suggestions.slice(0, 10);
  },
};
