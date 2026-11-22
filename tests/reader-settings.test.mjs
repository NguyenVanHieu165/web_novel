import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../lib/reader-settings.ts", import.meta.url), "utf8");
const routeModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: routeModule.exports, module: routeModule, require: createRequire(import.meta.url) });
const {
  defaultReaderSettings,
  parseReaderSettings,
  parseReaderSettingsCookie,
  serializeReaderSettingsCookie,
  getReaderStyleVariables,
  readerSettingsCookieName,
} = routeModule.exports;

const asPlain = (value) => JSON.parse(JSON.stringify(value));

test("corrupted persistent settings cannot produce invisible or unbounded reader text", () => {
  for (const fontSize of [null, undefined, "", "NaN", Infinity, -8, 0, 999, 18.5, true, []]) {
    const result = parseReaderSettings({ theme: "made-up-theme", fontSize, fontFamily: "unknown", lineHeight: 0 });
    assert.equal(result.fontSize, 18);
    assert.equal(result.theme, "light");
    assert.equal(result.fontFamily, "sans");
    assert.equal(result.lineHeight, 1.8);
  }
});

test("settings parser tolerates missing or malformed browser state", () => {
  for (const value of [undefined, null, "dark", 18, [], true]) {
    assert.deepEqual(asPlain(parseReaderSettings(value)), asPlain(defaultReaderSettings));
  }
});

test("versioned compact cookies round-trip every supported theme and text setting", () => {
  for (const theme of ["light", "sepia", "mint", "dark"]) {
    for (const fontFamily of ["sans", "serif"]) {
      for (const lineHeight of [1.6, 1.8, 2, 2.2]) {
        for (const fontSize of [16, 18, 26]) {
          const settings = { theme, fontFamily, lineHeight, fontSize, width: "standard" };
          const encoded = serializeReaderSettingsCookie(settings);
          assert.ok(encoded.length < 80);
          assert.deepEqual(asPlain(parseReaderSettingsCookie(encoded)), settings);
        }
      }
    }
  }
});

test("unknown cookie versions, malformed values and injected delimiters are ignored", () => {
  for (const value of [
    undefined, "", "0:dark:18:sans:1.8", "2:dark:18:sans:1.8", "dark:18:sans:1.8",
    "1:system:18:sans:1.8", "1:dark:18:fantasy:1.8", "1:dark:13:sans:1.8", "1:dark:29:sans:1.8",
    "1:dark:18.5:sans:1.8", "1:dark:018:sans:1.8", "1:dark:NaN:sans:1.8", "1:dark:18:sans:3",
    "1:dark:18:sans:1.8:extra", "1:dark:18:sans:1.8; Path=/", "1:dark:18:sans:1.8\n", "x".repeat(100),
  ]) assert.equal(parseReaderSettingsCookie(value), null, `Unexpected valid cookie: ${value}`);
});

test("reader variables follow its chosen theme independently from a global dark class", () => {
  const light = getReaderStyleVariables({ ...defaultReaderSettings, theme: "light" });
  const dark = getReaderStyleVariables({ ...defaultReaderSettings, theme: "dark" });
  assert.equal(light.colorScheme, "light");
  assert.equal(dark.colorScheme, "dark");
  assert.notEqual(light["--reader-bg"], dark["--reader-bg"]);
  assert.notEqual(light["--reader-text"], dark["--reader-text"]);
  const invalid = getReaderStyleVariables({ theme: "url(example.com)", fontSize: 999, lineHeight: -1 });
  assert.equal(invalid["--reader-font-size"], "18px");
  assert.equal(invalid["--reader-line-height"], "1.8");
});

