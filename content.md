收到 `pnpm check` 的报错。这主要包含：
1. **Biome Linter 规则拦截**：`noStaticOnlyClass`（纯静态类需改为对象或纯函数）、`noExplicitAny`（需消除显式 `any`）、`noCommentText`（JSX 内的 `//` 文本需安全转义）、`useKeyWithClickEvents`（可点击卡片需补充键盘事件及无障碍属性）、`useExhaustiveDependencies`（`useEffect` 依赖项）。
2. **Biome Formatter 格式化要求**：文件末尾换行符（EOF LF）、CSS 双引号规范与 JSX 空格规范。

我将按照规范修复所有源代码与配置文件，并执行 `checkf` 和 `check` 确保零错误通过。

## [WIP] fix: 修复 Biome 代码风格与 TypeScript 静态检查诊断问题

### 错误分析
运行 `pnpm check`（`biome check . && tsc --noEmit`）时触发了 36 处诊断异常：
1. **Linter 规则违规**：
   - `TagQueryEngine` 与 `DarkroomApplier` 为纯静态类，触发了 `lint/complexity/noStaticOnlyClass`。
   - `Header.tsx` 中在 JSX 文本节点直接书写了 `//`，触发 `lint/suspicious/noCommentText`。
   - `ArtifactCard.tsx` 的卡片根元素监听了 `onClick` 但未绑定键盘事件与角色，触发 `lint/a11y/useKeyWithClickEvents`。
   - `App.tsx`、`SandboxViewport.tsx`、`fs-storage.ts` 与 `DarkroomModal.tsx` 中存在多处 `any` 类型声明，触发 `lint/suspicious/noExplicitAny`。
   - `App.tsx` 的 `useEffect` 存在未包裹 `useCallback` 的依赖丢失，触发 `lint/correctness/useExhaustiveDependencies`。
2. **Formatter 格式差异**：
   - `index.css`、`package.json`、`biome.json`、`tsconfig.json` 等配置与代码文件缺少尾部换行或单双引号规范不符合 Biome 规则。

### 用户需求
修复 `pnpm check` 报告的所有 Biome 与 TypeScript 诊断错误，确保格式、无障碍标准与类型安全完全达标。

### 评论
Biome 的检查极为严格（涵盖 Lint、Format 与 A11y 无障碍）。将纯静态类转为命名空间常量对象（Object Literal）、补齐键盘事件与精确的 `unknown` 错误类型收窄，不仅能通过校验，还能显著增强代码在生产环境下的健壮性与可维护性。

### 目标
1. 重构 `TagQueryEngine` 与 `DarkroomApplier` 为标准对象，消除纯静态类警告。
2. 转义 `Header.tsx` 中的注释符号，为 `ArtifactCard.tsx` 添加 `role="button"` 与键盘可访问性响应。
3. 消除所有 `any` 类型声明，收窄 `catch (err: unknown)` 的错误处理。
4. 使用 `useCallback` 稳定 `loadArtifacts` 引用。
5. 运行 `pnpm checkf` 统一格式化，确保 `pnpm check` 干净通过。

### 基本原理
1. 将 `class X { static foo() }` 重构为 `export const X = { foo() }`，符合现代 TypeScript 函数式与无状态最佳实践。
2. 通过 `role="button"`、`tabIndex={0}` 与 `onKeyDown` 满足 WCAG 2.1 规范。
3. 通过 `err instanceof Error ? err.message : String(err)` 进行安全类型降级，代替危险的 `any`。

### 标签
#intent/fix #flow/ready #priority/high #comp/build #concept/executor #scope/dx #scope/core #ai/instruct #task/domain/testing #task/object/linter-compliance #task/action/refactor #task/state/continue

---

### Script

#### Acts 1: 重构引擎与应用器消除纯静态类

更新 `tag-engine.ts` 与 `patch-fsm.ts`。

~~~~~act
write_file
src/layer2_darkroom/engine/tag-engine.ts
~~~~~
~~~~~typescript
import type { Tag } from '@/types';

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
};
~~~~~

~~~~~act
write_file
src/layer2_darkroom/fsm/patch-fsm.ts
~~~~~
~~~~~typescript
import type { PatchAction, PatchCommand } from '@/types';

interface FenceDelimiter {
  char: '`' | '~';
  length: number;
}

enum FSMState {
  SEEKING_ACT = 0,
  IN_ACT = 1,
  SEEKING_OLD_DOC = 2,
  IN_OLD_DOC = 3,
  SEEKING_NEW_DOC = 4,
  IN_NEW_DOC = 5,
}

export class DarkroomPatchFSM {
  private state: FSMState = FSMState.SEEKING_ACT;
  private currentFence: FenceDelimiter | null = null;
  private bufferAction = '';
  private bufferOldDoc: string[] = [];
  private bufferNewDoc: string[] = [];
  private commands: PatchCommand[] = [];

