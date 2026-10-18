import { Eye, EyeOff, GitBranch } from 'lucide-react';
import type React from 'react';

interface DarkroomCheckoutHudProps {
  revision: number;
  onRestore: (revision: number) => void;
  onExit: () => void;
}

export const DarkroomCheckoutHud: React.FC<DarkroomCheckoutHudProps> = ({
  revision,
  onRestore,
  onExit,
}) => {
  return (
    <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 bg-zinc-950/90 border border-status-warn-border backdrop-blur-md px-4 py-2 rounded-full text-xs font-mono text-zinc-200 shadow-2xl animate-in fade-in slide-in-from-top-2">
      <span className="inline-flex items-center gap-1.5 text-status-warn font-semibold">
        <Eye className="w-3.5 h-3.5 animate-pulse" />
        <span>历史检视中 · REV:{revision}</span>
      </span>
      <span className="text-zinc-500 text-[11px]">(只读预览)</span>

      <div className="w-px h-3.5 bg-zinc-700" />

      <button
        type="button"
        onClick={() => onRestore(revision)}
        className="flex items-center gap-1 bg-status-warn-bg hover:bg-status-warn-bg text-status-warn border border-status-warn-border px-2.5 py-1 rounded-full transition-colors text-[11px]"
        title="以此历史快照为基准恢复修改"
      >
        <GitBranch className="w-3 h-3" />
        <span>基于此版本修改</span>
      </button>

      <button
        type="button"
        onClick={onExit}
        className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors text-[11px] px-1.5"
        title="退出预览并回到最新版本"
      >
        <EyeOff className="w-3 h-3" />
        <span>返回最新</span>
      </button>
    </div>
  );
};
