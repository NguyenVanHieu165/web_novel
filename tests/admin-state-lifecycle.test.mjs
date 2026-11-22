import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
const projectRoot = new URL("../", import.meta.url);
function harness(file, imports = {}) {
    const states = [], slots = [], pending = [];
    let index = 0, dirty = false;
    const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    const react = {
        createContext: () => ({ Provider: Symbol.for('provider') }),
        useContext: () => { },
        useState(initial) { const i = index++; if (!(i in states))
            states[i] = typeof initial === "function" ? initial() : initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; dirty = true; }]; },
        useRef(initial) { const i = index++; if (!(i in slots))
            slots[i] = { current: initial }; return slots[i]; },
        useCallback(fn, deps) { const i = index++; if (!slots[i] || !equal(slots[i].deps, deps))
            slots[i] = { fn, deps }; return slots[i].fn; },
        useEffect(fn, deps) { const i = index++; if (!slots[i] || !equal(slots[i].deps, deps)) {
            pending.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
        } },
    };
    const compiled = { exports: {} }, source = ts.transpileModule(fs.readFileSync(fileURLToPath(new URL(file, projectRoot)), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(source, { module: compiled, exports: compiled.exports, AbortController, fetch: imports.fetch, require: name => name === "react" ? react : name === "react/jsx-runtime" ? { jsx: (type, props) => ({ type, props }) } : imports[name], console });
    return {
        exports: compiled.exports,
        render(fn, arg) { let value, n = 0; do {
            dirty = false;
            index = 0;
            value = fn(arg);
            assert.ok(++n < 10, "No render loop");
        } while (dirty); return value; },
        commit() { while (pending.length)
            pending.shift()(); },
        unmount() { for (const x of slots)
            x?.cleanup?.(); },
    };
}
test("local drag order resets when the parent replaces the list", () => {
    const h = harness("hooks/useReorderedItems.ts"), use = h.exports.useReorderedItems;
    const a = ["a", "b", "c"];
    let out = h.render(use, a);
    assert.equal(out.items, a);
    out.reorder(0, 2);
    out = h.render(use, a);
    assert.deepEqual(Array.from(out.items), ["b", "c", "a"]);
    out = h.render(use, a);
    assert.deepEqual(Array.from(out.items), ["b", "c", "a"]);
    const b = ["x", "y"];
    out = h.render(use, b);
    assert.equal(out.items, b);
    out = h.render(use, a);
    assert.equal(out.items, a);
    out.reorder(-1, 2);
    out = h.render(use, a);
    assert.equal(out.items, a);
});
test("story requests ignore stale results and support refresh and invalid IDs", async () => {
    const pending = [];
    const requests = { get(url, options) { return new Promise(resolve => pending.push({ url, signal: options.signal, resolve })); } };
    const s = harness("hooks/useStory.ts", { "@/lib/axios": { default: requests } }), hook = s.exports.useStory;
    let current = s.render(hook, 1);
    assert.equal(current.loading, true);
    s.commit();
    assert.equal(pending.length, 1);
    current = s.render(hook, 2);
    s.commit();
    assert.equal(pending[0].signal.aborted, true);
    pending[1].resolve({ data: { success: true, data: { idTruyen: 2 } } });
    await new Promise(setImmediate);
    current = s.render(hook, 2);
    assert.equal(current.story.idTruyen, 2);
    assert.equal(current.loading, false);
    pending[0].resolve({ data: { success: true, data: { idTruyen: 1 } } });
    await new Promise(setImmediate);
    current = s.render(hook, 2);
    assert.equal(current.story.idTruyen, 2);
    const refresh = current.fetchStory();
    current = s.render(hook, 2);
    assert.equal(current.loading, true);
    pending[2].resolve({ data: { success: true, data: { idTruyen: 2, tenTruyen: "Updated" } } });
    await refresh;
    current = s.render(hook, 2);
    assert.equal(current.story.tenTruyen, "Updated");
    current = s.render(hook, null);
    s.commit();
    assert.equal(current.story, null);
    assert.equal(current.loading, false);
    assert.equal(current.error, "ID không hợp lệ");
    s.unmount();
});
test("session reads cannot overwrite a newer refresh or successful logout", async () => {
    const authPending = [];
    const ah = harness("context/AuthContext.tsx", {
        "next/navigation": { useRouter: () => ({ push() { }, refresh() { } }) },
        sonner: { toast: { success() { }, error() { } } },
        fetch(url) { if (url === "/api/auth/logout")
            return Promise.resolve({ ok: true }); return new Promise(resolve => authPending.push(resolve)); },
    });
    const Provider = ah.exports.AuthProvider, props = { children: null };
    let auth = ah.render(Provider, props).props.value;
    ah.commit();
    await auth.logout();
    authPending[0]({ ok: true, headers: { get: () => "application/json" }, json: async () => ({ success: true, user: { idTaiKhoan: 1 } }) });
    await new Promise(setImmediate);
    auth = ah.render(Provider, props).props.value;
    assert.equal(auth.user, null, "A response started before logout must not restore the session");
    assert.equal(auth.loading, false);
    const first = auth.refreshUser(), second = auth.refreshUser();
    authPending[2]({ ok: true, headers: { get: () => "application/json" }, json: async () => ({ success: true, user: { idTaiKhoan: 2 } }) });
    await second;
    authPending[1]({ ok: false });
    await first;
    auth = ah.render(Provider, props).props.value;
    assert.equal(auth.user.idTaiKhoan, 2);
    ah.unmount();
});
