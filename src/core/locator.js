/**
 * 定位引擎。
 *
 * 设计要点：标注时不只记一个选择器，而是同时采集 9 类定位线索并按权重排序；
 * 回放时让所有线索各自投票，得票最高的元素胜出。这样单一线索失效（改了 class、
 * 挪了位置、换了文案）不会导致标注丢失，只会降低置信度。
 *
 * 权重越高代表线索越稳定：显式埋点 > 测试 id > 语义角色 > 组件路径 > 结构路径 > 文案。
 */

import { describeComponent, findByComponentPath } from './framework.js';
import {
  accessibleName,
  cssEscape,
  getDocumentRect,
  indexAmongSiblings,
  isVisible,
  normalizeText,
  roleOf,
  safeQueryAll,
  stableClasses,
  isGeneratedToken,
} from './utils.js';

/** 标注工具自己的 DOM 一律排除在拾取与定位之外 */
const OWN_MARKUP = 'ui-annotator-root';

/** 常见测试/埋点属性，按可信度排序 */
const TEST_ID_ATTRS = ['data-anno-id', 'data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa', 'data-track'];

function isOwnElement(el) {
  return !el || !el.closest || Boolean(el.closest(OWN_MARKUP));
}

function tagOf(el) {
  return el.tagName ? el.tagName.toLowerCase() : '';
}

/** 过滤掉工具自身与不可见节点 */
function usable(list) {
  return list.filter((el) => el && el.nodeType === 1 && !isOwnElement(el));
}

/* ------------------------------------------------------------------ */
/* 策略定义                                                            */
/* ------------------------------------------------------------------ */

/**
 * 每个策略：
 *   capture(el)          -> value / null      标注时采集线索
 *   resolve(value,extra) -> Element[]         回放时找出候选元素
 *   weight               -> number            投票权重
 */
