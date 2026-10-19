import { TagQueryEngine, type TagSuggestion } from '@/core/engine/tag-engine';
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from '@floating-ui/react';
import { ChevronRight, Folder, Hash, Tag as TagIcon } from 'lucide-react';
import type React from 'react';
import { useCallback, useRef, useState } from 'react';

interface TagAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  allTags: string[];
  placeholder?: string;
  className?: string;
  id?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelectTag?: (tag: string) => void;
}

export const TagAutocompleteInput: React.FC<TagAutocompleteInputProps> = ({
  value,
  onChange,
  allTags,
  placeholder,
  className,
  id,
  onKeyDown,
  onSelectTag,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<(HTMLButtonElement | null)[]>([]);

  // 计算建议列表
  const updateSuggestions = useCallback(
    (currentVal: string, cursorIndex: number) => {
      const tokenInfo = TagQueryEngine.extractCursorToken(currentVal, cursorIndex);
      const list = TagQueryEngine.getSuggestions(allTags, tokenInfo);
      setSuggestions(list);
      setActiveIndex(null);
      return list;
    },
    [allTags],
  );

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    whileElementsMounted: autoUpdate,
    placement: 'bottom-start',
    middleware: [
      offset(5),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, {
            minWidth: `${Math.max(rects.reference.width, 240)}px`,
            maxWidth: '420px',
          });
        },
        padding: 8,
      }),
    ],
  });

  const role = useRole(context, { role: 'listbox' });
  const dismiss = useDismiss(context);
  const listNav = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    virtual: true,
    loop: true,
  });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    role,
    dismiss,
    listNav,
  ]);

  // 应用候选词至光标所在 Token 区域
  const applySuggestion = useCallback(
    (item: TagSuggestion) => {
      const input = inputRef.current;
      const cursor = input?.selectionStart ?? value.length;
      const tokenInfo = TagQueryEngine.extractCursorToken(value, cursor);

      const before = value.slice(0, tokenInfo.startIndex);
      const after = value.slice(tokenInfo.endIndex);

      // 如果补全的是命名空间前缀（以:结尾），不加末尾空格，以便用户紧接着输入值
      const isNs = item.insertText.endsWith(':');
      const replacement = isNs ? item.insertText : `${item.insertText} `;
      const nextValue = `${before}${replacement}${after}`;

      onChange(nextValue);

      requestAnimationFrame(() => {
        if (input) {
          const nextCursor = before.length + replacement.length;
          input.focus();
          input.setSelectionRange(nextCursor, nextCursor);
          // 在光标就位后，无缝计算新位置对应的标签建议并保持唤起
          const list = updateSuggestions(nextValue, nextCursor);
          setIsOpen(list.length > 0);
        }
      });
    },
    [value, onChange, updateSuggestions],
  );

  // 统一的确认/选定动作（兼顾单标签选择模式与多词补全模式）
  const handleCommitSuggestion = useCallback(
    (item: TagSuggestion) => {
      if (onSelectTag) {
        if (item.type === 'namespace') {
          const cleanTag = item.insertText.replace(/^-/, '').trim();
          onChange(cleanTag);
          requestAnimationFrame(() => {
            if (inputRef.current) {
              inputRef.current.focus();
              inputRef.current.setSelectionRange(cleanTag.length, cleanTag.length);
              const list = updateSuggestions(cleanTag, cleanTag.length);
              setIsOpen(list.length > 0);
            }
          });
        } else {
          const cleanTag = item.insertText.replace(/^-/, '').trim();
          onSelectTag(cleanTag);
          onChange('');
          setActiveIndex(null);
          // 提交后保持输入框聚焦，并立即基于空文本刷新候选列表，持续展开以支持批量连续添加
          requestAnimationFrame(() => {
            if (inputRef.current) {
              inputRef.current.focus();
              const list = updateSuggestions('', 0);
              setIsOpen(list.length > 0);
            }
          });
        }
      } else {
        applySuggestion(item);
      }
    },
    [onSelectTag, onChange, updateSuggestions, applySuggestion],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    onChange(nextVal);
    const cursor = e.target.selectionStart ?? nextVal.length;
    const list = updateSuggestions(nextVal, cursor);
    setIsOpen(list.length > 0);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // 1. 如果用户使用上下键明确高亮了某个候选建议
      if (isOpen && suggestions.length > 0 && activeIndex !== null) {
        const targetItem = suggestions[activeIndex];
        if (targetItem) {
          e.preventDefault();
          e.stopPropagation();
          handleCommitSuggestion(targetItem);
          return;
        }
      }

      // 2. 单标签直达选择模式：若输入框已有文本，回车直接提交此标签并持续保持浮层展开
      if (onSelectTag) {
        const trimmed = value.trim();
        if (trimmed) {
          e.preventDefault();
          e.stopPropagation();
          onSelectTag(trimmed);
          onChange('');
          setActiveIndex(null);
          requestAnimationFrame(() => {
            if (inputRef.current) {
              inputRef.current.focus();
              const list = updateSuggestions('', 0);
              setIsOpen(list.length > 0);
            }
          });
          return;
        }
      } else if (isOpen && suggestions.length > 0) {
        // 多词查询模式：未高亮时回车默认应用第 0 项补全
        const targetItem = suggestions[0];
        if (targetItem) {
          e.preventDefault();
          e.stopPropagation();
          applySuggestion(targetItem);
          return;
        }
      }
    } else if (e.key === 'Tab') {
      if (isOpen && suggestions.length > 0) {
        const targetIndex = activeIndex !== null ? activeIndex : 0;
        if (suggestions[targetIndex]) {
          e.preventDefault();
          e.stopPropagation();
          handleCommitSuggestion(suggestions[targetIndex]);
          return;
        }
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
        return;
      }
    }

    onKeyDown?.(e);
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const cursor = e.target.selectionStart ?? value.length;
    const list = updateSuggestions(value, cursor);
    if (list.length > 0) {
      setIsOpen(true);
    }
  };

  const handleInputClick = (e: React.MouseEvent<HTMLInputElement>) => {
    const cursor = (e.target as HTMLInputElement).selectionStart ?? value.length;
    const list = updateSuggestions(value, cursor);
    if (list.length > 0) {
      setIsOpen(true);
    }
  };

  // 同步 input 元素引用
  const setCombinedRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      refs.setReference(node);
    },
    [refs],
  );

  return (
    <div className="relative w-full">
      <input
        ref={setCombinedRef}
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className={className}
        {...getReferenceProps({
          onChange: handleInputChange,
          onKeyDown: handleInputKeyDown,
          onFocus: handleInputFocus,
          onClick: handleInputClick,
        })}
      />

      {isOpen && suggestions.length > 0 && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-50 bg-surface border border-border rounded-lg shadow-2xl p-1 text-xs font-mono text-main overflow-hidden select-none animate-in fade-in zoom-in-95 duration-150"
            {...getFloatingProps({
              onMouseDown: (e) => {
                // 防止点击面板滚动条或内边距区域时输入框失焦
                e.preventDefault();
              },
            })}
          >
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted border-b border-border flex justify-between items-center mb-0.5">
              <span>标签建议 (↑↓ 移动 · 回车上屏)</span>
              <span>{suggestions.length} 项</span>
            </div>

            <div className="max-h-60 overflow-y-auto flex flex-col gap-0.5">
              {suggestions.map((item, index) => {
                const isActive = activeIndex === index;
                return (
                  <button
                    key={`${item.type}_${item.insertText}_${item.displayText}`}
                    ref={(node) => {
                      listRef.current[index] = node;
                    }}
                    type="button"
                    tabIndex={-1}
                    className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer outline-none ${
                      isActive
                        ? 'bg-status-info-bg text-status-info border border-status-info-border'
                        : 'hover:bg-surface-subtle text-main border border-transparent'
                    }`}
                    {...getItemProps({
                      onClick: (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleCommitSuggestion(item);
                      },
                      onMouseDown: (e) => {
                        // 阻止输入框失焦以保护光标位置
                        e.preventDefault();
                      },
                    })}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {item.type === 'namespace' ? (
                        <Folder className="w-3.5 h-3.5 text-status-warn shrink-0" />
                      ) : item.type === 'value' ? (
                        <Hash className="w-3.5 h-3.5 text-status-info shrink-0" />
                      ) : (
                        <TagIcon className="w-3.5 h-3.5 text-status-success shrink-0" />
                      )}

                      <span className="truncate font-medium">{item.displayText}</span>

                      {item.subText && (
                        <span className="text-[10px] text-muted truncate">({item.subText})</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 text-[11px] text-muted">
                      {item.count !== undefined && item.count > 0 && (
                        <span className="bg-tag px-1.5 py-0.2 rounded text-[10px] text-muted border border-border">
                          {item.count}
                        </span>
                      )}
                      {item.type === 'namespace' && <ChevronRight className="w-3 h-3 text-muted" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </FloatingPortal>
      )}
    </div>
  );
};
