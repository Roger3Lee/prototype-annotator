/**
 * 拾取器：负责「元素模式」与「区域模式」两种标注目标的选取。
 *
 * 元素模式借一层透明 blocker 接管鼠标事件，这样即便宿主页面在元素上绑了
 * click（比如按钮会提交表单），标注时也不会误触发它的业务逻辑。
 */

import { componentLabel } from '../core/framework.js';
import { clamp, normalizeText, throttleRaf } from '../core/utils.js';
import { h } from './dom.js';

export class Picker {
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
    this.mode = null; // 'element' | 'region' | null

    this.layer = h('div.layer');
    this.highlight = h('div.highlight.hidden');
    this.hint = h('div.hint.hidden');
    this.rubber = h('div.rubber.hidden');
    this.layer.append(this.highlight, this.hint, this.rubber);

    // blocker 覆盖全屏，承接所有指针事件
    this.blocker = h('div.pick-blocker.hidden');

    this._hovered = null;
    this._dragStart = null;

    this._onMove = throttleRaf((event) => this._handleMove(event));
    this._onDown = (event) => this._handleDown(event);
    this._onUp = (event) => this._handleUp(event);
    this._onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.stop();
        this.handlers.onCancel?.();
      }
    };
    // 滚动/缩放后高亮框需要跟着元素走
    this._onScroll = throttleRaf(() => {
      if (this.mode === 'element' && this._hovered) this._drawHighlight(this._hovered);
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
    this.blocker.classList.remove('hidden');
    this.blocker.style.cursor = mode === 'region' ? 'crosshair' : 'copy';

    this.blocker.addEventListener('pointermove', this._onMove);
    this.blocker.addEventListener('pointerdown', this._onDown);
    this.blocker.addEventListener('pointerup', this._onUp);
    window.addEventListener('keydown', this._onKey, true);
    window.addEventListener('scroll', this._onScroll, true);
    window.addEventListener('resize', this._onScroll);
  }

  stop() {
    if (!this.mode) return;
    this.mode = null;
    this._hovered = null;
    this._dragStart = null;

    this.blocker.classList.add('hidden');
    this.highlight.classList.add('hidden');
    this.hint.classList.add('hidden');
    this.rubber.classList.add('hidden');

    this.blocker.removeEventListener('pointermove', this._onMove);
    this.blocker.removeEventListener('pointerdown', this._onDown);
    this.blocker.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('scroll', this._onScroll, true);
    window.removeEventListener('resize', this._onScroll);
  }

  /* ---------------------------------------------------------------- */

  /** 穿过 blocker 找到它底下宿主页面的真实元素 */
  _elementUnder(x, y) {
    this.blocker.style.pointerEvents = 'none';
    const el = document.elementFromPoint(x, y);
    this.blocker.style.pointerEvents = 'auto';
    // 不允许选中 html/body 这种整页节点，也不允许选中标注工具自己
    if (!el || el === document.body || el === document.documentElement) return null;
    if (el.closest('ui-annotator-root')) return null;
    return el;
  }

  _handleMove(event) {
    if (!this.mode) return;

    if (this.mode === 'region') {
      if (this._dragStart) this._drawRubber(event.clientX, event.clientY);
      else this._showHint(event.clientX, event.clientY, '拖动鼠标框选一个区域');
      return;
    }

    const el = this._elementUnder(event.clientX, event.clientY);
    if (!el || el === this._hovered) return;
    this._hovered = el;
    this._drawHighlight(el);
    this._showElementHint(el);
  }

  _handleDown(event) {
    if (this.mode !== 'region') return;
    event.preventDefault();
    this._dragStart = { x: event.clientX, y: event.clientY };
    this.hint.classList.add('hidden');
  }

  _handleUp(event) {
    if (!this.mode) return;
    event.preventDefault();
    event.stopPropagation();

    if (this.mode === 'element') {
      const el = this._elementUnder(event.clientX, event.clientY);
      if (el) {
        this.stop();
        this.handlers.onPickElement?.(el);
      }
      return;
    }

    // region
    const start = this._dragStart;
    this._dragStart = null;
    if (!start) return;

    const x = Math.min(start.x, event.clientX);
    const y = Math.min(start.y, event.clientY);
    const width = Math.abs(event.clientX - start.x);
    const height = Math.abs(event.clientY - start.y);
    this.stop();

    // 太小的框大概率是误点，按取消处理
    if (width < 8 || height < 8) {
      this.handlers.onCancel?.();
      return;
    }
    this.handlers.onPickRegion?.({
      x: x + window.scrollX,
      y: y + window.scrollY,
      width,
      height,
      relativeTo: 'document',
    });
  }

  /* ---------------------------------------------------------------- */

  _drawHighlight(el) {
    const rect = el.getBoundingClientRect();
    Object.assign(this.highlight.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    this.highlight.classList.remove('hidden');
  }

  _drawRubber(x, y) {
    const start = this._dragStart;
    Object.assign(this.rubber.style, {
      left: `${Math.min(start.x, x)}px`,
      top: `${Math.min(start.y, y)}px`,
      width: `${Math.abs(x - start.x)}px`,
      height: `${Math.abs(y - start.y)}px`,
    });
    this.rubber.classList.remove('hidden');
  }

  /** 悬浮提示：标签 + 组件名 + 尺寸，帮标注者确认选中的是不是想要的层级 */
  _showElementHint(el) {
    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const component = componentLabel(el);
    const text = normalizeText(el.textContent, 28);

    this.hint.innerHTML = '';
    this.hint.append(
      h('span', { html: `<b>${tag}</b>` }),
      component ? h('span', { text: `  ${component}` }) : '',
      text ? h('span', { class: 'dim', text: `  “${text}”` }) : '',
      h('span', { class: 'dim', text: `  ${Math.round(rect.width)}×${Math.round(rect.height)}` })
    );
    this._positionHint(rect.left, rect.top - 24 < 4 ? rect.bottom + 6 : rect.top - 24);
  }

  _showHint(x, y, message) {
    this.hint.textContent = message;
    this._positionHint(x + 12, y + 16);
  }

  _positionHint(left, top) {
    this.hint.classList.remove('hidden');
    const width = this.hint.offsetWidth || 200;
    Object.assign(this.hint.style, {
      left: `${clamp(left, 4, window.innerWidth - width - 4)}px`,
      top: `${clamp(top, 4, window.innerHeight - 28)}px`,
    });
  }
}