export const STRATEGIES = [
  {
    kind: 'anchorId',
    weight: 100,
    capture(el) {
      const value = el.getAttribute('data-anno-id');
      return value ? { value } : null;
    },
    resolve(value) {
      return usable(safeQueryAll(`[data-anno-id="${cssEscape(value)}"]`));
    },
  },

  {
    kind: 'testId',
    weight: 90,
    capture(el) {
      for (const attr of TEST_ID_ATTRS) {
        const value = el.getAttribute(attr);
        if (value) return { value, extra: { attr } };
      }
      return null;
    },
    resolve(value, extra) {
      const attr = extra?.attr || 'data-testid';
      return usable(safeQueryAll(`[${attr}="${cssEscape(value)}"]`));
    },
  },

  {
    kind: 'domId',
    weight: 70,
    capture(el) {
      // 构建工具生成的随机 id 不可信，宁可不记
      if (!el.id || isGeneratedToken(el.id)) return null;
      return { value: el.id };
    },
    resolve(value) {
      const el = document.getElementById(value);
      return usable(el ? [el] : []);
    },
  },

  {
    kind: 'ariaPath',
    weight: 55,
    capture(el) {
      const role = roleOf(el);
      const name = accessibleName(el);
      if (!role && !name) return null;
      return { value: `${role}|${name}`, extra: { landmark: nearestLandmarkSelector(el) } };
    },
    resolve(value, extra) {
      const [role, name] = String(value).split('|');
      const scopes = extra?.landmark ? safeQueryAll(extra.landmark) : [];
      const roots = scopes.length ? scopes : [document.body];
      const found = [];
      for (const root of roots) {
        if (!root) continue;
        for (const el of usable(safeQueryAll('*', root))) {
          if (role && roleOf(el) !== role) continue;
          if (name && accessibleName(el) !== name) continue;
          if (!role && !name) continue;
          found.push(el);
        }
      }
      return found;
    },
  },

  {
    kind: 'componentPath',
    weight: 50,
    capture(el) {
      const info = describeComponent(el);
      if (!info.componentPath.length) return null;
      return {
        value: info.componentPath.join('>'),
        // 组件根到目标元素的相对结构路径，用于在组件内部再收敛一次
        extra: { within: relativeNthPath(el, componentRootOf(el)) },
      };
    },
    resolve(value, extra) {
      const roots = usable(findByComponentPath(String(value).split('>')));
      if (!roots.length) return [];
      const within = extra?.within;
      if (!within) return roots;
      const found = [];
      for (const root of roots) {
        const el = within === ':self' ? root : root.querySelector(within);
        if (el) found.push(el);
      }
      // 相对路径没命中时退回组件根，好过完全丢失
      return found.length ? usable(found) : roots;
    },
  },

  {
    kind: 'textual',
    weight: 35,
    capture(el) {
      // 只对「文本就是其身份」的元素有意义，容器的拼接文本没有区分度
      if (el.childElementCount > 2) return null;
      const text = normalizeText(el.textContent, 60);
      if (!text || text.length < 2) return null;
      const tag = tagOf(el);
      const peers = usable(safeQueryAll(tag)).filter(
        (node) => normalizeText(node.textContent, 60) === text
      );
      return { value: text, extra: { tag, index: Math.max(0, peers.indexOf(el)) } };
    },
    resolve(value, extra) {
      const tag = extra?.tag || '*';
      const matched = usable(safeQueryAll(tag)).filter(
        (el) => normalizeText(el.textContent, 60) === value
      );
      if (!matched.length) return [];
      const index = Number(extra?.index) || 0;
      // 命中多个时优先返回同序号那个，但其余也参与投票
      const primary = matched[index] || matched[0];
      return [primary, ...matched.filter((el) => el !== primary)];
    },
  },

  {
    kind: 'cssPath',
    weight: 40,
    capture(el) {
      const selector = buildStableCssPath(el);
      return selector ? { value: selector } : null;
    },
    resolve(value) {
      return usable(safeQueryAll(value));
    },
  },

  {
    kind: 'attrHints',
    weight: 25,
    capture(el) {
      const hints = {};
      for (const attr of ['name', 'type', 'placeholder', 'href', 'alt', 'for', 'value']) {
        const v = el.getAttribute?.(attr);
        if (v && v.length < 80) hints[attr] = v;
      }
      if (!Object.keys(hints).length) return null;
      return { value: tagOf(el), extra: { hints } };
    },
    resolve(value, extra) {
      const hints = extra?.hints || {};
      const selector = value + Object.entries(hints)
        .map(([k, v]) => `[${k}="${cssEscape(v)}"]`)
        .join('');
      return usable(safeQueryAll(selector));
    },
  },

  {
    kind: 'nthPath',
    weight: 30,
    capture(el) {
      const path = absoluteNthPath(el);
      return path ? { value: path } : null;
    },
    resolve(value) {
      return usable(safeQueryAll(value));
    },
  },
];

const STRATEGY_MAP = new Map(STRATEGIES.map((s) => [s.kind, s]));

/** 这几类线索本身就足够权威，命中即可判定为 active */
const AUTHORITATIVE = new Set(['anchorId', 'testId', 'domId']);

/* ------------------------------------------------------------------ */
/* 选择器构造                                                          */
/* ------------------------------------------------------------------ */

function nearestLandmarkSelector(el) {
  const landmark = el.closest?.(
    '[role="main"], [role="navigation"], [role="dialog"], main, nav, aside, header, footer, form, section[id], section[class], table'
  );
  if (!landmark || landmark === el) return '';
  const tag = tagOf(landmark);
  if (landmark.id && !isGeneratedToken(landmark.id)) return `${tag}#${cssEscape(landmark.id)}`;
  const cls = stableClasses(landmark, 1);
  const role = landmark.getAttribute('role');
  if (role) return `${tag}[role="${cssEscape(role)}"]`;
  return cls.length ? `${tag}.${cssEscape(cls[0])}` : tag;
}

function componentRootOf(el) {
  let node = el;
  while (node && node !== document.body) {
    const info = describeComponent(node);
    if (info.component) return node;
    node = node.parentElement;
  }
  return null;
}

/** 组件根 -> 目标元素的相对 nth-of-type 路径 */
function relativeNthPath(el, root) {
  if (!root) return '';
  if (el === root) return ':self';
  const segments = [];
  let node = el;
  while (node && node !== root && node !== document.body) {
    segments.unshift(`${tagOf(node)}:nth-of-type(${indexAmongSiblings(node)})`);
    node = node.parentElement;
  }
  return node === root ? segments.join(' > ') : '';
}

