/**
 * ui-annotator 入口。
 *
 * 三种用法：
 *   1. 静态 HTML：<script src="ui-annotator.umd.js" data-auto data-project="订单系统"></script>
 *   2. UMD 手动：UIAnnotator.init({ ... })
 *   3. 打包器：import { init } from 'ui-annotator'
 */

import { AnnotationStore } from './core/store.js';
import {
  createInlineAdapter,
  createLayeredAdapter,
  resolveAdapter,
} from './core/storage.js';
import { captureTarget } from './core/locator.js';
import { detectFramework } from './core/framework.js';
import { validateConfig, createAnnotation } from './core/schema.js';
import { isBrowser, isFileProtocol } from './core/utils.js';
import { Overlay } from './ui/overlay.js';
import { extractPageContext, materializeAiAnnotations } from './ai/context.js';
import { buildPrompt, buildRefinePrompt, parseAiResponse } from './ai/prompt.js';

export const VERSION = '0.1.0';

export class Annotator {
  /**
   * @param {object} options
   * @param {'edit'|'view'} [options.mode='edit']
   * @param {'local'|'memory'|'inline'|'http'|object} [options.storage='local']
   * @param {string} [options.storageKey]
   * @param {string} [options.inlineSelector='#ui-annotator-config'] 内联基线配置的选择器
   * @param {string} [options.project]
   * @param {string} [options.author]
   * @param {string} [options.domain] 业务域，用于 AI 提示词
   * @param {boolean} [options.stampAnchor=true] 标注时给元素写 data-anno-id
   * @param {boolean} [options.autoSave=true]
   * @param {boolean} [options.watchRoute=true] 监听 SPA 路由变化并重渲染
   */
  constructor(options = {}) {
    if (!isBrowser) throw new Error('[ui-annotator] 只能在浏览器环境使用');

    this.options = {
      mode: 'edit',
      storage: 'local',
      storageKey: 'ui-annotator:config',
      inlineSelector: '#ui-annotator-config',
      stampAnchor: true,
      autoSave: true,
      watchRoute: true,
      ...options,
    };

    this.store = new AnnotationStore({
      adapter: this._createAdapter(),
      author: this.options.author || 'anonymous',
      projectName: this.options.project,
      autoSave: this.options.autoSave,
    });

    this.overlay = new Overlay({
      store: this.store,
      mode: this.options.mode,
      stampAnchor: this.options.stampAnchor,
      getExportContent: (tab) => this._exportContent(tab),
      onImport: (text, mode) => this._handleImport(text, mode),
    });

    /** 最近一次抽取上下文时的 ref -> 元素映射，导入 AI 结果时要用 */
    this._refs = null;
    this._started = false;
  }

  /**
   * 默认存储是分层的：读取时本地改动优先、其次内联基线；写入始终落 localStorage。
   * 这样静态 HTML 可以把一份基线标注内联进页面，任何人打开都能看到，
   * 而各自的修改只留在自己浏览器里，不会互相覆盖。
   */
  _createAdapter() {
    const { storage, storageKey, inlineSelector } = this.options;
    if (storage !== 'local') {
      return resolveAdapter(storage, { storageKey, inlineSelector });
    }
    const local = resolveAdapter('local', { storageKey });
    const inline = createInlineAdapter(inlineSelector);
    return createLayeredAdapter([inline], local);
  }

  /* ---------------------------------------------------------------- */
  /* 生命周期                                                         */
  /* ---------------------------------------------------------------- */

  async start() {
    if (this._started) return this;
    this._started = true;

    await this.store.load();
    this.store.config.project.framework = detectFramework();
    this.overlay.mount();
    if (this.options.watchRoute) this._watchRoute();

    if (isFileProtocol && !this.store.adapter?.persistent) {
      this.overlay.toast('file:// 下无法持久化，请用「导出」保存标注', 'warn');
    }
    return this;
  }

  destroy() {
    this._unwatchRoute?.();
    this.overlay.destroy();
    this._started = false;
  }

  /**
   * SPA 路由变化后页面内容整体换掉，标记必须按新路由重新解析。
   * history.pushState/replaceState 不派发事件，只能包一层。
   */
  _watchRoute() {
    let last = location.href;
    const onChange = () => {
      if (location.href === last) return;
      last = location.href;
      // 等新路由的 DOM 渲染完再解析定位
      setTimeout(() => this.overlay.render(), 60);
    };

    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function pushState(...args) {
      const result = origPush.apply(this, args);
      onChange();
      return result;
    };
    history.replaceState = function replaceState(...args) {
      const result = origReplace.apply(this, args);
      onChange();
      return result;
    };
    window.addEventListener('popstate', onChange);
    window.addEventListener('hashchange', onChange);

    this._unwatchRoute = () => {
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener('popstate', onChange);
      window.removeEventListener('hashchange', onChange);
    };
  }

