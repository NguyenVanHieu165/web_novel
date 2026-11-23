import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import "dotenv/config";

const enabled = process.env.RUN_MYSQL_SOCIAL_TESTS === "1";
const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require("next/server");
const modules = {
  "@/lib/auth": "lib/auth.ts",
  "@/lib/server/reader-mutation": "lib/server/reader-mutation.ts",
  "@/lib/server/reader-wallet": "lib/server/reader-wallet.ts",
  "@/schemas/reader-account.schema": "schemas/reader-account.schema.ts",
  "@/schemas/reader-wallet.schema": "schemas/reader-wallet.schema.ts",
  "./auth.schema": "schemas/auth.schema.ts",
  profile: "app/api/profile/route.ts",
  password: "app/api/profile/password/route.ts",
  topUp: "app/api/wallet/top-up/route.ts",
};

const compiled = new Map(await Promise.all(Object.entries(modules).map(async ([name, path]) => {
  const source = await readFile(new URL("../" + path, import.meta.url), "utf8");
  return [name, ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText];
})));

function loadHandlers(prisma, { idTaiKhoan = 7, environment = "development", signedIn = true } = {}) {
  const cache = new Map();
  function load(name) {
    if (name === "server-only") return {};
    if (name === "@/lib/prisma") return { prisma };
    if (name === "@/lib/cloudinary") return { uploadImageToCloudinary: async (value) => value };
    if (name === "@/lib/server/auth-session") {
      return {
        requireUser: async () => signedIn
          ? { authorized: true, user: { idTaiKhoan } }
          : { authorized: false, response: NextResponse.json({ success: false }, { status: 401 }) },
      };
    }
    if (!compiled.has(name)) return require(name);
    if (cache.has(name)) return cache.get(name).exports;

    const current = { exports: {} };
    cache.set(name, current);
    vm.runInNewContext(compiled.get(name), {
      module: current, exports: current.exports, require: load, TextEncoder, URL,
      process: { env: { NODE_ENV: environment } },
      console: { error() {} },
    }, { filename: modules[name] });
    return current.exports;
  }
  return { profile: load("profile").PUT, password: load("password").PUT, topUp: load("topUp").POST, auth: load("@/lib/auth") };
}

function call(handler, data, {
  method = "PUT", endpoint = "/api/profile", origin = "https://webnovel.example",
  contentType = "application/json",
} = {}) {
  return handler(new NextRequest("https://webnovel.example" + endpoint, {
    method,
    headers: { origin, "content-type": contentType },
    body: JSON.stringify(data),
  }));
}

test("simulated top-up is unavailable in production", async () => {
  const handlers = loadHandlers(Object.freeze({}), { environment: "production" });
  const response = await call(handlers.topUp, { packageId: "small" }, { method: "POST", endpoint: "/api/wallet/top-up" });
  assert.equal(response.status, 404);
});

