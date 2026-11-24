import assert from "node:assert/strict";
import test from "node:test";
import { enqueueBackgroundJob, requestBackgroundJobCancellation, wakeBackgroundWorker } from "../lib/server/background-jobs.ts";
import { assertImportSourceAvailable, serializeImportNovelJob } from "../lib/server/import-novel-jobs.ts";
import { backgroundJobDiagnosticSchema, importNovelJobPayloadSchema } from "../schemas/background-job.schema.ts";
import { loadWorkerConfig } from "../socket-server/jobs/config.ts";
import { buildJobPoolOptions } from "../socket-server/jobs/database.ts";
import { safeJobErrorDetails } from "../socket-server/jobs/errors.ts";
import { jobHandlers } from "../socket-server/jobs/handlers/index.ts";
import { createImportNovelHandler } from "../socket-server/jobs/handlers/import-novel.ts";
import { JobRunner } from "../socket-server/jobs/runner.ts";
import { downloadImportImage } from "../socket-server/importer/media.ts";

function storedJob(data) {
  const now = new Date();
  return {
    progress: 0,
    attempts: 0,
    result: null,
    lockedBy: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    lastError: null,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
    ...data,
  };
}

function memoryClient() {
  const jobs = new Map();
  const matches = (job, where) => {
    if (where.id !== undefined && job.id !== where.id) return false;
    if (where.ownerId !== undefined && job.ownerId !== where.ownerId) return false;
    if (typeof where.status === "string" && job.status !== where.status) return false;
    if (where.status?.in && !where.status.in.includes(job.status)) return false;
    return true;
  };
  return {
    jobs,
    backgroundJob: {
      async findUnique({ where }) {
        if (where.id) return jobs.get(where.id) ?? null;
        return [...jobs.values()].find((job) => job.dedupeKey === where.dedupeKey) ?? null;
      },
      async findFirst({ where }) {
        return [...jobs.values()].find((job) => matches(job, where)) ?? null;
      },
      async create({ data }) {
        const job = storedJob(data);
        jobs.set(job.id, job);
        return job;
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const [id, job] of jobs) {
          if (!matches(job, where)) continue;
          jobs.set(id, { ...job, ...data, updatedAt: new Date() });
          count++;
        }
        return { count };
      },
    },
  };
}

test("background job input validates bounded noop payloads", () => {
  assert.equal(backgroundJobDiagnosticSchema.parse({}).delayMs, 100);
  assert.equal(backgroundJobDiagnosticSchema.safeParse({ delayMs: 30_001 }).success, false);
  assert.equal(backgroundJobDiagnosticSchema.safeParse({ message: "", delayMs: 0 }).success, false);
});

