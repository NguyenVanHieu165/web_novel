import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { sourceClient, safeRequest, pause, selectPublicAddress } from "../lib/scraper/network.ts";
import { SourceRateLimitError, SourceBlockedError } from "../lib/scraper/types.ts";
import { importErrorCode } from "../lib/scraper/errors.ts";

function virtualRuntime(request, initial = 1700000000000) {
  let now = initial;
  const sleeps = [];
  return { sleeps, now: () => now, async sleep(ms, signal) { signal.throwIfAborted(); sleeps.push(ms); now += ms; }, request: (...args) => request(...args) };
}
const response = (url = "https://example.com/canonical/") => ({ bytes: Buffer.from("<h1>Story</h1>"), type: "text/html; charset=utf-8", url });

test("Retry-After accepts seconds, HTTP-date, body seconds and never shortens the longest declaration", () => {
  const now = 1700000000000;
  assert.equal(new SourceRateLimitError(429, "30", undefined, now).retryAt, now + 30000);
  assert.equal(new SourceRateLimitError(503, new Date(now + 60000).toUTCString(), 20, now).retryAt, now + 60000);
  assert.equal(new SourceRateLimitError(429, "30", 45, now).retryAt, now + 45000);
  assert.equal(new SourceRateLimitError(429, "invalid", -4, now).retryAt, now + 3000);
});

test("source client waits for declared cooldown, then resumes the same request without truncating the wait", async () => {
  let calls = 0, firstAt = 0;
  const waiting = [], resumed = [];
  const controller = new AbortController();
  const runtime = virtualRuntime(async url => {
    calls++;
    if (calls === 1) { firstAt = runtime.now(); throw new SourceRateLimitError(429, "30", undefined, firstAt); }
    assert.ok(runtime.now() >= firstAt + 30000);
    return response(url);
  });
  const client = sourceClient(controller.signal, { waiting(at) { waiting.push(at); }, resumed() { resumed.push(runtime.now()); } }, runtime);
  const result = await client.get("https://example.com/story");
  assert.equal(result.url, "https://example.com/story"); assert.equal(calls, 2);
  assert.equal(waiting.length, 1); assert.equal(resumed.length, 1);
  assert.ok(runtime.sleeps.some(ms => ms > 20000));
});

test("a long server cooldown is returned for checkpoint/resume instead of consuming the invocation lifetime", async () => {
  let calls = 0; const events = [];
  const runtime = virtualRuntime(async () => { calls++; throw new SourceRateLimitError(429, undefined, 3600, runtime.now()); });
  const client = sourceClient(new AbortController().signal, { waiting(at) { events.push(at); } }, runtime);
  await assert.rejects(client.get("https://example.com/story"), error => error instanceof SourceRateLimitError && error.retryAt > runtime.now() + 3500000);
  assert.equal(calls, 1); assert.equal(events.length, 1);
  assert.ok(runtime.sleeps.every(ms => ms <= 400));
});

test("rate-limit retries are bounded and security blocks are never retried", async () => {
  let calls = 0;
  const runtime = virtualRuntime(async () => { calls++; throw new SourceRateLimitError(503, "3", undefined, runtime.now()); });
  await assert.rejects(sourceClient(new AbortController().signal, {}, runtime).get("https://example.com/story"), SourceRateLimitError);
  assert.equal(calls, 4);
  calls = 0;
  const blocked = virtualRuntime(async () => { calls++; throw new SourceBlockedError(); });
  await assert.rejects(sourceClient(new AbortController().signal, {}, blocked).get("https://example.com/story"), SourceBlockedError);
  assert.equal(calls, 1);
});

