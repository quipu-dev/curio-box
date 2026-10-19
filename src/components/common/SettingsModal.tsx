import { type DefaultCreationMode, useSettings } from '@/context/SettingsContext';
import {
  Clipboard,
  FileCode,
  FolderCheck,
  FolderOpen,
  FolderSync,
  Layers,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasDirectory: boolean;
  directoryName: string | null;
  pendingDirectoryName?: string;
  onPickDirectory: () => void;
  onRequestPendingPermission?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  hasDirectory,
  directoryName,
  pendingDirectoryName,
  onPickDirectory,
  onRequestPendingPermission,
}) => {
  const { settings, updateSettings, toggleGrouping } = useSettings();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    // 监听外部点击（精确判断 target 是否在弹窗卡片之外）
    const handlePointerDown = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handlePointerDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectDefaultMode = (mode: DefaultCreationMode) => {
    updateSettings({ defaultCreationMode: mode });
  };

  return (
    <div className="fixed inset-0 z-50 bg-surface-overlay flex items-center justify-center p-4 select-none animate-in fade-in">
      {/* 弹窗核心卡片容器：通过 ref 绑定外部点击判定 */}
      <div
        ref={modalRef}
        aria-label="系统首选项设置"
        className="w-full max-w-xl bg-surface border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden text-main font-mono text-xs"
      >
        {/* 顶部标题栏 */}
        <header className="h-14 bg-background border-b border-border px-5 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-status-info-bg border border-status-info-border text-status-info rounded">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-sm font-sans tracking-wide">系统首选项设置</div>
              <div className="text-[11px] text-muted">配置工件大盘排布、物理工作区与个性化入口</div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted hover:text-main rounded hover:bg-surface-subtle transition-colors"
            title="关闭 (Esc / 点击外部)"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* 设置内容区 */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[72vh]">
          {/* 设置项 1：本地物理工作区管理 */}
          <div className="flex flex-col gap-3 p-4 bg-background border border-border rounded-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-sans font-bold text-xs text-main flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-status-info" />
                  <span>本地物理工作区目录</span>
                </span>
                <span className="text-[11px] font-sans text-muted mt-0.5 leading-relaxed">
                  关联本地文件夹，工件源码与快照将直接落盘保存。
                </span>
              </div>

              {pendingDirectoryName && !hasDirectory && onRequestPendingPermission ? (
                <button
                  type="button"
                  onClick={onRequestPendingPermission}
                  className="px-3 py-1.5 bg-status-warn-bg text-status-warn border border-status-warn-border hover:bg-status-warn-bg/80 rounded font-semibold text-xs transition-colors shrink-0 flex items-center gap-1.5"
                >
                  <FolderSync className="w-3.5 h-3.5" />
                  <span>恢复授权</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onPickDirectory}
                  className="px-3 py-1.5 bg-surface-elevated hover:bg-surface border border-border text-main rounded font-semibold text-xs transition-colors shrink-0 flex items-center gap-1.5"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-status-info" />
                  <span>{hasDirectory ? '切换工作区' : '关联本地目录'}</span>
                </button>
              )}
            </div>

            {/* 详细路径与状态看板 */}
            <div className="p-2.5 rounded bg-surface border border-border flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted">当前挂载状态:</span>
                {pendingDirectoryName && !hasDirectory ? (
                  <span className="text-status-warn font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span>待浏览器授权访问</span>
                  </span>
                ) : hasDirectory ? (
                  <span className="text-status-success font-semibold flex items-center gap-1">
                    <FolderCheck className="w-3.5 h-3.5" />
                    <span>已连接并实时同步</span>
                  </span>
                ) : (
                  <span className="text-muted flex items-center gap-1">
                    <span>未关联（演示模式 / 内存沙箱）</span>
                  </span>
                )}
              </div>

              {(directoryName || pendingDirectoryName) && (
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/60">
                  <span className="text-muted">当前目录:</span>
                  <span className="font-mono font-bold text-main px-1.5 py-0.5 rounded bg-surface-subtle border border-border max-w-[280px] truncate">
                    {directoryName || pendingDirectoryName}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 设置项 2：默认工件创建模式 */}
          <div className="flex flex-col gap-3 p-4 bg-background border border-border rounded-lg">
            <div className="flex flex-col">
              <span className="font-sans font-bold text-xs text-main flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-status-info" />
                <span>顶栏主按钮默认行为</span>
              </span>
              <span className="text-[11px] font-sans text-muted mt-0.5 leading-relaxed">
                设置顶栏主快捷按钮的默认操作，次要项可在下拉菜单中触发。
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleSelectDefaultMode('clipboard')}
                className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                  settings.defaultCreationMode === 'clipboard'
                    ? 'border-status-info-border bg-status-info-bg text-main shadow-sm'
                    : 'border-border bg-surface hover:bg-surface-subtle text-muted'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-status-info">
                  <Clipboard className="w-3.5 h-3.5" />
                  <span>从剪贴板导入</span>
                </div>
                <div className="text-[11px] font-sans leading-normal">
                  适合快速导入大模型生成的代码。
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectDefaultMode('scratch')}
                className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                  settings.defaultCreationMode === 'scratch'
                    ? 'border-status-info-border bg-status-info-bg text-main shadow-sm'
                    : 'border-border bg-surface hover:bg-surface-subtle text-muted'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-status-info">
                  <FileCode className="w-3.5 h-3.5" />
                  <span>新建工件</span>
                </div>
                <div className="text-[11px] font-sans leading-normal">适合自主编写或调试工件。</div>
              </button>
            </div>
          </div>

          {/* 设置项 3：自动分组开关行 */}
          <div className="flex items-center justify-between p-4 bg-background border border-border rounded-lg">
            <div className="flex flex-col pr-4">
              <span className="font-sans font-bold text-xs text-main flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-status-info" />
                <span>开启工件自动智能分组</span>
              </span>
              <span className="text-[11px] font-sans text-muted mt-1 leading-relaxed">
                开启后，系统将依据当前选择的排序维度自动分桶呈现。
              </span>
            </div>

            {/* 原生按钮 Toggle 开关 */}
            <button
              type="button"
              role="switch"
              aria-checked={settings.enableGrouping}
              onClick={toggleGrouping}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.enableGrouping ? 'bg-status-info' : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.enableGrouping ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* 底部按钮栏 */}
        <footer className="h-12 bg-background border-t border-border px-5 flex justify-end items-center shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-main text-surface rounded text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            完成
          </button>
        </footer>
      </div>
    </div>
  );
};