test("IMPORT_NOVEL payload accepts only public import options and a positive owner", () => {
  const valid = importNovelJobPayloadSchema.parse({
    url: "https://source.example/book",
    downloadImages: true,
    skipExisting: true,
    skipLocked: true,
    userId: 7,
    requestId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(valid.userId, 7);
  assert.equal(importNovelJobPayloadSchema.safeParse({ ...valid, url: "file:///etc/passwd" }).success, false);
  assert.equal(importNovelJobPayloadSchema.safeParse({ ...valid, url: "https://source.example:8443/book" }).success, false);
  assert.equal(importNovelJobPayloadSchema.safeParse({ ...valid, userId: 0 }).success, false);
  assert.equal(importNovelJobPayloadSchema.safeParse({ ...valid, secret: "unexpected" }).success, false);
});

test("enqueue is idempotent by dedupe key and cancellation preserves ownership", async () => {
  const db = memoryClient();
  const input = {
    type: "system.noop",
    payload: { message: "queue smoke test", delayMs: 0 },
    ownerId: 7,
    dedupeKey: "noop:test:7",
  };
  const first = await enqueueBackgroundJob(input, db);
  const repeated = await enqueueBackgroundJob(input, db);
  assert.equal(first.created, true);
  assert.equal(repeated.created, false);
  assert.equal(repeated.job.id, first.job.id);
  assert.equal(db.jobs.size, 1);

  assert.equal(await requestBackgroundJobCancellation(first.job.id, 99, db), null);
  const cancelled = await requestBackgroundJobCancellation(first.job.id, 7, db);
  assert.equal(cancelled.status, "cancelled");
  assert.ok(cancelled.finishedAt instanceof Date);
});

test("worker wake uses only the configured Render URL and internal token", async (t) => {
  const previousUrl = process.env.SOCKET_SERVER_URL;
  const previousToken = process.env.INTERNAL_SECRET_TOKEN;
  t.after(() => {
    if (previousUrl === undefined) delete process.env.SOCKET_SERVER_URL; else process.env.SOCKET_SERVER_URL = previousUrl;
    if (previousToken === undefined) delete process.env.INTERNAL_SECRET_TOKEN; else process.env.INTERNAL_SECRET_TOKEN = previousToken;
  });
  process.env.SOCKET_SERVER_URL = "https://realtime.example.com/";
  process.env.INTERNAL_SECRET_TOKEN = "test-internal-token";
  let request;
  const awakened = await wakeBackgroundWorker("be3cd388-bc1a-481d-bd70-b5a7c85acafa", async (url, options) => {
    request = { url: url.href, options };
    return new Response(null, { status: 202 });
  });
  assert.equal(awakened, true);
  assert.equal(request.url, "https://realtime.example.com/api/internal/jobs/wake");
  assert.equal(request.options.headers.Authorization, "Bearer test-internal-token");
  assert.deepEqual(JSON.parse(request.options.body), { jobId: "be3cd388-bc1a-481d-bd70-b5a7c85acafa" });
});

function claimedJob(overrides = {}) {
  return {
    id: "be3cd388-bc1a-481d-bd70-b5a7c85acafa",
    type: "system.noop",
    status: "running",
    payload: { message: "worker ready", delayMs: 0 },
    progress: 0,
    priority: 0,
    attempts: 1,
    maxAttempts: 3,
    ownerId: 7,
    runAt: new Date(),
    leaseExpiresAt: new Date(Date.now() + 90_000),
    ...overrides,
  };
}

test("runner executes noop and stores completion", async () => {
  const progress = [];
  let available = claimedJob();
  let completion;
  const repository = {
    async recoverExpiredJobs() { return { cancelled: 0, failed: 0 }; },
    async claimNext() { const job = available; available = null; return job; },
    async heartbeat() { return "running"; },
    async controlStatus() { return "running"; },
    async updateProgress(_id, _worker, value) { progress.push(value); },
    async complete(_id, _worker, result) { completion = result; return true; },
    async cancel() { throw new Error("unexpected cancellation"); },
    async fail() { throw new Error("unexpected failure"); },
  };
  const runner = new JobRunner(repository, jobHandlers, { concurrency: 1, heartbeatMs: 5_000, pollMs: 1, idlePollMs: 1 });
  assert.equal(await runner.runOnce("worker:test"), true);
  assert.deepEqual(progress, [10, 90]);
  assert.deepEqual(completion, { message: "worker ready" });
  assert.equal(await runner.runOnce("worker:test"), false);
  runner.stop();
});

test("runner converts cancellation requests into terminal cancellation", async () => {
  let cancelled = false;
  const repository = {
    async recoverExpiredJobs() { return { cancelled: 0, failed: 0 }; },
    async claimNext() { return claimedJob({ payload: { message: "cancel me", delayMs: 100 } }); },
    async heartbeat() { return "cancel_requested"; },
    async controlStatus() { return "cancel_requested"; },
    async updateProgress() {},
    async complete() { throw new Error("unexpected completion"); },
    async cancel() { cancelled = true; return true; },
    async fail() { throw new Error("unexpected failure"); },
  };
  const runner = new JobRunner(repository, jobHandlers, { concurrency: 1, heartbeatMs: 5, pollMs: 1, idlePollMs: 1 });
  await runner.runOnce("worker:test");
  assert.equal(cancelled, true);
  runner.stop();
});

test("runner honors a cancellation racing with final completion", async () => {
  let cancelled = false;
  let controlChecks = 0;
  const repository = {
    async recoverExpiredJobs() { return { cancelled: 0, failed: 0 }; },
    async claimNext() { return claimedJob(); },
    async heartbeat() { return "running"; },
    async controlStatus() { controlChecks++; return "cancel_requested"; },
    async updateProgress() {},
    async complete() { return false; },
    async cancel() { cancelled = true; return true; },
    async fail() { throw new Error("unexpected failure"); },
  };
  const runner = new JobRunner(repository, jobHandlers, { concurrency: 1, heartbeatMs: 5_000, pollMs: 1, idlePollMs: 1 });
  await runner.runOnce("worker:test");
  assert.equal(controlChecks, 1);
  assert.equal(cancelled, true);
  runner.stop();
});

test("runner retries transient failures but permanently fails invalid payloads", async () => {
  const outcomes = [];
  let current = claimedJob({ type: "temporary.failure" });
  const repository = {
    async recoverExpiredJobs() { return { cancelled: 0, failed: 0 }; },
    async claimNext() { const value = current; current = null; return value; },
    async heartbeat() { return "running"; },
    async controlStatus() { return "running"; },
    async updateProgress() {},
    async complete() { throw new Error("unexpected completion"); },
    async cancel() { throw new Error("unexpected cancellation"); },
    async fail(_job, _worker, _error, retryable) { outcomes.push(retryable); return retryable ? "retry" : "failed"; },
  };
  const handlers = new Map([["temporary.failure", async () => { throw new Error("temporary outage"); }]]);
  const runner = new JobRunner(repository, handlers, { concurrency: 1, heartbeatMs: 5_000, pollMs: 1, idlePollMs: 1 });
  await runner.runOnce("worker:test");

  current = claimedJob({ payload: { message: "missing delay" } });
  await runner.runOnce("worker:test");
  assert.deepEqual(outcomes, [true, false]);
  runner.stop();
});

function importStory(count) {
  return {
    title: "Worker Story",
    slug: "worker-story",
    description: "",
    authors: [],
    genres: [],
    completed: false,
    views: 0,
    catalogueComplete: true,
    chapters: Array.from({ length: count }, (_, index) => ({
      number: index + 1,
      title: `Chương ${index + 1}`,
      url: `https://source.example/chapter-${index + 1}`,
    })),
  };
}

function importContext(signal, snapshots) {
  return {
    job: claimedJob({ type: "IMPORT_NOVEL", payload: null }),
    signal,
    async reportProgress(progress, result) { snapshots.push({ progress, result }); },
  };
}

function importDependencies(count, overrides = {}) {
  const saved = new Set();
  return {
    saved,
    dependencies: {
      storage: {
        async ensureDatabase() {},
        async findStory() { return { idTruyen: 9, slug: "worker-story", anhBia: "", isDeleted: false }; },
        async existingChapterNumbers() { return new Set(); },
        async createStoryWithChapter() { throw new Error("unexpected story creation"); },
        async storeChapter(_storyId, ref) { saved.add(ref.number); return true; },
        async refreshChapterCount() {},
      },
      async downloadImage() { throw new Error("images are disabled in this fixture"); },
      async scrapeStory() { return importStory(count); },
      async scrapeChapter() { return "Nội dung chương công khai đủ dài để worker kiểm tra và lưu an toàn. ".repeat(2); },
      ...overrides,
    },
  };
}

test("IMPORT_NOVEL handler writes batched progress snapshots and returns the legacy result shape", async () => {
  const snapshots = [];
  const fixture = importDependencies(7);
  const handler = createImportNovelHandler({}, fixture.dependencies);
  const controller = new AbortController();
  const context = importContext(controller.signal, snapshots);
  context.job.ownerId = 7;
  const result = await handler({
    url: "https://source.example/book#chapter-list",
    downloadImages: false,
    skipExisting: true,
    skipLocked: true,
    userId: 7,
  }, context);

  assert.equal(result.status, "completed");
  assert.equal(result.sourceUrl, "https://source.example/book");
  assert.equal(result.savedChapters, 7);
  assert.equal(fixture.saved.size, 7);
  assert.ok(snapshots.some(snapshot => snapshot.result.phase === "chapters" && snapshot.result.processedChapters >= 5));
  assert.equal(snapshots.at(-1).result.status, "completed");
  assert.ok(snapshots.at(-1).progress >= snapshots[0].progress);
});

test("IMPORT_NOVEL handler stops mid-run through AbortSignal and reports cancellation", async () => {
  const snapshots = [];
  const controller = new AbortController();
  let started;
  const chapterStarted = new Promise(resolve => { started = resolve; });
  const fixture = importDependencies(4, {
    async scrapeChapter(_ref, client) {
      started();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 5_000);
        client.signal.addEventListener("abort", () => { clearTimeout(timer); reject(client.signal.reason); }, { once: true });
      });
      return "unreachable";
    },
  });
  const handler = createImportNovelHandler({}, fixture.dependencies);
  const context = importContext(controller.signal, snapshots);
  context.job.ownerId = 7;
  const running = handler({
    url: "https://source.example/book",
    downloadImages: false,
    skipExisting: true,
    skipLocked: true,
    userId: 7,
  }, context);
  await chapterStarted;
  controller.abort(new Error("Admin requested cancellation"));
  await assert.rejects(running, /cancellation/i);
  assert.equal(fixture.saved.size, 0);
  assert.equal(snapshots.at(-1).result.status, "cancelled");
});

