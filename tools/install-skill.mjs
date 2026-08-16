#!/usr/bin/env node
/**
 * 把 skills/prototype-annotator 装到 .qoder/skills/ 下，让 Qoder 能自动发现它。
 *
 * skills/ 是唯一的源，.qoder/skills/ 只是它的副本（.qoder 不入库）。
 * 改完 skill 跑一次 `npm run skill:install`，避免出现两份互相漂移的 SKILL.md。
 */
import { readdir, mkdir, copyFile, rm, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = 'prototype-annotator';
const src = join(root, 'skills', SKILL);
const dest = join(root, '.qoder/skills', SKILL);

/** 早期版本叫 ai-design-annotate，留着会和新版打架 */
const legacy = [join(root, '.qoder/skills/ai-design-annotate')];

const rel = (p) => relative(root, p).replace(/\\/g, '/');

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(from, to) {
  await mkdir(to, { recursive: true });
  let count = 0;
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const a = join(from, entry.name);
    const b = join(to, entry.name);
    if (entry.isDirectory()) count += await copyDir(a, b);
    else {
      await copyFile(a, b);
      count += 1;
    }
  }
  return count;
}

if (!(await exists(src))) {
  console.error(`找不到 ${rel(src)}，请在仓库根目录运行`);
  process.exit(1);
}

for (const old of legacy) {
  if (await exists(old)) {
    await rm(old, { recursive: true, force: true });
    console.log(`已移除旧版 ${rel(old)}`);
  }
}

// 先清空再拷，免得删掉的文件残留在副本里
await rm(dest, { recursive: true, force: true });
const n = await copyDir(src, dest);

console.log(`已安装 ${n} 个文件 → ${rel(dest)}`);
if (!(await exists(join(dest, 'assets/ui-annotator.umd.js')))) {
  console.log('提示：assets/ 里没有运行时，先跑 npm run build');
}