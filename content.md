好的，根据《视觉工件画廊与暗房架构白皮书》以及第一、第二纪元的交付要求，我将为你搭建完整的 `curio-box` 系统基座。

本次实施将涵盖：
1. **工程基建与规范**：配置 `package.json`（集成 `check`/`checkf` 脚本）、`biome.json`、`vite.config.ts`、`tailwind.config.js` 与 TypeScript 环境。
2. **Layer 2 核心引擎**：实现支持动态长度（如 `~~~`, `~~~~~`, ```` ``` ````）与符号多态的**补丁状态机 (DarkroomPatchFSM)**，以及 **Danbooru 命名空间符印解析引擎 (TagQueryEngine)**。
3. **本地沙箱与存储底座**：基于 File System Access API 实现零侵入扫描与 `.gallery` 侧车存储（封印快照、历史底片版本链与一阶回滚防护）。
4. **Layer 1 安全视口**：实现具备 JIT 即时挂载、离线上下文安全销毁与定格捕获 WebP 快照能力的 `SandboxViewport`。
5. **Layer 3 策展展厅与暗房**：全中文高表现力界面，实现冷热态流转、大众分类检索、底片差量注入与即时生效。

## [WIP] feat: 落地纪元一与纪元二策展画廊与镜像暗房架构

### 用户需求
基于白皮书第一性原理与架构规范，全面落地纪元 I（孤岛封印与陈列）与纪元 II（大众分类与镜像暗房）。采用 Vite + React + File System Access API + Tailwind CSS 技术栈，使用 pnpm 管理依赖，提供 biome `check` 与 `checkf` 脚本，实现可变围栏补丁状态机与全中文高表现力策展界面。

### 评论
这是一次从传统大一统代码框架向“策展与暗房”本体论的关键跃迁。通过将工件视为不可侵入的黑盒，并建立零运行依赖的侧车存储与动态围栏差量微调回路，系统在不膨胀自身复杂度的同时，释放了外部大模型原生生成代码的全部上限。

### 目标
1. 初始化项目结构与构建链路，配置 Biome 校验与 TypeScript 路径别名。
2. 编写具备多态可变围栏（`~` 与 `` ` ``，$\ge 3$）容错特性的 `DarkroomPatchFSM` 及补丁应用器。
3. 构建 `TagQueryEngine`，支持 Danbooru 式前缀命名空间及布尔逻辑过滤（交集与排除）。
4. 实现基于 File System Access API 的工件扫描、侧车元数据读写与底片快照回滚机制。
5. 构建中文版展厅与暗房模态窗，实现 JIT 活体展演挂载与定格 WebP 封印快照捕获。

### 基本原理
画廊系统遵循工件主权原则：工件代码保持完全纯粹，不引入任何画廊专有 SDK。元数据与底片链完全保存在工作目录下的 `.gallery/` 侧车影子结构中。状态机采用逐行流式状态转移，使长围栏内的嵌套代码块不会导致匹配提前截断。宿主与工件的物理边界采用 `sandbox="allow-scripts"` 的 IFrame 硬隔离，在聚焦与失焦时执行确定性的 JIT 挂载与 GC 析构。

### 标签
#intent/build #flow/ready #priority/high #comp/cli #comp/runtime #concept/executor #concept/ui #concept/parser #scope/core #scope/ux #ai/instruct #task/domain/ui #task/object/gallery-darkroom #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 初始化工程配置文件与依赖声明

创建 `package.json`、`biome.json`、TypeScript 配置文件、Vite 配置及 Tailwind 基础。

~~~~~act
write_file
package.json
~~~~~
~~~~~json
{
  "name": "curio-box",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "check": "biome check . && tsc --noEmit",
    "checkf": "biome check --fix --unsafe . && tsc --noEmit",
    "preview": "vite preview"
  },
  "dependencies": {
    "clsx": "^2.1.1",
    "lucide-react": "^0.344.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "tailwind-merge": "^2.2.1"
  },
  "devDependencies": {
    "@biomejs/biome": "1.9.4",
    "@types/react": "^18.2.56",
    "@types/react-dom": "^18.2.19",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.18",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.2.2",
    "vite": "^5.1.4"
  }
}
~~~~~

~~~~~act
write_file
biome.json
~~~~~
~~~~~json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": {
    "ignore": ["dist/**", "node_modules/**", ".gallery/**"]
  },
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineEnding": "lf",
    "lineWidth": 100,
    "attributePosition": "auto"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always"
    }
  }
}
~~~~~