test("cancellation during shared cooldown stops retries immediately", async () => {
  let calls = 0; const controller = new AbortController();
  const runtime = virtualRuntime(async () => { calls++; throw new SourceRateLimitError(429, "30", undefined, runtime.now()); });
  const client = sourceClient(controller.signal, { waiting() { controller.abort(new Error("cancelled by admin")); } }, runtime);
  await assert.rejects(client.get("https://example.com/story"), /cancelled by admin/);
  assert.equal(calls, 1);
  const waitController = new AbortController(); const waiting = pause(60000, waitController.signal); waitController.abort(new Error("stop")); await assert.rejects(waiting, /stop/);
});

test("real socket-timeout error shape retries transient timeouts but never retries an Admin abort", async () => {
  let calls = 0;
  const timeout = Object.assign(new Error("The operation was aborted", { cause: new DOMException("Deadline", "TimeoutError") }), { code: "ABORT_ERR" });
  assert.equal(importErrorCode(timeout), "NETWORK_FAILED");
  const runtime = virtualRuntime(async url => { calls++; if (calls < 3) throw timeout; return response(url); });
  await sourceClient(new AbortController().signal, {}, runtime).get("https://example.com/story");
  assert.equal(calls, 3); assert.ok(runtime.sleeps.includes(1000)); assert.ok(runtime.sleeps.includes(2000));
  const controller = new AbortController(); calls = 0;
  const aborted = virtualRuntime(async () => { calls++; controller.abort(new Error("Admin stopped import")); throw timeout; });
  await assert.rejects(sourceClient(controller.signal, {}, aborted).get("https://example.com/story"), /Admin stopped import/);
  assert.equal(calls, 1);
});

test("document keeps final redirect URL and honors the declared charset for relative catalogue/media links", async () => {
  const runtime = virtualRuntime(async () => ({ bytes: Buffer.from([0x3c, 0x70, 0x3e, 0xe9, 0x3c, 0x2f, 0x70, 0x3e]), type: "text/html; charset=windows-1252", url: "https://example.com/books/story/" }));
  const document = await sourceClient(new AbortController().signal, {}, runtime).document("https://example.com/story");
  assert.equal(document.url, "https://example.com/books/story/"); assert.equal(document.html, "<p>é</p>");
});

test("public IP selection rejects private DNS answers and retains public IPv6-only destinations", () => {
  assert.equal(selectPublicAddress([{ address: "2606:4700:4700::1111", family: 6 }, { address: "8.8.8.8", family: 4 }]), "8.8.8.8");
  assert.equal(selectPublicAddress([{ address: "2606:4700:4700::1111", family: 6 }]), "2606:4700:4700::1111");
  assert.throws(() => selectPublicAddress([{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }]));
});

test("socket requests keep credentials absent, validate redirect targets and preserve a safe final URL", async t => {
  const options = [];
  t.mock.method(http, "request", (input, callback) => {
    options.push(input);
    assert.equal(input.headers.Cookie, undefined); assert.equal(input.headers.Authorization, undefined);
    assert.match(input.headers["User-Agent"], /^Mozilla\//); assert.match(input.headers.Accept, /text\/html/);
    assert.match(input.headers["Accept-Language"], /^vi-VN/); assert.equal(input.headers.Referer, "http://8.8.8.8/book");
    const req = new EventEmitter();
    req.end = () => {
      const res = Readable.from(options.length === 1 ? [] : [Buffer.from("<p>Final</p>")]);
      res.statusCode = options.length === 1 ? 302 : 200;
      res.headers = options.length === 1 ? { location: "/canonical/" } : { "content-type": "text/html" };
      callback(res);
    };
    return req;
  });
  const result = await safeRequest("http://8.8.8.8/story", AbortSignal.timeout(1000), undefined, 0, "http://8.8.8.8/book");
  assert.equal(result.url, "http://8.8.8.8/canonical/"); assert.equal(options.length, 2);
  await assert.rejects(safeRequest("http://user:secret@8.8.8.8/story", AbortSignal.timeout(1000)));
  assert.equal(options.length, 2, "Credentials-bearing URLs are rejected before the socket opens");
});
