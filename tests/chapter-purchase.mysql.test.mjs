import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import "dotenv/config";

// Opt-in: creates and drops a uniquely named test database, never application tables.
// node --import ./socket-server/node_modules/tsx/dist/loader.mjs --test tests/chapter-purchase.mysql.test.mjs
const enabled = process.env.RUN_MYSQL_PURCHASE_TESTS === "1";
const require = createRequire(import.meta.url);

test("purchase transaction with the installed Prisma/MySQL adapter", { skip: !enabled }, async (t) => {
  const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
  const { PrismaClient } = await import("../app/generated/prisma/client.ts");
  const mariadb = await import("mariadb");
  const { NextRequest } = require("next/server");
  const database = `web_novel_purchase_test_${randomBytes(8).toString("hex")}`;
  assert.match(database, /^web_novel_purchase_test_[a-f0-9]{16}$/);
  const connectionOptions = {
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  };
  const admin = await mariadb.createConnection(connectionOptions);
  let created = false;
  let prisma;
  t.after(async () => {
    await prisma?.$disconnect();
    if (created) await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  });
  await admin.query(`CREATE DATABASE \`${database}\``);
  created = true;
  prisma = new PrismaClient({
    adapter: new PrismaMariaDb({ ...connectionOptions, database, connectionLimit: 5 }),
  });

  const tables = [
    "CREATE TABLE truyen (idTRUYEN INT PRIMARY KEY, is_deleted BOOLEAN DEFAULT FALSE) ENGINE=InnoDB",
    "CREATE TABLE chuong (idCHUONG INT PRIMARY KEY, idTRUYEN INT NOT NULL, is_free BOOLEAN, gia_xu INT UNSIGNED, is_deleted BOOLEAN DEFAULT FALSE) ENGINE=InnoDB",
    "CREATE TABLE noi_dung_chuong (idCHUONG INT PRIMARY KEY, content_type VARCHAR(20), noi_dung LONGTEXT) ENGINE=InnoDB",
    "CREATE TABLE vi_tien (idTAI_KHOAN INT PRIMARY KEY, so_du_xu INT UNSIGNED, tong_nap_xu INT UNSIGNED DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME) ENGINE=InnoDB",
    "CREATE TABLE chuong_da_mua (idTAI_KHOAN INT NOT NULL, idCHUONG INT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (idTAI_KHOAN, idCHUONG)) ENGINE=InnoDB",
    "CREATE TABLE lich_su_giao_dich (idLICH_SU_GIAO_DICH INT AUTO_INCREMENT PRIMARY KEY, idTAI_KHOAN INT NOT NULL, loai VARCHAR(30) NOT NULL, id_doi_tuong INT, so_xu_thay_doi INT NOT NULL, so_du_truoc INT UNSIGNED NOT NULL, so_du_sau INT UNSIGNED NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB",
  ];
  for (const sql of tables) await prisma.$executeRawUnsafe(sql);

  const source = await readFile(new URL("../app/api/chapters/[id]/purchase/route.ts", import.meta.url), "utf8");
  const compiledRoute = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const owners = new Map();
  const revenueSource = await readFile(new URL("../lib/server/chapter-revenue.ts", import.meta.url), "utf8");
  const revenueModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(revenueSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: revenueModule, exports: revenueModule.exports, require(name) {
    if (name === "server-only") return {};
    if (name === "@/lib/server/studio-ownership") return { getStoryOwner: async (_tx, storyId) => owners.has(storyId) ? { ownerId: owners.get(storyId), authorId: 1 } : null };
    return require(name);
  } });
  function handler(failLedger = false, onLedger = () => {}, accountId = 7) {
    const routeModule = { exports: {} };
    const client = failLedger ? {
      viTien: prisma.viTien,
      $transaction: (callback) => prisma.$transaction((tx) => callback(new Proxy(tx, {
        get(target, property) {
          if (property === "lichSuGiaoDich") return { create: async (args) => {
            if (failLedger === true || args.data.so_xu_thay_doi > 0) {
              onLedger();
              throw new Error("Injected ledger failure");
            }
            return target.lichSuGiaoDich.create(args);
          } };
          return Reflect.get(target, property);
        },
      }))),
    } : prisma;
    vm.runInNewContext(compiledRoute, {
      module: routeModule,
      exports: routeModule.exports,
      console: { error() {} },
      require(name) {
        if (name === "@/lib/prisma") return { prisma: client };
        if (name === "@/lib/server/chapter-revenue") return revenueModule.exports;
        if (name === "@/lib/server/auth-session") return {
          requireUser: async () => ({ authorized: true, user: { idTaiKhoan: accountId, roles: ["user"] } }),
        };
        return require(name);
      },
    });
    return async (id = "11", price = 10) => {
      const request = new NextRequest(`https://webnovel.example/api/chapters/${id}/purchase`, {
        method: "POST",
        headers: { origin: "https://webnovel.example", "content-type": "application/json" },
        body: JSON.stringify({ expectedPrice: price }),
      });
      const response = await routeModule.exports.POST(request, { params: Promise.resolve({ id }) });
      return { status: response.status, body: await response.json() };
    };
  }
  const purchase = handler();
  async function reset(balance = 30) {
    owners.clear();
    for (const table of ["lich_su_giao_dich", "chuong_da_mua", "vi_tien", "noi_dung_chuong", "chuong", "truyen"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM ${table}`);
    }
    await prisma.$executeRaw`INSERT INTO truyen (idTRUYEN) VALUES (1), (2)`;
    await prisma.$executeRaw`INSERT INTO chuong (idCHUONG, idTRUYEN, is_free, gia_xu) VALUES (11, 1, 0, 10), (12, 2, 0, 10)`;
    await prisma.$executeRaw`INSERT INTO noi_dung_chuong (idCHUONG, content_type, noi_dung) VALUES (11, 'db', 'Paid chapter one'), (12, 'db', 'Paid chapter two')`;
    await prisma.$executeRaw`INSERT INTO vi_tien (idTAI_KHOAN, so_du_xu) VALUES (7, ${balance})`;
  }
  async function state() {
    return {
      balance: (await prisma.viTien.findUnique({ where: { idTaiKhoan: 7 }, select: { soDuXu: true } })).soDuXu,
      purchases: await prisma.chuongDaMua.count(),
      ledger: await prisma.lichSuGiaoDich.findMany({
        select: { so_xu_thay_doi: true, soDuTruoc: true, soDuSau: true },
        orderBy: { idLichSuGiaoDich: "asc" },
      }),
    };
  }

  await t.test("charges once for simultaneous requests for the same chapter", async () => {
    await reset();
    const results = await Promise.all([purchase(), purchase()]);
    assert.deepEqual(results.map(({ status }) => status), [200, 200]);
    assert.equal(results.filter(({ body }) => body.alreadyUnlocked).length, 1);
    assert.deepEqual(await state(), {
      balance: 20, purchases: 1, ledger: [{ so_xu_thay_doi: -10, soDuTruoc: 30, soDuSau: 20 }],
    });
    assert.equal((await purchase()).body.alreadyUnlocked, true);
    assert.equal((await state()).balance, 20);
  });
  await t.test("different stories cannot overspend the same wallet", async () => {
    await reset(15);
    const results = await Promise.all([purchase("11"), purchase("12")]);
    assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
    const actual = await state();
    assert.equal(actual.balance, 5);
    assert.equal(actual.purchases, 1);
    assert.equal(actual.ledger.length, 1);
  });
  await t.test("parallel purchases record the real balance chain", async () => {
    await reset(30);
    const results = await Promise.all([purchase("11"), purchase("12")]);
    assert.deepEqual(results.map(({ status }) => status), [200, 200]);
    assert.deepEqual(await state(), {
      balance: 10, purchases: 2,
      ledger: [
        { so_xu_thay_doi: -10, soDuTruoc: 30, soDuSau: 20 },
        { so_xu_thay_doi: -10, soDuTruoc: 20, soDuSau: 10 },
      ],
    });
  });
  await t.test("ledger failure rolls back the debit and entitlement", async () => {
    await reset();
    let reachedLedger = false;
    assert.equal((await handler(true, () => { reachedLedger = true; })()).status, 500);
    assert.equal(reachedLedger, true);
    assert.deepEqual(await state(), { balance: 30, purchases: 0, ledger: [] });
  });
  await t.test("changed price, deleted story and empty content never charge", async () => {
    await reset();
    assert.equal((await purchase("11", 1)).body.code, "PRICE_CHANGED");
    await prisma.$executeRaw`UPDATE truyen SET is_deleted = 1 WHERE idTRUYEN = 1`;
    assert.equal((await purchase()).status, 404);
    await prisma.$executeRaw`UPDATE noi_dung_chuong SET noi_dung = '' WHERE idCHUONG = 12`;
    assert.equal((await purchase("12")).status, 409);
    assert.deepEqual(await state(), { balance: 30, purchases: 0, ledger: [] });
  });

  await t.test("author wallet is created and earns 70 percent exactly once", async () => {
    await reset();
    owners.set(1, 20);
    const results = await Promise.all([purchase(), purchase()]);
    assert.deepEqual(results.map(x => x.status), [200, 200]);
    assert.equal(results.filter(x => x.body.alreadyUnlocked).length, 1);
    assert.equal((await prisma.viTien.findUnique({ where: { idTaiKhoan: 20 }, select: { soDuXu: true, tongNapXu: true } })).soDuXu, 7);
    assert.equal((await prisma.viTien.findUnique({ where: { idTaiKhoan: 20 }, select: { tongNapXu: true } })).tongNapXu, 0);
    const earnings = await prisma.lichSuGiaoDich.findMany({ where: { idTaiKhoan: 20 }, select: { loai: true, id_doi_tuong: true, so_xu_thay_doi: true, soDuTruoc: true, soDuSau: true } });
    assert.deepEqual(earnings, [{ loai: "mua_chuong", id_doi_tuong: 11, so_xu_thay_doi: 7, soDuTruoc: 0, soDuSau: 7 }]);
  });

  await t.test("a failed author ledger rolls back both wallets and chapter entitlement", async () => {
    await reset();
    owners.set(1, 20);
    assert.equal((await handler("author")()).status, 500);
    assert.deepEqual(await state(), { balance: 30, purchases: 0, ledger: [] });
    assert.equal(await prisma.viTien.findUnique({ where: { idTaiKhoan: 20 }, select: { soDuXu: true } }), null);
  });

  await t.test("cross-purchases use ordered wallets and preserve both balance chains", async () => {
    await reset();
    owners.set(1, 20);
    owners.set(2, 7);
    await prisma.$executeRaw`INSERT INTO vi_tien (idTAI_KHOAN, so_du_xu) VALUES (20, 30)`;
    const otherPurchase = handler(false, () => {}, 20);
    const results = await Promise.all([purchase(), otherPurchase("12")]);
    assert.deepEqual(results.map(x => x.status), [200, 200]);
    const wallets = await prisma.viTien.findMany({ select: { idTaiKhoan: true, soDuXu: true }, orderBy: { idTaiKhoan: "asc" } });
    assert.deepEqual(wallets, [{ idTaiKhoan: 7, soDuXu: 27 }, { idTaiKhoan: 20, soDuXu: 27 }]);
    assert.equal(await prisma.lichSuGiaoDich.count(), 4);
    assert.equal(await prisma.chuongDaMua.count(), 2);
  });
});
