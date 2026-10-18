import { Check, Copy, Eye, GitBranch, Loader2, Sparkles } from 'lucide-react';
import type React from 'react';

interface DarkroomPatchTabProps {
  isViewingSnapshot: boolean;
  viewingRevision?: number;
  patchInput: string;
  copied: boolean;
  isSimulating: boolean;
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
  isSimulating,
  onPatchInputChange,
  onCopyPromptContext,
  onApplyPatch,
  onRestoreRevision,
  onExitCheckout,
}) => {
  if (isViewingSnapshot && viewingRevision !== undefined) {
    return (
      <div className="flex-1 flex flex-col gap-3">
        <div className="p-3.5 bg-status-warn-bg border border-status-warn-border rounded flex flex-col gap-2.5 text-status-warn">
          <div className="flex items-center gap-2 font-semibold text-xs">
            <Eye className="w-4 h-4 text-status-warn shrink-0" />
            <span>当前正在检视历史版本 REV:{viewingRevision}</span>
          </div>
          <p className="text-[11px] text-zinc-300 leading-relaxed">
            为防止代码冲突，检视历史版本时补丁功能已锁定。您可以基于此版本继续修改，或返回最新版本。
          </p>
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={() => onRestoreRevision?.(viewingRevision)}
              className="flex-1 bg-status-warn-bg border border-status-warn-border text-status-warn py-2 rounded text-xs hover:bg-status-warn-bg transition-colors flex items-center justify-center gap-1.5"
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
          className="flex items-center gap-1 text-[11px] text-status-info hover:text-status-info"
        >
          {copied ? (
            <Check className="w-3 h-3 text-status-success" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
          <span>{copied ? '已复制完整提示词上下文！' : '复制大模型提示词上下文'}</span>
        </button>
      </div>

      <textarea
        value={patchInput}
        onChange={(e) => onPatchInputChange(e.target.value)}
        placeholder={`粘贴大模型生成的指令块（支持 patch_file / write_file / commit / add_tag 等）：

【1. 本次修改说明 (commit) - 推荐】
\`\`\`act
commit
\`\`\`
\`\`\`
优化了阻尼系数，修复周期性突变，使视听演化平滑流淌。
\`\`\`

【2. 差量精准修改 (patch_file)】
\`\`\`act
patch_file
\`\`\`
\`\`\`old_doc
<需要被精准替换的原代码行>
\`\`\`
\`\`\`new_doc
<替换后的新代码行>
\`\`\`

【3. 全量源码覆写 (write_file)】
\`\`\`act
write_file
\`\`\`
\`\`\`html
<!DOCTYPE html>
<html>...完整源码...</html>
\`\`\`

【4. 追加分类标签 (add_tag)】
\`\`\`act
add_tag
\`\`\`
\`\`\`
形态:webgl 物理:流体
\`\`\`

【5. 工件全局研判备忘 (set_description) - 仅限工件整体评价，勿写单次修改说明】
\`\`\`act
set_description
\`\`\`
\`\`\`
优秀的流体仿真标本，适宜全屏交互。
\`\`\``}
        className="flex-1 min-h-[300px] w-full bg-code text-zinc-300 border border-border p-3.5 font-mono text-[11px] rounded outline-none resize-none leading-relaxed"
      />

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={isSimulating}
          onClick={onApplyPatch}
          className="w-full bg-main text-surface font-semibold py-2.5 rounded text-xs hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
        >
          {isSimulating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>正在校验并预演指令...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>解析并预演指令 (审查 Diff)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
