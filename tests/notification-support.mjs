import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
export function loadNotificationModule(file, imports = {}, globals = {}) {
  const source = ts.transpileModule(readFileSync(new URL(file, root), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(source, {
    module: loaded, exports: loaded.exports, console, process, URL, URLSearchParams, AbortController, AbortSignal,
    Event, CustomEvent, setTimeout, clearTimeout, setInterval, clearInterval, TextEncoder, fetch,
    require: (name) => name === "server-only" ? {} : name in imports ? imports[name] : require(name), ...globals,
  }, { filename: file });
  return loaded.exports;
}
