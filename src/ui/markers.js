/**
 * 标记层：把标注渲染成锚定在元素上的数字别针，并在悬浮/点击时展示注释内容。
 *
 * 锚定的难点在于宿主页面会滚动、resize、异步渲染，所以这里用
 * scroll/resize 监听 + ResizeObserver + MutationObserver 三路触发重排，
 * 全部走 rAF 节流，避免抖动和性能问题。
 */

import { resolveTarget, healTarget } from '../core/locator.js';
import { categoryOf } from '../core/schema.js';
import { escapeHtml, normalizeText, throttleRaf } from '../core/utils.js';
import { h, icon, ICONS } from './dom.js';

export class MarkerLayer {
  /**
   * @param {object} handlers
   * @param {(id: string) => void} handlers.onSelect
   * @param {(id: string) => void} handlers.onEdit
   * @param {(id: string, status: string, resolved: object) => void} handlers.onResolved
   */
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.layer = h('div.layer');
    this.tooltip = h('div.tooltip.hidden');
    this.focusRing = h('div.focus-ring.hidden');
    this.layer.append(this.focusRing, this.tooltip);

    /** id -> {annotation, element, marker, region} */
    this.entries = new Map();
    this.selectedId = null;
    this.visible = true;
    /** 默认展开：标记以卡片形式展示标注标题，而非仅数字别针 */
    this.expanded = true;
    /** 查看态只读，编辑态可点开编辑面板 */
    this.readOnly = false;

