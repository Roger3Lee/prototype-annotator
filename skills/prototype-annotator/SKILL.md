---
name: prototype-annotator
description: Annotates front-end prototypes and pages with business logic using the ui-annotator tool, and turns those annotations into AI-design-ready configuration data. Injects the annotator into HTML pages, reads the exported "AI context JSON" (elements referenced by short refs such as e12), produces annotations that strictly follow the output contract, validates them before import, and publishes a read-only annotated page. Use when the user asks to annotate a prototype or page's business logic, generate ai-design config, inject or set up ui-annotator, interpret an AI context JSON with refs, validate ui-annotator annotation JSON, refine hand-written annotations into structured form, or publish annotations for review.
---

# Prototype Annotator

把界面元素翻译成**业务逻辑说明**，产出 ui-annotator 能直接导入的 JSON，用于驱动 AI design。

## 核心约束：只用 ref，绝不写选择器

上下文里每个可标注元素都带一个短 ref（`e7`、`e12`）。定位线索（`data-anno-id`、CSS 路径、组件路径、文本特征等 9 种策略）由工具在抽取上下文时**已经采集完毕**，与 ref 一一对应。

因此：**只需引用 ref，工具会自己还原定位**。任何自己编写的 CSS 选择器、xpath、"第三个按钮" 之类的描述都会被丢弃，对应标注直接失效。

## 工作流

```
- [ ] 1. 页面还没接入工具 → 跑 scripts/inject.mjs 注入
- [ ] 2. 拿到「AI 上下文 JSON」（工具栏 </> → AI 上下文，或 ✦ → 提示词）
- [ ] 3. 通读 page / regions / forms / tables / interactives，先建立整页业务判断
- [ ] 4. 挑元素：核心业务动作 > 数据录入与校验 > 状态与权限 > 导航 > 纯展示
- [ ] 5. 逐条写标注，严格按输出契约
- [ ] 6. 跑 scripts/validate.mjs 自检，有 error 就修到过
- [ ] 7. 输出单个 JSON 对象，无任何额外文字
- [ ] 8. 用户粘回工具的「导入」页 → 选「合并到当前标注」
- [ ] 9. 需要发给他人查阅 → 跑 scripts/publish.mjs 生成只读页
```

## 目录结构

```
prototype-annotator/
├── SKILL.md                       本文件
├── assets/
│   ├── ui-annotator.umd.js        运行时（开发版，带可读源码）
│   └── ui-annotator.umd.min.js    运行时（压缩版，用于发布产物）
├── scripts/
│   ├── inject.mjs                 注入工具到页面
│   ├── validate.mjs               标注 JSON 校验
│   ├── publish.mjs                生成只读标注页
│   └── html-utils.mjs             上面三个脚本共用的 HTML 改写函数
└── reference/
    ├── schema.md                  配置数据结构全文
    └── locating.md                定位策略与降级机制
```

自包含：不依赖仓库其余文件，整个目录拷走或打成 zip 即可使用。

## 内置脚本

零依赖，Node ≥ 18 直接跑。**ui-annotator 运行时已随 skill 打包在 `assets/` 下**，不需要额外安装或构建。下面的命令都在本 skill 目录里执行。

**inject.mjs** — 把工具注入 HTML 页面（幂等，重复跑只会更新参数）

```bash
node scripts/inject.mjs <页面目录>/*.html --project "订单管理平台" --author "产品经理"
node scripts/inject.mjs page.html --remove     # 撤掉注入
```

**validate.mjs** — 导入前校验，**这是质量闸门，产出 JSON 后必须跑一遍**

```bash
node scripts/validate.mjs ai-output.json --context context.json
```

有 error 时退出码为 1 并逐条列出问题（ref 不存在、写成了选择器、category 非法……）。修完再跑，直到通过。不带 `--context` 只做结构校验，无法查 ref 是否真实存在。同一个脚本也能校验完整配置（含 `pages` 的导出文件）。

**publish.mjs** — 把导出的配置内联进页面，生成只读标注页

```bash
node scripts/publish.mjs config.json page.html -o review.html
```

产物双击即可打开，`file://` 下也能看，不需要服务器和 localStorage。

## 输入：AI 上下文结构

| 字段 | 含义 | 用法 |
|------|------|------|
| `page` | url / title / framework / viewport / description | 判断整页业务定位 |
| `outline` | 标题层级 | 还原信息架构 |
| `regions` | 语义区块（header/nav/main/aside/section） | 划分业务模块 |
| `interactives` | 按钮、链接、可点元素 | **业务动作的主要来源** |
| `forms` | 表单及其字段（name/type/required/placeholder/label） | 推断校验与数据契约 |
| `tables` | 表头与样例行 | 推断列表业务含义 |
| `texts` | 关键文本 | 提取业务规则线索（"超过 3 万需复核"） |
| `existingAnnotations` | 已有标注 | **不要重复**，只补遗漏维度 |
| `tree` | 剪枝后的 DOM 骨架 | 判断元素归属关系 |
| `refHints` | ref → 元素画像 | 确认 ref 指向的到底是什么 |

## 输出契约

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

