好的，我已根据要求调整 `src/layer3_gallery/components/DarkroomModal.tsx`，将其内部的提示文案、AI 上下文构造模板以及输入框占位符全部统一为纯反引号（`` ` ``）格式，彻底移除波浪号（`~`）。

## [WIP] fix: 将暗房模态窗中的围栏占位符与提示统一调整为纯反引号格式

### 错误分析
在上一版 `DarkroomModal.tsx` 中，UI 提示和输入框占位符示例采用了 `~~~~~` 波浪号围栏。根据用户的明确要求，界面层与提示词生成层应规范统一为 Markdown 标准的反引号（`` ` ``）格式，以确保与外部主流大模型的输出习惯保持严格一致。

### 用户需求
重新生成 `src/layer3_gallery/components/DarkroomModal.tsx` 文件，并在文件内部仅允许使用三反引号（`` ` ``）围栏作为指令与代码区块语法，不得出现波浪号（`~`）。

### 评论
纯反引号（`` ` ``）是 Markdown 和大多数代码大模型的默认语法标准。在前端界面文案与提示模板中统一使用反引号，有助于降低用户理解和向 LLM 提问时的认知负荷；底层的 `DarkroomPatchFSM` 状态机依然保持对可变长度与多态围栏的解析兼容性，形成“展示标准统一、底层宽容容错”的最佳实践。

### 目标
1. 覆写 `src/layer3_gallery/components/DarkroomModal.tsx`。
2. 将提示文案、占位符示例及复制上下文中的代码块全量转换为 ```` ``` ```` 格式。
3. 确保所有交互逻辑（沙箱激活、定格封印、补丁解析应用及历史回滚）完整保留。

### 基本原理
使用 `write_file` 策略全量替换目标文件。外层采用 Quipu 规定的 5 字符波浪号长围栏（`~~~~~`），避免与组件内部包含的反引号字符串产生解析冲突，确保文件内容的字节级准确无误。

### 标签
#intent/fix #flow/ready #priority/medium #comp/ui #concept/ui #concept/parser #scope/ux #ai/instruct #task/domain/ui #task/object/darkroom-modal #task/action/refactor #task/state/continue

---

### Script

#### Acts 1: 重新生成 DarkroomModal 组件代码

全量更新组件，将所有围栏说明与模板调整为标准三反引号语法。

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

### 下一步建议
- **执行格式与语法校验**: 运行 `pnpm check` 验证更新后的代码是否完全符合 Biome 与 TypeScript 类型校验。
- **验证暗房复制逻辑**: 在界面中点击“复制 AI 提示词上下文”，确认剪贴板内容中的示例指令严格采用反引号格式。
