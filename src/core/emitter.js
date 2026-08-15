/** 极简事件总线：核心层通过它通知 UI 层，避免两边互相直接引用。 */
export class Emitter {
  constructor() {
    this._handlers = new Map();
  }

  on(event, handler) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this._handlers.get(event)?.delete(handler);
  }

  emit(event, payload) {
    for (const handler of this._handlers.get(event) || []) {
      try {
        handler(payload);
      } catch (err) {
        // 单个监听者报错不应中断其它监听者
        console.error(`[ui-annotator] 事件「${event}」的监听器抛错:`, err);
      }
    }
    // '*' 用于调试与外部日志接入
    for (const handler of this._handlers.get('*') || []) {
      try {
        handler({ event, payload });
      } catch {
        /* ignore */
      }
    }
  }

  clear() {
    this._handlers.clear();
  }
}
