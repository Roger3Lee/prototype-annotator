/**
 * 构建脚本：产出 UMD（单文件直接 <script> 引入）与 ESM（供打包器 import）两种产物。
 *
 *   node build.mjs              一次性构建
 *   node build.mjs --watch      监听源码变更
 *   node build.mjs --serve      同时启动示例静态服务器（默认 5180 端口）
 */
import * as esbuild from 'esbuild';
import { readFile, copyFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, extname, join, normalize, resolve } from 'node:path';

const args = new Set(process.argv.slice(2));
const watch = args.has('--watch');
const serve = args.has('--serve');
const root = import.meta.dirname;

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

const banner = `/*! ui-annotator v${pkg.version} | MIT | ${pkg.description} */`;

/** @type {esbuild.BuildOptions} */
const base = {
  entryPoints: [join(root, 'src/index.js')],
  bundle: true,
  target: ['es2019'],
  charset: 'utf8',
  legalComments: 'none',
  banner: { js: banner },
  define: { __VERSION__: JSON.stringify(pkg.version) },
};

/**
 * skills/prototype-annotator 要能单独打成 zip 发布，所以 UMD 产物构建完
 * 同步一份到它的 assets/ 下 —— 用插件而不是构建后一次性拷贝，watch 模式下也能跟上。
 */
const skillAssets = join(root, 'skills/prototype-annotator/assets');
const syncSkillAssets = {
  name: 'sync-skill-assets',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length) return;
      const outfile = build.initialOptions.outfile;
      await mkdir(skillAssets, { recursive: true });
      await copyFile(outfile, join(skillAssets, basename(outfile)));
    });
  },
};

const targets = [
  { ...base, format: 'iife', globalName: 'UIAnnotator', outfile: join(root, 'dist/ui-annotator.umd.js'), footer: { js: umdFooter() }, plugins: [syncSkillAssets] },
  { ...base, format: 'iife', globalName: 'UIAnnotator', outfile: join(root, 'dist/ui-annotator.umd.min.js'), minify: true, footer: { js: umdFooter() }, plugins: [syncSkillAssets] },
  { ...base, format: 'esm', outfile: join(root, 'dist/ui-annotator.esm.js') },
];

/**
 * esbuild 的 iife 只挂全局变量，这里补一层 CommonJS / AMD 兼容，
 * 让同一个文件既能 <script> 直接用，也能被 require 引入。
 */
function umdFooter() {
  return `if (typeof module === 'object' && module.exports) { module.exports = UIAnnotator; }
else if (typeof define === 'function' && define.amd) { define(function () { return UIAnnotator; }); }`;
}

if (watch) {
  for (const options of targets) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  }
  console.log('[ui-annotator] watching src/ ...');
} else {
  const started = Date.now();
  await Promise.all(targets.map((options) => esbuild.build(options)));
  console.log(`[ui-annotator] built ${targets.length} bundles in ${Date.now() - started}ms`);
}

if (serve) {
  const port = 5180;
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
  };

  createServer(async (req, res) => {
    // 只服务仓库内文件，避免路径穿越
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let filePath = resolve(root, '.' + normalize(urlPath));
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    if (urlPath.endsWith('/')) filePath = join(filePath, 'index.html');
    try {
      const body = await readFile(filePath);
      res.writeHead(200, {
        'content-type': mime[extname(filePath)] || 'application/octet-stream',
        'cache-control': 'no-store',
      }).end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + urlPath);
    }
  }).listen(port, () => {
    console.log(`[ui-annotator] examples: http://localhost:${port}/examples/html/`);
  });
}
