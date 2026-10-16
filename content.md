这是类型检查（`tsc`）与代码规范检查器（`Biome`）指出的两处语法与代码规范问题：

1. `asset-cache.ts`：Biome 规则 `lint/suspicious/noAssignInExpressions` 严禁在 `while` 判断条件等表达式中进行赋值（`while ((match = ...))`）。我们将改用更现代且语义清晰的 ES2020 原生 `matchAll` 迭代器遍历。
2. `DarkroomStudio.tsx`：TypeScript `TS6133` 报出多余未使用的图标导入 `ChevronLeft` 和 `ChevronRight`。我们将予以清理。

## [WIP] fix: 消除 Biome 表达式赋值与 TypeScript 未使用导入报错

### 错误分析
1. **Biome Linter 报错 (`noAssignInExpressions`)**：
   在 `AssetCacheEngine.detectExternalAssets` 中，使用了经典的 `while ((match = regex.exec(html)) !== null)` 写法。Biome 将在条件表达式中进行赋值判定为容易引起混淆的副作用反模式。
2. **TypeScript 编译报错 (`TS6133`)**：
   在 `DarkroomStudio.tsx` 顶部导入了 `lucide-react` 的 `ChevronLeft` 与 `ChevronRight`，但在后续 JSX 中未被引用，触发了 `tsconfig.json` 的 `noUnusedLocals` 拦截。

### 用户需求
修复 Biome 与 TypeScript 检查报错，保证 `pnpm check` 与 `pnpm build` 命令一次性通过。

### 评论
遵循现代 TypeScript 规范，使用原生的 `String.prototype.matchAll` 能够让正则表达式的捕获遍历更具声明性，彻底消除低级指针赋值带来的潜在副作用。

### 目标
1. 修改 `asset-cache.ts`：将 `regex.exec` 替换为 `html.matchAll(regex)`，消除表达式赋值。
2. 修改 `DarkroomStudio.tsx`：移除未使用的图标依赖。

### 基本原理
- 原生 `matchAll` 返回一个迭代器，配合 `for...of` 可以直接解构每一项匹配捕获组，无需在外部维护变量或在表达式中赋值，完全符合 Biome 的纯函数与防副作用规则。
- 移除无用导入符合严苛的 TypeScript 静态检查规则。

### 标签
#intent/fix #flow/ready #priority/high #comp/darkroom #comp/build #concept/parser #scope/dx #task/domain/tooling #task/object/linter-and-tsc #task/action/bug-fix #task/state/continue

---

### Script

#### Acts 1: 升级资产嗅探为 matchAll 迭代

修改 `src/layer2_darkroom/engine/asset-cache.ts`，消除 `noAssignInExpressions` 告警。

~~~~~act
patch_file
src/layer2_darkroom/engine/asset-cache.ts
~~~~~
~~~~~typescript.old
  detectExternalAssets(html: string): ExternalAsset[] {
    const assets: ExternalAsset[] = [];
    const scriptRegex = /<script\s+[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
    const styleRegex = /<link\s+[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;

    let match: RegExpExecArray | null;
    while ((match = scriptRegex.exec(html)) !== null) {
      if (match[1]) {
        assets.push({ url: match[1], type: 'script', status: 'pending' });
      }
    }

    while ((match = styleRegex.exec(html)) !== null) {
      const fullTag = match[0].toLowerCase();
      if (fullTag.includes('stylesheet') && match[1]) {
        assets.push({ url: match[1], type: 'style', status: 'pending' });
      }
    }

    return assets;
  },
~~~~~
~~~~~typescript.new
  detectExternalAssets(html: string): ExternalAsset[] {
    const assets: ExternalAsset[] = [];
    const scriptRegex = /<script\s+[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
    const styleRegex = /<link\s+[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;

    for (const match of html.matchAll(scriptRegex)) {
      if (match[1]) {
        assets.push({ url: match[1], type: 'script', status: 'pending' });
      }
    }

    for (const match of html.matchAll(styleRegex)) {
      const fullTag = match[0].toLowerCase();
      if (fullTag.includes('stylesheet') && match[1]) {
        assets.push({ url: match[1], type: 'style', status: 'pending' });
      }
    }

    return assets;
  },
~~~~~

#### Acts 2: 清理未使用的图标导入

修改 `src/layer3_gallery/components/DarkroomStudio.tsx`，移除未被引用的 `ChevronLeft` 与 `ChevronRight`。

~~~~~act
patch_file
src/layer3_gallery/components/DarkroomStudio.tsx
~~~~~
~~~~~typescript.old
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
~~~~~
~~~~~typescript.new
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Code2,
  Copy,
~~~~~

### 下一步建议
1. 运行 `pnpm check`，验证 Biome 与 TypeScript 校验是否全部顺利通过（零报错）。
2. 执行 `pnpm build` 测试生产环境打包构建，确保一切正常。