/** body 起算的完整 nth-child 路径：最笨但最确定，作为结构兜底 */
function absoluteNthPath(el) {
  const segments = [];
  let node = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    if (node === document.body) {
      segments.unshift('body');
      break;
    }
    const parent = node.parentElement;
    if (!parent) break;
    const index = Array.prototype.indexOf.call(parent.children, node) + 1;
    segments.unshift(`${tagOf(node)}:nth-child(${index})`);
    node = parent;
  }
  return segments.length > 1 ? segments.join(' > ') : '';
}

/**
 * 构造尽量短、且只使用稳定 class 的 CSS 路径。
 * 从元素自身开始，逐级向上添加祖先，一旦在文档内唯一就停止。
 */
function buildStableCssPath(el, maxDepth = 6) {
  const own = simpleSelector(el);
  if (!own) return '';
  if (safeQueryAll(own).length === 1) return own;

  let selector = own;
  let node = el.parentElement;
  let depth = 0;
  while (node && node !== document.documentElement && depth < maxDepth) {
    const parentSelector = simpleSelector(node);
    if (parentSelector) {
      selector = `${parentSelector} > ${selector}`;
      if (safeQueryAll(selector).length === 1) return selector;
    }
    node = node.parentElement;
    depth += 1;
  }
  return selector;
}

function simpleSelector(el) {
  if (!el || el.nodeType !== 1) return '';
  const tag = tagOf(el);
  if (!tag) return '';
  if (el === document.body) return 'body';
  if (el.id && !isGeneratedToken(el.id)) return `${tag}#${cssEscape(el.id)}`;

  const classes = stableClasses(el);
  if (classes.length) return tag + classes.map((c) => `.${cssEscape(c)}`).join('');

  for (const attr of ['role', 'name', 'type']) {
    const v = el.getAttribute?.(attr);
    if (v && v.length < 40) return `${tag}[${attr}="${cssEscape(v)}"]`;
  }
  return tag;
}

/* ------------------------------------------------------------------ */
/* 采集                                                                */
/* ------------------------------------------------------------------ */

/** 标注时刻的元素画像，用于回放时判断「找到的这个是不是原来那个」 */
export function captureSnapshot(el) {
  const info = describeComponent(el);
  const attrs = {};
  for (const attr of ['type', 'name', 'placeholder', 'href', 'role', 'aria-label', 'disabled']) {
    const v = el.getAttribute?.(attr);
    if (v != null) attrs[attr] = v;
  }
  return {
    tag: tagOf(el),
    role: roleOf(el),
    text: normalizeText(el.textContent, 240),
    attrs,
    component: info.component,
    componentPath: info.componentPath,
    framework: info.framework,
    sourceFile: info.sourceFile,
  };
}

/**
 * 采集元素的全部定位线索。
 * @param {Element} el
 * @param {{stampAnchor?: boolean}} [options] stampAnchor 会在元素上写入 data-anno-id，
 *        让后续定位变成最高权重的精确匹配（会修改宿主 DOM，默认关闭）
 */