  private readonly fenceOpenRegex = /^(`{3,}|~{3,})\s*([a-zA-Z0-9_-]*)\s*$/;

  public parse(input: string): PatchCommand[] {
    this.reset();
    const lines = input.split(/\r?\n/);
    for (const line of lines) {
      this.consumeLine(line);
    }
    return this.commands;
  }

  public reset(): void {
    this.state = FSMState.SEEKING_ACT;
    this.currentFence = null;
    this.bufferAction = '';
    this.bufferOldDoc = [];
    this.bufferNewDoc = [];
    this.commands = [];
  }

  private consumeLine(line: string): void {
    switch (this.state) {
      case FSMState.SEEKING_ACT: {
        const match = line.match(this.fenceOpenRegex);
        if (match && match[2].trim() === 'act') {
          this.currentFence = this.extractFence(match[1]);
          this.state = FSMState.IN_ACT;
          this.bufferAction = '';
        }
        break;
      }

      case FSMState.IN_ACT: {
        if (this.isMatchingClosingFence(line)) {
          this.state = FSMState.SEEKING_OLD_DOC;
          this.currentFence = null;
        } else {
          this.bufferAction += line.trim();
        }
        break;
      }

      case FSMState.SEEKING_OLD_DOC: {
        const match = line.match(this.fenceOpenRegex);
        if (match && match[2].trim() === 'old_doc') {
          this.currentFence = this.extractFence(match[1]);
          this.state = FSMState.IN_OLD_DOC;
          this.bufferOldDoc = [];
        }
        break;
      }

      case FSMState.IN_OLD_DOC: {
        if (this.isMatchingClosingFence(line)) {
          this.state = FSMState.SEEKING_NEW_DOC;
          this.currentFence = null;
        } else {
          this.bufferOldDoc.push(line);
        }
        break;
      }

      case FSMState.SEEKING_NEW_DOC: {
        const match = line.match(this.fenceOpenRegex);
        if (match && match[2].trim() === 'new_doc') {
          this.currentFence = this.extractFence(match[1]);
          this.state = FSMState.IN_NEW_DOC;
          this.bufferNewDoc = [];
        }
        break;
      }

      case FSMState.IN_NEW_DOC: {
        if (this.isMatchingClosingFence(line)) {
          this.emitCommand();
          this.state = FSMState.SEEKING_ACT;
          this.currentFence = null;
        } else {
          this.bufferNewDoc.push(line);
        }
        break;
      }
    }
  }

  private extractFence(rawFence: string): FenceDelimiter {
    return {
      char: rawFence[0] as '`' | '~',
      length: rawFence.length,
    };
  }

  private isMatchingClosingFence(line: string): boolean {
    if (!this.currentFence) return false;
    const trimmed = line.trim();
    if (trimmed.length < this.currentFence.length) return false;

    const expectedChar = this.currentFence.char;
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] !== expectedChar) return false;
    }
    return true;
  }

  private emitCommand(): void {
    const rawAction = this.bufferAction.trim();
    if (rawAction !== 'patch_file' && rawAction !== 'write_file') {
      return;
    }

    this.commands.push({
      action: rawAction as PatchAction,
      oldDoc: this.bufferOldDoc.join('\n'),
      newDoc: this.bufferNewDoc.join('\n'),
    });
  }
}

export const DarkroomApplier = {
  apply(sourceCode: string, command: PatchCommand): string {
    if (command.action === 'write_file') {
      return command.newDoc;
    }

    if (command.action === 'patch_file') {
      const normalizedSource = sourceCode.replace(/\r\n/g, '\n');
      const normalizedOld = command.oldDoc.replace(/\r\n/g, '\n');
      const normalizedNew = command.newDoc.replace(/\r\n/g, '\n');

      if (!normalizedSource.includes(normalizedOld)) {
        throw new Error('【暗房冲突】目标底片未匹配到 old_doc 指定的内容，拒绝应用补丁。');
      }

      return normalizedSource.replace(normalizedOld, normalizedNew);
    }

    return sourceCode;
  },
};
~~~~~

#### Acts 2: 消除存储层与沙箱层的 any 声明

更新 `fs-storage.ts` 与 `SandboxViewport.tsx`，使用规范的类型安全断言。

~~~~~act
write_file
src/layer2_darkroom/storage/fs-storage.ts
~~~~~
~~~~~typescript
import type { Artifact, ArtifactMeta } from '@/types';

const GALLERY_DIR = '.gallery';
const POSTERS_DIR = 'posters';
const NEGATIVES_DIR = 'negatives';
const META_FILE = 'meta.json';

interface WritableFileStream {
  write(data: unknown): Promise<void>;
  close(): Promise<void>;
}

