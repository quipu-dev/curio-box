/**
 * 智能标题提取与文件名合法性清洗引擎
 * 遵循跨平台文件系统 (Windows/macOS/Linux) 安全命名约束
 */

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export const TitleSanitizerEngine = {
  /**
   * 从 HTML 中按优先级提取标题：
   * 1. <title> 标签
   * 2. 第一个 <h1> 标签
   * 3. 兜底默认命名
   */
  extractTitle(html: string): string {
    const trimmed = html.trim();
    if (!trimmed) {
      return `新建工件_${new Date().toISOString().slice(0, 10)}`;
    }

    const titleMatch = trimmed.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch?.[1].trim()) {
      return titleMatch[1].trim();
    }

    const h1Match = trimmed.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (h1Match?.[1].trim()) {
      // 过滤内联 HTML 标签
      return h1Match[1].replace(/<[^>]+>/g, '').trim();
    }

    return `新建工件_${Date.now().toString(36).slice(-5)}`;
  },

  /**
   * 将任意标题或工件名清洗为合法的文件名（不含 .html 后缀）
   */
  sanitizeBaseName(rawName: string): string {
    const withoutIllegalChars = rawName.replace(/[\\/:*?"<>|]/g, '_');

    // 过滤 ASCII 控制字符 (0-31 和 127)，避免使用正则字面量触发 noControlCharactersInRegex
    let filteredChars = '';
    for (const char of withoutIllegalChars) {
      const code = char.charCodeAt(0);
      if (code >= 32 && code !== 127) {
        filteredChars += char;
      }
    }

    let cleaned = filteredChars.trim().replace(/\.+$/, ''); // 剔除末尾多余的点

    if (!cleaned || WINDOWS_RESERVED_NAMES.test(cleaned)) {
      cleaned = `artifact_${Date.now().toString(36)}`;
    }

    // 截断过长文件名（保持在 60 字符以内）
    return cleaned.slice(0, 60);
  },

  /**
   * 生成最终安全合法的 .html 文件名
   */
  toSafeHtmlFilename(rawName: string): string {
    const base = this.sanitizeBaseName(rawName.replace(/\.html$/i, ''));
    return `${base}.html`;
  },

  /**
   * 针对当前目录已有文件列表进行去重消歧
   */
  deduplicateFilename(filename: string, existingFilenames: string[]): string {
    const existingSet = new Set(existingFilenames.map((f) => f.toLowerCase()));
    if (!existingSet.has(filename.toLowerCase())) {
      return filename;
    }

    const extIndex = filename.lastIndexOf('.');
    const baseName = extIndex !== -1 ? filename.slice(0, extIndex) : filename;
    const ext = extIndex !== -1 ? filename.slice(extIndex) : '.html';

    let counter = 1;
    while (existingSet.has(`${baseName}_${counter}${ext}`.toLowerCase())) {
      counter++;
    }

    return `${baseName}_${counter}${ext}`;
  },

  /**
   * 检查代码完整性；若为裸 JS 或片段代码，自动包裹为标准单文件工件模板
   */
  wrapAsCompleteHtml(rawCode: string, title = '新建工件'): string {
    const trimmed = rawCode.trim();
    const hasHtmlStructure =
      /<html[\s>]/i.test(trimmed) ||
      /<!doctype html>/i.test(trimmed) ||
      /<body[\s>]/i.test(trimmed) ||
      /<head[\s>]/i.test(trimmed);

    if (hasHtmlStructure) {
      return trimmed;
    }

    // 自动为裸脚本包装标准的 WebGL/Canvas 全屏活体容器
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    canvas { display: block; width: 100%; height: 100%; object-fit: contain; }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <script>
${trimmed}
  </script>
</body>
</html>`;
  },
};
