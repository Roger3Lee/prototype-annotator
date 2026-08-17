/**
 * 浮层样式。整段注入 Shadow Root，因此可以使用简短类名而不担心与宿主项目冲突。
 * 反过来，宿主的全局样式（reset、Tailwind preflight 等）也影响不到这里。
 */

export const OVERLAY_CSS = /* css */ `
:host {
  /* all: initial 会连自定义属性一起清掉，这里只重置继承类属性 */
  font: 400 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  color: #0f172a;
  --anno-bg: #ffffff;
  --anno-fg: #0f172a;
  --anno-muted: #64748b;
  --anno-border: #e2e8f0;
  --anno-accent: #4f46e5;
  --anno-shadow: 0 8px 28px rgba(15, 23, 42, .16);
  --anno-radius: 10px;
  --anno-z: 2147483000;
}

* { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; }

/* ---------------- 通用 ---------------- */

.layer {
  position: fixed;
  inset: 0;
  z-index: var(--anno-z);
  pointer-events: none;
}

.hidden { display: none !important; }

.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--anno-border);
  background: var(--anno-bg);
  border-radius: 7px;
  padding: 5px 9px;
  line-height: 1.2;
  transition: background .12s, border-color .12s;
}
.btn:hover { background: #f1f5f9; }
.btn.active { background: var(--anno-accent); border-color: var(--anno-accent); color: #fff; }
.btn.primary { background: var(--anno-accent); border-color: var(--anno-accent); color: #fff; }
.btn.primary:hover { filter: brightness(1.08); }
.btn.ghost { border-color: transparent; background: transparent; }
.btn.ghost:hover { background: #f1f5f9; }
/* ghost 的透明背景会盖掉 .btn.active 的强调色，只剩白色图标看不见，这里补回来 */
.btn.ghost.active, .btn.ghost.active:hover { background: var(--anno-accent); border-color: var(--anno-accent); color: #fff; }
.btn.danger { color: #dc2626; border-color: #fecaca; }
.btn.danger:hover { background: #fef2f2; }
.btn:disabled { opacity: .5; cursor: not-allowed; }

.icon { width: 15px; height: 15px; flex: none; }

/* ---------------- 工具栏 ---------------- */

.toolbar {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: calc(var(--anno-z) + 30);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: var(--anno-bg);
  border: 1px solid var(--anno-border);
  border-radius: 12px;
  box-shadow: var(--anno-shadow);
  pointer-events: auto;
  user-select: none;
}
.toolbar .grip {
  cursor: grab;
  padding: 0 4px;
  color: #cbd5e1;
  letter-spacing: -1px;
}
.toolbar .sep { width: 1px; height: 20px; background: var(--anno-border); margin: 0 2px; }
.toolbar .count {
  min-width: 20px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--anno-muted);
  font-size: 12px;
  padding: 0 4px;
}
.toolbar.collapsed .collapsible { display: none; }

/* ---------------- 拾取高亮 ---------------- */

.highlight {
  position: absolute;
  border: 2px solid var(--anno-accent);
  background: rgba(79, 70, 229, .10);
  border-radius: 3px;
  pointer-events: none;
  transition: all .06s linear;
}

.hint {
  position: absolute;
  max-width: 340px;
  padding: 4px 8px;
  background: #0f172a;
  color: #fff;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.45;
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hint b { color: #a5b4fc; font-weight: 600; }
.hint .dim { color: #94a3b8; }

/* 框选矩形 */
.rubber {
  position: absolute;
  border: 2px dashed var(--anno-accent);
  background: rgba(79, 70, 229, .08);
  pointer-events: none;
}

/* 拾取模式下给宿主页面加一层十字光标提示 */
.pick-blocker {
  position: fixed;
  inset: 0;
  z-index: calc(var(--anno-z) + 5);
  cursor: crosshair;
  pointer-events: auto;
  background: transparent;
}

/* ---------------- 标记（数字别针） ---------------- */

.marker {
  position: absolute;
  width: 22px;
  height: 22px;
  margin: -11px 0 0 -11px;
  border-radius: 50% 50% 50% 2px;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(15, 23, 42, .28);
  pointer-events: auto;
  cursor: pointer;
  border: 2px solid #fff;
  transition: transform .12s;
}
.marker:hover { transform: scale(1.18); z-index: 2; }
.marker.drifted { border-color: #fbbf24; border-style: dashed; }
.marker.orphaned { opacity: .45; }
.marker.selected { transform: scale(1.25); box-shadow: 0 0 0 4px rgba(79, 70, 229, .3); }

/* 展开态：标记以卡片形式展示序号 + 标题 */
.marker.expanded {
  width: auto;
  height: auto;
  min-height: 22px;
  max-width: 220px;
  margin: -2px 0 0 0;
  border-radius: 6px;
  background: #fff;
  color: #1e293b;
  font-size: 11px;
  font-weight: 400;
  border: 1px solid var(--anno-border);
  border-left: 3px solid var(--anno-accent);
  box-shadow: 0 2px 8px rgba(15, 23, 42, .12);
  padding: 4px 8px 4px 6px;
  gap: 5px;
  justify-content: flex-start;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.marker.expanded:hover { transform: none; box-shadow: 0 3px 12px rgba(15, 23, 42, .18); z-index: 2; }
.marker.expanded .seq-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--anno-accent);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  flex-shrink: 0;
}
.marker.expanded .m-title {
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
}

/* 区域型标注的边框 */
.region {
  position: absolute;
  border: 2px dashed;
  border-radius: 4px;
  pointer-events: none;
  opacity: .75;
}

/* 被选中元素的呼吸描边 */
.focus-ring {
  position: absolute;
  border: 2px solid var(--anno-accent);
  border-radius: 3px;
  pointer-events: none;
  animation: anno-pulse 1.4s ease-out 2;
}
@keyframes anno-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(79, 70, 229, .45); }
  100% { box-shadow: 0 0 0 12px rgba(79, 70, 229, 0); }
}

/* ---------------- 气泡（查看态） ---------------- */

.tooltip {
  position: absolute;
  max-width: 340px;
  padding: 10px 12px;
  background: var(--anno-bg);
  border: 1px solid var(--anno-border);
  border-left: 3px solid var(--anno-accent);
  border-radius: 8px;
  box-shadow: var(--anno-shadow);
  pointer-events: auto;
  font-size: 12px;
}
.tooltip h4 { margin: 0 0 4px; font-size: 13px; }
.tooltip p { margin: 0 0 6px; color: #334155; white-space: pre-wrap; }
.tooltip dl { margin: 6px 0 0; display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; }
.tooltip dt { color: var(--anno-muted); font-size: 11px; }
.tooltip dd { margin: 0; font-size: 11px; }
.tooltip ul { margin: 2px 0; padding-left: 16px; }

.chip {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  vertical-align: 1px;
}

/* ---------------- 编辑面板 ---------------- */

.panel {
  position: fixed;
  z-index: calc(var(--anno-z) + 40);
  width: 380px;
  max-height: min(78vh, 680px);
  display: flex;
  flex-direction: column;
  background: var(--anno-bg);
  border: 1px solid var(--anno-border);
  border-radius: var(--anno-radius);
  box-shadow: var(--anno-shadow);
  pointer-events: auto;
  overflow: hidden;
}
.panel header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--anno-border);
  background: #f8fafc;
  cursor: grab;
}
.panel header strong { flex: 1; font-size: 13px; }
.panel .body { padding: 12px; overflow-y: auto; flex: 1; }
.panel footer {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--anno-border);
  background: #f8fafc;
}
.panel footer .spacer { flex: 1; }

.field { margin-bottom: 10px; }
.field > label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--anno-muted);
  margin-bottom: 3px;
}
.field input[type=text], .field textarea, .field select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--anno-border);
  border-radius: 6px;
  font: inherit;
  background: #fff;
  color: var(--anno-fg);
}
.field textarea { resize: vertical; min-height: 62px; }
.field input:focus, .field textarea:focus, .field select:focus {
  outline: 2px solid rgba(79, 70, 229, .35);
  outline-offset: -1px;
  border-color: var(--anno-accent);
}
.field .help { font-size: 10px; color: var(--anno-muted); margin-top: 3px; }

.cats { display: flex; flex-wrap: wrap; gap: 4px; }
.cats button {
  border: 1px solid var(--anno-border);
  background: #fff;
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 11px;
}
.cats button[aria-pressed=true] { color: #fff; border-color: transparent; }

.target-info {
  padding: 7px 9px;
  background: #f8fafc;
  border: 1px solid var(--anno-border);
  border-radius: 6px;
  font-size: 11px;
  color: #475569;
  margin-bottom: 10px;
  word-break: break-all;
}
.target-info code { font-family: ui-monospace, Menlo, Consolas, monospace; color: #0f172a; }
.target-info .row { display: flex; gap: 6px; margin-top: 3px; }
.target-info .row span:first-child { color: var(--anno-muted); flex: none; min-width: 46px; }

details.group { border-top: 1px solid var(--anno-border); padding-top: 8px; margin-top: 4px; }
details.group > summary {
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  color: var(--anno-muted);
  margin-bottom: 8px;
  user-select: none;
}
details.group > summary::marker { color: #cbd5e1; }

/* ---------------- 侧栏 ---------------- */

.sidebar {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 340px;
  z-index: calc(var(--anno-z) + 20);
  display: flex;
  flex-direction: column;
  background: var(--anno-bg);
  border-left: 1px solid var(--anno-border);
  box-shadow: -6px 0 24px rgba(15, 23, 42, .1);
  pointer-events: auto;
  transform: translateX(100%);
  transition: transform .18s ease-out;
}
.sidebar.open { transform: none; }
.sidebar header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--anno-border);
}
.sidebar header strong { flex: 1; }
.sidebar .filters { display: flex; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--anno-border); }
.sidebar .filters input, .sidebar .filters select {
  padding: 4px 6px;
  border: 1px solid var(--anno-border);
  border-radius: 6px;
  font: inherit;
  font-size: 12px;
  min-width: 0;
}
.sidebar .filters input { flex: 1; }
.sidebar .list { flex: 1; overflow-y: auto; padding: 8px; }
.sidebar footer { padding: 8px 12px; border-top: 1px solid var(--anno-border); display: flex; gap: 6px; flex-wrap: wrap; }
.sidebar .empty { padding: 28px 16px; text-align: center; color: var(--anno-muted); font-size: 12px; }

.item {
  border: 1px solid var(--anno-border);
  border-left: 3px solid var(--anno-accent);
  border-radius: 7px;
  padding: 8px 9px;
  margin-bottom: 6px;
  cursor: pointer;
  background: #fff;
}
.item:hover { background: #f8fafc; }
.item.selected { outline: 2px solid rgba(79, 70, 229, .4); }
.item .top { display: flex; align-items: baseline; gap: 6px; }
.item .seq { font-size: 10px; font-weight: 700; color: var(--anno-muted); font-variant-numeric: tabular-nums; }
.item .title { flex: 1; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item .desc {
  margin: 3px 0 0;
  font-size: 11px;
  color: #475569;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.item .meta { margin-top: 4px; display: flex; gap: 5px; align-items: center; font-size: 10px; color: var(--anno-muted); }
.item .warn { color: #b45309; }
.item .lost { color: #dc2626; }
.item .actions { display: flex; gap: 2px; margin-left: auto; }
.item .actions button { border: none; background: transparent; padding: 1px 4px; border-radius: 4px; font-size: 10px; color: var(--anno-muted); }
.item .actions button:hover { background: #e2e8f0; color: var(--anno-fg); }

/* ---------------- 导出对话框 ---------------- */

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: calc(var(--anno-z) + 50);
  background: rgba(15, 23, 42, .45);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  padding: 24px;
}
.modal {
  width: min(760px, 100%);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: var(--anno-bg);
  border-radius: 12px;
  box-shadow: var(--anno-shadow);
  overflow: hidden;
}
.modal header { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--anno-border); }
.modal header strong { flex: 1; }
.modal .tabs { display: flex; gap: 2px; padding: 8px 14px 0; }
.modal .tabs button {
  border: 1px solid transparent;
  border-bottom: none;
  background: transparent;
  padding: 5px 11px;
  border-radius: 7px 7px 0 0;
  font-size: 12px;
  color: var(--anno-muted);
}
.modal .tabs button[aria-selected=true] {
  background: #f1f5f9;
  color: var(--anno-fg);
  font-weight: 600;
}
.modal .body { flex: 1; overflow: auto; padding: 12px 14px; }
.modal textarea {
  width: 100%;
  height: 46vh;
  border: 1px solid var(--anno-border);
  border-radius: 8px;
  padding: 10px;
  font: 400 11px/1.6 ui-monospace, Menlo, Consolas, monospace;
  resize: vertical;
  background: #f8fafc;
  color: #0f172a;
  white-space: pre;
}
.modal footer { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--anno-border); background: #f8fafc; }
.modal footer .spacer { flex: 1; }
.modal .note { font-size: 11px; color: var(--anno-muted); align-self: center; }

/* ---------------- 轻提示 ---------------- */

.toasts {
  position: fixed;
  left: 50%;
  bottom: 72px;
  transform: translateX(-50%);
  z-index: calc(var(--anno-z) + 60);
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  pointer-events: none;
}
.toast {
  padding: 7px 14px;
  border-radius: 999px;
  background: #0f172a;
  color: #fff;
  font-size: 12px;
  box-shadow: var(--anno-shadow);
  animation: anno-rise .18s ease-out;
}
.toast.error { background: #dc2626; }
.toast.warn { background: #b45309; }
@keyframes anno-rise {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

/* ---------------- 深色偏好 ---------------- */

@media (prefers-color-scheme: dark) {
  :host {
    --anno-bg: #1e293b;
    --anno-fg: #e2e8f0;
    --anno-muted: #94a3b8;
    --anno-border: #334155;
    color: var(--anno-fg);
  }
  .btn:hover:not(.active), .btn.ghost:hover:not(.active) { background: #334155; }
  .panel header, .panel footer, .modal footer { background: #0f172a; }
  .field input[type=text], .field textarea, .field select { background: #0f172a; color: var(--anno-fg); }
  .cats button { background: #0f172a; }
  .target-info, .item, .modal textarea { background: #0f172a; color: var(--anno-fg); }
  .item:hover { background: #334155; }
  .modal .tabs button[aria-selected=true] { background: #334155; }
  .tooltip p { color: #cbd5e1; }
  .item .desc { color: #cbd5e1; }
}

/* 打印时隐藏所有标注 UI，避免污染截图/打印稿 */
@media print { :host { display: none !important; } }
`;