const hookSource = await readFile(new URL("../hooks/useReaderSettings.ts", import.meta.url), "utf8");
const hookCode = ts.transpileModule(hookSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function settingsStoreHarness({ cookie, storage = {}, blockStorage = false, blockCookie = false, serverOnly = false, hydrating = false } = {}) {
  const storeModule = { exports: {} };
  const storageValues = new Map(Object.entries(storage));
  const listeners = new Map();
  const hooks = [];
  const cookieWrites = [];
  let cookieValue = cookie ? `${readerSettingsCookieName}=${cookie}` : "";
  const browserWindow = {
    location: { protocol: "https:" },
    addEventListener(name, listener) {
      const callbacks = listeners.get(name) ?? new Set();
      callbacks.add(listener);
      listeners.set(name, callbacks);
    },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    dispatchEvent(event) { for (const listener of [...listeners.get(event.type) ?? []]) listener(event); },
  };
  const document = Object.defineProperty({}, "cookie", {
    get() {
      if (blockCookie) throw new Error("Cookies disabled");
      return cookieValue;
    },
    set(value) {
      if (blockCookie) throw new Error("Cookies disabled");
      cookieWrites.push(value);
      cookieValue = value.split(";")[0];
    },
  });
  const reactMock = {
    useCallback: (fn) => fn,
    useMemo: (factory) => factory(),
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
      hooks.push({ subscribe, getSnapshot, getServerSnapshot });
      return serverOnly || hydrating ? getServerSnapshot() : getSnapshot();
    },
  };
  vm.runInNewContext(hookCode, {
    exports: storeModule.exports,
    module: storeModule,
    require(name) {
      if (name === "react") return reactMock;
      if (name === "@/lib/reader-settings") return routeModule.exports;
      throw new Error(`Unexpected dependency: ${name}`);
    },
    ...(!serverOnly ? {
      window: browserWindow,
      document,
      localStorage: {
        getItem(key) {
          if (blockStorage) throw new Error("Storage disabled");
          return storageValues.get(key) ?? null;
        },
        setItem(key, value) {
          if (blockStorage) throw new Error("Storage disabled");
          storageValues.set(key, value);
        },
      },
      Event: class { constructor(type) { this.type = type; } },
    } : {}),
  });
  const mounted = [];
  return {
    mount(seed = defaultReaderSettings) {
      const result = storeModule.exports.useReaderSettings(seed);
      const hook = hooks.at(-1);
      let notifications = 0;
      const unsubscribe = serverOnly ? () => {} : hook.subscribe(() => { notifications += 1; });
      mounted.push(unsubscribe);
      return { ...result, ...hook, notifications: () => notifications };
    },
    storageValues,
    cookieWrites,
    cookie: () => cookieValue,
    dispatchStorage(key, newValue) {
      if (newValue === null) storageValues.delete(key);
      else storageValues.set(key, newValue);
      browserWindow.dispatchEvent({ type: "storage", key, newValue });
    },
    unmount() { for (const unsubscribe of mounted) unsubscribe(); },
  };
}

test("server hydration snapshot uses request-scoped cookie seed instead of the default theme", () => {
  const server = settingsStoreHarness({ serverOnly: true });
  const first = server.mount({ theme: "dark", fontSize: 23, fontFamily: "serif", lineHeight: 2 });
  const second = server.mount({ theme: "sepia", fontSize: 17, fontFamily: "sans", lineHeight: 1.6 });
  assert.equal(first.getServerSnapshot().theme, "dark");
  assert.equal(second.getServerSnapshot().theme, "sepia");
  assert.strictEqual(first.getServerSnapshot(), first.getServerSnapshot());
});

test("valid SSR cookie takes priority over stale legacy localStorage preferences", () => {
  const seed = { theme: "dark", fontSize: 22, fontFamily: "serif", lineHeight: 2, width: "standard" };
  const store = settingsStoreHarness({ cookie: serializeReaderSettingsCookie(seed), storage: { reader_theme: "light" } });
  const reader = store.mount(seed);
  assert.deepEqual(asPlain(reader.settings), seed);
  assert.deepEqual(asPlain(reader.getServerSnapshot()), seed);
  assert.equal(store.storageValues.get("reader_theme"), "dark");
  store.unmount();
});

