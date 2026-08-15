#!/usr/bin/env node
/**
 * 校验 AI 产出的标注 JSON，导入前的质量闸门。
 *
 * 有 error 时退出码 1。warning 不阻塞，但值得看一眼。
 * 这里的规则跟 src/core/schema.js 的 validateConfig 对齐，
 * 额外多查了「ref 是否真实存在」和「是不是把选择器当 ref 写了」——
 * 这两类错误在浏览器里只会表现为「N 条被跳过」，很难定位。
 */

import { existsSync } from 'node:fs';
import { readText, parseArgs } from './html-utils.mjs';

const USAGE = `用法:
  node skills/prototype-annotator/scripts/validate.mjs <ai-output.json> [--context <context.json>]

参数:
  <ai-output.json>   AI 产出的 JSON，也可以是完整配置（含 pages）
  --context <文件>    AI 上下文 JSON，给了才能校验 ref 是否真实存在
  --max <n>          标注条数上限，默认 25`;

const CATEGORY_KEYS = [
  'business-rule', 'data-source', 'interaction', 'validation',
  'permission', 'state', 'todo', 'note',
];
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const LIST_FIELDS = ['preconditions', 'postconditions', 'rules', 'errorStates'];

const { opts, rest } = parseArgs(process.argv.slice(2), ['help']);
if (opts.help || rest.length !== 1) {
  console.log(USAGE);
  process.exit(rest.length === 1 ? 0 : 1);
}

const errors = [];
const warnings = [];

const raw = loadJson(rest[0]);
const knownRefs = opts.context ? collectRefs(loadJson(opts.context)) : null;
if (opts.context && !knownRefs.size) {
  warnings.push('上下文里没找到任何 ref，请确认给的是「AI 上下文 JSON」而不是配置文件');
}

if (Array.isArray(raw.pages)) checkConfig(raw);
else checkAiOutput(raw);

report();

/* ------------------------------------------------------------------ */
/* AI ref 形态                                                        */
/* ------------------------------------------------------------------ */

function checkAiOutput(doc) {
  if (!Array.isArray(doc.annotations)) {
    errors.push('缺少 annotations 数组（若这是完整配置，应有 pages 数组）');
    return;
  }
  const max = Number(opts.max || 25);
  if (doc.annotations.length > max) {
    warnings.push(`共 ${doc.annotations.length} 条，超过建议上限 ${max} 条，考虑只保留业务骨架`);
  }
  if (!doc.annotations.length) warnings.push('annotations 是空数组');

  // 校对模式检测：部分条目有 id 而部分没有，说明可能是 refine 模式漏写了 id
  const withId = doc.annotations.filter(a => str(a?.id));
  if (withId.length > 0 && withId.length < doc.annotations.length) {
    warnings.push(
      `${withId.length} / ${doc.annotations.length} 条有 id，其余缺少 id。` +
      '若为校对模式（refine），缺 id 的条目导入时会创建新条目而非更新原有标注，请补全 id。'
    );
  }

  const seen = new Map();
  doc.annotations.forEach((anno, i) => {
    const at = `annotations[${i}]`;
    if (!anno || typeof anno !== 'object') {
      errors.push(`${at} 不是对象`);
      return;
    }

    const ref = anno.ref;
    if (typeof ref !== 'string' || !ref.trim()) {
      errors.push(`${at} 缺少 ref`);
    } else if (/[#.>\[\]\s/:]/.test(ref)) {
      errors.push(`${at}.ref「${ref}」看起来是选择器而不是 ref，应形如 e12`);
    } else if (!/^e\d+$/.test(ref)) {
      warnings.push(`${at}.ref「${ref}」不是 e<数字> 形式，确认是上下文里的 ref`);
    } else if (knownRefs && !knownRefs.has(ref)) {
      errors.push(`${at}.ref「${ref}」不在上下文中，导入时会被跳过`);
    }
    if (typeof ref === 'string' && ref) {
      if (seen.has(ref)) warnings.push(`${at}.ref「${ref}」与 annotations[${seen.get(ref)}] 重复`);
      else seen.set(ref, i);
    }

    if (!str(anno.title)) errors.push(`${at} 缺少 title`);
    if (!str(anno.body)) errors.push(`${at} 缺少 body`);
    if (str(anno.title) && str(anno.title) === str(anno.body)) {
      warnings.push(`${at} 的 title 与 body 完全相同，body 没有信息增量`);
    }

    if (!anno.category) {
      errors.push(`${at} 缺少 category`);
    } else if (!CATEGORY_KEYS.includes(anno.category)) {
      errors.push(`${at}.category「${anno.category}」非法，只能用: ${CATEGORY_KEYS.join(' / ')}`);
    }

    if (anno.confidence != null) {
      const n = Number(anno.confidence);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        warnings.push(`${at}.confidence 应是 0~1 的数字，当前「${anno.confidence}」`);
      }
    }
    if (anno.tags != null && !Array.isArray(anno.tags)) warnings.push(`${at}.tags 应是数组`);

    checkBusinessLogic(anno.businessLogic, `${at}.businessLogic`);
    checkDataBinding(anno.dataBinding, `${at}.dataBinding`);
  });

  if (doc.pageSummary != null && !str(doc.pageSummary)) warnings.push('pageSummary 应是字符串');
  if (doc.glossary != null) {
    if (!Array.isArray(doc.glossary)) {
      warnings.push('glossary 应是 [{term, definition}] 数组');
    } else {
      doc.glossary.forEach((g, i) => {
        if (!str(g?.term)) warnings.push(`glossary[${i}] 缺少 term`);
        if (!str(g?.definition)) warnings.push(`glossary[${i}]「${g?.term}」缺少 definition`);
      });
    }
  }
}

