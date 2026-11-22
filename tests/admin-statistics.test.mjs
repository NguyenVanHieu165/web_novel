import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const current = { exports: {} };
const source = await readFile(new URL("../lib/admin-statistics.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
vm.runInThisContext("(function (exports, require) { " + compiled.outputText + "\n})")(current.exports, require);
const { statisticsFilters, statisticsPoints, statisticsWindow } = current.exports;

test("dashboard defaults to revenue from the first day of the current Vietnam month through today", () => {
  const filters = statisticsFilters.parse({});
  assert.equal(filters.metric, "revenue");
  const november = statisticsWindow(filters, new Date("2026-11-21T04:00:00.000Z"));
  assert.equal(november.from, "2026-11-01");
  assert.equal(november.to, "2026-11-21");
  assert.equal(november.group, "day");
  assert.equal(november.start.toISOString(), "2026-10-31T17:00:00.000Z");
  const december = statisticsWindow(filters, new Date("2026-11-30T17:00:00.000Z"));
  assert.equal(december.from, "2026-12-01");
  assert.equal(december.to, "2026-12-01");
});

test("revenue points group revenue and successful invoice counts in the same buckets", () => {
  const amounts = new Map([["2026-11-01", 40000], ["2026-11-02", 20000], ["2026-11-03", 10000]]);
  const bills = new Map([["2026-11-01", 1], ["2026-11-02", 2], ["2026-11-03", 1]]);
  assert.deepEqual(statisticsPoints({ group: "week", from: "2026-11-01", to: "2026-11-09" }, amounts, bills), [
    { from: "2026-11-01", to: "2026-11-01", value: 40000, billCount: 1 },
    { from: "2026-11-02", to: "2026-11-08", value: 30000, billCount: 3 },
    { from: "2026-11-09", to: "2026-11-09", value: 0, billCount: 0 },
  ]);
});

test("relative ranges use the Vietnam calendar at UTC midnight boundaries", () => {
  const filters = statisticsFilters.parse({ range: "7d" });
  const window = statisticsWindow(filters, new Date("2026-12-31T17:00:00.000Z"));
  assert.equal(window.from, "2026-12-26");
  assert.equal(window.to, "2027-01-01");
  assert.equal(window.start.toISOString(), "2026-12-25T17:00:00.000Z");
  assert.equal(window.end.toISOString(), "2027-01-01T17:00:00.000Z");
});

test("custom ranges reject invalid, reversed, missing or excessively wide dates", () => {
  for (const [from, to] of [
    ["2026-02-29", "2026-03-01"],
    ["2026-11-22", "2026-11-21"],
    ["2025-01-01", "2026-01-02"],
    ["2026-11-22", undefined],
  ]) {
    assert.equal(statisticsFilters.safeParse({ range: "custom", from, to }).success, false);
  }
  assert.equal(statisticsFilters.safeParse({ metric: "views" }).success, false);
  assert.equal(statisticsFilters.safeParse({ range: "custom", from: "2024-01-01", to: "2024-12-31" }).success, true);
});

test("weekly series starts a new bucket on Monday and fills dates with no activity", () => {
  const values = new Map([["2026-11-01", 4], ["2026-11-02", 2], ["2026-11-16", 7]]);
  assert.deepEqual(statisticsPoints({ group: "week", from: "2026-11-01", to: "2026-11-16" }, values), [
    { from: "2026-11-01", to: "2026-11-01", value: 4 },
    { from: "2026-11-02", to: "2026-11-08", value: 2 },
    { from: "2026-11-09", to: "2026-11-15", value: 0 },
    { from: "2026-11-16", to: "2026-11-16", value: 7 },
  ]);
});

test("monthly series clips partial buckets and crosses the leap-day boundary", () => {
  const values = new Map([["2024-02-28", 3], ["2024-02-29", 2], ["2024-03-01", 9]]);
  assert.deepEqual(statisticsPoints({ group: "month", from: "2024-02-28", to: "2024-03-02" }, values), [
    { from: "2024-02-28", to: "2024-02-29", value: 5 },
    { from: "2024-03-01", to: "2024-03-02", value: 9 },
  ]);
});