test("legacy preferences migrate to a versioned cookie without discarding font or spacing", () => {
  const store = settingsStoreHarness({ storage: { reader_theme: "sepia", reader_font_size: "24", reader_font_family: "serif", reader_line_height: "2.2" } });
  const reader = store.mount();
  assert.deepEqual(asPlain(reader.settings), { theme: "sepia", fontSize: 24, fontFamily: "serif", lineHeight: 2.2, width: "standard" });
  assert.equal(store.storageValues.get(readerSettingsCookieName), "2:sepia:24:serif:2.2:standard");
  assert.equal(store.cookie(), `${readerSettingsCookieName}=2:sepia:24:serif:2.2:standard`);
  assert.match(store.cookieWrites[0], /SameSite=Lax; Secure$/);
  store.unmount();
});

test("first hydration subscription migrates legacy settings even before React reads a client snapshot", () => {
  const store = settingsStoreHarness({ hydrating: true, storage: { reader_theme: "dark", reader_font_size: "23" } });
  const reader = store.mount();
  assert.equal(reader.settings.theme, "light"); // Matches server markup until hydration completes.
  assert.equal(reader.getSnapshot().theme, "dark");
  assert.equal(reader.getSnapshot().fontSize, 23);
  assert.equal(store.cookie(), `${readerSettingsCookieName}=2:dark:23:sans:1.8:standard`);
  store.unmount();
});

test("a stale/unknown cookie version cannot override validated legacy preferences", () => {
  const store = settingsStoreHarness({ cookie: "99:light:18:sans:1.8", storage: { reader_theme: "dark", reader_font_size: "20" } });
  assert.equal(store.mount().settings.theme, "dark");
  assert.match(store.cookie(), /=2:dark:20:sans:1.8:standard$/);
  store.unmount();
});

test("blocked cookie and localStorage still preserve settings and updates for the current session", () => {
  const seed = { theme: "dark", fontSize: 20, fontFamily: "sans", lineHeight: 1.8, width: "standard" };
  const store = settingsStoreHarness({ blockStorage: true, blockCookie: true });
  const reader = store.mount(seed);
  assert.deepEqual(asPlain(reader.settings), seed);
  reader.updateSettings({ theme: "sepia", fontSize: 21 });
  assert.equal(reader.getSnapshot().theme, "sepia");
  assert.equal(reader.getSnapshot().fontSize, 21);
  assert.equal(reader.notifications(), 1);
  store.unmount();
});

test("cross-tab setting changes notify subscribers, refresh snapshots and preserve SSR snapshots", () => {
  const store = settingsStoreHarness();
  const first = store.mount();
  const second = store.mount();
  store.dispatchStorage(readerSettingsCookieName, "2:mint:26:serif:2.2:wide");
  assert.equal(first.notifications(), 1);
  assert.equal(second.notifications(), 1);
  assert.equal(first.getSnapshot().theme, "mint");
  assert.equal(second.getSnapshot().fontSize, 26);
  assert.equal(first.getServerSnapshot().theme, "light");
  assert.match(store.cookie(), /=2:mint:26:serif:2.2:wide$/);
  store.unmount();
  store.dispatchStorage(readerSettingsCookieName, "1:sepia:18:sans:1.8");
  assert.equal(first.notifications(), 1);
});

test("legacy storage strings preserve the chosen reading preferences", () => {
  const result = parseReaderSettings({ theme: "dark", fontSize: "24", fontFamily: "serif", lineHeight: "2.2" });
  assert.equal(result.theme, "dark");
  assert.equal(result.fontSize, 24);
  assert.equal(result.fontFamily, "serif");
  assert.equal(result.lineHeight, 2.2);
});

const nodeRequire = createRequire(import.meta.url);
const React = nodeRequire("react");
const { renderToStaticMarkup } = nodeRequire("react-dom/server");
const [appearanceSource, layoutSource, loadingSource] = await Promise.all([
  readFile(new URL("../components/chapter/ReaderAppearance.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/(reader)/truyen/[slug]/[chapterSlug]/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/(reader)/truyen/[slug]/[chapterSlug]/loading.tsx", import.meta.url), "utf8"),
]);

