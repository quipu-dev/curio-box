import { TagAutocompleteInput } from '@/components/common/TagAutocompleteInput';
import type { CardSize } from '@/features/gallery/hooks/useArtifactSortAndGroup';
import { BookOpen, Clipboard, FolderOpen, Layers, LayoutGrid, Moon, Plus, Sun } from 'lucide-react';
import type React from 'react';

interface HeaderProps {
  currentView: 'specimens' | 'albums';
  onSwitchView: (view: 'specimens' | 'albums') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onPickDirectory: () => void;
  onImportFromClipboard: () => void;
  onOpenNewArtifactComposer: () => void;
  onOpenNewAlbumComposer?: () => void;
  hasDirectory: boolean;
  pendingDirectoryName?: string;
  onRequestPendingPermission?: () => void;
  resolvedTheme: 'dark' | 'light';
  onToggleTheme: () => void;
  allTags?: string[];
  cardSize: CardSize;
  onCardSizeChange: (size: CardSize) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onSwitchView,
  searchQuery,
  onSearchChange,
  onPickDirectory,
  onImportFromClipboard,
  onOpenNewArtifactComposer,
  onOpenNewAlbumComposer,
  hasDirectory,
  pendingDirectoryName,
  onRequestPendingPermission,
  resolvedTheme,
  onToggleTheme,
  allTags,
  cardSize = 'md',
  onCardSizeChange,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-surface border-b border-border px-6 py-3.5 flex flex-wrap gap-4 justify-between items-center shadow-sm font-mono">
      <div className="flex items-center gap-4">
        <div className="font-bold text-lg tracking-tight font-sans">
          curio-box{' '}
          <span className="text-muted font-normal text-xs font-mono">{'// 视觉工件画廊'}</span>
        </div>

        {/* 双轨大盘视图分段器 */}
        <div className="flex items-center bg-background border border-border rounded-lg p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onSwitchView('specimens')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
              currentView === 'specimens'
                ? 'bg-accent text-accent-text font-semibold shadow-sm'
                : 'text-muted hover:text-main'
            }`}
            title="查看全部标本工件流"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>标本大盘</span>
          </button>

          <button
            type="button"
            onClick={() => onSwitchView('albums')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
              currentView === 'albums'
                ? 'bg-accent text-accent-text font-semibold shadow-sm'
                : 'text-muted hover:text-main'
            }`}
            title="查看精选策展画册与智能专辑"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>策展画册</span>
          </button>
        </div>
      </div>

      {/* 搜索栏（画册模式下切换占位提示） */}
      <div className="flex-1 max-w-xl mx-auto w-full">
        <div className="flex items-center bg-background border border-border px-2 py-1 rounded text-sm">
          <TagAutocompleteInput
            value={searchQuery}
            onChange={onSearchChange}
            allTags={allTags || []}
            placeholder={
              currentView === 'albums'
                ? '检索画册标题、简介或智能标签...'
                : '标签检索：形态:webgl 物理:流体 -风格:粗野'
            }
            className="w-full bg-transparent border-0 outline-none text-main font-mono text-xs placeholder:text-muted px-1 py-1"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {currentView === 'albums' ? (
          <button
            type="button"
            onClick={onOpenNewAlbumComposer}
            className="flex items-center gap-1.5 bg-main text-surface px-3 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity rounded"
            title="新建策展画册或智能专辑"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建画册</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onOpenNewArtifactComposer}
              className="flex items-center gap-1.5 bg-main text-surface px-3 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity rounded"
              title="创建新工件"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建工件</span>
            </button>

            <button
              type="button"
              onClick={onImportFromClipboard}
              className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs hover:bg-border transition-colors rounded text-muted hover:text-main"
              title="从剪贴板读取代码并导入"
            >
              <Clipboard className="w-3.5 h-3.5 text-status-info" />
              <span className="hidden md:inline">剪贴板导入</span>
            </button>
          </>
        )}

        {/* 待重新授权提示 */}
        {pendingDirectoryName && !hasDirectory && onRequestPendingPermission && (
          <button
            type="button"
            onClick={onRequestPendingPermission}
            className="flex items-center gap-1.5 bg-status-info-bg border border-status-info-border text-status-info px-3 py-1.5 text-xs hover:bg-status-info-bg transition-colors rounded animate-pulse"
            title="点击恢复上次目录的访问授权"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>恢复目录: {pendingDirectoryName}</span>
          </button>
        )}

        {/* 标本大盘模式下保留网格尺寸切换 */}
        {currentView === 'specimens' && (
          <div className="hidden sm:flex items-center border border-border rounded overflow-hidden p-0.5 bg-background">
            <div className="px-1.5 text-muted flex items-center" title="调整卡片呈现尺寸">
              <LayoutGrid className="w-3.5 h-3.5" />
            </div>
            <button
              type="button"
              onClick={() => onCardSizeChange('sm')}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                cardSize === 'sm'
                  ? 'bg-accent text-accent-text font-semibold'
                  : 'text-muted hover:text-main'
              }`}
              title="紧凑模式"
            >
              紧凑
            </button>
            <button
              type="button"
              onClick={() => onCardSizeChange('md')}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                cardSize === 'md'
                  ? 'bg-accent text-accent-text font-semibold'
                  : 'text-muted hover:text-main'
              }`}
              title="标准模式"
            >
              标准
            </button>
            <button
              type="button"
              onClick={() => onCardSizeChange('lg')}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                cardSize === 'lg'
                  ? 'bg-accent text-accent-text font-semibold'
                  : 'text-muted hover:text-main'
              }`}
              title="巨幕模式"
            >
              巨幕
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onPickDirectory}
          className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs hover:bg-border transition-colors rounded"
        >
          <FolderOpen className="w-3.5 h-3.5 text-muted" />
          <span className="hidden sm:inline">{hasDirectory ? '切换目录' : '关联目录'}</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          className="border border-border p-2 text-xs hover:bg-border transition-colors rounded text-muted hover:text-main"
          title={resolvedTheme === 'dark' ? '切换至浅色模式' : '切换至深色模式'}
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-3.5 h-3.5 text-status-warn" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-sky-600" />
          )}
        </button>
      </div>
    </header>
  );
};