interface CustomFileHandle extends FileSystemFileHandle {
  createWritable(): Promise<WritableFileStream>;
}

export class GalleryStorage {
  private dirHandle: FileSystemDirectoryHandle | null = null;

  public setDirectoryHandle(handle: FileSystemDirectoryHandle): void {
    this.dirHandle = handle;
  }

  public hasHandle(): boolean {
    return this.dirHandle !== null;
  }

  public async scanArtifacts(): Promise<Artifact[]> {
    if (!this.dirHandle) {
      return this.getMockArtifacts();
    }

    const artifacts: Artifact[] = [];
    const metaMap = await this.readAllMeta();

    const entries = (this.dirHandle as unknown as { values: () => AsyncIterable<FileSystemHandle> }).values();
    for await (const entry of entries) {
      if (entry.kind === 'file' && entry.name.endsWith('.html')) {
        const file = await (entry as FileSystemFileHandle).getFile();
        const text = await file.text();
        const meta = metaMap[entry.name] || {
          id: `art_${Math.random().toString(16).slice(2, 10)}`,
          name: entry.name.replace(/\.html$/, ''),
          filename: entry.name,
          tags: ['形态:原生html', '状态:未分类'],
          currentRevision: 1,
          updatedAt: new Date().toISOString(),
        };

        const posterBlobUrl = await this.loadPosterBlobUrl(entry.name);

        artifacts.push({
          meta,
          sourceCode: text,
          posterBlobUrl,
        });
      }
    }

    return artifacts;
  }

  public async saveArtifactSource(
    filename: string,
    newContent: string,
    revision: number
  ): Promise<void> {
    if (!this.dirHandle) return;

    const fileHandle = (await this.dirHandle.getFileHandle(filename, { create: true })) as CustomFileHandle;
    const writable = await fileHandle.createWritable();
    await writable.write(newContent);
    await writable.close();

    await this.recordNegativeRevision(filename, revision, newContent);
  }

  public async savePoster(filename: string, blob: Blob): Promise<string> {
    if (!this.dirHandle) {
      return URL.createObjectURL(blob);
    }

    const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
    const postersDir = await galleryDir.getDirectoryHandle(POSTERS_DIR, { create: true });
    const posterFilename = `${filename.replace(/\.html$/, '')}.webp`;
    const posterHandle = (await postersDir.getFileHandle(posterFilename, { create: true })) as CustomFileHandle;

    const writable = await posterHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    return URL.createObjectURL(blob);
  }

  public async saveMeta(meta: ArtifactMeta): Promise<void> {
    if (!this.dirHandle) return;
    const allMeta = await this.readAllMeta();
    allMeta[meta.filename] = meta;

    const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
    const metaHandle = (await galleryDir.getFileHandle(META_FILE, { create: true })) as CustomFileHandle;
    const writable = await metaHandle.createWritable();
    await writable.write(JSON.stringify(allMeta, null, 2));
    await writable.close();
  }

