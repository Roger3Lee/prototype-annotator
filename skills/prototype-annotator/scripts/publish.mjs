#!/usr/bin/env node
/**
 * 把导出的标注配置内联进页面，生成只读的标注版 HTML。
 *
 * 产物是自包含的单文件：双击就能看，file:// 下也不需要服务器和 localStorage。
 * 适合发给不装工具的同事评审。
 */

import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join, basename, extname } from 'node:path';
import {
  readText, writeText, upsertBlock, relSrc, attr, parseArgs,
  findBundle, shortPath,
} from './html-utils.mjs';

const USAGE = `用法:
  node scripts/publish.mjs <config.json> <page.html> [选项]

选项:
  -o, --out <文件>   输出路径，默认 <page>.annotated.html
  --project <名>     覆盖页面上显示的项目名
  --src <路径>       脚本地址，默认相对指向 assets/ui-annotator.umd.min.js
  --bundle           把脚本复制到输出目录旁边，让产物可以整体拷走
  --edit             产出可编辑版（默认只读 view 模式）`;

const { opts, rest } = parseArgs(process.argv.slice(2), ['bundle', 'edit', 'help']);
if (opts.help || rest.length !== 2) {
  console.log(USAGE);
  process.exit(rest.length === 2 ? 0 : 1);
}

const [configFile, pageFile] = rest;
for (const file of [configFile, pageFile]) {
  if (!existsSync(file)) {
    console.error(`找不到文件: ${file}`);
    process.exit(1);
  }
}

let config;
try {
  config = JSON.parse(readText(configFile));
} catch (err) {
  console.error(`${configFile} 不是合法 JSON: ${err.message}`);
  process.exit(1);
}
if (!Array.isArray(config.pages)) {
  console.error(`${configFile} 缺少 pages 数组，这不像是导出的标注配置`);
  process.exit(1);
}
if (opts.project) {
  config.project = { ...config.project, name: opts.project };
}
const outFile = resolve(opts.out || opts.o
  || join(dirname(pageFile), `${basename(pageFile, extname(pageFile))}.annotated.html`));

const bundleName = 'ui-annotator.umd.min.js';
let src = opts.src;
if (!src) {
  const bundle = findBundle(bundleName);
  if (!bundle) {
    console.error(`找不到 ${bundleName}，它应该在 skill 的 assets/ 下（或用 --src 指定地址）`);
    process.exit(1);
  }
  if (opts.bundle) {
    // 产物要能整体拷给别人，脚本得跟着走
    mkdirSync(dirname(outFile), { recursive: true });
    copyFileSync(bundle, join(dirname(outFile), bundleName));
    src = `./${bundleName}`;
  } else {
    src = relSrc(outFile, bundle);
  }
}

// 内联 JSON 里的 </script> 会提前闭合脚本标签，必须打断；\u2028/\u2029 在部分解析器里也会炸
const json = JSON.stringify(config, null, 2)
  .replace(/<\/script/gi, '<\\/script')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

const attrs = ['data-auto', 'data-storage="inline"'];
if (!opts.edit) attrs.push('data-mode="view"');
if (config.project?.name) attrs.push(`data-project="${attr(config.project.name)}"`);

const html = upsertBlock(readText(pageFile), [
  '<script type="application/json" id="ui-annotator-config">',
  json,
  '</script>',
  `<script src="${attr(src)}" ${attrs.join(' ')}></script>`,
]);

writeText(outFile, html);

const count = config.pages.reduce((n, p) => n + (p.annotations?.length || 0), 0);
console.log(`✓ ${shortPath(outFile)}`);
console.log(`  ${config.pages.length} 个页面、${count} 条标注，${opts.edit ? '可编辑' : '只读'}模式`);
console.log(`  脚本: ${src}${opts.bundle ? '（已复制到输出目录）' : ''}`);