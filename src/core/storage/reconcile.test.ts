import { ArtifactRepository } from '@/core/storage/artifact-repository';
import { MemoryDirectoryHandle } from '@/test/mock-fs';
import { beforeEach, describe, expect, it } from 'vitest';

describe('ArtifactRepository 自愈与工作区对齐机制 (Reconcile)', () => {
  let root: MemoryDirectoryHandle;
  let repo: ArtifactRepository;

  beforeEach(() => {
    root = new MemoryDirectoryHandle('root');
    repo = new ArtifactRepository();
    repo.setDirectoryHandle(root as unknown as FileSystemDirectoryHandle);
  });

  it('自愈初始化孤立工件：外部直接写入 HTML，对齐时自动补齐沙箱、符印与初始快照', async () => {
    // 模拟用户在操作系统外部直接往工作区丢入一个未经登记的 HTML
    const rawExternalHtml = `<!DOCTYPE html>
<html>
<head><title>孤立的着色器</title></head>
<body><canvas id="c"></canvas></body>
</html>`;
    await root.addFile('external-shader.html', rawExternalHtml);

    // 执行对齐工作区
    const artifacts = await repo.reconcileWorkspace();

    expect(artifacts.length).toBe(1);
    const art = artifacts[0];
    expect(art.meta.filename).toBe('external-shader.html');
    // 无符印工件自愈时，名称确定性回退为去除后缀的文件名
    expect(art.meta.name).toBe('external-shader');
    expect(art.meta.tags).toEqual(['形态:原生html', '状态:未分类']);
    expect(art.meta.currentRevision).toBe(1);

    // 验证沙箱与底片已自动补齐
    const artifactId = art.meta.id;
    const snapPath = `.gallery/artifacts/${artifactId}/snapshots/rev-0001.snapshot`;
    expect(await root.hasFile(snapPath)).toBe(true);
    expect(await root.readFile(snapPath)).toBe(rawExternalHtml);
  });

  it('自愈并继承既有符印：外部丢入的 HTML 若自带符印，继承其名称、标签与评分', async () => {
    const stampedHtml = `<!--@curio
{
  "name": "带符印的外部工件",
  "tags": ["形态:webgl", "领域:流体"],
  "rating": 5
}
-->
<!DOCTYPE html>
<html><body><div>Ready</div></body></html>`;

    await root.addFile('stamped.html', stampedHtml);

    const artifacts = await repo.reconcileWorkspace();
    expect(artifacts.length).toBe(1);

    const art = artifacts[0];
    expect(art.meta.name).toBe('带符印的外部工件');
    expect(art.meta.tags).toEqual(['形态:webgl', '领域:流体']);
    expect(art.meta.rating).toBe(5);
  });

  it('有效过滤已从磁盘物理删除的失效工件', async () => {
    // 先正常创建一个工件
    await repo.createArtifact('ghost.html', '<div>ghost</div>', '幽灵工件');

    // 模拟用户在外部直接把 ghost.html 文件删除了
    await root.removeEntry('ghost.html');

    // 再次对齐时，由于根目录下找不到该 html，不再将其投射为可用工件
    const artifacts = await repo.reconcileWorkspace();
    expect(artifacts.find((a) => a.meta.filename === 'ghost.html')).toBeUndefined();
  });
});