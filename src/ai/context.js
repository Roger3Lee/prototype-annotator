/**
 * 页面语义上下文抽取。
 *
 * 这是「AI 生成配置」这一环的输入端。核心思路：不把整棵 DOM 丢给模型（又贵又噪），
 * 而是剪枝成一份语义骨架 —— 只保留有业务含义的节点（可交互元素、表单、表格、
 * 标题、地标区域），并为每个节点分配一个短 ref。
 *
 * ref 是关键设计：AI 只需要回答「ref e12 的业务逻辑是什么」，
 * 不需要自己拼选择器。定位线索由本工具在抽取时同步采集，
 * 因此 AI 产出的配置天然可定位，不会出现「选择器写错了找不到元素」的问题。
 */

import { describeComponent, detectFramework } from '../core/framework.js';
import { captureTarget } from '../core/locator.js';
import {
  accessibleName,
  currentUrl,
  isVisible,
  normalizeText,
  roleOf,
  urlPattern,
} from '../core/utils.js';

/** 可交互、值得标注的元素 */
const INTERACTIVE_SELECTOR = [
  'a[href]', 'button', 'input:not([type=hidden])', 'select', 'textarea',
  '[role=button]', '[role=link]', '[role=tab]', '[role=checkbox]', '[role=radio]',
  '[role=switch]', '[role=menuitem]', '[role=combobox]', '[onclick]', '[tabindex]:not([tabindex="-1"])',
].join(',');

/** 结构性区域 */
const LANDMARK_SELECTOR = [
  'main', 'nav', 'aside', 'header', 'footer', 'form', 'dialog', 'table',
  '[role=main]', '[role=navigation]', '[role=dialog]', '[role=tablist]', '[role=search]',
].join(',');

/**
 * 抽取当前页面的语义上下文。
 *
 * @param {object} [options]
 * @param {number} [options.maxElements] 上限，防止超大页面产出爆炸的 payload
 * @param {boolean} [options.includeTree] 是否附带剪枝后的层级树
 * @param {Array} [options.annotations] 已有标注，供 AI 参考风格并避免重复
 * @returns {{context: object, refs: Map<string, Element>}}
 */
export function extractPageContext(options = {}) {
  const { maxElements = 160, includeTree = true, annotations = [] } = options;

  /** ref -> Element，供后续把 AI 输出还原成可定位的标注 */
  const refs = new Map();
  /** Element -> ref，避免同一元素被分配多个 ref */
  const assigned = new Map();
  let counter = 0;

  const refOf = (el) => {
    if (assigned.has(el)) return assigned.get(el);
    const ref = `e${++counter}`;
    assigned.set(el, ref);
    refs.set(ref, el);
    return ref;
  };

  const skip = (el) => !el || el.closest('ui-annotator-root') || !isVisible(el);

  /* ---------------- 页面级信息 ---------------- */

  const context = {
    page: {
      url: currentUrl(),
      urlPattern: urlPattern(),
      title: document.title,
      framework: detectFramework(),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      description: document.querySelector('meta[name=description]')?.content || '',
    },
    outline: [],
    regions: [],
    interactives: [],
    forms: [],
    tables: [],
    texts: [],
    existingAnnotations: [],
  };

  /* ---------------- 标题大纲 ---------------- */

  for (const el of document.querySelectorAll('h1,h2,h3,h4,[role=heading]')) {
    if (skip(el)) continue;
    const text = normalizeText(el.textContent, 90);
    if (!text) continue;
    context.outline.push({
      ref: refOf(el),
      level: Number(el.tagName[1]) || Number(el.getAttribute('aria-level')) || 2,
      text,
    });
  }

  /* ---------------- 地标区域 ---------------- */

  for (const el of document.querySelectorAll(LANDMARK_SELECTOR)) {
    if (skip(el)) continue;
    const component = describeComponent(el);
    context.regions.push({
      ref: refOf(el),
      tag: el.tagName.toLowerCase(),
      role: roleOf(el),
      name: accessibleName(el),
      component: component.component || undefined,
      // 区域摘要帮模型建立整体印象
      summary: normalizeText(el.textContent, 120),
    });
    if (context.regions.length >= 30) break;
  }

  /* ---------------- 表单与字段 ---------------- */

  for (const form of document.querySelectorAll('form, [role=form]')) {
    if (skip(form)) continue;
    const fields = [];
    for (const control of form.querySelectorAll('input:not([type=hidden]), select, textarea')) {
      if (skip(control)) continue;
      fields.push(describeControl(control, refOf(control)));
      if (fields.length >= 40) break;
    }
    const submit = form.querySelector('[type=submit], button:not([type=button])');
    context.forms.push({
      ref: refOf(form),
      name: accessibleName(form) || form.getAttribute('name') || '',
      component: describeComponent(form).component || undefined,
      action: form.getAttribute('action') || '',
      method: (form.getAttribute('method') || 'get').toUpperCase(),
      fields,
      submitRef: submit && !skip(submit) ? refOf(submit) : undefined,
    });
    if (context.forms.length >= 10) break;
  }

  /* ---------------- 表格 ---------------- */

  for (const table of document.querySelectorAll('table, [role=table], [role=grid]')) {
    if (skip(table)) continue;
    const headers = Array.from(table.querySelectorAll('thead th, [role=columnheader]'))
      .map((th) => normalizeText(th.textContent, 40))
      .filter(Boolean);
    const bodyRows = table.querySelectorAll('tbody tr, [role=row]').length;
    context.tables.push({
      ref: refOf(table),
      caption: normalizeText(table.querySelector('caption')?.textContent, 60),
      component: describeComponent(table).component || undefined,
      columns: headers,
      rowCount: bodyRows,
    });
    if (context.tables.length >= 8) break;
  }

  /* ---------------- 可交互元素 ---------------- */

  for (const el of document.querySelectorAll(INTERACTIVE_SELECTOR)) {
    if (skip(el)) continue;
    // 表单控件已在 forms 里详细描述过，不重复列
    if (assigned.has(el) && el.closest('form')) continue;
    const component = describeComponent(el);
    context.interactives.push({
      ref: refOf(el),
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || undefined,
      role: roleOf(el),
      name: accessibleName(el),
      component: component.component || undefined,
      componentPath: component.componentPath.length ? component.componentPath.join('>') : undefined,
      href: el.getAttribute('href') || undefined,
      disabled: el.disabled || el.getAttribute('aria-disabled') === 'true' || undefined,
    });
    if (context.interactives.length >= maxElements) break;
  }

  /* ---------------- 有信息量的静态文本 ---------------- */

  for (const el of document.querySelectorAll('p, li, td, dd, span, div')) {
    if (context.texts.length >= 40) break;
    if (skip(el) || el.childElementCount > 0) continue;   // 只取叶子节点，避免重复
    const text = normalizeText(el.textContent, 100);
    // 过短的文本没有业务信息量
    if (text.length < 8) continue;
    context.texts.push({ ref: refOf(el), text });
  }

  /* ---------------- 已有标注（供 AI 参考、避免重复） ---------------- */

  context.existingAnnotations = annotations.map((a) => ({
    id: a.id,
    seq: a.seq,
    category: a.category,
    title: a.title,
    body: normalizeText(a.body, 160),
    targetText: normalizeText(a.target?.snapshot?.text, 60),
  }));

  /* ---------------- 剪枝后的层级树 ---------------- */

  if (includeTree) {
    context.tree = pruneTree(document.body, assigned, 0);
  }

  context.refHints = {
    note: '标注请通过 ref 引用元素，例如 "ref": "e12"。不要自行编写 CSS 选择器。',
    total: refs.size,
  };

  return { context, refs };
}