function loadComponent(source, overrides = {}) {
  const componentModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports: componentModule.exports,
    module: componentModule,
    require(name) { return overrides[name] ?? nodeRequire(name); },
  });
  return componentModule.exports;
}

test("chapter layout renders cookie appearance into initial HTML, including its loading boundary", async () => {
  const settingsLibrary = routeModule.exports;
  const hook = loadComponent(hookSource, { "@/lib/reader-settings": settingsLibrary });
  const appearance = loadComponent(appearanceSource, {
    "@/hooks/useReaderSettings": hook,
    "@/lib/reader-settings": settingsLibrary,
  });
  const loading = loadComponent(loadingSource).default;
  let cookieValue = "1:dark:24:serif:2.2";
  const chapterLayout = loadComponent(layoutSource, {
    "next/headers": {
      cookies: async () => ({ get: (name) => name === readerSettingsCookieName ? { value: cookieValue } : undefined }),
    },
    "@/components/chapter/ReaderAppearance": appearance,
    "@/lib/reader-settings": settingsLibrary,
  }).default;

  const render = async () => renderToStaticMarkup(await chapterLayout({ children: React.createElement(loading) }));
  const dark = await render();
  assert.match(dark, /data-reader-theme="dark"/);
  assert.match(dark, /--reader-bg:#0b0d10/);
  assert.match(dark, /--reader-text:#e2e5ea/);
  assert.match(dark, /--reader-font-size:24px/);
  assert.match(dark, /--reader-font-family:var\(--font-reader-serif\), &#x27;Noto Serif&#x27;, serif/);
  assert.match(dark, /--reader-line-height:2.2/);
  assert.match(dark, /color-scheme:dark/);
  assert.match(dark, /role="status" aria-label="Đang tải chương truyện"/);
  assert.match(dark, /background-color:var\(--reader-bg, #fcfbf9\)/);

  // Another request must use its own seed, never the previous request's theme.
  cookieValue = "1:light:16:sans:1.6";
  const light = await render();
  assert.match(light, /data-reader-theme="light"/);
  assert.match(light, /--reader-bg:#f1f3f6/);
  assert.match(light, /--reader-font-size:16px/);
  assert.match(light, /color-scheme:light/);

  cookieValue = "99:oled:999:unknown:3";
  const fallback = await render();
  assert.match(fallback, /data-reader-theme="light"/);
  assert.match(fallback, /--reader-font-size:18px/);
});

test("reader semantic status colors stay readable on every chosen surface", () => {
  const luminance = (hex) => {
    const components = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return components[0] * 0.2126 + components[1] * 0.7152 + components[2] * 0.0722;
  };
  for (const theme of ["light", "sepia", "mint", "dark"]) {
    const variables = getReaderStyleVariables({ ...defaultReaderSettings, theme });
    const surface = luminance(variables["--reader-surface"]);
    for (const name of ["--reader-error", "--reader-success"]) {
      const foreground = luminance(variables[name]);
      const contrast = (Math.max(surface, foreground) + 0.05) / (Math.min(surface, foreground) + 0.05);
      assert.ok(contrast >= 4.5, `${theme} ${name} contrast is ${contrast}`);
    }
  }
});

test("width persists across cookies and legacy preferences migrate within new limits", () => {
  for (const width of ["narrow", "standard", "wide"]) {
    const settings = { ...defaultReaderSettings, width };
    assert.deepEqual(asPlain(parseReaderSettingsCookie(serializeReaderSettingsCookie(settings))), settings);
  }
  assert.equal(parseReaderSettingsCookie("1:oled:28:serif:2.2").theme, "dark");
  assert.equal(parseReaderSettingsCookie("1:oled:28:serif:2.2").fontSize, 26);
  assert.equal(parseReaderSettingsCookie("1:light:14:sans:1.6").fontSize, 16);
  assert.equal(parseReaderSettings({ width: "100vw" }).width, "standard");
  assert.equal(getReaderStyleVariables({ ...defaultReaderSettings, theme: "mint" })["--reader-paper"], "#E8F3EE");
});
