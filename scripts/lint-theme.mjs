import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');

// 终端色彩 ANSI 转义码
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

/**
 * 非颜色性质的边框实用类黑名单
 */
const NON_COLOR_BORDER_TOKENS = new Set([
  'border',
  'border-t',
  'border-b',
  'border-l',
  'border-r',
  'border-x',
  'border-y',
  'border-0',
  'border-2',
  'border-4',
  'border-8',
  'border-dashed',
  'border-dotted',
  'border-double',
  'border-hidden',
  'border-none',
  'border-collapse',
  'border-separate',
]);

/**
 * 违规规则定义
 */
const RULES = [
  {
    id: 'THEME_HARDCODED_LIGHT_TEXT',
    name: '硬编码浅色文字阶（日间模式下白底白字不可读）',
    severity: 'error',
    pattern: /\btext-(?:zinc|slate|gray|neutral)-(?:50|100|200|300)\b/g,
    suggestion: '请改用语义化主题 Token：text-main (主文本) 或 text-muted (辅助文本)',
  },
  {
    id: 'THEME_UNSUPPORTED_ALPHA_ON_HEX',
    name: '未支持透明度通道的 CSS 变量滥用 Alpha 后缀（导致边框失效降级为纯白线）',
    severity: 'error',
    pattern:
      /\b(?:border-border|border-border-subtle|bg-surface|bg-surface-elevated|bg-background)\/\d+\b/g,
    suggestion:
      'Hex 变量不支持类名加 /alpha；请使用实体类名（如 border-border）或在 CSS 中配置 RGB 通道',
  },
];

/**
 * 递归收集所有待检测文件
 */
function collectFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.gallery') {
        results.push(...collectFiles(fullPath));
      }
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * 分析单个文件
 */
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const issues = [];

  // 判断是否整体为强制暗色作用域（如全屏视口/暗房等）
  const isEnforcedDarkScope =
    content.includes('dark-scope') ||
    filePath.includes('FullscreenStage.tsx') ||
    filePath.includes('SandboxViewport.tsx');

  // 正则提取 JSX 中的 className 声明（包括单双引号和模板字符串）
  const classRegex = /className=(?:(?:["']([^"']*)["'])|(?:\{`([^`]*)`\}))/g;

  let match;
  while ((match = classRegex.exec(content)) !== null) {
    const classStr = match[1] || match[2] || '';
    if (!classStr) continue;

    // 计算当前匹配在源码中的行号与列号
    const matchIndex = match.index;
    const prefix = content.slice(0, matchIndex);
    const lineNum = prefix.split('\n').length;

    // 将 className 拆解为独立的原子 Token 集合
    const tokens = classStr.split(/\s+/).filter(Boolean);
    const hasBorderWidth = tokens.some((t) =>
      ['border', 'border-t', 'border-b', 'border-l', 'border-r'].includes(t),
    );
    const hasBorderColor = tokens.some(
      (t) => t.startsWith('border-') && !NON_COLOR_BORDER_TOKENS.has(t),
    );

    // 真正的孤立 border：声明了边框，但整个 classStr 中完全没有任何 border 颜色类
    if (hasBorderWidth && !hasBorderColor) {
      issues.push({
        ruleId: 'THEME_BORDER_CURRENT_COLOR_RISK',
        ruleName: '边框声明后未指定有效颜色（极易继承 currentColor 变成高亮亮线）',
        severity: 'warn',
        line: lineNum,
        token: 'border',
        suggestion: '声明 border 时建议显式指明边框颜色，例如：border border-border',
      });
    }

    for (const rule of RULES) {
      // 若处于强制暗色视口且是浅色文本规则，允许通过
      if (rule.id === 'THEME_HARDCODED_LIGHT_TEXT' && isEnforcedDarkScope) {
        continue;
      }

      const foundTokens = classStr.match(rule.pattern);
      if (foundTokens) {
        for (const token of foundTokens) {
          issues.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            line: lineNum,
            token,
            suggestion: rule.suggestion,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * 运行主扫描程序
 */
function run() {
  console.log(
    `${colors.bold}${colors.cyan}🔍 开始扫描 Curio-Box 主题与样式系统规范...${colors.reset}\n`,
  );

  const files = collectFiles(SRC_DIR);
  let totalErrors = 0;
  let totalWarnings = 0;
  let filesWithIssues = 0;

  for (const file of files) {
    const issues = analyzeFile(file);
    if (issues.length > 0) {
      filesWithIssues++;
      const relativePath = path.relative(ROOT_DIR, file);
      console.log(`${colors.bold}📄 ${relativePath}${colors.reset}`);

      for (const issue of issues) {
        const isError = issue.severity === 'error';
        const badge = isError
          ? `${colors.red}[ERROR]${colors.reset}`
          : `${colors.yellow}[WARN]${colors.reset}`;

        if (isError) totalErrors++;
        else totalWarnings++;

        console.log(
          `  ${badge} 行 ${colors.cyan}${issue.line}${colors.reset}: 发现违规类名 "${colors.bold}${issue.token}${colors.reset}"`,
        );
        console.log(`    ${colors.dim}规则: ${issue.ruleName}${colors.reset}`);
        console.log(`    ${colors.green}建议: ${issue.suggestion}${colors.reset}\n`);
      }
    }
  }

  console.log(
    `${colors.bold}───────────────────────────────────────────────────────${colors.reset}`,
  );
  console.log(
    `扫描完成: 共检查 ${colors.bold}${files.length}${colors.reset} 个源文件，在 ${colors.bold}${filesWithIssues}${colors.reset} 个文件中发现问题。`,
  );
  console.log(
    `结果统计: ${colors.red}${totalErrors} 处错误${colors.reset}，${colors.yellow}${totalWarnings} 处警告${colors.reset}。\n`,
  );

  if (totalErrors > 0) {
    console.log(
      `${colors.red}❌ 样式系统规范检查未通过。请根据上述建议修复硬编码字阶与边框变量失效问题。${colors.reset}`,
    );
    process.exit(1);
  } else if (totalWarnings > 0) {
    console.log(`${colors.yellow}⚠️  检查通过，但存在部分警告，建议优化。${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`${colors.green}✅ 样式系统规范检查完全通过！未发现违规硬编码。${colors.reset}`);
    process.exit(0);
  }
}

run();
