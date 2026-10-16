我将为你实现智能四边缘磁吸贴边机制（Edge Snapping）与自适应排版：松手时自动吸附至最近的屏幕边缘；吸附至左右侧边时自动转为竖线与竖排版面板；吸附至下边缘时自动向上展开。

## [WIP] feat: 实现浮动坞四边缘磁吸自适应与横竖版排版切换

### 用户需求
1. 浮动坞拖拽松手后，自动计算并平滑贴回到屏幕最近的边缘（上/下/左/右）。
2. 在左边缘或右边缘吸附时，未展开手柄转为竖线，展开后的控制面板自动转为垂直竖排版。
3. 在下边缘吸附时，控制面板由下至上向上展开。

### 评论
将虚拟机的悬浮坞理念升级为现代桌面级边缘吸附系统（类似 iPadOS 悬浮球或专业工作站停靠坞），不仅解决了全屏工件下中央视觉干扰的问题，还充分利用了左右窄边与下边缘的空隙，使沉浸全屏与控制坞共存更加协调。

### 目标
1. 建立四边缘状态模型 (`top` | `bottom` | `left` | `right`)，在拖拽释放瞬间计算距离四边最小欧几里得距离，执行弹簧吸附定位。
2. 针对横版边缘（上/下）与竖版边缘（左/右），分别提供水平向两侧展开与垂直向上下展开的流体动效。
3. 针对下边缘实现反向向上弹出的布局反转 (`flex-col-reverse` / `-translate-y-full`)。

### 基本原理
- **最小距离边缘检测 (Edge Snapping)**：在 `pointerUp` 时检测 `e.clientX` 与 `e.clientY` 到窗口视口上下左右四界的距离：
  $$\min(y, H - y, x, W - x)$$
  动态确定目标边缘，并将坐标钳制在安全可视区域内。
- **动态形态转换 (Morphing UI)**：
  - 上下边缘：手柄呈 `w-20 h-1.5`，控制面板为 `flex-row` 水平排版。
  - 左右边缘：手柄呈 `w-1.5 h-20`，控制面板自动切换为 `flex-col` 紧凑竖排版。
- **平滑磁吸动画**：在拖动中关闭坐标 transition 保障跟随性能，在松手磁吸时开启 `transition-all duration-300 ease-out` 呈现自然吸附效果。

### 标签
#intent/build #flow/ready #priority/high #comp/ui #concept/ui #scope/ux #ai/instruct #task/domain/ui #task/object/floating-control-dock #task/action/edge-snapping #task/state/continue

---

### Script

#### Acts 1: 重构 FullscreenStage 实现四向边缘磁吸与自适应横竖排版

修改 `src/layer3_gallery/components/FullscreenStage.tsx`，引入 `DockEdge` 模型、松手磁吸算法、形态自适应手柄与横竖排版渲染。

~~~~~act
patch_file
src/layer3_gallery/components/FullscreenStage.tsx
~~~~~
~~~~~typescript.old
interface FullscreenStageProps {
  artifact: Artifact | null;
  onClose: () => void;
  onOpenDarkroom: (artifact: Artifact) => void;
  onUpdateArtifact: (updated: Artifact) => void;
}

