import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { loadNotificationModule } from "./notification-support.mjs";

const sourceTypes = loadNotificationModule("lib/scraper/types.ts");
const { importUrlSchema, ImportSourceError } = sourceTypes;
const { importErrorCode, importErrorMessage } = loadNotificationModule("lib/scraper/errors.ts", { "./types": sourceTypes });

const requireModule = createRequire(import.meta.url);
const { NextRequest, NextResponse } = requireModule("next/server");
const files = ["app/api/admin/stories/import-url/route.ts", "app/api/admin/stories/import-url/[jobId]/route.ts"];
const sources = await Promise.all(files.map(async file => ts.transpileModule(await readFile(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText));
const ID = "00000000-0000-4000-8000-000000000001";
function fixture({ authorized = true, owner = 7, networkError, resumeError, readError, runError, state = { id: ID }, resumedId = ID } = {}) {
  const calls = [], deferred = [], invalidations = [];
  const load = code => {
    const record = { exports: {} };
    vm.runInNewContext(code, { exports: record.exports, module: record, require(name) {
      if (name === "next/server") return { NextResponse, after: work => deferred.push(work) };
      if (name === "@/lib/server/public-cache") return { revalidatePublicStories: (...args) => invalidations.push(args) };
      if (name === "@/lib/server/auth-session") return { requireAdmin: async () => authorized ? { authorized: true, user: { idTaiKhoan: owner } } : { authorized: false, response: NextResponse.json({ message: "Unauthorized" }, { status: 403 }) } };
      if (name === "@/lib/scraper/types") return { importUrlSchema };
      if (name === "@/lib/scraper/errors") return { importErrorCode, importErrorMessage };
      if (name === "@/lib/scraper/network") return { publicTarget: async url => { calls.push(["url", url]); if (networkError) throw networkError; } };
      if (name === "@/lib/scraper/job-manager") return {
        createJob: async (actor, input) => { calls.push(["create", actor, input]); return ID; },
        getJob: async (id, actor) => { calls.push(["get", id, actor]); if (readError) throw readError; return state; },
        cancelJob: async (id, actor) => { calls.push(["cancel", id, actor]); return state; },
        resumeJob: async (id, actor) => { calls.push(["resume", id, actor]); if (resumeError) throw resumeError; return resumedId; },
        runJob: async id => { calls.push(["run", id]); if (runError) throw runError; },
      };
      return requireModule(name);
    } });
    return record.exports;
  };
  return { create: load(sources[0]), detail: load(sources[1]), calls, deferred, invalidations };
}
function request(method, body, origin = "https://app.example") {
  return new NextRequest("https://app.example/api/admin/stories/import-url/" + ID, { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const context = { params: Promise.resolve({ jobId: ID }) };
test("URL imports expire public caches after deferred writes, including partial jobs that fail", async () => {
  for (const runError of [undefined, new Error("Partial import failed")]) {
    const f = fixture({ runError });
    assert.equal((await f.create.POST(request("POST", { url: "https://source.example/book" }))).status, 202);
    assert.equal(f.invalidations.length, 0);
    if (runError) await assert.rejects(f.deferred[0](), /Partial import failed/);
    else await f.deferred[0]();
    assert.equal(f.invalidations.length, 1);
    assert.equal(f.invalidations[0][1], true);
  }
});
test("all mode omits cap and schedules the asynchronous job only after auth/input/SSRF validation", async () => {
  const f = fixture();
  const response = await f.create.POST(request("POST", { url: "https://source.example/book" }));
  assert.equal(response.status, 202); assert.equal((await response.json()).jobId, ID);
  const call = f.calls.find(c => c[0] === "create"); assert.equal(call[1], 7); assert.equal(call[2].maxChapters, undefined); assert.equal(call[2].skipExisting, true);
  assert.equal(f.calls.filter(c => c[0] === "run").length, 0);
  await f.deferred[0](); assert.equal(f.calls.at(-1)[0], "run");
  assert.equal((await f.create.POST(request("POST", { url: "https://source.example", maxChapters: 0 }))).status, 400);
  const blocked = fixture({ networkError: Error("secret") });
  assert.equal((await blocked.create.POST(request("POST", { url: "http://127.1" }))).status, 400); assert.ok(!blocked.calls.some(c => c[0] === "create"));
});
test("create, progress, cancel and resume require Admin and mutation origin", async () => {
  const forbidden = fixture({ authorized: false });
  assert.equal((await forbidden.create.POST(request("POST", { url: "https://source.example/book" }))).status, 403);
  for (const method of ["GET", "DELETE", "POST"]) assert.equal((await forbidden.detail[method](request(method), context)).status, 403);
  assert.equal(forbidden.calls.length, 0);
  const f = fixture();
  assert.equal((await f.detail.POST(request("POST", undefined, "https://evil.example"), context)).status, 403);
  assert.equal((await f.detail.DELETE(request("DELETE", undefined, "https://evil.example"), context)).status, 403);
  assert.equal((await f.create.POST(request("POST", { url: "https://source.example" }, "https://evil.example"))).status, 403);
});
test("progress and resume await owner-scoped state and preserve safe recovery reasons", async () => {
  const missing = fixture({ state: null, resumedId: null });
  assert.equal((await missing.detail.GET(request("GET"), context)).status, 404);
  assert.equal((await missing.detail.POST(request("POST"), context)).status, 404);
  const resumed = fixture(); assert.equal((await resumed.detail.POST(request("POST"), context)).status, 202);
  assert.equal(resumed.calls[0][2], 7); assert.equal(resumed.deferred.length, 1);
  const cooling = fixture({ resumeError: new ImportSourceError("Hãy chờ nguồn.", "RATE_LIMITED") });
  const r = await cooling.detail.POST(request("POST"), context); assert.equal(r.status, 409); assert.equal((await r.json()).code, "RATE_LIMITED");
  const corrupt = fixture({ readError: new ImportSourceError("Không đọc được checkpoint.", "CHECKPOINT_FAILED") });
  const error = await corrupt.detail.GET(request("GET"), context); assert.equal(error.status, 500); assert.equal((await error.json()).code, "CHECKPOINT_FAILED");
});
