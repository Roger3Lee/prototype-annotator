# ui-annotator

在 **HTML / Vue / React** 界面上定位元素、标注业务逻辑，导出可供 **AI design** 消费的配置数据。

零依赖、非侵入、单文件 UMD —— 静态 HTML 双击就能用，`file://` 下也能跑。

---

## 快速开始

### 静态 HTML（零构建）

```html
<script src="dist/ui-annotator.umd.js"
        data-auto
        data-project="订单管理平台"
        data-author="产品经理"
        data-domain="B2B 订单履约"></script>
```

一行接入，右上角出现工具栏。快捷键：

| 键 | 作用 |
|----|------|
| `E` | 选元素标注 |
| `R` | 框选区域标注 |
| `S` | 标注清单侧栏 |
| `H` | 显隐所有标记 |
| `Esc` | 取消当前操作 |

### 手动初始化

```js
const annotator = UIAnnotator.init({
  project: '订单管理平台',
  mode: 'edit',          // 'edit' | 'view'
  storage: 'local',      // 'local' | 'memory' | 'inline' | 'http' | 自定义适配器
  domain: 'B2B 订单履约',
});
```

### 打包器

```js
import { init } from 'ui-annotator';
init({ project: '订单管理平台' });
```

### 跑示例

```bash
npm install
npm run build
```

然后双击 `examples/index.html`：

| 示例 | 演示什么 |
|------|----------|
| `static-html.html` | 零构建接入，localStorage 持久化，导出 JSON |
| `published.html` | 内联标注 + 只读模式，发给他人查阅 |
| `vue3.html` | Vue 3 组件名与组件路径策略 |
| `react.html` | React fiber 组件路径、降级与 orphaned 状态 |

---

## 完整流程

```
① 打开页面 → 点 E → 点元素 → 填写业务逻辑 → 保存
                                    ↓
② 点 ✦ 复制「提示词」（已内嵌页面语义上下文）
                                    ↓
③ 粘进 AI 对话框 → AI 按契约输出 JSON（只引用 ref）
                                    ↓
④ 点 </> → 「导入」页 → 粘贴 → 合并 → 标记自动出现在对应元素上
                                    ↓
⑤ 侧栏逐条复核 → 点 </> → 「配置 JSON」→ 下载
                                    ↓
⑥ 这份 JSON 就是 AI design 的输入
```

配套的 AI 提示词规范见 [skills/prototype-annotator/SKILL.md](skills/prototype-annotator/SKILL.md)。

---

## 元素定位：多重策略 + 自动降级

标注最怕的是页面一改就找不到元素。这里的做法是**一次采集 9 种线索，回放时加权投票**。

| 策略 | 权重 | 采集内容 |
|------|------|----------|
| `anchorId` | 100 | 工具写入的 `data-anno-id` |
| `testId` | 90 | `data-testid` / `data-cy` / `data-qa` 等 |
| `domId` | 70 | 元素 `id`（自动过滤构建生成的随机 id） |
| `ariaPath` | 55 | `role` + 可访问名 + 所属 landmark |
| `componentPath` | 50 | 组件路径，如 `App>OrderList>OrderForm` |
| `cssPath` | 40 | 稳定 CSS 路径（剔除生成类名） |
| `textual` | 35 | 标签 + 归一化文本 + 同文本出现次序 |
| `nthPath` | 30 | 绝对 `nth-child` 路径 |
| `attrHints` | 25 | `name` / `type` / `placeholder` / `href` 等 |

回放时每个策略为候选元素投票，票数按候选数量稀释；再叠加**元素画像相似度**（标签、角色、文本、组件名）加成，取总权重最高者。

三种结果状态：

- **active** — 命中权威策略（anchorId / testId / domId）或置信度 ≥ 0.45
- **drifted** — 靠低权重策略勉强命中，侧栏标黄。工具会**从实际命中的元素重新采集线索**（自愈），下次加载即可回到 active
- **orphaned** — 所有策略都失败，侧栏标红，标注内容不丢，等人工「重新指定元素」

生成类 token（CSS Modules 哈希、styled-components、Tailwind JIT、Vue scoped 哈希）会被识别并排除，不会成为定位线索。

---

## 存储

| 值 | 行为 |
|----|------|
| `local`（默认） | 读：本地改动优先，其次页面内联基线；写：localStorage |
| `memory` | 只在内存，刷新即失效 |
| `inline` | 只读，从 `<script type="application/json" id="ui-annotator-config">` 读取 |
| `http` | `GET` 拉取 / `PUT` 保存，团队协作用 |
| 自定义 | 传入 `{ load, save, clear }` 对象 |

`file://` 或隐私模式下 localStorage 不可用时会**自动降级为内存存储**并弹提示，引导用「导出 JSON」保存 —— 工具本身不会因为存不上而崩掉。

### 发布标注

把导出的配置内联进 HTML，以只读模式启动，任何人双击即可查阅：

