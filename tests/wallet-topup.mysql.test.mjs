import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import "dotenv/config";

// Opt-in: creates and drops a uniquely named test database, never application tables.
// RUN_MYSQL_TOPUP_TESTS=1 npm test
const enabled = process.env.RUN_MYSQL_TOPUP_TESTS === "1";
const require = createRequire(import.meta.url);

test("SePay top-up transaction with the installed Prisma/MySQL adapter", { skip: !enabled }, async (t) => {
  const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
  const { PrismaClient } = await import("../app/generated/prisma/client.ts");
  const mariadb = await import("mariadb");
  const database = `web_novel_topup_test_${randomBytes(8).toString("hex")}`;
  assert.match(database, /^web_novel_topup_test_[a-f0-9]{16}$/);

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
    "CREATE TABLE hoa_don_nap (idHOA_DON_NAP INT AUTO_INCREMENT PRIMARY KEY, idTAI_KHOAN INT NOT NULL, ma_giao_dich VARCHAR(100) UNIQUE, so_xu_nap INT UNSIGNED NOT NULL, so_tien_vnd DECIMAL(12,0) NOT NULL, trang_thai VARCHAR(20) DEFAULT 'pending', phuong_thuc VARCHAR(20) NOT NULL, ghi_chu TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, ngay_xac_nhan DATETIME) ENGINE=InnoDB",
    "CREATE TABLE vi_tien (idTAI_KHOAN INT PRIMARY KEY, so_du_xu INT UNSIGNED DEFAULT 0, tong_nap_xu INT UNSIGNED DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME) ENGINE=InnoDB",
    "CREATE TABLE lich_su_giao_dich (idLICH_SU_GIAO_DICH INT AUTO_INCREMENT PRIMARY KEY, idTAI_KHOAN INT NOT NULL, loai VARCHAR(30) NOT NULL, id_doi_tuong INT, so_xu_thay_doi INT NOT NULL, so_du_truoc INT UNSIGNED NOT NULL, so_du_sau INT UNSIGNED NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB",
  ];
  for (const sql of tables) await prisma.$executeRawUnsafe(sql);

  const source = await readFile(new URL("../lib/server/wallet-topup.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;

  function service(client) {
    const current = { exports: {} };
    vm.runInNewContext(compiled, {
      module: current,
      exports: current.exports,
      Buffer,
      URL,
      process,
      require(name) {
        if (name === "server-only") return {};
        if (name === "@/lib/prisma") return { prisma: client };
        if (name === "@/lib/server/topup-packages") {
          return { topUpPackages: {}, topUpCodeSchema: { safeParse: () => ({ success: false }) } };
        }
        if (name === "@/lib/server/notifications") {
          return {
            createTopUpRequestNotifications: async () => null,
            createTopUpSuccessNotification: async () => null,
          };
        }
        return require(name);
      },
    }, { filename: "lib/server/wallet-topup.ts" });
    return current.exports;
  }

  async function reset(code = "NVH123456") {
    for (const table of ["lich_su_giao_dich", "vi_tien", "hoa_don_nap"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM ${table}`);
    }
    await prisma.hoaDonNap.create({
      data: {
        idTaiKhoan: 7,
        maGiaoDich: code,
        so_xu_nap: 550,
        soTienVnd: 50_000,
        trang_thai: "pending",
        phuongThuc: "bank",
      },
    });
  }

  await t.test("parallel confirmations credit one wallet and one ledger row", async () => {
    await reset();
    const topUp = service(prisma);
    const results = await Promise.all([
      topUp.confirmSepayTopUp("NVH123456", 50_000),
      topUp.confirmSepayTopUp("NVH123456", 50_000),
    ]);

    assert.deepEqual(results.map((result) => result.kind).sort(), ["already_processed", "credited"]);
    const wallet = await prisma.viTien.findUnique({ where: { idTaiKhoan: 7 } });
    assert.equal(wallet.soDuXu, 550);
    assert.equal(wallet.tongNapXu, 550);
    assert.equal(await prisma.lichSuGiaoDich.count(), 1);
    assert.equal((await prisma.hoaDonNap.findUnique({ where: { maGiaoDich: "NVH123456" } })).trang_thai, "success");
  });

  await t.test("ledger failure rolls back the order claim and wallet credit", async () => {
    await reset("NVH654321");
    const failingClient = new Proxy(prisma, {
      get(target, property, receiver) {
        if (property === "$transaction") {
          return (callback) => target.$transaction((tx) => callback(new Proxy(tx, {
            get(transaction, transactionProperty, transactionReceiver) {
              if (transactionProperty === "lichSuGiaoDich") {
                return { create: async () => { throw new Error("Injected ledger failure"); } };
              }
              return Reflect.get(transaction, transactionProperty, transactionReceiver);
            },
          })));
        }
        return Reflect.get(target, property, receiver);
      },
    });

    await assert.rejects(service(failingClient).confirmSepayTopUp("NVH654321", 50_000), /Injected ledger failure/);
    assert.equal((await prisma.hoaDonNap.findUnique({ where: { maGiaoDich: "NVH654321" } })).trang_thai, "pending");
    assert.equal(await prisma.viTien.count(), 0);
    assert.equal(await prisma.lichSuGiaoDich.count(), 0);

    const retried = await service(prisma).confirmSepayTopUp("NVH654321", 50_000);
    assert.equal(retried.kind, "credited");
  });
});