function checkBusinessLogic(bl, at) {
  if (bl == null) return;
  if (typeof bl !== 'object' || Array.isArray(bl)) {
    warnings.push(`${at} 应是对象`);
    return;
  }
  for (const key of LIST_FIELDS) {
    if (bl[key] != null && !Array.isArray(bl[key])) {
      // schema 会按换行拆开兜住，但拆得对不对是碰运气
      warnings.push(`${at}.${key} 应是字符串数组，当前是 ${typeof bl[key]}，导入时会按换行硬拆`);
    }
  }
  for (const key of ['trigger', 'effect']) {
    if (bl[key] != null && typeof bl[key] !== 'string') warnings.push(`${at}.${key} 应是字符串`);
  }
}

function checkDataBinding(db, at) {
  if (db == null) return;
  if (typeof db !== 'object' || Array.isArray(db)) {
    warnings.push(`${at} 应是对象`);
    return;
  }
  if (db.fields != null && !Array.isArray(db.fields)) warnings.push(`${at}.fields 应是数组`);
  else for (const [i, f] of (db.fields || []).entries()) {
    if (!str(f?.name) && !str(f?.label)) warnings.push(`${at}.fields[${i}] 既没有 name 也没有 label`);
  }
  if (db.apis != null && !Array.isArray(db.apis)) warnings.push(`${at}.apis 应是数组`);
  else for (const [i, a] of (db.apis || []).entries()) {
    if (!str(a?.path)) warnings.push(`${at}.apis[${i}] 缺少 path`);
    const m = str(a?.method).toUpperCase();
    if (m && !METHODS.includes(m)) warnings.push(`${at}.apis[${i}].method「${a.method}」不是常见 HTTP 方法`);
    if (!str(a?.purpose)) warnings.push(`${at}.apis[${i}] 缺少 purpose，下游无法判断业务用途`);
  }
  if (db.stateKeys != null && !Array.isArray(db.stateKeys)) warnings.push(`${at}.stateKeys 应是数组`);
}

/* ------------------------------------------------------------------ */
/* 完整配置形态                                                        */
/* ------------------------------------------------------------------ */

function checkConfig(doc) {
  if (doc.$schema && doc.$schema !== 'ui-annotator/annotation-config') {
    warnings.push(`未知的 $schema「${doc.$schema}」`);
  }
  const ids = new Set();
  let total = 0;
  doc.pages.forEach((page, pi) => {
    if (!str(page?.url)) warnings.push(`pages[${pi}] 缺少 url，回放时无法匹配页面`);
    if (!str(page?.urlPattern)) warnings.push(`pages[${pi}] 缺少 urlPattern`);
    const list = Array.isArray(page?.annotations) ? page.annotations : [];
    total += list.length;
    list.forEach((anno, ai) => {
      const at = `pages[${pi}].annotations[${ai}]`;
      if (!str(anno?.title) && !str(anno?.body)) warnings.push(`${at} 是一条空标注`);
      if (str(anno?.id)) {
        if (ids.has(anno.id)) errors.push(`${at} 的 id「${anno.id}」重复`);
        ids.add(anno.id);
      } else {
        warnings.push(`${at} 缺少 id，导入时会重新生成`);
      }
      if (anno?.category && !CATEGORY_KEYS.includes(anno.category)) {
        warnings.push(`${at}.category「${anno.category}」非法，导入时回退为 note`);
      }
      const strategies = Array.isArray(anno?.target?.strategies)
        ? anno.target.strategies.filter((s) => s?.kind) : [];
      if (!strategies.length && !anno?.target?.rect) {
        errors.push(`${at} 既无定位策略也无坐标，无法定位到界面元素`);
      }
      checkBusinessLogic(anno?.businessLogic, `${at}.businessLogic`);
      checkDataBinding(anno?.dataBinding, `${at}.dataBinding`);
    });
  });
  console.log(`配置形态：${doc.pages.length} 个页面，共 ${total} 条标注`);
}

/* ------------------------------------------------------------------ */

/** 深走一遍上下文，把所有 ref 收集起来，不依赖各 section 的具体形状 */
function collectRefs(node, out = new Set()) {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, out);
  } else if (node && typeof node === 'object') {
    if (typeof node.ref === 'string') out.add(node.ref);
    for (const [key, value] of Object.entries(node)) {
      // refHints 是 { e12: {...} } 形态，键本身就是 ref
      if (key === 'refHints' && value && typeof value === 'object' && !Array.isArray(value)) {
        for (const k of Object.keys(value)) out.add(k);
      }
      collectRefs(value, out);
    }
  }
  return out;
}

/** AI 回复常带 ``` 围栏或前后寒暄，这里跟运行时的宽松解析保持一致 */
function loadJson(file) {
  if (!existsSync(file)) {
    console.error(`找不到文件: ${file}`);
    process.exit(1);
  }
  const text = readText(file).trim();
  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.unshift(fenced[1]);
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch { /* 试下一种 */ }
  }
  console.error(`${file} 无法解析为 JSON 对象`);
  process.exit(1);
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function report() {
  for (const w of warnings) console.log(`  warn  ${w}`);
  for (const e of errors) console.error(` error  ${e}`);

  if (errors.length) {
    console.error(`\n✗ ${errors.length} 个错误、${warnings.length} 个警告 —— 修完再导入`);
    process.exit(1);
  }
  console.log(warnings.length
    ? `\n✓ 校验通过，另有 ${warnings.length} 个警告可以看一下`
    : '\n✓ 校验通过');
}
