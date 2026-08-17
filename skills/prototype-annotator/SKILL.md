---
name: prototype-annotator
description: >-
  Autonomous UI annotation agent. Reads an HTML prototype, injects ui-annotator,
  opens the page in a browser, extracts semantic context programmatically,
  produces business-logic annotations, applies them to the live page, and exports
  the final config — all without manual user steps.
  Trigger when: user provides an HTML file and asks to annotate it, generate
  ai-design config, or add business-logic annotations to a prototype.
---

# Prototype Annotator — Autonomous Annotation Agent

你是一个自动化标注代理。你的任务是：**读取用户提供的 HTML 原型文件，在浏览器中自动完成整页标注，导出可用的 ai-design 配置**。全程无需用户手动导出上下文或粘贴 JSON。

---

## 1. 何时触发（Trigger Conditions）

| 触发条件 | 自主执行流程 |
|----------|------------|
| 用户提供 HTML 文件 + 要求标注 | §3 完整自动化流程（注入 → 起服务 → 浏览器提取 → 标注 → 应用 → 导出） |
| 用户贴出 AI 上下文 JSON | 跳过注入和浏览器步骤，直接从 §3 Step 5 开始 |
| 用户贴出已有标注要求补充 | 增量补充模式 |
| 用户给人工粗标要求结构化 | 校对模式 |

**不触发：** 纯讨论 UI 理论、要求改页面代码本身、页面无可标注元素（纯空白页）。

---

## 2. 标注什么（Element Selection）

按优先级从高到低选择：

```
P0 — 核心业务动作（必须标注）
  触发状态变更的按钮：提交、审批、发布、删除、出库
  涉及金额/权限/合规的操作
  批量操作：批量导入、批量审批
  线索：按钮/链接文本含动作动词

P1 — 数据录入与校验（优先标注）
  required 字段、特殊校验规则字段、关联业务实体的字段
  线索：required 属性、placeholder 暗示格式、min/max/pattern

P2 — 状态与权限（优先标注）
  条件可见元素、状态标签、disabled 受业务规则控制的按钮
  线索：含状态词的文本、条件渲染的元素

P3 — 导航与路由（选择性标注）
  关键业务入口、带参数的跳转链接

P4 — 纯展示（一般不标注）
  仅在承载关键业务数据时标注
```

### 必须跳过

- 纯装饰：图标、分隔线、空容器
- 纯布局：无文案的 grid/flex 容器
- 重复项：列表每一行数据（标容器 + 一行样例即可）
- `existingAnnotations` 已覆盖且质量达标的元素

### 数量控制：上限 25 条，宁缺勿滥

---

## 3. 自动化工作流（核心流程）

**这是主路径。用户提供 HTML 文件时，按此流程端到端自主完成，不要求用户做任何手动操作。**

### Step 1 — 读取 HTML，理解页面

读取用户提供的 HTML 文件。从 HTML 结构中提取业务上下文：

- `<title>` 和 `<meta name="description">` → 页面定位
- `<form>` / `<input>` / `<select>` → 表单结构、字段名、required、placeholder、校验属性
- `<button>` / `<a>` / `[onclick]` → 交互元素及其文案
- `<table>` / `<thead>` / `<th>` → 表格列名
- 关键文本内容 → 业务规则线索（如"超过3万需复核"）

此时你已经对页面业务有了初步判断。

### Step 2 — 注入 ui-annotator

```bash
node scripts/inject.mjs <页面.html> --project "项目名"
```

如果 `vendor/ui-annotator.umd.min.js` 不存在，先从 `assets/ui-annotator.umd.min.js` 复制过去。inject.mjs 是幂等的，重复执行安全。

### Step 3 — 启动本地服务器并打开页面

```bash
# 在 HTML 所在目录启动 HTTP 服务器（后台运行）
npx -y serve <页面所在目录> -l 3456
```

然后用浏览器 MCP 工具打开页面：

```
browser_navigate → http://localhost:3456/<页面文件名>
```

### Step 4 — 程序化提取 AI 上下文

**关键步骤**：通过浏览器 JS 执行，调用工具 API 提取上下文 —— 无需用户操作工具栏。

```javascript
// browser_evaluate：等待工具就绪并提取上下文
(async () => {
  // 等待 autoInit 完成
  for (let i = 0; i < 50; i++) {
    if (window.UIAnnotator?.getInstance()) break;
    await new Promise(r => setTimeout(r, 100));
  }
  const annotator = window.UIAnnotator.getInstance();
  if (!annotator) throw new Error('ui-annotator 未初始化，请检查注入');
  const context = annotator.extractContext();
  return JSON.stringify(context);
})()
```

将返回的 JSON 保存为 `context.json`。这份 JSON 包含所有可标注元素及其 ref（e1、e2、e3...）。

> 如果提取失败，可能是工具尚未初始化完成。增加等待时间后重试。

### Step 5 — 分析上下文，决定标注

通读 context.json：