test("worker validates remote images and uploads them to the configured Cloudinary folder", async (t) => {
  const names = ["CLOUDINARY_URL", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  t.after(() => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
  delete process.env.CLOUDINARY_URL;
  process.env.CLOUDINARY_CLOUD_NAME = "worker-test";
  process.env.CLOUDINARY_API_KEY = "test-key";
  process.env.CLOUDINARY_API_SECRET = "test-secret";
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json({ secure_url: "https://res.cloudinary.com/worker-test/image/upload/v1/chapter.webp" });
  });
  const controller = new AbortController();
  const client = {
    signal: controller.signal,
    async get() { return { type: "image/png", url: "https://source.example/chapter.png", bytes: Buffer.from("image") }; },
  };
  let counted = 0;
  const result = await downloadImportImage(
    "/chapter.png",
    "https://source.example/chapter-1",
    "chapters/worker-story",
    client,
    () => { counted++; },
  );
  assert.equal(result, "https://res.cloudinary.com/worker-test/image/upload/v1/chapter.webp");
  assert.equal(counted, 1);
  assert.equal(requests[0].url, "https://api.cloudinary.com/v1_1/worker-test/image/upload");
  assert.equal(requests[0].init.body.get("folder"), "web-novel/chapters/worker-story");
  assert.equal(requests[0].init.body.has("api_secret"), false);
});

