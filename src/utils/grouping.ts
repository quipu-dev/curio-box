import type { Artifact } from '@/types';
import { pinyin } from 'pinyin-pro';

/**
 * 提取汉字拼音首字母或字符归类：
 * 1. 数字 (0-9) 直接作为字符桶
 * 2. 字母 (A-Z, a-z) 转为大写字母桶
 * 3. 汉字提取声母/首拼字母并转为大写 (A-Z)
 * 4. 其余符号统一归类至 '#'
 */
export function getArtifactFirstLetterKey(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '#';

  const firstChar = trimmed[0];

  // 1. 数字字符 (0-9)
  if (/^[0-9]$/.test(firstChar)) {
    return firstChar;
  }

  // 2. 英文字母 (A-Z)
  if (/^[a-zA-Z]$/.test(firstChar)) {
    return firstChar.toUpperCase();
  }

  // 3. 汉字范围检测 (\u4e00-\u9fa5)
  if (/^[\u4e00-\u9fa5]$/.test(firstChar)) {
    try {
      const pinyinFirst = pinyin(firstChar, {
        pattern: 'first',
        toneType: 'none',
        type: 'array',
      })[0];
      if (pinyinFirst && /^[a-zA-Z]$/.test(pinyinFirst)) {
        return pinyinFirst.toUpperCase();
      }
    } catch {
      // 容错处理
    }
  }

  return '#';
}

/**
 * 精确到日的分组 Key：YYYY-MM-DD
 */
export function getArtifactDayKey(artifact: Artifact, useUpdatedAt = false): string {
  const targetDateStr = useUpdatedAt
    ? artifact.meta.updatedAt || artifact.meta.createdAt
    : artifact.meta.createdAt;

  try {
    const d = new Date(targetDateStr);
    if (Number.isNaN(d.getTime())) return '更早归档';

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '更早归档';
  }
}

/**
 * 星级评分分组 Key
 */
export function getArtifactRatingKey(rating?: number): string {
  if (!rating || rating <= 0) return '未评分工件';
  return `${rating} 星精选`;
}
