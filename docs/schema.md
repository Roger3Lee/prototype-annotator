# 配置数据结构（v1）

标注配置是整个工具的中心契约：浮层 UI 读它渲染、导出时序列化它、AI 生成的结果也必须收敛到它。
实现见 [`src/core/schema.js`](../src/core/schema.js)。

```
$schema  : "ui-annotator/annotation-config"
version  : 1
```

---

## 顶层

```json
{
  "$schema": "ui-annotator/annotation-config",
  "version": 1,
  "project": {
    "name": "订单管理平台",
    "framework": "vue3",
    "generatedAt": "2026-08-15T02:11:04.512Z",
    "generator": "ui-annotator"
  },
  "glossary": [{ "term": "二级审批", "definition": "金额超过 5 万时需部门负责人复核" }],
  "pages": [ /* Page[] */ ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `project.name` | string | 项目名，默认取 `document.title` |
| `project.framework` | string | 运行时探测结果：`vue3` / `vue2` / `react` / `unknown` |
| `project.generatedAt` | ISO string | 导出时间 |
| `project.generator` | string | 固定 `ui-annotator` |
| `glossary` | `{term, definition}[]` | 跨页面共享的业务术语，帮 AI 统一词汇 |
| `pages` | `Page[]` | 按页面分组的标注 |

> `glossary` 在**配置文件里是数组**，在运行时仓库里是 `{term: definition}` 映射。
> `applyAiResult` 两种形态都吃，不用关心 AI 输出的是哪种。

---

## Page

```json
{
  "id": "page_lz3k9a2x1b",
  "url": "http://localhost:5180/orders/1024",
  "urlPattern": "/orders/:id",
  "title": "订单详情",
  "route": {},
  "summary": "单个订单的履约全流程操作台",
  "viewport": { "width": 1440, "height": 900, "dpr": 2 },
  "annotations": [ /* Annotation[] */ ]
}
```

| 字段 | 说明 |
|------|------|
| `urlPattern` | **页面身份标识**。`/orders/1024` 与 `/orders/2048` 都归一为 `/orders/:id`，同路由不同参数视为同一页；`file://` 下只取文件名，保证导出配置能跨机器回放 |
| `url` | 标注时的原始地址，仅作参考。缺失只警告，不阻断导入 |
| `summary` | 整页业务定位，AI 的 `pageSummary` 会写进这里 |
| `route` | 预留给路由框架的原始信息（params / query），自由结构 |

归一化规则（`urlPattern()`）：UUID → `/:uuid`、纯数字段 → `/:id`、16 位以上十六进制 → `/:hash`，`#/xxx` 形式的 hash 路由会被保留。

---

## Annotation

