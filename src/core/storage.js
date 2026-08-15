/**
 * 存储适配器。
 *
 * 静态 HTML（file://）场景下 localStorage 可能被浏览器禁用或按文件隔离，
 * 所以每个适配器都必须可失败，且 resolveAdapter 会自动降级到内存适配器，
 * 保证工具本身永远不会因为存不上而崩掉 —— 数据仍可通过 JSON 导出保留。
 */

import { isFileProtocol } from './utils.js';

/** 内存适配器：永远可用，刷新即失效，作为最终兜底 */
export function createMemoryAdapter() {
  let cache = null;
  return {
    name: 'memory',
    persistent: false,
    async load() {
      return cache;
    },
    async save(config) {
      cache = config;
    },
    async clear() {
      cache = null;
    },
  };
}

/** 探测 localStorage 是否真的可写（隐私模式、file:// 下可能抛异常） */
function localStorageUsable() {
  try {
    const key = '__ui_annotator_probe__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function createLocalStorageAdapter(storageKey = 'ui-annotator:config') {
  return {
    name: 'localStorage',
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
        // 配额超限是这里最常见的失败原因，交由上层提示用户导出
        throw new Error('localStorage 写入失败（可能超出配额或被浏览器禁用）: ' + err.message);
      }
    },
    async clear() {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * HTTP 适配器：团队协作时把标注存到自己的后端。
 * 约定 GET endpoint 返回配置、PUT endpoint 保存配置。
 */
export function createHttpAdapter(options = {}) {
  const { endpoint, headers = {}, fetchImpl = globalThis.fetch?.bind(globalThis) } = options;
  if (!endpoint) throw new Error('http 适配器必须提供 endpoint');

  return {
    name: 'http',
    persistent: true,
    async load() {
      const res = await fetchImpl(endpoint, { headers, credentials: 'same-origin' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`加载标注失败: HTTP ${res.status}`);
      return res.json();
    },
    async save(config) {
      const res = await fetchImpl(endpoint, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...headers },
        credentials: 'same-origin',
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(`保存标注失败: HTTP ${res.status}`);
    },
    async clear() {
      await fetchImpl(endpoint, { method: 'DELETE', headers, credentials: 'same-origin' });
    },
  };
}

/**
 * 只读适配器：从页面内联的 <script type="application/json"> 读取配置。
 *
 * 这是静态 HTML 的推荐「发布」方式 —— 把标注结果内联进 HTML，
 * 打开即可看，不需要服务器、不受 file:// 的 fetch 限制。
 */
export function createInlineAdapter(selector = '#ui-annotator-config') {
  return {
    name: 'inline',
    persistent: false,
    readOnly: true,
    async load() {
      const node = document.querySelector(selector);
      if (!node) return null;
      try {
        return JSON.parse(node.textContent || 'null');
      } catch (err) {
        console.error('[ui-annotator] 内联配置不是合法 JSON:', err);
        return null;
      }
    },
    async save() {
      // 内联配置无法回写，交由 UI 引导用户下载 JSON
    },
    async clear() {},
  };
}

/**
 * 按配置选出适配器，并在不可用时逐级降级。
 * @param {string|object} spec 'local' | 'memory' | 'inline' | {type:'http',...} | 自定义适配器对象
 */
export function resolveAdapter(spec, context = {}) {
  // 已经是适配器实例，直接用
  if (spec && typeof spec === 'object' && typeof spec.load === 'function') return spec;

  const type = typeof spec === 'object' && spec ? spec.type : spec;

  if (type === 'http') return createHttpAdapter(spec);
  if (type === 'inline') return createInlineAdapter(spec?.selector);
  if (type === 'memory') return createMemoryAdapter();

  // 默认 local，但要先确认真的能用
  const local = createLocalStorageAdapter(context.storageKey);
  if (local.usable()) return local;

  console.warn(
    isFileProtocol
      ? '[ui-annotator] file:// 下 localStorage 不可用，已降级为内存存储。请用「导出 JSON」保存标注结果。'
      : '[ui-annotator] localStorage 不可用，已降级为内存存储。'
  );
  return createMemoryAdapter();
}

/**
 * 组合适配器：优先从内联配置读取（发布态），写入走可持久化适配器（编辑态）。
 * 静态页面的典型用法：HTML 里内联一份基线标注，本地继续编辑存 localStorage。
 */
export function createLayeredAdapter(readAdapters, writeAdapter) {
  return {
    name: 'layered',
    persistent: Boolean(writeAdapter?.persistent),
    async load() {
      // 后写入的优先：先看可写层有没有本地修改，没有再退回内联基线
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
    },
  };
}
