我将通过调整浮动坞的锚点基准为中心坐标（`-translate-x-1/2`），并增加中心向外平滑展开的过渡动效与点击手柄触发逻辑，让浮动坞在点击或激活时严格以中心轴向两侧对称展开。

## [WIP] feat: 优化浮动坞为中心对称向两侧展开并支持点击触发

### 用户需求
1. 浮动坞展开时不再单向偏向右侧延伸，而是以中心轴为基准，向左右两边平滑对称展开。
2. 强化点击交互：支持点击浮动坞手柄触发展开/收拢。

### 评论
此前浮动坞由于使用绝对坐标的左上角作为变换基准（`position.x` 直接作为容器 `left`），在内容变宽时容器右移导致了“向右偏向展开”的视觉不对称。改用以水平中心为锚点（`-translate-x-1/2`）并在点击手柄时结合中心微动效展开，符合人机工学和对称美学，操作反馈更加自然。

### 目标
1. 将浮动坞的变换基准重构为中心锚点：无论手柄是收起态还是展开态，均保持水平居中对齐。
2. 增加点击与拖拽判定的分离，支持直接点击手柄切换展开与收起。
3. 增加中心向两侧展开的平滑尺寸与透明度动画。

### 基本原理
- **对称几何锚点**：给浮动坞外层容器添加 CSS `transform: translate3d(-50%, 0, 0)`（结合 Tailwind 的 `-translate-x-1/2`），使得整个组件的 `left` 位置代表其水平对称轴。当内部宽度从 80px 扩大至操作面板全宽时，左右两翼各扩展相等宽度，实现“从中间向两边展开”。
- **手势消抖判定**：记录 `pointerDown` 坐标并在 `pointerUp` 计算位移差，位移微弱时触发点击切换，避免拖动操作时误触展开。

### 标签
#intent/refine #flow/ready #priority/medium #comp/ui #concept/ui #scope/ux #ai/instruct #task/domain/ui #task/object/floating-control-dock #task/action/animation-tuning #task/state/continue

---

### Script

#### Acts 1: 重构 FullscreenStage 中的浮动坞锚点与对称展开动画

修改 `src/layer3_gallery/components/FullscreenStage.tsx`：
1. 重构初始坐标与边界判定，以中心 X 轴为基准；
2. 增加点击判定，点击手柄可直接切换展开/收起；
3. 容器应用 `-translate-x-1/2` 并添加向两侧延展的平滑过渡动画。

~~~~~act
patch_file
src/layer3_gallery/components/FullscreenStage.tsx
~~~~~
~~~~~typescript.old
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 - 130 : 200,
    y: 0,
  });

  const isDraggingRef = useRef<boolean>(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const captureHandleRef = useRef<(() => Promise<Blob>) | null>(null);
  const stageContainerRef = useRef<HTMLDivElement>(null);
~~~~~
~~~~~typescript.new
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 300,
    y: 0,
  });

  const isDraggingRef = useRef<boolean>(false);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const captureHandleRef = useRef<(() => Promise<Blob>) | null>(null);
  const stageContainerRef = useRef<HTMLDivElement>(null);
~~~~~

~~~~~act
patch_file
src/layer3_gallery/components/FullscreenStage.tsx
~~~~~
~~~~~typescript.old
  // 拖拽手柄移动处理
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const maxX = window.innerWidth - 260;
    const maxY = window.innerHeight - 60;
    const nextX = Math.max(10, Math.min(maxX, e.clientX - dragOffsetRef.current.x));
    const nextY = Math.max(0, Math.min(maxY, e.clientY - dragOffsetRef.current.y));
    setPosition({ x: nextX, y: nextY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // 容错处理
    }
  };
~~~~~
~~~~~typescript.new
  // 拖拽手柄与点击处理
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    isDraggingRef.current = true;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDraggingRef.current) return;
    // 限制中心点在视口边缘内，确保两侧展开后不完全出界
    const minX = 140;
    const maxX = window.innerWidth - 140;
    const maxY = window.innerHeight - 50;
    const nextX = Math.max(minX, Math.min(maxX, e.clientX - dragOffsetRef.current.x));
    const nextY = Math.max(0, Math.min(maxY, e.clientY - dragOffsetRef.current.y));
    setPosition({ x: nextX, y: nextY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isDraggingRef.current) {
      const deltaX = Math.abs(e.clientX - dragStartPosRef.current.x);
      const deltaY = Math.abs(e.clientY - dragStartPosRef.current.y);
      // 位移小于 4px 视作点击，切换展开/收拢
      if (deltaX < 4 && deltaY < 4) {
        setIsExpanded((prev) => !prev);
      }
    }
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // 容错处理
    }
  };
~~~~~

