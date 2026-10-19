import { TagAutocompleteInput } from '@/components/common/TagAutocompleteInput';
import { useSettings } from '@/context/SettingsContext';
import {
  BookOpen,
  ChevronDown,
  Clipboard,
  FileCode,
  LayoutGrid,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { FolderOpen, FolderSync } from 'lucide-react';

interface HeaderProps {
  currentView: 'specimens' | 'albums';
  onSwitchView: (view: 'specimens' | 'albums') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onImportFromClipboard: () => void;
  onOpenNewArtifactComposer: () => void;
  onOpenNewAlbumComposer?: () => void;
  hasDirectory: boolean;
  pendingDirectoryName?: string;
  onPickDirectory: () => void;
  onRequestPendingPermission?: () => void;
  resolvedTheme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  allTags?: string[];
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onSwitchView,
  searchQuery,
  onSearchChange,
  onImportFromClipboard,
  onOpenNewArtifactComposer,
  onOpenNewAlbumComposer,
  hasDirectory,
  pendingDirectoryName,
  onPickDirectory,
  onRequestPendingPermission,
  resolvedTheme,
  onToggleTheme,
  onOpenSettings,
  allTags,
}) => {
  const { settings } = useSettings();
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isDefaultClipboard = settings.defaultCreationMode === 'clipboard';

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
          <Search className="w-4 h-4 text-muted absolute left-3 pointer-events-none z-10" />
          <TagAutocompleteInput
            id="global-search-input"
            value={searchQuery}
            onChange={onSearchChange}
            allTags={allTags || []}
            allowPredicates={true}
            placeholder={
              currentView === 'albums'
                ? '按标题、简介或智能标签检索画册...'
                : '按名称、备忘或规则检索（如：形态:webgl 物理:流体）...'
            }
            className="w-full bg-background border border-border rounded-lg pl-9 pr-16 py-1.5 text-xs text-main placeholder:text-muted focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/50 transition-all font-mono"
          />
          <div className="absolute right-2.5 flex items-center pointer-events-none z-10">
            <span className="text-[10px] text-muted font-mono bg-surface-subtle px-1.5 py-0.5 rounded border border-border">
              ⌘K
            </span>
          </div>
        </div>
      </div>

      {/* 右侧操作簇 */}
      <div className="flex items-center gap-3">
        {/* 预览模式下的直观连接工作区入口（已连接后自动隐退，仅收于设置中） */}
        {!hasDirectory &&
          (pendingDirectoryName && onRequestPendingPermission ? (
            <button
              type="button"
              onClick={onRequestPendingPermission}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-status-warn-border bg-status-warn-bg text-status-warn hover:opacity-90 text-xs font-medium transition-opacity cursor-pointer shrink-0"
              title={`恢复对本地目录 [${pendingDirectoryName}] 的访问授权`}
            >
              <FolderSync className="w-3.5 h-3.5 animate-pulse" />
              <span className="font-sans font-bold">恢复工作区授权</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onPickDirectory}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-status-info-border bg-status-info-bg text-status-info hover:opacity-90 text-xs font-medium transition-opacity cursor-pointer shrink-0 shadow-sm"
              title="连接本地文件夹，实现工件与快照的本地实时物理落盘"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="font-sans font-bold">连接工作区</span>
            </button>
          ))}

        {/* 组合导入与创建主按钮（深色模式适配，依据首选项切换主动作） */}
        {currentView === 'albums' ? (
          <button
            type="button"
            onClick={onOpenNewAlbumComposer}
            className="bg-surface-elevated hover:bg-surface-subtle border border-border text-main font-semibold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-sm"
            title="新建策展画册"
          >
            <Plus className="w-3.5 h-3.5 text-status-info" />
            <span>新建画册</span>
          </button>
        ) : (
          <div ref={dropdownRef} className="relative flex items-center rounded-lg shadow-sm">
            <div className="flex items-center bg-surface-elevated hover:bg-surface border border-border rounded-lg overflow-hidden transition-colors">
              {isDefaultClipboard ? (
                /* 默认模式：剪贴板导入 */
                <button
                  type="button"
                  onClick={onImportFromClipboard}
                  className="font-semibold px-3 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer outline-none transition-colors text-main hover:bg-surface-subtle"
                  title="直接从剪贴板读取 HTML 或脚本并导入"
                >
                  <Clipboard className="w-3.5 h-3.5 text-status-info" />
                  <span>剪贴板导入</span>
                </button>
              ) : (
                /* 默认模式：新建空白工件 */
                <button
                  type="button"
                  onClick={onOpenNewArtifactComposer}
                  className="font-semibold px-3 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer outline-none transition-colors text-main hover:bg-surface-subtle"
                  title="开启空白工件编辑器"
                >
                  <Plus className="w-3.5 h-3.5 text-status-success" />
                  <span>新建工件</span>
                </button>
              )}

              <div className="w-px h-3.5 bg-border shrink-0" />

              <button
                type="button"
                onClick={() => setIsCreateMenuOpen((prev) => !prev)}
                className="px-1.5 py-1.5 cursor-pointer outline-none text-muted hover:text-main hover:bg-surface-subtle transition-colors flex items-center justify-center"
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
                  <FileCode className="w-3.5 h-3.5 text-status-success" />
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

        {/* 系统全局首选项设置入口 */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="p-2 border border-border text-muted hover:text-main hover:bg-surface-elevated rounded-lg transition-colors"
          title="系统首选项设置（物理工作区、创建偏好与分组）"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