```json
{
  "id": "anno_lz3k9a2y2c",
  "seq": 3,
  "type": "element",
  "category": "business-rule",
  "title": "出库需通过二级审批",
  "body": "订单金额超过 5 万时该按钮置灰，需部门负责人在审批区先给出复核意见。",
  "businessLogic": { /* 见下 */ },
  "dataBinding": { /* 见下 */ },
  "target": { /* 见下 */ },
  "tags": ["审批流"],
  "links": [{ "type": "next", "annotationId": "anno_xxx", "note": "审批通过后回到此按钮" }],
  "status": "active",
  "meta": {
    "author": "产品经理",
    "createdAt": "2026-08-15T02:03:11.000Z",
    "updatedAt": "2026-08-15T02:09:44.000Z",
    "source": "human",
    "aiConfidence": null,
    "reviewed": false
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | `anno_<时间36进制><序号><随机>`，时间有序，便于按创建顺序稳定排序；不依赖 `crypto.randomUUID` |
| `seq` | number | 页面内展示序号，标记气泡上的数字 |
| `type` | `element` \| `region` | 单元素标注，或框选出来的区域标注 |
| `category` | 见下表 | 不在预设内会**回退为 `note`** 并产生 warning |
| `title` / `body` | string | 两者都为空时警告「空标注」 |
| `tags` | string[] | 自由标签，用于侧栏筛选 |
| `links` | `{type, annotationId, note}[]` | 关联其它标注，表达「A 提交后跳到 B」这类跨元素流程，`type` 默认 `related` |
| `status` | 见下表 | 定位状态，由回放结果写入 |
| `meta.source` | `human` \| `ai` | AI 导入的一律是 `ai` |
| `meta.reviewed` | boolean | AI 结果需人工在侧栏逐条复核后才算定稿 |
| `meta.aiConfidence` | number \| null | AI 自评置信度 |

### category

| key | 标签 | 色值 | 用于 |
|-----|------|------|------|
| `business-rule` | 业务规则 | `#7c3aed` | 业务规则、门槛、计算口径 |
| `data-source` | 数据来源 | `#0ea5e9` | 数据来源、口径、更新时机 |
| `interaction` | 交互行为 | `#f59e0b` | 交互行为与副作用 |
| `validation` | 校验约束 | `#ef4444` | 必填、格式、范围约束 |
| `permission` | 权限可见性 | `#10b981` | 权限与可见性 |
| `state` | 状态流转 | `#6366f1` | 状态机、流转条件 |
| `todo` | 待确认 | `#e11d48` | 推断不确定，需向人确认 |
| `note` | 普通说明 | `#64748b` | 兜底分类 |

### status

| 值 | 含义 |
|----|------|
| `active` | 命中权威策略（`anchorId` / `testId` / `domId`）或加权置信度 ≥ 0.45 |
| `drifted` | 靠低权重策略勉强命中。工具会从实际命中的元素**重新采集线索**，下次加载即可回到 `active` |
| `orphaned` | 所有策略都失败。标注内容不丢，等人工「重新指定元素」 |

---

## businessLogic

「用注释说明业务逻辑」的结构化载体，AI design 最关心的部分。全部字段可选，**没有依据就留空，不要编造**。

```json
{
  "trigger": "点击「确认出库」按钮",
  "preconditions": ["订单状态为已付款", "当前用户具备 order:ship 权限"],
  "effect": "生成出库单并锁定库存",
  "postconditions": ["订单状态变为待发货", "库存流水落库"],
  "rules": ["金额超过 5 万需二级审批", "同一订单 24 小时内不可重复出库"],
  "errorStates": ["库存不足时提示并保持原状态", "并发出库时后到的请求失败"]
}
```

| 字段 | 类型 | 含义 |
|------|------|------|
| `trigger` | string | 什么动作 / 时机触发 |
| `preconditions` | string[] | 执行前必须成立的条件：权限、状态、数据前提 |
| `effect` | string | 核心行为，一句话说清系统做了什么 |
| `postconditions` | string[] | 执行后的可观测结果：状态变更、流水落库、通知 |
| `rules` | string[] | 可判定的业务规则，带上具体阈值与口径 |
| `errorStates` | string[] | 异常与边界：校验失败、并发、越权、空数据 |

---

## dataBinding

让下游能还原数据流。

```json
{
  "fields": [
    {
      "name": "reviewComment",
      "label": "复核意见",
      "type": "textarea",
      "required": true,
      "enumValues": [],
      "validation": "不少于 10 个字",
      "remark": "会写入审批流水，对客户不可见"
    }
  ],
  "apis": [{ "method": "POST", "path": "/api/orders/:id/ship", "purpose": "提交出库并锁定库存" }],
  "stateKeys": ["order.status", "auth.permissions"]
}
```

| 字段 | 说明 |
|------|------|
| `fields[].name` | 代码里的字段名 |
| `fields[].label` | 界面上的文案 |
| `fields[].validation` | 写**业务口径**而非正则 |
| `apis[].method` | 自动转大写，缺失时默认 `GET` |
| `apis[].purpose` | 说明业务用途，不要重复 `path` |
| `stateKeys` | 依赖的前端状态键 |

