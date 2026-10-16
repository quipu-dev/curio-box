# 📦 curio-box

> **视觉工件画廊与镜像暗房**
> A Local-First Visual Artifact Gallery & Negative Darkroom.

`curio-box` 是一个专为由 AI（如 Claude Artifacts、ChatGPT Canvas）或创意开发者生成的**单文件 HTML 视觉/交互工件**（Canvas、WebGL、Three.js、SVG 等）打造的本地优先（Local-First）展演与演进工作台。

无需任何后端依赖，直接挂载你的本地工件目录，享受沉浸式放映、无损帧定格、AI 差量注入以及不可变“底片链”版本追踪。

---

## ✨ 核心特性

### 1. 🖼️ 活体展演画廊 (Visual Gallery)
* **本地磁盘直读**：基于浏览器原生 **File System Access API** 直连本地文件夹，零上传，隐私绝对安全。
* **状态持久化与免密重连**：使用 **IndexedDB** 固化目录句柄（DirectoryHandle），刷新页面后支持“一键重连”恢复访问权限。
* **大众分类法（Folksonomy）**：支持命名空间与排除语法的极速检索，例如输入：`形态:webgl 物理:流体 -风格:粗野`。

### 2. 🎛️ 沉浸式放映舞台 (Fullscreen Stage)
* **多画幅适配**：支持自由铺满、16:9、4:3、1:1 等多种比例沙箱环境。
* **自适应磁吸悬浮坞 (Floating Dock)**：
  * 支持任意拖拽，松手自动按欧氏距离磁吸附至屏幕 **上 / 下 / 左 / 右** 四向边缘。
  * **方向响应式排版**：吸附至上下边呈横向控制栏；吸附至左右边自动转为纵向精简控制列。

### 3. 🎞️ 镜像暗房与底片链 (Negative Chain)
* **单文件专用微版本控制**：
  * 自动在工件根目录生成 `.gallery/` 规范化元数据与底片库。
  * **Genesis（创世）**：初次载入自动固化 `REV:1` 原生底片。
  * **Checkout（检视态试映）**：在沙箱中只读运行任意历史版本，**零磁盘 I/O 开销**，杜绝污染物理文件。
  * **Rollback（前向推进式还原）**：非破坏性回滚，将历史底片作为新的一轮修订版本（Revision）前向推入。
* **WebGL 图元保全与定格封印**：
  * 沙箱内联重写 `HTMLCanvasElement.prototype.getContext`，拦截并注入 `preserveDrawingBuffer: true`，**彻底解决 WebGL 截屏时画面全黑的痛点**。
  * 一键提取当前运行画面的无损 `.webp` 快照并持久化为封面。

### 4. 🤖 AI 差量补丁机 (Patch FSM)
* **大模型友好**：提供开箱即用的上下文提示词（Prompt Context）一键复制。
* **鲁棒有限状态机**：内置 `DarkroomPatchFSM`，解析 LLM 输出的类 Aider 差量围栏（`act`、`old_doc`、`new_doc`），无需大模型每次全量复写完整源码，极大节约 Token 并杜绝截断。

### 5. ⚡ CDN 静态资源保鲜池 (Asset Cache Engine)
* **依赖嗅探与离线化**：自动正则提取工件引用的外部 `<script>` 与 `<link rel="stylesheet">`。
* **Cache Storage 驱动**：支持一键将外部 CDN 持久缓存至本地浏览器缓存，离线环境亦可毫秒级加载。
* **符号安全注入**：采用函数式注入规则，彻底规避代码中含有 `$`、`$1` 等正则特殊符号时被意外展开的陷阱。

---

## 🏛️ 系统架构

系统在分层上遵循清晰的纵深防御与关注点分离设计：

```text
curio-box
├── src/
│   ├── layer1_sandbox/     # [沙箱执行层]
│   │   └── SandboxViewport # Iframe 隔离、握手通信、WebGL 图元保全、截屏通信
│   │
│   ├── layer2_darkroom/    # [暗房内核与数据层]
│   │   ├── engine/         # CDN 资源缓存引擎、大众分类检索引擎
│   │   ├── fsm/            # Patch FSM 有限状态机与差量打补丁执行器
│   │   └── storage/        # File System Access API 驱动与 IndexedDB 持久化
│   │
│   ├── layer3_gallery/     # [画廊展现层]
│   │   ├── ArtifactCard    # 标本卡片、封面展演与状态徽标
│   │   ├── DarkroomStudio  # 独立暗房工作台 (差量注入 / 历史版本链 / 缓存管理)
│   │   ├── FullscreenStage # 沉浸式全屏舞台与四向磁吸浮动坞
│   │   └── Header          # 顶栏导航、全局检索、目录重连与主题切换
│   │
│   ├── types/              # 全局数据模型与接口契约
│   └── App.tsx             # 顶层状态调度
```

### 物理存储规范（`.gallery/`）

当你在 `curio-box` 中指定一个目录时，系统将在此目录下以完全透明的结构组织快照与元数据：

```text
your-artifacts-dir/
├── fluid-simulation.html       # 当前最新的物理主干代码 (HEAD)
├── cellular-automata.html      # 另一个工件...
└── .gallery/
    ├── meta.json               # 工件标题、标签、当前修订号等元信息
    ├── posters/                # 定格封印快照库
    │   ├── fluid-simulation.webp
    │   └── cellular-automata.webp
    └── negatives/              # 不可变底片链历史库
        └── fluid-simulation/
            ├── ledger.json     # 演进台账 (记录每轮修订动作与说明)
            ├── rev-0001.snapshot
            ├── rev-0002.snapshot
            └── rev-0003.snapshot
```

---

## 🚀 快速上手

### 环境准备

确保你的机器上安装了以下工具：
* **Node.js** >= 18.0.0
* **pnpm** >= 8.0.0 (推荐) 或 npm / yarn
* 现代 Chromium 架构浏览器（**Chrome / Edge** 86+），以获得完整的 **File System Access API** 特性支持。

### 安装与启动

1. **克隆仓库**
   ```bash
   git clone https://github.com/your-username/curio-box.git
   cd curio-box
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **启动开发服务器**
   ```bash
   pnpm dev
   ```
   启动后访问控制台输出的地址（默认为 `http://localhost:5173/`）。

4. **代码检查与格式化**
   本项目使用 [Biome](https://biomejs.dev/) 进行快速代码校验与格式化：
   ```bash
   # 静态类型检查与代码检查
   pnpm check

   # 自动修复格式与 linter 问题
   pnpm checkf
   ```

5. **生产打包**
   ```bash
   pnpm build
   ```

---

## 💡 使用指南

1. **载入工件**：点击右上角 **「打开工件目录」**，选择包含单文件 `.html` 的本地文件夹。
2. **沉浸式展演**：点击卡片封面进入 **「放映舞台」**，按 `Esc` 即可退出；拖拽拉手可将控制栏随意吸附至屏幕任一边缘。
3. **定格封面**：在展演或暗房中点击 **「定格封印」**（相机图标），系统自动截取当前画布生成 WebP 封面。
4. **与 AI 协同迭代**：
   * 点击工件上的 **「暗房」** 按钮进入工作台。
   * 点击右上角 **「复制大模型提示词上下文」**。
   * 发送给 AI 并要求其输出符合 Patch 协议的差量代码块。
   * 将大模型输出的代码粘贴至输入框，点击 **「应用差量补丁」**，底片链将自动跃迁至下一版本。

---

## 📄 许可证

本项目基于 **Apache License 2.0** 许可证开源并维护。  
详细条款请参见项目根目录下的 [LICENSE](./LICENSE) 文件。