~~~~~act
write_file
tsconfig.json
~~~~~
~~~~~json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
~~~~~

~~~~~act
write_file
tsconfig.node.json
~~~~~
~~~~~json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
~~~~~

~~~~~act
write_file
vite.config.ts
~~~~~
~~~~~typescript
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [react()],
});
~~~~~

~~~~~act
write_file
tailwind.config.js
~~~~~
~~~~~javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-color)',
        surface: 'var(--surface-color)',
        main: 'var(--text-main)',
        muted: 'var(--text-muted)',
        border: 'var(--border-color)',
        tag: 'var(--tag-bg)',
        code: 'var(--code-bg)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
};
~~~~~

~~~~~act
write_file
postcss.config.js
~~~~~
~~~~~javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
~~~~~

~~~~~act
write_file
index.html
~~~~~
~~~~~html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>curio-box | 视觉工件画廊与镜像暗房</title>
  </head>
  <body data-theme="dark">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
~~~~~

#### Acts 2: 编写全局样式与系统核心类型定义

创建样式变量以及工件、符印、补丁与底片链的数据结构。

~~~~~act
write_file
src/index.css
~~~~~
~~~~~css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-color: #f4f4f5;
  --surface-color: #ffffff;
  --text-main: #18181b;
  --text-muted: #71717a;
  --border-color: #e4e4e7;
  --accent-color: #000000;
  --accent-text: #ffffff;
  --tag-bg: #f4f4f5;
  --code-bg: #18181b;
  --code-text: #a1a1aa;
}

[data-theme="dark"] {
  --bg-color: #09090b;
  --surface-color: #18181b;
  --text-main: #fafafa;
  --text-muted: #a1a1aa;
  --border-color: #27272a;
  --accent-color: #ffffff;
  --accent-text: #000000;
  --tag-bg: #27272a;
  --code-bg: #000000;
  --code-text: #d4d4d8;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background-color: var(--bg-color);
  color: var(--text-main);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  line-height: 1.5;
  transition: background-color 0.2s, color 0.2s;
}
~~~~~

~~~~~act
write_file
src/types/index.ts
~~~~~
~~~~~typescript
export type PatchAction = 'patch_file' | 'write_file';

export interface PatchCommand {
  action: PatchAction;
  oldDoc: string;
  newDoc: string;
}

export interface Tag {
  raw: string;
  namespace?: string;
  value: string;
}

export interface NegativeRevision {
  revision: number;
  timestamp: string;
  type: 'snapshot' | 'patch';
  content: string;
}

export interface ArtifactMeta {
  id: string;
  name: string;
  filename: string;
  tags: string[];
  currentRevision: number;
  updatedAt: string;
}

export interface Artifact {
  meta: ArtifactMeta;
  sourceCode: string;
  posterBlobUrl?: string;
}
~~~~~

#### Acts 3: 实现 Layer 2 可变围栏补丁状态机与符印引擎

