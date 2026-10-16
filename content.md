这是两处 TypeScript 严格模式下的类型检查报错。第一处是由于 Promise 回调闭包导致对 `iframe.contentWindow` 的类型收窄失效；第二处是由于环境 DOM 类型库已内置 `FileSystemFileHandle` 与 `FileSystemWritableFileStream`，代码中手写的冗余继承接口产生了类型不兼容冲突。我将生成 Quipu 计划修复这两个类型错误。

## [WIP] fix: 修复 iframe 闭包类型收窄与 FileSystemFileHandle 接口继承冲突

### 错误分析

1. **`SandboxViewport.tsx:133:9` (TS18047)**:
   在 `onCaptureReady` 中虽然在外部进行了 `if (!iframe || !iframe.contentWindow)` 的空值检查，但在后续创建的 `new Promise((resolve, reject) => { ... })` 异步闭包内部，TypeScript 编译器无法保证对象的属性引用 `iframe.contentWindow` 在闭包执行时仍不为 `null`，因此报 `'iframe.contentWindow' is possibly 'null'`。
2. **`fs-storage.ts:13:11` (TS2430)**:
   TypeScript 的 `DOM` 类型库已完整包含了 File System Access API 规范中的 `FileSystemFileHandle` 与 `FileSystemWritableFileStream`。原代码中自定义的 `CustomFileHandle extends FileSystemFileHandle` 试图将 `createWritable()` 的返回值重写为简化的 `WritableFileStream`，缺少了规范中必需的 `seek`、`truncate`、`locked` 等属性，导致接口类型继承冲突报错。

### 用户需求

修复 `src/layer1_sandbox/SandboxViewport.tsx` 与 `src/layer2_darkroom/storage/fs-storage.ts` 中的 TypeScript 编译错误，使 `pnpm run checkf` 能够无错误通过。

### 评论

这是典型的 TypeScript 静态分析边界问题：
- 在闭包内，将收窄后的对象属性赋值给局部常量（如 `const contentWindow = iframe.contentWindow;`）是标准的 TypeScript 防守范式，能确保类型收窄在闭包作用域内保持有效。
- 对于现代浏览器已标准化的 Web API，优先依赖原生类型定义，避免二次定义不完整的兼容接口引发类型冲突。

### 目标

1. 在 `SandboxViewport.tsx` 中提取局部的不可变变量 `contentWindow`，消除异步回调中的 TS18047 错误。
2. 在 `fs-storage.ts` 中移除冗余且不兼容的 `CustomFileHandle` 与 `WritableFileStream` 接口定义，直接使用原生 `FileSystemFileHandle`。

### 基本原理

1. **闭包常量收窄保持**：`const contentWindow = iframe.contentWindow;` 作为一个 `const` 引用，其类型在非空校验后被确定为 `Window`，闭包内对其进行访问不会被重新推断为包含 `null`。
2. **复用原生 DOM 类型**：浏览器原生的 `FileSystemFileHandle.createWritable()` 返回的 `FileSystemWritableFileStream` 原生支持 `.write()` 与 `.close()`，直接利用原生类型省去了类型转换和冲突风险。

### 标签

#intent/fix #flow/ready #priority/high #comp/runtime #comp/build #concept/state #scope/dx #ai/instruct #task/domain/testing #task/object/type-safety #task/action/bug-fix #task/state/continue #task/status/active

---

### Script

#### Acts 1: 修复 `SandboxViewport.tsx` 中的闭包类型收窄

提取 `contentWindow` 局部不可变常量，确保异步回调内部的类型安全性。

~~~~~act
patch_file
src/layer1_sandbox/SandboxViewport.tsx
~~~~~
~~~~~tsx.old
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
          '*',
        );
      });
    });
~~~~~
~~~~~tsx.new
    onCaptureReady(async () => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) {
        throw new Error('沙箱未激活，无法定格封印快照');
      }

      const contentWindow = iframe.contentWindow;
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

        contentWindow.postMessage(
          {
            type: 'CURIO_CAPTURE_REQUEST',
            requestId: requestId,
          },
          '*',
        );
      });
    });
~~~~~

#### Acts 2: 清除 `fs-storage.ts` 中的冗余类型声明并采用原生类型

移除冲突的 `CustomFileHandle` 和 `WritableFileStream` 声明，直接使用内置 DOM 提供的句柄能力。

~~~~~act
patch_file
src/layer2_darkroom/storage/fs-storage.ts
~~~~~
~~~~~ts.old
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
~~~~~
~~~~~ts.new
const GALLERY_DIR = '.gallery';
const POSTERS_DIR = 'posters';
const NEGATIVES_DIR = 'negatives';
const META_FILE = 'meta.json';

export class GalleryStorage {
~~~~~

~~~~~act
patch_file
src/layer2_darkroom/storage/fs-storage.ts
~~~~~
~~~~~ts.old
  public async saveArtifactSource(
    filename: string,
    newContent: string,
    revision: number,
  ): Promise<void> {
    if (!this.dirHandle) return;

    const fileHandle = (await this.dirHandle.getFileHandle(filename, {
      create: true,
    })) as CustomFileHandle;
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
    const posterHandle = (await postersDir.getFileHandle(posterFilename, {
      create: true,
    })) as CustomFileHandle;

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
    const metaHandle = (await galleryDir.getFileHandle(META_FILE, {
      create: true,
    })) as CustomFileHandle;
    const writable = await metaHandle.createWritable();
    await writable.write(JSON.stringify(allMeta, null, 2));
    await writable.close();
  }

  public async recordNegativeRevision(
    filename: string,
    revision: number,
    content: string,
  ): Promise<void> {
    if (!this.dirHandle) return;
    const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
    const negativesDir = await galleryDir.getDirectoryHandle(NEGATIVES_DIR, { create: true });
    const baseDir = await negativesDir.getDirectoryHandle(filename.replace(/\.html$/, ''), {
      create: true,
    });

    const revHandle = (await baseDir.getFileHandle(
      `rev-${String(revision).padStart(4, '0')}.snapshot`,
      { create: true },
    )) as CustomFileHandle;
    const writable = await revHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }
~~~~~
~~~~~ts.new
  public async saveArtifactSource(
    filename: string,
    newContent: string,
    revision: number,
  ): Promise<void> {
    if (!this.dirHandle) return;

    const fileHandle = await this.dirHandle.getFileHandle(filename, {
      create: true,
    });
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
    const posterHandle = await postersDir.getFileHandle(posterFilename, {
      create: true,
    });

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
    const metaHandle = await galleryDir.getFileHandle(META_FILE, {
      create: true,
    });
    const writable = await metaHandle.createWritable();
    await writable.write(JSON.stringify(allMeta, null, 2));
    await writable.close();
  }

  public async recordNegativeRevision(
    filename: string,
    revision: number,
    content: string,
  ): Promise<void> {
    if (!this.dirHandle) return;
    const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
    const negativesDir = await galleryDir.getDirectoryHandle(NEGATIVES_DIR, { create: true });
    const baseDir = await negativesDir.getDirectoryHandle(filename.replace(/\.html$/, ''), {
      create: true,
    });

    const revHandle = await baseDir.getFileHandle(
      `rev-${String(revision).padStart(4, '0')}.snapshot`,
      { create: true },
    );
    const writable = await revHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }
~~~~~

### 下一步建议

1. **执行编译验证**：在终端重新执行 `pnpm run checkf`，确认 Biome 与 TypeScript (`tsc --noEmit`) 能够零警告零错误通过。
2. **构建验证**：运行 `pnpm run build`，确保 Vite 打包阶段无隐式类型导出与构建问题。