```
page → 整页业务定位
regions → 业务模块划分
forms → 表单字段、校验规则 → 推断 P1 标注
tables → 表格列名、数据 → 推断 data-source
interactives → 按钮、链接 → P0 标注主要来源
texts → 关键文本 → 业务规则线索
tree → 元素归属关系
existingAnnotations → 已有标注，不重复
```

按 §2 决策树筛选元素，标记优先级 P0 → P4。

### Step 6 — 撰写标注 JSON

逐条撰写，严格按 §4 输出契约。每条标注必须引用 context.json 中真实存在的 ref。

组装为：

```json
{
  "annotations": [ ... ],
  "pageSummary": "整页业务定位",
  "glossary": [ ... ]
}
```

写入 `ai-output.json`（纯 JSON，无代码围栏、无解释文字）。

### Step 7 — 验证

```bash
node scripts/validate.mjs ai-output.json --context context.json
```

有 error 则修正后重跑，直到退出码为 0。

### Step 8 — 程序化应用标注到页面

**关键步骤**：通过浏览器 JS 执行，将标注应用到活页面 —— 无需用户手动粘贴导入。

```javascript
// browser_evaluate：读取标注并应用
(async () => {
  const response = await fetch('/ai-output.json');
  const aiOutput = await response.json();
  const annotator = window.UIAnnotator.getInstance();
  const result = annotator.applyAiResult(aiOutput);
  return JSON.stringify(result);
})()
```

检查返回的 `{ added, updated, skipped }`：
- `skipped` 非空 → 有 ref 没对上，核实后修正 ai-output.json，重新执行 Step 7-8
- `added` > 0 → 标注已成功应用到页面

> 如果 ai-output.json 不在 HTTP 服务器可达路径，可将 JSON 内容直接内联到 browser_evaluate 代码中。

### Step 9 — 导出最终配置

```javascript
// browser_evaluate：导出完整配置
(() => {
  const annotator = window.UIAnnotator.getInstance();
  const config = annotator.export();
  return JSON.stringify(config, null, 2);
})()
```

将返回的 JSON 写入 `config.json`。

**`config.json` 是最终产物**，包含完整的 `pages[]` 数组和定位策略，可直接用于 ai-design 下游消费。

### Step 10 — 发布只读标注页（可选）

```bash
node scripts/publish.mjs config.json <页面.html> -o review.html
```

`review.html` 双击即可打开，`file://` 也能看，适合发给产品/设计评审。

### 流程总览

```
用户提供 HTML
  ↓ 读取并理解页面结构（Step 1）
  ↓ inject.mjs 注入工具（Step 2）
  ↓ 启动 HTTP 服务器（Step 3）
  ↓ browser_navigate 打开页面
  ↓ browser_evaluate → extractContext()（Step 4）
  ↓ 分析上下文 + 决策（Step 5）
  ↓ 撰写 ai-output.json（Step 6）
  ↓ validate.mjs 验证（Step 7）
  ↓ browser_evaluate → applyAiResult()（Step 8）
  ↓ browser_evaluate → export()（Step 9）
  ↓ publish.mjs 生成 review.html（Step 10，可选）
  ↓
交付：config.json + review.html
```

**全程用户零操作。** 用户只需提供 HTML 文件，标注结果自动产出。

---

## 4. 输出契约

```json
{
  "annotations": [
    {
      "ref": "e12",
      "category": "business-rule",
      "title": "一句话概括该元素的业务职责",
      "body": "用业务语言说明这里发生什么、为什么这样设计",
      "businessLogic": {
        "trigger": "什么触发",
        "preconditions": ["前置条件"],
        "effect": "核心行为",
        "postconditions": ["执行结果"],
        "rules": ["具体业务规则"],
        "errorStates": ["异常与边界"]
      },
      "dataBinding": {
        "fields": [{ "name": "", "label": "", "type": "", "required": false, "validation": "" }],
        "apis": [{ "method": "POST", "path": "/api/xxx", "purpose": "" }],
        "stateKeys": []
      },
      "tags": [],
      "confidence": 0.8
    }
  ],
  "pageSummary": "整页的业务定位，一到三句",
  "glossary": [{ "term": "业务术语", "definition": "解释" }]
}
```

### 必填字段

| 字段 | 要求 |
|------|------|
| `ref` | 引用 context.json 中真实存在的 ref |
| `category` | 8 个预设 key 之一（见下表） |
| `title` | ≤30 字，业务职责概括 |
| `body` | 业务语言，不抄界面文案 |

### 选填（无依据则省略，绝不编造）

`businessLogic`、`dataBinding`、`tags`、`confidence`（始终建议给出 0-1）。

> AI 输出不支持区域标注（`type: "region"`），区域需工具侧手动框选。

### category 取值

| key | 用于 |
|-----|------|
| `business-rule` | 规则、门槛、计算口径 |
| `data-source` | 数据来源、口径、更新时机 |
| `interaction` | 交互行为与副作用 |
| `validation` | 校验约束、必填、格式 |
| `permission` | 权限与可见性 |
| `state` | 状态流转 |
| `todo` | 不确定，需人确认 |
| `note` | 兜底说明 |

