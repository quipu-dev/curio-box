export interface DiffLine {
  type: 'add' | 'delete' | 'normal';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface CodeDiffResult {
  lines: DiffLine[];
  additions: number;
  deletions: number;
}

/**
 * 经典高效行级 Diff 算法 (LCS + 首尾公共前缀/后缀裁剪优化)
 */
export function computeLineDiff(oldText: string, newText: string): CodeDiffResult {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);

  const n = oldLines.length;
  const m = newLines.length;

  let commonPrefixCount = 0;
  while (
    commonPrefixCount < n &&
    commonPrefixCount < m &&
    oldLines[commonPrefixCount] === newLines[commonPrefixCount]
  ) {
    commonPrefixCount++;
  }

  let commonSuffixCount = 0;
  while (
    commonSuffixCount < n - commonPrefixCount &&
    commonSuffixCount < m - commonPrefixCount &&
    oldLines[n - 1 - commonSuffixCount] === newLines[m - 1 - commonSuffixCount]
  ) {
    commonSuffixCount++;
  }

  const subOld = oldLines.slice(commonPrefixCount, n - commonSuffixCount);
  const subNew = newLines.slice(commonPrefixCount, m - commonSuffixCount);

  const sn = subOld.length;
  const sm = subNew.length;

  const dp: number[][] = Array.from({ length: sn + 1 }, () => new Array(sm + 1).fill(0));

  for (let i = 1; i <= sn; i++) {
    for (let j = 1; j <= sm; j++) {
      if (subOld[i - 1] === subNew[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const middleDiff: DiffLine[] = [];
  let i = sn;
  let j = sm;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && subOld[i - 1] === subNew[j - 1]) {
      middleDiff.push({
        type: 'normal',
        content: subOld[i - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      middleDiff.push({
        type: 'add',
        content: subNew[j - 1],
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      middleDiff.push({
        type: 'delete',
        content: subOld[i - 1],
      });
      i--;
    }
  }

  middleDiff.reverse();

  const finalLines: DiffLine[] = [];
  let oldLineIdx = 1;
  let newLineIdx = 1;

  for (let p = 0; p < commonPrefixCount; p++) {
    finalLines.push({
      type: 'normal',
      content: oldLines[p],
      oldLineNumber: oldLineIdx++,
      newLineNumber: newLineIdx++,
    });
  }

  let additions = 0;
  let deletions = 0;

  for (const item of middleDiff) {
    if (item.type === 'normal') {
      finalLines.push({
        ...item,
        oldLineNumber: oldLineIdx++,
        newLineNumber: newLineIdx++,
      });
    } else if (item.type === 'add') {
      additions++;
      finalLines.push({
        ...item,
        newLineNumber: newLineIdx++,
      });
    } else if (item.type === 'delete') {
      deletions++;
      finalLines.push({
        ...item,
        oldLineNumber: oldLineIdx++,
      });
    }
  }

  for (let s = n - commonSuffixCount; s < n; s++) {
    finalLines.push({
      type: 'normal',
      content: oldLines[s],
      oldLineNumber: oldLineIdx++,
      newLineNumber: newLineIdx++,
    });
  }

  return {
    lines: finalLines,
    additions,
    deletions,
  };
}
