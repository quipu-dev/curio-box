import type { Tag } from '@/types';

export interface TagContext {
  rating?: number;
  currentRevision?: number;
  hasPoster?: boolean;
}

export interface CursorTokenInfo {
  token: string;
  startIndex: number;
  endIndex: number;
  prefixModifier: string; // 如 '-' 负向排除符号
  rawQuery: string; // 剔除修饰符后的查询文本
  namespace?: string;
  value?: string;
  hasColon: boolean;
  subQuery?: string; // 管道符 | 后当前光标所在的子分段查询
}

export interface TagSuggestion {
  type: 'namespace' | 'full_tag' | 'value' | 'predicate';
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

const BUILTIN_PREDICATE_SUGGESTIONS: TagSuggestion[] = [
  {
    type: 'predicate',
    insertText: 'rating:>=4',
    displayText: 'rating:>=4',
    subText: '筛选 4 星及以上高分标本',
  },
  {
    type: 'predicate',
    insertText: 'rating:5',
    displayText: 'rating:5',
    subText: '仅筛选 5 星满分标本',
  },
  {
    type: 'predicate',
    insertText: '-has:poster',
    displayText: '-has:poster',
    subText: '仅筛选未定格封面的标本',
  },
  {
    type: 'predicate',
    insertText: 'has:poster',
    displayText: 'has:poster',
    subText: '仅筛选已定格封面的标本',
  },
  {
    type: 'predicate',
    insertText: 'rev:>1',
    displayText: 'rev:>1',
    subText: '筛选经历过迭代修改的工件',
  },
];

interface NumericComparison {
  operator: '>=' | '<=' | '>' | '<' | '=' | '..' | ':';
  value: number;
  secondValue?: number;
}

function parseNumericComparison(expr: string): NumericComparison | null {
  const rangeMatch = expr.match(/^(\d+(?:\.\d+)?)\.\.(\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    return {
      operator: '..',
      value: Number.parseFloat(rangeMatch[1]),
      secondValue: Number.parseFloat(rangeMatch[2]),
    };
  }

  const opMatch = expr.match(/^([><]=?|=)(.+)$/);
  if (opMatch) {
    const op = opMatch[1] as '>=' | '<=' | '>' | '<' | '=';
    const num = Number.parseFloat(opMatch[2]);
    if (!Number.isNaN(num)) {
      return { operator: op, value: num };
    }
  }

  const num = Number.parseFloat(expr);
  if (!Number.isNaN(num)) {
    return { operator: '=', value: num };
  }

  return null;
}

function evaluateNumericComparison(actual: number | undefined, comp: NumericComparison): boolean {
  const val = actual ?? 0;
  switch (comp.operator) {
    case '>=':
      return val >= comp.value;
    case '<=':
      return val <= comp.value;
    case '>':
      return val > comp.value;
    case '<':
      return val < comp.value;
    case '=':
    case ':':
      return val === comp.value;
    case '..':
      return comp.secondValue !== undefined && val >= comp.value && val <= comp.secondValue;
    default:
      return false;
  }
}

/**
 * 将 Glob 通配模式（* / ?）安全编译为精确匹配正则
 */
function globToRegExp(pattern: string): RegExp {
  let escaped = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      escaped += '.*';
    } else if (c === '?') {
      escaped += '.';
    } else if ('/\\^$+-.()=!|{}:[]'.includes(c)) {
      escaped += `\\${c}`;
    } else {
      escaped += c;
    }
  }
  return new RegExp(`^${escaped}$`, 'i');
}

