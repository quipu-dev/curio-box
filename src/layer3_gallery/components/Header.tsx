import { TagAutocompleteInput } from '@/layer3_gallery/components/TagAutocompleteInput';
import { Clipboard, FolderOpen, LayoutGrid, Moon, Plus, Sun } from 'lucide-react';
import type React from 'react';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onPickDirectory: () => void;
  onImportFromClipboard: () => void;
  onOpenNewArtifactComposer: () => void;
  hasDirectory: boolean;
  pendingDirectoryName?: string;
  onRequestPendingPermission?: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  allTags?: string[];
  gridCols: number;
  onGridColsChange: (cols: number) => void;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onPickDirectory,
  onImportFromClipboard,
  onOpenNewArtifactComposer,
  hasDirectory,
  pendingDirectoryName,
  onRequestPendingPermission,
  theme,
  onToggleTheme,
  allTags,
  gridCols = 4,
  onGridColsChange,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-surface border-b border-border px-6 py-4 flex flex-wrap gap-4 justify-between items-center shadow-sm">
      <div className="flex items-center gap-3">
        <div className="font-bold text-lg tracking-tight">
          curio-box{' '}
          <span className="text-muted font-normal text-sm font-mono">{'// 视觉工件画廊'}</span>
        </div>
      </div>

      <div className="flex-1 max-w-xl mx-auto w-full">
        <div className="flex items-center bg-background border border-border px-2 py-1 rounded text-sm">
          <TagAutocompleteInput
            value={searchQuery}
            onChange={onSearchChange}
            allTags={allTags || []}
            placeholder="标签检索：形态:webgl 物理:流体 -风格:粗野"
            className="w-full bg-transparent border-0 outline-none text-main font-mono text-xs placeholder:text-muted px-1 py-1"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenNewArtifactComposer}
          className="flex items-center gap-1.5 bg-main text-surface px-3 py-1.5 text-xs font-mono font-medium hover:opacity-90 transition-opacity rounded"
          title="创建新工件"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新建工件</span>
        </button>

        <button
          type="button"
          onClick={onImportFromClipboard}
          className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-mono hover:bg-border transition-colors rounded text-muted hover:text-main"
          title="从剪贴板读取代码并导入"
        >
          <Clipboard className="w-3.5 h-3.5 text-sky-400" />
          <span>剪贴板导入</span>
        </button>

        {/* 如果有上次挂载且待重新授权的目录，提供一键重新连接按钮 */}
        {pendingDirectoryName && !hasDirectory && onRequestPendingPermission && (
          <button
            type="button"
            onClick={onRequestPendingPermission}
            className="flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/40 text-sky-400 px-3 py-1.5 text-xs font-mono hover:bg-sky-500/20 transition-colors rounded animate-pulse"
            title="点击恢复上次目录的访问授权"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>恢复关联目录: {pendingDirectoryName}</span>
          </button>
        )}

        {/* 网格列数缩放选择器 */}
        <div className="hidden lg:flex items-center border border-border rounded overflow-hidden p-0.5 bg-background">
          <div className="px-1.5 text-muted flex items-center" title="调整画廊网格列数">
            <LayoutGrid className="w-3.5 h-3.5" />
          </div>
          {[2, 3, 4, 5, 6].map((cols) => (
            <button
              key={cols}
              type="button"
              onClick={() => onGridColsChange(cols)}
              className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                gridCols === cols
                  ? 'bg-zinc-800 text-white font-bold'
                  : 'text-muted hover:text-main'
              }`}
              title={`${cols} 列网格布局`}
            >
              {cols}
            </button>
          ))}
        </div>

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
