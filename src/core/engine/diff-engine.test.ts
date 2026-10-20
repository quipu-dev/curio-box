import { computeLineDiff } from '@/core/engine/diff-engine';
import { describe, expect, it } from 'vitest';

describe('DiffEngine', () => {
  it('当两段文本完全一致时，无增加也无删除', () => {
    const text = 'line 1\nline 2\nline 3';
    const result = computeLineDiff(text, text);

    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.lines.every((l) => l.type === 'normal')).toBe(true);
  });

  it('能精准检测中间代码修改并计算增删行数', () => {
    const oldText = 'const a = 1;\nconst b = 2;\nconsole.log(a + b);';
    const newText = 'const a = 1;\nconst b = 99;\nconst extra = true;\nconsole.log(a + b);';

    const result = computeLineDiff(oldText, newText);

    expect(result.deletions).toBe(1); // 删除 const b = 2;
    expect(result.additions).toBe(2); // 增加 const b = 99; 和 const extra = true;

    const addedLines = result.lines.filter((l) => l.type === 'add');
    expect(addedLines[0].content).toBe('const b = 99;');
    expect(addedLines[1].content).toBe('const extra = true;');

    const deletedLines = result.lines.filter((l) => l.type === 'delete');
    expect(deletedLines[0].content).toBe('const b = 2;');
  });

  it('正确处理完全新增与完全清空场景', () => {
    const emptyToText = computeLineDiff('', 'line 1\nline 2');
    expect(emptyToText.additions).toBeGreaterThanOrEqual(1);

    const textToEmpty = computeLineDiff('line 1\nline 2', '');
    expect(textToEmpty.deletions).toBeGreaterThanOrEqual(1);
  });
});
