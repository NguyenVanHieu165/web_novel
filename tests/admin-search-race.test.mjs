import assert from "node:assert/strict";
import test from "node:test";
import { loadNotificationModule as load } from "./notification-support.mjs";

function harness(file, name) {
  const states = [], slots = [], effects = [], timers = new Map(), requests = [];
  let index = 0, nextTimer = 0;
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) { const i = index++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], next => { states[i] = typeof next === "function" ? next(states[i]) : next; }]; },
    useRef(initial) { const i = index++; return slots[i] ?? (slots[i] = { current: initial }); },
    useCallback(fn, deps) { const i = index++; if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = index++; if (!slots[i] || !equal(slots[i].deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const api = { get: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })) };
  const hook = load(file, { react, "@/lib/axios": { __esModule: true, default: api } }, {
    window: { setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } },
  })[name];
  return {
    requests,
    render() { index = 0; const result = hook(); while (effects.length) effects.shift()(); return result; },
    tick() { const callbacks = [...timers.values()]; timers.clear(); for (const fn of callbacks) fn(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

for (const [file, name, key] of [["hooks/useUsers.ts", "useUsers", "users"], ["hooks/useGenres.ts", "useGenres", "genres"]]) {
  const response = label => ({ data: { success: true, data: { [key === "users" ? "users" : "data"]: [{ label }], meta: { page: 1, limit: 15, total: 1, totalPage: 1 } } } });
  test(`${name}: a newer query wins over older responses and errors`, async () => {
    const h = harness(file, name);
    let out = h.render(); h.tick();
    out.setSearch("B"); out = h.render(); h.tick();
    h.requests[1].resolve(response("B")); await new Promise(setImmediate);
    h.requests[0].resolve(response("A")); await new Promise(setImmediate);
    out = h.render();
    assert.equal(out.query.search, "B"); assert.equal(out[key][0].label, "B"); assert.equal(out.loading, false);
    const old = out.refresh(); out.setPage(2); out = h.render(); h.tick();
    h.requests[2].reject(new Error("obsolete failure")); await old;
    out = h.render(); assert.equal(out.error, null); assert.equal(out.loading, true);
    h.requests[3].resolve(response("page2")); await new Promise(setImmediate);
    assert.equal(h.render()[key][0].label, "page2"); h.unmount();
  });
  test(`${name}: query changes invalidate requests during debounce, manual refresh and unmount`, async () => {
    const h = harness(file, name);
    let out = h.render(); h.tick();
    out.setQuery(current => ({ ...current, search: "B" }));
    h.requests[0].resolve(response("old")); await new Promise(setImmediate);
    out = h.render();
    assert.equal(out[key].length, 0, "old results must not commit during the 300 ms debounce gap");
    assert.equal(out.loading, true);
    const manual = out.refresh();
    assert.equal(h.requests.at(-1).options.signal.aborted, false);
    h.requests.at(-1).resolve(response("manual")); await manual;
    out = h.render(); assert.equal(out[key][0].label, "manual");
    out.setQuery(current => current); out = h.render();
    assert.equal(out.loading, false, "a no-op functional update must not enter a loading state");
    const pending = out.refresh(); h.unmount();
    assert.equal(h.requests.at(-1).options.signal.aborted, true);
    h.requests.at(-1).reject(new Error("unmounted")); await pending;
  });
}
