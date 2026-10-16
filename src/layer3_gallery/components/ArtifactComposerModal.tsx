import { SandboxViewport } from '@/layer1_sandbox/SandboxViewport';
import { TitleSanitizerEngine } from '@/layer2_darkroom/engine/title-sanitizer';
import { TagAutocompleteInput } from '@/layer3_gallery/components/TagAutocompleteInput';
import {
  Code2,
  Eye,
  EyeOff,
  FileCode,
  Layers,
  Save,
  Sparkles,
  Tag as TagIcon,
  X,
} from 'lucide-react';
import type React from 'react';
import { useMemo, useRef, useState } from 'react';

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
  }) => Promise<void>;
}

export const ArtifactComposerModal: React.FC<ArtifactComposerModalProps> = ({
  initialCode,
  existingFilenames,
  allTags = [],
  onClose,
  onSave,
}) => {
  const [sourceCode, setSourceCode] = useState<string>(initialCode);
  const [artifactName, setArtifactName] = useState<string>(() =>
    TitleSanitizerEngine.extractTitle(initialCode),
  );
  const [filename, setFilename] = useState<string>(() => {
    const extracted = TitleSanitizerEngine.extractTitle(initialCode);
    const candidateFile = TitleSanitizerEngine.toSafeHtmlFilename(extracted);
    return TitleSanitizerEngine.deduplicateFilename(candidateFile, existingFilenames);
  });
  const [rawTagsInput, setRawTagsInput] = useState<string>('形态:原生html 状态:新建');
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 修改工件名时，联动更新安全文件名建议
  const handleNameChange = (val: string) => {
    setArtifactName(val);
    const candidate = TitleSanitizerEngine.toSafeHtmlFilename(val);
    const unique = TitleSanitizerEngine.deduplicateFilename(candidate, existingFilenames);
    setFilename(unique);
  };

  // 支持 Tab 键缩进 2 空格
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const nextCode = `${sourceCode.substring(0, start)}  ${sourceCode.substring(end)}`;
      setSourceCode(nextCode);

      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }

    // Ctrl+S 或 Cmd+S 触发保存
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handlePerformSave();
    }
  };

  // 代码行数统计与行号映射
  const lineCount = useMemo(() => {
    return sourceCode.split('\n').length;
  }, [sourceCode]);

  // 提交保存落盘
  const handlePerformSave = async () => {
    if (!artifactName.trim()) {
      setErrorMsg('工件名称不能为空');
      return;
    }
    if (!filename.trim()) {
      setErrorMsg('物理文件名不能为空');
      return;
    }
    if (!sourceCode.trim()) {
      setErrorMsg('工件源码内容不能为空');
      return;
    }

    const safeFile = TitleSanitizerEngine.toSafeHtmlFilename(filename);
    const parsedTags = rawTagsInput
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      setIsSaving(true);
      setErrorMsg('');
      await onSave({
        filename: safeFile,
        content: sourceCode,
        name: artifactName.trim(),
        tags: parsedTags,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`保存失败: ${msg}`);
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 select-none animate-in fade-in">
      <div className="w-full max-w-6xl h-[90vh] bg-surface border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden text-main">
        {/* 顶部标题栏 */}
        <header className="h-14 bg-background border-b border-border px-4 md:px-6 flex justify-between items-center gap-4 shrink-0 font-mono text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-sky-500/10 border border-sky-500/30 text-sky-400 rounded">
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
            <button
              type="button"
              onClick={() => setShowPreview((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded hover:bg-surface transition-colors text-muted hover:text-main text-[11px]"
              title="折叠/展开实时预览"
            >
              {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showPreview ? '隐藏预览' : '显示预览'}</span>
            </button>

            <button
              type="button"
              disabled={isSaving}
              onClick={handlePerformSave}
              className="flex items-center gap-1.5 bg-main text-surface px-4 py-1.5 rounded font-semibold text-xs hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? '正在保存...' : '保存工件 (REV:1)'}</span>
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

        {/* 元属性配置表单栏 */}
        <div className="bg-surface border-b border-border p-3 md:px-6 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="composer-artifact-name"
              className="text-[10px] uppercase text-muted tracking-wider flex items-center gap-1"
            >
              <FileCode className="w-3 h-3 text-sky-400" />
              <span>工件名称</span>
            </label>
            <input
              id="composer-artifact-name"
              type="text"
              value={artifactName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="输入工件名称..."
              className="bg-background border border-border px-2.5 py-1.5 rounded text-xs text-main outline-none focus:border-sky-400 font-sans"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="composer-filename"
              className="text-[10px] uppercase text-muted tracking-wider flex items-center gap-1"
            >
              <Layers className="w-3 h-3 text-amber-400" />
              <span>保存文件名 (.html)</span>
            </label>
            <input
              id="composer-filename"
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="example.html"
              className="bg-background border border-border px-2.5 py-1.5 rounded text-xs text-main outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="composer-tags"
              className="text-[10px] uppercase text-muted tracking-wider flex items-center gap-1"
            >
              <TagIcon className="w-3 h-3 text-emerald-400" />
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
        </div>

        {errorMsg && (
          <div className="bg-red-500/10 border-b border-red-500/30 text-red-400 px-6 py-2 text-xs font-mono">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* 主编辑与预览区域 */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* 左侧代码编辑区 */}
          <div className="flex-1 flex flex-col bg-code text-zinc-300 overflow-hidden border-b md:border-b-0 md:border-r border-border">
            <div className="h-8 bg-zinc-950/80 border-b border-zinc-800 px-3 flex justify-between items-center text-[11px] font-mono text-zinc-400 shrink-0">
              <span className="flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-sky-400" />
                <span>HTML / WebGL / Canvas 单文件源码</span>
              </span>
              <span>
                {lineCount} 行 · {sourceCode.length} 字符 · 支持 Tab 缩进
              </span>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* 行号槽 */}
              <div
                className="w-12 bg-zinc-950/60 border-r border-zinc-800/80 py-3 text-right pr-2.5 text-zinc-600 font-mono text-[11px] select-none overflow-hidden leading-relaxed"
                aria-hidden="true"
              >
                {Array.from({ length: Math.min(lineCount, 500) }).map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 行号渲染静态索引
                  <div key={i}>{i + 1}</div>
                ))}
              </div>

              {/* 源码文本域 */}
              <textarea
                ref={textareaRef}
                value={sourceCode}
                onChange={(e) => setSourceCode(e.target.value)}
                onKeyDown={handleKeyDown}
                spellCheck={false}
                placeholder="在此粘贴或编写工件 HTML 完整代码..."
                className="flex-1 bg-transparent p-3 font-mono text-xs text-zinc-200 outline-none resize-none leading-relaxed overflow-y-auto selection:bg-sky-500/30"
              />
            </div>
          </div>

          {/* 右侧实时试映沙箱 */}
          {showPreview && (
            <div className="w-full md:w-1/2 flex flex-col bg-black overflow-hidden">
              <div className="h-8 bg-zinc-950/80 border-b border-zinc-800 px-3 flex items-center justify-between text-[11px] font-mono text-zinc-400 shrink-0">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>实时预览</span>
                </span>
                <span className="text-[10px] text-zinc-500">代码变动即时更新</span>
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
