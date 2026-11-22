import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(await readFile(
  new URL("../lib/auth-redirect.ts", import.meta.url), "utf8",
), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const redirectModule = { exports: {} };
vm.runInNewContext(compiled, { module: redirectModule, exports: redirectModule.exports, URL });
const { safeAuthRedirect } = redirectModule.exports;

test("preserves valid internal reading URLs with query parameters and hash", () => {
  for (const destination of [
    "/",
    "/tu-sach",
    "/truyen/truyen-a/chuong-5",
    "/truyen/truyen-a/chuong-5?font=serif&theme=dark#paragraph-2",
    "/tim-kiem?q=truy%E1%BB%87n&tag=a%26b",
    "/tim-kiem?q=https%3A%2F%2Fexample.com",
  ]) assert.equal(safeAuthRedirect(destination), destination);
});

test("defaults to home for absent or malformed destinations", () => {
  for (const destination of [null, undefined, "", "truyen/truyen-a", "/truyen/%invalid"]) {
    assert.equal(safeAuthRedirect(destination), "/");
  }
});

test("rejects executable schemes and external or protocol-relative URLs", () => {
  for (const destination of [
    "javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,unsafe",
    "https://external.example/path", "http://web-novel.invalid/path",
    "//external.example/path", "///external.example/path", " /truyen/truyen-a",
  ]) assert.equal(safeAuthRedirect(destination), "/");
});

test("rejects raw control characters, backslashes and escaped leading separators", () => {
  for (const destination of [
    "/\\external.example/path", "/truyen\\chapter", "/truyen\n/chapter", "/\rexternal.example",
    "/truyen\tchapter", "/truyen\u0000chapter", "/truyen\u007fchapter",
    "/%2fexternal.example", "/%2f%2fexternal.example", "/%5cexternal.example",
    "/%0aexternal.example", "/%0dexternal.example", "/%00external.example",
    "/%252fexternal.example", "/%255cexternal.example", "/%250aexternal.example",
    "/safe/..//external.example", "/safe/%2e%2e//external.example",
    "/truyen/a?text=%0a", "/truyen/a?text=%5c", "/truyen/a#%7f",
  ]) assert.equal(safeAuthRedirect(destination), "/", destination);
});

test("encoding auth links preserves the complete destination as a single parameter", () => {
  const destination = safeAuthRedirect("/truyen/a/chuong-1?next=2&theme=dark#section-3");
  const registerLink = `/dang-ky?redirect=${encodeURIComponent(destination)}`;
  const returned = new URL(registerLink, "https://webnovel.example").searchParams.get("redirect");
  assert.equal(returned, destination);
  assert.equal(safeAuthRedirect(returned), destination);
});