  public async recordNegativeRevision(
    filename: string,
    revision: number,
    content: string
  ): Promise<void> {
    if (!this.dirHandle) return;
    const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
    const negativesDir = await galleryDir.getDirectoryHandle(NEGATIVES_DIR, { create: true });
    const baseDir = await negativesDir.getDirectoryHandle(filename.replace(/\.html$/, ''), {
      create: true,
    });

    const revHandle = (await baseDir.getFileHandle(
      `rev-${String(revision).padStart(4, '0')}.snapshot`,
      { create: true }
    )) as CustomFileHandle;
    const writable = await revHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  public async loadNegativeRevision(
    filename: string,
    revision: number
  ): Promise<string | null> {
    if (!this.dirHandle) return null;
    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR);
      const negativesDir = await galleryDir.getDirectoryHandle(NEGATIVES_DIR);
      const baseDir = await negativesDir.getDirectoryHandle(filename.replace(/\.html$/, ''));
      const revHandle = await baseDir.getFileHandle(`rev-${String(revision).padStart(4, '0')}.snapshot`);
      const file = await revHandle.getFile();
      return await file.text();
    } catch {
      return null;
    }
  }

  private async readAllMeta(): Promise<Record<string, ArtifactMeta>> {
    if (!this.dirHandle) return {};
    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
      const metaHandle = await galleryDir.getFileHandle(META_FILE);
      const file = await metaHandle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  private async loadPosterBlobUrl(filename: string): Promise<string | undefined> {
    if (!this.dirHandle) return undefined;
    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR);
      const postersDir = await galleryDir.getDirectoryHandle(POSTERS_DIR);
      const posterFilename = `${filename.replace(/\.html$/, '')}.webp`;
      const posterHandle = await postersDir.getFileHandle(posterFilename);
      const file = await posterHandle.getFile();
      return URL.createObjectURL(file);
    } catch {
      return undefined;
    }
  }

  public getMockArtifacts(): Artifact[] {
    return [
      {
        meta: {
          id: 'art_fluid2d',
          name: '纳维-斯托克斯二维流体仿真',
          filename: 'fluid-simulation.html',
          tags: ['领域:图形学', '形态:webgl', '物理:流体', '模型:claude-3.5-sonnet'],
          currentRevision: 4,
          updatedAt: '2025-02-28T12:00:00Z',
        },
        sourceCode: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; background: #000; overflow: hidden; display: flex; align-items: center; justify-content: center; height: 100vh; }
    canvas { width: 100%; height: 100%; object-fit: contain; }
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    canvas.width = 600; canvas.height = 450;
    let t = 0;
    function render() {
      ctx.fillStyle = 'rgba(10, 15, 30, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      t += 0.03;
      for (let i = 0; i < 40; i++) {
        const x = canvas.width / 2 + Math.sin(t + i * 0.2) * (120 + Math.sin(t * 0.5) * 50);
        const y = canvas.height / 2 + Math.cos(t * 0.8 + i * 0.3) * (90 + Math.cos(t * 0.3) * 40);
        ctx.beginPath();
        ctx.arc(x, y, 12 + Math.sin(i + t) * 6, 0, Math.PI * 2);
        ctx.fillStyle = 'hsl(' + ((t * 30 + i * 10) % 360) + ', 85%, 60%)';
        ctx.fill();
      }
      requestAnimationFrame(render);
    }
    render();
  </script>
</body>
</html>`,
      },
      {
        meta: {
          id: 'art_fractal',
          name: '曼德博分形三维投影切片',
          filename: 'mandelbulb-projection.html',
          tags: ['领域:数学', '形态:着色器', '数学:分形', '模型:gpt-4o'],
          currentRevision: 2,
          updatedAt: '2025-02-28T13:30:00Z',
        },
        sourceCode: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; background: #05050a; overflow: hidden; display: flex; align-items: center; justify-content: center; height: 100vh; }
    canvas { width: 100%; height: 100%; object-fit: contain; }
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    canvas.width = 600; canvas.height = 450;
    let angle = 0;
    function render() {
      ctx.fillStyle = '#05050a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      angle += 0.02;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      for (let i = 0; i < 300; i++) {
        const r = Math.sqrt(i) * 14;
        const theta = i * 2.39996 + angle;
        const x = cx + r * Math.cos(theta);
        const y = cy + r * Math.sin(theta);
        ctx.fillStyle = 'hsl(' + (i * 2 + angle * 50) % 360 + ', 90%, 65%)';
        ctx.fillRect(x, y, 3, 3);
      }
      requestAnimationFrame(render);
    }
    render();
  </script>
</body>
</html>`,
      },
      {
        meta: {
          id: 'art_kinetic',
          name: '动能排版拓扑构图',
          filename: 'kinetic-typography.html',
          tags: ['领域:视觉', '形态:canvas2d', '风格:粗野主义'],
          currentRevision: 1,
          updatedAt: '2025-02-28T14:15:00Z',
        },
        sourceCode: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; background: #111; overflow: hidden; display: flex; align-items: center; justify-content: center; height: 100vh; }
    canvas { width: 100%; height: 100%; object-fit: contain; }
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    canvas.width = 600; canvas.height = 450;
    let offset = 0;
    function render() {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      offset += 1.5;
      ctx.font = '900 48px sans-serif';
      ctx.fillStyle = '#38bdf8';
      for(let y = 50; y < canvas.height; y += 70) {
        ctx.fillText('CURIO-BOX ARTIFACT', (Math.sin((offset + y) * 0.02) * 80) + 20, y);
      }
      requestAnimationFrame(render);
    }
    render();
  </script>
</body>
</html>`,
      },
    ];
  }
}

export const galleryStorage = new GalleryStorage();
~~~~~

~~~~~act
write_file
src/layer1_sandbox/SandboxViewport.tsx
~~~~~
~~~~~typescript
import React, { useEffect, useRef } from 'react';

interface SandboxViewportProps {
  htmlPayload: string;
  isActivated: boolean;
  onCaptureReady?: (captureHandle: () => Promise<Blob>) => void;
}

const CAPTURE_HARNESS_SCRIPT = `
<script id="__curio_harness__">
(function() {
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attribs) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      attribs = Object.assign({}, attribs, { preserveDrawingBuffer: true });
    }
    return origGetContext.call(this, type, attribs);
  };

  window.addEventListener('message', function(ev) {
    if (!ev.data || ev.data.type !== 'CURIO_CAPTURE_REQUEST') return;
    const reqId = ev.data.requestId;
    try {
      const canvas = document.querySelector('canvas');
      if (!canvas) {
        window.parent.postMessage({
          type: 'CURIO_CAPTURE_RESPONSE',
          requestId: reqId,
          error: '工件视口内未探测到 Canvas 画布'
        }, '*');
        return;
      }
      const dataUrl = canvas.toDataURL('image/webp', 0.92);
      window.parent.postMessage({
        type: 'CURIO_CAPTURE_RESPONSE',
        requestId: reqId,
        dataUrl: dataUrl
      }, '*');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '画布定格失败';
      window.parent.postMessage({
        type: 'CURIO_CAPTURE_RESPONSE',
        requestId: reqId,
        error: errorMsg
      }, '*');
    }
  });
})();
</script>
`;

export const SandboxViewport: React.FC<SandboxViewportProps> = ({
  htmlPayload,
  isActivated,
  onCaptureReady,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    if (!isActivated) {
      iframe.src = 'about:blank';
      return;
    }

    let finalHtml = htmlPayload;
    if (finalHtml.includes('<head>')) {
      finalHtml = finalHtml.replace('<head>', `<head>${CAPTURE_HARNESS_SCRIPT}`);
    } else {
      finalHtml = CAPTURE_HARNESS_SCRIPT + finalHtml;
    }

    const blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    iframe.src = url;

    return () => {
      URL.revokeObjectURL(url);
      iframe.src = 'about:blank';
    };
  }, [htmlPayload, isActivated]);

  useEffect(() => {
    if (!onCaptureReady) return;

    onCaptureReady(async () => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) {
        throw new Error('沙箱未激活，无法定格封印快照');
      }

      const requestId = `req_${Math.random().toString(36).slice(2, 10)}`;

      return new Promise<Blob>((resolve, reject) => {
        const timeoutTimer = setTimeout(() => {
          window.removeEventListener('message', handleResponse);
          reject(new Error('定格捕获超时：沙箱内未在规定时间内响应'));
        }, 4000);

        const handleResponse = async (event: MessageEvent) => {
          if (
            !event.data ||
            event.data.type !== 'CURIO_CAPTURE_RESPONSE' ||
            event.data.requestId !== requestId
          ) {
            return;
          }

          clearTimeout(timeoutTimer);
          window.removeEventListener('message', handleResponse);

          if (event.data.error) {
            reject(new Error(event.data.error));
            return;
          }

          try {
            const dataUrl = event.data.dataUrl;
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            resolve(blob);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            reject(new Error(`快照数据流转换失败: ${msg}`));
          }
        };

        window.addEventListener('message', handleResponse);

        iframe.contentWindow.postMessage(
          {
            type: 'CURIO_CAPTURE_REQUEST',
            requestId: requestId,
          },
          '*'
        );
      });
    });
  }, [onCaptureReady]);

  return (
    <div className="relative w-full h-full bg-black/95 overflow-hidden rounded border border-border flex items-center justify-center">
      {isActivated ? (
        <iframe
          ref={iframeRef}
          title="工件独立沙箱视口"
          sandbox="allow-scripts"
          className="w-full h-full border-0"
        />
      ) : (
        <div className="text-muted text-xs font-mono select-none flex flex-col items-center gap-2">
          <span>[ 工件处于静默陈列态 ]</span>
          <span className="text-[11px] opacity-70">点击上方“活体展演”以激活动态沙箱</span>
        </div>
      )}
    </div>
  );
};
~~~~~

#### Acts 3: 修复 UI 组件的无障碍属性、文本转义与类型安全

更新 `Header.tsx`、`ArtifactCard.tsx`、`DarkroomModal.tsx` 与 `App.tsx`。

~~~~~act
write_file
src/layer3_gallery/components/Header.tsx
~~~~~
~~~~~typescript
import { FolderOpen, Moon, Sun } from 'lucide-react';
import type React from 'react';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onPickDirectory: () => void;
  hasDirectory: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onPickDirectory,
  hasDirectory,
  theme,
  onToggleTheme,
}) => {
  return (
    <header className="sticky top-0 z-10 bg-surface border-b border-border px-6 py-4 flex flex-wrap gap-4 justify-between items-center">
      <div className="flex items-center gap-3">
        <div className="font-bold text-lg tracking-tight">
          curio-box{' '}
          <span className="text-muted font-normal text-sm font-mono">{'// 视觉工件画廊'}</span>
        </div>
      </div>

      <div className="flex-1 max-w-xl mx-auto w-full">
        <div className="flex items-center bg-background border border-border px-3 py-2 rounded text-sm">
          <input
            type="text"
            className="w-full bg-transparent border-0 outline-none text-main font-mono text-xs placeholder:text-muted"
            placeholder="大众分类检索：形态:webgl 物理:流体 -风格:粗野"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPickDirectory}
          className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-mono hover:bg-border transition-colors rounded"
        >
          <FolderOpen className="w-3.5 h-3.5 text-muted" />
          <span>{hasDirectory ? '切换本地目录' : '打开工件目录'}</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          className="border border-border p-2 text-xs hover:bg-border transition-colors rounded"
          title="切换深色/浅色模式"
        >
          {theme === 'dark' ? (
            <Sun className="w-3.5 h-3.5 text-yellow-400" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-zinc-600" />
          )}
        </button>
      </div>
    </header>
  );
};
~~~~~

~~~~~act
write_file
src/layer3_gallery/components/ArtifactCard.tsx
~~~~~
~~~~~typescript
import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import type { Artifact } from '@/types';
import type React from 'react';

interface ArtifactCardProps {
  artifact: Artifact;
  onOpenDarkroom: (artifact: Artifact) => void;
}

export const ArtifactCard: React.FC<ArtifactCardProps> = ({ artifact, onOpenDarkroom }) => {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDarkroom(artifact)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDarkroom(artifact);
        }
      }}
      className="bg-surface border border-border rounded overflow-hidden cursor-pointer hover:border-muted hover:-translate-y-0.5 transition-all flex flex-col group focus:outline-none focus:ring-1 focus:ring-muted"
    >
      <div className="w-full aspect-[4/3] bg-background border-b border-border relative overflow-hidden flex items-center justify-center">
        <div className="absolute top-2 right-2 bg-surface/90 backdrop-blur border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted z-10 rounded">
          静默陈列态
        </div>

        {artifact.posterBlobUrl ? (
          <img
            src={artifact.posterBlobUrl}
            alt={artifact.meta.name}
            className="w-full h-full object-cover filter grayscale-[20%] group-hover:grayscale-0 transition-all duration-300"
          />
        ) : (
          <div className="text-muted text-xs font-mono flex flex-col items-center gap-1">
            <span>[ 待封印快照 ]</span>
            <span className="text-[10px] opacity-60">点击进入暗房捕获封面</span>
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1 justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-main mb-1 truncate" title={artifact.meta.name}>
            {artifact.meta.name}
          </div>
          <div className="text-[11px] font-mono text-muted mb-2">{artifact.meta.filename}</div>
        </div>

        <div className="flex flex-wrap gap-1">
          {artifact.meta.tags.map((rawTag) => {
            const parsed = TagQueryEngine.parseTag(rawTag);
            return (
              <span
                key={rawTag}
                className="inline-flex items-center bg-tag border border-border px-1.5 py-0.5 text-[11px] font-mono rounded"
              >
                {parsed.namespace && <span className="text-muted">{parsed.namespace}:</span>}
                <span className="font-medium text-main">{parsed.value}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
~~~~~

~~~~~act
write_file
src/layer3_gallery/components/DarkroomModal.tsx
~~~~~
~~~~~typescript
import { SandboxViewport } from '@/layer1_sandbox/SandboxViewport';
import { DarkroomApplier, DarkroomPatchFSM } from '@/layer2_darkroom/fsm/patch-fsm';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import type { Artifact } from '@/types';
import { Camera, Check, Copy, History, Play, RotateCcw, Square, X } from 'lucide-react';
import React, { useState } from 'react';

interface DarkroomModalProps {
  artifact: Artifact | null;
  onClose: () => void;
  onUpdateArtifact: (updated: Artifact) => void;
}

export const DarkroomModal: React.FC<DarkroomModalProps> = ({
  artifact,
  onClose,
  onUpdateArtifact,
}) => {
  if (!artifact) return null;

  const [isActivated, setIsActivated] = useState<boolean>(false);
  const [patchInput, setPatchInput] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const captureHandleRef = React.useRef<(() => Promise<Blob>) | null>(null);

  const handleCapturePoster = async () => {
    if (!captureHandleRef.current) {
      setStatusMessage('请先挂载激活活体展演态再进行定格');
      return;
    }
    try {
      setStatusMessage('正在定格无损封印快照...');
      const blob = await captureHandleRef.current();
      const newUrl = await galleryStorage.savePoster(artifact.meta.filename, blob);
      const updated: Artifact = {
        ...artifact,
        posterBlobUrl: newUrl,
      };
      onUpdateArtifact(updated);
      setStatusMessage('定格封印成功！快照已持久化。');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`定格失败: ${msg}`);
    }
  };

  const handleCopyPromptContext = () => {
    const prompt = `请针对以下工件代码提供修改差量。请严格遵循 patch_file 指令协议输出，示例如下：

