import assert from "node:assert/strict";
import test from "node:test";

import { authenticateSocket } from "../socket-server/auth/socketAuth.ts";
import {
  isInternalStatsRequestAuthorized,
  OnlinePresenceTracker,
} from "../socket-server/onlineStats.ts";
import { createOnlineStatsLoader } from "../lib/server/online-stats.ts";
import { CHAPTER_VIEW_ACTION, chapterViewLogData } from "../lib/chapter-view-log.ts";

test("socket authentication accepts a guest without creating a private session", async () => {
  const session = await authenticateSocket({ handshake: { headers: {} } });
  assert.equal(session, null);
});

test("online presence counts connections, unique members and guests", () => {
  const times = [
    "2026-11-24T00:00:00.000Z",
    "2026-11-24T00:00:01.000Z",
    "2026-11-24T00:00:02.000Z",
    "2026-11-24T00:00:03.000Z",
    "2026-11-24T00:00:04.000Z",
    "2026-11-24T00:00:05.000Z",
    "2026-11-24T00:00:06.000Z",
  ];
  const tracker = new OnlinePresenceTracker(() => new Date(times.shift()));
  tracker.connect("member-tab-1", 7);
  tracker.connect("member-tab-2", 7);
  tracker.connect("member-2", 9);
  tracker.connect("guest", null);
  assert.deepEqual(tracker.snapshot(), {
    totalConnections: 4,
    authenticatedUsers: 2,
    guestConnections: 1,
    updatedAt: "2026-11-24T00:00:04.000Z",
  });
  tracker.disconnect("member-tab-1");
  assert.equal(tracker.snapshot().authenticatedUsers, 2);
  tracker.disconnect("member-tab-2");
  assert.equal(tracker.snapshot().authenticatedUsers, 1);
});

test("internal stats authorization requires the exact internal token", () => {
  assert.equal(isInternalStatsRequestAuthorized("shared-secret", "shared-secret"), true);
  assert.equal(isInternalStatsRequestAuthorized(["shared-secret"], "shared-secret"), false);
  assert.equal(isInternalStatsRequestAuthorized("wrong", "shared-secret"), false);
});

test("Next.js online stats loader deduplicates requests, caches for ten seconds and fails closed", async () => {
  let currentTime = 0;
  let calls = 0;
  const payload = {
    totalConnections: 8,
    authenticatedUsers: 3,
    guestConnections: 4,
    updatedAt: "2026-11-24T00:00:00.000Z",
  };
  const loader = createOnlineStatsLoader({
    environment: {
      SOCKET_SERVER_URL: "https://realtime.example.com/base",
      INTERNAL_SECRET_TOKEN: "shared-secret",
    },
    now: () => currentTime,
    async fetchImpl(url, options) {
      calls += 1;
      assert.equal(url.href, "https://realtime.example.com/internal/online-stats");
      assert.equal(options.headers["x-internal-token"], "shared-secret");
      assert.ok(options.signal instanceof AbortSignal);
      return Response.json(payload);
    },
  });

  const [first, concurrent] = await Promise.all([loader(), loader()]);
  assert.deepEqual(first, payload);
  assert.deepEqual(concurrent, payload);
  assert.equal(calls, 1);
  currentTime = 9_999;
  assert.deepEqual(await loader(), payload);
  assert.equal(calls, 1);
  currentTime = 10_000;
  assert.deepEqual(await loader(), payload);
  assert.equal(calls, 2);

  const unconfigured = createOnlineStatsLoader({ environment: {}, fetchImpl: async () => { throw new Error("must not fetch"); } });
  assert.equal(await unconfigured(), null);
  const failed = createOnlineStatsLoader({
    environment: { SOCKET_SERVER_URL: "https://realtime.example.com", INTERNAL_SECRET_TOKEN: "shared-secret" },
    fetchImpl: async () => { throw new Error("Render unavailable"); },
  });
  assert.equal(await failed(), null);
});

test("chapter view logs preserve action and target identifiers without schema changes", () => {
  const data = chapterViewLogData(17, 4);
  assert.equal(data.nguon, CHAPTER_VIEW_ACTION);
  assert.deepEqual(JSON.parse(data.chiTiet), {
    hanh_dong: "CHAPTER_VIEW",
    doi_tuong_id: 17,
    id_truyen: 4,
  });
});