  setMode(mode) {
    this.options.mode = mode === 'view' ? 'view' : 'edit';
    this.overlay.mode = this.options.mode;
    this.overlay.markers.readOnly = this.options.mode === 'view';
    const hidden = this.options.mode === 'view';
    this.overlay.pickBtn.classList.toggle('hidden', hidden);
    this.overlay.regionBtn.classList.toggle('hidden', hidden);
    this.overlay.aiBtn.classList.toggle('hidden', hidden);
    this.overlay.render();
    return this;
  }

  /* ---------------------------------------------------------------- */
  /* 数据出入                                                         */
  /* ---------------------------------------------------------------- */

  /** 导出完整配置，这份 JSON 就是 AI design 的输入 */
  export() {
    return this.store.export();
  }

  /**
   * @param {object|string} config
   * @param {'replace'|'merge'} [mode='replace']
   */
  import(config, mode = 'replace') {
    const raw = typeof config === 'string' ? JSON.parse(config) : config;
    const result = this.store.import(raw, mode);
    if (!result.ok) throw new Error(result.errors.join('; '));
    return result;
  }

  /** 代码方式补一条标注，适合把已有文档批量灌进页面 */
  annotate(selector, values = {}) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) {
      console.warn('[ui-annotator] 找不到元素:', selector);
      return null;
    }
    return this.store.add({
      ...values,
      type: 'element',
      target: captureTarget(el, { stampAnchor: this.options.stampAnchor }),
    });
  }

  /* ---------------------------------------------------------------- */
  /* AI                                                               */
  /* ---------------------------------------------------------------- */

  /** 抽取页面语义上下文，同时缓存 ref -> 元素映射供回填使用 */
  extractContext(options = {}) {
    const { context, refs } = extractPageContext({
      annotations: this.store.list(),
      ...options,
    });
    this._refs = refs;
    return context;
  }

  buildPrompt(options = {}) {
    const context = this.extractContext(options);
    return buildPrompt(context, { domain: this.options.domain, ...options });
  }

  buildRefinePrompt(options = {}) {
    const context = this.extractContext(options);
    return buildRefinePrompt(context, { domain: this.options.domain, ...options });
  }

  /**
   * 把 AI 返回的内容落成标注。
   *
   * 兼容两种形态：
   *   - 完整配置（含 pages）：走标准导入校验
   *   - ref 形态（含 annotations[].ref）：用缓存的 ref 映射现场采集定位线索，
   *     所以 AI 不需要、也不应该自己写选择器
   *
   * @param {object|string} input
   * @param {object} [options]
   * @param {'merge'|'replace'} [options.mode='merge']
   */
  applyAiResult(input, options = {}) {
    const mode = options.mode || 'merge';
    // parseAiResponse 返回 { ok, data, error }，不是解析结果本身
    const parsed = typeof input === 'string' ? parseAiResponse(input) : { ok: true, data: input };
    if (!parsed.ok) throw new Error(parsed.error);
    const raw = parsed.data || {};

    // 形态一：AI 直接给了完整配置
    if (Array.isArray(raw.pages)) {
      const result = this.store.import(raw, mode);
      if (!result.ok) throw new Error(result.errors.join('; '));
      return { added: 0, updated: 0, skipped: [], imported: true };
    }

    const items = Array.isArray(raw.annotations) ? raw.annotations : [];
    if (!items.length) throw new Error('AI 返回内容里没有 annotations');

    if (mode === 'replace') this.store.clearCurrentPage();

    // 带 id 的是在修订已有标注，不带 id 的按 ref 新建
    const updates = [];
    const creations = [];
    for (const item of items) {
      if (item.id && this.store.find(item.id)) updates.push(item);
      else creations.push(item);
    }

    let updated = 0;
    for (const item of updates) {
      const patch = createAnnotation({ ...this.store.find(item.id), ...item });
      delete patch.target;
      delete patch.seq;
      this.store.update(item.id, {
        ...patch,
        meta: { ...patch.meta, source: 'ai', reviewed: false, aiConfidence: item.confidence ?? null },
      });
      updated += 1;
    }

    if (!this._refs) this.extractContext();
    const { annotations, skipped } = materializeAiAnnotations(creations, this._refs);
    for (const annotation of annotations) this.store.add(annotation);

    // 页面摘要与术语表也一并吸收，它们同样是 AI design 需要的语义信息
    const page = this.store.currentPage();
    if (raw.pageSummary && page) page.summary = String(raw.pageSummary);
    // 契约里 glossary 是 [{term,definition}]，但仓库里存成 map，两种形态都要吃下
    if (Array.isArray(raw.glossary)) {
      for (const item of raw.glossary) {
        if (item?.term) this.store.config.glossary[item.term] = String(item.definition ?? '');
      }
    } else if (raw.glossary && typeof raw.glossary === 'object') {
      Object.assign(this.store.config.glossary, raw.glossary);
    }
    this.store.scheduleSave();
    this.overlay.render();

    return { added: annotations.length, updated, skipped, imported: false };
  }

  /* ---------------------------------------------------------------- */
  /* 对话框回调                                                       */
  /* ---------------------------------------------------------------- */

  _exportContent(tab) {
    try {
      if (tab === 'context') return JSON.stringify(this.extractContext(), null, 2);
      if (tab === 'prompt') return this.buildPrompt();
      return JSON.stringify(this.export(), null, 2);
    } catch (err) {
      return `生成失败: ${err.message}`;
    }
  }

  /**
   * 导入框里的文本可能是三种东西：标准配置、AI 的 ref 形态结果、带 ``` 包裹的回复。
   * 统一走一次解析后分派，用户不需要关心自己粘的是哪种。
   */
  _handleImport(text, mode) {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      this.overlay.toast('请先粘贴或选择要导入的 JSON', 'warn');
      return;
    }

    let raw;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      // 直接 JSON.parse 失败说明可能带着 ``` 围栏或寒暄，交给宽松解析
      const parsed = parseAiResponse(trimmed);
      if (!parsed.ok) {
        this.overlay.toast(`无法解析为 JSON：${parsed.error}`, 'error');
        return;
      }
      raw = parsed.data;
    }
    if (!raw || typeof raw !== 'object') {
      this.overlay.toast('无法解析为 JSON，请检查内容', 'error');
      return;
    }

    try {
      if (Array.isArray(raw.pages)) {
        const result = validateConfig(raw);
        if (!result.ok) throw new Error(result.errors.join('; '));
        this.store.import(raw, mode);
        this.overlay.toast(`已导入 ${result.config.pages.length} 个页面的标注`);
      } else {
        const { added, updated, skipped } = this.applyAiResult(raw, { mode });
        const tail = skipped.length ? `，${skipped.length} 条因 ref 失效被跳过` : '';
        this.overlay.toast(`新增 ${added} 条、更新 ${updated} 条${tail}`);
      }
      this.overlay.modal.close();
      this.overlay.render();
    } catch (err) {
      this.overlay.toast(`导入失败: ${err.message}`, 'error');
    }
  }
}