export const TagQueryEngine = {
  parseTag(rawTag: string): Tag {
    const parts = rawTag.trim().toLowerCase().split(':');
    if (parts.length > 1) {
      return { raw: rawTag, namespace: parts[0], value: parts.slice(1).join(':') };
    }
    return { raw: rawTag, value: parts[0] };
  },

  /**
   * 判定单个原子标签候选与工件标签池是否命中（支持 Glob 模糊匹配）
   */
  matchesSingleTag(tagCandidate: string, artifactTags: string[], tagSet: Set<string>): boolean {
    const lowerCandidate = tagCandidate.toLowerCase();
    if (!lowerCandidate.includes('*') && !lowerCandidate.includes('?')) {
      return tagSet.has(lowerCandidate);
    }
    const regex = globToRegExp(lowerCandidate);
    for (const tag of artifactTags) {
      if (regex.test(tag.toLowerCase())) {
        return true;
      }
    }
    return false;
  },

  /**
   * 判定多值 OR 联合表达式（例如 "形态:webgl|canvas" 或 "webgl|canvas"）
   */
  matchesOrTags(tagToken: string, artifactTags: string[], tagSet: Set<string>): boolean {
    const colonIndex = tagToken.indexOf(':');
    if (colonIndex !== -1) {
      const namespace = tagToken.slice(0, colonIndex);
      const valuesPart = tagToken.slice(colonIndex + 1);
      const subValues = valuesPart.split('|').filter(Boolean);
      for (const val of subValues) {
        const fullTag = `${namespace}:${val}`;
        if (this.matchesSingleTag(fullTag, artifactTags, tagSet)) {
          return true;
        }
      }
      return false;
    }

    const subTags = tagToken.split('|').filter(Boolean);
    for (const tag of subTags) {
      if (this.matchesSingleTag(tag, artifactTags, tagSet)) {
        return true;
      }
    }
    return false;
  },

  /**
   * 尝试匹配内置属性谓词（rating/star/星级/rev/revision/has）
   */
  evaluatePropertyPredicate(
    predicateToken: string,
    context?: TagContext,
  ): { matched: boolean; isProperty: boolean } {
    const clean = predicateToken.toLowerCase();

    // 1. rating/star/星级/评分
    const ratingPrefixMatch = clean.match(/^(?:rating|star|星级|评分)([:>=<].*)$/);
    if (ratingPrefixMatch) {
      let expr = ratingPrefixMatch[1];
      if (expr.startsWith(':')) {
        expr = expr.slice(1);
      }
      const comp = parseNumericComparison(expr);
      if (comp) {
        return {
          isProperty: true,
          matched: evaluateNumericComparison(context?.rating, comp),
        };
      }
    }

    // 2. rev/revision/版本
    const revPrefixMatch = clean.match(/^(?:rev|revision|版本)([:>=<].*)$/);
    if (revPrefixMatch) {
      let expr = revPrefixMatch[1];
      if (expr.startsWith(':')) {
        expr = expr.slice(1);
      }
      const comp = parseNumericComparison(expr);
      if (comp) {
        return {
          isProperty: true,
          matched: evaluateNumericComparison(context?.currentRevision, comp),
        };
      }
    }

    // 3. has:poster / has:封面
    if (clean === 'has:poster' || clean === 'has:封面') {
      return {
        isProperty: true,
        matched: Boolean(context?.hasPoster),
      };
    }

    return { matched: false, isProperty: false };
  },

  /**
   * 核心匹配器：支持 AND、NOT、Glob 通配、多值 OR 与内置属性断言
   */
  match(artifactTags: string[], queryString: string, context?: TagContext): boolean {
    const tokens = queryString.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;

    const tagSet = new Set(artifactTags.map((t) => t.toLowerCase()));

    for (const rawToken of tokens) {
      const isNegated = rawToken.startsWith('-');
      const token = isNegated ? rawToken.slice(1) : rawToken;
      if (!token) continue;

      // 1. 尝试属性谓词
      const propResult = this.evaluatePropertyPredicate(token, context);
      if (propResult.isProperty) {
        const pass = isNegated ? !propResult.matched : propResult.matched;
        if (!pass) return false;
        continue;
      }

      // 2. 标签与多值联合 (OR / Glob)
      const hasMatched = this.matchesOrTags(token, artifactTags, tagSet);
      if (isNegated ? hasMatched : !hasMatched) {
        return false;
      }
    }

    return true;
  },

  /**
   * 基于当前光标位置分析所在的 Token 词法片段（支持管道符 | 子分段定位）
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

    // 处理管道符 | 分段，计算光标当前所在的子表达式
    const relCursor = safeCursor - start - prefixModifier.length;
    const pipeIndex = content.lastIndexOf('|', relCursor - 1);
    const subQuery = pipeIndex !== -1 ? content.slice(pipeIndex + 1, relCursor) : undefined;

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
        subQuery,
      };
    }

    return {
      token: rawToken,
      startIndex: start,
      endIndex: end,
      prefixModifier,
      rawQuery: content,
      hasColon: false,
      subQuery,
    };
  },

  /**
   * 计算与当前 Token 匹配的标签建议列表（含系统宏谓词与管道符补全）
   */
  getSuggestions(
    allTags: string[],
    tokenInfo: CursorTokenInfo,
    options?: { allowPredicates?: boolean },
  ): TagSuggestion[] {
    const query = (tokenInfo.subQuery ?? tokenInfo.rawQuery).trim().toLowerCase();
    const suggestions: TagSuggestion[] = [];

    // 0. 仅在检索模式下（allowPredicates 为 true），且尚未输入命名空间冒号时推荐系统宏属性谓词
    if (options?.allowPredicates && !tokenInfo.hasColon) {
      for (const pred of BUILTIN_PREDICATE_SUGGESTIONS) {
        if (!query || pred.displayText.toLowerCase().includes(query)) {
          suggestions.push(pred);
        }
      }
    }

    // 合并内置推荐标签与已有标签池
    const combinedTags = Array.from(new Set([...DEFAULT_BUILTIN_TAGS, ...allTags]));

    // 统计标签频次与命名空间结构
    const tagFreqMap = new Map<string, number>();
    const namespaceValuesMap = new Map<string, Set<string>>();
    const allNamespaces = new Set<string>();

    for (const tag of combinedTags) {
      const lower = tag.trim().toLowerCase();
      if (!lower) continue;
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

    // 场景 1：已输入命名空间（如 "形态:" 或 "形态:w" 或 "形态:webgl|"）
    if (tokenInfo.hasColon && tokenInfo.namespace) {
      const currentNs = tokenInfo.namespace.toLowerCase();
      // 若处于管道符后，优先使用 subQuery 作为值的过滤词
      const rawValPart =
        tokenInfo.subQuery !== undefined ? tokenInfo.subQuery : tokenInfo.value || '';
      const valQuery = rawValPart.toLowerCase();
      const valSet = namespaceValuesMap.get(currentNs);

      if (valSet) {
        for (const val of valSet) {
          if (!valQuery || val.toLowerCase().includes(valQuery)) {
            const basePrefix =
              tokenInfo.subQuery !== undefined
                ? `${tokenInfo.rawQuery.slice(0, tokenInfo.rawQuery.lastIndexOf('|') + 1)}`
                : `${tokenInfo.namespace}:`;
            const fullTagName = `${tokenInfo.namespace}:${val}`;
            suggestions.push({
              type: 'value',
              insertText: `${tokenInfo.prefixModifier}${basePrefix}${val}`,
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
