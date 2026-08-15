/**
 * 标注编辑面板。
 *
 * 表单刻意分成两层：上面是「标题 + 说明」的轻量输入（大多数标注只需要这两项），
 * 下面折叠起「业务逻辑」与「数据绑定」的结构化字段。这样既不给随手标注增加负担，
 * 又能在需要产出 AI design 配置时填出足够结构化的信息。
 */

import { CATEGORIES, categoryOf } from '../core/schema.js';
import { clamp, normalizeText } from '../core/utils.js';
import { h, icon, ICONS } from './dom.js';

export class Editor {
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
    this.panel = h('div.panel.hidden');
    this._buildSkeleton();
  }

  mount(container) {
    container.append(this.panel);
  }

  get open() {
    return !this.panel.classList.contains('hidden');
  }

  /* ---------------------------------------------------------------- */
  /* 骨架                                                             */
  /* ---------------------------------------------------------------- */

  _buildSkeleton() {
    this.titleEl = h('strong', { text: '新增标注' });
    this.body = h('div.body');

    const header = h('header', {}, [
      this.titleEl,
      h('button.btn.ghost', { title: '关闭 (Esc)', onclick: () => this.close() }, [icon(ICONS.close)]),
    ]);

    this.deleteBtn = h('button.btn.danger', {
      onclick: () => {
        if (this.annotation) this.handlers.onDelete?.(this.annotation.id);
      },
    }, [icon(ICONS.trash), '删除']);

    const footer = h('footer', {}, [
      this.deleteBtn,
      h('div.spacer'),
      h('button.btn', { onclick: () => this.close() }, ['取消']),
      h('button.btn.primary', { onclick: () => this._save() }, ['保存 (Ctrl+Enter)']),
    ]);

    this.panel.append(header, this.body, footer);
    this._makeDraggable(header);

    // Ctrl+Enter 保存、Esc 关闭；stopPropagation 避免热键泄漏到宿主页面
    this.panel.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this._save();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
      event.stopPropagation();
    });
  }

  /** 面板可拖动，避免遮挡正在标注的元素 */
  _makeDraggable(handle) {
    let origin = null;
    handle.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      const rect = this.panel.getBoundingClientRect();
      origin = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      handle.setPointerCapture(event.pointerId);
      handle.style.cursor = 'grabbing';
    });
    handle.addEventListener('pointermove', (event) => {
      if (!origin) return;
      const left = origin.left + (event.clientX - origin.x);
      const top = origin.top + (event.clientY - origin.y);
      this.panel.style.left = `${clamp(left, 0, window.innerWidth - 120)}px`;
      this.panel.style.top = `${clamp(top, 0, window.innerHeight - 60)}px`;
      this.panel.style.right = 'auto';
      this.panel.style.bottom = 'auto';
    });
    handle.addEventListener('pointerup', () => {
      origin = null;
      handle.style.cursor = 'grab';
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
    this.titleEl.textContent = this.isNew ? '新增标注' : `编辑标注 #${annotation.seq}`;
    this.deleteBtn.classList.toggle('hidden', this.isNew);

    this._renderForm(annotation);
    this.panel.classList.remove('hidden');
    this._placeNear(options.anchorRect);

    // 聚焦标题输入框，让标注者可以直接开始打字
    requestAnimationFrame(() => this.fields.title.focus());
  }

  close() {
    this.panel.classList.add('hidden');
    this.annotation = null;
    this.handlers.onClose?.();
  }

  _renderForm(annotation) {
    this.body.innerHTML = '';
    this.fields = {};

    this.body.append(this._targetInfo(annotation));
    this.body.append(this._categoryField(annotation));

    this.fields.title = this._input('标题', annotation.title, {
      placeholder: '一句话概括这个元素的作用，例如「提交订单按钮」',
    });
    this.body.append(this.fields.title.closest('.field'));

    this.fields.body = this._textarea('业务说明', annotation.body, {
      placeholder: '用业务语言说明这里发生了什么、为什么这样设计',
      rows: 4,
    });
    this.body.append(this.fields.body.closest('.field'));

    this.body.append(this._logicGroup(annotation.businessLogic));
    this.body.append(this._dataGroup(annotation.dataBinding));
    this.body.append(this._metaGroup(annotation));
  }

  /** 展示定位信息，让标注者确认挂载对象正确，并可重新指定 */
  _targetInfo(annotation) {
    const snapshot = annotation.target?.snapshot || {};
    const strategies = annotation.target?.strategies || [];
    const box = h('div.target-info');

    box.append(h('div', {}, [
      h('strong', { text: annotation.type === 'region' ? '区域标注' : '元素标注' }),
      h('span', { text: `  共 ${strategies.length} 条定位线索` }),
    ]));

    if (snapshot.tag) {
      box.append(h('div.row', {}, [h('span', { text: '元素' }), h('span', {}, [h('code', { text: `<${snapshot.tag}>` }), snapshot.role ? ` role=${snapshot.role}` : ''])]));
    }
    if (snapshot.componentPath?.length) {
      box.append(h('div.row', {}, [h('span', { text: '组件' }), h('span', { text: snapshot.componentPath.join(' › ') })]));
    }
    if (snapshot.text) {
      box.append(h('div.row', {}, [h('span', { text: '文案' }), h('span', { text: normalizeText(snapshot.text, 60) })]));
    }
    const primary = strategies[0];
    if (primary) {
      box.append(h('div.row', {}, [h('span', { text: '主线索' }), h('span', {}, [h('code', { text: `${primary.kind}: ${normalizeText(String(primary.value), 48)}` })])]));
    }

    if (!this.isNew) {
      box.append(h('div', { style: { marginTop: '6px' } }, [
        h('button.btn.ghost', {
          style: { fontSize: '11px', padding: '2px 6px' },
          onclick: () => this.handlers.onRetarget?.(annotation.id),
        }, [icon(ICONS.target, 12), '重新指定元素']),
      ]));
    }
    return box;
  }

  _categoryField(annotation) {
    const field = h('div.field', {}, [h('label', { text: '分类' })]);
    const group = h('div.cats');
    this._selectedCategory = annotation.category || 'note';

    for (const cat of CATEGORIES) {
      const btn = h('button', {
        type: 'button',
        'aria-pressed': String(cat.key === this._selectedCategory),
        text: cat.label,
        onclick: () => {
          this._selectedCategory = cat.key;
          // 单选，重置其它按钮
          for (const node of group.children) {
            const pressed = node === btn;
            node.setAttribute('aria-pressed', String(pressed));
            node.style.background = pressed ? categoryOf(cat.key).color : '';
          }
        },
      });
      if (cat.key === this._selectedCategory) btn.style.background = cat.color;
      group.append(btn);
    }
    field.append(group);
    return field;
  }

  /** 「业务逻辑」折叠组：这几项是给 AI 还原业务流程用的关键结构 */
  _logicGroup(logic = {}) {
    const filled = Object.values(logic).some((v) => (Array.isArray(v) ? v.length : v));
    const group = h('details.group', filled ? { open: true } : {});
    group.append(h('summary', { text: '业务逻辑（结构化，可选）' }));

    this.fields.trigger = this._input('触发条件', logic.trigger, { placeholder: '用户点击 / 页面加载 / 定时轮询' });
    this.fields.effect = this._input('核心行为', logic.effect, { placeholder: '校验表单并调用创建订单接口' });
    this.fields.preconditions = this._textarea('前置条件', join(logic.preconditions), { placeholder: '每行一条，例如：\n表单校验通过\n拥有 order:create 权限', rows: 2 });
    this.fields.postconditions = this._textarea('执行结果', join(logic.postconditions), { placeholder: '每行一条，例如：\n跳转订单详情页', rows: 2 });
    this.fields.rules = this._textarea('业务规则', join(logic.rules), { placeholder: '每行一条，例如：\n金额超过 5 万需二级审批', rows: 2 });
    this.fields.errorStates = this._textarea('异常与边界', join(logic.errorStates), { placeholder: '每行一条，例如：\n库存不足时提示并禁用按钮', rows: 2 });

    for (const key of ['trigger', 'effect', 'preconditions', 'postconditions', 'rules', 'errorStates']) {
      group.append(this.fields[key].closest('.field'));
    }
    return group;
  }

  /** 「数据绑定」折叠组：字段与接口用简单 DSL 录入，避免做复杂的子表格 */
  _dataGroup(binding = {}) {
    const filled = binding.fields?.length || binding.apis?.length || binding.stateKeys?.length;
    const group = h('details.group', filled ? { open: true } : {});
    group.append(h('summary', { text: '数据与接口（可选）' }));

    this.fields.fields = this._textarea('字段', fieldsToText(binding.fields), {
      placeholder: '每行一个：名称|标签|类型|必填|校验说明\n例：amount|订单金额|number|必填|大于 0',
      rows: 3,
    });
    this.fields.fields.closest('.field').append(
      h('div.help', { text: '格式：名称|标签|类型|必填|校验说明（用 | 分隔，缺省留空）' })
    );

    this.fields.apis = this._textarea('接口', apisToText(binding.apis), {
      placeholder: '每行一个：METHOD 路径 说明\n例：POST /api/orders 创建订单',
      rows: 2,
    });

    this.fields.stateKeys = this._input('状态字段', join(binding.stateKeys, ', '), {
      placeholder: 'store 中的状态键，逗号分隔',
    });

    for (const key of ['fields', 'apis', 'stateKeys']) {
      group.append(this.fields[key].closest('.field'));
    }
    return group;
  }

  _metaGroup(annotation) {
    const group = h('details.group');
    group.append(h('summary', { text: '标签与关联（可选）' }));

    this.fields.tags = this._input('标签', join(annotation.tags, ', '), { placeholder: '逗号分隔，如：核心流程, 需产品确认' });
    group.append(this.fields.tags.closest('.field'));

    // AI 生成的标注需要人工确认，这里给一个显式勾选
    if (annotation.meta?.source === 'ai') {
      const wrap = h('div.field');
      this.fields.reviewed = h('input', { type: 'checkbox', ...(annotation.meta.reviewed ? { checked: true } : {}) });
      wrap.append(h('label', {}, [
        this.fields.reviewed,
        h('span', { text: ` 已人工复核（AI 生成，置信度 ${annotation.meta.aiConfidence ?? '未知'}）` }),
      ]));
      group.append(wrap);
    }
    return group;
  }

  /* ---------------------------------------------------------------- */

  // 返回控件本身（便于读写 value），包装层已成为它的父节点，
  // 调用方用 input.closest('.field') 取回整块再插入 DOM。
  _input(label, value, attrs = {}) {
    const input = h('input', { type: 'text', value: value || '', ...attrs });
    h('div.field', {}, [h('label', { text: label }), input]);
    return input;
  }

  _textarea(label, value, attrs = {}) {
    const area = h('textarea', attrs);
    // textarea 的初始内容不能靠 value 属性，必须赋 property
    area.value = value || '';
    h('div.field', {}, [h('label', { text: label }), area]);
    return area;
  }

  /** 尽量把面板放在被标注元素旁边，但不越出视口 */
  _placeNear(anchorRect) {
    const width = 380;
    const height = Math.min(window.innerHeight * 0.78, 680);

    if (!anchorRect) {
      this.panel.style.left = `${Math.max(12, window.innerWidth - width - 24)}px`;
      this.panel.style.top = '72px';
      return;
    }
    let left = anchorRect.right + 16;
    if (left + width > window.innerWidth - 12) left = Math.max(12, anchorRect.left - width - 16);
    if (left < 12) left = 12;
    const top = clamp(anchorRect.top, 12, Math.max(12, window.innerHeight - height - 12));

    this.panel.style.left = `${left}px`;
    this.panel.style.top = `${top}px`;
    this.panel.style.right = 'auto';
    this.panel.style.bottom = 'auto';
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
        errorStates: splitLines(f.errorStates.value),
      },
      dataBinding: {
        fields: textToFields(f.fields.value),
        apis: textToApis(f.apis.value),
        stateKeys: splitList(f.stateKeys.value),
      },
      meta: f.reviewed ? { reviewed: f.reviewed.checked } : undefined,
    };
  }

  _save() {
    if (!this.annotation) return;
    const values = this._collect();
    if (!values.title && !values.body) {
      this.fields.title.focus();
      this.fields.title.style.borderColor = '#dc2626';
      return;
    }
    this.handlers.onSave?.(this.isNew ? null : this.annotation.id, values);
  }
}

