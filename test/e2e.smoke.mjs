/**
 * 端到端冒烟测试：用本机 Edge 打开静态 HTML 示例，
 * 走一遍「拾取 -> 填写 -> 保存 -> 导出 -> 刷新 -> 重定位」。
 * 只依赖 playwright-core + 系统已装的 Edge，不额外下载浏览器。
 */
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const url = pathToFileURL(join(import.meta.dirname, '..', 'examples', 'static-html.html')).href;
const logs = [];
let failed = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
  if (!ok) failed += 1;
}

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(600);

// 浮层在 shadow root 里，playwright 的选择器可以穿透
const host = page.locator('ui-annotator-root');
check('浮层宿主已挂载', await host.count() === 1);
check('工具栏可见', await page.locator('ui-annotator-root .toolbar').isVisible());

const api = () => page.evaluate(() => window.UIAnnotator?.getInstance() ? true : false);
check('UMD 全局与自动初始化', await api());

/* ---------- 1. 拾取元素并新建标注 ---------- */
await page.locator('ui-annotator-root .toolbar button').first().click();
// 拾取模式下遮罩层会拦截指针事件（防止触发宿主页面的 click），
// 所以这里用鼠标坐标点击，绕过 playwright 的可点击性检查。
async function clickAt(selector) {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
await clickAt('#btn-search');
await page.waitForTimeout(300);

const editor = page.locator('ui-annotator-root .editor');
check('拾取后编辑器弹出', await editor.isVisible());

await editor.locator('input[placeholder]').first().fill('查询订单');
await editor.locator('textarea').first().fill('按筛选条件分页查询订单列表');
// 保存按钮是编辑器底部的主按钮
await editor.locator('.btn.primary').click();
await page.waitForTimeout(300);

const count = await page.locator('ui-annotator-root .count').textContent();
check('工具栏计数变为 1', count?.trim() === '1', `实际=${count}`);
check('标记徽章已渲染', await page.locator('ui-annotator-root .marker').count() >= 1);

/* ---------- 2. 侧栏热键 ---------- */
await page.locator('body').click({ position: { x: 5, y: 400 } });
await page.keyboard.press('s');
await page.waitForTimeout(250);
check('S 键唤出侧栏', await page.locator('ui-annotator-root .sidebar').isVisible());

/* ---------- 3. 导出配置并校验 schema ---------- */
const exported = await page.evaluate(() => {
  const cfg = window.UIAnnotator.getInstance().export();
  return JSON.stringify(cfg);
});
const cfg = JSON.parse(exported);
const anno = cfg.pages?.[0]?.annotations?.[0];
check('导出含 $schema/version', Boolean(cfg.$schema) && cfg.version === 1);
check('导出含 1 条标注', cfg.pages?.[0]?.annotations?.length === 1);
check('标注标题已落库', anno?.title === '查询订单', `实际=${anno?.title}`);
check('采集到多重定位策略', (anno?.target?.strategies?.length ?? 0) >= 3,
  `策略=${anno?.target?.strategies?.map((s) => s.kind).join(',')}`);
check('定位到 domId 策略', Boolean(anno?.target?.strategies?.some((s) => s.kind === 'domId')));
check('快照记录了元素画像', anno?.target?.snapshot?.tag === 'button', `tag=${anno?.target?.snapshot?.tag}`);

/* ---------- 4. AI 上下文与提示词 ---------- */
const ai = await page.evaluate(() => {
  const a = window.UIAnnotator.getInstance();
  const ctx = a.extractContext();
  return {
    refCount: Object.keys(ctx.refHints || {}).length,
    interactives: ctx.interactives?.length ?? 0,
    forms: ctx.forms?.length ?? 0,
    tables: ctx.tables?.length ?? 0,
    existing: ctx.existingAnnotations?.length ?? 0,
    promptLen: a.buildPrompt().length,
    firstRef: ctx.interactives?.[0]?.ref,
  };
});
check('抽取到可交互元素', ai.interactives > 5, `interactives=${ai.interactives}`);
check('识别到表单', ai.forms >= 1, `forms=${ai.forms}`);
check('识别到表格', ai.tables >= 1, `tables=${ai.tables}`);
check('上下文带上已有标注', ai.existing === 1);
check('提示词已生成', ai.promptLen > 500, `长度=${ai.promptLen}`);
check('元素分配了 ref', /^e\d+$/.test(ai.firstRef || ''), `firstRef=${ai.firstRef}`);

/* ---------- 5. 模拟 AI 回填（ref 形态） ---------- */
const applied = await page.evaluate(() => {
  const a = window.UIAnnotator.getInstance();
  const ctx = a.extractContext();
  const target = ctx.interactives.find((i) => i.ref !== undefined);
  const fake = {
    annotations: [{
      ref: target.ref,
      category: 'business-rule',
      title: 'AI 生成的标注',
      body: '这是模拟 AI 返回的内容',
      businessLogic: { trigger: '点击', effect: '提交查询', rules: '状态为空时查全部' },
      confidence: 0.8,
    }],
    pageSummary: '订单管理主页面',
    glossary: { GMV: '成交总额' },
  };
  const r = a.applyAiResult(fake, { mode: 'merge' });
  const cfg = a.export();
  const last = cfg.pages[0].annotations.at(-1);
  return {
    added: r.added,
    skipped: r.skipped.length,
    source: last.meta.source,
    hasTarget: (last.target.strategies?.length ?? 0) > 0,
    rulesIsArray: Array.isArray(last.businessLogic.rules),
    summary: cfg.pages[0].summary,
    glossary: cfg.glossary?.GMV,
  };
});
check('AI 结果按 ref 落地', applied.added === 1 && applied.skipped === 0, JSON.stringify(applied));
check('AI 标注自动采集了定位线索', applied.hasTarget);
check('AI 写的字符串 rules 被规整为数组', applied.rulesIsArray);
check('标记来源为 ai', applied.source === 'ai');
check('页面摘要与术语表被吸收', applied.summary === '订单管理主页面' && applied.glossary === '成交总额');

/* ---------- 6. 刷新后持久化与重定位 ---------- */
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(700);

const after = await page.evaluate(() => {
  const a = window.UIAnnotator.getInstance();
  const list = a.store.list();
  return {
    total: list.length,
    statuses: list.map((x) => x.status),
    confidences: list.map((x) => x.target.resolved?.confidence ?? null),
    kinds: list.map((x) => x.target.resolved?.kind ?? null),
    markers: a.overlay.markers.entries.size,
  };
});
check('刷新后标注已恢复', after.total === 2, JSON.stringify(after));
check('全部重定位成功（active）', after.statuses.every((s) => s === 'active'), after.statuses.join(','));
check('命中权威策略', after.kinds.every((k) => ['anchorId', 'testId', 'domId'].includes(k)), after.kinds.join(','));
check('置信度足够高', after.confidences.every((c) => c !== null && c > 0.5), after.confidences.join(','));
check('标记全部锚定成功', after.markers === 2, String(after.markers));

/* ---------- 7. DOM 结构变化后的降级自愈 ---------- */
const healed = await page.evaluate(async () => {
  const a = window.UIAnnotator.getInstance();
  const btn = document.querySelector('#btn-search');
  // 抹掉 id 与 data-anno-id，逼定位引擎退到 cssPath / textual / nthPath
  btn.removeAttribute('id');
  btn.removeAttribute('data-anno-id');
  // 再包一层容器，改变 DOM 层级
  const wrap = document.createElement('div');
  btn.parentNode.insertBefore(wrap, btn);
  wrap.appendChild(btn);

  a.overlay.render();
  await new Promise((r) => setTimeout(r, 300));
  const first = a.store.list()[0];
  return {
    status: first.status,
    kind: first.target.resolved?.kind,
    confidence: first.target.resolved?.confidence,
    stillAnchored: a.overlay.markers.entries.get(first.id)?.element === btn,
  };
});
check('去掉 id 后仍定位到同一元素', healed.stillAnchored === true, JSON.stringify(healed));
check('降级到了非权威策略', !['anchorId', 'testId', 'domId'].includes(healed.kind), `kind=${healed.kind}`);

/* ---------- 8. 元素被删除后标记为 orphaned ---------- */
const orphan = await page.evaluate(async () => {
  const a = window.UIAnnotator.getInstance();
  document.querySelectorAll('#approve, #orders').forEach((n) => n.remove());
  a.overlay.render();
  await new Promise((r) => setTimeout(r, 300));
  return a.store.list().map((x) => x.status);
});
check('元素消失后标为 orphaned', orphan.some((s) => s === 'orphaned'), orphan.join(','));

/* ---------- 收尾 ---------- */
await page.screenshot({ path: join(import.meta.dirname, 'e2e-final.png'), fullPage: false });
await browser.close();

console.log('\n--- 控制台 error/warning ---');
console.log(logs.length ? logs.join('\n') : '(无)');
// 存储降级的那条 warning 是预期行为，不算失败
const unexpected = logs.filter((l) => !/localStorage|Third-party cookie/i.test(l));
check('无非预期控制台报错', unexpected.length === 0, unexpected.join(' | '));

console.log(`\n${failed === 0 ? '全部通过' : failed + ' 项失败'}`);
process.exit(failed === 0 ? 0 : 1);