实现支持多态可变围栏（`~` 与 `` ` ``，$\ge 3$）的 `DarkroomPatchFSM`、安全补丁应用器以及 `TagQueryEngine`。

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

export class DarkroomApplier {
  public static apply(sourceCode: string, command: PatchCommand): string {
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
  }
}
~~~~~

~~~~~act
write_file
src/layer2_darkroom/engine/tag-engine.ts
~~~~~
~~~~~typescript
import type { Tag } from '@/types';

export class TagQueryEngine {
  public static parseTag(rawTag: string): Tag {
    const parts = rawTag.trim().toLowerCase().split(':');
    if (parts.length > 1) {
      return { raw: rawTag, namespace: parts[0], value: parts.slice(1).join(':') };
    }
    return { raw: rawTag, value: parts[0] };
  }

  public static match(artifactTags: string[], queryString: string): boolean {
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
  }
}
~~~~~

#### Acts 4: 实现 Layer 2 侧车存储与 File System Access API 适配器

管理工件读写、`.gallery/` 侧车元数据、WebP 快照及底片历史链。同时提供内置示例工件，以便在未选择本地文件夹时进行即时展演。

~~~~~act
write_file
src/layer2_darkroom/storage/fs-storage.ts
~~~~~
~~~~~typescript
import type { Artifact, ArtifactMeta, NegativeRevision } from '@/types';

const GALLERY_DIR = '.gallery';
const POSTERS_DIR = 'posters';
const NEGATIVES_DIR = 'negatives';
const META_FILE = 'meta.json';

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

    for await (const entry of (this.dirHandle as any).values()) {
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

    const fileHandle = await this.dirHandle.getFileHandle(filename, { create: true });
    const writable = await (fileHandle as any).createWritable();
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
    const posterHandle = await postersDir.getFileHandle(posterFilename, { create: true });

    const writable = await (posterHandle as any).createWritable();
    await writable.write(blob);
    await writable.close();

    return URL.createObjectURL(blob);
  }

  public async saveMeta(meta: ArtifactMeta): Promise<void> {
    if (!this.dirHandle) return;
    const allMeta = await this.readAllMeta();
    allMeta[meta.filename] = meta;

    const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
    const metaHandle = await galleryDir.getFileHandle(META_FILE, { create: true });
    const writable = await (metaHandle as any).createWritable();
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

    const revHandle = await baseDir.getFileHandle(`rev-${String(revision).padStart(4, '0')}.snapshot`, {
      create: true,
    });
    const writable = await (revHandle as any).createWritable();
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

#### Acts 5: 构建 Layer 1 沙箱视口与 WebP 定格抓拍组件

实现活体展演（JIT挂载）、离线安全析构与当前帧无损抓拍。

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

    const blob = new Blob([htmlPayload], { type: 'text/html;charset=utf-8' });
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

      const doc = iframe.contentDocument || iframe.contentWindow.document;
      const canvas = doc.querySelector('canvas');

      if (canvas) {
        return new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Canvas 捕获失败'))),
            'image/webp',
            0.92
          );
        });
      }

      throw new Error('工件视口内未发现 Canvas 渲染上下文');
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

#### Acts 6: 实现 Layer 3 交互面组件 (导航栏、卡片、暗房模态窗)

全中文交互呈现，包含 Danbooru 符印检索栏、冷热陈列卡片、AI 差量注入器及一阶底片回滚面板。

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
          curio-box <span className="text-muted font-normal text-sm font-mono">// 视觉工件画廊</span>
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
      onClick={() => onOpenDarkroom(artifact)}
      className="bg-surface border border-border rounded overflow-hidden cursor-pointer hover:border-muted hover:-translate-y-0.5 transition-all flex flex-col group"
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
    } catch (err: any) {
      setStatusMessage(`定格失败: ${err.message}`);
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
    } catch (err: any) {
      setStatusMessage(`应用失败: ${err.message}`);
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

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-8"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border w-full max-w-7xl h-[92vh] grid grid-cols-1 md:grid-cols-[1fr_420px] rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Layer 1: 视口展演区 */}
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

        {/* Layer 2: 镜像暗房与差量更新区 */}
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
                <span className="text-[9px] lowercase">支持 ``` 与 ~~~ 动态围栏</span>
              </div>

              <textarea
                value={patchInput}
                onChange={(e) => setPatchInput(e.target.value)}
                placeholder={`粘贴大模型生成的差量代码块：
`````act
patch_file
`````
`````old_doc
ctx.fillStyle = '#05050a';
`````
`````new_doc
ctx.fillStyle = '#001a33';
``````}
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

#### Acts 7: 组装画廊主页与应用入口

串联头部导航、分类过滤、瀑布流陈列与暗房管理流程。

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
import { useEffect, useMemo, useState } from 'react';

export function App() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [hasDirectory, setHasDirectory] = useState<boolean>(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  const loadArtifacts = async () => {
    const list = await galleryStorage.scanArtifacts();
    setArtifacts(list);
  };

  useEffect(() => {
    loadArtifacts();
  }, []);

  const handlePickDirectory = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        const handle = await (window as any).showDirectoryPicker();
        galleryStorage.setDirectoryHandle(handle);
        setHasDirectory(true);
        await loadArtifacts();
      } else {
        alert('当前浏览器环境不支持 File System Access API，请使用 Chrome/Edge 等现代浏览器。');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
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

~~~~~act
write_file
src/main.tsx
~~~~~
~~~~~typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
~~~~~

### 下一步建议
- **依赖安装与验证**: 使用 `pnpm install` 安装依赖，并运行 `pnpm check` 验证代码类型与 Biome 规范符合度。
- **本地启动与测试**: 执行 `pnpm dev` 打开浏览器，测试默认演示库的 JIT 挂载、定格封印快照，以及通过 `DarkroomPatchFSM` 进行代码替换与一阶回滚。
- **批量本地工件接入**: 通过右上角“打开工件目录”挂载本地包含原生 `.html` 交互切片的文件夹，体验零侵入扫描与侧车 `.gallery/` 的自动生成。
