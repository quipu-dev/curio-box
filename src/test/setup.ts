import 'fake-indexeddb/auto';

// 在 Node 环境下补充对全局 window 与 URL 对象操作的兼容
if (typeof globalThis.window === 'undefined') {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = () => `blob:mock-${Math.random().toString(36).slice(2)}`;
  URL.revokeObjectURL = () => {};
}
