/**
 * 侧栏：当前页面标注的清单视图。
 *
 * 除了浏览与跳转，它承担一个关键职责：把「定位漂移」和「定位丢失」的标注
 * 显式暴露出来。界面上找不到的标注在浮层里是隐形的，只有清单能让人发现并修复。
 */

import { CATEGORIES, categoryOf } from '../core/schema.js';
import { normalizeText } from '../core/utils.js';
import { h, icon, ICONS } from './dom.js';

export class Sidebar {
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
    this.filter = { text: '', category: '', status: '' };

    this.el = h('div.sidebar');
    this._build();
  }

  mount(container) {
    container.append(this.el);
  }

  get open() {
    return this.el.classList.contains('open');
  }

  toggle(force) {
    const next = force == null ? !this.open : force;
    this.el.classList.toggle('open', next);
    return next;
  }

  /* ---------------------------------------------------------------- */

  _build() {
    this.countEl = h('span', { style: { fontSize: '11px', color: 'var(--anno-muted)' } });

    const header = h('header', {}, [
      h('strong', { text: '标注清单' }),
      this.countEl,
      h('button.btn.ghost', { title: '收起', onclick: () => this.toggle(false) }, [icon(ICONS.close)]),
    ]);

    this.searchInput = h('input', {
      type: 'search',
      placeholder: '搜索标题 / 说明 / 标签',
      oninput: (event) => {
        this.filter.text = event.target.value.trim().toLowerCase();
        this._renderList();
      },
    });

    const categorySelect = h('select', {
      onchange: (event) => {
        this.filter.category = event.target.value;
        this._renderList();
      },
    }, [
      h('option', { value: '', text: '全部分类' }),
      ...CATEGORIES.map((c) => h('option', { value: c.key, text: c.label })),
    ]);

    const statusSelect = h('select', {
      onchange: (event) => {
        this.filter.status = event.target.value;
        this._renderList();
      },
    }, [
      h('option', { value: '', text: '全部状态' }),
      h('option', { value: 'drifted', text: '已漂移' }),
      h('option', { value: 'orphaned', text: '已丢失' }),
      h('option', { value: 'ai', text: 'AI 待复核' }),
    ]);

    const filters = h('div.filters', {}, [this.searchInput, categorySelect, statusSelect]);
    this.list = h('div.list');

    const footer = h('footer', {}, [
      h('button.btn', { onclick: () => this.handlers.onExport?.() }, [icon(ICONS.download), '导出配置']),
      h('button.btn', { onclick: () => this.handlers.onImport?.() }, [icon(ICONS.upload), '导入']),
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
    for (const node of this.list.querySelectorAll('.item')) {
      node.classList.toggle('selected', node.dataset.id === id);
    }
    // 选中项若在可视区外，滚动到可见
    const active = this.list.querySelector('.item.selected');
    active?.scrollIntoView({ block: 'nearest' });
  }

  _visible() {
    return this.annotations.filter((a) => {
      const { text, category, status } = this.filter;
      if (category && a.category !== category) return false;
      if (status === 'ai') {
        if (a.meta?.source !== 'ai' || a.meta?.reviewed) return false;
      } else if (status && a.status !== status) return false;
      if (text) {
        const haystack = [a.title, a.body, a.tags?.join(' '), a.businessLogic?.effect]
          .filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      return true;
    });
  }

  _renderList() {
    const visible = this._visible();
    const drifted = this.annotations.filter((a) => a.status === 'drifted').length;
    const orphaned = this.annotations.filter((a) => a.status === 'orphaned').length;

    this.countEl.textContent = `${visible.length}/${this.annotations.length}`
      + (drifted ? ` · 漂移 ${drifted}` : '')
      + (orphaned ? ` · 丢失 ${orphaned}` : '');

    this.list.innerHTML = '';

    if (!visible.length) {
      this.list.append(h('div.empty', {
        text: this.annotations.length
          ? '没有符合筛选条件的标注'
          : '当前页面还没有标注。点击工具栏的「选元素」开始。',
      }));
      return;
    }

    for (const annotation of visible) {
      this.list.append(this._item(annotation));
    }
  }

  _item(annotation) {
    const cat = categoryOf(annotation.category);

    const actions = h('div.actions', {}, [
      h('button', {
        title: '编辑',
        onclick: (event) => {
          event.stopPropagation();
          this.handlers.onEdit?.(annotation.id);
        },
      }, ['编辑']),
      // 丢失的标注无法点别针，只能从这里重新挂载
      annotation.status === 'orphaned'
        ? h('button', {
            title: '重新指定元素',
            onclick: (event) => {
              event.stopPropagation();
              this.handlers.onRetarget?.(annotation.id);
            },
          }, ['重定位'])
        : '',
      h('button', {
        title: '删除',
        onclick: (event) => {
          event.stopPropagation();
          this.handlers.onDelete?.(annotation.id);
        },
      }, ['删除']),
    ]);

    const meta = h('div.meta', {}, [
      h('span.chip', { text: cat.label, style: { background: cat.color } }),
      annotation.type === 'region' ? h('span', { text: '区域' }) : '',
      annotation.status === 'drifted'
        ? h('span.warn', { text: `漂移 ${fmtConfidence(annotation.target?.resolved)}` })
        : '',
      annotation.status === 'orphaned' ? h('span.lost', { text: '定位丢失' }) : '',
      annotation.meta?.source === 'ai' && !annotation.meta?.reviewed
        ? h('span.warn', { text: 'AI 待复核' })
        : '',
      actions,
    ]);

    const summary = annotation.body
      || annotation.businessLogic?.effect
      || annotation.businessLogic?.trigger
      || '';

    return h('div.item', {
      dataset: { id: annotation.id },
      class: this.selectedId === annotation.id ? 'selected' : '',
      style: { borderLeftColor: cat.color },
      onclick: () => this.handlers.onFocus?.(annotation.id),
      ondblclick: () => this.handlers.onEdit?.(annotation.id),
    }, [
      h('div.top', {}, [
        h('span.seq', { text: `#${annotation.seq}` }),
        h('span.title', { text: annotation.title || '(未命名)' }),
      ]),
      summary ? h('p.desc', { text: normalizeText(summary, 140) }) : '',
      meta,
    ]);
  }
}

function fmtConfidence(resolved) {
  if (!resolved || resolved.confidence == null) return '';
  return `${Math.round(resolved.confidence * 100)}%`;
}
