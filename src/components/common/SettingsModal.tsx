import { type DefaultCreationMode, useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import type { StorageDriverType, UpdateWorkspaceInput, WorkspaceMeta } from '@/types';
import {
  Archive,
  Check,
  Clipboard,
  Copy,
  Database,
  FileCode,
  FolderCheck,
  FolderOpen,
  FolderSync,
  Hash,
  Layers,
  Loader2,
  Sliders,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasDirectory: boolean;
  directoryName: string | null;
  driverType?: StorageDriverType;
  pendingDirectoryName?: string;
  onPickDirectory: () => void;
  onRequestPendingPermission?: () => void;
  onSwitchToOpfsSandbox?: () => Promise<void>;
  workspaceMeta: WorkspaceMeta | null;
  onUpdateWorkspace: (input: UpdateWorkspaceInput) => Promise<void>;
  onExportWorkspace?: (onProgress?: (status: string) => void) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  hasDirectory,
  directoryName,
  driverType = 'opfs-sandbox',
  pendingDirectoryName,
  onPickDirectory,
  onRequestPendingPermission,
  onSwitchToOpfsSandbox,
  workspaceMeta,
  onUpdateWorkspace,
  onExportWorkspace,
}) => {
  const { settings, updateSettings, toggleGrouping } = useSettings();
  const { toast } = useToast();
  const modalRef = useRef<HTMLDivElement>(null);

  const [nameValue, setNameValue] = useState<string>(workspaceMeta?.name || '');
  const [descValue, setDescValue] = useState<string>(workspaceMeta?.description || '');
  const [hasCopiedId, setHasCopiedId] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportStatusText, setExportStatusText] = useState<string>('');

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

  const handleCopyId = () => {
    if (!workspaceMeta?.id) return;
    navigator.clipboard.writeText(workspaceMeta.id);
    setHasCopiedId(true);
    toast.success('已复制工作区唯一 ID');
    setTimeout(() => setHasCopiedId(false), 2000);
  };

  const handleBlurSaveWorkspace = async () => {
    if (!workspaceMeta) return;
    const trimmedName = nameValue.trim();
    const trimmedDesc = descValue.trim();
    if (!trimmedName) {
      setNameValue(workspaceMeta.name);
      return;
    }

    if (trimmedName === workspaceMeta.name && trimmedDesc === (workspaceMeta.description || '')) {
      return;
    }

    try {
      await onUpdateWorkspace({
        name: trimmedName,
        description: trimmedDesc,
      });
      toast.success('工作区配置已保存');
    } catch {
      toast.error('保存工作区配置失败');
    }
  };

  const handleExportWorkspace = async () => {
    if (!onExportWorkspace) return;
    setIsExporting(true);
    setExportStatusText('正在准备打包...');
    try {
      await onExportWorkspace((status) => {
        setExportStatusText(status);
      });
      toast.success('全量工作区备份归档包导出成功！');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`导出备份失败: ${msg}`);
    } finally {
      setIsExporting(false);
      setExportStatusText('');
    }
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
          {/* 设置项 1：工作区属性与物理落盘管理 */}
          <div className="flex flex-col gap-3 p-4 bg-background border border-border rounded-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-sans font-bold text-xs text-main flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-status-info" />
                  <span>工作区档案与本地目录</span>
                </span>
                <span className="text-[11px] font-sans text-muted mt-0.5 leading-relaxed">
                  支持关联本地文件夹，实现工件与版本快照的实时本地落盘与管理。
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {driverType === 'fsa-physical' && onSwitchToOpfsSandbox && (
                  <button
                    type="button"
                    onClick={onSwitchToOpfsSandbox}
                    className="px-3 py-1.5 bg-surface-elevated hover:bg-surface border border-border text-muted hover:text-main rounded font-semibold text-xs transition-colors flex items-center gap-1.5"
                    title="断开当前物理文件夹直连，切至浏览器内置沙箱存储"
                  >
                    <Database className="w-3.5 h-3.5 text-status-info" />
                    <span>切至浏览器沙箱</span>
                  </button>
                )}

                {pendingDirectoryName && !hasDirectory && onRequestPendingPermission ? (
                  <button
                    type="button"
                    onClick={onRequestPendingPermission}
                    className="px-3 py-1.5 bg-status-warn-bg text-status-warn border border-status-warn-border hover:bg-status-warn-bg/80 rounded font-semibold text-xs transition-colors flex items-center gap-1.5"
                  >
                    <FolderSync className="w-3.5 h-3.5" />
                    <span>恢复授权</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onPickDirectory}
                    className="px-3 py-1.5 bg-surface-elevated hover:bg-surface border border-border text-main rounded font-semibold text-xs transition-colors flex items-center gap-1.5"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-status-info" />
                    <span>{hasDirectory ? '切换工作区' : '关联本地目录'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* 工作区名称与描述表单 */}
            <div className="flex flex-col gap-2.5 pt-1">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px] uppercase text-muted tracking-wider">
                  <span className="flex items-center gap-1 font-semibold">
                    <Tag className="w-3 h-3 text-status-info" />
                    <span>工作区名称</span>
                  </span>
                  {workspaceMeta?.id && (
                    <div className="flex items-center gap-1 font-mono text-[10px] text-muted">
                      <Hash className="w-3 h-3" />
                      <span className="truncate max-w-[150px]">{workspaceMeta.id}</span>
                      <button
                        type="button"
                        onClick={handleCopyId}
                        className="p-0.5 hover:text-main text-muted rounded ml-0.5"
                        title="复制工作区 ID"
                      >
                        {hasCopiedId ? (
                          <Check className="w-3 h-3 text-status-success" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onBlur={handleBlurSaveWorkspace}
                  placeholder="例如：视觉物理与流体实验库"
                  className="bg-surface border border-border px-3 py-1.5 rounded text-xs text-main outline-none focus:border-status-info font-sans font-medium"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-muted tracking-wider font-semibold">
                  工作区描述 (选填)
                </span>
                <textarea
                  rows={2}
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  onBlur={handleBlurSaveWorkspace}
                  placeholder="记录该工作区/标本陈列室的收藏脉络或研究方向..."
                  className="bg-surface border border-border p-2 rounded text-xs text-main outline-none focus:border-status-info font-sans resize-none leading-relaxed"
                />
              </div>
            </div>

            {/* 详细路径与挂载状态看板 */}
            <div className="p-2.5 rounded bg-surface border border-border flex flex-col gap-1.5 mt-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted">存储驱动底座:</span>
                {driverType === 'fsa-physical' ? (
                  <span className="text-status-success font-semibold flex items-center gap-1">
                    <FolderCheck className="w-3.5 h-3.5" />
                    <span>本地文件夹直连</span>
                  </span>
                ) : (
                  <span className="text-status-info font-semibold flex items-center gap-1">
                    <Database className="w-3.5 h-3.5" />
                    <span>浏览器内置沙箱存储</span>
                  </span>
                )}
              </div>

              {(directoryName || pendingDirectoryName) && (
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/60">
                  <span className="text-muted">存储位置:</span>
                  <span className="font-mono font-bold text-main px-1.5 py-0.5 rounded bg-surface-subtle border border-border max-w-[280px] truncate">
                    {directoryName || pendingDirectoryName}
                  </span>
                </div>
              )}

              {/* 全量工作区备份归档导出 */}
              {onExportWorkspace && (
                <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                  <span className="text-[11px] text-muted">全量数据备份:</span>
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={handleExportWorkspace}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-elevated hover:bg-surface border border-border rounded text-[11px] font-semibold text-main transition-colors disabled:opacity-50"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-status-info" />
                        <span>{exportStatusText || '正在打包...'}</span>
                      </>
                    ) : (
                      <>
                        <Archive className="w-3 h-3 text-status-info" />
                        <span>导出全量工作区 (.zip)</span>
                      </>
                    )}
                  </button>
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
