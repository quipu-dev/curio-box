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