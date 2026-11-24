import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { loadNotificationModule } from "./notification-support.mjs";

const sourceTypes = loadNotificationModule("lib/scraper/types.ts");
const { importUrlSchema, ImportSourceError, terminal } = sourceTypes;
const { importErrorCode, importErrorMessage } = loadNotificationModule("lib/scraper/errors.ts", { "./types": sourceTypes });

const requireModule = createRequire(import.meta.url);
const { NextRequest, NextResponse } = requireModule("next/server");
const files = ["app/api/admin/stories/import-url/route.ts", "app/api/admin/stories/import-url/[jobId]/route.ts"];
const rawSources = await Promise.all(files.map(file => readFile(file, "utf8")));
const sources = rawSources.map(source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText);
const ID = "00000000-0000-4000-8000-000000000001";
const RESUMED_ID = "00000000-0000-4000-8000-000000000002";
const options = { url: "https://source.example/book", downloadImages: true, skipExisting: true, skipLocked: true };
const runningState = {
  id: ID, status: "running", storyTitle: "Story", totalChapters: 10, processedChapters: 2,
  savedChapters: 2, skippedChapters: 0, lockedChapters: 0, failedChapters: 0,
  downloadedImages: 0, logs: [], options, sourceUrl: options.url,
};

function fixture({
  authorized = true,
  owner = 7,
  networkError,
  enqueueError,
  resumeError,
  readError,
  state = runningState,
  resumedId = RESUMED_ID,
} = {}) {
  const calls = [];
  const invalidations = [];
  const asJob = value => value && ({ id: value.id, type: "IMPORT_NOVEL", state: value });
  const load = code => {
    const record = { exports: {} };
    vm.runInNewContext(code, {
      exports: record.exports,
      module: record,
      require(name) {
        if (name === "next/server") return { NextResponse };
        if (name === "@/lib/api") return { getRequestId: () => "11111111-1111-4111-8111-111111111111" };
        if (name === "@/lib/server/auth-session") {
          return { requireAdmin: async () => authorized
            ? { authorized: true, user: { idTaiKhoan: owner } }
            : { authorized: false, response: NextResponse.json({ message: "Unauthorized" }, { status: 403 }) } };
        }
        if (name === "@/lib/server/same-origin") {
          return { isSameOriginRequest: request => !request.headers.get("origin") || request.headers.get("origin") === request.nextUrl.origin };
        }
        if (name === "@/lib/server/background-jobs") {
          return { wakeBackgroundWorker: async id => { calls.push(["wake", id]); return true; } };
        }
        if (name === "@/lib/server/import-novel-jobs") {
          return {
            enqueueImportNovelJob: async (actor, input, requestId) => {
              calls.push(["enqueue", actor, input, requestId]);
              if (enqueueError) throw enqueueError;
              return { job: { id: ID }, created: true };
            },
            getOwnedImportNovelJob: async (id, actor) => {
              calls.push(["get", id, actor]);
              if (readError) throw readError;
              return asJob(state);
            },
            requestImportNovelCancellation: async (id, actor) => {
              calls.push(["cancel", id, actor]);
              return asJob(state && { ...state, status: "cancelling" });
            },
            resumeImportNovelJob: async (id, actor, requestId) => {
              calls.push(["resume", id, actor, requestId]);
              if (resumeError) throw resumeError;
              return resumedId ? { job: { id: resumedId }, created: true } : null;
            },
            serializeImportNovelJob: job => job.state,
          };
        }
        if (name === "@/lib/server/public-cache") {
          return { revalidatePublicStories: (...args) => invalidations.push(args) };
        }
        if (name === "@/schemas/background-job.schema") return { backgroundJobIdSchema: z.string().uuid() };
        if (name === "@/lib/scraper/types") return { importUrlSchema, terminal };
        if (name === "@/lib/scraper/errors") return { importErrorCode, importErrorMessage };
        if (name === "@/lib/scraper/network") {
          return { publicTarget: async url => { calls.push(["url", url]); if (networkError) throw networkError; } };
        }
        return requireModule(name);
      },
    });
    return record.exports;
  };
  return { create: load(sources[0]), detail: load(sources[1]), calls, invalidations };
}

