import { TagQueryEngine } from '@/core/engine/tag-engine';
import { describe, expect, it } from 'vitest';

describe('TagQueryEngine', () => {
  describe('parseTag', () => {
    it('正确解析包含命名空间的结构化标签', () => {
      const tag = TagQueryEngine.parseTag('形态:webgl');
      expect(tag.namespace).toBe('形态');
      expect(tag.value).toBe('webgl');
      expect(tag.raw).toBe('形态:webgl');
    });

    it('正确解析无命名空间的扁平标签', () => {
      const tag = TagQueryEngine.parseTag('精选标本');
      expect(tag.namespace).toBeUndefined();
      expect(tag.value).toBe('精选标本');
    });
  });

  describe('match 复合检索与断言', () => {
    const artifactTags = ['形态:webgl', '物理:流体', '领域:图形学', '状态:精选'];
    const context = { rating: 5, currentRevision: 3, hasPoster: true };

    it('支持标准 AND 多词匹配', () => {
      expect(TagQueryEngine.match(artifactTags, '形态:webgl 物理:流体', context)).toBe(true);
      expect(TagQueryEngine.match(artifactTags, '形态:webgl 物理:引力', context)).toBe(false);
    });

    it('支持负向排除 (-tag)', () => {
      expect(TagQueryEngine.match(artifactTags, '形态:webgl -物理:粒子', context)).toBe(true);
      expect(TagQueryEngine.match(artifactTags, '形态:webgl -状态:精选', context)).toBe(false);
    });

    it('支持 Glob 通配符模糊匹配 (* 与 ?)', () => {
      expect(TagQueryEngine.match(artifactTags, '形态:web*', context)).toBe(true);
      expect(TagQueryEngine.match(artifactTags, '形态:ca?vas', context)).toBe(false);
    });

    it('支持 OR 联合管道表达式 (|)', () => {
      expect(TagQueryEngine.match(artifactTags, '形态:canvas|webgl', context)).toBe(true);
      expect(TagQueryEngine.match(artifactTags, '形态:svg|canvas', context)).toBe(false);
    });

    it('支持评分属性谓词 (rating / star / 星级)', () => {
      expect(TagQueryEngine.match(artifactTags, 'rating:>=4', context)).toBe(true);
      expect(TagQueryEngine.match(artifactTags, 'rating:5', context)).toBe(true);
      expect(TagQueryEngine.match(artifactTags, 'star:<3', context)).toBe(false);
    });

    it('支持版本属性谓词 (rev / revision / 版本)', () => {
      expect(TagQueryEngine.match(artifactTags, 'rev:>1', context)).toBe(true);
      expect(TagQueryEngine.match(artifactTags, 'rev:1..5', context)).toBe(true);
      expect(TagQueryEngine.match(artifactTags, 'rev:1', context)).toBe(false);
    });

    it('支持封面存在性谓词 (has:poster / -has:poster)', () => {
      expect(TagQueryEngine.match(artifactTags, 'has:poster', context)).toBe(true);
      expect(TagQueryEngine.match(artifactTags, '-has:poster', context)).toBe(false);
    });
  });

  describe('extractCursorToken', () => {
    it('精准识别光标所在位置的 token 以及管道符后的子查询', () => {
      const fullText = '形态:webgl|can 物理:流体';
      // "形态:webgl|can" 长度为 12，光标置于其末尾
      const tokenInfo = TagQueryEngine.extractCursorToken(fullText, 12);

      expect(tokenInfo.hasColon).toBe(true);
      expect(tokenInfo.namespace).toBe('形态');
      expect(tokenInfo.subQuery).toBe('can');
    });
  });

  describe('getSuggestions', () => {
    const allTags = ['形态:webgl', '形态:canvas', '物理:流体', '物理:引力'];

    it('输入命名空间冒号后，只推荐该命名空间下的具体值', () => {
      const tokenInfo = TagQueryEngine.extractCursorToken('形态:', 3);
      const suggestions = TagQueryEngine.getSuggestions(allTags, tokenInfo);

      const displayTexts = suggestions.map((s) => s.displayText);
      expect(displayTexts).toContain('webgl');
      expect(displayTexts).toContain('canvas');
      expect(displayTexts).not.toContain('流体');
    });
  });
});