```html
<script type="application/json" id="ui-annotator-config">
{ "$schema": "ui-annotator/annotation-config", "version": 1, ... }
</script>
<script src="dist/ui-annotator.umd.js" data-auto data-mode="view" data-storage="inline"></script>
```

---

## AI 环节：ref 间接层

**问题**：直接让 AI 写 CSS 选择器，产出的标注定位不了。

**做法**：抽取页面语义上下文时，给每个候选元素分配一个短 ref（`e12`），同时**在工具侧把 9 种定位线索采集好**。AI 只回答「ref e12 的业务逻辑是什么」，导入时按 ref 还原定位。

于是 AI 产出的配置**天然可定位**，不依赖模型正确书写选择器。

上下文包含：`page` / `outline` / `regions` / `interactives` / `forms` / `tables` / `texts` / `existingAnnotations` / `tree` / `refHints`。DOM 骨架会剪枝：折叠无语义的单子节点层，丢弃不含任何 ref 的分支。

---

## API

```js
const a = UIAnnotator.init(options);

// 数据
a.export()                          // → 完整配置对象
a.import(config, 'replace'|'merge')
a.annotate('#btn-search', { title: '查询订单', category: 'interaction' })

// AI
a.extractContext({ maxElements: 160 })  // → 语义上下文，并缓存 ref 映射
a.buildPrompt({ focus: '只标注审批流相关元素' })
a.buildRefinePrompt()                   // 人工粗标 → AI 补结构
a.applyAiResult(text或对象, { mode: 'merge' })

// 控制
a.setMode('view')
a.destroy()

// 仓库与浮层
a.store    // AnnotationStore：CRUD、审计流水、持久化
a.overlay  // Overlay：工具栏、拾取器、标记层、编辑器、侧栏
```

`UIAnnotator.getInstance()` 取当前实例，`UIAnnotator.destroy()` 销毁。

### 初始化选项

| 选项 | 默认 | 说明 |
|------|------|------|
| `mode` | `'edit'` | `'view'` 隐藏标注入口，只能查看 |
| `storage` | `'local'` | 见「存储」 |
| `storageKey` | `'ui-annotator:config'` | localStorage 键名 |
| `inlineSelector` | `'#ui-annotator-config'` | 内联配置选择器 |
| `project` | `document.title` | 项目名 |
| `author` | `'anonymous'` | 标注人，写入审计流水 |
| `domain` | — | 业务域，注入 AI 提示词 |
| `stampAnchor` | `true` | 标注时给元素写 `data-anno-id` |
| `autoSave` | `true` | 编辑后 400ms 合并落盘 |
| `watchRoute` | `true` | 监听 SPA 路由变化并重锚定 |

`data-*` 属性与选项一一对应：`data-mode`、`data-storage`、`data-storage-key`、`data-inline-selector`、`data-project`、`data-author`、`data-domain`、`data-stamp-anchor`。

---

## 配置数据结构

见 [docs/schema.md](docs/schema.md)。

---

## 设计取舍

**Shadow DOM 隔离** — 全部 UI 挂在 `<ui-annotator-root>` 的 shadow root 内。宿主页面的 CSS reset、Tailwind preflight 影响不到浮层；浮层样式也不会污染宿主。定位与拾取通过 `closest('ui-annotator-root')` 一次性排除工具自身节点。

**拾取时的透明遮罩** — 拾取模式下覆一层透明遮罩接管指针事件，宿主页面的 click 处理器不会被触发。选个「提交」按钮不会真的提交表单。

**页面标识归一化** — `/orders/1024` 与 `/orders/2048` 归一为 `/orders/:id`，同路由不同参数视为同一页。`file://` 下只取文件名，导出的配置可跨机器回放。

**审计流水** — 谁在什么时候改了哪条标注都记在 `store.events`（上限 500 条），用于当次会话排查。

**宽松校验** — `validateConfig` 对外部（尤其 AI）数据只警告不拒绝：AI 把 `rules` 写成换行字符串而不是数组，会被自动规整为数组，而不是整份配置失败。

---

## 开发

```bash
npm run build        # 产出 UMD / UMD.min / ESM
npm run dev          # watch + 静态服务器（:5180）
node test/e2e.smoke.mjs   # 端到端冒烟测试（需本机 Edge）
```

产物：

| 文件 | 用途 |
|------|------|
| `dist/ui-annotator.umd.js` | `<script>` 直接引入，暴露 `window.UIAnnotator` |
| `dist/ui-annotator.umd.min.js` | 压缩版，CDN 用 |
| `dist/ui-annotator.esm.js` | 打包器 `import` |

---

## 灵感来源

元素/区域两种选取模式、Shadow DOM 隔离、审计事件、提示词导出等思路参考了
[prototype_annotator](https://github.com/NewmanJustice/prototype_annotator-)。

与之不同的是：本项目不依赖 Express / SQLite / Preact，改为零依赖单文件，
把重点放在**多重定位 + 自动降级**与**面向 AI design 的 ref 契约**上。

## License

MIT
