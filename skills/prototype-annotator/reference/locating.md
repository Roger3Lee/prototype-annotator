# 元素定位：多重策略 + 自动降级

标注最怕页面一改就找不到元素。ui-annotator 的做法是**一次采集 9 种线索，回放时加权投票**。

这些线索由工具在抽取 AI 上下文时自动采集，与 ref 一一对应 —— 写标注时不需要、也不应该自己构造任何选择器。

## 策略与权重

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

生成类 token（CSS Modules 哈希、styled-components、Tailwind JIT、Vue scoped 哈希）会被识别并排除，不会成为定位线索。

## 三种状态

| 状态 | 含义 | 侧栏表现 |
|------|------|----------|
| `active` | 命中权威策略（anchorId / testId / domId）或置信度 ≥ 0.45 | 正常 |
| `drifted` | 靠低权重策略勉强命中。工具会**从实际命中的元素重新采集线索**（自愈），下次加载即可回到 active | 标黄 |
| `orphaned` | 所有策略都失败。标注内容不丢，等人工「重新指定元素」 | 标红 |

## 对写标注的影响

- **`title` / `body` 要能脱离位置成立。** 标注可能漂移到相邻元素，写「这个按钮右边的输入框」会直接失真
- **看到 `existingAnnotations` 里有 `orphaned` 状态的条目**，说明页面结构变过，不要照抄它的措辞去描述当前元素
- **`todo` 分类的价值**：定位不确定时，把疑问写清楚比强行断言更有用

## 页面标识

标注按页面分组，页面身份用归一化后的 `urlPattern`：

- `/orders/1024` 与 `/orders/2048` 都归一为 `/orders/:id`
- UUID → `/:uuid`，16 位以上十六进制 → `/:hash`
- `#/xxx` 形式的 hash 路由会保留
- `file://` 下只取文件名，保证导出的配置能跨机器回放