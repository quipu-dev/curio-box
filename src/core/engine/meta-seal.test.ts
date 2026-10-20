import { MetaSealEngine } from '@/core/engine/meta-seal';
import { describe, expect, it } from 'vitest';

describe('MetaSealEngine', () => {
  const sampleHtml = `<!DOCTYPE html>
<html>
<head><title>Fluid Demo</title></head>
<body><canvas></canvas></body>
</html>`;

  it('能够向干净 HTML 注入带有标准符印的元数据注释', () => {
    const stamped = MetaSealEngine.inject(sampleHtml, {
      name: '流体动力学实验',
      tags: ['形态:webgl', '物理:流体'],
      rating: 5,
      currentRevision: 2,
      description: '性能优秀的流体标本',
    });

    expect(stamped).toContain('<!--@curio');
    expect(stamped).toContain('"name": "流体动力学实验"');
    expect(stamped).toContain('"revision": 2');
    expect(stamped).toContain('<!DOCTYPE html>');
  });

  it('能从已注入的 HTML 中精确还原提取所有元数据', () => {
    const metaInput = {
      name: '分形树',
      tags: ['领域:数学', '形态:canvas'],
      rating: 4,
      currentRevision: 1,
      description: '递归深度 12',
    };

    const stamped = MetaSealEngine.inject(sampleHtml, metaInput);
    const extracted = MetaSealEngine.extract(stamped);

    expect(extracted).not.toBeNull();
    expect(extracted?.name).toBe(metaInput.name);
    expect(extracted?.tags).toEqual(metaInput.tags);
    expect(extracted?.rating).toBe(metaInput.rating);
    expect(extracted?.revision).toBe(metaInput.currentRevision);
    expect(extracted?.description).toBe(metaInput.description);
  });

  it('具备更新符印能力：再次注入时自动替换旧符印，杜绝符印双重残留', () => {
    const v1Html = MetaSealEngine.inject(sampleHtml, {
      name: '版本一',
      currentRevision: 1,
    });

    const v2Html = MetaSealEngine.inject(v1Html, {
      name: '版本二',
      currentRevision: 2,
    });

    // 统计符印出现次数，必须唯一
    const matchCount = (v2Html.match(/<!--@curio/g) || []).length;
    expect(matchCount).toBe(1);

    const extracted = MetaSealEngine.extract(v2Html);
    expect(extracted?.name).toBe('版本二');
    expect(extracted?.revision).toBe(2);
  });

  it('strip 能纯净化剥离头部内嵌符印，还原源码', () => {
    const stamped = MetaSealEngine.inject(sampleHtml, { name: '待剥离工件' });
    const stripped = MetaSealEngine.strip(stamped);

    expect(stripped).not.toContain('<!--@curio');
    expect(stripped.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('对无符印的普通网页代码执行 extract 时优雅返回 null', () => {
    const extracted = MetaSealEngine.extract(sampleHtml);
    expect(extracted).toBeNull();
  });

  it('兼容 @meta 注释及旧别名字段 (desc, star, rev, 字符串 tags)', () => {
    const legacyHtml = `<!--@meta
{
  "name": "旧版标本",
  "tags": "形态:svg 状态:精选",
  "star": 5,
  "rev": 3,
  "desc": "旧版描述字段"
}
-->
<div>Hello Legacy</div>`;

    const extracted = MetaSealEngine.extract(legacyHtml);
    expect(extracted).not.toBeNull();
    expect(extracted?.name).toBe('旧版标本');
    expect(extracted?.tags).toEqual(['形态:svg', '状态:精选']);
    expect(extracted?.rating).toBe(5);
    expect(extracted?.revision).toBe(3);
    expect(extracted?.description).toBe('旧版描述字段');
  });
});