/* ------------------------------------------------------------------ */
/* 文本 <-> 结构 互转                                                  */
/* ------------------------------------------------------------------ */

function join(list, separator = '\n') {
  return Array.isArray(list) ? list.join(separator) : (list || '');
}

function splitLines(text) {
  return String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

function splitList(text) {
  return String(text || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean);
}

/** 名称|标签|类型|必填|校验 */
function fieldsToText(fields) {
  if (!Array.isArray(fields)) return '';
  return fields
    .map((f) => [f.name, f.label, f.type, f.required ? '必填' : '', f.validation].join('|').replace(/\|+$/, ''))
    .join('\n');
}

function textToFields(text) {
  return splitLines(text).map((line) => {
    const [name, label, type, required, validation] = line.split('|').map((s) => (s || '').trim());
    return {
      name,
      label,
      type,
      required: /必填|required|true|y/i.test(required || ''),
      validation,
    };
  }).filter((f) => f.name || f.label);
}

/** METHOD 路径 说明 */
function apisToText(apis) {
  if (!Array.isArray(apis)) return '';
  return apis.map((a) => [a.method, a.path, a.purpose].filter(Boolean).join(' ')).join('\n');
}

function textToApis(text) {
  return splitLines(text).map((line) => {
    const match = line.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)\s*(.*)$/i);
    if (match) {
      return { method: match[1].toUpperCase(), path: match[2], purpose: match[3].trim() };
    }
    // 没写方法时默认 GET，第一段当路径
    const [path, ...rest] = line.split(/\s+/);
    return { method: 'GET', path, purpose: rest.join(' ') };
  }).filter((a) => a.path);
}
