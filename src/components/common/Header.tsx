import { TagAutocompleteInput } from '@/components/common/TagAutocompleteInput';
import {
  BookOpen,
  ChevronDown,
  Clipboard,
  FolderOpen,
  LayoutGrid,
  Moon,
  Plus,
  Search,
  Sun,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

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
}) => {
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 绑定全局 ⌘K / Ctrl+K 聚焦搜索框
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const input = document.getElementById('global-search-input') as HTMLInputElement | null;
        input?.focus();
        input?.select();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // 外部点击收起新建菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsCreateMenuOpen(false);
      }
    };
    if (isCreateMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCreateMenuOpen]);

  const handleDirectoryAction = () => {
    if (pendingDirectoryName && !hasDirectory && onRequestPendingPermission) {
      onRequestPendingPermission();
    } else {
      onPickDirectory();
    }
  };

  return (
    <header className="h-14 border-b border-border bg-surface px-5 flex items-center justify-between shrink-0 gap-4 z-20">
      <div className="flex items-center gap-6">
        {/* 双轨大盘分段器 */}
        <nav
          aria-label="视图模式切换"
          className="flex items-center bg-background border border-border p-0.5 rounded-lg text-xs font-medium"
        >
          <button
            type="button"
            onClick={() => onSwitchView('specimens')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
              currentView === 'specimens'
                ? 'bg-surface-elevated text-status-info font-semibold shadow-sm'
                : 'text-muted hover:text-main'
            }`}
            title="查看全部标本工件流"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>标本工件</span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchView('albums')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
              currentView === 'albums'
                ? 'bg-surface-elevated text-status-info font-semibold shadow-sm'
                : 'text-muted hover:text-main'
            }`}
            title="查看精选策展画册"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>策展画册</span>
          </button>
        </nav>
      </div>

      {/* 居中聚合搜索框 */}
      <div className="flex-1 max-w-lg mx-2">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-muted absolute left-3 pointer-events-none" />
          <TagAutocompleteInput
            id="global-search-input"
            value={searchQuery}
            onChange={onSearchChange}
            allTags={allTags || []}
            placeholder={
              currentView === 'albums'
                ? '按标题、简介或智能标签检索画册...'
                : '按名称、备忘或规则检索（如：形态:webgl 物理:流体）...'
            }
            className="w-full bg-background border border-border rounded-lg pl-9 pr-16 py-1.5 text-xs text-main placeholder:text-muted focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/50 transition-all font-mono"
          />
          <div className="absolute right-2.5 flex items-center pointer-events-none">
            <span className="text-[10px] text-muted font-mono bg-surface-subtle px-1.5 py-0.5 rounded border border-border">
              ⌘K
            </span>
          </div>
        </div>
      </div>

      {/* 右侧操作簇 */}
      <div className="flex items-center gap-3">
        {/* 本地物理工作区目录胶囊 */}
        <button
          type="button"
          onClick={handleDirectoryAction}
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-surface-subtle hover:bg-surface-elevated text-xs transition-colors cursor-pointer"
          title={
            pendingDirectoryName && !hasDirectory
              ? `点击恢复访问授权: ${pendingDirectoryName}`
              : hasDirectory
                ? '已连接物理工作区，点击切换'
                : '点击关联本地工作区目录'
          }
        >
          <FolderOpen
            className={`w-3.5 h-3.5 ${
              pendingDirectoryName && !hasDirectory
                ? 'text-status-warn'
                : hasDirectory
                  ? 'text-status-success'
                  : 'text-muted'
            }`}
          />
          <span className="text-main font-mono text-[11px] truncate max-w-[150px]">
            {pendingDirectoryName && !hasDirectory
              ? `待授权: ${pendingDirectoryName}`
              : hasDirectory
                ? '物理工作区已关联'
                : '关联本地目录'}
          </span>
        </button>

        {/* 组合导入与创建主按钮（统一胶囊容器彻底杜绝断开） */}
        {currentView === 'albums' ? (
          <button
            type="button"
            onClick={onOpenNewAlbumComposer}
            className="bg-zinc-100 hover:bg-white text-black font-semibold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-sm"
            title="新建策展画册"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建画册</span>
          </button>
        ) : (
          <div ref={dropdownRef} className="relative flex items-center rounded-lg shadow-sm">
            <div className="flex items-center bg-zinc-100 hover:bg-white text-black rounded-lg overflow-hidden border border-zinc-200 transition-colors">
              <button
                type="button"
                onClick={onImportFromClipboard}
                className="font-semibold px-3 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer outline-none transition-colors hover:bg-black/5"
                title="直接从剪贴板读取 HTML 或脚本并导入"
              >
                <Clipboard className="w-3.5 h-3.5 text-sky-600" />
                <span className="text-zinc-900 font-bold">剪贴板导入</span>
              </button>
              <div className="w-[1px] h-3.5 bg-zinc-300 shrink-0" />
              <button
                type="button"
                onClick={() => setIsCreateMenuOpen((prev) => !prev)}
                className="px-1.5 py-1.5 cursor-pointer outline-none text-zinc-700 hover:text-black hover:bg-black/5 transition-colors flex items-center justify-center"
                title="展开更多创建模式"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {isCreateMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-surface border border-border rounded-lg shadow-2xl p-1 z-30 font-mono text-xs animate-in fade-in zoom-in-95">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateMenuOpen(false);
                    onOpenNewArtifactComposer();
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-surface-subtle text-main flex items-center gap-2"
                >
                  <Plus className="w-3.5 h-3.5 text-status-success" />
                  <span>新建空白工件</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateMenuOpen(false);
                    onImportFromClipboard();
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-surface-subtle text-main flex items-center gap-2"
                >
                  <Clipboard className="w-3.5 h-3.5 text-status-info" />
                  <span>从剪贴板导入</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* 辅助外观主题切换 */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="p-2 border border-border text-muted hover:text-main hover:bg-surface-elevated rounded-lg transition-colors"
          title={resolvedTheme === 'dark' ? '切换至浅色模式' : '切换至深色模式'}
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-4 h-4 text-status-warn" />
          ) : (
            <Moon className="w-4 h-4 text-sky-600" />
          )}
        </button>
      </div>
    </header>
  );
};
