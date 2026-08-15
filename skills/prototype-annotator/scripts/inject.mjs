#!/usr/bin/env node
/**
 * 把 ui-annotator 注入 HTML 页面。
 *
 * 幂等：靠 <!-- ui-annotator:begin --> 标记整块替换，重复跑只会更新参数。
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import {
  readText, writeText, upsertBlock, removeBlock, relSrc, attr, parseArgs,
  findBundle, shortPath,
} from './html-utils.mjs';

const USAGE = `用法:
  node scripts/inject.mjs <html...> [选项]

选项:
  --project <名>       项目名，默认取页面 <title>
  --author  <名>       标注人，写入审计流水
  --domain  <业务域>    注入 AI 提示词
  --mode    edit|view  默认 edit
  --storage <适配器>    local|memory|inline|http，默认 local
  --src     <路径>      脚本地址，默认相对指向 skill 自带的 assets/ui-annotator.umd.js
  --min                用压缩版
  --remove             撤掉注入

示例:
  node scripts/inject.mjs <页面目录>/*.html --project "订单管理平台"`;

const { opts, rest } = parseArgs(process.argv.slice(2), ['remove', 'min', 'help']);

if (opts.help || !rest.length) {
  console.log(USAGE);
  process.exit(rest.length ? 0 : 1);
}

const files = expand(rest);
if (!files.length) {
  console.error('没有匹配到 HTML 文件');
  process.exit(1);
}

const bundle = opts.min ? 'ui-annotator.umd.min.js' : 'ui-annotator.umd.js';
const bundlePath = opts.src ? null : findBundle(bundle);
if (!opts.src && !bundlePath) {
  console.error(`找不到 ${bundle}，它应该在 skill 的 assets/ 下（或用 --src 指定地址）`);
  process.exit(1);
}
let changed = 0;
for (const file of files) {
  const html = readText(file);

  if (opts.remove) {
    const next = removeBlock(html);
    if (next == null) {
      console.log(`- ${shortPath(file)} 未注入过，跳过`);
      continue;
    }
    writeText(file, next);
    changed += 1;
    console.log(`✓ ${shortPath(file)} 已撤销注入`);
    continue;
  }

  const src = opts.src || relSrc(file, bundlePath);
  const attrs = ['data-auto'];
  // 缺省值交给运行时决定，这里只写用户明确给了的，避免把默认值固化进页面
  if (opts.mode) attrs.push(`data-mode="${attr(opts.mode)}"`);
  if (opts.storage) attrs.push(`data-storage="${attr(opts.storage)}"`);
  if (opts.project) attrs.push(`data-project="${attr(opts.project)}"`);
  if (opts.author) attrs.push(`data-author="${attr(opts.author)}"`);
  if (opts.domain) attrs.push(`data-domain="${attr(opts.domain)}"`);

  const tag = `<script src="${attr(src)}" ${attrs.join(' ')}></script>`;
  const next = upsertBlock(html, [tag]);
  if (next === html) {
    console.log(`- ${shortPath(file)} 无变化`);
    continue;
  }
  writeText(file, next);
  changed += 1;
  console.log(`✓ ${shortPath(file)} → ${src}`);
}

console.log(`\n${changed} / ${files.length} 个文件已更新`);

/* ------------------------------------------------------------------ */

/** PowerShell 不展开通配符，所以自己处理一层 *.html */
function expand(patterns) {
  const out = new Set();
  for (const pattern of patterns) {
    if (!pattern.includes('*')) {
      if (existsSync(pattern) && statSync(pattern).isFile()) out.add(resolve(pattern));
      else console.error(`跳过不存在的文件: ${pattern}`);
      continue;
    }
    const dir = dirname(pattern) || '.';
    const re = new RegExp(`^${basename(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');
    if (!existsSync(dir)) {
      console.error(`跳过不存在的目录: ${dir}`);
      continue;
    }
    for (const name of readdirSync(dir)) {
      if (re.test(name) && statSync(join(dir, name)).isFile()) out.add(resolve(dir, name));
    }
  }
  return [...out];
}