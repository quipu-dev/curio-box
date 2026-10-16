import { FolderOpen, Moon, Sun } from 'lucide-react';
import type React from 'react';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onPickDirectory: () => void;
  hasDirectory: boolean;
  pendingDirectoryName?: string;
  onRequestPendingPermission?: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onPickDirectory,
  hasDirectory,
  pendingDirectoryName,
  onRequestPendingPermission,
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
        {/* 如果有上次挂载且待重新授权的目录，提供一键重新连接按钮 */}
        {pendingDirectoryName && !hasDirectory && onRequestPendingPermission && (
          <button
            type="button"
            onClick={onRequestPendingPermission}
            className="flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/40 text-sky-400 px-3 py-1.5 text-xs font-mono hover:bg-sky-500/20 transition-colors rounded animate-pulse"
            title="点击恢复上次挂载目录的读取授权"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>恢复关联目录: {pendingDirectoryName}</span>
          </button>
        )}

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
