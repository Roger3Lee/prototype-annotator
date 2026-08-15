/**
 * 通用工具。刻意保持零依赖，且所有浏览器 API 访问都做了防御，
 * 因为本库需要能在 file:// 打开的静态页面里直接运行。
 */

/** 是否运行在浏览器里（避免 SSR 阶段直接崩） */
export const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

/** file:// 场景下 localStorage、fetch 行为都不可靠，需要单独降级 */
export const isFileProtocol = isBrowser && window.location.protocol === 'file:';

export function noop() {}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function escapeHtml(input) {
  return String(input == null ? '' : input).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

/** 折叠空白并截断，用于把元素文本压成一行可读摘要 */
export function normalizeText(input, max = 120) {
  const text = String(input == null ? '' : input).replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

export function throttleRaf(fn) {
  let scheduled = false;
  let lastArgs = null;
  return function throttled(...args) {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fn(...lastArgs);
    });
  };
}

export function debounce(fn, wait = 200) {
  let timer = null;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function deepClone(value) {
  if (value == null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* 含函数等不可克隆值时回退 */
    }
  }
  return JSON.parse(JSON.stringify(value));
}

/* ------------------------------------------------------------------ */
/* DOM                                                                 */
/* ------------------------------------------------------------------ */

/** 元素是否真实占位可见。用于过滤掉不值得标注的隐藏节点。 */
export function isVisible(el) {
  if (!el || el.nodeType !== 1) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
}

/** 相对文档（而非视口）的坐标，滚动后依然有效 */
export function getDocumentRect(el) {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + window.scrollX,
    y: rect.top + window.scrollY,
    width: rect.width,
    height: rect.height,
    relativeTo: 'document',
  };
}

/** 可访问名：优先 aria-label，再 label/alt/title，最后退回可见文本 */
export function accessibleName(el) {
  if (!el || el.nodeType !== 1) return '';
  const aria = el.getAttribute?.('aria-label');
  if (aria) return normalizeText(aria, 80);

  const labelledBy = el.getAttribute?.('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => el.ownerDocument?.getElementById(id)?.textContent || '')
      .join(' ');
    if (text.trim()) return normalizeText(text, 80);
  }

  if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
    if (el.labels?.length) return normalizeText(el.labels[0].textContent, 80);
    const ph = el.getAttribute('placeholder');
    if (ph) return normalizeText(ph, 80);
  }
  if (el.tagName === 'IMG') return normalizeText(el.getAttribute('alt'), 80);

  const title = el.getAttribute?.('title');
  if (title) return normalizeText(title, 80);

  return normalizeText(el.textContent, 80);
}

/** 显式 role，或按标签推断出的隐含 role */
export function roleOf(el) {
  const explicit = el.getAttribute?.('role');
  if (explicit) return explicit;
  const tag = el.tagName?.toLowerCase();
  const implicit = {
    a: el.hasAttribute?.('href') ? 'link' : '',
    button: 'button',
    input: inputRole(el),
    select: 'combobox',
    textarea: 'textbox',
    table: 'table',
    form: 'form',
    nav: 'navigation',
    main: 'main',
    header: 'banner',
    footer: 'contentinfo',
    aside: 'complementary',
    ul: 'list',
    ol: 'list',
    li: 'listitem',
    img: 'img',
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    dialog: 'dialog',
  }[tag];
  return implicit || '';
}

function inputRole(el) {
  const type = (el.getAttribute?.('type') || 'text').toLowerCase();
  return {
    checkbox: 'checkbox',
    radio: 'radio',
    button: 'button',
    submit: 'button',
    reset: 'button',
    range: 'slider',
    search: 'searchbox',
    number: 'spinbutton',
  }[type] || 'textbox';
}

/**
 * 判断 class / id 是否是构建产物生成的随机串（CSS Modules、styled-components、
 * Tailwind JIT、Vue scoped 等）。这类标识跨构建会变，绝不能作为定位依据。
 */
export function isGeneratedToken(token) {
  if (!token) return true;
  return (
    /^(css|sc|jsx|emotion|svelte)-/.test(token) ||      // 常见 CSS-in-JS 前缀
    /^data-v-[0-9a-f]{6,}$/.test(token) ||               // Vue scoped
    /[0-9a-f]{6,}$/i.test(token) && /\d/.test(token) ||  // 尾部哈希
    /^_+[0-9a-z]{4,}$/i.test(token) ||                   // _1a2b3c
    /^[a-z]{1,3}[0-9]{4,}$/i.test(token) ||              // ab12345
    token.length > 40
  );
}

/** 挑出可用于选择器的稳定 class */
export function stableClasses(el, limit = 3) {
  const list = Array.from(el.classList || []);
  return list.filter((c) => !isGeneratedToken(c) && !c.startsWith('ui-anno')).slice(0, limit);
}

/** CSS 选择器转义，优先用原生 CSS.escape */
export function cssEscape(value) {
  const s = String(value);
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g, (ch) => '\\' + ch);
}

/** 同类兄弟节点中的序号（1-based），用于 nth-of-type 路径 */
export function indexAmongSiblings(el) {
  let index = 1;
  let sib = el.previousElementSibling;
  while (sib) {
    if (sib.tagName === el.tagName) index += 1;
    sib = sib.previousElementSibling;
  }
  return index;
}

/** 安全地查询，非法选择器不抛错 */
export function safeQueryAll(selector, root = document) {
  if (!selector) return [];
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* URL                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 把 URL 归一化成路由模式：数字段、UUID、长哈希都替换成占位符，
 * 这样 /orders/1024 与 /orders/2048 会被认为是同一个页面。
 */
export function urlPattern(href = isBrowser ? window.location.href : '') {
  let path = href;
  try {
    const url = new URL(href, 'http://localhost');
    // file:// 下 pathname 带着盘符与目录层级，换台机器或挪个目录就对不上，
    // 因此只取文件名，保证导出的配置能跨机器回放（与 currentUrl 保持一致）
    path = url.protocol === 'file:'
      ? '/' + (url.pathname.split('/').pop() || 'index.html')
      : url.pathname;
    if (url.hash.startsWith('#/')) path += url.hash;
  } catch {
    /* file:// 或相对路径时直接用原串 */
  }
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/\/[0-9a-f]{16,}(?=\/|$)/gi, '/:hash')
    .replace(/\/+$/, '') || '/';
}

/** file:// 下取文件名，http 下取完整 URL，作为页面标识 */
export function currentUrl() {
  if (!isBrowser) return '';
  if (isFileProtocol) {
    const parts = window.location.pathname.split('/');
    return parts[parts.length - 1] + window.location.hash;
  }
  return window.location.href;
}
