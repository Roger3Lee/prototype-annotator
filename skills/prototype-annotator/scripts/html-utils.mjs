/**
 * inject.mjs / publish.mjs 共用的 HTML 改写工具。
 *
 * 这里刻意不引 DOM 解析库：注入点只有 </body> 前一处，用正则精确定位
 * 比把整个页面 parse 再序列化安全 —— 后者会顺手"规整"掉手写页面里的
 * 格式、自闭合写法和注释，diff 一片红。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { relative, dirname, resolve, join, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 注入块的起止标记，用于幂等替换 */
export const MARK_BEGIN = '<!-- ui-annotator:begin -->';
export const MARK_END = '<!-- ui-annotator:end -->';

export function readText(file) {
  return readFileSync(file, 'utf8');
}

export function writeText(file, text) {
  writeFileSync(file, text, 'utf8');
}

/** 保留原文件的换行风格，避免注入后整个文件被标记为改动 */
export function newlineOf(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/** 取 </body> 前的缩进，让注入的代码块跟周围对齐 */
export function indentOf(text) {
  const m = text.match(/(^|\n)([ \t]*)<\/body>/i);
  return m ? m[2] : '';
}

/**
 * 把标记块插入 </body> 之前；已存在则整块替换。
 * 没有 </body>（片段页面）时追加到末尾。
 */
export function upsertBlock(html, lines) {
  const nl = newlineOf(html);
  const pad = indentOf(html);
  const block = [MARK_BEGIN, ...lines, MARK_END].map((l) => pad + l).join(nl);

  const existing = new RegExp(
    `[ \\t]*${escapeRe(MARK_BEGIN)}[\\s\\S]*?${escapeRe(MARK_END)}`,
    'i',
  );
  if (existing.test(html)) return html.replace(existing, block);

  const bodyEnd = /([ \t]*)<\/body>/i;
  if (bodyEnd.test(html)) return html.replace(bodyEnd, `${block}${nl}$1</body>`);
  return html.replace(/\s*$/, '') + nl + block + nl;
}

/** 移除注入块，连同它占的那一行空白 */
export function removeBlock(html) {
  const existing = new RegExp(
    `\\n?[ \\t]*${escapeRe(MARK_BEGIN)}[\\s\\S]*?${escapeRe(MARK_END)}[ \\t]*`,
    'i',
  );
  return existing.test(html) ? html.replace(existing, '') : null;
}

/** 从 HTML 文件位置算出指向目标文件的相对 src，统一用正斜杠 */
export function relSrc(htmlFile, targetFile) {
  const rel = relative(dirname(htmlFile), targetFile).split(sep).join(posix.sep);
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/** HTML 属性值转义，防止项目名里的引号把标签截断 */
export function attr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 极简参数解析：--key value / --flag / 位置参数。
 * @param {string[]} argv
 * @param {string[]} flags 不带值的开关名
 */
export function parseArgs(argv, flags = []) {
  const opts = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('-')) {
      rest.push(token);
      continue;
    }
    const key = token.replace(/^--?/, '');
    if (flags.includes(key)) opts[key] = true;
    else opts[key] = argv[++i];
  }
  return { opts, rest };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** skill 目录（zip 解开后就是它）与仓库根，两种场景都要能跑 */
export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = resolve(SKILL_DIR, '../..');

/**
 * 找运行时产物。优先用 skill 自带的 assets/，让 zip 解开后开箱可用；
 * 找不到再回落到仓库 dist/，方便在仓库里边改边试。
 */
export function findBundle(name) {
  for (const dir of [join(SKILL_DIR, 'assets'), join(REPO_ROOT, 'dist')]) {
    const file = join(dir, name);
    if (existsSync(file)) return file;
  }
  return null;
}

/** 展示用的短路径，相对当前工作目录 */
export function shortPath(file) {
  const rel = relative(process.cwd(), file);
  return rel.startsWith('..') ? file : rel.split(sep).join(posix.sep);
}