---

## target：多重定位

```json
{
  "strategies": [
    { "kind": "anchorId", "value": "anno_lz3k9a2y2c", "extra": null },
    { "kind": "testId", "value": "ship-btn", "extra": { "attr": "data-testid" } },
    { "kind": "componentPath", "value": "App>OrderDetail>ShipAction", "extra": null }
  ],
  "rect": { "x": 812, "y": 1044, "width": 96, "height": 32, "relativeTo": "document" },
  "snapshot": {
    "tag": "button",
    "role": "button",
    "text": "确认出库",
    "attrs": { "data-testid": "ship-btn" },
    "component": "ShipAction",
    "componentPath": ["App", "OrderDetail", "ShipAction"],
    "framework": "vue3",
    "sourceFile": ""
  },
  "resolved": { "kind": "testId", "confidence": 0.92 }
}
```

- `strategies` — 有序的定位线索，回放时全部参与加权投票。9 种 `kind` 与权重见 [README](../README.md#元素定位多重策略--自动降级)。`value` 形态随 `kind` 而定（字符串或数组），`extra` 放策略私有信息，如 `testId` 的属性名
- `rect` — 区域标注的坐标。`relativeTo` 为 `document`（相对文档左上角，滚动无关）或 `viewport`
- `snapshot` — 标注时刻的元素画像。既用于校验命中是否合理（相似度加成），也用于让 AI 理解元素是什么。`text` 截断到 240 字符
- `resolved` — 最近一次回放的结果：命中的策略与置信度

**至少要有 `strategies` 或 `rect` 之一**，否则这条标注无法定位到界面元素，`validateConfig` 会报 error。

---

## 校验行为

`validateConfig(raw)` 返回 `{ ok, config, errors, warnings }`。设计上**只在真正无法使用时才拒绝**——AI 输出经常「基本正确但细节缺失」，整份拒绝反而难用。

### errors（阻断导入）

| 条件 | 消息 |
|------|------|
| 不是对象 | 配置必须是一个对象 |
| 缺少 `pages` 数组 | 缺少 pages 数组 |
| 标注 `id` 重复 | `pages[i].annotations[j]` 的 id「xxx」重复 |
| 既无 `strategies` 也无 `rect` | `pages[i].annotations[j]` 既无定位策略也无坐标 |

### warnings（照常导入）

| 条件 | 处理 |
|------|------|
| `$schema` 不认识 | 按 `ui-annotator/annotation-config` 解析 |
| `version` 高于 1 | 提示可能有字段被忽略 |
| 页面缺 `url` | 提示回放时无法匹配页面 |
| `title` 和 `body` 都为空 | 提示是一条空标注 |
| `category` 不在预设内 | 回退为 `note` |

### 自动规整

外部数据在 `createConfig` 阶段会被就地修复，不报错：

| 输入 | 结果 |
|------|------|
| `rules: "金额超 5 万需审批\n24 小时不可重复"` | 按换行拆成数组，并剥掉行首的 `-` `*` `1.` |
| `rules: "单条规则"` | `["单条规则"]` |
| `preconditions: null` | `[]` |
| `type: "block"` | `"element"`（只认 `region`，其余归 `element`） |
| `status: "lost"` | `"active"` |
| `method: "post"` | `"POST"` |
| `confidence: "abc"` | 数字字段回退到默认值 |
| 缺 `id` | 自动生成 |

这意味着 AI 把字符串数组写成换行文本这类常见偏差不会导致整份配置失败。

---

## 相关

- 元素定位策略与降级机制 → [README](../README.md)
- AI 输出契约与撰写规范 → [.qoder/skills/ai-design-annotate/SKILL.md](../.qoder/skills/ai-design-annotate/SKILL.md)
- 实现 → [`src/core/schema.js`](../src/core/schema.js)、[`src/core/locator.js`](../src/core/locator.js)
