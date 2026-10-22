import { TagAutocompleteInput } from '@/components/common/TagAutocompleteInput';
import { MetaSealEngine } from '@/core/engine/meta-seal';
import { TitleSanitizerEngine } from '@/core/engine/title-sanitizer';
import { SandboxViewport } from '@/features/sandbox/SandboxViewport';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';
import CodeMirror from '@uiw/react-codemirror';
import {
  Code2,
  Eye,
  EyeOff,
  FileCode,
  MessageSquareQuote,
  Save,
  Sparkles,
  Tag as TagIcon,
  X,
} from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';

interface ArtifactComposerModalProps {
  initialCode: string;
  existingFilenames: string[];
  allTags?: string[];
  onClose: () => void;
  onSave: (artifact: {
    filename: string;
    content: string;
    name: string;
    tags: string[];
    description?: string;
  }) => Promise<void>;
}

export const ArtifactComposerModal: React.FC<ArtifactComposerModalProps> = ({
  initialCode,
  existingFilenames,
  allTags = [],
  onClose,
  onSave,
}) => {
  // 装配初始化时优先探测源码内部是否存在符印
  const initialSeal = useMemo(() => MetaSealEngine.extract(initialCode), [initialCode]);

  const [sourceCode, setSourceCode] = useState<string>(initialCode);
  const [artifactName, setArtifactName] = useState<string>(() =>
    TitleSanitizerEngine.extractTitle(initialCode),
  );
  const [artifactDesc, setArtifactDesc] = useState<string>(() => initialSeal?.description || '');
  const [rawTagsInput, setRawTagsInput] = useState<string>(() => {
    if (initialSeal?.tags && initialSeal.tags.length > 0) {
      return initialSeal.tags.join(' ');
    }
    return '形态:原生html 状态:新建';
  });
  const isMobileScreen = typeof window !== 'undefined' && window.innerWidth < 768;
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [activeMobileView, setActiveMobileView] = useState<'preview' | 'code'>('preview');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // 支持 Ctrl+S 或 Cmd+S 快捷键保存
  const handleEditorKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handlePerformSave();
    }
  };

  // 代码行数统计
  const lineCount = useMemo(() => {
    return sourceCode.split('\n').length;
  }, [sourceCode]);

  // 提交保存落盘（方案 A：工件名称严格映射文件名）
  const handlePerformSave = async () => {
    const trimmedName = artifactName.trim();
    if (!trimmedName) {
      setErrorMsg('工件名称不能为空');
      return;
    }
    if (!sourceCode.trim()) {
      setErrorMsg('工件源码内容不能为空');
      return;
    }

    const safeFile = TitleSanitizerEngine.toSafeHtmlFilename(trimmedName);
    const uniqueFile = TitleSanitizerEngine.deduplicateFilename(safeFile, existingFilenames);
    const finalName = uniqueFile.replace(/\.html$/, '');

    const parsedTags = rawTagsInput
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      setIsSaving(true);
      setErrorMsg('');
      await onSave({
        filename: uniqueFile,
        content: sourceCode,
        name: finalName,
        tags: parsedTags,
        description: artifactDesc.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`保存失败: ${msg}`);
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-surface-overlay flex items-center justify-center p-3 md:p-6 select-none animate-in fade-in">
      <div className="w-full max-w-6xl h-[90vh] bg-surface border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden text-main">
        {/* 顶部标题栏 */}
        <header className="h-14 bg-background border-b border-border px-4 md:px-6 flex justify-between items-center gap-4 shrink-0 font-mono text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-status-info-bg border border-status-info-border text-status-info rounded">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-sm font-sans tracking-wide">工件编辑器</div>
              <div className="text-[11px] text-muted">
                实时预览并编辑源码，保存时自动记录初始版本 (REV:1)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isMobileScreen ? (
              <div className="flex items-center border border-border rounded overflow-hidden text-[11px]">
                <button
                  type="button"
                  onClick={() => setActiveMobileView('preview')}
                  className={`px-2 py-1 ${
                    activeMobileView === 'preview'
                      ? 'bg-status-info-bg text-status-info font-bold'
                      : 'text-muted'
                  }`}
                >
                  预览
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMobileView('code')}
                  className={`px-2 py-1 ${
                    activeMobileView === 'code'
                      ? 'bg-status-info-bg text-status-info font-bold'
                      : 'text-muted'
                  }`}
                >
                  源码
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPreview((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded hover:bg-surface transition-colors text-muted hover:text-main text-[11px]"
                title="折叠/展开实时预览"
              >
                {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showPreview ? '隐藏预览' : '显示预览'}</span>
              </button>
            )}

            <button
              type="button"
              disabled={isSaving}
              onClick={handlePerformSave}
              className="flex items-center gap-1.5 bg-main text-surface px-3 sm:px-4 py-1.5 rounded font-semibold text-xs hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? '保存中...' : '保存'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-muted hover:text-main rounded hover:bg-border transition-colors ml-1"
              title="关闭窗口"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* 元属性配置表单栏（方案 A：统一工件名称与物理文件映射） */}
        <div className="bg-surface border-b border-border p-3 md:px-6 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="composer-artifact-name"
              className="text-[10px] uppercase text-muted tracking-wider flex items-center justify-between"
            >
              <span className="flex items-center gap-1">
                <FileCode className="w-3 h-3 text-status-info" />
                <span>工件名称</span>
              </span>
              <span className="text-[10px] text-muted font-normal truncate max-w-[120px]">
                {TitleSanitizerEngine.toSafeHtmlFilename(artifactName || 'artifact')}
              </span>
            </label>
            <input
              id="composer-artifact-name"
              type="text"
              value={artifactName}
              onChange={(e) => setArtifactName(e.target.value)}
              placeholder="输入工件名称..."
              className="bg-background border border-border px-2.5 py-1.5 rounded text-xs text-main outline-none focus:border-sky-400 font-sans"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="composer-tags"
              className="text-[10px] uppercase text-muted tracking-wider flex items-center gap-1"
            >
              <TagIcon className="w-3 h-3 text-status-success" />
              <span>分类标签 (空格分隔)</span>
            </label>
            <TagAutocompleteInput
              id="composer-tags"
              value={rawTagsInput}
              onChange={setRawTagsInput}
              allTags={allTags}
              placeholder="形态:webgl 物理:粒子"
              className="w-full bg-background border border-border px-2.5 py-1.5 rounded text-xs text-main outline-none focus:border-emerald-400"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="composer-desc"
              className="text-[10px] uppercase text-muted tracking-wider flex items-center gap-1"
            >
              <MessageSquareQuote className="w-3 h-3 text-status-warn" />
              <span>研判备忘 (选填)</span>
            </label>
            <input
              id="composer-desc"
              type="text"
              value={artifactDesc}
              onChange={(e) => setArtifactDesc(e.target.value)}
              placeholder="简要记录亮点或缺陷..."
              className="bg-background border border-border px-2.5 py-1.5 rounded text-xs text-main outline-none focus:border-amber-400 font-sans"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="bg-status-error-bg border-b border-status-error-border text-status-error px-6 py-2 text-xs font-mono">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* 主编辑与预览区域 */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* 代码编辑区 (移动端依据 Tab 切换，桌面端并列) */}
          {(!isMobileScreen || activeMobileView === 'code') && (
            <div
              className="dark-scope flex-1 flex flex-col bg-code text-main overflow-hidden border-b md:border-b-0 md:border-r border-border"
              onKeyDown={handleEditorKeyDown}
            >
              <div className="h-8 bg-zinc-950/80 border-b border-zinc-800 px-3 flex justify-between items-center text-[11px] font-mono text-zinc-400 shrink-0">
                <span className="flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-status-info" />
                  <span>源码</span>
                </span>
                <span>
                  {lineCount} 行 · {sourceCode.length} 字符
                </span>
              </div>

              <div className="flex-1 overflow-hidden [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto">
                <CodeMirror
                  value={sourceCode}
                  height="100%"
                  theme={oneDark}
                  extensions={[html()]}
                  onChange={(val) => setSourceCode(val)}
                  placeholder="在此粘贴或编写工件 HTML 完整代码..."
                  className="h-full text-xs font-mono"
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    dropCursor: true,
                    allowMultipleSelections: false,
                    indentOnInput: true,
                    bracketMatching: true,
                    closeBrackets: true,
                    autocompletion: false,
                    highlightActiveLine: true,
                    highlightSelectionMatches: true,
                    tabSize: 2,
                  }}
                />
              </div>
            </div>
          )}

          {/* 实时试映沙箱 */}
          {(!isMobileScreen ? showPreview : activeMobileView === 'preview') && (
            <div className="w-full md:w-1/2 flex flex-col bg-black overflow-hidden flex-1">
              <div className="h-8 bg-zinc-950/80 border-b border-zinc-800 px-3 flex items-center justify-between text-[11px] font-mono text-zinc-400 shrink-0">
                <span className="flex items-center gap-1.5 text-status-success">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>实时预览</span>
                </span>
                <span className="text-[10px] text-zinc-500">即时响应代码变动</span>
              </div>

              <div className="flex-1 relative p-3 flex items-center justify-center overflow-hidden">
                <SandboxViewport htmlPayload={sourceCode} isActivated={true} aspectRatio="fill" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