    this._reflow = throttleRaf(() => this._position());
    this._tooltipFor = null;
    this._tooltipTimer = null;
  }

  mount(container) {
    container.append(this.layer);

    window.addEventListener('scroll', this._reflow, true);
    window.addEventListener('resize', this._reflow);

    // 宿主页面尺寸变化（响应式布局、内容展开）
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(this._reflow);
      this._resizeObserver.observe(document.documentElement);
    }
    // SPA 路由切换或列表异步加载后，元素可能被整棵替换，需要重新定位
    if (typeof MutationObserver !== 'undefined') {
      this._mutationObserver = new MutationObserver((records) => {
        // 忽略标注工具自身引起的变动
        const relevant = records.some((r) => !(r.target instanceof Element) || !r.target.closest('ui-annotator-root'));
        if (relevant) this._scheduleRerender();
      });
      this._mutationObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  destroy() {
    window.removeEventListener('scroll', this._reflow, true);
    window.removeEventListener('resize', this._reflow);
    this._resizeObserver?.disconnect();
    this._mutationObserver?.disconnect();
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
    this._annotations = annotations;
    const alive = new Set();

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

    // 清理已删除的标注
    for (const [id, entry] of this.entries) {
      if (alive.has(id)) continue;
      entry.marker?.remove();
      entry.region?.remove();
      this.entries.delete(id);
    }

    this._position();
  }

  /** 用定位引擎找回元素，并把状态与置信度回写给上层 */
  _resolve(entry) {
    const annotation = entry.annotation;

    if (annotation.type === 'region') {
      entry.element = null;
      return;
    }

    const result = resolveTarget(annotation.target);
    entry.element = result.element;
    entry.confidence = result.confidence;
    entry.votes = result.votes;

    // 漂移时用当前元素重新采集线索，下次加载即可直接命中
    if (result.status === 'drifted' && result.element) {
      healTarget(annotation.target, result.element);
    }

    this.handlers.onResolved?.(annotation.id, result.status, {
      kind: result.kind,
      confidence: result.confidence,
    });
  }

  _ensureNodes(entry) {
    const { annotation } = entry;
    const color = categoryOf(annotation.category).color;

    if (!entry.marker) {
      entry.marker = h('div.marker', {
        onclick: (event) => {
          event.stopPropagation();
          this.handlers.onSelect?.(annotation.id);
        },
        ondblclick: (event) => {
          event.stopPropagation();
          if (!this.readOnly) this.handlers.onEdit?.(annotation.id);
        },
        onpointerenter: () => this._showTooltip(entry),
        onpointerleave: () => this._hideTooltipSoon(),
      });
      this.layer.append(entry.marker);
    }

    // 根据展开状态重建标记内容
    entry.marker.textContent = '';
    if (this.expanded) {
      entry.marker.append(
        h('span.seq-badge', { text: String(annotation.seq) }),
        h('span.m-title', { text: annotation.title || '(未命名)' }),
      );
    } else {
      entry.marker.append(String(annotation.seq));
    }

    entry.marker.style.background = this.expanded ? '' : color;
    entry.marker.title = `#${annotation.seq} ${annotation.title || '(未命名)'}`;
    entry.marker.className = 'marker'
      + (this.expanded ? ' expanded' : '')
      + (annotation.status === 'drifted' ? ' drifted' : '')
      + (annotation.status === 'orphaned' ? ' orphaned' : '')
      + (this.selectedId === annotation.id ? ' selected' : '');
    if (this.expanded) entry.marker.style.borderLeftColor = color;

    // 区域型标注额外画一个虚线框
    if (annotation.type === 'region') {
      if (!entry.region) {
        entry.region = h('div.region');
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

      if (annotation.type === 'region' && annotation.target.rect) {
        const r = annotation.target.rect;
        rect = {
          left: r.x - (r.relativeTo === 'document' ? window.scrollX : 0),
          top: r.y - (r.relativeTo === 'document' ? window.scrollY : 0),
          width: r.width,
          height: r.height,
        };
      } else if (entry.element && entry.element.isConnected) {
        const r = entry.element.getBoundingClientRect();
        rect = { left: r.left, top: r.top, width: r.width, height: r.height };
      }

      if (!rect) {
        // 彻底找不到的标注只在侧栏里出现，界面上不画
        marker.classList.add('hidden');
        region?.classList.add('hidden');
        continue;
      }

      // 视口外的标记隐藏，避免堆在边缘干扰阅读
      const offscreen = rect.top > window.innerHeight + 40 || rect.bottom < -40
        || rect.left > window.innerWidth + 40 || rect.left + rect.width < -40;
      marker.classList.toggle('hidden', offscreen);
      region?.classList.toggle('hidden', offscreen);
      if (offscreen) continue;

      // 别针钉在元素右上角，尽量不遮住内容
      if (this.expanded) {
        // 展开态：卡片从右上角向右延伸
        marker.style.left = `${rect.left + rect.width + 4}px`;
        marker.style.top = `${rect.top}px`;
      } else {
        marker.style.left = `${rect.left + rect.width}px`;
        marker.style.top = `${rect.top}px`;
      }

      if (region) {
        Object.assign(region.style, {
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        });
      }
    }

    // 焦点环跟随选中项
    if (this.selectedId) {
      const entry = this.entries.get(this.selectedId);
      const el = entry?.element;
      if (el?.isConnected) {
        const r = el.getBoundingClientRect();
        Object.assign(this.focusRing.style, {
          left: `${r.left - 2}px`,
          top: `${r.top - 2}px`,
          width: `${r.width + 4}px`,
          height: `${r.height + 4}px`,
        });
        this.focusRing.classList.remove('hidden');
      } else {
        this.focusRing.classList.add('hidden');
      }
    }

    if (this._tooltipFor) this._placeTooltip(this._tooltipFor);
  }

  /* ---------------------------------------------------------------- */

  setVisible(visible) {
    this.visible = visible;
    this.layer.classList.toggle('hidden', !visible);
    if (visible) this._position();
  }

  /** 切换标记的展开/收起状态：展开显示卡片（序号+标题），收起仅显示数字别针 */
  toggleExpanded() {
    this.expanded = !this.expanded;
    this.layer.classList.toggle('expanded', this.expanded);
    for (const entry of this.entries.values()) this._ensureNodes(entry);
    this._position();
    return this.expanded;
  }

  select(id, { scroll = false } = {}) {
    this.selectedId = id;
    for (const entry of this.entries.values()) {
      entry.marker?.classList.toggle('selected', entry.annotation.id === id);
    }

    const entry = this.entries.get(id);
    if (scroll && entry?.element?.isConnected) {
      entry.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 平滑滚动结束后再画焦点环
      setTimeout(() => {
        this._position();
        this.focusRing.classList.remove('hidden');
        // 重新触发动画
        this.focusRing.style.animation = 'none';
        void this.focusRing.offsetWidth;
        this.focusRing.style.animation = '';
      }, 320);
    }
    if (!id) this.focusRing.classList.add('hidden');
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

    this.tooltip.innerHTML = '';
    this.tooltip.style.borderLeftColor = cat.color;
    this.tooltip.append(
      h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' } }, [
        h('span.chip', { text: cat.label, style: { background: cat.color } }),
        annotation.status !== 'active'
          ? h('span', {
              text: annotation.status === 'drifted' ? '定位已漂移' : '定位丢失',
              style: { fontSize: '10px', color: annotation.status === 'drifted' ? '#b45309' : '#dc2626' },
            })
          : '',
      ]),
      h('h4', { text: annotation.title || '(未命名标注)' }),
      annotation.body ? h('p', { text: annotation.body }) : '',
      this._logicList(annotation.businessLogic),
      this._fieldList(annotation.dataBinding),
      this.readOnly ? '' : h('div', {
        style: { marginTop: '6px', fontSize: '10px', color: '#94a3b8' },
        text: '双击别针可编辑',
      })
    );
    this.tooltip.classList.remove('hidden');
    this._placeTooltip(entry);
  }

  /** 结构化业务逻辑渲染成定义列表 */
  _logicList(logic) {
    if (!logic) return '';
    const rows = [
      ['触发', logic.trigger],
      ['前置', logic.preconditions],
      ['行为', logic.effect],
      ['结果', logic.postconditions],
      ['规则', logic.rules],
      ['异常', logic.errorStates],
    ].filter(([, value]) => (Array.isArray(value) ? value.length : Boolean(value)));

    if (!rows.length) return '';

    const dl = h('dl');
    for (const [label, value] of rows) {
      dl.append(h('dt', { text: label }));
      dl.append(
        Array.isArray(value)
          ? h('dd', {}, [h('ul', {}, value.map((v) => h('li', { text: v })))])
          : h('dd', { text: value })
      );
    }
    return dl;
  }

  _fieldList(binding) {
    if (!binding) return '';
    const parts = [];
    if (binding.fields?.length) {
      parts.push(h('dt', { text: '字段' }));
      parts.push(h('dd', {}, [h('ul', {}, binding.fields.map((f) => h('li', {
        text: `${f.label || f.name}${f.type ? `: ${f.type}` : ''}${f.required ? ' *必填' : ''}${f.validation ? ` (${f.validation})` : ''}`,
      })))]));
    }
    if (binding.apis?.length) {
      parts.push(h('dt', { text: '接口' }));
      parts.push(h('dd', {}, [h('ul', {}, binding.apis.map((a) => h('li', {
        text: `${a.method} ${a.path}${a.purpose ? ` — ${a.purpose}` : ''}`,
      })))]));
    }
    return parts.length ? h('dl', {}, parts) : '';
  }

  _placeTooltip(entry) {
    const anchor = entry.marker;
    if (!anchor || anchor.classList.contains('hidden')) {
      this.tooltip.classList.add('hidden');
      return;
    }
    const markerRect = anchor.getBoundingClientRect();
    const width = this.tooltip.offsetWidth || 320;
    const height = this.tooltip.offsetHeight || 120;

    // 默认放右下，空间不够就翻到左侧/上方
    let left = markerRect.right + 8;
    if (left + width > window.innerWidth - 8) left = Math.max(8, markerRect.left - width - 8);
    let top = markerRect.top;
    if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8);

    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  _hideTooltipSoon() {
    clearTimeout(this._tooltipTimer);
    // 留一点延时，让鼠标能移到气泡上（气泡内容可能需要选中复制）
    this._tooltipTimer = setTimeout(() => {
      this.tooltip.classList.add('hidden');
      this._tooltipFor = null;
    }, 260);
  }

  keepTooltip() {
    clearTimeout(this._tooltipTimer);
  }
}
