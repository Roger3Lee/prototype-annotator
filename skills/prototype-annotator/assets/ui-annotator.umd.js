/*! ui-annotator v0.1.0 | MIT | 在 HTML / Vue / React 界面上定位元素、标注业务逻辑，并导出可供 AI design 消费的配置数据 */
var UIAnnotator = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.js
  var src_exports = {};
  __export(src_exports, {
    AI_OUTPUT_CONTRACT: () => AI_OUTPUT_CONTRACT,
    AnnotationStore: () => AnnotationStore,
    Annotator: () => Annotator,
    CATEGORIES: () => CATEGORIES,
    SCHEMA_ID: () => SCHEMA_ID,
    SCHEMA_VERSION: () => SCHEMA_VERSION,
    STRATEGIES: () => STRATEGIES,
    VERSION: () => VERSION,
    buildPrompt: () => buildPrompt,
    buildRefinePrompt: () => buildRefinePrompt,
    captureTarget: () => captureTarget,
    createAnnotation: () => createAnnotation,
    createConfig: () => createConfig,
    createHttpAdapter: () => createHttpAdapter,
    createInlineAdapter: () => createInlineAdapter,
    createLayeredAdapter: () => createLayeredAdapter,
    createLocalStorageAdapter: () => createLocalStorageAdapter,
    createMemoryAdapter: () => createMemoryAdapter,
    default: () => src_default,
    destroy: () => destroy,
    detectFramework: () => detectFramework,
    extractPageContext: () => extractPageContext,
    getInstance: () => getInstance,
    healTarget: () => healTarget,
    init: () => init,
    materializeAiAnnotations: () => materializeAiAnnotations,
    parseAiResponse: () => parseAiResponse,
    resolveTarget: () => resolveTarget,
    validateConfig: () => validateConfig
  });

  // src/core/emitter.js
  var Emitter = class {
    constructor() {
      this._handlers = /* @__PURE__ */ new Map();
    }
    on(event, handler) {
      if (!this._handlers.has(event)) this._handlers.set(event, /* @__PURE__ */ new Set());
      this._handlers.get(event).add(handler);
      return () => this.off(event, handler);
    }
    off(event, handler) {
      var _a;
      (_a = this._handlers.get(event)) == null ? void 0 : _a.delete(handler);
    }
    emit(event, payload) {
      for (const handler of this._handlers.get(event) || []) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[ui-annotator] 事件「${event}」的监听器抛错:`, err);
        }
      }
      for (const handler of this._handlers.get("*") || []) {
        try {
          handler({ event, payload });
        } catch {
        }
      }
    }
    clear() {
      this._handlers.clear();
    }
  };

  // src/core/schema.js
  var SCHEMA_ID = "ui-annotator/annotation-config";
  var SCHEMA_VERSION = 1;
  var CATEGORIES = [
    { key: "business-rule", label: "业务规则", color: "#7c3aed" },
    { key: "data-source", label: "数据来源", color: "#0ea5e9" },
    { key: "interaction", label: "交互行为", color: "#f59e0b" },
    { key: "validation", label: "校验约束", color: "#ef4444" },
    { key: "permission", label: "权限可见性", color: "#10b981" },
    { key: "state", label: "状态流转", color: "#6366f1" },
    { key: "todo", label: "待确认", color: "#e11d48" },
    { key: "note", label: "普通说明", color: "#64748b" }
  ];
  var CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
  var STATUSES = ["active", "drifted", "orphaned"];
  function categoryOf(key) {
    return CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
  }
  var seqCounter = 0;
  function createId(prefix = "anno") {
    seqCounter = (seqCounter + 1) % 4096;
    const time = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${time}${seqCounter.toString(36)}${rand}`;
  }
  function createBusinessLogic(input = {}) {
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
      errorStates: strList(input.errorStates)
    };
  }
  function createDataBinding(input = {}) {
    return {
      fields: asArray(input.fields).map((f) => ({
        name: str(f == null ? void 0 : f.name),
        label: str(f == null ? void 0 : f.label),
        type: str(f == null ? void 0 : f.type),
        required: Boolean(f == null ? void 0 : f.required),
        enumValues: strList(f == null ? void 0 : f.enumValues),
        validation: str(f == null ? void 0 : f.validation),
        remark: str(f == null ? void 0 : f.remark)
      })),
      apis: asArray(input.apis).map((a) => ({
        method: (str(a == null ? void 0 : a.method) || "GET").toUpperCase(),
        path: str(a == null ? void 0 : a.path),
        purpose: str(a == null ? void 0 : a.purpose)
      })),
      stateKeys: strList(input.stateKeys)
    };
  }
  function createTarget(input = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    return {
      strategies: asArray(input.strategies).filter((s) => s && typeof s.kind === "string").map((s) => {
        var _a2;
        return { kind: s.kind, value: s.value, extra: (_a2 = s.extra) != null ? _a2 : null };
      }),
      rect: input.rect ? normalizeRect(input.rect) : null,
      snapshot: {
        tag: str((_a = input.snapshot) == null ? void 0 : _a.tag),
        role: str((_b = input.snapshot) == null ? void 0 : _b.role),
        text: str((_c = input.snapshot) == null ? void 0 : _c.text).slice(0, 240),
        attrs: plainObject((_d = input.snapshot) == null ? void 0 : _d.attrs),
        component: str((_e = input.snapshot) == null ? void 0 : _e.component),
        componentPath: strList((_f = input.snapshot) == null ? void 0 : _f.componentPath),
        framework: str((_g = input.snapshot) == null ? void 0 : _g.framework),
        sourceFile: str((_h = input.snapshot) == null ? void 0 : _h.sourceFile)
      },
      resolved: input.resolved ? { kind: str(input.resolved.kind), confidence: num(input.resolved.confidence, 0) } : null
    };
  }
  function createAnnotation(input = {}) {
    var _a, _b, _c, _d, _e, _f;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return {
      id: str(input.id) || createId(),
      seq: num(input.seq, 0),
      type: input.type === "region" ? "region" : "element",
      category: CATEGORY_KEYS.includes(input.category) ? input.category : "note",
      title: str(input.title),
      body: str(input.body),
      businessLogic: createBusinessLogic(input.businessLogic),
      dataBinding: createDataBinding(input.dataBinding),
      target: createTarget(input.target),
      tags: strList(input.tags),
      /** 关联其它标注，用于表达「A 提交后跳到 B」这类跨元素流程 */
      links: asArray(input.links).map((l) => ({
        type: str(l == null ? void 0 : l.type) || "related",
        annotationId: str(l == null ? void 0 : l.annotationId),
        note: str(l == null ? void 0 : l.note)
      })),
      status: STATUSES.includes(input.status) ? input.status : "active",
      meta: {
        author: str((_a = input.meta) == null ? void 0 : _a.author) || "anonymous",
        createdAt: str((_b = input.meta) == null ? void 0 : _b.createdAt) || now,
        updatedAt: str((_c = input.meta) == null ? void 0 : _c.updatedAt) || now,
        /** human = 人工标注，ai = AI 生成待确认 */
        source: ((_d = input.meta) == null ? void 0 : _d.source) === "ai" ? "ai" : "human",
        aiConfidence: ((_e = input.meta) == null ? void 0 : _e.aiConfidence) == null ? null : num(input.meta.aiConfidence, 0),
        reviewed: Boolean((_f = input.meta) == null ? void 0 : _f.reviewed)
      }
    };
  }
  function createPage(input = {}) {
    var _a, _b, _c;
    return {
      id: str(input.id) || createId("page"),
      url: str(input.url),
      /** 归一化后的路由模式，把 /orders/1024 收敛成 /orders/:id，避免同一页面因参数不同被拆成多条 */
      urlPattern: str(input.urlPattern),
      title: str(input.title),
      route: plainObject(input.route),
      summary: str(input.summary),
      viewport: {
        width: num((_a = input.viewport) == null ? void 0 : _a.width, 0),
        height: num((_b = input.viewport) == null ? void 0 : _b.height, 0),
        dpr: num((_c = input.viewport) == null ? void 0 : _c.dpr, 1)
      },
      annotations: asArray(input.annotations).map(createAnnotation)
    };
  }
  function createConfig(input = {}) {
    var _a, _b, _c, _d;
    return {
      $schema: SCHEMA_ID,
      version: SCHEMA_VERSION,
      project: {
        name: str((_a = input.project) == null ? void 0 : _a.name),
        framework: str((_b = input.project) == null ? void 0 : _b.framework) || "unknown",
        generatedAt: str((_c = input.project) == null ? void 0 : _c.generatedAt) || (/* @__PURE__ */ new Date()).toISOString(),
        generator: str((_d = input.project) == null ? void 0 : _d.generator) || "ui-annotator"
      },
      /** 跨页面共享的术语表，帮助 AI 统一业务词汇 */
      glossary: asArray(input.glossary).map((g) => ({
        term: str(g == null ? void 0 : g.term),
        definition: str(g == null ? void 0 : g.definition)
      })),
      pages: asArray(input.pages).map(createPage)
    };
  }
  function validateConfig(raw) {
    const errors = [];
    const warnings = [];
    if (!raw || typeof raw !== "object") {
      return { ok: false, config: null, errors: ["配置必须是一个对象"], warnings };
    }
    if (raw.$schema && raw.$schema !== SCHEMA_ID) {
      warnings.push(`未知的 $schema「${raw.$schema}」，已按 ${SCHEMA_ID} 解析`);
    }
    if (raw.version && Number(raw.version) > SCHEMA_VERSION) {
      warnings.push(`配置版本 ${raw.version} 高于当前支持的 ${SCHEMA_VERSION}，可能有字段被忽略`);
    }
    if (!Array.isArray(raw.pages)) {
      errors.push("缺少 pages 数组");
      return { ok: false, config: null, errors, warnings };
    }
    const seenIds = /* @__PURE__ */ new Set();
    raw.pages.forEach((page, pi) => {
      if (!(page == null ? void 0 : page.url)) warnings.push(`pages[${pi}] 缺少 url，回放时无法匹配页面`);
      asArray(page == null ? void 0 : page.annotations).forEach((anno, ai) => {
        var _a, _b;
        const at = `pages[${pi}].annotations[${ai}]`;
        if (!(anno == null ? void 0 : anno.title) && !(anno == null ? void 0 : anno.body)) {
          warnings.push(`${at} 既没有 title 也没有 body，是一条空标注`);
        }
        if (anno == null ? void 0 : anno.id) {
          if (seenIds.has(anno.id)) errors.push(`${at} 的 id「${anno.id}」重复`);
          seenIds.add(anno.id);
        }
        if ((anno == null ? void 0 : anno.category) && !CATEGORY_KEYS.includes(anno.category)) {
          warnings.push(`${at} 的 category「${anno.category}」不在预设分类中，已回退为 note`);
        }
        const strategies = asArray((_a = anno == null ? void 0 : anno.target) == null ? void 0 : _a.strategies).filter((s) => s == null ? void 0 : s.kind);
        if (!strategies.length && !((_b = anno == null ? void 0 : anno.target) == null ? void 0 : _b.rect)) {
          errors.push(`${at} 既无定位策略也无坐标，无法定位到界面元素`);
        }
      });
    });
    return {
      ok: errors.length === 0,
      config: errors.length === 0 ? createConfig(raw) : null,
      errors,
      warnings
    };
  }
  function str(v) {
    return typeof v === "string" ? v : v == null ? "" : String(v);
  }
  function num(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }
  function strList(v) {
    if (Array.isArray(v)) return v.map(str).map((s2) => s2.trim()).filter(Boolean);
    const s = str(v).trim();
    if (!s) return [];
    return s.split("\n").map((x) => x.replace(/^[-*\d.\s]+/, "").trim()).filter(Boolean);
  }
  function plainObject(v) {
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  }
  function normalizeRect(rect) {
    return {
      x: num(rect.x, 0),
      y: num(rect.y, 0),
      width: num(rect.width, 0),
      height: num(rect.height, 0),
      /** document = 相对文档左上角（滚动无关），viewport = 相对可视区 */
      relativeTo: rect.relativeTo === "viewport" ? "viewport" : "document"
    };
  }

  // src/core/utils.js
  var isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
  var isFileProtocol = isBrowser && window.location.protocol === "file:";
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function normalizeText(input, max = 120) {
    const text = String(input == null ? "" : input).replace(/\s+/g, " ").trim();
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
  }
  function throttleRaf(fn) {
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
  function deepClone(value) {
    if (value == null || typeof value !== "object") return value;
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch {
      }
    }
    return JSON.parse(JSON.stringify(value));
  }
  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
  }
  function getDocumentRect(el) {
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
      relativeTo: "document"
    };
  }
  function accessibleName(el) {
    var _a, _b, _c, _d;
    if (!el || el.nodeType !== 1) return "";
    const aria = (_a = el.getAttribute) == null ? void 0 : _a.call(el, "aria-label");
    if (aria) return normalizeText(aria, 80);
    const labelledBy = (_b = el.getAttribute) == null ? void 0 : _b.call(el, "aria-labelledby");
    if (labelledBy) {
      const text = labelledBy.split(/\s+/).map((id) => {
        var _a2, _b2;
        return ((_b2 = (_a2 = el.ownerDocument) == null ? void 0 : _a2.getElementById(id)) == null ? void 0 : _b2.textContent) || "";
      }).join(" ");
      if (text.trim()) return normalizeText(text, 80);
    }
    if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") {
      if ((_c = el.labels) == null ? void 0 : _c.length) return normalizeText(el.labels[0].textContent, 80);
      const ph = el.getAttribute("placeholder");
      if (ph) return normalizeText(ph, 80);
    }
    if (el.tagName === "IMG") return normalizeText(el.getAttribute("alt"), 80);
    const title = (_d = el.getAttribute) == null ? void 0 : _d.call(el, "title");
    if (title) return normalizeText(title, 80);
    return normalizeText(el.textContent, 80);
  }
  function roleOf(el) {
    var _a, _b, _c;
    const explicit = (_a = el.getAttribute) == null ? void 0 : _a.call(el, "role");
    if (explicit) return explicit;
    const tag = (_b = el.tagName) == null ? void 0 : _b.toLowerCase();
    const implicit = {
      a: ((_c = el.hasAttribute) == null ? void 0 : _c.call(el, "href")) ? "link" : "",
      button: "button",
      input: inputRole(el),
      select: "combobox",
      textarea: "textbox",
      table: "table",
      form: "form",
      nav: "navigation",
      main: "main",
      header: "banner",
      footer: "contentinfo",
      aside: "complementary",
      ul: "list",
      ol: "list",
      li: "listitem",
      img: "img",
      h1: "heading",
      h2: "heading",
      h3: "heading",
      h4: "heading",
      dialog: "dialog"
    }[tag];
    return implicit || "";
  }
  function inputRole(el) {
    var _a;
    const type = (((_a = el.getAttribute) == null ? void 0 : _a.call(el, "type")) || "text").toLowerCase();
    return {
      checkbox: "checkbox",
      radio: "radio",
      button: "button",
      submit: "button",
      reset: "button",
      range: "slider",
      search: "searchbox",
      number: "spinbutton"
    }[type] || "textbox";
  }
  function isGeneratedToken(token) {
    if (!token) return true;
    return /^(css|sc|jsx|emotion|svelte)-/.test(token) || // 常见 CSS-in-JS 前缀
    /^data-v-[0-9a-f]{6,}$/.test(token) || // Vue scoped
    /[0-9a-f]{6,}$/i.test(token) && /\d/.test(token) || // 尾部哈希
    /^_+[0-9a-z]{4,}$/i.test(token) || // _1a2b3c
    /^[a-z]{1,3}[0-9]{4,}$/i.test(token) || // ab12345
    token.length > 40;
  }
  function stableClasses(el, limit = 3) {
    const list = Array.from(el.classList || []);
    return list.filter((c) => !isGeneratedToken(c) && !c.startsWith("ui-anno")).slice(0, limit);
  }
  function cssEscape(value) {
    const s = String(value);
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(s);
    return s.replace(/[^a-zA-Z0-9_-]/g, (ch) => "\\" + ch);
  }
  function indexAmongSiblings(el) {
    let index = 1;
    let sib = el.previousElementSibling;
    while (sib) {
      if (sib.tagName === el.tagName) index += 1;
      sib = sib.previousElementSibling;
    }
    return index;
  }
  function safeQueryAll(selector, root = document) {
    if (!selector) return [];
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch {
      return [];
    }
  }
  function urlPattern(href = isBrowser ? window.location.href : "") {
    let path = href;
    try {
      const url = new URL(href, "http://localhost");
      path = url.protocol === "file:" ? "/" + (url.pathname.split("/").pop() || "index.html") : url.pathname;
      if (url.hash.startsWith("#/")) path += url.hash;
    } catch {
    }
    return path.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:uuid").replace(/\/\d+(?=\/|$)/g, "/:id").replace(/\/[0-9a-f]{16,}(?=\/|$)/gi, "/:hash").replace(/\/+$/, "") || "/";
  }
  function currentUrl() {
    if (!isBrowser) return "";
    if (isFileProtocol) {
      const parts = window.location.pathname.split("/");
      return parts[parts.length - 1] + window.location.hash;
    }
    return window.location.href;
  }

  // src/core/store.js
  var AnnotationStore = class extends Emitter {
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
      this.author = options.author || "anonymous";
      this.autoSave = options.autoSave !== false;
      this.config = createConfig({ project: { name: options.projectName || document.title } });
      this.events = [];
      this._saveTimer = null;
      this._dirty = false;
    }
    /* ---------------------------------------------------------------- */
    /* 页面                                                             */
    /* ---------------------------------------------------------------- */
    /** 当前页面的标识（归一化路由），同一路由的不同参数视为同一页 */
    get pageKey() {
      return urlPattern(typeof location !== "undefined" ? location.href : "");
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
            dpr: window.devicePixelRatio || 1
          }
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
      var _a;
      const page = this.currentPage();
      const annotation = createAnnotation({
        ...input,
        // seq 是页面内的展示序号，也就是标记上的数字
        seq: page.annotations.length + 1,
        meta: { ...input.meta, author: ((_a = input.meta) == null ? void 0 : _a.author) || this.author }
      });
      page.annotations.push(annotation);
      this._audit("created", annotation.id, { title: annotation.title });
      this._changed("add", annotation);
      return annotation;
    }
    update(id, patch) {
      const annotation = this.find(id);
      if (!annotation) return null;
      const before = deepClone(annotation);
      Object.assign(annotation, {
        ...patch,
        businessLogic: { ...annotation.businessLogic, ...patch.businessLogic || {} },
        dataBinding: { ...annotation.dataBinding, ...patch.dataBinding || {} },
        target: patch.target ? { ...annotation.target, ...patch.target } : annotation.target,
        meta: { ...annotation.meta, ...patch.meta || {}, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }
      });
      this._audit("updated", id, { changed: changedKeys(before, annotation) });
      this._changed("update", annotation);
      return annotation;
    }
    remove(id) {
      for (const page of this.config.pages) {
        const index = page.annotations.findIndex((a) => a.id === id);
        if (index === -1) continue;
        const [removed] = page.annotations.splice(index, 1);
        page.annotations.forEach((a, i) => {
          a.seq = i + 1;
        });
        this._audit("deleted", id, { title: removed.title });
        this._changed("remove", removed);
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
      this._audit("page-cleared", page.id, { urlPattern: page.urlPattern });
      this._changed("clear", null);
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
          console.warn("[ui-annotator] 已存标注不合法，将忽略:", result.errors);
        }
        if (result.warnings.length) console.warn("[ui-annotator]", result.warnings.join("; "));
        this.emit("loaded", this.config);
      } catch (err) {
        console.error("[ui-annotator] 加载标注失败:", err);
      }
    }
    async save() {
      if (!this.adapter) return;
      clearTimeout(this._saveTimer);
      try {
        this.config.project.generatedAt = (/* @__PURE__ */ new Date()).toISOString();
        await this.adapter.save(deepClone(this.config));
        this._dirty = false;
        this.emit("saved", this.config);
      } catch (err) {
        this._dirty = true;
        this.emit("save-error", err);
        console.error("[ui-annotator] 保存失败:", err);
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
    import(raw, mode = "replace") {
      const result = validateConfig(raw);
      if (!result.ok) return result;
      if (mode === "replace") {
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
            if (seen.has(anno.id)) anno.id = createId();
            existing.annotations.push(anno);
          }
          existing.annotations.forEach((a, i) => {
            a.seq = i + 1;
          });
        }
      }
      this._audit("imported", "-", { mode, pages: result.config.pages.length });
      this._changed("import", null);
      this.emit("loaded", this.config);
      return result;
    }
    /* ---------------------------------------------------------------- */
    /* 内部                                                             */
    /* ---------------------------------------------------------------- */
    _audit(action, targetId, detail) {
      this.events.push({
        id: createId("evt"),
        action,
        targetId,
        actor: this.author,
        at: (/* @__PURE__ */ new Date()).toISOString(),
        detail: detail || {}
      });
      if (this.events.length > 500) this.events.splice(0, this.events.length - 500);
    }
    _changed(kind, annotation) {
      this._dirty = true;
      this.emit("changed", { kind, annotation });
      this.scheduleSave();
    }
  };
  function changedKeys(before, after) {
    const keys = /* @__PURE__ */ new Set([...Object.keys(before), ...Object.keys(after)]);
    const changed = [];
    for (const key of keys) {
      if (key === "meta") continue;
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changed.push(key);
    }
    return changed;
  }

  // src/core/storage.js
  function createMemoryAdapter() {
    let cache = null;
    return {
      name: "memory",
      persistent: false,
      async load() {
        return cache;
      },
      async save(config) {
        cache = config;
      },
      async clear() {
        cache = null;
      }
    };
  }
  function localStorageUsable() {
    try {
      const key = "__ui_annotator_probe__";
      window.localStorage.setItem(key, "1");
      window.localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }
  function createLocalStorageAdapter(storageKey = "ui-annotator:config") {
    return {
      name: "localStorage",
      persistent: true,
      usable: localStorageUsable,
      async load() {
        try {
          const raw = window.localStorage.getItem(storageKey);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      },
      async save(config) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(config));
        } catch (err) {
          throw new Error("localStorage 写入失败（可能超出配额或被浏览器禁用）: " + err.message);
        }
      },
      async clear() {
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
        }
      }
    };
  }
  function createHttpAdapter(options = {}) {
    var _a;
    const { endpoint, headers = {}, fetchImpl = (_a = globalThis.fetch) == null ? void 0 : _a.bind(globalThis) } = options;
    if (!endpoint) throw new Error("http 适配器必须提供 endpoint");
    return {
      name: "http",
      persistent: true,
      async load() {
        const res = await fetchImpl(endpoint, { headers, credentials: "same-origin" });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`加载标注失败: HTTP ${res.status}`);
        return res.json();
      },
      async save(config) {
        const res = await fetchImpl(endpoint, {
          method: "PUT",
          headers: { "content-type": "application/json", ...headers },
          credentials: "same-origin",
          body: JSON.stringify(config)
        });
        if (!res.ok) throw new Error(`保存标注失败: HTTP ${res.status}`);
      },
      async clear() {
        await fetchImpl(endpoint, { method: "DELETE", headers, credentials: "same-origin" });
      }
    };
  }
  function createInlineAdapter(selector = "#ui-annotator-config") {
    return {
      name: "inline",
      persistent: false,
      readOnly: true,
      async load() {
        const node = document.querySelector(selector);
        if (!node) return null;
        try {
          return JSON.parse(node.textContent || "null");
        } catch (err) {
          console.error("[ui-annotator] 内联配置不是合法 JSON:", err);
          return null;
        }
      },
      async save() {
      },
      async clear() {
      }
    };
  }
  function resolveAdapter(spec, context = {}) {
    if (spec && typeof spec === "object" && typeof spec.load === "function") return spec;
    const type = typeof spec === "object" && spec ? spec.type : spec;
    if (type === "http") return createHttpAdapter(spec);
    if (type === "inline") return createInlineAdapter(spec == null ? void 0 : spec.selector);
    if (type === "memory") return createMemoryAdapter();
    const local = createLocalStorageAdapter(context.storageKey);
    if (local.usable()) return local;
    console.warn(
      isFileProtocol ? "[ui-annotator] file:// 下 localStorage 不可用，已降级为内存存储。请用「导出 JSON」保存标注结果。" : "[ui-annotator] localStorage 不可用，已降级为内存存储。"
    );
    return createMemoryAdapter();
  }
  function createLayeredAdapter(readAdapters, writeAdapter) {
    return {
      name: "layered",
      persistent: Boolean(writeAdapter == null ? void 0 : writeAdapter.persistent),
      async load() {
        if (writeAdapter) {
          const local = await writeAdapter.load().catch(() => null);
          if (local) return local;
        }
        for (const adapter of readAdapters) {
          const data = await adapter.load().catch(() => null);
          if (data) return data;
        }
        return null;
      },
      async save(config) {
        if (writeAdapter) await writeAdapter.save(config);
      },
      async clear() {
        if (writeAdapter) await writeAdapter.clear();
      }
    };
  }

  // src/core/framework.js
  function detectFramework() {
    if (typeof document === "undefined") return "unknown";
    if (document.querySelector("[data-reactroot]")) return "react";
    if (window.React || window.ReactDOM) return "react";
    if (window.Vue) return "vue";
    if (document.querySelector("[data-v-app]")) return "vue";
    const sample = Array.from(document.querySelectorAll("body *")).slice(0, 300);
    for (const el of sample) {
      if (reactFiberOf(el)) return "react";
      if (el.__vueParentComponent || el.__vue__) return "vue";
    }
    if (document.querySelector('[class*="ng-"], [ng-version]')) return "angular";
    return "html";
  }
  function vueInstanceOf(el) {
    return el.__vueParentComponent || el.__vue__ || null;
  }
  function vue3ComponentName(instance2) {
    const type = instance2 == null ? void 0 : instance2.type;
    if (!type) return "";
    if (type.name) return type.name;
    if (type.__name) return type.__name;
    if (type.__file) return fileBaseName(type.__file);
    return "";
  }
  function vue2ComponentName(instance2) {
    const options = instance2 == null ? void 0 : instance2.$options;
    if (!options) return "";
    return options.name || options._componentTag || fileBaseName(options.__file || "");
  }
  function vueNameOf(instance2) {
    if (!instance2) return "";
    return instance2.$options ? vue2ComponentName(instance2) : vue3ComponentName(instance2);
  }
  function vueComponentPath(el, limit = 8) {
    const path = [];
    let instance2 = null;
    let node = el;
    while (node && !instance2) {
      instance2 = vueInstanceOf(node);
      node = node.parentElement;
    }
    let current = instance2;
    while (current && path.length < limit) {
      const name = vueNameOf(current);
      if (name && name !== "Anonymous") path.unshift(name);
      current = current.parent || current.$parent;
    }
    return path;
  }
  function vueSourceFile(el) {
    var _a, _b;
    let node = el;
    while (node) {
      const instance2 = vueInstanceOf(node);
      const file = ((_a = instance2 == null ? void 0 : instance2.type) == null ? void 0 : _a.__file) || ((_b = instance2 == null ? void 0 : instance2.$options) == null ? void 0 : _b.__file);
      if (file) return file;
      node = node.parentElement;
    }
    return "";
  }
  function reactFiberOf(el) {
    for (const key in el) {
      if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
        return el[key];
      }
    }
    return null;
  }
  function reactNameOf(fiber) {
    const type = (fiber == null ? void 0 : fiber.type) || (fiber == null ? void 0 : fiber.elementType);
    if (!type) return "";
    if (typeof type === "string") return "";
    const name = type.displayName || type.name;
    if (name) return name;
    if (type.render) return type.render.displayName || type.render.name || "";
    if (type.type) return type.type.displayName || type.type.name || "";
    return "";
  }
  function reactComponentPath(el, limit = 8) {
    const path = [];
    let fiber = null;
    let node = el;
    while (node && !fiber) {
      fiber = reactFiberOf(node);
      node = node.parentElement;
    }
    let current = fiber;
    const seen = /* @__PURE__ */ new Set();
    while (current && path.length < limit && !seen.has(current)) {
      seen.add(current);
      const name = reactNameOf(current);
      if (name && !/^(Provider|Consumer|Fragment|StrictMode|Suspense|Anonymous)$/.test(name)) {
        if (path[0] !== name) path.unshift(name);
      }
      current = current.return;
    }
    return path;
  }
  function reactSourceFile(el) {
    var _a;
    let node = el;
    while (node) {
      const fiber = reactFiberOf(node);
      const source = fiber == null ? void 0 : fiber._debugSource;
      if (source == null ? void 0 : source.fileName) return `${source.fileName}:${(_a = source.lineNumber) != null ? _a : ""}`;
      node = node.parentElement;
    }
    return "";
  }
  function describeComponent(el) {
    const empty = { framework: "html", component: "", componentPath: [], sourceFile: "" };
    if (!el || el.nodeType !== 1) return empty;
    try {
      const vuePath = vueComponentPath(el);
      if (vuePath.length) {
        return {
          framework: "vue",
          component: vuePath[vuePath.length - 1],
          componentPath: vuePath,
          sourceFile: vueSourceFile(el)
        };
      }
      const reactPath = reactComponentPath(el);
      if (reactPath.length) {
        return {
          framework: "react",
          component: reactPath[reactPath.length - 1],
          componentPath: reactPath,
          sourceFile: reactSourceFile(el)
        };
      }
    } catch {
    }
    return empty;
  }
  function findByComponentPath(path, root = document.body) {
    if (!Array.isArray(path) || !path.length) return [];
    const target = path.join(">");
    const matches = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      if (node.__vueParentComponent || node.__vue__ || reactFiberOf(node)) {
        const info = describeComponent(node);
        if (info.componentPath.join(">") === target) matches.push(node);
      }
      node = walker.nextNode();
    }
    return matches;
  }
  function componentLabel(el) {
    const info = describeComponent(el);
    if (!info.component) return "";
    return normalizeText(info.componentPath.join(" › "), 60);
  }

  // src/core/locator.js
  var OWN_MARKUP = "ui-annotator-root";
  var TEST_ID_ATTRS = ["data-anno-id", "data-testid", "data-test-id", "data-test", "data-cy", "data-qa", "data-track"];
  function isOwnElement(el) {
    return !el || !el.closest || Boolean(el.closest(OWN_MARKUP));
  }
  function tagOf(el) {
    return el.tagName ? el.tagName.toLowerCase() : "";
  }
  function usable(list) {
    return list.filter((el) => el && el.nodeType === 1 && !isOwnElement(el));
  }
  var STRATEGIES = [
    {
      kind: "anchorId",
      weight: 100,
      capture(el) {
        const value = el.getAttribute("data-anno-id");
        return value ? { value } : null;
      },
      resolve(value) {
        return usable(safeQueryAll(`[data-anno-id="${cssEscape(value)}"]`));
      }
    },
    {
      kind: "testId",
      weight: 90,
      capture(el) {
        for (const attr of TEST_ID_ATTRS) {
          const value = el.getAttribute(attr);
          if (value) return { value, extra: { attr } };
        }
        return null;
      },
      resolve(value, extra) {
        const attr = (extra == null ? void 0 : extra.attr) || "data-testid";
        return usable(safeQueryAll(`[${attr}="${cssEscape(value)}"]`));
      }
    },
    {
      kind: "domId",
      weight: 70,
      capture(el) {
        if (!el.id || isGeneratedToken(el.id)) return null;
        return { value: el.id };
      },
      resolve(value) {
        const el = document.getElementById(value);
        return usable(el ? [el] : []);
      }
    },
    {
      kind: "ariaPath",
      weight: 55,
      capture(el) {
        const role = roleOf(el);
        const name = accessibleName(el);
        if (!role && !name) return null;
        return { value: `${role}|${name}`, extra: { landmark: nearestLandmarkSelector(el) } };
      },
      resolve(value, extra) {
        const [role, name] = String(value).split("|");
        const scopes = (extra == null ? void 0 : extra.landmark) ? safeQueryAll(extra.landmark) : [];
        const roots = scopes.length ? scopes : [document.body];
        const found = [];
        for (const root of roots) {
          if (!root) continue;
          for (const el of usable(safeQueryAll("*", root))) {
            if (role && roleOf(el) !== role) continue;
            if (name && accessibleName(el) !== name) continue;
            if (!role && !name) continue;
            found.push(el);
          }
        }
        return found;
      }
    },
    {
      kind: "componentPath",
      weight: 50,
      capture(el) {
        const info = describeComponent(el);
        if (!info.componentPath.length) return null;
        return {
          value: info.componentPath.join(">"),
          // 组件根到目标元素的相对结构路径，用于在组件内部再收敛一次
          extra: { within: relativeNthPath(el, componentRootOf(el)) }
        };
      },
      resolve(value, extra) {
        const roots = usable(findByComponentPath(String(value).split(">")));
        if (!roots.length) return [];
        const within = extra == null ? void 0 : extra.within;
        if (!within) return roots;
        const found = [];
        for (const root of roots) {
          const el = within === ":self" ? root : root.querySelector(within);
          if (el) found.push(el);
        }
        return found.length ? usable(found) : roots;
      }
    },
    {
      kind: "textual",
      weight: 35,
      capture(el) {
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
        const tag = (extra == null ? void 0 : extra.tag) || "*";
        const matched = usable(safeQueryAll(tag)).filter(
          (el) => normalizeText(el.textContent, 60) === value
        );
        if (!matched.length) return [];
        const index = Number(extra == null ? void 0 : extra.index) || 0;
        const primary = matched[index] || matched[0];
        return [primary, ...matched.filter((el) => el !== primary)];
      }
    },
    {
      kind: "cssPath",
      weight: 40,
      capture(el) {
        const selector = buildStableCssPath(el);
        return selector ? { value: selector } : null;
      },
      resolve(value) {
        return usable(safeQueryAll(value));
      }
    },
    {
      kind: "attrHints",
      weight: 25,
      capture(el) {
        var _a;
        const hints = {};
        for (const attr of ["name", "type", "placeholder", "href", "alt", "for", "value"]) {
          const v = (_a = el.getAttribute) == null ? void 0 : _a.call(el, attr);
          if (v && v.length < 80) hints[attr] = v;
        }
        if (!Object.keys(hints).length) return null;
        return { value: tagOf(el), extra: { hints } };
      },
      resolve(value, extra) {
        const hints = (extra == null ? void 0 : extra.hints) || {};
        const selector = value + Object.entries(hints).map(([k, v]) => `[${k}="${cssEscape(v)}"]`).join("");
        return usable(safeQueryAll(selector));
      }
    },
    {
      kind: "nthPath",
      weight: 30,
      capture(el) {
        const path = absoluteNthPath(el);
        return path ? { value: path } : null;
      },
      resolve(value) {
        return usable(safeQueryAll(value));
      }
    }
  ];
  var STRATEGY_MAP = new Map(STRATEGIES.map((s) => [s.kind, s]));
  var AUTHORITATIVE = /* @__PURE__ */ new Set(["anchorId", "testId", "domId"]);
  function nearestLandmarkSelector(el) {
    var _a;
    const landmark = (_a = el.closest) == null ? void 0 : _a.call(
      el,
      '[role="main"], [role="navigation"], [role="dialog"], main, nav, aside, header, footer, form, section[id], section[class], table'
    );
    if (!landmark || landmark === el) return "";
    const tag = tagOf(landmark);
    if (landmark.id && !isGeneratedToken(landmark.id)) return `${tag}#${cssEscape(landmark.id)}`;
    const cls = stableClasses(landmark, 1);
    const role = landmark.getAttribute("role");
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
  function relativeNthPath(el, root) {
    if (!root) return "";
    if (el === root) return ":self";
    const segments = [];
    let node = el;
    while (node && node !== root && node !== document.body) {
      segments.unshift(`${tagOf(node)}:nth-of-type(${indexAmongSiblings(node)})`);
      node = node.parentElement;
    }
    return node === root ? segments.join(" > ") : "";
  }
  function absoluteNthPath(el) {
    const segments = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      if (node === document.body) {
        segments.unshift("body");
        break;
      }
      const parent = node.parentElement;
      if (!parent) break;
      const index = Array.prototype.indexOf.call(parent.children, node) + 1;
      segments.unshift(`${tagOf(node)}:nth-child(${index})`);
      node = parent;
    }
    return segments.length > 1 ? segments.join(" > ") : "";
  }
  function buildStableCssPath(el, maxDepth = 6) {
    const own = simpleSelector(el);
    if (!own) return "";
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
    var _a;
    if (!el || el.nodeType !== 1) return "";
    const tag = tagOf(el);
    if (!tag) return "";
    if (el === document.body) return "body";
    if (el.id && !isGeneratedToken(el.id)) return `${tag}#${cssEscape(el.id)}`;
    const classes = stableClasses(el);
    if (classes.length) return tag + classes.map((c) => `.${cssEscape(c)}`).join("");
    for (const attr of ["role", "name", "type"]) {
      const v = (_a = el.getAttribute) == null ? void 0 : _a.call(el, attr);
      if (v && v.length < 40) return `${tag}[${attr}="${cssEscape(v)}"]`;
    }
    return tag;
  }
  function captureSnapshot(el) {
    var _a;
    const info = describeComponent(el);
    const attrs = {};
    for (const attr of ["type", "name", "placeholder", "href", "role", "aria-label", "disabled"]) {
      const v = (_a = el.getAttribute) == null ? void 0 : _a.call(el, attr);
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
      sourceFile: info.sourceFile
    };
  }
  function captureTarget(el, options = {}) {
    var _a;
    if (options.stampAnchor && !el.getAttribute("data-anno-id")) {
      el.setAttribute("data-anno-id", `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
    }
    const strategies = [];
    for (const strategy of STRATEGIES) {
      try {
        const captured = strategy.capture(el);
        if (captured && captured.value) {
          strategies.push({ kind: strategy.kind, value: captured.value, extra: (_a = captured.extra) != null ? _a : null });
        }
      } catch {
      }
    }
    return {
      strategies,
      rect: getDocumentRect(el),
      snapshot: captureSnapshot(el),
      resolved: null
    };
  }
  function snapshotSimilarity(el, snapshot) {
    var _a;
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
      check(1, ((_a = el.getAttribute) == null ? void 0 : _a.call(el, key)) === value);
    }
    return total === 0 ? 0 : score / total;
  }
  function resolveTarget(target) {
    const strategies = Array.isArray(target == null ? void 0 : target.strategies) ? target.strategies : [];
    if (!strategies.length) {
      return { element: null, kind: "", confidence: 0, status: "orphaned", candidates: 0, votes: [] };
    }
    const scores = /* @__PURE__ */ new Map();
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
      const vote = strategy.weight / Math.min(found.length, 5);
      found.slice(0, 10).forEach((el, index) => {
        const positional = vote / (1 + index * 0.5);
        const record = scores.get(el) || { weight: 0, kinds: [] };
        record.weight += positional;
        record.kinds.push(item.kind);
        scores.set(el, record);
      });
    }
    if (!scores.size) {
      return { element: null, kind: "", confidence: 0, status: "orphaned", candidates: 0, votes: [] };
    }
    for (const [el, record] of scores) {
      record.weight += snapshotSimilarity(el, target.snapshot) * 45;
      if (!isVisible(el)) record.weight *= 0.6;
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
    const status = authoritative || confidence >= 0.45 ? "active" : "drifted";
    return {
      element: winner,
      kind: winnerRecord.kinds[0] || "",
      confidence: Number(confidence.toFixed(3)),
      status,
      candidates: scores.size,
      votes: winnerRecord.kinds
    };
  }
  function healTarget(target, element) {
    if (!element) return false;
    const fresh = captureTarget(element);
    const before = JSON.stringify(target.strategies);
    target.strategies = fresh.strategies;
    target.rect = fresh.rect;
    target.snapshot = fresh.snapshot;
    return before !== JSON.stringify(target.strategies);
  }
  function elementAtRect(rect) {
    if (!rect) return null;
    const x = rect.x + rect.width / 2 - (rect.relativeTo === "document" ? window.scrollX : 0);
    const y = rect.y + rect.height / 2 - (rect.relativeTo === "document" ? window.scrollY : 0);
    const el = document.elementFromPoint(x, y);
    return el && !isOwnElement(el) ? el : null;
  }

  // src/ui/dom.js
  function h(tag, props = {}, children = []) {
    const [name, ...rest] = tag.split(/(?=[.#])/);
    const el = document.createElement(name || "div");
    for (const token of rest) {
      if (token[0] === ".") el.classList.add(token.slice(1));
      else if (token[0] === "#") el.id = token.slice(1);
    }
    for (const [key, value] of Object.entries(props || {})) {
      if (value == null || value === false) continue;
      if (key === "class") el.className = [el.className, value].filter(Boolean).join(" ");
      else if (key === "text") el.textContent = value;
      else if (key === "html") el.innerHTML = value;
      else if (key === "style") Object.assign(el.style, value);
      else if (key === "dataset") Object.assign(el.dataset, value);
      else if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) el.setAttribute(key, "");
      else el.setAttribute(key, String(value));
    }
    for (const child of [].concat(children)) {
      if (child == null || child === false) continue;
      el.append(typeof child === "string" || typeof child === "number" ? String(child) : child);
    }
    return el;
  }
  function icon(path, size = 15) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("class", "icon");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", path);
    svg.append(p);
    return svg;
  }
  var ICONS = {
    cursor: "M4 3l7 17 2.5-6.5L20 11z",
    frame: "M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2",
    list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 9a3 3 0 100 6 3 3 0 000-6z",
    code: "M16 18l6-6-6-6M8 6l-6 6 6 6",
    sparkles: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z",
    close: "M18 6L6 18M6 6l12 12",
    trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
    edit: "M11 4h-5a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z",
    target: "M12 2v3M12 19v3M2 12h3M19 12h3M12 8a4 4 0 100 8 4 4 0 000-8z",
    download: "M12 3v12M7 10l5 5 5-5M5 21h14",
    upload: "M12 21V9M7 14l5-5 5 5M5 3h14",
    copy: "M9 9h10v10H9zM5 15H3V3h12v2",
    help: "M12 17h.01M12 14c0-2 2.5-2.2 2.5-4A2.5 2.5 0 0012 7.5 2.5 2.5 0 009.5 10M12 2a10 10 0 100 20 10 10 0 000-20z"
  };

  // src/ui/editor.js
  var Editor = class {
    /**
     * @param {object} handlers
     * @param {(id: string|null, values: object) => void} handlers.onSave
     * @param {(id: string) => void} handlers.onDelete
     * @param {() => void} handlers.onClose
     * @param {(id: string) => void} handlers.onRetarget 重新指定标注挂载的元素
     */
    constructor(handlers = {}) {
      this.handlers = handlers;
      this.annotation = null;
      this.panel = h("div.panel.hidden");
      this._buildSkeleton();
    }
    mount(container) {
      container.append(this.panel);
    }
    get open() {
      return !this.panel.classList.contains("hidden");
    }
    /* ---------------------------------------------------------------- */
    /* 骨架                                                             */
    /* ---------------------------------------------------------------- */
    _buildSkeleton() {
      this.titleEl = h("strong", { text: "新增标注" });
      this.body = h("div.body");
      const header = h("header", {}, [
        this.titleEl,
        h("button.btn.ghost", { title: "关闭 (Esc)", onclick: () => this.close() }, [icon(ICONS.close)])
      ]);
      this.deleteBtn = h("button.btn.danger", {
        onclick: () => {
          var _a, _b;
          if (this.annotation) (_b = (_a = this.handlers).onDelete) == null ? void 0 : _b.call(_a, this.annotation.id);
        }
      }, [icon(ICONS.trash), "删除"]);
      const footer = h("footer", {}, [
        this.deleteBtn,
        h("div.spacer"),
        h("button.btn", { onclick: () => this.close() }, ["取消"]),
        h("button.btn.primary", { onclick: () => this._save() }, ["保存 (Ctrl+Enter)"])
      ]);
      this.panel.append(header, this.body, footer);
      this._makeDraggable(header);
      this.panel.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          this._save();
        } else if (event.key === "Escape") {
          event.preventDefault();
          this.close();
        }
        event.stopPropagation();
      });
    }
    /** 面板可拖动，避免遮挡正在标注的元素 */
    _makeDraggable(handle) {
      let origin = null;
      handle.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button")) return;
        const rect = this.panel.getBoundingClientRect();
        origin = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
        handle.setPointerCapture(event.pointerId);
        handle.style.cursor = "grabbing";
      });
      handle.addEventListener("pointermove", (event) => {
        if (!origin) return;
        const left = origin.left + (event.clientX - origin.x);
        const top = origin.top + (event.clientY - origin.y);
        this.panel.style.left = `${clamp(left, 0, window.innerWidth - 120)}px`;
        this.panel.style.top = `${clamp(top, 0, window.innerHeight - 60)}px`;
        this.panel.style.right = "auto";
        this.panel.style.bottom = "auto";
      });
      handle.addEventListener("pointerup", () => {
        origin = null;
        handle.style.cursor = "grab";
      });
    }
    /* ---------------------------------------------------------------- */
    /* 表单                                                             */
    /* ---------------------------------------------------------------- */
    /**
     * 打开面板。
     * @param {object} annotation 待编辑的标注（新增时传入仅含 target 的草稿）
     * @param {{isNew?: boolean, anchorRect?: DOMRect}} options
     */
    show(annotation, options = {}) {
      this.annotation = annotation;
      this.isNew = Boolean(options.isNew);
      this.titleEl.textContent = this.isNew ? "新增标注" : `编辑标注 #${annotation.seq}`;
      this.deleteBtn.classList.toggle("hidden", this.isNew);
      this._renderForm(annotation);
      this.panel.classList.remove("hidden");
      this._placeNear(options.anchorRect);
      requestAnimationFrame(() => this.fields.title.focus());
    }
    close() {
      var _a, _b;
      this.panel.classList.add("hidden");
      this.annotation = null;
      (_b = (_a = this.handlers).onClose) == null ? void 0 : _b.call(_a);
    }
    _renderForm(annotation) {
      this.body.innerHTML = "";
      this.fields = {};
      this.body.append(this._targetInfo(annotation));
      this.body.append(this._categoryField(annotation));
      this.fields.title = this._input("标题", annotation.title, {
        placeholder: "一句话概括这个元素的作用，例如「提交订单按钮」"
      });
      this.body.append(this.fields.title.closest(".field"));
      this.fields.body = this._textarea("业务说明", annotation.body, {
        placeholder: "用业务语言说明这里发生了什么、为什么这样设计",
        rows: 4
      });
      this.body.append(this.fields.body.closest(".field"));
      this.body.append(this._logicGroup(annotation.businessLogic));
      this.body.append(this._dataGroup(annotation.dataBinding));
      this.body.append(this._metaGroup(annotation));
    }
    /** 展示定位信息，让标注者确认挂载对象正确，并可重新指定 */
    _targetInfo(annotation) {
      var _a, _b, _c;
      const snapshot = ((_a = annotation.target) == null ? void 0 : _a.snapshot) || {};
      const strategies = ((_b = annotation.target) == null ? void 0 : _b.strategies) || [];
      const box = h("div.target-info");
      box.append(h("div", {}, [
        h("strong", { text: annotation.type === "region" ? "区域标注" : "元素标注" }),
        h("span", { text: `  共 ${strategies.length} 条定位线索` })
      ]));
      if (snapshot.tag) {
        box.append(h("div.row", {}, [h("span", { text: "元素" }), h("span", {}, [h("code", { text: `<${snapshot.tag}>` }), snapshot.role ? ` role=${snapshot.role}` : ""])]));
      }
      if ((_c = snapshot.componentPath) == null ? void 0 : _c.length) {
        box.append(h("div.row", {}, [h("span", { text: "组件" }), h("span", { text: snapshot.componentPath.join(" › ") })]));
      }
      if (snapshot.text) {
        box.append(h("div.row", {}, [h("span", { text: "文案" }), h("span", { text: normalizeText(snapshot.text, 60) })]));
      }
      const primary = strategies[0];
      if (primary) {
        box.append(h("div.row", {}, [h("span", { text: "主线索" }), h("span", {}, [h("code", { text: `${primary.kind}: ${normalizeText(String(primary.value), 48)}` })])]));
      }
      if (!this.isNew) {
        box.append(h("div", { style: { marginTop: "6px" } }, [
          h("button.btn.ghost", {
            style: { fontSize: "11px", padding: "2px 6px" },
            onclick: () => {
              var _a2, _b2;
              return (_b2 = (_a2 = this.handlers).onRetarget) == null ? void 0 : _b2.call(_a2, annotation.id);
            }
          }, [icon(ICONS.target, 12), "重新指定元素"])
        ]));
      }
      return box;
    }
    _categoryField(annotation) {
      const field = h("div.field", {}, [h("label", { text: "分类" })]);
      const group = h("div.cats");
      this._selectedCategory = annotation.category || "note";
      for (const cat of CATEGORIES) {
        const btn = h("button", {
          type: "button",
          "aria-pressed": String(cat.key === this._selectedCategory),
          text: cat.label,
          onclick: () => {
            this._selectedCategory = cat.key;
            for (const node of group.children) {
              const pressed = node === btn;
              node.setAttribute("aria-pressed", String(pressed));
              node.style.background = pressed ? categoryOf(cat.key).color : "";
            }
          }
        });
        if (cat.key === this._selectedCategory) btn.style.background = cat.color;
        group.append(btn);
      }
      field.append(group);
      return field;
    }
    /** 「业务逻辑」折叠组：这几项是给 AI 还原业务流程用的关键结构 */
    _logicGroup(logic = {}) {
      const filled = Object.values(logic).some((v) => Array.isArray(v) ? v.length : v);
      const group = h("details.group", filled ? { open: true } : {});
      group.append(h("summary", { text: "业务逻辑（结构化，可选）" }));
      this.fields.trigger = this._input("触发条件", logic.trigger, { placeholder: "用户点击 / 页面加载 / 定时轮询" });
      this.fields.effect = this._input("核心行为", logic.effect, { placeholder: "校验表单并调用创建订单接口" });
      this.fields.preconditions = this._textarea("前置条件", join(logic.preconditions), { placeholder: "每行一条，例如：\n表单校验通过\n拥有 order:create 权限", rows: 2 });
      this.fields.postconditions = this._textarea("执行结果", join(logic.postconditions), { placeholder: "每行一条，例如：\n跳转订单详情页", rows: 2 });
      this.fields.rules = this._textarea("业务规则", join(logic.rules), { placeholder: "每行一条，例如：\n金额超过 5 万需二级审批", rows: 2 });
      this.fields.errorStates = this._textarea("异常与边界", join(logic.errorStates), { placeholder: "每行一条，例如：\n库存不足时提示并禁用按钮", rows: 2 });
      for (const key of ["trigger", "effect", "preconditions", "postconditions", "rules", "errorStates"]) {
        group.append(this.fields[key].closest(".field"));
      }
      return group;
    }
    /** 「数据绑定」折叠组：字段与接口用简单 DSL 录入，避免做复杂的子表格 */
    _dataGroup(binding = {}) {
      var _a, _b, _c;
      const filled = ((_a = binding.fields) == null ? void 0 : _a.length) || ((_b = binding.apis) == null ? void 0 : _b.length) || ((_c = binding.stateKeys) == null ? void 0 : _c.length);
      const group = h("details.group", filled ? { open: true } : {});
      group.append(h("summary", { text: "数据与接口（可选）" }));
      this.fields.fields = this._textarea("字段", fieldsToText(binding.fields), {
        placeholder: "每行一个：名称|标签|类型|必填|校验说明\n例：amount|订单金额|number|必填|大于 0",
        rows: 3
      });
      this.fields.fields.closest(".field").append(
        h("div.help", { text: "格式：名称|标签|类型|必填|校验说明（用 | 分隔，缺省留空）" })
      );
      this.fields.apis = this._textarea("接口", apisToText(binding.apis), {
        placeholder: "每行一个：METHOD 路径 说明\n例：POST /api/orders 创建订单",
        rows: 2
      });
      this.fields.stateKeys = this._input("状态字段", join(binding.stateKeys, ", "), {
        placeholder: "store 中的状态键，逗号分隔"
      });
      for (const key of ["fields", "apis", "stateKeys"]) {
        group.append(this.fields[key].closest(".field"));
      }
      return group;
    }
    _metaGroup(annotation) {
      var _a, _b;
      const group = h("details.group");
      group.append(h("summary", { text: "标签与关联（可选）" }));
      this.fields.tags = this._input("标签", join(annotation.tags, ", "), { placeholder: "逗号分隔，如：核心流程, 需产品确认" });
      group.append(this.fields.tags.closest(".field"));
      if (((_a = annotation.meta) == null ? void 0 : _a.source) === "ai") {
        const wrap = h("div.field");
        this.fields.reviewed = h("input", { type: "checkbox", ...annotation.meta.reviewed ? { checked: true } : {} });
        wrap.append(h("label", {}, [
          this.fields.reviewed,
          h("span", { text: ` 已人工复核（AI 生成，置信度 ${(_b = annotation.meta.aiConfidence) != null ? _b : "未知"}）` })
        ]));
        group.append(wrap);
      }
      return group;
    }
    /* ---------------------------------------------------------------- */
    // 返回控件本身（便于读写 value），包装层已成为它的父节点，
    // 调用方用 input.closest('.field') 取回整块再插入 DOM。
    _input(label, value, attrs = {}) {
      const input = h("input", { type: "text", value: value || "", ...attrs });
      h("div.field", {}, [h("label", { text: label }), input]);
      return input;
    }
    _textarea(label, value, attrs = {}) {
      const area = h("textarea", attrs);
      area.value = value || "";
      h("div.field", {}, [h("label", { text: label }), area]);
      return area;
    }
    /** 尽量把面板放在被标注元素旁边，但不越出视口 */
    _placeNear(anchorRect) {
      const width = 380;
      const height = Math.min(window.innerHeight * 0.78, 680);
      if (!anchorRect) {
        this.panel.style.left = `${Math.max(12, window.innerWidth - width - 24)}px`;
        this.panel.style.top = "72px";
        return;
      }
      let left = anchorRect.right + 16;
      if (left + width > window.innerWidth - 12) left = Math.max(12, anchorRect.left - width - 16);
      if (left < 12) left = 12;
      const top = clamp(anchorRect.top, 12, Math.max(12, window.innerHeight - height - 12));
      this.panel.style.left = `${left}px`;
      this.panel.style.top = `${top}px`;
      this.panel.style.right = "auto";
      this.panel.style.bottom = "auto";
    }
    /** 收集表单值，转回 schema 结构 */
    _collect() {
      const f = this.fields;
      return {
        category: this._selectedCategory,
        title: f.title.value.trim(),
        body: f.body.value.trim(),
        tags: splitList(f.tags.value),
        businessLogic: {
          trigger: f.trigger.value.trim(),
          effect: f.effect.value.trim(),
          preconditions: splitLines(f.preconditions.value),
          postconditions: splitLines(f.postconditions.value),
          rules: splitLines(f.rules.value),
          errorStates: splitLines(f.errorStates.value)
        },
        dataBinding: {
          fields: textToFields(f.fields.value),
          apis: textToApis(f.apis.value),
          stateKeys: splitList(f.stateKeys.value)
        },
        meta: f.reviewed ? { reviewed: f.reviewed.checked } : void 0
      };
    }
    _save() {
      var _a, _b;
      if (!this.annotation) return;
      const values = this._collect();
      if (!values.title && !values.body) {
        this.fields.title.focus();
        this.fields.title.style.borderColor = "#dc2626";
        return;
      }
      (_b = (_a = this.handlers).onSave) == null ? void 0 : _b.call(_a, this.isNew ? null : this.annotation.id, values);
    }
  };
  function join(list, separator = "\n") {
    return Array.isArray(list) ? list.join(separator) : list || "";
  }
  function splitLines(text) {
    return String(text || "").split("\n").map((s) => s.trim()).filter(Boolean);
  }
  function splitList(text) {
    return String(text || "").split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  }
  function fieldsToText(fields) {
    if (!Array.isArray(fields)) return "";
    return fields.map((f) => [f.name, f.label, f.type, f.required ? "必填" : "", f.validation].join("|").replace(/\|+$/, "")).join("\n");
  }
  function textToFields(text) {
    return splitLines(text).map((line) => {
      const [name, label, type, required, validation] = line.split("|").map((s) => (s || "").trim());
      return {
        name,
        label,
        type,
        required: /必填|required|true|y/i.test(required || ""),
        validation
      };
    }).filter((f) => f.name || f.label);
  }
  function apisToText(apis) {
    if (!Array.isArray(apis)) return "";
    return apis.map((a) => [a.method, a.path, a.purpose].filter(Boolean).join(" ")).join("\n");
  }
  function textToApis(text) {
    return splitLines(text).map((line) => {
      const match = line.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)\s*(.*)$/i);
      if (match) {
        return { method: match[1].toUpperCase(), path: match[2], purpose: match[3].trim() };
      }
      const [path, ...rest] = line.split(/\s+/);
      return { method: "GET", path, purpose: rest.join(" ") };
    }).filter((a) => a.path);
  }

  // src/ui/modal.js
  var TABS = [
    { key: "config", label: "配置 JSON" },
    { key: "context", label: "AI 上下文" },
    { key: "prompt", label: "提示词" },
    { key: "import", label: "导入" }
  ];
  var ExportModal = class {
    /**
     * @param {object} handlers
     * @param {(tab: string) => string} handlers.getContent  取各标签页要展示的文本
     * @param {(text: string, mode: string) => void} handlers.onImport
     * @param {(message: string, type?: string) => void} handlers.toast
     */
    constructor(handlers = {}) {
      this.handlers = handlers;
      this.tab = "config";
      this.mask = h("div.modal-mask.hidden", {
        onclick: (event) => {
          if (event.target === this.mask) this.close();
        }
      });
      this._build();
    }
    mount(container) {
      container.append(this.mask);
    }
    get open() {
      return !this.mask.classList.contains("hidden");
    }
    _build() {
      this.tabsEl = h("div.tabs");
      for (const tab of TABS) {
        this.tabsEl.append(h("button", {
          "aria-selected": String(tab.key === this.tab),
          text: tab.label,
          onclick: () => this.show(tab.key)
        }));
      }
      this.textarea = h("textarea", { spellcheck: "false" });
      this.noteEl = h("span.note");
      this.importModeSelect = h("select", {
        style: { padding: "5px 8px", borderRadius: "6px", border: "1px solid var(--anno-border)" }
      }, [
        h("option", { value: "replace", text: "替换当前全部标注" }),
        h("option", { value: "merge", text: "合并到当前标注" })
      ]);
      this.importBtn = h("button.btn.primary.hidden", {
        onclick: () => {
          var _a, _b;
          (_b = (_a = this.handlers).onImport) == null ? void 0 : _b.call(_a, this.textarea.value, this.importModeSelect.value);
        }
      }, [icon(ICONS.upload), "执行导入"]);
      this.fileBtn = h("button.btn.hidden", { onclick: () => this._pickFile() }, [icon(ICONS.upload), "选择 JSON 文件"]);
      this.copyBtn = h("button.btn", { onclick: () => this._copy() }, [icon(ICONS.copy), "复制"]);
      this.downloadBtn = h("button.btn", { onclick: () => this._download() }, [icon(ICONS.download), "下载"]);
      this.titleEl = h("strong", { text: "导出标注配置" });
      const modal = h("div.modal", {}, [
        h("header", {}, [
          this.titleEl,
          h("button.btn.ghost", { onclick: () => this.close() }, [icon(ICONS.close)])
        ]),
        this.tabsEl,
        h("div.body", {}, [this.textarea]),
        h("footer", {}, [
          this.importModeSelect,
          this.fileBtn,
          this.noteEl,
          h("div.spacer"),
          this.copyBtn,
          this.downloadBtn,
          this.importBtn,
          h("button.btn", { onclick: () => this.close() }, ["关闭"])
        ])
      ]);
      this.mask.append(modal);
      this.mask.addEventListener("keydown", (event) => {
        if (event.key === "Escape") this.close();
        event.stopPropagation();
      });
    }
    /* ---------------------------------------------------------------- */
    show(tab = "config") {
      var _a, _b;
      this.tab = tab;
      this.mask.classList.remove("hidden");
      for (let i = 0; i < TABS.length; i += 1) {
        this.tabsEl.children[i].setAttribute("aria-selected", String(TABS[i].key === tab));
      }
      const isImport = tab === "import";
      this.importBtn.classList.toggle("hidden", !isImport);
      this.fileBtn.classList.toggle("hidden", !isImport);
      this.importModeSelect.classList.toggle("hidden", !isImport);
      this.copyBtn.classList.toggle("hidden", isImport);
      this.downloadBtn.classList.toggle("hidden", isImport);
      this.titleEl.textContent = isImport ? "导入标注配置" : "导出标注配置";
      this.textarea.readOnly = false;
      this.textarea.placeholder = isImport ? "粘贴 AI 生成或同事导出的标注 JSON，然后点「执行导入」" : "";
      this.textarea.value = isImport ? "" : ((_b = (_a = this.handlers).getContent) == null ? void 0 : _b.call(_a, tab)) || "";
      this.noteEl.textContent = {
        config: "这份 JSON 就是 AI design 要消费的配置数据",
        context: "页面语义骨架，元素通过 ref 引用",
        prompt: "整段复制到 AI 对话框，把返回的 JSON 粘回「导入」页",
        import: ""
      }[tab] || "";
      requestAnimationFrame(() => this.textarea.focus());
    }
    close() {
      this.mask.classList.add("hidden");
    }
    /* ---------------------------------------------------------------- */
    async _copy() {
      var _a, _b, _c, _d, _e;
      const text = this.textarea.value;
      try {
        await navigator.clipboard.writeText(text);
        (_b = (_a = this.handlers).toast) == null ? void 0 : _b.call(_a, "已复制到剪贴板");
      } catch {
        this.textarea.select();
        const ok = (_c = document.execCommand) == null ? void 0 : _c.call(document, "copy");
        (_e = (_d = this.handlers).toast) == null ? void 0 : _e.call(
          _d,
          ok ? "已复制到剪贴板" : "当前环境禁止自动复制，请手动 Ctrl+C",
          ok ? "info" : "warn"
        );
      }
    }
    _download() {
      var _a, _b;
      const isJson = this.tab !== "prompt";
      const name = {
        config: "ui-annotations.config.json",
        context: "ui-annotations.context.json",
        prompt: "ui-annotations.prompt.md"
      }[this.tab] || "ui-annotations.txt";
      const blob = new Blob([this.textarea.value], {
        type: isJson ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8"
      });
      const url = URL.createObjectURL(blob);
      const link = h("a", { href: url, download: name });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 4e3);
      (_b = (_a = this.handlers).toast) == null ? void 0 : _b.call(_a, `已下载 ${name}`);
    }
    /** file:// 下无法 fetch 本地文件，用 file input 读取是唯一可靠方式 */
    _pickFile() {
      const input = h("input", { type: "file", accept: ".json,application/json" });
      input.addEventListener("change", () => {
        var _a;
        const file = (_a = input.files) == null ? void 0 : _a[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          var _a2, _b;
          this.textarea.value = String(reader.result || "");
          (_b = (_a2 = this.handlers).toast) == null ? void 0 : _b.call(_a2, `已读取 ${file.name}，确认后点「执行导入」`);
        };
        reader.onerror = () => {
          var _a2, _b;
          return (_b = (_a2 = this.handlers).toast) == null ? void 0 : _b.call(_a2, "读取文件失败", "error");
        };
        reader.readAsText(file, "utf-8");
      });
      input.click();
    }
  };

  // src/ui/markers.js
  var MarkerLayer = class {
    /**
     * @param {object} handlers
     * @param {(id: string) => void} handlers.onSelect
     * @param {(id: string) => void} handlers.onEdit
     * @param {(id: string, status: string, resolved: object) => void} handlers.onResolved
     */
    constructor(handlers = {}) {
      this.handlers = handlers;
      this.layer = h("div.layer");
      this.tooltip = h("div.tooltip.hidden");
      this.focusRing = h("div.focus-ring.hidden");
      this.layer.append(this.focusRing, this.tooltip);
      this.entries = /* @__PURE__ */ new Map();
      this.selectedId = null;
      this.visible = true;
      this.readOnly = false;
      this._reflow = throttleRaf(() => this._position());
      this._tooltipFor = null;
      this._tooltipTimer = null;
    }
    mount(container) {
      container.append(this.layer);
      window.addEventListener("scroll", this._reflow, true);
      window.addEventListener("resize", this._reflow);
      if (typeof ResizeObserver !== "undefined") {
        this._resizeObserver = new ResizeObserver(this._reflow);
        this._resizeObserver.observe(document.documentElement);
      }
      if (typeof MutationObserver !== "undefined") {
        this._mutationObserver = new MutationObserver((records) => {
          const relevant = records.some((r) => !(r.target instanceof Element) || !r.target.closest("ui-annotator-root"));
          if (relevant) this._scheduleRerender();
        });
        this._mutationObserver.observe(document.body, { childList: true, subtree: true });
      }
    }
    destroy() {
      var _a, _b;
      window.removeEventListener("scroll", this._reflow, true);
      window.removeEventListener("resize", this._reflow);
      (_a = this._resizeObserver) == null ? void 0 : _a.disconnect();
      (_b = this._mutationObserver) == null ? void 0 : _b.disconnect();
      clearTimeout(this._rerenderTimer);
      this.layer.remove();
    }
    /* ---------------------------------------------------------------- */
    /** DOM 大改后重新解析定位，节流到 300ms 以免频繁全量重算 */
    _scheduleRerender() {
      clearTimeout(this._rerenderTimer);
      this._rerenderTimer = setTimeout(() => {
        if (this._annotations) this.render(this._annotations);
      }, 300);
    }
    /** 渲染一批标注（当前页面的全部标注） */
    render(annotations) {
      var _a, _b;
      this._annotations = annotations;
      const alive = /* @__PURE__ */ new Set();
      for (const annotation of annotations) {
        alive.add(annotation.id);
        let entry = this.entries.get(annotation.id);
        if (!entry) {
          entry = { annotation, element: null, marker: null, region: null };
          this.entries.set(annotation.id, entry);
        }
        entry.annotation = annotation;
        this._resolve(entry);
        this._ensureNodes(entry);
      }
      for (const [id, entry] of this.entries) {
        if (alive.has(id)) continue;
        (_a = entry.marker) == null ? void 0 : _a.remove();
        (_b = entry.region) == null ? void 0 : _b.remove();
        this.entries.delete(id);
      }
      this._position();
    }
    /** 用定位引擎找回元素，并把状态与置信度回写给上层 */
    _resolve(entry) {
      var _a, _b;
      const annotation = entry.annotation;
      if (annotation.type === "region") {
        entry.element = null;
        return;
      }
      const result = resolveTarget(annotation.target);
      entry.element = result.element;
      entry.confidence = result.confidence;
      entry.votes = result.votes;
      if (result.status === "drifted" && result.element) {
        healTarget(annotation.target, result.element);
      }
      (_b = (_a = this.handlers).onResolved) == null ? void 0 : _b.call(_a, annotation.id, result.status, {
        kind: result.kind,
        confidence: result.confidence
      });
    }
    _ensureNodes(entry) {
      const { annotation } = entry;
      const color = categoryOf(annotation.category).color;
      if (!entry.marker) {
        entry.marker = h("div.marker", {
          onclick: (event) => {
            var _a, _b;
            event.stopPropagation();
            (_b = (_a = this.handlers).onSelect) == null ? void 0 : _b.call(_a, annotation.id);
          },
          ondblclick: (event) => {
            var _a, _b;
            event.stopPropagation();
            if (!this.readOnly) (_b = (_a = this.handlers).onEdit) == null ? void 0 : _b.call(_a, annotation.id);
          },
          onpointerenter: () => this._showTooltip(entry),
          onpointerleave: () => this._hideTooltipSoon()
        });
        this.layer.append(entry.marker);
      }
      entry.marker.textContent = String(annotation.seq);
      entry.marker.style.background = color;
      entry.marker.title = `#${annotation.seq} ${annotation.title || "(未命名)"}`;
      entry.marker.className = "marker" + (annotation.status === "drifted" ? " drifted" : "") + (annotation.status === "orphaned" ? " orphaned" : "") + (this.selectedId === annotation.id ? " selected" : "");
      if (annotation.type === "region") {
        if (!entry.region) {
          entry.region = h("div.region");
          this.layer.append(entry.region);
        }
        entry.region.style.borderColor = color;
      } else if (entry.region) {
        entry.region.remove();
        entry.region = null;
      }
    }
    /** 重新计算所有标记的位置。视口坐标制，因为 layer 是 position:fixed。 */
    _position() {
      if (!this.visible) return;
      for (const entry of this.entries.values()) {
        const { annotation, marker, region } = entry;
        let rect = null;
        if (annotation.type === "region" && annotation.target.rect) {
          const r = annotation.target.rect;
          rect = {
            left: r.x - (r.relativeTo === "document" ? window.scrollX : 0),
            top: r.y - (r.relativeTo === "document" ? window.scrollY : 0),
            width: r.width,
            height: r.height
          };
        } else if (entry.element && entry.element.isConnected) {
          const r = entry.element.getBoundingClientRect();
          rect = { left: r.left, top: r.top, width: r.width, height: r.height };
        }
        if (!rect) {
          marker.classList.add("hidden");
          region == null ? void 0 : region.classList.add("hidden");
          continue;
        }
        const offscreen = rect.top > window.innerHeight + 40 || rect.bottom < -40 || rect.left > window.innerWidth + 40 || rect.left + rect.width < -40;
        marker.classList.toggle("hidden", offscreen);
        region == null ? void 0 : region.classList.toggle("hidden", offscreen);
        if (offscreen) continue;
        marker.style.left = `${rect.left + rect.width}px`;
        marker.style.top = `${rect.top}px`;
        if (region) {
          Object.assign(region.style, {
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`
          });
        }
      }
      if (this.selectedId) {
        const entry = this.entries.get(this.selectedId);
        const el = entry == null ? void 0 : entry.element;
        if (el == null ? void 0 : el.isConnected) {
          const r = el.getBoundingClientRect();
          Object.assign(this.focusRing.style, {
            left: `${r.left - 2}px`,
            top: `${r.top - 2}px`,
            width: `${r.width + 4}px`,
            height: `${r.height + 4}px`
          });
          this.focusRing.classList.remove("hidden");
        } else {
          this.focusRing.classList.add("hidden");
        }
      }
      if (this._tooltipFor) this._placeTooltip(this._tooltipFor);
    }
    /* ---------------------------------------------------------------- */
    setVisible(visible) {
      this.visible = visible;
      this.layer.classList.toggle("hidden", !visible);
      if (visible) this._position();
    }
    select(id, { scroll = false } = {}) {
      var _a, _b;
      this.selectedId = id;
      for (const entry2 of this.entries.values()) {
        (_a = entry2.marker) == null ? void 0 : _a.classList.toggle("selected", entry2.annotation.id === id);
      }
      const entry = this.entries.get(id);
      if (scroll && ((_b = entry == null ? void 0 : entry.element) == null ? void 0 : _b.isConnected)) {
        entry.element.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => {
          this._position();
          this.focusRing.classList.remove("hidden");
          this.focusRing.style.animation = "none";
          void this.focusRing.offsetWidth;
          this.focusRing.style.animation = "";
        }, 320);
      }
      if (!id) this.focusRing.classList.add("hidden");
      this._position();
    }
    /** 供外部（侧栏 hover）复用的高亮 */
    flash(id) {
      this.select(id, { scroll: true });
    }
    /* ---------------------------------------------------------------- */
    /* 气泡                                                             */
    /* ---------------------------------------------------------------- */
    _showTooltip(entry) {
      clearTimeout(this._tooltipTimer);
      this._tooltipFor = entry;
      const { annotation } = entry;
      const cat = categoryOf(annotation.category);
      this.tooltip.innerHTML = "";
      this.tooltip.style.borderLeftColor = cat.color;
      this.tooltip.append(
        h("div", { style: { display: "flex", gap: "6px", alignItems: "center", marginBottom: "4px" } }, [
          h("span.chip", { text: cat.label, style: { background: cat.color } }),
          annotation.status !== "active" ? h("span", {
            text: annotation.status === "drifted" ? "定位已漂移" : "定位丢失",
            style: { fontSize: "10px", color: annotation.status === "drifted" ? "#b45309" : "#dc2626" }
          }) : ""
        ]),
        h("h4", { text: annotation.title || "(未命名标注)" }),
        annotation.body ? h("p", { text: annotation.body }) : "",
        this._logicList(annotation.businessLogic),
        this._fieldList(annotation.dataBinding),
        this.readOnly ? "" : h("div", {
          style: { marginTop: "6px", fontSize: "10px", color: "#94a3b8" },
          text: "双击别针可编辑"
        })
      );
      this.tooltip.classList.remove("hidden");
      this._placeTooltip(entry);
    }
    /** 结构化业务逻辑渲染成定义列表 */
    _logicList(logic) {
      if (!logic) return "";
      const rows = [
        ["触发", logic.trigger],
        ["前置", logic.preconditions],
        ["行为", logic.effect],
        ["结果", logic.postconditions],
        ["规则", logic.rules],
        ["异常", logic.errorStates]
      ].filter(([, value]) => Array.isArray(value) ? value.length : Boolean(value));
      if (!rows.length) return "";
      const dl = h("dl");
      for (const [label, value] of rows) {
        dl.append(h("dt", { text: label }));
        dl.append(
          Array.isArray(value) ? h("dd", {}, [h("ul", {}, value.map((v) => h("li", { text: v })))]) : h("dd", { text: value })
        );
      }
      return dl;
    }
    _fieldList(binding) {
      var _a, _b;
      if (!binding) return "";
      const parts = [];
      if ((_a = binding.fields) == null ? void 0 : _a.length) {
        parts.push(h("dt", { text: "字段" }));
        parts.push(h("dd", {}, [h("ul", {}, binding.fields.map((f) => h("li", {
          text: `${f.label || f.name}${f.type ? `: ${f.type}` : ""}${f.required ? " *必填" : ""}${f.validation ? ` (${f.validation})` : ""}`
        })))]));
      }
      if ((_b = binding.apis) == null ? void 0 : _b.length) {
        parts.push(h("dt", { text: "接口" }));
        parts.push(h("dd", {}, [h("ul", {}, binding.apis.map((a) => h("li", {
          text: `${a.method} ${a.path}${a.purpose ? ` — ${a.purpose}` : ""}`
        })))]));
      }
      return parts.length ? h("dl", {}, parts) : "";
    }
    _placeTooltip(entry) {
      const anchor = entry.marker;
      if (!anchor || anchor.classList.contains("hidden")) {
        this.tooltip.classList.add("hidden");
        return;
      }
      const markerRect = anchor.getBoundingClientRect();
      const width = this.tooltip.offsetWidth || 320;
      const height = this.tooltip.offsetHeight || 120;
      let left = markerRect.right + 8;
      if (left + width > window.innerWidth - 8) left = Math.max(8, markerRect.left - width - 8);
      let top = markerRect.top;
      if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8);
      this.tooltip.style.left = `${left}px`;
      this.tooltip.style.top = `${top}px`;
    }
    _hideTooltipSoon() {
      clearTimeout(this._tooltipTimer);
      this._tooltipTimer = setTimeout(() => {
        this.tooltip.classList.add("hidden");
        this._tooltipFor = null;
      }, 260);
    }
    keepTooltip() {
      clearTimeout(this._tooltipTimer);
    }
  };

  // src/ui/picker.js
  var Picker = class {
    /**
     * @param {ShadowRoot} root
     * @param {object} handlers
     * @param {(el: Element) => void} handlers.onPickElement
     * @param {(rect: object) => void} handlers.onPickRegion
     * @param {() => void} handlers.onCancel
     */
    constructor(root, handlers) {
      this.root = root;
      this.handlers = handlers;
      this.mode = null;
      this.layer = h("div.layer");
      this.highlight = h("div.highlight.hidden");
      this.hint = h("div.hint.hidden");
      this.rubber = h("div.rubber.hidden");
      this.layer.append(this.highlight, this.hint, this.rubber);
      this.blocker = h("div.pick-blocker.hidden");
      this._hovered = null;
      this._dragStart = null;
      this._onMove = throttleRaf((event) => this._handleMove(event));
      this._onDown = (event) => this._handleDown(event);
      this._onUp = (event) => this._handleUp(event);
      this._onKey = (event) => {
        var _a, _b;
        if (event.key === "Escape") {
          event.preventDefault();
          this.stop();
          (_b = (_a = this.handlers).onCancel) == null ? void 0 : _b.call(_a);
        }
      };
      this._onScroll = throttleRaf(() => {
        if (this.mode === "element" && this._hovered) this._drawHighlight(this._hovered);
      });
    }
    mount(container) {
      container.append(this.blocker, this.layer);
    }
    get active() {
      return this.mode !== null;
    }
    start(mode) {
      if (this.mode === mode) return;
      this.mode = mode;
      this.blocker.classList.remove("hidden");
      this.blocker.style.cursor = mode === "region" ? "crosshair" : "copy";
      this.blocker.addEventListener("pointermove", this._onMove);
      this.blocker.addEventListener("pointerdown", this._onDown);
      this.blocker.addEventListener("pointerup", this._onUp);
      window.addEventListener("keydown", this._onKey, true);
      window.addEventListener("scroll", this._onScroll, true);
      window.addEventListener("resize", this._onScroll);
    }
    stop() {
      if (!this.mode) return;
      this.mode = null;
      this._hovered = null;
      this._dragStart = null;
      this.blocker.classList.add("hidden");
      this.highlight.classList.add("hidden");
      this.hint.classList.add("hidden");
      this.rubber.classList.add("hidden");
      this.blocker.removeEventListener("pointermove", this._onMove);
      this.blocker.removeEventListener("pointerdown", this._onDown);
      this.blocker.removeEventListener("pointerup", this._onUp);
      window.removeEventListener("keydown", this._onKey, true);
      window.removeEventListener("scroll", this._onScroll, true);
      window.removeEventListener("resize", this._onScroll);
    }
    /* ---------------------------------------------------------------- */
    /** 穿过 blocker 找到它底下宿主页面的真实元素 */
    _elementUnder(x, y) {
      this.blocker.style.pointerEvents = "none";
      const el = document.elementFromPoint(x, y);
      this.blocker.style.pointerEvents = "auto";
      if (!el || el === document.body || el === document.documentElement) return null;
      if (el.closest("ui-annotator-root")) return null;
      return el;
    }
    _handleMove(event) {
      if (!this.mode) return;
      if (this.mode === "region") {
        if (this._dragStart) this._drawRubber(event.clientX, event.clientY);
        else this._showHint(event.clientX, event.clientY, "拖动鼠标框选一个区域");
        return;
      }
      const el = this._elementUnder(event.clientX, event.clientY);
      if (!el || el === this._hovered) return;
      this._hovered = el;
      this._drawHighlight(el);
      this._showElementHint(el);
    }
    _handleDown(event) {
      if (this.mode !== "region") return;
      event.preventDefault();
      this._dragStart = { x: event.clientX, y: event.clientY };
      this.hint.classList.add("hidden");
    }
    _handleUp(event) {
      var _a, _b, _c, _d, _e, _f;
      if (!this.mode) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.mode === "element") {
        const el = this._elementUnder(event.clientX, event.clientY);
        if (el) {
          this.stop();
          (_b = (_a = this.handlers).onPickElement) == null ? void 0 : _b.call(_a, el);
        }
        return;
      }
      const start = this._dragStart;
      this._dragStart = null;
      if (!start) return;
      const x = Math.min(start.x, event.clientX);
      const y = Math.min(start.y, event.clientY);
      const width = Math.abs(event.clientX - start.x);
      const height = Math.abs(event.clientY - start.y);
      this.stop();
      if (width < 8 || height < 8) {
        (_d = (_c = this.handlers).onCancel) == null ? void 0 : _d.call(_c);
        return;
      }
      (_f = (_e = this.handlers).onPickRegion) == null ? void 0 : _f.call(_e, {
        x: x + window.scrollX,
        y: y + window.scrollY,
        width,
        height,
        relativeTo: "document"
      });
    }
    /* ---------------------------------------------------------------- */
    _drawHighlight(el) {
      const rect = el.getBoundingClientRect();
      Object.assign(this.highlight.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`
      });
      this.highlight.classList.remove("hidden");
    }
    _drawRubber(x, y) {
      const start = this._dragStart;
      Object.assign(this.rubber.style, {
        left: `${Math.min(start.x, x)}px`,
        top: `${Math.min(start.y, y)}px`,
        width: `${Math.abs(x - start.x)}px`,
        height: `${Math.abs(y - start.y)}px`
      });
      this.rubber.classList.remove("hidden");
    }
    /** 悬浮提示：标签 + 组件名 + 尺寸，帮标注者确认选中的是不是想要的层级 */
    _showElementHint(el) {
      const rect = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();
      const component = componentLabel(el);
      const text = normalizeText(el.textContent, 28);
      this.hint.innerHTML = "";
      this.hint.append(
        h("span", { html: `<b>${tag}</b>` }),
        component ? h("span", { text: `  ${component}` }) : "",
        text ? h("span", { class: "dim", text: `  “${text}”` }) : "",
        h("span", { class: "dim", text: `  ${Math.round(rect.width)}×${Math.round(rect.height)}` })
      );
      this._positionHint(rect.left, rect.top - 24 < 4 ? rect.bottom + 6 : rect.top - 24);
    }
    _showHint(x, y, message) {
      this.hint.textContent = message;
      this._positionHint(x + 12, y + 16);
    }
    _positionHint(left, top) {
      this.hint.classList.remove("hidden");
      const width = this.hint.offsetWidth || 200;
      Object.assign(this.hint.style, {
        left: `${clamp(left, 4, window.innerWidth - width - 4)}px`,
        top: `${clamp(top, 4, window.innerHeight - 28)}px`
      });
    }
  };

  // src/ui/sidebar.js
  var Sidebar = class {
    /**
     * @param {object} handlers
     * @param {(id: string) => void} handlers.onFocus     点击条目 -> 滚动定位
     * @param {(id: string) => void} handlers.onEdit
     * @param {(id: string) => void} handlers.onDelete
     * @param {(id: string) => void} handlers.onRetarget  为丢失的标注重新指定元素
     * @param {() => void} handlers.onExport
     * @param {() => void} handlers.onImport
     */
    constructor(handlers = {}) {
      this.handlers = handlers;
      this.annotations = [];
      this.selectedId = null;
      this.filter = { text: "", category: "", status: "" };
      this.el = h("div.sidebar");
      this._build();
    }
    mount(container) {
      container.append(this.el);
    }
    get open() {
      return this.el.classList.contains("open");
    }
    toggle(force) {
      const next = force == null ? !this.open : force;
      this.el.classList.toggle("open", next);
      return next;
    }
    /* ---------------------------------------------------------------- */
    _build() {
      this.countEl = h("span", { style: { fontSize: "11px", color: "var(--anno-muted)" } });
      const header = h("header", {}, [
        h("strong", { text: "标注清单" }),
        this.countEl,
        h("button.btn.ghost", { title: "收起", onclick: () => this.toggle(false) }, [icon(ICONS.close)])
      ]);
      this.searchInput = h("input", {
        type: "search",
        placeholder: "搜索标题 / 说明 / 标签",
        oninput: (event) => {
          this.filter.text = event.target.value.trim().toLowerCase();
          this._renderList();
        }
      });
      const categorySelect = h("select", {
        onchange: (event) => {
          this.filter.category = event.target.value;
          this._renderList();
        }
      }, [
        h("option", { value: "", text: "全部分类" }),
        ...CATEGORIES.map((c) => h("option", { value: c.key, text: c.label }))
      ]);
      const statusSelect = h("select", {
        onchange: (event) => {
          this.filter.status = event.target.value;
          this._renderList();
        }
      }, [
        h("option", { value: "", text: "全部状态" }),
        h("option", { value: "drifted", text: "已漂移" }),
        h("option", { value: "orphaned", text: "已丢失" }),
        h("option", { value: "ai", text: "AI 待复核" })
      ]);
      const filters = h("div.filters", {}, [this.searchInput, categorySelect, statusSelect]);
      this.list = h("div.list");
      const footer = h("footer", {}, [
        h("button.btn", { onclick: () => {
          var _a, _b;
          return (_b = (_a = this.handlers).onExport) == null ? void 0 : _b.call(_a);
        } }, [icon(ICONS.download), "导出配置"]),
        h("button.btn", { onclick: () => {
          var _a, _b;
          return (_b = (_a = this.handlers).onImport) == null ? void 0 : _b.call(_a);
        } }, [icon(ICONS.upload), "导入"])
      ]);
      this.el.append(header, filters, this.list, footer);
    }
    /* ---------------------------------------------------------------- */
    render(annotations) {
      this.annotations = annotations;
      this._renderList();
    }
    select(id) {
      this.selectedId = id;
      for (const node of this.list.querySelectorAll(".item")) {
        node.classList.toggle("selected", node.dataset.id === id);
      }
      const active = this.list.querySelector(".item.selected");
      active == null ? void 0 : active.scrollIntoView({ block: "nearest" });
    }
    _visible() {
      return this.annotations.filter((a) => {
        var _a, _b, _c, _d;
        const { text, category, status } = this.filter;
        if (category && a.category !== category) return false;
        if (status === "ai") {
          if (((_a = a.meta) == null ? void 0 : _a.source) !== "ai" || ((_b = a.meta) == null ? void 0 : _b.reviewed)) return false;
        } else if (status && a.status !== status) return false;
        if (text) {
          const haystack = [a.title, a.body, (_c = a.tags) == null ? void 0 : _c.join(" "), (_d = a.businessLogic) == null ? void 0 : _d.effect].filter(Boolean).join(" ").toLowerCase();
          if (!haystack.includes(text)) return false;
        }
        return true;
      });
    }
    _renderList() {
      const visible = this._visible();
      const drifted = this.annotations.filter((a) => a.status === "drifted").length;
      const orphaned = this.annotations.filter((a) => a.status === "orphaned").length;
      this.countEl.textContent = `${visible.length}/${this.annotations.length}` + (drifted ? ` · 漂移 ${drifted}` : "") + (orphaned ? ` · 丢失 ${orphaned}` : "");
      this.list.innerHTML = "";
      if (!visible.length) {
        this.list.append(h("div.empty", {
          text: this.annotations.length ? "没有符合筛选条件的标注" : "当前页面还没有标注。点击工具栏的「选元素」开始。"
        }));
        return;
      }
      for (const annotation of visible) {
        this.list.append(this._item(annotation));
      }
    }
    _item(annotation) {
      var _a, _b, _c, _d, _e;
      const cat = categoryOf(annotation.category);
      const actions = h("div.actions", {}, [
        h("button", {
          title: "编辑",
          onclick: (event) => {
            var _a2, _b2;
            event.stopPropagation();
            (_b2 = (_a2 = this.handlers).onEdit) == null ? void 0 : _b2.call(_a2, annotation.id);
          }
        }, ["编辑"]),
        // 丢失的标注无法点别针，只能从这里重新挂载
        annotation.status === "orphaned" ? h("button", {
          title: "重新指定元素",
          onclick: (event) => {
            var _a2, _b2;
            event.stopPropagation();
            (_b2 = (_a2 = this.handlers).onRetarget) == null ? void 0 : _b2.call(_a2, annotation.id);
          }
        }, ["重定位"]) : "",
        h("button", {
          title: "删除",
          onclick: (event) => {
            var _a2, _b2;
            event.stopPropagation();
            (_b2 = (_a2 = this.handlers).onDelete) == null ? void 0 : _b2.call(_a2, annotation.id);
          }
        }, ["删除"])
      ]);
      const meta = h("div.meta", {}, [
        h("span.chip", { text: cat.label, style: { background: cat.color } }),
        annotation.type === "region" ? h("span", { text: "区域" }) : "",
        annotation.status === "drifted" ? h("span.warn", { text: `漂移 ${fmtConfidence((_a = annotation.target) == null ? void 0 : _a.resolved)}` }) : "",
        annotation.status === "orphaned" ? h("span.lost", { text: "定位丢失" }) : "",
        ((_b = annotation.meta) == null ? void 0 : _b.source) === "ai" && !((_c = annotation.meta) == null ? void 0 : _c.reviewed) ? h("span.warn", { text: "AI 待复核" }) : "",
        actions
      ]);
      const summary = annotation.body || ((_d = annotation.businessLogic) == null ? void 0 : _d.effect) || ((_e = annotation.businessLogic) == null ? void 0 : _e.trigger) || "";
      return h("div.item", {
        dataset: { id: annotation.id },
        class: this.selectedId === annotation.id ? "selected" : "",
        style: { borderLeftColor: cat.color },
        onclick: () => {
          var _a2, _b2;
          return (_b2 = (_a2 = this.handlers).onFocus) == null ? void 0 : _b2.call(_a2, annotation.id);
        },
        ondblclick: () => {
          var _a2, _b2;
          return (_b2 = (_a2 = this.handlers).onEdit) == null ? void 0 : _b2.call(_a2, annotation.id);
        }
      }, [
        h("div.top", {}, [
          h("span.seq", { text: `#${annotation.seq}` }),
          h("span.title", { text: annotation.title || "(未命名)" })
        ]),
        summary ? h("p.desc", { text: normalizeText(summary, 140) }) : "",
        meta
      ]);
    }
  };
  function fmtConfidence(resolved) {
    if (!resolved || resolved.confidence == null) return "";
    return `${Math.round(resolved.confidence * 100)}%`;
  }

  // src/ui/styles.js
  var OVERLAY_CSS = (
    /* css */
    `
:host {
  /* all: initial 会连自定义属性一起清掉，这里只重置继承类属性 */
  font: 400 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  color: #0f172a;
  --anno-bg: #ffffff;
  --anno-fg: #0f172a;
  --anno-muted: #64748b;
  --anno-border: #e2e8f0;
  --anno-accent: #4f46e5;
  --anno-shadow: 0 8px 28px rgba(15, 23, 42, .16);
  --anno-radius: 10px;
  --anno-z: 2147483000;
}

* { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; }

/* ---------------- 通用 ---------------- */

.layer {
  position: fixed;
  inset: 0;
  z-index: var(--anno-z);
  pointer-events: none;
}

.hidden { display: none !important; }

.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--anno-border);
  background: var(--anno-bg);
  border-radius: 7px;
  padding: 5px 9px;
  line-height: 1.2;
  transition: background .12s, border-color .12s;
}
.btn:hover { background: #f1f5f9; }
.btn.active { background: var(--anno-accent); border-color: var(--anno-accent); color: #fff; }
.btn.primary { background: var(--anno-accent); border-color: var(--anno-accent); color: #fff; }
.btn.primary:hover { filter: brightness(1.08); }
.btn.ghost { border-color: transparent; background: transparent; }
.btn.ghost:hover { background: #f1f5f9; }
.btn.danger { color: #dc2626; border-color: #fecaca; }
.btn.danger:hover { background: #fef2f2; }
.btn:disabled { opacity: .5; cursor: not-allowed; }

.icon { width: 15px; height: 15px; flex: none; }

/* ---------------- 工具栏 ---------------- */

.toolbar {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: calc(var(--anno-z) + 30);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: var(--anno-bg);
  border: 1px solid var(--anno-border);
  border-radius: 12px;
  box-shadow: var(--anno-shadow);
  pointer-events: auto;
  user-select: none;
}
.toolbar .grip {
  cursor: grab;
  padding: 0 4px;
  color: #cbd5e1;
  letter-spacing: -1px;
}
.toolbar .sep { width: 1px; height: 20px; background: var(--anno-border); margin: 0 2px; }
.toolbar .count {
  min-width: 20px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--anno-muted);
  font-size: 12px;
  padding: 0 4px;
}
.toolbar.collapsed .collapsible { display: none; }

/* ---------------- 拾取高亮 ---------------- */

.highlight {
  position: absolute;
  border: 2px solid var(--anno-accent);
  background: rgba(79, 70, 229, .10);
  border-radius: 3px;
  pointer-events: none;
  transition: all .06s linear;
}

.hint {
  position: absolute;
  max-width: 340px;
  padding: 4px 8px;
  background: #0f172a;
  color: #fff;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.45;
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hint b { color: #a5b4fc; font-weight: 600; }
.hint .dim { color: #94a3b8; }

/* 框选矩形 */
.rubber {
  position: absolute;
  border: 2px dashed var(--anno-accent);
  background: rgba(79, 70, 229, .08);
  pointer-events: none;
}

/* 拾取模式下给宿主页面加一层十字光标提示 */
.pick-blocker {
  position: fixed;
  inset: 0;
  z-index: calc(var(--anno-z) + 5);
  cursor: crosshair;
  pointer-events: auto;
  background: transparent;
}

/* ---------------- 标记（数字别针） ---------------- */

.marker {
  position: absolute;
  width: 22px;
  height: 22px;
  margin: -11px 0 0 -11px;
  border-radius: 50% 50% 50% 2px;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(15, 23, 42, .28);
  pointer-events: auto;
  cursor: pointer;
  border: 2px solid #fff;
  transition: transform .12s;
}
.marker:hover { transform: scale(1.18); z-index: 2; }
.marker.drifted { border-color: #fbbf24; border-style: dashed; }
.marker.orphaned { opacity: .45; }
.marker.selected { transform: scale(1.25); box-shadow: 0 0 0 4px rgba(79, 70, 229, .3); }

/* 区域型标注的边框 */
.region {
  position: absolute;
  border: 2px dashed;
  border-radius: 4px;
  pointer-events: none;
  opacity: .75;
}

/* 被选中元素的呼吸描边 */
.focus-ring {
  position: absolute;
  border: 2px solid var(--anno-accent);
  border-radius: 3px;
  pointer-events: none;
  animation: anno-pulse 1.4s ease-out 2;
}
@keyframes anno-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(79, 70, 229, .45); }
  100% { box-shadow: 0 0 0 12px rgba(79, 70, 229, 0); }
}

/* ---------------- 气泡（查看态） ---------------- */

.tooltip {
  position: absolute;
  max-width: 340px;
  padding: 10px 12px;
  background: var(--anno-bg);
  border: 1px solid var(--anno-border);
  border-left: 3px solid var(--anno-accent);
  border-radius: 8px;
  box-shadow: var(--anno-shadow);
  pointer-events: auto;
  font-size: 12px;
}
.tooltip h4 { margin: 0 0 4px; font-size: 13px; }
.tooltip p { margin: 0 0 6px; color: #334155; white-space: pre-wrap; }
.tooltip dl { margin: 6px 0 0; display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; }
.tooltip dt { color: var(--anno-muted); font-size: 11px; }
.tooltip dd { margin: 0; font-size: 11px; }
.tooltip ul { margin: 2px 0; padding-left: 16px; }

.chip {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  vertical-align: 1px;
}

/* ---------------- 编辑面板 ---------------- */

.panel {
  position: fixed;
  z-index: calc(var(--anno-z) + 40);
  width: 380px;
  max-height: min(78vh, 680px);
  display: flex;
  flex-direction: column;
  background: var(--anno-bg);
  border: 1px solid var(--anno-border);
  border-radius: var(--anno-radius);
  box-shadow: var(--anno-shadow);
  pointer-events: auto;
  overflow: hidden;
}
.panel header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--anno-border);
  background: #f8fafc;
  cursor: grab;
}
.panel header strong { flex: 1; font-size: 13px; }
.panel .body { padding: 12px; overflow-y: auto; flex: 1; }
.panel footer {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--anno-border);
  background: #f8fafc;
}
.panel footer .spacer { flex: 1; }

.field { margin-bottom: 10px; }
.field > label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--anno-muted);
  margin-bottom: 3px;
}
.field input[type=text], .field textarea, .field select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--anno-border);
  border-radius: 6px;
  font: inherit;
  background: #fff;
  color: var(--anno-fg);
}
.field textarea { resize: vertical; min-height: 62px; }
.field input:focus, .field textarea:focus, .field select:focus {
  outline: 2px solid rgba(79, 70, 229, .35);
  outline-offset: -1px;
  border-color: var(--anno-accent);
}
.field .help { font-size: 10px; color: var(--anno-muted); margin-top: 3px; }

.cats { display: flex; flex-wrap: wrap; gap: 4px; }
.cats button {
  border: 1px solid var(--anno-border);
  background: #fff;
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 11px;
}
.cats button[aria-pressed=true] { color: #fff; border-color: transparent; }

.target-info {
  padding: 7px 9px;
  background: #f8fafc;
  border: 1px solid var(--anno-border);
  border-radius: 6px;
  font-size: 11px;
  color: #475569;
  margin-bottom: 10px;
  word-break: break-all;
}
.target-info code { font-family: ui-monospace, Menlo, Consolas, monospace; color: #0f172a; }
.target-info .row { display: flex; gap: 6px; margin-top: 3px; }
.target-info .row span:first-child { color: var(--anno-muted); flex: none; min-width: 46px; }

details.group { border-top: 1px solid var(--anno-border); padding-top: 8px; margin-top: 4px; }
details.group > summary {
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  color: var(--anno-muted);
  margin-bottom: 8px;
  user-select: none;
}
details.group > summary::marker { color: #cbd5e1; }

/* ---------------- 侧栏 ---------------- */

.sidebar {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 340px;
  z-index: calc(var(--anno-z) + 20);
  display: flex;
  flex-direction: column;
  background: var(--anno-bg);
  border-left: 1px solid var(--anno-border);
  box-shadow: -6px 0 24px rgba(15, 23, 42, .1);
  pointer-events: auto;
  transform: translateX(100%);
  transition: transform .18s ease-out;
}
.sidebar.open { transform: none; }
.sidebar header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--anno-border);
}
.sidebar header strong { flex: 1; }
.sidebar .filters { display: flex; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--anno-border); }
.sidebar .filters input, .sidebar .filters select {
  padding: 4px 6px;
  border: 1px solid var(--anno-border);
  border-radius: 6px;
  font: inherit;
  font-size: 12px;
  min-width: 0;
}
.sidebar .filters input { flex: 1; }
.sidebar .list { flex: 1; overflow-y: auto; padding: 8px; }
.sidebar footer { padding: 8px 12px; border-top: 1px solid var(--anno-border); display: flex; gap: 6px; flex-wrap: wrap; }
.sidebar .empty { padding: 28px 16px; text-align: center; color: var(--anno-muted); font-size: 12px; }

.item {
  border: 1px solid var(--anno-border);
  border-left: 3px solid var(--anno-accent);
  border-radius: 7px;
  padding: 8px 9px;
  margin-bottom: 6px;
  cursor: pointer;
  background: #fff;
}
.item:hover { background: #f8fafc; }
.item.selected { outline: 2px solid rgba(79, 70, 229, .4); }
.item .top { display: flex; align-items: baseline; gap: 6px; }
.item .seq { font-size: 10px; font-weight: 700; color: var(--anno-muted); font-variant-numeric: tabular-nums; }
.item .title { flex: 1; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item .desc {
  margin: 3px 0 0;
  font-size: 11px;
  color: #475569;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.item .meta { margin-top: 4px; display: flex; gap: 5px; align-items: center; font-size: 10px; color: var(--anno-muted); }
.item .warn { color: #b45309; }
.item .lost { color: #dc2626; }
.item .actions { display: flex; gap: 2px; margin-left: auto; }
.item .actions button { border: none; background: transparent; padding: 1px 4px; border-radius: 4px; font-size: 10px; color: var(--anno-muted); }
.item .actions button:hover { background: #e2e8f0; color: var(--anno-fg); }

/* ---------------- 导出对话框 ---------------- */

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: calc(var(--anno-z) + 50);
  background: rgba(15, 23, 42, .45);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  padding: 24px;
}
.modal {
  width: min(760px, 100%);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: var(--anno-bg);
  border-radius: 12px;
  box-shadow: var(--anno-shadow);
  overflow: hidden;
}
.modal header { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--anno-border); }
.modal header strong { flex: 1; }
.modal .tabs { display: flex; gap: 2px; padding: 8px 14px 0; }
.modal .tabs button {
  border: 1px solid transparent;
  border-bottom: none;
  background: transparent;
  padding: 5px 11px;
  border-radius: 7px 7px 0 0;
  font-size: 12px;
  color: var(--anno-muted);
}
.modal .tabs button[aria-selected=true] {
  background: #f1f5f9;
  color: var(--anno-fg);
  font-weight: 600;
}
.modal .body { flex: 1; overflow: auto; padding: 12px 14px; }
.modal textarea {
  width: 100%;
  height: 46vh;
  border: 1px solid var(--anno-border);
  border-radius: 8px;
  padding: 10px;
  font: 400 11px/1.6 ui-monospace, Menlo, Consolas, monospace;
  resize: vertical;
  background: #f8fafc;
  color: #0f172a;
  white-space: pre;
}
.modal footer { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--anno-border); background: #f8fafc; }
.modal footer .spacer { flex: 1; }
.modal .note { font-size: 11px; color: var(--anno-muted); align-self: center; }

/* ---------------- 轻提示 ---------------- */

.toasts {
  position: fixed;
  left: 50%;
  bottom: 72px;
  transform: translateX(-50%);
  z-index: calc(var(--anno-z) + 60);
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  pointer-events: none;
}
.toast {
  padding: 7px 14px;
  border-radius: 999px;
  background: #0f172a;
  color: #fff;
  font-size: 12px;
  box-shadow: var(--anno-shadow);
  animation: anno-rise .18s ease-out;
}
.toast.error { background: #dc2626; }
.toast.warn { background: #b45309; }
@keyframes anno-rise {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

/* ---------------- 深色偏好 ---------------- */

@media (prefers-color-scheme: dark) {
  :host {
    --anno-bg: #1e293b;
    --anno-fg: #e2e8f0;
    --anno-muted: #94a3b8;
    --anno-border: #334155;
    color: var(--anno-fg);
  }
  .btn:hover, .btn.ghost:hover { background: #334155; }
  .panel header, .panel footer, .modal footer { background: #0f172a; }
  .field input[type=text], .field textarea, .field select { background: #0f172a; color: var(--anno-fg); }
  .cats button { background: #0f172a; }
  .target-info, .item, .modal textarea { background: #0f172a; color: var(--anno-fg); }
  .item:hover { background: #334155; }
  .modal .tabs button[aria-selected=true] { background: #334155; }
  .tooltip p { color: #cbd5e1; }
  .item .desc { color: #cbd5e1; }
}

/* 打印时隐藏所有标注 UI，避免污染截图/打印稿 */
@media print { :host { display: none !important; } }
`
  );

  // src/ui/overlay.js
  var HOST_TAG = "ui-annotator-root";
  var Overlay = class {
    /**
     * @param {object} options
     * @param {import('../core/store.js').AnnotationStore} options.store
     * @param {'edit'|'view'} [options.mode]
     * @param {boolean} [options.stampAnchor] 标注时在元素上写 data-anno-id
     * @param {(tab: string) => string} options.getExportContent
     * @param {(text: string, mode: string) => void} options.onImport
     */
    constructor(options) {
      this.store = options.store;
      this.options = options;
      this.mode = options.mode === "view" ? "view" : "edit";
      this._retargetId = null;
      this._buildHost();
      this._buildToolbar();
      this._buildParts();
      this._bindStore();
      this._bindHotkeys();
    }
    /* ---------------------------------------------------------------- */
    /* 装配                                                             */
    /* ---------------------------------------------------------------- */
    _buildHost() {
      this.host = document.createElement(HOST_TAG);
      Object.assign(this.host.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483000",
        pointerEvents: "none"
      });
      this.shadow = this.host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = OVERLAY_CSS;
      this.shadow.append(style);
      this.container = h("div", { style: { pointerEvents: "none" } });
      this.shadow.append(this.container);
      this.toasts = h("div.toasts");
      this.shadow.append(this.toasts);
    }
    _buildParts() {
      this.picker = new Picker(this.shadow, {
        onPickElement: (el) => this._handlePicked(el),
        onPickRegion: (rect) => this._handleRegion(rect),
        onCancel: () => this._exitPickMode()
      });
      this.markers = new MarkerLayer({
        onSelect: (id) => this.select(id),
        onEdit: (id) => this.edit(id),
        onResolved: (id, status, resolved) => this.store.setStatus(id, status, resolved)
      });
      this.markers.readOnly = this.mode === "view";
      this.editor = new Editor({
        onSave: (id, values) => this._handleSave(id, values),
        onDelete: (id) => this.delete(id),
        onClose: () => this._draft = null,
        onRetarget: (id) => this._startRetarget(id)
      });
      this.sidebar = new Sidebar({
        onFocus: (id) => this.select(id, { scroll: true }),
        onEdit: (id) => this.edit(id),
        onDelete: (id) => this.delete(id),
        onRetarget: (id) => this._startRetarget(id),
        onExport: () => this.modal.show("config"),
        onImport: () => this.modal.show("import")
      });
      this.modal = new ExportModal({
        getContent: this.options.getExportContent,
        onImport: (text, mode) => {
          var _a, _b;
          return (_b = (_a = this.options).onImport) == null ? void 0 : _b.call(_a, text, mode);
        },
        toast: (message, type) => this.toast(message, type)
      });
      this.markers.mount(this.container);
      this.picker.mount(this.container);
      this.editor.mount(this.container);
      this.sidebar.mount(this.container);
      this.modal.mount(this.container);
      this.markers.tooltip.addEventListener("pointerenter", () => this.markers.keepTooltip());
      this.markers.tooltip.addEventListener("pointerleave", () => this.markers._hideTooltipSoon());
    }
    _buildToolbar() {
      this.pickBtn = h("button.btn.ghost", {
        title: "选择元素标注 (E)",
        onclick: () => this.togglePick("element")
      }, [icon(ICONS.cursor)]);
      this.regionBtn = h("button.btn.ghost", {
        title: "框选区域标注 (R)",
        onclick: () => this.togglePick("region")
      }, [icon(ICONS.frame)]);
      this.listBtn = h("button.btn.ghost", {
        title: "标注清单 (S)",
        onclick: () => this.sidebar.toggle()
      }, [icon(ICONS.list)]);
      this.eyeBtn = h("button.btn.ghost", {
        title: "显示/隐藏标记 (H)",
        onclick: () => this.toggleMarkers()
      }, [icon(ICONS.eye)]);
      this.aiBtn = h("button.btn.ghost", {
        title: "AI 生成标注：复制提示词",
        onclick: () => this.modal.show("prompt")
      }, [icon(ICONS.sparkles)]);
      this.exportBtn = h("button.btn.ghost", {
        title: "导出配置 JSON",
        onclick: () => this.modal.show("config")
      }, [icon(ICONS.code)]);
      this.countEl = h("span.count", { text: "0" });
      this.toolbar = h("div.toolbar", {}, [
        h("span.grip", { title: "拖动移动工具栏", text: "⋮⋮" }),
        this.pickBtn,
        this.regionBtn,
        h("span.sep"),
        this.countEl,
        this.listBtn,
        this.eyeBtn,
        h("span.sep"),
        this.aiBtn,
        this.exportBtn
      ]);
      if (this.mode === "view") {
        this.pickBtn.classList.add("hidden");
        this.regionBtn.classList.add("hidden");
        this.aiBtn.classList.add("hidden");
      }
      this.shadow.append(this.toolbar);
      this._makeToolbarDraggable();
    }
    _makeToolbarDraggable() {
      const grip = this.toolbar.querySelector(".grip");
      let origin = null;
      grip.addEventListener("pointerdown", (event) => {
        const rect = this.toolbar.getBoundingClientRect();
        origin = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
        grip.setPointerCapture(event.pointerId);
      });
      grip.addEventListener("pointermove", (event) => {
        if (!origin) return;
        const left = origin.left + (event.clientX - origin.x);
        const top = origin.top + (event.clientY - origin.y);
        Object.assign(this.toolbar.style, {
          left: `${Math.max(4, Math.min(left, window.innerWidth - this.toolbar.offsetWidth - 4))}px`,
          top: `${Math.max(4, Math.min(top, window.innerHeight - this.toolbar.offsetHeight - 4))}px`,
          right: "auto",
          bottom: "auto"
        });
      });
      grip.addEventListener("pointerup", () => {
        origin = null;
      });
    }
    /* ---------------------------------------------------------------- */
    /* 生命周期                                                         */
    /* ---------------------------------------------------------------- */
    mount() {
      document.body.append(this.host);
      this.render();
    }
    destroy() {
      this.picker.stop();
      this.markers.destroy();
      this.host.remove();
      window.removeEventListener("keydown", this._hotkeyHandler, true);
    }
    render() {
      const annotations = this.store.list();
      this.markers.render(annotations);
      this.sidebar.render(annotations);
      this.countEl.textContent = String(annotations.length);
    }
    _bindStore() {
      this.store.on("changed", () => this.render());
      this.store.on("loaded", () => this.render());
      this.store.on("save-error", (err) => this.toast(String(err.message || err), "error"));
    }
    /* ---------------------------------------------------------------- */
    /* 交互                                                             */
    /* ---------------------------------------------------------------- */
    togglePick(mode) {
      if (this.picker.mode === mode) {
        this._exitPickMode();
        return;
      }
      this.editor.close();
      this.picker.start(mode);
      this.pickBtn.classList.toggle("active", mode === "element");
      this.regionBtn.classList.toggle("active", mode === "region");
      this.toast(
        mode === "element" ? "点击页面上任意元素进行标注，Esc 取消" : "拖动框选一个区域，Esc 取消"
      );
    }
    _exitPickMode() {
      this.picker.stop();
      this._retargetId = null;
      this.pickBtn.classList.remove("active");
      this.regionBtn.classList.remove("active");
    }
    toggleMarkers() {
      const next = !this.markers.visible;
      this.markers.setVisible(next);
      this.eyeBtn.classList.toggle("active", !next);
      this.toast(next ? "已显示标记" : "已隐藏标记");
    }
    /** 拾取到元素：可能是新增标注，也可能是给已有标注重新指定挂载点 */
    _handlePicked(el) {
      const target = captureTarget(el, { stampAnchor: this.options.stampAnchor });
      if (this._retargetId) {
        const id = this._retargetId;
        this._retargetId = null;
        this._exitPickMode();
        this.store.update(id, { target, status: "active" });
        this.toast("已重新指定元素");
        this.select(id);
        return;
      }
      this._exitPickMode();
      this._draft = { type: "element", target, category: "note", seq: this.store.list().length + 1 };
      this.editor.show(
        { ...this._draft, title: "", body: "", businessLogic: {}, dataBinding: {}, tags: [], meta: {} },
        { isNew: true, anchorRect: el.getBoundingClientRect() }
      );
    }
    _handleRegion(rect) {
      this._exitPickMode();
      const inner = elementAtRect(rect);
      const target = inner ? { ...captureTarget(inner), rect } : { strategies: [], rect, snapshot: {}, resolved: null };
      this._draft = { type: "region", target, category: "note" };
      this.editor.show(
        { ...this._draft, title: "", body: "", businessLogic: {}, dataBinding: {}, tags: [], meta: {} },
        {
          isNew: true,
          anchorRect: {
            left: rect.x - window.scrollX,
            top: rect.y - window.scrollY,
            right: rect.x - window.scrollX + rect.width,
            bottom: rect.y - window.scrollY + rect.height
          }
        }
      );
    }
    _handleSave(id, values) {
      if (id) {
        this.store.update(id, values);
        this.toast("已保存");
      } else {
        const created = this.store.add({ ...this._draft, ...values });
        this.toast(`已新增标注 #${created.seq}`);
        this.select(created.id);
      }
      this._draft = null;
      this.editor.close();
    }
    _startRetarget(id) {
      this._retargetId = id;
      this.editor.close();
      this.picker.start("element");
      this.pickBtn.classList.add("active");
      this.toast("点击要重新挂载的元素");
    }
    select(id, options = {}) {
      this.markers.select(id, options);
      this.sidebar.select(id);
    }
    edit(id) {
      var _a;
      if (this.mode === "view") return;
      const annotation = this.store.find(id);
      if (!annotation) return;
      const entry = this.markers.entries.get(id);
      const rect = ((_a = entry == null ? void 0 : entry.element) == null ? void 0 : _a.isConnected) ? entry.element.getBoundingClientRect() : null;
      this.editor.show(annotation, { anchorRect: rect });
    }
    delete(id) {
      const annotation = this.store.find(id);
      if (!annotation) return;
      const hasContent = annotation.title || annotation.body;
      if (hasContent && !window.confirm(`确认删除标注 #${annotation.seq}「${annotation.title || "未命名"}」？`)) {
        return;
      }
      this.store.remove(id);
      this.editor.close();
      this.toast("已删除");
    }
    /* ---------------------------------------------------------------- */
    /* 热键                                                             */
    /* ---------------------------------------------------------------- */
    _bindHotkeys() {
      this._hotkeyHandler = (event) => {
        const active = document.activeElement;
        const typing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
        if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
        if (this.editor.open || this.modal.open) return;
        switch (event.key.toLowerCase()) {
          case "e":
            if (this.mode === "edit") {
              event.preventDefault();
              this.togglePick("element");
            }
            break;
          case "r":
            if (this.mode === "edit") {
              event.preventDefault();
              this.togglePick("region");
            }
            break;
          case "s":
            event.preventDefault();
            this.sidebar.toggle();
            break;
          case "h":
            event.preventDefault();
            this.toggleMarkers();
            break;
          default:
            break;
        }
      };
      window.addEventListener("keydown", this._hotkeyHandler, true);
    }
    /* ---------------------------------------------------------------- */
    toast(message, type = "info") {
      const node = h(`div.toast${type !== "info" ? `.${type}` : ""}`, { text: message });
      this.toasts.append(node);
      setTimeout(() => {
        node.style.opacity = "0";
        node.style.transition = "opacity .2s";
        setTimeout(() => node.remove(), 220);
      }, type === "error" ? 4200 : 2e3);
    }
  };

  // src/ai/context.js
  var INTERACTIVE_SELECTOR = [
    "a[href]",
    "button",
    "input:not([type=hidden])",
    "select",
    "textarea",
    "[role=button]",
    "[role=link]",
    "[role=tab]",
    "[role=checkbox]",
    "[role=radio]",
    "[role=switch]",
    "[role=menuitem]",
    "[role=combobox]",
    "[onclick]",
    '[tabindex]:not([tabindex="-1"])'
  ].join(",");
  var LANDMARK_SELECTOR = [
    "main",
    "nav",
    "aside",
    "header",
    "footer",
    "form",
    "dialog",
    "table",
    "[role=main]",
    "[role=navigation]",
    "[role=dialog]",
    "[role=tablist]",
    "[role=search]"
  ].join(",");
  function extractPageContext(options = {}) {
    var _a, _b;
    const { maxElements = 160, includeTree = true, annotations = [] } = options;
    const refs = /* @__PURE__ */ new Map();
    const assigned = /* @__PURE__ */ new Map();
    let counter = 0;
    const refOf = (el) => {
      if (assigned.has(el)) return assigned.get(el);
      const ref = `e${++counter}`;
      assigned.set(el, ref);
      refs.set(ref, el);
      return ref;
    };
    const skip = (el) => !el || el.closest("ui-annotator-root") || !isVisible(el);
    const context = {
      page: {
        url: currentUrl(),
        urlPattern: urlPattern(),
        title: document.title,
        framework: detectFramework(),
        viewport: { width: window.innerWidth, height: window.innerHeight },
        description: ((_a = document.querySelector("meta[name=description]")) == null ? void 0 : _a.content) || ""
      },
      outline: [],
      regions: [],
      interactives: [],
      forms: [],
      tables: [],
      texts: [],
      existingAnnotations: []
    };
    for (const el of document.querySelectorAll("h1,h2,h3,h4,[role=heading]")) {
      if (skip(el)) continue;
      const text = normalizeText(el.textContent, 90);
      if (!text) continue;
      context.outline.push({
        ref: refOf(el),
        level: Number(el.tagName[1]) || Number(el.getAttribute("aria-level")) || 2,
        text
      });
    }
    for (const el of document.querySelectorAll(LANDMARK_SELECTOR)) {
      if (skip(el)) continue;
      const component = describeComponent(el);
      context.regions.push({
        ref: refOf(el),
        tag: el.tagName.toLowerCase(),
        role: roleOf(el),
        name: accessibleName(el),
        component: component.component || void 0,
        // 区域摘要帮模型建立整体印象
        summary: normalizeText(el.textContent, 120)
      });
      if (context.regions.length >= 30) break;
    }
    for (const form of document.querySelectorAll("form, [role=form]")) {
      if (skip(form)) continue;
      const fields = [];
      for (const control of form.querySelectorAll("input:not([type=hidden]), select, textarea")) {
        if (skip(control)) continue;
        fields.push(describeControl(control, refOf(control)));
        if (fields.length >= 40) break;
      }
      const submit = form.querySelector("[type=submit], button:not([type=button])");
      context.forms.push({
        ref: refOf(form),
        name: accessibleName(form) || form.getAttribute("name") || "",
        component: describeComponent(form).component || void 0,
        action: form.getAttribute("action") || "",
        method: (form.getAttribute("method") || "get").toUpperCase(),
        fields,
        submitRef: submit && !skip(submit) ? refOf(submit) : void 0
      });
      if (context.forms.length >= 10) break;
    }
    for (const table of document.querySelectorAll("table, [role=table], [role=grid]")) {
      if (skip(table)) continue;
      const headers = Array.from(table.querySelectorAll("thead th, [role=columnheader]")).map((th) => normalizeText(th.textContent, 40)).filter(Boolean);
      const bodyRows = table.querySelectorAll("tbody tr, [role=row]").length;
      context.tables.push({
        ref: refOf(table),
        caption: normalizeText((_b = table.querySelector("caption")) == null ? void 0 : _b.textContent, 60),
        component: describeComponent(table).component || void 0,
        columns: headers,
        rowCount: bodyRows
      });
      if (context.tables.length >= 8) break;
    }
    for (const el of document.querySelectorAll(INTERACTIVE_SELECTOR)) {
      if (skip(el)) continue;
      if (assigned.has(el) && el.closest("form")) continue;
      const component = describeComponent(el);
      context.interactives.push({
        ref: refOf(el),
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type") || void 0,
        role: roleOf(el),
        name: accessibleName(el),
        component: component.component || void 0,
        componentPath: component.componentPath.length ? component.componentPath.join(">") : void 0,
        href: el.getAttribute("href") || void 0,
        disabled: el.disabled || el.getAttribute("aria-disabled") === "true" || void 0
      });
      if (context.interactives.length >= maxElements) break;
    }
    for (const el of document.querySelectorAll("p, li, td, dd, span, div")) {
      if (context.texts.length >= 40) break;
      if (skip(el) || el.childElementCount > 0) continue;
      const text = normalizeText(el.textContent, 100);
      if (text.length < 8) continue;
      context.texts.push({ ref: refOf(el), text });
    }
    context.existingAnnotations = annotations.map((a) => {
      var _a2, _b2;
      return {
        id: a.id,
        seq: a.seq,
        category: a.category,
        title: a.title,
        body: normalizeText(a.body, 160),
        targetText: normalizeText((_b2 = (_a2 = a.target) == null ? void 0 : _a2.snapshot) == null ? void 0 : _b2.text, 60)
      };
    });
    if (includeTree) {
      context.tree = pruneTree(document.body, assigned, 0);
    }
    context.refHints = {
      note: '标注请通过 ref 引用元素，例如 "ref": "e12"。不要自行编写 CSS 选择器。',
      total: refs.size
    };
    return { context, refs };
  }
  function describeControl(el, ref) {
    const tag = el.tagName.toLowerCase();
    const field = {
      ref,
      name: el.getAttribute("name") || el.id || "",
      label: accessibleName(el),
      control: tag,
      type: tag === "input" ? el.getAttribute("type") || "text" : tag,
      required: el.required || el.getAttribute("aria-required") === "true" || void 0,
      placeholder: el.getAttribute("placeholder") || void 0,
      disabled: el.disabled || void 0,
      readOnly: el.readOnly || void 0
    };
    for (const attr of ["min", "max", "minlength", "maxlength", "step", "pattern"]) {
      const value = el.getAttribute(attr);
      if (value != null) field[attr] = value;
    }
    if (tag === "select") {
      field.options = Array.from(el.options).slice(0, 20).map((o) => ({
        value: o.value,
        text: normalizeText(o.textContent, 30)
      }));
    }
    return field;
  }
  function pruneTree(el, assigned, depth) {
    var _a;
    if (depth > 12 || !el || el.nodeType !== 1) return null;
    if ((_a = el.closest) == null ? void 0 : _a.call(el, "ui-annotator-root")) return null;
    const children = [];
    for (const child of el.children) {
      const node2 = pruneTree(child, assigned, depth + 1);
      if (node2) children.push(node2);
      if (children.length >= 24) break;
    }
    const ref = assigned.get(el);
    if (!ref && !children.length) return null;
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
  function materializeAiAnnotations(items, refs) {
    var _a;
    const annotations = [];
    const skipped = [];
    for (const item of Array.isArray(items) ? items : []) {
      const el = refs.get(String((item == null ? void 0 : item.ref) || "").trim());
      if (!el || !el.isConnected) {
        skipped.push({ ref: item == null ? void 0 : item.ref, title: item == null ? void 0 : item.title, reason: "ref 不存在或元素已从页面移除" });
        continue;
      }
      annotations.push({
        ...item,
        target: captureTarget(el),
        type: "element",
        meta: {
          source: "ai",
          aiConfidence: (_a = item.confidence) != null ? _a : null,
          reviewed: false,
          author: item.author || "ai"
        }
      });
    }
    return { annotations, skipped };
  }

  // src/ai/prompt.js
  var AI_OUTPUT_CONTRACT = {
    annotations: [
      {
        ref: "e12  // 必填，引用上下文里的元素 ref",
        category: "业务规则 | 数据来源 | 交互行为 | 校验约束 | 权限可见性 | 状态流转 | 待确认 | 普通说明 之一的 key",
        title: "一句话概括该元素的业务职责",
        body: "用业务语言说明这里发生什么、为什么这样设计",
        businessLogic: {
          trigger: "什么触发",
          preconditions: ["前置条件"],
          effect: "核心行为",
          postconditions: ["执行结果"],
          rules: ["具体业务规则"],
          errorStates: ["异常与边界"]
        },
        dataBinding: {
          fields: [{ name: "", label: "", type: "", required: false, validation: "" }],
          apis: [{ method: "POST", path: "/api/xxx", purpose: "" }],
          stateKeys: []
        },
        tags: [],
        confidence: 0.8
      }
    ],
    pageSummary: "整页的业务定位，一到三句",
    glossary: [{ term: "业务术语", definition: "解释" }]
  };
  var CATEGORY_LINES = CATEGORIES.map((c) => `  - ${c.key}：${c.label}`).join("\n");
  function buildPrompt(context, options = {}) {
    const {
      domain = "",
      language = "中文",
      focus = "",
      maxAnnotations = 25
    } = options;
    return `你是一位资深业务分析师，正在为一套前端界面补充「业务逻辑说明」，产出结果将用于驱动 AI design（由标注反推设计与实现）。

## 任务
阅读下面的页面语义上下文，挑出**最能体现业务逻辑**的界面元素，为它们逐条写出业务说明。

${domain ? `## 业务域
${domain}
` : ""}${focus ? `## 本次重点
${focus}
` : ""}
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
  function buildRefinePrompt(context, options = {}) {
    const { language = "中文" } = options;
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
  function parseAiResponse(text) {
    if (!text) return { ok: false, data: null, error: "响应为空" };
    if (typeof text === "object") return { ok: true, data: text, error: null };
    const candidates = [];
    const fence = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) candidates.push(fence[1]);
    candidates.push(String(text));
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));
    for (const candidate of candidates) {
      try {
        return { ok: true, data: JSON.parse(candidate.trim()), error: null };
      } catch {
      }
    }
    return { ok: false, data: null, error: "无法从响应中解析出 JSON" };
  }

  // src/index.js
  var VERSION = "0.1.0";
  var Annotator = class {
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
      if (!isBrowser) throw new Error("[ui-annotator] 只能在浏览器环境使用");
      this.options = {
        mode: "edit",
        storage: "local",
        storageKey: "ui-annotator:config",
        inlineSelector: "#ui-annotator-config",
        stampAnchor: true,
        autoSave: true,
        watchRoute: true,
        ...options
      };
      this.store = new AnnotationStore({
        adapter: this._createAdapter(),
        author: this.options.author || "anonymous",
        projectName: this.options.project,
        autoSave: this.options.autoSave
      });
      this.overlay = new Overlay({
        store: this.store,
        mode: this.options.mode,
        stampAnchor: this.options.stampAnchor,
        getExportContent: (tab) => this._exportContent(tab),
        onImport: (text, mode) => this._handleImport(text, mode)
      });
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
      if (storage !== "local") {
        return resolveAdapter(storage, { storageKey, inlineSelector });
      }
      const local = resolveAdapter("local", { storageKey });
      const inline = createInlineAdapter(inlineSelector);
      return createLayeredAdapter([inline], local);
    }
    /* ---------------------------------------------------------------- */
    /* 生命周期                                                         */
    /* ---------------------------------------------------------------- */
    async start() {
      var _a;
      if (this._started) return this;
      this._started = true;
      await this.store.load();
      this.store.config.project.framework = detectFramework();
      this.overlay.mount();
      if (this.options.watchRoute) this._watchRoute();
      if (isFileProtocol && !((_a = this.store.adapter) == null ? void 0 : _a.persistent)) {
        this.overlay.toast("file:// 下无法持久化，请用「导出」保存标注", "warn");
      }
      return this;
    }
    destroy() {
      var _a;
      (_a = this._unwatchRoute) == null ? void 0 : _a.call(this);
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
      window.addEventListener("popstate", onChange);
      window.addEventListener("hashchange", onChange);
      this._unwatchRoute = () => {
        history.pushState = origPush;
        history.replaceState = origReplace;
        window.removeEventListener("popstate", onChange);
        window.removeEventListener("hashchange", onChange);
      };
    }
    setMode(mode) {
      this.options.mode = mode === "view" ? "view" : "edit";
      this.overlay.mode = this.options.mode;
      this.overlay.markers.readOnly = this.options.mode === "view";
      const hidden = this.options.mode === "view";
      this.overlay.pickBtn.classList.toggle("hidden", hidden);
      this.overlay.regionBtn.classList.toggle("hidden", hidden);
      this.overlay.aiBtn.classList.toggle("hidden", hidden);
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
    import(config, mode = "replace") {
      const raw = typeof config === "string" ? JSON.parse(config) : config;
      const result = this.store.import(raw, mode);
      if (!result.ok) throw new Error(result.errors.join("; "));
      return result;
    }
    /** 代码方式补一条标注，适合把已有文档批量灌进页面 */
    annotate(selector, values = {}) {
      const el = typeof selector === "string" ? document.querySelector(selector) : selector;
      if (!el) {
        console.warn("[ui-annotator] 找不到元素:", selector);
        return null;
      }
      return this.store.add({
        ...values,
        type: "element",
        target: captureTarget(el, { stampAnchor: this.options.stampAnchor })
      });
    }
    /* ---------------------------------------------------------------- */
    /* AI                                                               */
    /* ---------------------------------------------------------------- */
    /** 抽取页面语义上下文，同时缓存 ref -> 元素映射供回填使用 */
    extractContext(options = {}) {
      const { context, refs } = extractPageContext({
        annotations: this.store.list(),
        ...options
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
      var _a, _b;
      const mode = options.mode || "merge";
      const parsed = typeof input === "string" ? parseAiResponse(input) : { ok: true, data: input };
      if (!parsed.ok) throw new Error(parsed.error);
      const raw = parsed.data || {};
      if (Array.isArray(raw.pages)) {
        const result = this.store.import(raw, mode);
        if (!result.ok) throw new Error(result.errors.join("; "));
        return { added: 0, updated: 0, skipped: [], imported: true };
      }
      const items = Array.isArray(raw.annotations) ? raw.annotations : [];
      if (!items.length) throw new Error("AI 返回内容里没有 annotations");
      if (mode === "replace") this.store.clearCurrentPage();
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
          meta: { ...patch.meta, source: "ai", reviewed: false, aiConfidence: (_a = item.confidence) != null ? _a : null }
        });
        updated += 1;
      }
      if (!this._refs) this.extractContext();
      const { annotations, skipped } = materializeAiAnnotations(creations, this._refs);
      for (const annotation of annotations) this.store.add(annotation);
      const page = this.store.currentPage();
      if (raw.pageSummary && page) page.summary = String(raw.pageSummary);
      if (Array.isArray(raw.glossary)) {
        for (const item of raw.glossary) {
          if (item == null ? void 0 : item.term) this.store.config.glossary[item.term] = String((_b = item.definition) != null ? _b : "");
        }
      } else if (raw.glossary && typeof raw.glossary === "object") {
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
        if (tab === "context") return JSON.stringify(this.extractContext(), null, 2);
        if (tab === "prompt") return this.buildPrompt();
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
      const trimmed = String(text || "").trim();
      if (!trimmed) {
        this.overlay.toast("请先粘贴或选择要导入的 JSON", "warn");
        return;
      }
      let raw;
      try {
        raw = JSON.parse(trimmed);
      } catch {
        const parsed = parseAiResponse(trimmed);
        if (!parsed.ok) {
          this.overlay.toast(`无法解析为 JSON：${parsed.error}`, "error");
          return;
        }
        raw = parsed.data;
      }
      if (!raw || typeof raw !== "object") {
        this.overlay.toast("无法解析为 JSON，请检查内容", "error");
        return;
      }
      try {
        if (Array.isArray(raw.pages)) {
          const result = validateConfig(raw);
          if (!result.ok) throw new Error(result.errors.join("; "));
          this.store.import(raw, mode);
          this.overlay.toast(`已导入 ${result.config.pages.length} 个页面的标注`);
        } else {
          const { added, updated, skipped } = this.applyAiResult(raw, { mode });
          const tail = skipped.length ? `，${skipped.length} 条因 ref 失效被跳过` : "";
          this.overlay.toast(`新增 ${added} 条、更新 ${updated} 条${tail}`);
        }
        this.overlay.modal.close();
        this.overlay.render();
      } catch (err) {
        this.overlay.toast(`导入失败: ${err.message}`, "error");
      }
    }
  };
  var instance = null;
  function init(options = {}) {
    if (instance) return instance;
    instance = new Annotator(options);
    instance.start().catch((err) => console.error("[ui-annotator] 启动失败:", err));
    return instance;
  }
  function getInstance() {
    return instance;
  }
  function destroy() {
    instance == null ? void 0 : instance.destroy();
    instance = null;
  }
  function autoInit() {
    const script = document.currentScript || document.querySelector('script[data-auto][src*="ui-annotator"]');
    if (!script || !script.hasAttribute("data-auto")) return;
    const d = script.dataset;
    const options = {
      mode: d.mode || "edit",
      storage: d.storage || "local",
      project: d.project,
      author: d.author,
      domain: d.domain
    };
    if (d.storageKey) options.storageKey = d.storageKey;
    if (d.inlineSelector) options.inlineSelector = d.inlineSelector;
    if (d.stampAnchor === "false") options.stampAnchor = false;
    const boot = () => init(options);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
      boot();
    }
  }
  if (isBrowser) autoInit();
  var src_default = { Annotator, init, getInstance, destroy, version: VERSION };
  return __toCommonJS(src_exports);
})();
if (typeof module === 'object' && module.exports) { module.exports = UIAnnotator; }
else if (typeof define === 'function' && define.amd) { define(function () { return UIAnnotator; }); }