function request(method, body, origin = "https://app.example") {
  return new NextRequest(`https://app.example/api/admin/stories/import-url/${ID}`, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const context = { params: Promise.resolve({ jobId: ID }) };

test("POST validates SSRF then enqueues IMPORT_NOVEL without Vercel after or RAM jobs", async () => {
  assert.doesNotMatch(rawSources[0], /\bafter\s*\(/);
  assert.doesNotMatch(rawSources[0], /scraper\/job-manager/);
  const f = fixture();
  const response = await f.create.POST(request("POST", { url: options.url }));
  assert.equal(response.status, 202);
  assert.equal((await response.json()).jobId, ID);
  assert.deepEqual(f.calls.map(call => call[0]), ["url", "enqueue", "wake"]);
  const enqueue = f.calls.find(call => call[0] === "enqueue");
  assert.equal(enqueue[1], 7);
  assert.equal(enqueue[2].maxChapters, undefined);
  assert.equal(enqueue[2].skipExisting, true);

  const invalid = fixture();
  assert.equal((await invalid.create.POST(request("POST", { url: options.url, maxChapters: 0 }))).status, 400);
  assert.equal(invalid.calls.length, 0);
  const blocked = fixture({ networkError: new ImportSourceError("URL nội bộ.", "SOURCE_ERROR") });
  assert.equal((await blocked.create.POST(request("POST", { url: "http://127.0.0.1/book" }))).status, 400);
  assert.ok(!blocked.calls.some(call => call[0] === "enqueue"));
});

test("GET and DELETE use owner-scoped TiDB jobs and preserve the ImportJob response shape", async () => {
  const f = fixture();
  const progress = await f.detail.GET(request("GET"), context);
  assert.equal(progress.status, 200);
  assert.deepEqual(await progress.json(), runningState);
  assert.deepEqual(f.calls[0], ["get", ID, 7]);
  assert.equal(f.invalidations.length, 0);

  const cancelled = await f.detail.DELETE(request("DELETE"), context);
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).status, "cancelling");
  assert.deepEqual(f.calls.find(call => call[0] === "cancel").slice(1), [ID, 7]);

  const completed = fixture({ state: { ...runningState, status: "completed", processedChapters: 10, savedChapters: 10 } });
  await completed.detail.GET(request("GET"), context);
  assert.deepEqual(completed.invalidations, [[undefined, true]]);
});

test("Admin auth and same-origin checks protect create, cancel and resume", async () => {
  const forbidden = fixture({ authorized: false });
  assert.equal((await forbidden.create.POST(request("POST", { url: options.url }))).status, 403);
  for (const method of ["GET", "DELETE", "POST"]) {
    assert.equal((await forbidden.detail[method](request(method), context)).status, 403);
  }
  assert.equal(forbidden.calls.length, 0);

  const f = fixture();
  assert.equal((await f.create.POST(request("POST", { url: options.url }, "https://evil.example"))).status, 403);
  assert.equal((await f.detail.DELETE(request("DELETE", undefined, "https://evil.example"), context)).status, 403);
  assert.equal((await f.detail.POST(request("POST", undefined, "https://evil.example"), context)).status, 403);
});

test("missing jobs, durable resume and cooldown errors retain existing API statuses", async () => {
  const missing = fixture({ state: null, resumedId: null });
  assert.equal((await missing.detail.GET(request("GET"), context)).status, 404);
  assert.equal((await missing.detail.DELETE(request("DELETE"), context)).status, 404);
  assert.equal((await missing.detail.POST(request("POST"), context)).status, 404);

  const resumed = fixture();
  const response = await resumed.detail.POST(request("POST"), context);
  assert.equal(response.status, 202);
  assert.equal((await response.json()).jobId, RESUMED_ID);
  assert.ok(resumed.calls.some(call => call[0] === "wake" && call[1] === RESUMED_ID));

  const cooling = fixture({ resumeError: new ImportSourceError("Hãy chờ nguồn.", "RATE_LIMITED") });
  const retry = await cooling.detail.POST(request("POST"), context);
  assert.equal(retry.status, 409);
  assert.equal((await retry.json()).code, "RATE_LIMITED");

  const corrupt = fixture({ readError: new ImportSourceError("Không đọc được checkpoint.", "CHECKPOINT_FAILED") });
  const error = await corrupt.detail.GET(request("GET"), context);
  assert.equal(error.status, 500);
  assert.equal((await error.json()).code, "CHECKPOINT_FAILED");
});