test("reader account and wallet routes with Prisma/MySQL", { skip: !enabled }, async (t) => {
  const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
  const { PrismaClient } = await import("../app/generated/prisma/client.ts");
  const mariadb = await import("mariadb");
  const database = "web_novel_account_test_" + randomBytes(8).toString("hex");
  assert.match(database, /^web_novel_account_test_[a-f0-9]{16}$/);
  const options = { host: process.env.DATABASE_HOST, user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD };
  const admin = await mariadb.createConnection(options);
  let created = false;
  let prisma;
  t.after(async () => {
    try {
      await prisma?.$disconnect();
      if (created) await admin.query("DROP DATABASE " + database);
    } finally {
      await admin.end();
    }
  });

  await admin.query("CREATE DATABASE " + database);
  created = true;
  prisma = new PrismaClient({ adapter: new PrismaMariaDb({ ...options, database, connectionLimit: 5 }) });
  for (const directory of ["20260618033143_increase_story_image_size", "20261119000000_add_data_integrity_constraints"]) {
    const migration = await readFile(new URL("../prisma/migrations/" + directory + "/migration.sql", import.meta.url), "utf8");
    for (const sql of migration.replace(/^--.*$/gm, "").split(";").map((statement) => statement.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(sql);
    }
  }
  const handlers = loadHandlers(prisma);
  const startHash = await handlers.auth.hashPassword("OldPassword123");
  for (const idTaiKhoan of [7, 8, 9]) {
    await prisma.taiKhoan.create({
      data: { idTaiKhoan, tenTaiKhoan: "reader" + idTaiKhoan, email: "reader" + idTaiKhoan + "@example.test", matKhau: startHash },
    });
  }

  await t.test("rejects unauthenticated writes, cross-origin requests and foreign account fields", async () => {
    const profile = { displayName: "Reader", avatar: "" };
    assert.equal((await call(loadHandlers(prisma, { signedIn: false }).profile, profile)).status, 401);
    assert.equal((await call(handlers.profile, profile, { origin: "https://different.example" })).status, 403);
    assert.equal((await call(handlers.profile, profile, { contentType: "text/plain" })).status, 415);
    assert.equal((await call(handlers.profile, { ...profile, idTaiKhoan: 8 })).status, 400);
    assert.equal((await call(handlers.profile, { ...profile, avatar: "malformed" })).status, 400);
    assert.equal((await call(handlers.profile, { ...profile, avatar: "https://user:pass@example.test/a.png" })).status, 400);
    assert.equal(await prisma.hoSoCaNhan.count(), 0);
  });

  await t.test("creates and updates only the caller profile and allows removing the avatar", async () => {
    const where = { idTaiKhoan: 7 };
    const avatar = "https://example.test/avatar.png";
    const loopback = "http://127.0.0.1:3000";
    const request = new NextRequest(loopback + "/api/profile", {
      method: "PUT",
      headers: { host: "127.0.0.1:3000", origin: loopback, "sec-fetch-site": "same-origin", "content-type": "application/json" },
      body: JSON.stringify({ displayName: "  Độc giả  ", avatar }),
    });
    assert.equal((await handlers.profile(request)).status, 200);
    assert.equal((await prisma.hoSoCaNhan.findUnique({ where })).anh, avatar);
    assert.equal((await call(handlers.profile, { displayName: "Tên mới", avatar: "" })).status, 200);
    const profile = await prisma.hoSoCaNhan.findUnique({ where });
    assert.equal(profile.ho_ten, "Tên mới");
    assert.equal(profile.anh, null);
    assert.equal(await prisma.hoSoCaNhan.count({ where: { idTaiKhoan: 8 } }), 0);
  });

  await t.test("verifies the current password and stores a hash of the new password", async () => {
    const where = { idTaiKhoan: 7 };
    const request = { currentPassword: "WrongPassword", newPassword: "NewPassword123", confirmPassword: "NewPassword123" };
    assert.equal((await call(handlers.password, request)).status, 400);
    const longPassword = "🔒".repeat(19);
    assert.equal((await call(handlers.password, { ...request, currentPassword: "OldPassword123", newPassword: longPassword, confirmPassword: longPassword })).status, 400);
    assert.equal((await prisma.taiKhoan.findUnique({ where })).matKhau, startHash);

    const response = await call(handlers.password, { ...request, currentPassword: "OldPassword123" });
    assert.equal(response.status, 200);
    assert.equal("matKhau" in await response.json(), false);
    const stored = (await prisma.taiKhoan.findUnique({ where })).matKhau;
    assert.match(stored, /^\$2[aby]\$/);
    assert.equal(await handlers.auth.verifyPassword("OldPassword123", stored), false);
    assert.equal(await handlers.auth.verifyPassword("NewPassword123", stored), true);
    assert.equal((await prisma.taiKhoan.findUnique({ where: { idTaiKhoan: 8 } })).matKhau, startHash);
  });

  const topUpParams = { method: "POST", endpoint: "/api/wallet/top-up" };
  await t.test("serializes repeated top-up requests and logs server-owned amounts and balances", async () => {
    const where = { idTaiKhoan: 7 };
    assert.equal((await call(handlers.topUp, { packageId: "large", amount: 10_000 }, topUpParams)).status, 400);
    assert.equal(await prisma.viTien.count(), 0);
    const replies = await Promise.all(Array.from({ length: 2 }, () => call(handlers.topUp, { packageId: "medium" }, topUpParams)));
    assert.deepEqual(replies.map((response) => response.status).sort(), [200, 429]);
    const wallet = await prisma.viTien.findUnique({ where });
    assert.equal(wallet.soDuXu, 50);
    assert.equal(wallet.tongNapXu, 50);
    const entries = await prisma.lichSuGiaoDich.findMany({ where });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].loai, "nap_xu");
    assert.deepEqual([entries[0].soDuTruoc, entries[0].soDuSau, entries[0].so_xu_thay_doi], [0, 50, 50]);
    assert.equal(await prisma.viTien.count({ where: { idTaiKhoan: 8 } }), 0);
  });

  await t.test("rolls back a wallet credit when the ledger insert fails", async () => {
    const where = { idTaiKhoan: 9 };
    await prisma.viTien.create({ data: { ...where, soDuXu: 3, tongNapXu: 0 } });
    const ddl = await mariadb.createConnection({ ...options, database });
    try {
      await ddl.query("CREATE TRIGGER reject_reader_deposit BEFORE INSERT ON lich_su_giao_dich FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected ledger failure'");
      const response = await call(loadHandlers(prisma, where).topUp, { packageId: "small" }, topUpParams);
      assert.equal(response.status, 500);
      assert.equal((await response.json()).message.includes("Injected"), false);
      const wallet = await prisma.viTien.findUnique({ where });
      assert.equal(wallet.soDuXu, 3);
      assert.equal(wallet.tongNapXu, 0);
      assert.equal(await prisma.lichSuGiaoDich.count({ where }), 0);
    } finally {
      await ddl.end();
    }
  });
});
