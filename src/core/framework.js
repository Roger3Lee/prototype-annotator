/**
 * 框架适配：从 DOM 节点反查它属于哪个 Vue / React 组件。
 *
 * 这是「定位到具体元素」之外的第二层语义信息 —— 对 AI design 来说，
 * 知道某个按钮属于 <OrderForm> 比知道它的 CSS 路径有用得多，
 * 而且组件名在重构中比 class 稳定。
 *
 * 全部走「读运行时内部字段」的方式，不侵入宿主项目，读不到就安静降级。
 */

import { normalizeText } from './utils.js';

/** 探测页面用的是什么框架，仅用于导出时打标 */
export function detectFramework() {
  if (typeof document === 'undefined') return 'unknown';

  if (document.querySelector('[data-reactroot]')) return 'react';
  if (window.React || window.ReactDOM) return 'react';
  if (window.Vue) return 'vue';
  if (document.querySelector('[data-v-app]')) return 'vue';

  // 扫描前若干元素，看有没有框架的内部字段
  const sample = Array.from(document.querySelectorAll('body *')).slice(0, 300);
  for (const el of sample) {
    if (reactFiberOf(el)) return 'react';
    if (el.__vueParentComponent || el.__vue__) return 'vue';
  }
  if (document.querySelector('[class*="ng-"], [ng-version]')) return 'angular';
  return 'html';
}

/* ------------------------------------------------------------------ */
/* Vue                                                                 */
/* ------------------------------------------------------------------ */

/** Vue 3 把组件实例挂在 __vueParentComponent，Vue 2 挂在 __vue__ */
function vueInstanceOf(el) {
  return el.__vueParentComponent || el.__vue__ || null;
}

function vue3ComponentName(instance) {
  const type = instance?.type;
  if (!type) return '';
  // __name 由 SFC 编译器写入；__file 是绝对路径，取文件名兜底
  if (type.name) return type.name;
  if (type.__name) return type.__name;
  if (type.__file) return fileBaseName(type.__file);
  return '';
}

function vue2ComponentName(instance) {
  const options = instance?.$options;
  if (!options) return '';
  return options.name || options._componentTag || fileBaseName(options.__file || '');
}

function vueNameOf(instance) {
  if (!instance) return '';
  return instance.$options ? vue2ComponentName(instance) : vue3ComponentName(instance);
}

/** 沿组件树向上收集组件名，得到 App > OrderList > OrderForm 这样的路径 */
function vueComponentPath(el, limit = 8) {
  const path = [];
  let instance = null;
  let node = el;

  // 元素本身可能不是组件根节点，先向上找到最近的宿主组件
  while (node && !instance) {
    instance = vueInstanceOf(node);
    node = node.parentElement;
  }

  let current = instance;
  while (current && path.length < limit) {
    const name = vueNameOf(current);
    if (name && name !== 'Anonymous') path.unshift(name);
    current = current.parent || current.$parent;
  }
  return path;
}

function vueSourceFile(el) {
  let node = el;
  while (node) {
    const instance = vueInstanceOf(node);
    const file = instance?.type?.__file || instance?.$options?.__file;
    if (file) return file;
    node = node.parentElement;
  }
  return '';
}

/* ------------------------------------------------------------------ */
/* React                                                               */
/* ------------------------------------------------------------------ */

/** React 把 fiber 挂成 __reactFiber$xxxx 这类随机后缀的 key */
function reactFiberOf(el) {
  for (const key in el) {
    if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
      return el[key];
    }
  }
  return null;
}

function reactNameOf(fiber) {
  const type = fiber?.type || fiber?.elementType;
  if (!type) return '';
  if (typeof type === 'string') return ''; // 宿主节点（div/span），不是组件
  const name = type.displayName || type.name;
  if (name) return name;
  // memo / forwardRef 包装层
  if (type.render) return type.render.displayName || type.render.name || '';
  if (type.type) return type.type.displayName || type.type.name || '';
  return '';
}

/** 沿 fiber.return 向上收集自定义组件名 */
function reactComponentPath(el, limit = 8) {
  const path = [];
  let fiber = null;
  let node = el;

  while (node && !fiber) {
    fiber = reactFiberOf(node);
    node = node.parentElement;
  }

  let current = fiber;
  const seen = new Set();
  while (current && path.length < limit && !seen.has(current)) {
    seen.add(current);
    const name = reactNameOf(current);
    // 跳过 Provider/Fragment 这类无业务含义的内建包装
    if (name && !/^(Provider|Consumer|Fragment|StrictMode|Suspense|Anonymous)$/.test(name)) {
      if (path[0] !== name) path.unshift(name);
    }
    current = current.return;
  }
  return path;
}

function reactSourceFile(el) {
  let node = el;
  while (node) {
    const fiber = reactFiberOf(node);
    // _debugSource 只在开发构建下存在
    const source = fiber?._debugSource;
    if (source?.fileName) return `${source.fileName}:${source.lineNumber ?? ''}`;
    node = node.parentElement;
  }
  return '';
}

/* ------------------------------------------------------------------ */
/* 统一出口                                                            */
/* ------------------------------------------------------------------ */

/**
 * 提取元素的组件语义信息。
 * @returns {{framework: string, component: string, componentPath: string[], sourceFile: string}}
 */
export function describeComponent(el) {
  const empty = { framework: 'html', component: '', componentPath: [], sourceFile: '' };
  if (!el || el.nodeType !== 1) return empty;

  try {
    const vuePath = vueComponentPath(el);
    if (vuePath.length) {
      return {
        framework: 'vue',
        component: vuePath[vuePath.length - 1],
        componentPath: vuePath,
        sourceFile: vueSourceFile(el),
      };
    }

    const reactPath = reactComponentPath(el);
    if (reactPath.length) {
      return {
        framework: 'react',
        component: reactPath[reactPath.length - 1],
        componentPath: reactPath,
        sourceFile: reactSourceFile(el),
      };
    }
  } catch {
    // 框架内部结构随版本变动，读取失败一律降级为纯 HTML
  }

  return empty;
}

/**
 * 反向查找：给定组件路径，找出该组件渲染出的所有根元素。
 * 定位引擎的 componentPath 策略依赖它。
 */
export function findByComponentPath(path, root = document.body) {
  if (!Array.isArray(path) || !path.length) return [];
  const target = path.join('>');
  const matches = [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode;
  while (node) {
    // 只在「自己就是组件宿主」的节点上比对，避免整棵子树全部命中
    if (node.__vueParentComponent || node.__vue__ || reactFiberOf(node)) {
      const info = describeComponent(node);
      if (info.componentPath.join('>') === target) matches.push(node);
    }
    node = walker.nextNode();
  }
  return matches;
}

/** 给元素信息面板用的一行摘要 */
export function componentLabel(el) {
  const info = describeComponent(el);
  if (!info.component) return '';
  return normalizeText(info.componentPath.join(' › '), 60);
}