export function captureTarget(el, options = {}) {
  if (options.stampAnchor && !el.getAttribute('data-anno-id')) {
    el.setAttribute('data-anno-id', `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
  }

  const strategies = [];
  for (const strategy of STRATEGIES) {
    try {
      const captured = strategy.capture(el);
      if (captured && captured.value) {
        strategies.push({ kind: strategy.kind, value: captured.value, extra: captured.extra ?? null });
      }
    } catch {
      // 某个策略采集失败不影响其它策略
    }
  }

  return {
    strategies,
    rect: getDocumentRect(el),
    snapshot: captureSnapshot(el),
    resolved: null,
  };
}

/* ------------------------------------------------------------------ */
/* 回放                                                                */
/* ------------------------------------------------------------------ */

/** 元素画像相似度 0~1，作为投票的加成项 */
function snapshotSimilarity(el, snapshot) {
  if (!snapshot) return 0;
  let score = 0;
  let total = 0;

  const check = (weight, condition) => {
    total += weight;
    if (condition) score += weight;
  };

  check(3, snapshot.tag && tagOf(el) === snapshot.tag);
  check(2, snapshot.role && roleOf(el) === snapshot.role);
  check(3, snapshot.text && normalizeText(el.textContent, 240) === snapshot.text);
  if (snapshot.component) {
    check(2, describeComponent(el).component === snapshot.component);
  }
  const attrs = snapshot.attrs || {};
  for (const [key, value] of Object.entries(attrs)) {
    check(1, el.getAttribute?.(key) === value);
  }

  return total === 0 ? 0 : score / total;
}

/**
 * 按多重线索定位元素。
 *
 * @returns {{element: Element|null, kind: string, confidence: number, status: string,
 *            candidates: number, votes: string[]}}
 */
export function resolveTarget(target) {
  const strategies = Array.isArray(target?.strategies) ? target.strategies : [];
  if (!strategies.length) {
    return { element: null, kind: '', confidence: 0, status: 'orphaned', candidates: 0, votes: [] };
  }

  /** @type {Map<Element, {weight: number, kinds: string[]}>} */
  const scores = new Map();
  let maxPossible = 0;

  for (const item of strategies) {
    const strategy = STRATEGY_MAP.get(item.kind);
    if (!strategy) continue;
    maxPossible += strategy.weight;

    let found = [];
    try {
      found = strategy.resolve(item.value, item.extra) || [];
    } catch {
      continue;
    }
    if (!found.length) continue;

    // 命中越多说明该线索区分度越低，票权按候选数衰减
    const vote = strategy.weight / Math.min(found.length, 5);
    found.slice(0, 10).forEach((el, index) => {
      // 同一策略内，靠前的候选更可信
      const positional = vote / (1 + index * 0.5);
      const record = scores.get(el) || { weight: 0, kinds: [] };
      record.weight += positional;
      record.kinds.push(item.kind);
      scores.set(el, record);
    });
  }

  if (!scores.size) {
    return { element: null, kind: '', confidence: 0, status: 'orphaned', candidates: 0, votes: [] };
  }

  // 画像相似度加成：让「长得像原元素」的候选胜出
  for (const [el, record] of scores) {
    record.weight += snapshotSimilarity(el, target.snapshot) * 45;
    if (!isVisible(el)) record.weight *= 0.6; // 隐藏元素大概率不是标注对象
  }

  let winner = null;
  let winnerRecord = null;
  for (const [el, record] of scores) {
    if (!winnerRecord || record.weight > winnerRecord.weight) {
      winner = el;
      winnerRecord = record;
    }
  }

  const confidence = Math.max(0, Math.min(1, winnerRecord.weight / (maxPossible + 45)));
  const authoritative = winnerRecord.kinds.some((k) => AUTHORITATIVE.has(k));
  const status = authoritative || confidence >= 0.45 ? 'active' : 'drifted';

  return {
    element: winner,
    kind: winnerRecord.kinds[0] || '',
    confidence: Number(confidence.toFixed(3)),
    status,
    candidates: scores.size,
    votes: winnerRecord.kinds,
  };
}

/**
 * 自愈：当定位发生漂移时，用当前实际命中的元素重新采集线索，
 * 使下一次加载能以更高置信度直接命中。
 * @returns {boolean} 是否更新了 target
 */
export function healTarget(target, element) {
  if (!element) return false;
  const fresh = captureTarget(element);
  const before = JSON.stringify(target.strategies);
  target.strategies = fresh.strategies;
  target.rect = fresh.rect;
  target.snapshot = fresh.snapshot;
  return before !== JSON.stringify(target.strategies);
}

/** 区域型标注：没有元素可依附，用坐标反查当前覆盖的元素做参考 */
export function elementAtRect(rect) {
  if (!rect) return null;
  const x = rect.x + rect.width / 2 - (rect.relativeTo === 'document' ? window.scrollX : 0);
  const y = rect.y + rect.height / 2 - (rect.relativeTo === 'document' ? window.scrollY : 0);
  const el = document.elementFromPoint(x, y);
  return el && !isOwnElement(el) ? el : null;
}