\`\`\`act
patch_file
\`\`\`
\`\`\`old_doc
<需要被替换的精确原代码行>
\`\`\`
\`\`\`new_doc
<替换后的新代码行>
\`\`\`

当前工件【${artifact.meta.name}】源码：
\`\`\`html
${artifact.sourceCode}
\`\`\``;

    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyPatch = async () => {
    if (!patchInput.trim()) {
      setStatusMessage('请粘贴包含 act、old_doc、new_doc 的补丁文本');
      return;
    }

    try {
      const fsm = new DarkroomPatchFSM();
      const commands = fsm.parse(patchInput);

      if (commands.length === 0) {
        throw new Error('未能识别到有效的补丁指令块，请检查围栏语法');
      }

      let nextCode = artifact.sourceCode;
      for (const cmd of commands) {
        nextCode = DarkroomApplier.apply(nextCode, cmd);
      }

      const nextRev = artifact.meta.currentRevision + 1;
      await galleryStorage.saveArtifactSource(artifact.meta.filename, nextCode, nextRev);

      const updatedMeta = {
        ...artifact.meta,
        currentRevision: nextRev,
        updatedAt: new Date().toISOString(),
      };
      await galleryStorage.saveMeta(updatedMeta);

      const updated: Artifact = {
        ...artifact,
        sourceCode: nextCode,
        meta: updatedMeta,
      };

      onUpdateArtifact(updated);
      setPatchInput('');
      setStatusMessage(`差量补丁已应用！已跃迁至版本 REV:${nextRev}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`应用失败: ${msg}`);
    }
  };

  const handleRollback = async () => {
    if (artifact.meta.currentRevision <= 1) {
      setStatusMessage('当前已处于初始底片版本，无法继续回滚');
      return;
    }

    const prevRev = artifact.meta.currentRevision - 1;
    const prevContent = await galleryStorage.loadNegativeRevision(artifact.meta.filename, prevRev);

    if (!prevContent) {
      setStatusMessage(`未找到 REV:${prevRev} 的历史底片快照`);
      return;
    }

    await galleryStorage.saveArtifactSource(artifact.meta.filename, prevContent, prevRev);
    const updatedMeta = {
      ...artifact.meta,
      currentRevision: prevRev,
      updatedAt: new Date().toISOString(),
    };
    await galleryStorage.saveMeta(updatedMeta);

    const updated: Artifact = {
      ...artifact,
      sourceCode: prevContent,
      meta: updatedMeta,
    };

    onUpdateArtifact(updated);
    setStatusMessage(`一阶回滚成功：已安全复原至 REV:${prevRev}`);
  };

  const placeholderText = `粘贴大模型生成的差量代码块：
\`\`\`act
patch_file
\`\`\`
\`\`\`old_doc
ctx.fillStyle = '#05050a';
\`\`\`
\`\`\`new_doc
ctx.fillStyle = '#001a33';
\`\`\``;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-8"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="bg-surface border border-border w-full max-w-7xl h-[92vh] grid grid-cols-1 md:grid-cols-[1fr_420px] rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col bg-background border-r border-border h-full overflow-hidden">
          <div className="p-3 bg-surface border-b border-border flex justify-between items-center text-xs font-mono">
            <span className="text-muted">【Layer 1】沙箱隔离硬视口 (IFrame Sandbox)</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsActivated(!isActivated)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono transition-colors ${
                  isActivated
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90'
                }`}
              >
                {isActivated ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>析构安全湮灭 (Demount)</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>活体展演 (JIT Mount)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCapturePoster}
                disabled={!isActivated}
                className="flex items-center gap-1 border border-border px-2.5 py-1 rounded text-xs font-mono hover:bg-border disabled:opacity-40 disabled:cursor-not-allowed"
                title="捕获当前帧生成静态封印快照 WebP"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>定格封印</span>
              </button>
            </div>
          </div>

          <div className="flex-1 p-4 overflow-hidden">
            <SandboxViewport
              htmlPayload={artifact.sourceCode}
              isActivated={isActivated}
              onCaptureReady={(cb) => {
                captureHandleRef.current = cb;
              }}
            />
          </div>
        </div>

        <div className="flex flex-col bg-surface h-full overflow-hidden">
          <div className="p-3 border-b border-border flex justify-between items-center">
            <span className="font-semibold text-xs tracking-wide">镜像暗房 (Negative Chain)</span>
            <button
              type="button"
              onClick={onClose}
              className="text-muted hover:text-main p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-4 text-xs font-mono">
            <div className="bg-background border border-border p-3 rounded">
              <div className="text-[10px] uppercase text-muted tracking-wider mb-1">工件实体标识</div>
              <div className="font-sans font-bold text-sm text-main">{artifact.meta.name}</div>
              <div className="text-muted text-[11px] mt-1 space-y-0.5">
                <div>文件：{artifact.meta.filename}</div>
                <div>ID：{artifact.meta.id}</div>
                <div className="text-main font-semibold">底片链版本：REV:{artifact.meta.currentRevision}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyPromptContext}
                className="flex-1 flex items-center justify-center gap-1.5 border border-border py-1.5 rounded hover:bg-background transition-colors text-xs"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted" />}
                <span>{copied ? '已复制上下文！' : '复制 AI 提示词上下文'}</span>
              </button>
            </div>

            <div className="flex flex-col flex-1 gap-2 min-h-[220px]">
              <div className="flex justify-between items-center text-[10px] uppercase text-muted tracking-wider">
                <span>AI 差量注入器 (Patch FSM)</span>
                <span className="text-[9px] lowercase">采用 ``` 围栏语法</span>
              </div>

              <textarea
                value={patchInput}
                onChange={(e) => setPatchInput(e.target.value)}
                placeholder={placeholderText}
                className="flex-1 w-full bg-code text-zinc-300 border border-border p-3 font-mono text-[11px] rounded outline-none resize-none leading-relaxed"
              />

              <button
                type="button"
                onClick={handleApplyPatch}
                className="w-full bg-main text-surface font-semibold py-2 rounded text-xs hover:opacity-90 transition-opacity"
              >
                应用差量补丁并推入底片链
              </button>

              <button
                type="button"
                onClick={handleRollback}
                className="w-full border border-red-500/50 text-red-500 py-1.5 rounded text-xs hover:bg-red-500/10 transition-colors flex items-center justify-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>回滚至上一底片 (REV:{Math.max(1, artifact.meta.currentRevision - 1)})</span>
              </button>
            </div>

            {statusMessage && (
              <div className="p-2 bg-background border border-border rounded text-[11px] text-muted flex items-start gap-1.5">
                <History className="w-3.5 h-3.5 text-muted mt-0.5 shrink-0" />
                <span>{statusMessage}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
~~~~~

~~~~~act
write_file
src/App.tsx
~~~~~
~~~~~typescript
import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import { ArtifactCard } from '@/layer3_gallery/components/ArtifactCard';
import { DarkroomModal } from '@/layer3_gallery/components/DarkroomModal';
import { Header } from '@/layer3_gallery/components/Header';
import type { Artifact } from '@/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface WindowWithFSA extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

export function App() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [hasDirectory, setHasDirectory] = useState<boolean>(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  const loadArtifacts = useCallback(async () => {
    const list = await galleryStorage.scanArtifacts();
    setArtifacts(list);
  }, []);

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  const handlePickDirectory = async () => {
    try {
      const fsaWindow = window as unknown as WindowWithFSA;
      if (typeof fsaWindow.showDirectoryPicker === 'function') {
        const handle = await fsaWindow.showDirectoryPicker();
        galleryStorage.setDirectoryHandle(handle);
        setHasDirectory(true);
        await loadArtifacts();
      } else {
        alert('当前浏览器环境不支持 File System Access API，请使用 Chrome/Edge 等现代浏览器。');
      }
    } catch (err: unknown) {
      const e = err as Error;
      if (e.name !== 'AbortError') {
        console.error('选择目录失败:', err);
      }
    }
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleUpdateArtifact = (updated: Artifact) => {
    setArtifacts((prev) =>
      prev.map((item) => (item.meta.filename === updated.meta.filename ? updated : item))
    );
    setSelectedArtifact(updated);
  };

  const filteredArtifacts = useMemo(() => {
    return artifacts.filter((item) => TagQueryEngine.match(item.meta.tags, searchQuery));
  }, [artifacts, searchQuery]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-main">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onPickDirectory={handlePickDirectory}
        hasDirectory={hasDirectory}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <main className="flex-1 p-6 md:p-8">
        <div className="mb-6 flex justify-between items-center text-xs font-mono text-muted">
          <div>
            陈列展品总数：<span className="text-main font-semibold">{filteredArtifacts.length}</span> / {artifacts.length}
          </div>
          {!hasDirectory && <div>（当前处于内置演示库模式，可点击右上角载入本地工件目录）</div>}
        </div>

        {filteredArtifacts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredArtifacts.map((artifact) => (
              <ArtifactCard
                key={artifact.meta.filename}
                artifact={artifact}
                onOpenDarkroom={setSelectedArtifact}
              />
            ))}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-muted font-mono text-sm gap-2 border border-dashed border-border rounded">
            <span>未匹配到符合检索条件的工件</span>
            <span className="text-xs opacity-60">尝试修改大众分类筛选词或清除过滤条件</span>
          </div>
        )}
      </main>

      <DarkroomModal
        artifact={selectedArtifact}
        onClose={() => setSelectedArtifact(null)}
        onUpdateArtifact={handleUpdateArtifact}
      />
    </div>
  );
}

export default App;
~~~~~

### 下一步建议
- **执行验证**: 运行 `pnpm check`，验证当前工程是否以 0 警告、0 错误完全通过 Biome 和 TypeScript 检查。
- **本地启动体验**: 运行 `pnpm dev` 启动 Vite 开发服务，测试工件展陈、分类搜索、JIT 激活以及 WebP 定格捕获流程。
