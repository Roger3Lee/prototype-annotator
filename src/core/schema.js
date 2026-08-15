/**
 * 标注配置的数据契约（v1）。
 *
 * 这份 schema 是整个工具的中心：浮层 UI 读它渲染、导出时序列化它、
 * AI 生成的结果也必须收敛到它。所以这里同时提供「构造默认值」和「校验/修复」
 * 两类能力，保证外部（尤其是 AI）传进来的脏数据不会污染运行时。
 */

export const SCHEMA_ID = 'ui-annotator/annotation-config';
export const SCHEMA_VERSION = 1;

/** 标注分类：决定标记的颜色与在侧栏中的分组。 */
export const CATEGORIES = [
  { key: 'business-rule', label: '业务规则', color: '#7c3aed' },
  { key: 'data-source', label: '数据来源', color: '#0ea5e9' },
  { key: 'interaction', label: '交互行为', color: '#f59e0b' },
  { key: 'validation', label: '校验约束', color: '#ef4444' },
  { key: 'permission', label: '权限可见性', color: '#10b981' },
  { key: 'state', label: '状态流转', color: '#6366f1' },
  { key: 'todo', label: '待确认', color: '#e11d48' },
  { key: 'note', label: '普通说明', color: '#64748b' },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

/** 标注定位状态。drifted 表示靠降级策略找回，orphaned 表示彻底找不到。 */
export const STATUSES = ['active', 'drifted', 'orphaned'];

export function categoryOf(key) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}

/* ------------------------------------------------------------------ */
/* 构造                                                                */
/* ------------------------------------------------------------------ */

let seqCounter = 0;

