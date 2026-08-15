/**
 * 导出/导入对话框。
 *
 * 四个标签页对应四种用途：
 *   配置 JSON   —— 最终交付物，AI design 消费的那份数据
 *   AI 上下文   —— 页面语义骨架，喂给模型的输入
 *   提示词      —— 上下文 + 指令拼好的完整 prompt，可直接粘到对话框
 *   导入        —— 把 AI 或同事产出的 JSON 灌回工具校验并渲染
 *
 * 静态 HTML 场景下这个对话框是主要的数据出入口，所以复制与下载都要能用。
 */

import { h, icon, ICONS } from './dom.js';

const TABS = [
  { key: 'config', label: '配置 JSON' },
  { key: 'context', label: 'AI 上下文' },
  { key: 'prompt', label: '提示词' },
  { key: 'import', label: '导入' },
];

export class ExportModal {
  /**
   * @param {object} handlers
   * @param {(tab: string) => string} handlers.getContent  取各标签页要展示的文本
   * @param {(text: string, mode: string) => void} handlers.onImport
   * @param {(message: string, type?: string) => void} handlers.toast
   */
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.tab = 'config';
    this.mask = h('div.modal-mask.hidden', {
      onclick: (event) => {
        // 只有点遮罩本身才关闭，点内容区不关
        if (event.target === this.mask) this.close();
      },
    });
    this._build();
  }

  mount(container) {
    container.append(this.mask);
  }

  get open() {
    return !this.mask.classList.contains('hidden');
  }

  _build() {
    this.tabsEl = h('div.tabs');
    for (const tab of TABS) {
      this.tabsEl.append(h('button', {
        'aria-selected': String(tab.key === this.tab),
        text: tab.label,
        onclick: () => this.show(tab.key),
      }));
    }

    this.textarea = h('textarea', { spellcheck: 'false' });
    this.noteEl = h('span.note');

    this.importModeSelect = h('select', {
      style: { padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--anno-border)' },
    }, [
      h('option', { value: 'replace', text: '替换当前全部标注' }),
      h('option', { value: 'merge', text: '合并到当前标注' }),
    ]);

    this.importBtn = h('button.btn.primary.hidden', {
      onclick: () => {
        this.handlers.onImport?.(this.textarea.value, this.importModeSelect.value);
      },
    }, [icon(ICONS.upload), '执行导入']);

    this.fileBtn = h('button.btn.hidden', { onclick: () => this._pickFile() }, [icon(ICONS.upload), '选择 JSON 文件']);
    this.copyBtn = h('button.btn', { onclick: () => this._copy() }, [icon(ICONS.copy), '复制']);
    this.downloadBtn = h('button.btn', { onclick: () => this._download() }, [icon(ICONS.download), '下载']);

    this.titleEl = h('strong', { text: '导出标注配置' });

    const modal = h('div.modal', {}, [
      h('header', {}, [
        this.titleEl,
        h('button.btn.ghost', { onclick: () => this.close() }, [icon(ICONS.close)]),
      ]),
      this.tabsEl,
      h('div.body', {}, [this.textarea]),
      h('footer', {}, [
        this.importModeSelect,
        this.fileBtn,
        this.noteEl,
        h('div.spacer'),
        this.copyBtn,
        this.downloadBtn,
        this.importBtn,
        h('button.btn', { onclick: () => this.close() }, ['关闭']),
      ]),
    ]);

    this.mask.append(modal);
    this.mask.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.close();
      event.stopPropagation();
    });
  }

  /* ---------------------------------------------------------------- */

  show(tab = 'config') {
    this.tab = tab;
    this.mask.classList.remove('hidden');

    for (let i = 0; i < TABS.length; i += 1) {
      this.tabsEl.children[i].setAttribute('aria-selected', String(TABS[i].key === tab));
    }

    const isImport = tab === 'import';
    this.importBtn.classList.toggle('hidden', !isImport);
    this.fileBtn.classList.toggle('hidden', !isImport);
    this.importModeSelect.classList.toggle('hidden', !isImport);
    this.copyBtn.classList.toggle('hidden', isImport);
    this.downloadBtn.classList.toggle('hidden', isImport);

    this.titleEl.textContent = isImport ? '导入标注配置' : '导出标注配置';
    this.textarea.readOnly = false; // 允许手改后再复制
    this.textarea.placeholder = isImport
      ? '粘贴 AI 生成或同事导出的标注 JSON，然后点「执行导入」'
      : '';

    this.textarea.value = isImport ? '' : (this.handlers.getContent?.(tab) || '');
    this.noteEl.textContent = {
      config: '这份 JSON 就是 AI design 要消费的配置数据',
      context: '页面语义骨架，元素通过 ref 引用',
      prompt: '整段复制到 AI 对话框，把返回的 JSON 粘回「导入」页',
      import: '',
    }[tab] || '';

    requestAnimationFrame(() => this.textarea.focus());
  }

  close() {
    this.mask.classList.add('hidden');
  }

  /* ---------------------------------------------------------------- */

  async _copy() {
    const text = this.textarea.value;
    try {
      // clipboard API 在 file:// 与非安全上下文下不可用，需要降级
      await navigator.clipboard.writeText(text);
      this.handlers.toast?.('已复制到剪贴板');
    } catch {
      this.textarea.select();
      const ok = document.execCommand?.('copy');
      this.handlers.toast?.(
        ok ? '已复制到剪贴板' : '当前环境禁止自动复制，请手动 Ctrl+C',
        ok ? 'info' : 'warn'
      );
    }
  }

  _download() {
    const isJson = this.tab !== 'prompt';
    const name = {
      config: 'ui-annotations.config.json',
      context: 'ui-annotations.context.json',
      prompt: 'ui-annotations.prompt.md',
    }[this.tab] || 'ui-annotations.txt';

    const blob = new Blob([this.textarea.value], {
      type: isJson ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: name });
    link.click();
    // 立刻 revoke 会让部分浏览器下载失败，延后释放
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.handlers.toast?.(`已下载 ${name}`);
  }

  /** file:// 下无法 fetch 本地文件，用 file input 读取是唯一可靠方式 */
  _pickFile() {
    const input = h('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        this.textarea.value = String(reader.result || '');
        this.handlers.toast?.(`已读取 ${file.name}，确认后点「执行导入」`);
      };
      reader.onerror = () => this.handlers.toast?.('读取文件失败', 'error');
      reader.readAsText(file, 'utf-8');
    });
    input.click();
  }
}
