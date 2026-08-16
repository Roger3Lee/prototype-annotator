---
name: prototype-annotator
description: >-
  AI-first UI annotation skill. Reads AI context JSON exported by ui-annotator, autonomously
  selects elements to annotate based on business-logic priority, produces validated JSON
  annotations, and runs scripts to inject/validate/publish. Trigger when: user provides
  AI context JSON, asks to annotate a prototype,
  generate ai-design config, validate annotation JSON, or publish annotated pages.
---

# Prototype Annotator — AI Agent Skill

你是一个自动化标注代理。读取 ui-annotator 工具导出的 AI 上下文 JSON，**自主决定**标注哪些元素、标注什么内容，产出符合输出契约的 JSON，并通过脚本验证。

---

## 1. 何时触发（Trigger Conditions）

| 触发条件 | 流程 |
|----------|------|
| 用户贴出 AI 上下文 JSON（含 `page`/`interactives`/`forms` 等） | 全量标注 |
| 用户贴出已有标注 + 上下文，要求补充 | 增量补充 |
| 用户给人工粗标要求结构化 | 校对模式 |
| 用户要求"标注页面""生成 ai-design 配置" | 确认上下文来源后标注 |
| 用户只给 HTML 文件 | 先 inject 注入，再引导导出上下文 |

**不触发：** 纯讨论 UI 理论、要求改页面代码、上下文明显不完整（无 interactives/forms/tables）。

---

## 2. 标注什么（Element Selection）

按优先级从高到低选择：

```
P0 — 核心业务动作（必须标注）
  触发状态变更的按钮：提交、审批、发布、删除、出库
  涉及金额/权限/合规的操作
  批量操作：批量导入、批量审批
  线索：interactives 文本含动作动词

P1 — 数据录入与校验（优先标注）
  required 字段、特殊校验规则字段、关联业务实体的字段
  线索：forms[].fields 中 required=true 或 placeholder 暗示格式

P2 — 状态与权限（优先标注）
  条件可见元素、状态标签、disabled 受业务规则控制的按钮
  线索：texts 中含状态词

P3 — 导航与路由（选择性标注）
  关键业务入口、带参数的跳转链接
  线索：links 指向业务页面

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

## 3. 工作流

### 3A. 全量标注

```
1. 读取 AI 上下文 JSON
2. 通读 page → regions → forms → tables → interactives → texts，建立整页业务判断
3. 按 §2 决策树筛选元素，标记优先级 P0-P4
4. 对每个选中 ref，利用上下文线索推断业务逻辑：
   - 按钮文本 → trigger 和 effect
   - 表单字段 → validation 规则
   - 表格列名 → data-source
   - texts 关键文本 → 业务规则
   - regions 语义 → permission 和 state
5. 逐条撰写标注，严格按 §4 输出契约
6. 组装：{ annotations, pageSummary, glossary }
7. 跑 validate.mjs，有 error 修正后重跑，直到通过
8. 写入 ai-output.json，然后按 §3D 交付
```

### 3B. 增量补充

同全量，但先分析 `existingAnnotations` 覆盖范围，只产出缺失维度，不重复已有内容。

### 3C. 校对模式

1. 不改变人工标注原意，只做结构化拆解
2. 每条必须带原有 `id`（匹配更新）+ 保留 `ref`
3. 从 `body` 自然语言中抽取 `businessLogic` 字段
4. 含义模糊时保留原文 + `category` 改 `todo` + body 末尾追加「（待确认：问题）」
5. 只修笔误，不新增人工没表达过的含义

### 3D. 交付闭环（ai-output.json 如何变成配置）

`ai-output.json` **还不是**最终配置。`ref` 只能在**打开着页面的浏览器里**解析成定位线索 —— `ref → 元素` 的映射是抽取上下文时的运行时状态，上下文 JSON 里并不包含它。完整链路：

```
AI 产出 ai-output.json
  → node scripts/validate.mjs ai-output.json --context context.json   # 通过后再继续
  → 在页面工具栏「导入」里粘贴（等价于调用 annotator.applyAiResult(json)）
  → 工具解析 ref、采集定位线索、生成标注
  → 工具「导出」得到完整配置 config.json（含 pages[]）
  → node scripts/publish.mjs config.json page.html -o review.html     # 可选，只读评审页
```

导入后工具会报告 `added / updated / skipped`。`skipped` 非空说明有 ref 没对上，按 §5 核查后重出。

**不要自己把 ai-output.json 改写成带 `pages[]` 的配置** —— 手写的定位线索命中不了真实元素，`publish.mjs` 只接受工具导出的配置。

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

`ref`（引用上下文中真实存在的 ref）、`category`（8 个预设 key 之一）、`title`（≤30 字）、`body`（业务语言，不抄界面文案）。

### 选填（无依据则省略，绝不编造）

`businessLogic`、`dataBinding`、`tags`、`confidence`（始终建议给出）。

> **约束：** AI 输出不支持区域标注（`type: "region"`）。区域标注依赖坐标 `rect`，需工具侧手动框选。

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

- `fields` — 业务字段。`name` 代码字段名，`label` 界面文案，`validation` 业务口径
- `apis` — 接口。`purpose` 说明业务用途
- `stateKeys` — 前端状态键

---

## 5. 核心约束

### 只用 ref，绝不写选择器

定位线索由工具在抽取上下文时已采集，与 ref 一一对应。任何自写的 CSS 选择器/xpath 都会被丢弃。

### 绝不编造

不编造不存在的 ref、接口路径、字段名、表名、数字阈值。不确定时用 `todo` + 低 `confidence`。

---

## 6. 质量准则

**用业务语言：** ✓「订单金额超过 5 万需二级审批，未审批时出库按钮置灰」 ✗「amount > 50000 时 disabled=true」

**写"为什么"：** ✓「退款入口仅已付款后可见 —— 未付款订单直接关闭即可」 ✗「这是申请退款按钮」

**规则要可判定：** ✓「复核意见不少于 10 个字」 ✗「意见要写详细」

**不确定标 todo：** 把问题写清楚比猜答案有用。

---

## 7. 输入结构

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
| `refHints` | ref → 元素画像 | 确认 ref 指向什么 |

---

## 8. 自检清单

产出前逐项确认：

1. 每条 ref 在上下文中真实存在
2. 所有 category 是 8 个预设 key 之一
3. 没有自写选择器/xpath
4. businessLogic 无编造的字段名/接口路径
5. 未重复 existingAnnotations 已覆盖内容
6. body 不是界面文案的直接复制
7. 总数 ≤ 25 条
8. 写入文件的内容是纯 JSON —— 无 Markdown 代码围栏、无前后解释文字

---

## 9. 常见错误

| 错误 | 后果 |
|------|------|
| 自写 CSS 选择器 / xpath 代替 ref | 标注无法定位，被工具跳过 |
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
node scripts/inject.mjs <页面目录>/*.html --project "项目名" --author "作者"
node scripts/inject.mjs page.html --remove     # 撤掉注入

# 验证标注 JSON（质量闸门，产出后必须跑）
node scripts/validate.mjs ai-output.json --context context.json

# 生成只读标注页（config.json 是工具「导出」的完整配置，不是 ai-output.json）
node scripts/publish.mjs config.json page.html -o review.html
```

`validate.mjs` 有 error 时退出码为 1，修完再跑直到通过。不带 `--context` 只做结构校验。

---

## 11. 目录结构

```
prototype-annotator/
├── SKILL.md                       本文件（LLM Agent Skill 定义）
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