/** 生成时间有序的 id，便于按创建顺序稳定排序，且不依赖 crypto.randomUUID。 */
export function createId(prefix = 'anno') {
  seqCounter = (seqCounter + 1) % 4096;
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${time}${seqCounter.toString(36)}${rand}`;
}

/** 业务逻辑描述：这是「用注释说明业务逻辑」的结构化载体，也是 AI design 最关心的部分。 */
export function createBusinessLogic(input = {}) {
  return {
    /** 什么触发了这段逻辑，例如「用户点击提交」「页面首次加载」 */
    trigger: str(input.trigger),
    /** 执行前必须成立的条件 */
    preconditions: strList(input.preconditions),
    /** 实际发生了什么，核心行为描述 */
    effect: str(input.effect),
    /** 执行成功后系统进入的状态 */
    postconditions: strList(input.postconditions),
    /** 具体的业务规则，如「金额超过 5 万需二级审批」 */
    rules: strList(input.rules),
    /** 异常与边界情况 */
    errorStates: strList(input.errorStates),
  };
}

/** 数据绑定：字段、接口、状态来源，让 AI 能还原出数据流。 */
export function createDataBinding(input = {}) {
  return {
    fields: asArray(input.fields).map((f) => ({
      name: str(f?.name),
      label: str(f?.label),
      type: str(f?.type),
      required: Boolean(f?.required),
      enumValues: strList(f?.enumValues),
      validation: str(f?.validation),
      remark: str(f?.remark),
    })),
    apis: asArray(input.apis).map((a) => ({
      method: (str(a?.method) || 'GET').toUpperCase(),
      path: str(a?.path),
      purpose: str(a?.purpose),
    })),
    stateKeys: strList(input.stateKeys),
  };
}

/**
 * 定位目标。strategies 是有序的多重定位线索，回放时从前往后尝试；
 * snapshot 保留标注时刻的元素画像，既用于校验命中是否合理，也用于 AI 理解上下文。
 */
export function createTarget(input = {}) {
  return {
    strategies: asArray(input.strategies)
      .filter((s) => s && typeof s.kind === 'string')
      .map((s) => ({ kind: s.kind, value: s.value, extra: s.extra ?? null })),
    rect: input.rect ? normalizeRect(input.rect) : null,
    snapshot: {
      tag: str(input.snapshot?.tag),
      role: str(input.snapshot?.role),
      text: str(input.snapshot?.text).slice(0, 240),
      attrs: plainObject(input.snapshot?.attrs),
      component: str(input.snapshot?.component),
      componentPath: strList(input.snapshot?.componentPath),
      framework: str(input.snapshot?.framework),
      sourceFile: str(input.snapshot?.sourceFile),
    },
    resolved: input.resolved
      ? { kind: str(input.resolved.kind), confidence: num(input.resolved.confidence, 0) }
      : null,
  };
}

export function createAnnotation(input = {}) {
  const now = new Date().toISOString();
  return {
    id: str(input.id) || createId(),
    seq: num(input.seq, 0),
    type: input.type === 'region' ? 'region' : 'element',
    category: CATEGORY_KEYS.includes(input.category) ? input.category : 'note',
    title: str(input.title),
    body: str(input.body),
    businessLogic: createBusinessLogic(input.businessLogic),
    dataBinding: createDataBinding(input.dataBinding),
    target: createTarget(input.target),
    tags: strList(input.tags),
    /** 关联其它标注，用于表达「A 提交后跳到 B」这类跨元素流程 */
    links: asArray(input.links).map((l) => ({
      type: str(l?.type) || 'related',
      annotationId: str(l?.annotationId),
      note: str(l?.note),
    })),
    status: STATUSES.includes(input.status) ? input.status : 'active',
    meta: {
      author: str(input.meta?.author) || 'anonymous',
      createdAt: str(input.meta?.createdAt) || now,
      updatedAt: str(input.meta?.updatedAt) || now,
      /** human = 人工标注，ai = AI 生成待确认 */
      source: input.meta?.source === 'ai' ? 'ai' : 'human',
      aiConfidence: input.meta?.aiConfidence == null ? null : num(input.meta.aiConfidence, 0),
      reviewed: Boolean(input.meta?.reviewed),
    },
  };
}

export function createPage(input = {}) {
  return {
    id: str(input.id) || createId('page'),
    url: str(input.url),
    /** 归一化后的路由模式，把 /orders/1024 收敛成 /orders/:id，避免同一页面因参数不同被拆成多条 */
    urlPattern: str(input.urlPattern),
    title: str(input.title),
    route: plainObject(input.route),
    summary: str(input.summary),
    viewport: {
      width: num(input.viewport?.width, 0),
      height: num(input.viewport?.height, 0),
      dpr: num(input.viewport?.dpr, 1),
    },
    annotations: asArray(input.annotations).map(createAnnotation),
  };
}

export function createConfig(input = {}) {
  return {
    $schema: SCHEMA_ID,
    version: SCHEMA_VERSION,
    project: {
      name: str(input.project?.name),
      framework: str(input.project?.framework) || 'unknown',
      generatedAt: str(input.project?.generatedAt) || new Date().toISOString(),
      generator: str(input.project?.generator) || 'ui-annotator',
    },
    /** 跨页面共享的术语表，帮助 AI 统一业务词汇 */
    glossary: asArray(input.glossary).map((g) => ({
      term: str(g?.term),
      definition: str(g?.definition),
    })),
    pages: asArray(input.pages).map(createPage),
  };
}

/* ------------------------------------------------------------------ */
/* 校验                                                                */
/* ------------------------------------------------------------------ */

/**
 * 校验外部导入的配置（人工手写或 AI 生成）。
 * 返回 { ok, config, errors, warnings }：即使有 warning 也会给出可用的 config，
 * 因为 AI 输出经常「基本正确但细节缺失」，直接整份拒绝反而难用。
 */
export function validateConfig(raw) {
  const errors = [];
  const warnings = [];

  if (!raw || typeof raw !== 'object') {
    return { ok: false, config: null, errors: ['配置必须是一个对象'], warnings };
  }
  if (raw.$schema && raw.$schema !== SCHEMA_ID) {
    warnings.push(`未知的 $schema「${raw.$schema}」，已按 ${SCHEMA_ID} 解析`);
  }
  if (raw.version && Number(raw.version) > SCHEMA_VERSION) {
    warnings.push(`配置版本 ${raw.version} 高于当前支持的 ${SCHEMA_VERSION}，可能有字段被忽略`);
  }
  if (!Array.isArray(raw.pages)) {
    errors.push('缺少 pages 数组');
    return { ok: false, config: null, errors, warnings };
  }

  const seenIds = new Set();
  raw.pages.forEach((page, pi) => {
    if (!page?.url) warnings.push(`pages[${pi}] 缺少 url，回放时无法匹配页面`);
    asArray(page?.annotations).forEach((anno, ai) => {
      const at = `pages[${pi}].annotations[${ai}]`;
      if (!anno?.title && !anno?.body) {
        warnings.push(`${at} 既没有 title 也没有 body，是一条空标注`);
      }
      if (anno?.id) {
        if (seenIds.has(anno.id)) errors.push(`${at} 的 id「${anno.id}」重复`);
        seenIds.add(anno.id);
      }
      if (anno?.category && !CATEGORY_KEYS.includes(anno.category)) {
        warnings.push(`${at} 的 category「${anno.category}」不在预设分类中，已回退为 note`);
      }
      const strategies = asArray(anno?.target?.strategies).filter((s) => s?.kind);
      if (!strategies.length && !anno?.target?.rect) {
        errors.push(`${at} 既无定位策略也无坐标，无法定位到界面元素`);
      }
    });
  });

  return {
    ok: errors.length === 0,
    config: errors.length === 0 ? createConfig(raw) : null,
    errors,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function str(v) {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

/** AI 常把字符串数组写成单个字符串或换行文本，这里统一兜住 */
function strList(v) {
  if (Array.isArray(v)) return v.map(str).map((s) => s.trim()).filter(Boolean);
  const s = str(v).trim();
  if (!s) return [];
  return s.split('\n').map((x) => x.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean);
}

function plainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function normalizeRect(rect) {
  return {
    x: num(rect.x, 0),
    y: num(rect.y, 0),
    width: num(rect.width, 0),
    height: num(rect.height, 0),
    /** document = 相对文档左上角（滚动无关），viewport = 相对可视区 */
    relativeTo: rect.relativeTo === 'viewport' ? 'viewport' : 'document',
  };
}