test("import serialization maps queue control states and source cooldown from TiDB results", async () => {
  const payload = {
    url: "https://source.example/book",
    downloadImages: false,
    skipExisting: true,
    skipLocked: true,
    userId: 7,
  };
  const result = {
    id: claimedJob().id,
    status: "running",
    storyTitle: "Worker Story",
    totalChapters: 10,
    processedChapters: 4,
    savedChapters: 4,
    skippedChapters: 0,
    lockedChapters: 0,
    failedChapters: 0,
    downloadedImages: 0,
    logs: [],
    options: { ...payload, userId: undefined },
    sourceUrl: payload.url,
    retryAt: Date.now() + 30_000,
  };
  delete result.options.userId;
  const background = storedJob({
    id: result.id,
    type: "IMPORT_NOVEL",
    status: "cancel_requested",
    payload,
    result,
    priority: 0,
    maxAttempts: 3,
    runAt: new Date(),
    dedupeKey: null,
    ownerId: 7,
  });
  assert.equal(serializeImportNovelJob(background).status, "cancelling");
  assert.equal(serializeImportNovelJob({ ...background, status: "cancelled" }).status, "cancelled");

  const db = { backgroundJob: { async findMany() { return [background]; } } };
  await assert.rejects(
    assertImportSourceAvailable({ ...result.options, url: "https://source.example/other-book" }, db),
    error => error.code === "RATE_LIMITED",
  );
  await assert.rejects(
    assertImportSourceAvailable(result.options, db),
    error => error.code === "JOB_BUSY",
  );
});

test("worker config requires database settings and a safe heartbeat ratio", () => {
  const base = {
    DATABASE_URL: "mysql://worker:secret@example.tidbcloud.com:4000/web_novel",
    JOB_LEASE_MS: "90000",
    JOB_HEARTBEAT_MS: "20000",
  };
  assert.equal(loadWorkerConfig(base).database.connectionLimit, 3);
  assert.throws(() => loadWorkerConfig({}), /DATABASE_URL/);
  assert.throws(() => loadWorkerConfig({ ...base, JOB_HEARTBEAT_MS: "50000" }), /Heartbeat/);
});

test("worker converts Prisma TiDB URLs into explicit TLS pool options", () => {
  const config = loadWorkerConfig({
    DATABASE_URL: "mysql://worker%40team:p%40ss%3Aword@gateway01.ap-southeast-1.prod.aws.tidbcloud.com/web_novel?sslaccept=strict",
  });
  const options = buildJobPoolOptions(config.database);

  assert.equal(options.host, "gateway01.ap-southeast-1.prod.aws.tidbcloud.com");
  assert.equal(options.port, 4_000);
  assert.equal(options.user, "worker@team");
  assert.equal(options.password, "p@ss:word");
  assert.equal(options.database, "web_novel");
  assert.equal(options.connectionLimit, 3);
  assert.equal(options.acquireTimeout, 20_000);
  assert.equal(options.connectTimeout, 15_000);
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
});

test("worker enables TLS for supported URL flags without logging credentials", () => {
  for (const query of ["sslaccept=strict", "ssl-mode=VERIFY_IDENTITY", "ssl=true"]) {
    const config = loadWorkerConfig({ DATABASE_URL: `mysql://worker:secret@db.example.com/jobs?${query}` });
    assert.deepEqual(buildJobPoolOptions(config.database).ssl, { rejectUnauthorized: true });
  }

  const failure = new Error("pool failed to retrieve a connection", {
    cause: new Error("password=super-secret mysql://worker:super-secret@db.example.com/jobs"),
  });
  const details = safeJobErrorDetails(failure);
  assert.equal(details.error, "pool failed to retrieve a connection");
  assert.equal(details.cause.includes("super-secret"), false);
  assert.match(details.cause, /\[redacted\]/u);
});
