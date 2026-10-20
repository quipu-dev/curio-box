import { TitleSanitizerEngine } from '@/core/engine/title-sanitizer';
import { describe, expect, it } from 'vitest';

describe('TitleSanitizerEngine', () => {
  describe('extractTitle', () => {
    it('优先从 <title> 标签中提取标题', () => {
      const html =
        '<html><head><title>三维流体仿真</title></head><body><h1>标题一</h1></body></html>';
      expect(TitleSanitizerEngine.extractTitle(html)).toBe('三维流体仿真');
    });

    it('无 <title> 时退回提取首个 <h1> 标签，并自动过滤内部 HTML 标签', () => {
      const html = '<html><body><h1><span>粒子</span>系统</h1></body></html>';
      expect(TitleSanitizerEngine.extractTitle(html)).toBe('粒子系统');
    });

    it('完全无标题标签时，返回自动生成的合法工件名', () => {
      const html = '<div>纯文本无标题</div>';
      const extracted = TitleSanitizerEngine.extractTitle(html);
      expect(extracted.startsWith('新建工件_')).toBe(true);
    });
  });

  describe('sanitizeBaseName', () => {
    it('替换非法字符为下划线，并剔除末尾多余的点', () => {
      const raw = 'my/cool:project*v1.0?...';
      // '?' 被替换为 '_'，末尾 '...' 被去除
      expect(TitleSanitizerEngine.sanitizeBaseName(raw)).toBe('my_cool_project_v1.0_');

      const rawWithDotsOnly = 'my/project...';
      expect(TitleSanitizerEngine.sanitizeBaseName(rawWithDotsOnly)).toBe('my_project');
    });

    it('将 Windows 经典保留设备名转换为安全随机工件名', () => {
      expect(TitleSanitizerEngine.sanitizeBaseName('con')).toMatch(/^artifact_/);
      expect(TitleSanitizerEngine.sanitizeBaseName('NUL')).toMatch(/^artifact_/);
      expect(TitleSanitizerEngine.sanitizeBaseName('com1')).toMatch(/^artifact_/);
    });

    it('限制文件名长度不超过 60 个字符', () => {
      const veryLong = 'a'.repeat(100);
      expect(TitleSanitizerEngine.sanitizeBaseName(veryLong).length).toBe(60);
    });
  });

  describe('toSafeHtmlFilename', () => {
    it('生成标准且安全的 .html 后缀文件名', () => {
      expect(TitleSanitizerEngine.toSafeHtmlFilename('测试/页面')).toBe('测试_页面.html');
      expect(TitleSanitizerEngine.toSafeHtmlFilename('已带后缀.html')).toBe('已带后缀.html');
    });
  });

  describe('deduplicateFilename', () => {
    it('未发生同名冲突时保持原名', () => {
      const existing = ['other.html', 'test.html'];
      expect(TitleSanitizerEngine.deduplicateFilename('demo.html', existing)).toBe('demo.html');
    });

    it('发生同名冲突时不区分大小写自动追加递增后缀', () => {
      const existing = ['fluid.html', 'fluid_1.html'];
      expect(TitleSanitizerEngine.deduplicateFilename('fluid.html', existing)).toBe('fluid_2.html');
      // 消歧比对时不区分大小写，但返回文件名忠实保留输入的原大小写
      expect(TitleSanitizerEngine.deduplicateFilename('FLUID.HTML', existing)).toBe('FLUID_2.HTML');
    });
  });

  describe('wrapAsCompleteHtml', () => {
    it('如果输入已经是完整 HTML 文档，则保持原汁原味', () => {
      const fullHtml = '<!DOCTYPE html><html><body>ok</body></html>';
      expect(TitleSanitizerEngine.wrapAsCompleteHtml(fullHtml)).toBe(fullHtml);
    });

    it('如果输入是裸 JavaScript 片段，自动包裹为标准 WebGL/Canvas 全屏活体容器', () => {
      const rawJs = 'const c = document.getElementById("canvas");';
      const wrapped = TitleSanitizerEngine.wrapAsCompleteHtml(rawJs, '交互测试');

      expect(wrapped).toContain('<!DOCTYPE html>');
      expect(wrapped).toContain('<title>交互测试</title>');
      expect(wrapped).toContain('<canvas id="canvas"></canvas>');
      expect(wrapped).toContain(rawJs);
    });
  });
});
