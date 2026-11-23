import assert from "node:assert/strict";
import test from "node:test";
import { checkRateLimitWithDatabase, hashRateLimitKey } from "../lib/server/rate-limit-core.ts";
import { classifyOperationalError, safeErrorDiagnostic, sanitizeSystemLogDetails } from "../lib/server/system-log-sanitizer.ts";

test("system log sanitizer redacts credentials and classifies database failures", () => {
  const error = Object.assign(new Error("INSERT command denied to user 'reader'@'10.0.0.4'; password=secret mysql://user:pass@host/db"), { code: "P2010" });
  const details = safeErrorDiagnostic(error);
  const json = JSON.stringify(details);
  assert.equal(classifyOperationalError(error), "DB_PERMISSION_DENIED");
  assert.doesNotMatch(json, /reader|10\.0\.0\.4|password=secret|user:pass/iu);
  assert.match(json, /DB_PERMISSION_DENIED/);
  assert.deepEqual(sanitizeSystemLogDetails({ token: "abc", nested: { apiKey: "def" } }), { token: "[redacted]", nested: { apiKey: "[redacted]" } });
});

test("database rate limiter hashes identifiers and shares an atomic bucket", async () => {
  const buckets = new Map();
  const db = {
    async $executeRaw(_strings, keyHash, expiresAt, current, compareForCount, compareForExpiry, replacementExpiry) {
      const existing = buckets.get(keyHash);
      const now = new Date(current).getTime();
      assert.equal(new Date(compareForCount).getTime(), now);
      assert.equal(new Date(compareForExpiry).getTime(), now);
      if (!existing || existing.expiresAt <= now) buckets.set(keyHash, { count: 1, expiresAt: new Date(expiresAt).getTime() });
      else existing.count++;
      assert.equal(new Date(replacementExpiry).getTime(), new Date(expiresAt).getTime());
      return 1;
    },
    async $queryRaw(_strings, keyHash) {
      const bucket = buckets.get(keyHash);
      return bucket ? [{ soLan: bucket.count, hetHan: new Date(bucket.expiresAt) }] : [];
    },
  };
  const rawKey = "login:203.0.113.10";
  assert.match(hashRateLimitKey(rawKey), /^[a-f0-9]{64}$/u);
  assert.ok(!hashRateLimitKey(rawKey).includes("203.0.113.10"));
  assert.equal((await checkRateLimitWithDatabase(db, rawKey, 2, 10_000, 1_000)).allowed, true);
  assert.equal((await checkRateLimitWithDatabase(db, rawKey, 2, 10_000, 2_000)).allowed, true);
  const blocked = await checkRateLimitWithDatabase(db, rawKey, 2, 10_000, 3_000);
  assert.equal(blocked.allowed, false); assert.equal(blocked.retryAfter, 8);
  assert.equal((await checkRateLimitWithDatabase(db, rawKey, 2, 10_000, 12_000)).allowed, true);
});