/* ------------------------------------------------------------------ */
/* 单例入口                                                           */
/* ------------------------------------------------------------------ */

let instance = null;

/**
 * 初始化（同一页面重复调用返回同一实例）。
 * @returns {Annotator}
 */
export function init(options = {}) {
  if (instance) return instance;
  instance = new Annotator(options);
  // 不阻塞调用方：加载与挂载在微任务里完成，返回值可立即链式使用
  instance.start().catch((err) => console.error('[ui-annotator] 启动失败:', err));
  return instance;
}

export function getInstance() {
  return instance;
}

export function destroy() {
  instance?.destroy();
  instance = null;
}

/**
 * script 标签自动初始化，静态 HTML 的零代码用法：
 *   <script src="ui-annotator.umd.js" data-auto data-project="订单系统" data-mode="view"></script>
 */
function autoInit() {
  const script =
    document.currentScript ||
    document.querySelector('script[data-auto][src*="ui-annotator"]');
  if (!script || !script.hasAttribute('data-auto')) return;

  const d = script.dataset;
  const options = {
    mode: d.mode || 'edit',
    storage: d.storage || 'local',
    project: d.project,
    author: d.author,
    domain: d.domain,
  };
  if (d.storageKey) options.storageKey = d.storageKey;
  if (d.inlineSelector) options.inlineSelector = d.inlineSelector;
  if (d.stampAnchor === 'false') options.stampAnchor = false;

  const boot = () => init(options);
  // 浮层要挂到 body 上，文档还没解析完就得等
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}

if (isBrowser) autoInit();

/* 供高级用法直接取用的内部能力 */
export { AnnotationStore } from './core/store.js';
export { detectFramework } from './core/framework.js';
export { captureTarget, resolveTarget, healTarget, STRATEGIES } from './core/locator.js';
export {
  CATEGORIES,
  SCHEMA_ID,
  SCHEMA_VERSION,
  createAnnotation,
  createConfig,
  validateConfig,
} from './core/schema.js';
export {
  createHttpAdapter,
  createInlineAdapter,
  createLayeredAdapter,
  createLocalStorageAdapter,
  createMemoryAdapter,
} from './core/storage.js';
export { extractPageContext, materializeAiAnnotations } from './ai/context.js';
export { AI_OUTPUT_CONTRACT, buildPrompt, buildRefinePrompt, parseAiResponse } from './ai/prompt.js';

export default { Annotator, init, getInstance, destroy, version: VERSION };
