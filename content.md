收到，发现 Biome 报告了 3 处关于无障碍语义化（a11y）的代码规范错误：`ArtifactCard` 中使用了 `<div role="button">`，以及 `DarkroomModal` 中使用了 `<div role="dialog">` 和在非交互容器上直接绑定 `onClick`。我将生成 Quipu 计划对其进行语义化重构与修复。

## [WIP] fix: 修复画廊卡片与暗房弹窗的 a11y 语义化标签与事件规范

### 错误分析

运行 `biome check --fix --unsafe .` 时捕获了 3 个阻断错误：

1. **`ArtifactCard.tsx` - `lint/a11y/useSemanticElements`**：
   在 `<div>` 上声明了 `role="button"`、`tabIndex={0}` 并手动绑定了键盘与点击事件。根据 ARIA 第一法则与 Biome a11y 规则，能使用原生 HTML 标签的场景严禁使用模拟方案，必须改用原生 `<button type="button">`。
2. **`DarkroomModal.tsx` - `lint/a11y/useSemanticElements`**：
   在外部遮罩层使用了 `<div role="dialog" aria-modal="true">`，触发了语义化替换建议，应使用原生 HTML `<dialog>` 元素。
3. **`DarkroomModal.tsx` - `lint/a11y/useKeyWithClickEvents`**：
   内层模态框容器为防止点击冒泡添加了 `onClick={(e) => e.stopPropagation()}`，但未配置对应的键盘响应事件，导致 a11y 告警。实际上外层点击遮罩只需判断 `e.target === e.currentTarget` 即可实现点击遮罩关闭，无需在子容器上增加阻止冒泡的监听器。

### 用户需求

消除 `pnpm run checkf` 时报告的 3 处 Biome Lint 报错，使组件符合无障碍规范和前端语义化开发要求，保证类型检查与 Lint 检查零错误通过。

### 评论

现代前端开发与代码检查工具（如 Biome、axe）对 ARIA 与语义化标签的检验非常严格。使用原生 `<button>` 可以天然获得 Tab 聚焦和 Enter/Space 触发能力；使用 `e.target === e.currentTarget` 比在内层子节点绑定 `stopPropagation` 更干净且不会污染键盘与事件流。

### 目标

1. 将 `ArtifactCard.tsx` 中的顶层交互容器重构为原生 `<button type="button">`，移除手动模拟的 `role`、`tabIndex` 与 `onKeyDown` 键盘逻辑，并保证样式对齐一致。
2. 将 `DarkroomModal.tsx` 的最外层容器升级为原生 `<dialog open>`，并重置其默认外观样式。
3. 优化模态框遮罩关闭逻辑，使用 `e.target === e.currentTarget` 判断，移除内部容器的 `onClick={(e) => e.stopPropagation()}`，彻底消除 `useKeyWithClickEvents` 报错。

### 基本原理

1. **ARIA 语义替换**：将带有 `role="button"` 的 `div` 改为 `<button type="button">`，并加上 `text-left w-full`，重置默认样式同时保留原有的 flex 布局与微交互阴影。
2. **Dialog 规范**：使用 `<dialog open aria-modal="true">` 替代模拟弹窗，使用 Tailwind 的重置类（`m-0 p-4 border-0 max-w-none max-h-none`）清除浏览器的默认边框与间距，保持既有视觉效果。
3. **事件委托精度化**：点击事件只在外层监听器中处理，当且仅当点击点为外层背景本身时触发 `onClose`，省去内层元素的空事件监听。

### 标签

#intent/fix #flow/ready #priority/high #comp/ui #concept/ui #scope/dx #scope/ux #ai/instruct #task/domain/ui #task/object/a11y-compliance #task/action/bug-fix #task/state/begin #task/status/active

---

### Script

#### Acts 1: 规范化 `ArtifactCard.tsx` 的按钮语义化

将卡片外层包裹层从 `<div role="button">` 改为原生 `<button type="button">`。

~~~~~act
patch_file
src/layer3_gallery/components/ArtifactCard.tsx
~~~~~
~~~~~tsx.old
export const ArtifactCard: React.FC<ArtifactCardProps> = ({ artifact, onOpenDarkroom }) => {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDarkroom(artifact)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDarkroom(artifact);
        }
      }}
      className="bg-surface border border-border rounded overflow-hidden cursor-pointer hover:border-muted hover:-translate-y-0.5 transition-all flex flex-col group focus:outline-none focus:ring-1 focus:ring-muted"
    >
      <div className="w-full aspect-[4/3] bg-background border-b border-border relative overflow-hidden flex items-center justify-center">
~~~~~
~~~~~tsx.new
export const ArtifactCard: React.FC<ArtifactCardProps> = ({ artifact, onOpenDarkroom }) => {
  return (
    <button
      type="button"
      onClick={() => onOpenDarkroom(artifact)}
      className="text-left w-full bg-surface border border-border rounded overflow-hidden cursor-pointer hover:border-muted hover:-translate-y-0.5 transition-all flex flex-col group focus:outline-none focus:ring-1 focus:ring-muted"
    >
      <div className="w-full aspect-[4/3] bg-background border-b border-border relative overflow-hidden flex items-center justify-center">
~~~~~

~~~~~act
patch_file
src/layer3_gallery/components/ArtifactCard.tsx
~~~~~
~~~~~tsx.old
        </div>
      </div>
    </div>
  );
};
~~~~~
~~~~~tsx.new
        </div>
      </div>
    </button>
  );
};
~~~~~

#### Acts 2: 规范化 `DarkroomModal.tsx` 弹窗标签与遮罩交互

使用 `<dialog open>` 替代 `<div role="dialog">`，优化遮罩点击检测并移除内层容器多余的 `onClick`。

~~~~~act
patch_file
src/layer3_gallery/components/DarkroomModal.tsx
~~~~~
~~~~~tsx.old
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-8"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="bg-surface border border-border w-full max-w-7xl h-[92vh] grid grid-cols-1 md:grid-cols-[1fr_420px] rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col bg-background border-r border-border h-full overflow-hidden">
~~~~~
~~~~~tsx.new
  return (
    <dialog
      open
      aria-modal="true"
      className="fixed inset-0 m-0 p-4 md:p-8 w-full h-full max-w-none max-h-none bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center border-0 outline-none text-main"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="bg-surface border border-border w-full max-w-7xl h-[92vh] grid grid-cols-1 md:grid-cols-[1fr_420px] rounded-lg shadow-2xl overflow-hidden"
      >
        <div className="flex flex-col bg-background border-r border-border h-full overflow-hidden">
~~~~~

~~~~~act
patch_file
src/layer3_gallery/components/DarkroomModal.tsx
~~~~~
~~~~~tsx.old
          </div>
        </div>
      </div>
    </div>
  );
};
~~~~~
~~~~~tsx.new
          </div>
        </div>
      </div>
    </dialog>
  );
};
~~~~~

### 下一步建议

1. **执行校验**：计划执行后，在终端再次运行 `pnpm run checkf`，确认 Biome 与 TypeScript 检查均 0 报错通过。
2. **交互体验回归**：在浏览器中打开页面，测试以下交互：
   - 使用键盘 `Tab` 键聚焦画廊中的工件卡片，按 `Enter` 或 `Space` 验证是否能顺畅打开暗房弹窗。
   - 打开暗房后，点击内容区外部暗色背景或按下 `Escape` 键，验证是否能正常关闭弹窗，点击内部操作区时不会被误关闭。
