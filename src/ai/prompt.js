/**
 * 提示词构建。
 *
 * 产出的提示词遵循一个约束：**要求模型只输出 JSON，且元素一律用 ref 引用**。
 * 这样输出可以直接被 materializeAiAnnotations 还原成可定位的标注，
 * 不依赖模型正确书写 CSS 选择器。
 */

import { CATEGORIES } from '../core/schema.js';

/** 输出契约。单独抽出来，便于在 Skill 文档与提示词之间保持一致。 */
export const AI_OUTPUT_CONTRACT = {
  annotations: [
    {
      ref: 'e12  // 必填，引用上下文里的元素 ref',
      category: '业务规则 | 数据来源 | 交互行为 | 校验约束 | 权限可见性 | 状态流转 | 待确认 | 普通说明 之一的 key',
      title: '一句话概括该元素的业务职责',
      body: '用业务语言说明这里发生什么、为什么这样设计',
      businessLogic: {
        trigger: '什么触发',
        preconditions: ['前置条件'],
        effect: '核心行为',
        postconditions: ['执行结果'],
        rules: ['具体业务规则'],
        errorStates: ['异常与边界'],
      },
      dataBinding: {
        fields: [{ name: '', label: '', type: '', required: false, validation: '' }],
        apis: [{ method: 'POST', path: '/api/xxx', purpose: '' }],
        stateKeys: [],
      },
      tags: [],
      confidence: 0.8,
    },
  ],
  pageSummary: '整页的业务定位，一到三句',
  glossary: [{ term: '业务术语', definition: '解释' }],
};

const CATEGORY_LINES = CATEGORIES.map((c) => `  - ${c.key}：${c.label}`).join('\n');

/**
 * 生成用于标注的提示词。
 *
 * @param {object} context extractPageContext 产出的上下文
 * @param {object} [options]
 * @param {string} [options.domain]   业务域说明，例如「跨境电商订单中台」
 * @param {string} [options.language] 输出语言
 * @param {string} [options.focus]    本次重点，例如「只标注与审批流相关的元素」
 * @param {number} [options.maxAnnotations]
 */
export function buildPrompt(context, options = {}) {
  const {
    domain = '',
    language = '中文',
    focus = '',
    maxAnnotations = 25,
  } = options;

  return `你是一位资深业务分析师，正在为一套前端界面补充「业务逻辑说明」，产出结果将用于驱动 AI design（由标注反推设计与实现）。

## 任务
阅读下面的页面语义上下文，挑出**最能体现业务逻辑**的界面元素，为它们逐条写出业务说明。

${domain ? `## 业务域\n${domain}\n` : ''}${focus ? `## 本次重点\n${focus}\n` : ''}
## 硬性要求
1. 只输出一个 JSON 对象，不要任何解释文字，不要 Markdown 代码块以外的内容。
2. 元素**必须**用上下文中给出的 \`ref\` 引用（如 "e12"）。**禁止**自己编写 CSS 选择器、xpath 或元素描述来代替 ref。
3. 最多输出 ${maxAnnotations} 条标注。优先级：核心业务动作 > 数据录入与校验 > 状态与权限 > 导航 > 纯展示文本。
4. 不要为纯装饰性元素（图标、分隔线、无文案容器）写标注。
5. 说明使用${language}，用业务语言而非技术语言。写「订单金额超过 5 万需二级审批」，而不是「amount > 50000 时调用 approve 接口」。
6. 推断不确定时，把 category 设为 \`todo\`，并在 body 里写明需要向谁确认什么。confidence 如实给 0~1 的数值。
7. 已存在的标注（existingAnnotations）不要重复产出，可在必要时补充遗漏维度。

## category 取值
${CATEGORY_LINES}

## 输出格式
\`\`\`json
${JSON.stringify(AI_OUTPUT_CONTRACT, null, 2)}
\`\`\`
字段说明：businessLogic 与 dataBinding 的所有子字段都可选，没有把握就省略，**不要编造**。

## 页面语义上下文
\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\`
`;
}

/**
 * 生成「校对/补全」提示词：已有人工标注，让模型补齐结构化字段而不改写业务含义。
 * 适合先人工粗标、再让 AI 精加工的工作流。
 */
export function buildRefinePrompt(context, options = {}) {
  const { language = '中文' } = options;

  return `你是一位资深业务分析师。下面是一个前端页面的语义上下文，以及人工已经写好的标注（existingAnnotations）。

## 任务
在**不改变人工标注原意**的前提下，把每条标注补全为结构化格式：
- 从 body 的自然语言里抽出 businessLogic 的 trigger / preconditions / effect / postconditions / rules / errorStates；
- 从页面上下文里补出 dataBinding 的 fields / apis / stateKeys；
- 修正明显笔误，但不得新增人工没有表达过的业务含义；
- 若人工标注含义模糊，保留原文并把 category 改为 \`todo\`，在 body 末尾追加「（待确认：具体问题）」。

## 硬性要求
1. 只输出 JSON。每条标注必须带上原有的 \`id\` 字段（用于匹配更新），同时保留 \`ref\`。
2. 使用${language}。不要编造接口路径与字段名，页面上下文里没有依据的一律省略。

## 输出格式
\`\`\`json
{
  "annotations": [
    { "id": "原标注 id", "ref": "e12", "category": "...", "title": "...", "body": "...",
      "businessLogic": { }, "dataBinding": { }, "confidence": 0.9 }
  ]
}
\`\`\`

## 页面语义上下文
\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\`
`;
}

/**
 * 从模型回复里抽出 JSON。
 * 模型经常带上 ```json 围栏或前后寒暄，这里逐级尝试解析。
 */
export function parseAiResponse(text) {
  if (!text) return { ok: false, data: null, error: '响应为空' };
  if (typeof text === 'object') return { ok: true, data: text, error: null };

  const candidates = [];
  // 1) 代码围栏内的内容
  const fence = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1]);
  // 2) 整段
  candidates.push(String(text));
  // 3) 第一个 { 到最后一个 } 之间
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      return { ok: true, data: JSON.parse(candidate.trim()), error: null };
    } catch {
      /* 试下一个 */
    }
  }
  return { ok: false, data: null, error: '无法从响应中解析出 JSON' };
}
