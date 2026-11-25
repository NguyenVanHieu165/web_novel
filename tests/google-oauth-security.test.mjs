import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import bcrypt from "bcryptjs";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const compiled = ts.transpileModule(await readFile(
  new URL("../app/api/auth/google/callback/route.ts", import.meta.url), "utf8",
), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const attackerPassword = "PreviouslyKnownPassword123";
const originalHash = await bcrypt.hash(attackerPassword, 4);
const passwordVersion = (hash) => createHash("sha256").update(hash).digest("hex");

function harness({ verified = false, status = "active", deleted = false, googleVerified = true, accountExists = true } = {}) {
  const account = {
    idTaiKhoan: 17, tenTaiKhoan: "local_reader", email: "reader@example.test",
    matKhau: originalHash, emailXacThuc: verified, trangThai: status, isDeleted: deleted,
    hoSoCaNhan: null, vaiTroNguoiDung: [{ vaiTro: { tenVaiTro: "user" } }],
  };
  const sessions = [], credentialUpdates = [], createdResources = [];
  let exists = accountExists;
  let lockTail = Promise.resolve();
  let unlockedReads = 0;
  const updateAccount = async ({ data }) => {
    if ("matKhau" in data) credentialUpdates.push({ ...data });
    Object.assign(account, data);
    return structuredClone(account);
  };
  const prisma = {
    taiKhoan: { update: updateAccount },
    async $transaction(callback) {
      let releaseLock;
      let locked = false;
      const transaction = {
        async $queryRaw(strings, ...values) {
          assert.match(strings.join("?"), /SELECT[\s\S]*FROM\s+tai_khoan[\s\S]*FOR UPDATE/i);
          assert.ok(values.includes(account.email));
          const previous = lockTail;
          lockTail = new Promise((resolve) => { releaseLock = resolve; });
          await previous;
          locked = true;
          return exists ? [{ idTaiKhoan: account.idTaiKhoan }] : [];
        },
        taiKhoan: {
          async findUnique() {
            if (!locked) unlockedReads++;
            return exists ? structuredClone(account) : null;
          },
          update: updateAccount,
          async create({ data }) {
            assert.equal(exists, false);
            Object.assign(account, data);
            exists = true;
            return structuredClone(account);
          },
        },
        ...Object.fromEntries(["hoSoCaNhan", "viTien", "vaiTroNguoiDung"].map((name) => [name, {
          async create() { createdResources.push(name); },
        }])),
      };
      try { return await callback(transaction); }
      finally { releaseLock?.(); }
    },
  };
  const imports = {
    "@/lib/cloudinary": { uploadImageToCloudinary: async () => { throw new Error("Unexpected image upload"); } },
    "@/lib/prisma": { prisma },
    "@/lib/auth": { hashPassword: (value) => bcrypt.hash(value, 4) },
    "@/lib/auth-redirect": { safeAuthRedirect: () => "/profile" },
    "@/lib/server/auth-cookie": { setSessionCookie: async (_response, value) => { sessions.push(structuredClone(value)); } },
    "@/lib/server/account-roles": { resolveAccountRole: async () => ({ idVaiTro: 1, tenVaiTro: "user" }) },
    "@/lib/server/rate-limit": { checkRateLimit: async () => ({ allowed: true }), requestIp: () => "review" },
  };
  const current = { exports: {} };
  vm.runInNewContext(compiled, {
    module: current, exports: current.exports, Buffer, URL, URLSearchParams,
    process: { env: { GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret", APP_URL: "https://example.test" } },
    fetch: async (url) => {
      assert.ok(url === "https://oauth2.googleapis.com/token" || url === "https://www.googleapis.com/oauth2/v3/userinfo");
      return { ok: true, json: async () => url.endsWith("/token")
        ? { access_token: "test-access-token" }
        : { email: account.email, email_verified: googleVerified } };
    },
    require: (name) => name in imports ? imports[name] : require(name),
  });
  return {
    account, sessions, credentialUpdates, createdResources,
    get unlockedReads() { return unlockedReads; },
    async login() {
      const state = "r".repeat(32);
      const cookie = Buffer.from(JSON.stringify({ state, redirect: "/profile" })).toString("base64url");
      return current.exports.GET(new NextRequest(
        `https://example.test/api/auth/google/callback?code=test-code&state=${state}`,
        { headers: { cookie: `google_oauth_state=${cookie}` } },
      ));
    },
  };
}

for (const verified of [false, null]) {
  test(`Google ownership proof invalidates a pre-registered password and token version (${verified})`, async () => {
    const app = harness({ verified });
    const response = await app.login();
    assert.equal(response.headers.get("location"), "https://example.test/profile");
    assert.equal(app.account.emailXacThuc, true);
    assert.equal(app.credentialUpdates.length, 1);
    assert.equal(await bcrypt.compare(attackerPassword, app.account.matKhau), false);
    assert.notEqual(passwordVersion(app.account.matKhau), passwordVersion(originalHash));
    assert.equal(app.sessions[0].matKhau, app.account.matKhau, "session must use the newly persisted credential version");
    assert.equal(app.unlockedReads, 0, "read account only after obtaining its row lock");
  });
}

test("Google login preserves a previously verified account's password", async () => {
  const app = harness({ verified: true });
  const response = await app.login();
  assert.equal(response.headers.get("location"), "https://example.test/profile");
  assert.equal(app.credentialUpdates.length, 0);
  assert.equal(app.account.matKhau, originalHash);
  assert.equal(await bcrypt.compare(attackerPassword, app.sessions[0].matKhau), true);
});

test("first Google login still creates a verified account, profile, wallet and role", async () => {
  const app = harness({ accountExists: false });
  const response = await app.login();
  assert.equal(response.headers.get("location"), "https://example.test/profile");
  assert.equal(app.account.emailXacThuc, true);
  assert.equal(app.account.trangThai, "active");
  assert.deepEqual(app.createdResources.sort(), ["hoSoCaNhan", "vaiTroNguoiDung", "viTien"]);
  assert.equal(await bcrypt.compare(attackerPassword, app.account.matKhau), false);
  assert.equal(app.sessions[0].matKhau, app.account.matKhau);
});

test("concurrent Google callbacks rotate an unverified credential once and issue the same version", async () => {
  const app = harness();
  const responses = await Promise.all([app.login(), app.login()]);
  assert.ok(responses.every((response) => response.headers.get("location") === "https://example.test/profile"));
  assert.equal(app.credentialUpdates.length, 1);
  assert.equal(app.sessions.length, 2);
  assert.ok(app.sessions.every((session) => session.matKhau === app.account.matKhau));
  assert.equal(app.unlockedReads, 0);
});

for (const options of [{ status: "locked" }, { status: "banned" }, { deleted: true }]) {
  test(`Google login denies unavailable accounts without rotating credentials (${JSON.stringify(options)})`, async () => {
    const app = harness(options);
    const response = await app.login();
    assert.equal(response.headers.get("location"), "https://example.test/dang-nhap?error=account_locked");
    assert.equal(app.credentialUpdates.length, 0);
    assert.equal(app.sessions.length, 0);
  });
}

test("an unverified Google email cannot alter local credentials or create a session", async () => {
  const app = harness({ googleVerified: false });
  const response = await app.login();
  assert.equal(response.headers.get("location"), "https://example.test/dang-nhap?error=email_not_verified");
  assert.equal(app.credentialUpdates.length, 0);
  assert.equal(app.sessions.length, 0);
  assert.equal(app.account.matKhau, originalHash);
});
