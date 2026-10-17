import { Check, Copy, Eye, GitBranch } from 'lucide-react';
import type React from 'react';

interface DarkroomPatchTabProps {
  isViewingSnapshot: boolean;
  viewingRevision?: number;
  patchInput: string;
  copied: boolean;
  onPatchInputChange: (val: string) => void;
  onCopyPromptContext: () => void;
  onApplyPatch: () => void;
  onRestoreRevision?: (rev: number) => void;
  onExitCheckout?: () => void;
}

export const DarkroomPatchTab: React.FC<DarkroomPatchTabProps> = ({
  isViewingSnapshot,
  viewingRevision,
  patchInput,
  copied,
  onPatchInputChange,
  onCopyPromptContext,
  onApplyPatch,
  onRestoreRevision,
  onExitCheckout,
}) => {
  if (isViewingSnapshot && viewingRevision !== undefined) {
    return (
      <div className="flex-1 flex flex-col gap-3">
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded flex flex-col gap-2.5 text-amber-300">
          <div className="flex items-center gap-2 font-semibold text-xs">
            <Eye className="w-4 h-4 text-amber-400 shrink-0" />
            <span>当前正在检视历史版本 REV:{viewingRevision}</span>
          </div>
          <p className="text-[11px] text-zinc-300 leading-relaxed">
            为防止代码冲突，检视历史版本时补丁功能已锁定。您可以基于此版本继续修改，或返回最新版本。
          </p>
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={() => onRestoreRevision?.(viewingRevision)}
              className="flex-1 bg-amber-500/20 border border-amber-500/40 text-amber-200 py-2 rounded text-xs hover:bg-amber-500/30 transition-colors flex items-center justify-center gap-1.5"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>基于此版本继续修改</span>
            </button>
            <button
              type="button"
              onClick={onExitCheckout}
              className="px-3 border border-border text-muted hover:text-main py-2 rounded text-xs transition-colors"
            >
              返回最新
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase text-muted tracking-wider">
          提示词协同与指令控制台
        </span>
        <button
          type="button"
          onClick={onCopyPromptContext}
          className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? '已复制源码上下文！' : '复制大模型提示词上下文'}</span>
        </button>
      </div>

      <textarea
        value={patchInput}
        onChange={(e) => onPatchInputChange(e.target.value)}
        placeholder={`粘贴大模型生成的指令块（支持 patch_file / write_file / add_tag 等）：
\`\`\`act
add_tag
\`\`\`
\`\`\`
形态:webgl 物理:流体
\`\`\`

或差量补丁指令：
\`\`\`act
patch_file
\`\`\`
\`\`\`old_doc
<需要被精准替换的原代码行>
\`\`\`
\`\`\`new_doc
<替换后的新代码行>
\`\`\``}
        className="flex-1 min-h-[300px] w-full bg-code text-zinc-300 border border-border p-3.5 font-mono text-[11px] rounded outline-none resize-none leading-relaxed"
      />

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onApplyPatch}
          className="w-full bg-main text-surface font-semibold py-2.5 rounded text-xs hover:opacity-90 transition-opacity"
        >
          执行命令
        </button>
      </div>
    </div>
  );
};