~~~~~act
patch_file
src/layer3_gallery/components/FullscreenStage.tsx
~~~~~
~~~~~typescript.old
      {/* 仿虚拟机悬浮浮动坞 (VM-like Floating Dock) */}
      <div
        style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
        className="absolute top-0 left-0 z-50 transition-all duration-150 ease-out flex flex-col items-center"
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => {
          if (!isDraggingRef.current) {
            setIsExpanded(false);
          }
        }}
      >
        {/* 默认常态下的微光收起细线/拉手 */}
        <div
          role="presentation"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={`flex items-center justify-center cursor-grab active:cursor-grabbing transition-all duration-300 ${
            isExpanded
              ? 'h-3 w-28 bg-zinc-700/80 rounded-t-md'
              : 'h-1.5 w-20 bg-zinc-400/40 hover:bg-zinc-200/80 rounded-full my-1 shadow-[0_0_8px_rgba(255,255,255,0.2)]'
          }`}
          title="按住拖拽移动，鼠标悬浮展开控制坞"
        >
          {isExpanded && <GripHorizontal className="w-3.5 h-3.5 text-zinc-400" />}
        </div>

        {/* 展开后的控制面板 */}
        {isExpanded && (
          <div className="flex items-center gap-1.5 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 px-3 py-1.5 rounded-b-lg shadow-2xl text-xs font-mono text-zinc-200 animate-in fade-in slide-in-from-top-1">
            <span
              className="text-[11px] text-zinc-400 max-w-[130px] truncate mr-1.5"
              title={artifact.meta.name}
            >
              {artifact.meta.name}
            </span>

            <button
              type="button"
              onClick={handleCapturePoster}
              className="p-1.5 hover:bg-zinc-800 rounded transition-colors text-zinc-300 hover:text-white"
              title="定格封印当前帧"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onOpenDarkroom(artifact)}
              className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors text-[11px] text-zinc-200"
              title="打开差量暗房 (Negative Chain)"
            >
              <Code2 className="w-3.5 h-3.5 text-sky-400" />
              <span>暗房</span>
            </button>

            <button
              type="button"
              onClick={handleToggleNativeFullscreen}
              className="p-1.5 hover:bg-zinc-800 rounded transition-colors text-zinc-300 hover:text-white"
              title={isNativeFullscreen ? '退出系统真实全屏' : '进入系统真实全屏'}
            >
              {isNativeFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors text-[11px]"
              title="退出全屏展演 (按 Esc)"
            >
              <X className="w-3.5 h-3.5" />
              <span>退出 (Esc)</span>
            </button>
          </div>
        )}

        {/* 状态轻提示 */}
        {statusMessage && (
          <div className="mt-2 bg-black/80 border border-zinc-700 text-[11px] text-zinc-300 px-2 py-1 rounded shadow-lg pointer-events-none">
            {statusMessage}
          </div>
        )}
      </div>
~~~~~
~~~~~typescript.new
      {/* 仿虚拟机悬浮浮动坞 (VM-like Floating Dock，以中心点为对称轴向两侧展开) */}
      <div
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
        }}
        className="absolute -translate-x-1/2 z-50 flex flex-col items-center select-none"
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => {
          if (!isDraggingRef.current) {
            setIsExpanded(false);
          }
        }}
      >
        {/* 顶部微光可拖拽/可点击拉手（原生 button，键盘无障碍友好） */}
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={`flex items-center justify-center cursor-grab active:cursor-grabbing border-0 outline-none p-0 transition-all duration-300 ease-out origin-center ${
            isExpanded
              ? 'h-3 w-32 bg-zinc-700/90 rounded-t-md'
              : 'h-1.5 w-20 bg-zinc-300/40 hover:bg-zinc-200/90 hover:h-2 rounded-full my-1 shadow-[0_0_10px_rgba(255,255,255,0.3)]'
          }`}
          title="点击展开/收起，按住拖动位置"
        >
          {isExpanded && <GripHorizontal className="w-3.5 h-3.5 text-zinc-400" />}
        </button>

        {/* 从中间向两边对称展开的控制面板 */}
        <div
          className={`transition-all duration-300 ease-out origin-center overflow-hidden flex flex-col items-center ${
            isExpanded
              ? 'max-w-xl opacity-100 scale-100'
              : 'max-w-0 opacity-0 scale-95 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-1.5 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 px-3 py-1.5 rounded-b-lg shadow-2xl text-xs font-mono text-zinc-200 whitespace-nowrap">
            <span
              className="text-[11px] text-zinc-400 max-w-[140px] truncate mr-1.5"
              title={artifact.meta.name}
            >
              {artifact.meta.name}
            </span>

            <button
              type="button"
              onClick={handleCapturePoster}
              className="p-1.5 hover:bg-zinc-800 rounded transition-colors text-zinc-300 hover:text-white"
              title="定格封印当前帧"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onOpenDarkroom(artifact)}
              className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors text-[11px] text-zinc-200"
              title="打开差量暗房 (Negative Chain)"
            >
              <Code2 className="w-3.5 h-3.5 text-sky-400" />
              <span>暗房</span>
            </button>

            <button
              type="button"
              onClick={handleToggleNativeFullscreen}
              className="p-1.5 hover:bg-zinc-800 rounded transition-colors text-zinc-300 hover:text-white"
              title={isNativeFullscreen ? '退出系统真实全屏' : '进入系统真实全屏'}
            >
              {isNativeFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors text-[11px]"
              title="退出全屏展演 (按 Esc)"
            >
              <X className="w-3.5 h-3.5" />
              <span>退出 (Esc)</span>
            </button>
          </div>
        </div>

        {/* 状态轻提示 */}
        {statusMessage && (
          <div className="mt-2 bg-black/85 border border-zinc-700 text-[11px] text-zinc-300 px-2.5 py-1 rounded shadow-lg pointer-events-none whitespace-nowrap animate-in fade-in">
            {statusMessage}
          </div>
        )}
      </div>
~~~~~

### 下一步建议
1. 在全屏展演下点击顶部微光细线，观察其是否以中心为对称轴向左右两端展开。
2. 尝试拖拽浮动坞至屏幕中央或偏侧位置，验证点击展开时中心锚点是否均能平滑对齐。
