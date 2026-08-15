/**
 * 标注仓库：内存中的唯一数据源，负责 CRUD、审计流水、持久化与导入导出。
 * 不碰任何 DOM，UI 层通过事件订阅它的变化。
 */

import { Emitter } from './emitter.js';
import {
  createAnnotation,
  createConfig,
  createId,
  createPage,
  validateConfig,
} from './schema.js';
import { currentUrl, deepClone, urlPattern } from './utils.js';

export class AnnotationStore extends Emitter {
  /**
   * @param {object} options
   * @param {object} options.adapter   存储适配器
   * @param {string} [options.author]  当前标注人
   * @param {string} [options.projectName]
   * @param {boolean} [options.autoSave]
   */
  constructor(options = {}) {
    super();
    this.adapter = options.adapter;
    this.author = options.author || 'anonymous';
    this.autoSave = options.autoSave !== false;
    this.config = createConfig({ project: { name: options.projectName || document.title } });
    /** 审计流水：谁在什么时候改了哪条标注，参考原型标注器的 event 表 */
    this.events = [];
    this._saveTimer = null;
    this._dirty = false;
  }

  /* ---------------------------------------------------------------- */
  /* 页面                                                             */
  /* ---------------------------------------------------------------- */

  /** 当前页面的标识（归一化路由），同一路由的不同参数视为同一页 */
  get pageKey() {
    return urlPattern(typeof location !== 'undefined' ? location.href : '');
  }