/** 表单控件的详细画像：AI 需要它来推断校验规则与数据类型 */
function describeControl(el, ref) {
  const tag = el.tagName.toLowerCase();
  const field = {
    ref,
    name: el.getAttribute('name') || el.id || '',
    label: accessibleName(el),
    control: tag,
    type: tag === 'input' ? (el.getAttribute('type') || 'text') : tag,
    required: el.required || el.getAttribute('aria-required') === 'true' || undefined,
    placeholder: el.getAttribute('placeholder') || undefined,
    disabled: el.disabled || undefined,
    readOnly: el.readOnly || undefined,
  };

  // 原生校验属性直接就是业务规则的线索
  for (const attr of ['min', 'max', 'minlength', 'maxlength', 'step', 'pattern']) {
    const value = el.getAttribute(attr);
    if (value != null) field[attr] = value;
  }
  if (tag === 'select') {
    field.options = Array.from(el.options).slice(0, 20).map((o) => ({
      value: o.value,
      text: normalizeText(o.textContent, 30),
    }));
  }
  return field;
}

/**
 * 把 DOM 剪枝成语义树：只保留已分配 ref 的节点及其祖先链，
 * 让模型能看出「这个按钮在哪个卡片的哪个区域里」。
 */
function pruneTree(el, assigned, depth) {
  if (depth > 12 || !el || el.nodeType !== 1) return null;
  if (el.closest?.('ui-annotator-root')) return null;

  const children = [];
  for (const child of el.children) {
    const node = pruneTree(child, assigned, depth + 1);
    if (node) children.push(node);
    if (children.length >= 24) break;
  }

  const ref = assigned.get(el);
  // 自己没 ref、子树也没内容的分支整条剪掉
  if (!ref && !children.length) return null;
  // 只有一个子节点且自己无语义时，压平这一层，减少嵌套噪声
  if (!ref && children.length === 1) return children[0];

  const node = { tag: el.tagName.toLowerCase() };
  if (ref) node.ref = ref;
  const role = roleOf(el);
  if (role) node.role = role;
  const name = accessibleName(el);
  if (name && name.length < 40) node.name = name;
  const component = describeComponent(el).component;
  if (component) node.component = component;
  if (children.length) node.children = children;
  return node;
}

/**
 * 把 AI 返回的标注还原成完整标注对象。
 *
 * AI 只提供 ref + 业务语义，定位线索在这里用 refs 里的真实元素现场采集，
 * 保证产出的配置一定能定位回界面。
 *
 * @param {Array} items AI 输出的 annotations 数组
 * @param {Map<string, Element>} refs extractPageContext 返回的 ref 映射
 * @returns {{annotations: Array, skipped: Array}}
 */
export function materializeAiAnnotations(items, refs) {
  const annotations = [];
  const skipped = [];

  for (const item of Array.isArray(items) ? items : []) {
    const el = refs.get(String(item?.ref || '').trim());
    if (!el || !el.isConnected) {
      skipped.push({ ref: item?.ref, title: item?.title, reason: 'ref 不存在或元素已从页面移除' });
      continue;
    }
    annotations.push({
      ...item,
      target: captureTarget(el),
      type: 'element',
      meta: {
        source: 'ai',
        aiConfidence: item.confidence ?? null,
        reviewed: false,
        author: item.author || 'ai',
      },
    });
  }
  return { annotations, skipped };
}
