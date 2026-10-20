/**
 * 内存虚拟文件句柄：模拟 FileSystemFileHandle 行为
 */
export class MemoryFileHandle implements FileSystemFileHandle {
  readonly kind = 'file' as const;
  public content: string;
  public lastModified: number;

  constructor(
    public readonly name: string,
    initialContent = '',
  ) {
    this.content = initialContent;
    this.lastModified = Date.now();
  }

  async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return this === other;
  }

  async queryPermission(): Promise<PermissionState> {
    return 'granted';
  }

  async requestPermission(): Promise<PermissionState> {
    return 'granted';
  }

  async getFile(): Promise<File> {
    const content = this.content;
    const blob = new Blob([content], { type: 'text/html' });
    const file = new File([blob], this.name, {
      lastModified: this.lastModified,
      type: 'text/html',
    });

    if (typeof file.text !== 'function') {
      (file as unknown as { text: () => Promise<string> }).text = async () => content;
    }
    return file;
  }

  async createWritable(): Promise<FileSystemWritableFileStream> {
    const chunks: (string | Uint8Array | Blob)[] = [];
    return {
      write: async (data: string | Uint8Array | Blob) => {
        chunks.push(data);
      },
      close: async () => {
        let finalContent = '';
        for (const chunk of chunks) {
          if (typeof chunk === 'string') {
            finalContent += chunk;
          } else if (chunk instanceof Uint8Array) {
            finalContent += new TextDecoder().decode(chunk);
          } else if (chunk instanceof Blob) {
            finalContent += await chunk.text();
          }
        }
        this.content = finalContent;
        this.lastModified = Date.now();
      },
      abort: async () => {},
      seek: async () => {},
      truncate: async () => {},
    } as unknown as FileSystemWritableFileStream;
  }
}

/**
 * 内存虚拟目录句柄：模拟 FileSystemDirectoryHandle 行为
 */
export class MemoryDirectoryHandle implements FileSystemDirectoryHandle {
  readonly kind = 'directory' as const;
  private entriesMap = new Map<string, MemoryFileHandle | MemoryDirectoryHandle>();

  constructor(public readonly name: string) {}

  async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return this === other;
  }

  async queryPermission(): Promise<PermissionState> {
    return 'granted';
  }

  async requestPermission(): Promise<PermissionState> {
    return 'granted';
  }

  async resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null> {
    if (this === possibleDescendant) return [];
    for (const [name, entry] of this.entriesMap.entries()) {
      if (entry === possibleDescendant) {
        return [name];
      }
      if (entry.kind === 'directory') {
        const sub = await (entry as MemoryDirectoryHandle).resolve(possibleDescendant);
        if (sub) {
          return [name, ...sub];
        }
      }
    }
    return null;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle> {
    let entry = this.entriesMap.get(name);
    if (!entry) {
      if (options?.create) {
        entry = new MemoryFileHandle(name);
        this.entriesMap.set(name, entry);
      } else {
        const err = new Error(`File not found: ${name}`);
        err.name = 'NotFoundError';
        throw err;
      }
    }
    if (entry.kind !== 'file') {
      throw new Error(`Target '${name}' is not a file`);
    }
    return entry as unknown as FileSystemFileHandle;
  }

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemDirectoryHandle> {
    let entry = this.entriesMap.get(name);
    if (!entry) {
      if (options?.create) {
        entry = new MemoryDirectoryHandle(name);
        this.entriesMap.set(name, entry);
      } else {
        const err = new Error(`Directory not found: ${name}`);
        err.name = 'NotFoundError';
        throw err;
      }
    }
    if (entry.kind !== 'directory') {
      throw new Error(`Target '${name}' is not a directory`);
    }
    return entry as unknown as FileSystemDirectoryHandle;
  }

  async removeEntry(name: string, _options?: { recursive?: boolean }): Promise<void> {
    if (!this.entriesMap.has(name)) {
      const err = new Error(`Entry not found: ${name}`);
      err.name = 'NotFoundError';
      throw err;
    }
    this.entriesMap.delete(name);
  }

  values(): AsyncIterable<FileSystemHandle> {
    const items = Array.from(this.entriesMap.values());
    return {
      [Symbol.asyncIterator]() {
        let index = 0;
        return {
          async next() {
            if (index < items.length) {
              return { value: items[index++] as unknown as FileSystemHandle, done: false };
            }
            return { done: true, value: undefined };
          },
        };
      },
    };
  }

  keys(): AsyncIterable<string> {
    const keysList = Array.from(this.entriesMap.keys());
    return {
      [Symbol.asyncIterator]() {
        let index = 0;
        return {
          async next() {
            if (index < keysList.length) {
              return { value: keysList[index++], done: false };
            }
            return { done: true, value: undefined };
          },
        };
      },
    };
  }

  entries(): AsyncIterable<[string, FileSystemHandle]> {
    const entriesList = Array.from(this.entriesMap.entries());
    return {
      [Symbol.asyncIterator]() {
        let index = 0;
        return {
          async next() {
            if (index < entriesList.length) {
              return {
                value: entriesList[index++] as [string, FileSystemHandle],
                done: false,
              };
            }
            return { done: true, value: undefined };
          },
        };
      },
    };
  }

  // --- 测试辅助方法 (Test Helpers) ---

  async addFile(relativePath: string, content = ''): Promise<MemoryFileHandle> {
    const parts = relativePath.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) throw new Error('Invalid path');

    let currentDir: MemoryDirectoryHandle = this;
    for (const seg of parts) {
      currentDir = (await currentDir.getDirectoryHandle(seg, {
        create: true,
      })) as unknown as MemoryDirectoryHandle;
    }

    const fileHandle = (await currentDir.getFileHandle(fileName, {
      create: true,
    })) as unknown as MemoryFileHandle;
    fileHandle.content = content;
    return fileHandle;
  }

  async readFile(relativePath: string): Promise<string> {
    const parts = relativePath.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) throw new Error('Invalid path');

    let currentDir: MemoryDirectoryHandle = this;
    for (const seg of parts) {
      currentDir = (await currentDir.getDirectoryHandle(seg)) as unknown as MemoryDirectoryHandle;
    }

    const fileHandle = (await currentDir.getFileHandle(fileName)) as unknown as MemoryFileHandle;
    return fileHandle.content;
  }

  async hasFile(relativePath: string): Promise<boolean> {
    try {
      await this.readFile(relativePath);
      return true;
    } catch {
      return false;
    }
  }
}
