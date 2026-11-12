// Minimal browser stand-ins so the game's simulation modules load under Node.
// The sim itself is headless ("no Three.js here: the simulation also runs headless"), but a few shared modules
// (core/input.js…) register keyboard/gamepad listeners at import time. Those listeners never fire here.
const noop = () => {};
// a value that accepts any property read, call or construction and stays inert
const inert = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : inert),
  apply: () => inert,
  construct: () => inert,
  set: () => true,
});
const store = new Map();
globalThis.localStorage ??= { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
globalThis.window ??= globalThis;
globalThis.addEventListener ??= noop;
globalThis.removeEventListener ??= noop;
globalThis.document ??= inert;
globalThis.requestAnimationFrame ??= noop;
globalThis.location ??= { search: '', hash: '', href: 'https://worldofbagarre.com/', hostname: 'worldofbagarre.com' };
if (!globalThis.navigator.getGamepads) globalThis.navigator.getGamepads = () => [];
