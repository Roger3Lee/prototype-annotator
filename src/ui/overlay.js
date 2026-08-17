/**
 * 浮层编排：创建 Shadow DOM 宿主，装配工具栏、拾取器、标记层、编辑器、侧栏、对话框，
 * 并把它们与仓库（store）的状态变化连起来。
 *
 * 所有 UI 都在 <ui-annotator-root> 的 shadow root 内，因此：
 *   - 宿主页面的 CSS 影响不到浮层
 *   - 浮层的 CSS 也不会污染宿主
 *   - 定位引擎通过 closest('ui-annotator-root') 一次性排除掉工具自身的节点
 */

import { captureTarget, elementAtRect } from '../core/locator.js';
import { h, icon, ICONS } from './dom.js';
import { Editor } from './editor.js';
import { ExportModal } from './modal.js';
import { MarkerLayer } from './markers.js';
import { Picker } from './picker.js';
import { Sidebar } from './sidebar.js';
import { OVERLAY_CSS } from './styles.js';

const HOST_TAG = 'ui-annotator-root';

export class Overlay {
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
    this.mode = options.mode === 'view' ? 'view' : 'edit';
    /** 重新指定元素时暂存的标注 id */
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
    // 宿主自身不占位、不拦事件，交由内部各层自行决定 pointer-events
    Object.assign(this.host.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483000',
      pointerEvents: 'none',
    });
    this.shadow = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    this.shadow.append(style);

    this.container = h('div', { style: { pointerEvents: 'none' } });
    this.shadow.append(this.container);

    this.toasts = h('div.toasts');
    this.shadow.append(this.toasts);
  }

  _buildParts() {
    this.picker = new Picker(this.shadow, {
      onPickElement: (el) => this._handlePicked(el),
      onPickRegion: (rect) => this._handleRegion(rect),
      onCancel: () => this._exitPickMode(),
    });

    this.markers = new MarkerLayer({
      onSelect: (id) => this.select(id),
      onEdit: (id) => this.edit(id),
      onResolved: (id, status, resolved) => this.store.setStatus(id, status, resolved),
    });
    this.markers.readOnly = this.mode === 'view';

    this.editor = new Editor({
      onSave: (id, values) => this._handleSave(id, values),
      onDelete: (id) => this.delete(id),
      onClose: () => this._draft = null,
      onRetarget: (id) => this._startRetarget(id),
    });

    this.sidebar = new Sidebar({
      onFocus: (id) => this.select(id, { scroll: true }),
      onEdit: (id) => this.edit(id),
      onDelete: (id) => this.delete(id),
      onRetarget: (id) => this._startRetarget(id),
      onExport: () => this.modal.show('config'),
      onImport: () => this.modal.show('import'),
    });

    this.modal = new ExportModal({
      getContent: this.options.getExportContent,
      onImport: (text, mode) => this.options.onImport?.(text, mode),
      toast: (message, type) => this.toast(message, type),
    });

    this.markers.mount(this.container);
    this.picker.mount(this.container);
    this.editor.mount(this.container);
    this.sidebar.mount(this.container);
    this.modal.mount(this.container);

    // 鼠标移到气泡上时不要立刻收起，方便复制内容
    this.markers.tooltip.addEventListener('pointerenter', () => this.markers.keepTooltip());
    this.markers.tooltip.addEventListener('pointerleave', () => this.markers._hideTooltipSoon());
  }

  _buildToolbar() {
    this.pickBtn = h('button.btn.ghost', {
      title: '选择元素标注 (E)',
      onclick: () => this.togglePick('element'),
    }, [icon(ICONS.cursor)]);

    this.regionBtn = h('button.btn.ghost', {
      title: '框选区域标注 (R)',
      onclick: () => this.togglePick('region'),
    }, [icon(ICONS.frame)]);

    this.listBtn = h('button.btn.ghost', {
      title: '标注清单 (S)',
      onclick: () => this.sidebar.toggle(),
    }, [icon(ICONS.list)]);

    this.eyeBtn = h('button.btn.ghost', {
      title: '显示/隐藏标记 (H)',
      onclick: () => this.toggleMarkers(),
    }, [icon(ICONS.eye)]);

    this.expandBtn = h('button.btn.ghost', {
      title: '展开/收起标注内容 (X)',
      onclick: () => this.toggleExpand(),
    }, [icon(ICONS.list)]);

    this.aiBtn = h('button.btn.ghost', {
      title: 'AI 生成标注：复制提示词',
      onclick: () => this.modal.show('prompt'),
    }, [icon(ICONS.sparkles)]);

    this.exportBtn = h('button.btn.ghost', {
      title: '导出配置 JSON',
      onclick: () => this.modal.show('config'),
    }, [icon(ICONS.code)]);

    this.countEl = h('span.count', { text: '0' });

    this.toolbar = h('div.toolbar', {}, [
      h('span.grip', { title: '拖动移动工具栏', text: '⋮⋮' }),
      this.pickBtn,
      this.regionBtn,
      h('span.sep'),
      this.countEl,
      this.listBtn,
      this.eyeBtn,
      this.expandBtn,
      h('span.sep'),
      this.aiBtn,
      this.exportBtn,
    ]);

    // 查看态不需要标注入口
    if (this.mode === 'view') {
      this.pickBtn.classList.add('hidden');
      this.regionBtn.classList.add('hidden');
      this.aiBtn.classList.add('hidden');
    }

    this.shadow.append(this.toolbar);
    this._makeToolbarDraggable();
  }

  _makeToolbarDraggable() {
    const grip = this.toolbar.querySelector('.grip');
    let origin = null;

    grip.addEventListener('pointerdown', (event) => {
      const rect = this.toolbar.getBoundingClientRect();
      origin = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      grip.setPointerCapture(event.pointerId);
    });
    grip.addEventListener('pointermove', (event) => {
      if (!origin) return;
      const left = origin.left + (event.clientX - origin.x);
      const top = origin.top + (event.clientY - origin.y);
      Object.assign(this.toolbar.style, {
        left: `${Math.max(4, Math.min(left, window.innerWidth - this.toolbar.offsetWidth - 4))}px`,
        top: `${Math.max(4, Math.min(top, window.innerHeight - this.toolbar.offsetHeight - 4))}px`,
        right: 'auto',
        bottom: 'auto',
      });
    });
    grip.addEventListener('pointerup', () => { origin = null; });
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
    window.removeEventListener('keydown', this._hotkeyHandler, true);
  }

  render() {
    const annotations = this.store.list();
    this.markers.render(annotations);
    this.sidebar.render(annotations);
    this.countEl.textContent = String(annotations.length);
  }

  _bindStore() {
    this.store.on('changed', () => this.render());
    this.store.on('loaded', () => this.render());
    this.store.on('save-error', (err) => this.toast(String(err.message || err), 'error'));
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
    this.pickBtn.classList.toggle('active', mode === 'element');
    this.regionBtn.classList.toggle('active', mode === 'region');
    this.toast(
      mode === 'element' ? '点击页面上任意元素进行标注，Esc 取消' : '拖动框选一个区域，Esc 取消'
    );
  }

  _exitPickMode() {
    this.picker.stop();
    this._retargetId = null;
    this.pickBtn.classList.remove('active');
    this.regionBtn.classList.remove('active');
  }

  toggleMarkers() {
    const next = !this.markers.visible;
    this.markers.setVisible(next);
    this.eyeBtn.classList.toggle('active', !next);
    this.toast(next ? '已显示标记' : '已隐藏标记');
  }

  toggleExpand() {
    const next = this.markers.toggleExpanded();
    this.expandBtn.classList.toggle('active', !next);
    this.toast(next ? '标注已展开' : '标注已收起');
  }

  /** 拾取到元素：可能是新增标注，也可能是给已有标注重新指定挂载点 */
  _handlePicked(el) {
    const target = captureTarget(el, { stampAnchor: this.options.stampAnchor });

    if (this._retargetId) {
      const id = this._retargetId;
      this._retargetId = null;
      this._exitPickMode();
      this.store.update(id, { target, status: 'active' });
      this.toast('已重新指定元素');
      this.select(id);
      return;
    }

    this._exitPickMode();
    this._draft = { type: 'element', target, category: 'note', seq: this.store.list().length + 1 };
    this.editor.show(
      { ...this._draft, title: '', body: '', businessLogic: {}, dataBinding: {}, tags: [], meta: {} },
      { isNew: true, anchorRect: el.getBoundingClientRect() }
    );
  }

  _handleRegion(rect) {
    this._exitPickMode();
    // 框选区域内如果正好覆盖某个元素，顺手采集它的画像作为语义参考
    const inner = elementAtRect(rect);
    const target = inner
      ? { ...captureTarget(inner), rect }
      : { strategies: [], rect, snapshot: {}, resolved: null };

    this._draft = { type: 'region', target, category: 'note' };
    this.editor.show(
      { ...this._draft, title: '', body: '', businessLogic: {}, dataBinding: {}, tags: [], meta: {} },
      {
        isNew: true,
        anchorRect: {
          left: rect.x - window.scrollX,
          top: rect.y - window.scrollY,
          right: rect.x - window.scrollX + rect.width,
          bottom: rect.y - window.scrollY + rect.height,
        },
      }
    );
  }

  _handleSave(id, values) {
    if (id) {
      this.store.update(id, values);
      this.toast('已保存');
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
    this.picker.start('element');
    this.pickBtn.classList.add('active');
    this.toast('点击要重新挂载的元素');
  }

  select(id, options = {}) {
    this.markers.select(id, options);
    this.sidebar.select(id);
  }

  edit(id) {
    if (this.mode === 'view') return;
    const annotation = this.store.find(id);
    if (!annotation) return;

    const entry = this.markers.entries.get(id);
    const rect = entry?.element?.isConnected ? entry.element.getBoundingClientRect() : null;
    this.editor.show(annotation, { anchorRect: rect });
  }

  delete(id) {
    const annotation = this.store.find(id);
    if (!annotation) return;
    // 有内容的标注删除前确认，避免误删
    const hasContent = annotation.title || annotation.body;
    if (hasContent && !window.confirm(`确认删除标注 #${annotation.seq}「${annotation.title || '未命名'}」？`)) {
      return;
    }
    this.store.remove(id);
    this.editor.close();
    this.toast('已删除');
  }

  /* ---------------------------------------------------------------- */
  /* 热键                                                             */
  /* ---------------------------------------------------------------- */

  _bindHotkeys() {
    this._hotkeyHandler = (event) => {
      // 用户正在宿主页面的输入框里打字时不抢热键
      const active = document.activeElement;
      const typing = active && (
        active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable
      );
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      // 浮层内部的输入已经在各自组件里 stopPropagation，这里只处理宿主页面上的按键
      if (this.editor.open || this.modal.open) return;

      switch (event.key.toLowerCase()) {
        case 'e':
          if (this.mode === 'edit') { event.preventDefault(); this.togglePick('element'); }
          break;
        case 'r':
          if (this.mode === 'edit') { event.preventDefault(); this.togglePick('region'); }
          break;
        case 's':
          event.preventDefault();
          this.sidebar.toggle();
          break;
        case 'h':
          event.preventDefault();
          this.toggleMarkers();
          break;
        case 'x':
          event.preventDefault();
          this.toggleExpand();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', this._hotkeyHandler, true);
  }

  /* ---------------------------------------------------------------- */

  toast(message, type = 'info') {
    const node = h(`div.toast${type !== 'info' ? `.${type}` : ''}`, { text: message });
    this.toasts.append(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transition = 'opacity .2s';
      setTimeout(() => node.remove(), 220);
    }, type === 'error' ? 4200 : 2000);
  }
}