`ref`、`category`、`title`、`body` 必填。`businessLogic` 与 `dataBinding` 的子字段全部可选 —— **没有依据就省略，不要编造**。

> **字段映射说明：**
> - `confidence` 导入后存入 `meta.aiConfidence`，`meta.source` 固定为 `"ai"`，`meta.reviewed` 固定为 `false`。
> - `ref` 由工具在导入时还原为 `target.strategies`，写标注时只需引用 ref，不需要也不应该自己构造 `target`。
> - AI 输出**不支持区域标注**（`type: "region"`）。区域标注依赖坐标 `rect` 而非 ref，需在工具侧手动框选。

### category 取值

只能用这 8 个 key：

| key | 用于 |
|-----|------|
| `business-rule` | 业务规则、门槛、计算口径 |
| `data-source` | 数据来源、口径、更新时机 |
| `interaction` | 交互行为与副作用 |
| `validation` | 校验约束、必填、格式 |
| `permission` | 权限与可见性 |
| `state` | 状态流转、状态机 |
| `todo` | 推断不确定，需向人确认 |
| `note` | 普通说明 |

### businessLogic 字段含义

- `trigger` — 什么动作/时机触发。「点击『确认出库』」「页面加载读取订单金额」
- `preconditions` — 执行前必须成立的条件。权限、状态、数据前提
- `effect` — 核心行为，一句话说清系统做了什么
- `postconditions` — 执行后的可观测结果。状态变更、流水落库、通知
- `rules` — 可判定的业务规则。带上具体阈值和口径
- `errorStates` — 异常与边界。校验失败、并发、越权、空数据

### dataBinding 字段含义

- `fields` — 该元素读写的业务字段。`name` 用代码里的字段名，`label` 用界面文案，`validation` 写业务口径而非正则
- `apis` — 相关接口。`purpose` 说明业务用途，不是重复 path
- `stateKeys` — 依赖的前端状态键，如 `order.status`、`auth.permissions`

## 质量准则

**用业务语言，不用技术语言。** 标注的读者是产品和设计，不是在读代码。

- 好：「订单金额超过 5 万需二级审批，未审批时出库按钮置灰」
- 差：「amount > 50000 时调用 approve 接口，disabled=true」

**写"为什么"，不只写"是什么"。** 界面上看得见的信息没有标注价值。

- 好：「退款入口仅已付款后可见 —— 未付款订单直接关闭即可，不走退款流程」
- 差：「这是申请退款按钮」

**规则要可判定。** 带上阈值、口径、单位、时限。

- 好：「复核意见不少于 10 个字」「退款金额 ≤ 实付金额」
- 差：「意见要写详细」「金额要合理」

**不确定就标 todo。** 把问题写清楚比猜一个答案有用。

```json
{
  "ref": "e18",
  "category": "todo",
  "title": "批量导入的失败处理策略待确认",
  "body": "导入部分行失败时，是整批回滚还是跳过失败行继续？需向订单域负责人确认。",
  "confidence": 0.3
}
```

**跳过纯装饰元素。** 图标、分隔线、无文案容器、纯样式包裹层一律不标。

**数量控制在 25 条以内**，优先覆盖业务骨架。宁缺勿滥 —— 20 条高质量标注比 50 条「这是一个按钮」有价值。

## 常见错误

| 错误 | 后果 |
|------|------|
| 自己写 CSS 选择器 / xpath 代替 ref | 标注无法定位，被工具跳过 |
| 编造上下文里不存在的 ref | 该条被跳过并计入 `skipped` |
| 输出 JSON 之外的解释文字 | 解析失败或内容被截断 |
| 编造接口路径、字段名、表名 | 污染配置数据，误导下游 AI design |
| 重复 `existingAnnotations` 已覆盖的内容 | 导入后出现重复标注 |
| 把界面文案直接抄进 `body` | 无信息增量 |
| `category` 用中文标签而非 key | 被规整为 `note`，分类信息丢失 |

以上前三项 `validate.mjs` 都会拦下来，跑一遍比人眼核对可靠。

## 校对模式

用户已有人工粗标、要求补齐结构化字段时（对应工具的 `buildRefinePrompt`）：

1. **不得改变人工标注的原意**，只做结构化拆解
2. 每条**必须带上原有的 `id`**，用于匹配更新；同时保留 `ref`。**`id` 缺失时工具会创建新条目而非更新原有条目**，导致重复标注——这是校对模式最常见的错误。
3. 从 `body` 的自然语言里抽出 `businessLogic` 各字段
4. 人工含义模糊时，保留原文并把 `category` 改为 `todo`，在 `body` 末尾追加「（待确认：具体问题）」
5. 只修明显笔误，不新增人工没表达过的业务含义

## 导入后

工具会提示「新增 N 条、更新 M 条」。若出现「X 条因 ref 失效被跳过」，说明引用了不存在的 ref —— 核对上下文重新产出这几条。

导入的标注 `meta.source` 为 `ai`、`reviewed` 为 `false`，需要人工在侧栏逐条复核后才算定稿。

## 参考

- 配置数据结构全文 → [reference/schema.md](reference/schema.md)
- 定位策略与降级机制 → [reference/locating.md](reference/locating.md)