  /** 取当前页面记录，不存在则创建 */
  currentPage({ create = true } = {}) {
    const key = this.pageKey;
    let page = this.config.pages.find((p) => p.urlPattern === key);
    if (!page && create) {
      page = createPage({
        url: currentUrl(),
        urlPattern: key,
        title: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio || 1,
        },
      });
      this.config.pages.push(page);
    }
    return page || null;
  }

  /** 当前页面的全部标注，按创建顺序 */
  list() {
    const page = this.currentPage({ create: false });
    return page ? page.annotations : [];
  }

  find(id) {
    for (const page of this.config.pages) {
      const found = page.annotations.find((a) => a.id === id);
      if (found) return found;
    }
    return null;
  }

  /** 全部页面的标注总数，用于工具栏计数 */
  get totalCount() {
    return this.config.pages.reduce((sum, p) => sum + p.annotations.length, 0);
  }

  /* ---------------------------------------------------------------- */
  /* CRUD                                                            */
  /* ---------------------------------------------------------------- */

  add(input) {
    const page = this.currentPage();
    const annotation = createAnnotation({
      ...input,
      // seq 是页面内的展示序号，也就是标记上的数字
      seq: page.annotations.length + 1,
      meta: { ...input.meta, author: input.meta?.author || this.author },
    });
    page.annotations.push(annotation);
    this._audit('created', annotation.id, { title: annotation.title });
    this._changed('add', annotation);
    return annotation;
  }

  update(id, patch) {
    const annotation = this.find(id);
    if (!annotation) return null;

    const before = deepClone(annotation);
    // 逐字段合并，避免 patch 里缺失的嵌套结构被整体覆盖掉
    Object.assign(annotation, {
      ...patch,
      businessLogic: { ...annotation.businessLogic, ...(patch.businessLogic || {}) },
      dataBinding: { ...annotation.dataBinding, ...(patch.dataBinding || {}) },
      target: patch.target ? { ...annotation.target, ...patch.target } : annotation.target,
      meta: { ...annotation.meta, ...(patch.meta || {}), updatedAt: new Date().toISOString() },
    });

    this._audit('updated', id, { changed: changedKeys(before, annotation) });
    this._changed('update', annotation);
    return annotation;
  }

  remove(id) {
    for (const page of this.config.pages) {
      const index = page.annotations.findIndex((a) => a.id === id);
      if (index === -1) continue;
      const [removed] = page.annotations.splice(index, 1);
      // 删除后重排序号，保证标记上的数字始终连续
      page.annotations.forEach((a, i) => { a.seq = i + 1; });
      this._audit('deleted', id, { title: removed.title });
      this._changed('remove', removed);
      return removed;
    }
    return null;
  }

  /** 定位状态由定位引擎回写，不计入审计（每次加载都会变） */
  setStatus(id, status, resolved) {
    const annotation = this.find(id);
    if (!annotation) return;
    annotation.status = status;
    if (resolved) annotation.target.resolved = resolved;
  }

  clearCurrentPage() {
    const page = this.currentPage({ create: false });
    if (!page) return;
    page.annotations = [];
    this._audit('page-cleared', page.id, { urlPattern: page.urlPattern });
    this._changed('clear', null);
  }

  /* ---------------------------------------------------------------- */
  /* 持久化                                                           */
  /* ---------------------------------------------------------------- */

  async load() {
    if (!this.adapter) return;
    try {
      const raw = await this.adapter.load();
      if (!raw) return;
      const result = validateConfig(raw);
      if (result.ok) {
        this.config = result.config;
      } else {
        console.warn('[ui-annotator] 已存标注不合法，将忽略:', result.errors);
      }
      if (result.warnings.length) console.warn('[ui-annotator]', result.warnings.join('; '));
      this.emit('loaded', this.config);
    } catch (err) {
      console.error('[ui-annotator] 加载标注失败:', err);
    }
  }

  async save() {
    if (!this.adapter) return;
    clearTimeout(this._saveTimer);
    try {
      this.config.project.generatedAt = new Date().toISOString();
      await this.adapter.save(deepClone(this.config));
      this._dirty = false;
      this.emit('saved', this.config);
    } catch (err) {
      this._dirty = true;
      this.emit('save-error', err);
      console.error('[ui-annotator] 保存失败:', err);
    }
  }

  /** 合并写入，避免连续编辑时频繁落盘 */
  scheduleSave() {
    if (!this.autoSave) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), 400);
  }

  /* ---------------------------------------------------------------- */
  /* 导入导出                                                         */
  /* ---------------------------------------------------------------- */

  /** 导出完整配置（即 AI design 要消费的那份数据） */
  export() {
    return deepClone(this.config);
  }

  /**
   * 导入配置。
   * @param {object} raw
   * @param {'replace'|'merge'} mode merge 会按 id 去重后追加到对应页面
   */
  import(raw, mode = 'replace') {
    const result = validateConfig(raw);
    if (!result.ok) return result;

    if (mode === 'replace') {
      this.config = result.config;
    } else {
      for (const incoming of result.config.pages) {
        const existing = this.config.pages.find((p) => p.urlPattern === incoming.urlPattern);
        if (!existing) {
          this.config.pages.push(incoming);
          continue;
        }
        const seen = new Set(existing.annotations.map((a) => a.id));
        for (const anno of incoming.annotations) {
          // id 冲突时重新发号，避免覆盖已有标注
          if (seen.has(anno.id)) anno.id = createId();
          existing.annotations.push(anno);
        }
        existing.annotations.forEach((a, i) => { a.seq = i + 1; });
      }
    }

    this._audit('imported', '-', { mode, pages: result.config.pages.length });
    this._changed('import', null);
    this.emit('loaded', this.config);
    return result;
  }

  /* ---------------------------------------------------------------- */
  /* 内部                                                             */
  /* ---------------------------------------------------------------- */

  _audit(action, targetId, detail) {
    this.events.push({
      id: createId('evt'),
      action,
      targetId,
      actor: this.author,
      at: new Date().toISOString(),
      detail: detail || {},
    });
    // 流水只用于当次会话排查，不无限增长
    if (this.events.length > 500) this.events.splice(0, this.events.length - 500);
  }

  _changed(kind, annotation) {
    this._dirty = true;
    this.emit('changed', { kind, annotation });
    this.scheduleSave();
  }
}

/** 对比两个标注，列出实际变化的顶层字段，用于审计详情 */
function changedKeys(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed = [];
  for (const key of keys) {
    if (key === 'meta') continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changed.push(key);
  }
  return changed;
}