### businessLogic 字段

- `trigger` — 触发动作/时机
- `preconditions` — 执行前必须成立的条件
- `effect` — 核心行为
- `postconditions` — 执行后可观测结果
- `rules` — 可判定规则（带阈值、口径、单位、时限）
- `errorStates` — 异常与边界

### dataBinding 字段

- `fields` — 业务字段（`name` 代码字段名，`label` 界面文案，`validation` 业务口径）
- `apis` — 接口（`purpose` 说明业务用途）
- `stateKeys` — 前端状态键

---

## 5. 核心约束

### ref 必须在浏览器中提取

ref 由 `extractContext()` 在浏览器内分配，与 DOM 元素一一绑定。不能离线编造 ref —— 必须通过 Step 4 从活页面提取。

### 不要自己把 ai-output.json 改写成 config.json

手写的定位线索命中不了真实元素。`publish.mjs` 只接受工具 `export()` 导出的配置。

### 绝不编造

不编造不存在的 ref、接口路径、字段名、表名、数字阈值。不确定时用 `todo` + 低 `confidence`。

---

## 6. 质量准则

**用业务语言：** ✓「订单金额超过 5 万需二级审批，未审批时出库按钮置灰」 ✗「amount > 50000 时 disabled=true」

**写"为什么"：** ✓「退款入口仅已付款后可见 —— 未付款订单直接关闭即可」 ✗「这是申请退款按钮」

**规则要可判定：** ✓「复核意见不少于 10 个字」 ✗「意见要写详细」

**不确定标 todo：** 把问题写清楚比猜答案有用。

**数量 ≤ 25 条：** 宁缺勿滥。

---

## 7. 输入结构（context.json 各字段）

| 字段 | 含义 | 如何利用 |
|------|------|----------|
| `page` | url/title/framework/viewport/description | 判断整页业务定位 |
| `outline` | 标题层级 | 还原信息架构 |
| `regions` | 语义区块 | 划分业务模块，推断 permission |
| `interactives` | 按钮、链接、可点元素 | P0 元素主要来源 |
| `forms` | 表单及字段 | 推断 validation 和 dataBinding |
| `tables` | 表头与样例行 | 推断 data-source |
| `texts` | 关键文本 | 提取业务规则线索 |
| `existingAnnotations` | 已有标注 | 不重复，只补遗漏 |
| `tree` | 剪枝后 DOM 骨架 | 判断元素归属 |
| `refHints` | ref 总数与说明 | 确认覆盖范围 |

---

## 8. 自检清单

产出 ai-output.json 前逐项确认：

1. 每条 ref 在 context.json 中真实存在
2. 所有 category 是 8 个预设 key 之一
3. 没有自写选择器/xpath
4. businessLogic 无编造的字段名/接口路径
5. 未重复 existingAnnotations 已覆盖内容
6. body 不是界面文案的直接复制
7. 总数 ≤ 25 条
8. 文件内容是纯 JSON —— 无 Markdown 代码围栏、无前后解释文字

---

## 9. 常见错误

| 错误 | 后果 |
|------|------|
| 自写 CSS 选择器代替 ref | 标注无法定位，被工具跳过 |
| 编造不存在的 ref | 被跳过并计入 skipped |
| 输出 JSON 之外的文字 | 解析失败 |
| 编造接口路径、字段名 | 污染配置数据 |
| 重复 existingAnnotations | 导入后重复标注 |
| 抄界面文案进 body | 无信息增量 |
| category 用中文 | 回退为 note |

---

## 10. 内置脚本

零依赖，Node ≥ 18。ui-annotator 运行时已打包在 `assets/` 下。

```bash
# 注入工具到 HTML 页面（幂等）
node scripts/inject.mjs <页面.html> --project "项目名" --author "作者"
node scripts/inject.mjs page.html --remove

# 验证标注 JSON（质量闸门）
node scripts/validate.mjs ai-output.json --context context.json

# 生成只读标注页（config.json 来自 browser export()，不是 ai-output.json）
node scripts/publish.mjs config.json page.html -o review.html
```

---

## 11. 目录结构

```
prototype-annotator/
├── SKILL.md                       本文件（LLM Agent Skill）
├── assets/
│   ├── ui-annotator.umd.js        运行时（开发版）
│   └── ui-annotator.umd.min.js    运行时（压缩版）
├── scripts/
│   ├── inject.mjs                 注入工具到页面
│   ├── validate.mjs               标注 JSON 校验
│   ├── publish.mjs                生成只读标注页
│   └── html-utils.mjs             HTML 改写函数
└── reference/
    ├── schema.md                  配置数据结构全文
    └── locating.md                定位策略与降级机制
```

自包含：整个目录拷走即可使用，不依赖仓库其余文件。

---

## 参考

- 配置数据结构全文 → [reference/schema.md](reference/schema.md)
- 定位策略与降级机制 → [reference/locating.md](reference/locating.md)
