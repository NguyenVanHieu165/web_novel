import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const sources = new Map(await Promise.all([
  ["component", "../components/chapter/ReadingProgress.tsx"],
  ["@/lib/reader-progress-state", "../lib/reader-progress-state.ts"],
  ["@/lib/reading-progress", "../lib/reading-progress.ts"],
].map(async ([name, path]) => [name, ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText])));

function eventRegistry() {
  const listeners = new Map();
  return {
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener: (name, listener) => listeners.get(name)?.delete(listener),
    emit: (name, event = {}) => { for (const listener of listeners.get(name) ?? []) listener(event); },
  };
}

async function mountProgress() {
  const effects = [];
  const values = new Map();
  const localWrites = [];
  const requests = [];
  const intervals = new Map();
  const frames = new Map();
  let nextId = 0;
  const clock = 10_000;
  const height = 2_000;
  const window = {
    ...eventRegistry(), scrollY: 0, innerHeight: 800,
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); localWrites.push(JSON.parse(value)); },
    },
    setInterval: (callback, delay) => { const id = ++nextId; intervals.set(id, { callback, delay }); return id; },
    clearInterval: (id) => intervals.delete(id),
    requestAnimationFrame: (callback) => { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
    location: { origin: "https://novel.test", pathname: "/truyen/story/chapter" },
  };
  const content = {
    isConnected: true,
    get scrollHeight() { return this.isConnected ? height : 0; },
    getBoundingClientRect() {
      return this.isConnected ? { top: 200 - window.scrollY } : { top: 0 };
    },
  };
  const document = {
    ...eventRegistry(), visibilityState: "visible", documentElement: { clientWidth: 1_280 },
    getElementById: (id) => id === "reader-content" ? content : null,
  };
  const cache = new Map();
  const jsx = (type, props) => ({ type, props });
  const react = {
    useRef: (current) => ({ current }),
    useState: (initial) => [initial, () => {}],
    useEffect: (setup) => effects.push(setup),
  };
  const sandbox = {
    window, document, performance: { now: () => clock }, AbortController,
    ResizeObserver: class { observe() {} disconnect() {} },
    fetch: async (url, options = {}) => {
      requests.push({ url, ...options });
      const point = options.method === "PUT" ? JSON.parse(options.body) : { position: 879, percent: 70 };
      return { ok: true, json: async () => ({ success: true, data: { ...point, updatedAt: "2026-11-01T00:00:00.000Z" } }) };
    },
  };
  function load(name) {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: Symbol.for("fragment") };
    if (name === "@/context/AuthContext") return { useAuth: () => ({ user: { idTaiKhoan: 7 } }) };
    if (!sources.has(name)) return require(name);
    if (cache.has(name)) return cache.get(name).exports;
    const compiled = { exports: {} };
    cache.set(name, compiled);
    vm.runInNewContext(sources.get(name), { ...sandbox, module: compiled, exports: compiled.exports, require: load });
    return compiled.exports;
  }
  const element = load("component").default({ chapterId: 11 });
  element.type(element.props);
  assert.equal(effects.length, 1);
  const cleanup = effects[0]();
  // Let the existing server resume finish before simulating user activity.
  await new Promise((resolve) => setImmediate(resolve));
  const local = () => JSON.parse([...values.values()][0]).entries[0];
  return {
    window, content, requests, localWrites, local, cleanup,
    scroll: (position) => { window.scrollY = position; window.emit("scroll"); },
    tickLocal: () => { for (const { callback, delay } of intervals.values()) if (delay === 250) callback(); },
  };
}

const puts = (reader) => reader.requests.filter((request) => request.method === "PUT");

test("an untouched resume stays intact and a later departure saves the actual passage", async () => {
  const untouched = await mountProgress();
  untouched.window.emit("reader-leaving", { detail: { chapterId: 11, waitUntil: () => {} } });
  untouched.content.isConnected = false;
  untouched.scroll(0);
  untouched.cleanup();
  assert.equal(untouched.local().percent, 70);
  assert.equal(puts(untouched).length, 0);

  const reader = await mountProgress();
  reader.window.emit("wheel");
  reader.scroll(772); // (772 + 56 - 200) / (2000 - 744) = 50%.
  const pending = [];
  reader.window.emit("reader-leaving", { detail: { chapterId: 11, waitUntil: (promise) => pending.push(promise) } });
  assert.equal(pending.length, 1);
  await Promise.all(pending);
  assert.equal(JSON.parse(puts(reader)[0].body).percent, 50);
  assert.equal(puts(reader)[0].keepalive, true);
  assert.equal(puts(reader)[0].headers["X-Reader-Account"], "7");
  reader.content.isConnected = false;
  reader.scroll(0);
  reader.cleanup();
  assert.equal(reader.local().percent, 50);
  assert.equal(reader.local().pending, false);
  assert.equal(puts(reader).length, 1);
  assert.equal(reader.localWrites.slice(1).every((write) => write.entries[0].percent === 50), true);
});

test("detached passive cleanup discards a dirty scroll instead of measuring the removed article", async () => {
  const reader = await mountProgress();
  reader.window.emit("wheel");
  reader.scroll(772);
  reader.tickLocal();
  assert.equal(reader.local().percent, 50);
  reader.window.emit("wheel");
  reader.scroll(900);
  reader.content.isConnected = false;
  reader.scroll(0);
  reader.cleanup();
  assert.equal(reader.local().percent, 50);
  assert.equal(reader.local().pending, true);
  assert.equal(puts(reader).length, 0);
});