export const FullscreenStage: React.FC<FullscreenStageProps> = ({
  artifact,
  onClose,
  onOpenDarkroom,
  onUpdateArtifact,
}) => {
  if (!artifact) return null;

  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
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
~~~~~typescript.new
type DockEdge = 'top' | 'bottom' | 'left' | 'right';

interface FullscreenStageProps {
  artifact: Artifact | null;
  onClose: () => void;
  onOpenDarkroom: (artifact: Artifact) => void;
  onUpdateArtifact: (updated: Artifact) => void;
}

export const FullscreenStage: React.FC<FullscreenStageProps> = ({
  artifact,
  onClose,
  onOpenDarkroom,
  onUpdateArtifact,
}) => {
  if (!artifact) return null;

  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [dockEdge, setDockEdge] = useState<DockEdge>('top');
  const [isDragging, setIsDragging] = useState<boolean>(false);
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
~~~~~typescript.new
  // 拖拽手柄移动与边缘磁吸处理
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDraggingRef.current) return;
    const nextX = e.clientX - dragOffsetRef.current.x;
    const nextY = e.clientY - dragOffsetRef.current.y;
    setPosition({ x: nextX, y: nextY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isDraggingRef.current) {
      const deltaX = Math.abs(e.clientX - dragStartPosRef.current.x);
      const deltaY = Math.abs(e.clientY - dragStartPosRef.current.y);

      // 位移小于 5px 视作点击切换展开/收拢
      if (deltaX < 5 && deltaY < 5) {
        setIsExpanded((prev) => !prev);
      } else {
        // 计算最近的屏幕边缘实现自动吸附
        const w = window.innerWidth;
        const h = window.innerHeight;
        const curX = e.clientX;
        const curY = e.clientY;

        const distTop = curY;
        const distBottom = h - curY;
        const distLeft = curX;
        const distRight = w - curX;

        const minDist = Math.min(distTop, distBottom, distLeft, distRight);

        if (minDist === distTop) {
          setDockEdge('top');
          setPosition({ x: Math.max(160, Math.min(w - 160, curX)), y: 0 });
        } else if (minDist === distBottom) {
          setDockEdge('bottom');
          setPosition({ x: Math.max(160, Math.min(w - 160, curX)), y: h });
        } else if (minDist === distLeft) {
          setDockEdge('left');
          setPosition({ x: 0, y: Math.max(120, Math.min(h - 120, curY)) });
        } else {
          setDockEdge('right');
          setPosition({ x: w, y: Math.max(120, Math.min(h - 120, curY)) });
        }
      }
    }

    isDraggingRef.current = false;
    setIsDragging(false);
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
~~~~~typescript.new
      {/* 仿虚拟机悬浮浮动坞：支持四向边缘自适应吸附与横/竖排版 */}
      <div
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
        }}
        className={`absolute z-50 select-none flex items-center ${
          isDragging ? '' : 'transition-all duration-300 ease-out'
        } ${
          dockEdge === 'top'
            ? '-translate-x-1/2 flex-col'
            : dockEdge === 'bottom'
              ? '-translate-x-1/2 -translate-y-full flex-col-reverse'
              : dockEdge === 'left'
                ? '-translate-y-1/2 flex-row'
                : '-translate-x-full -translate-y-1/2 flex-row-reverse'
        }`}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => {
          if (!isDraggingRef.current) {
            setIsExpanded(false);
          }
        }}
      >
        {/* 边缘自适应微光拉手：横边为横线，竖边为竖线 */}
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={`flex items-center justify-center cursor-grab active:cursor-grabbing border-0 outline-none p-0 transition-all duration-300 ease-out origin-center ${
            dockEdge === 'top' || dockEdge === 'bottom'
              ? isExpanded
                ? 'h-3 w-32 bg-zinc-700/90 rounded-md my-0.5'
                : 'h-1.5 w-20 bg-zinc-300/40 hover:bg-zinc-200/90 hover:h-2 rounded-full my-1 shadow-[0_0_10px_rgba(255,255,255,0.3)]'
              : isExpanded
                ? 'w-3 h-32 bg-zinc-700/90 rounded-md mx-0.5'
                : 'w-1.5 h-20 bg-zinc-300/40 hover:bg-zinc-200/90 hover:w-2 rounded-full mx-1 shadow-[0_0_10px_rgba(255,255,255,0.3)]'
          }`}
          title="点击展开/收起，按住拖拽自动贴附到最近边缘"
        >
          {isExpanded && (
            <GripHorizontal
              className={`w-3.5 h-3.5 text-zinc-400 ${
                dockEdge === 'left' || dockEdge === 'right' ? 'rotate-90' : ''
              }`}
            />
          )}
        </button>

        {/* 展开面板：横版边缘（上/下）为水平排版，竖版边缘（左/右）为垂直竖排版 */}
        <div
          className={`transition-all duration-300 ease-out origin-center overflow-hidden flex items-center justify-center ${
            dockEdge === 'top' || dockEdge === 'bottom'
              ? isExpanded
                ? 'max-w-xl opacity-100 scale-100'
                : 'max-w-0 opacity-0 scale-95 pointer-events-none'
              : isExpanded
                ? 'max-h-[380px] opacity-100 scale-100'
                : 'max-h-0 opacity-0 scale-95 pointer-events-none'
          }`}
        >
          {dockEdge === 'top' || dockEdge === 'bottom' ? (
            /* 横向控制面板（在上下边缘呈现） */
            <div className="flex items-center gap-1.5 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 px-3 py-1.5 rounded-lg shadow-2xl text-xs font-mono text-zinc-200 whitespace-nowrap">
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
          ) : (
            /* 纵向竖排版控制面板（在左右边缘呈现） */
            <div className="flex flex-col items-center gap-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 p-2 rounded-lg shadow-2xl text-xs font-mono text-zinc-200">
              <span
                className="text-[10px] text-zinc-400 w-12 truncate text-center"
                title={artifact.meta.name}
              >
                {artifact.meta.name}
              </span>

              <div className="w-full h-px bg-zinc-700/60" />

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
                className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors text-zinc-200"
                title="打开差量暗房 (Negative Chain)"
              >
                <Code2 className="w-3.5 h-3.5 text-sky-400" />
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
                className="p-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors"
                title="退出全屏展演 (按 Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* 状态轻提示 */}
        {statusMessage && (
          <div className="absolute top-full mt-2 bg-black/85 border border-zinc-700 text-[11px] text-zinc-300 px-2.5 py-1 rounded shadow-lg pointer-events-none whitespace-nowrap animate-in fade-in">
            {statusMessage}
          </div>
        )}
      </div>
~~~~~

### 下一步建议
1. 在全屏展演中尝试将手柄拖拽到屏幕的**左边缘**或**右边缘**，松开鼠标后验证其是否自动磁吸为竖线，展开后是否呈现优雅的垂直紧凑竖排版。
2. 将手柄拖拽至屏幕**下边缘**，松开鼠标后验证其是否自动吸附到底部，并在点击或悬浮时自动由下至上向上弹出展开。
