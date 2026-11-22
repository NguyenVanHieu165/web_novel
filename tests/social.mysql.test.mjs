import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import "dotenv/config";

// Opt-in integration tests; all writes belong to a unique disposable database.
// RUN_MYSQL_SOCIAL_TESTS=1 node --import ./socket-server/node_modules/tsx/dist/loader.mjs --test tests/social.mysql.test.mjs
const enabled = process.env.RUN_MYSQL_SOCIAL_TESTS === "1";
const require = createRequire(import.meta.url);

test("social and reading APIs with the installed Prisma/MySQL adapter", { skip: !enabled }, async (t) => {
  const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
  const { PrismaClient } = await import("../app/generated/prisma/client.ts");
  const mariadb = await import("mariadb");
  const { NextRequest } = require("next/server");
  const database = `web_novel_social_test_${randomBytes(8).toString("hex")}`;
  assert.match(database, /^web_novel_social_test_[a-f0-9]{16}$/);
  const options = { host: process.env.DATABASE_HOST, user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD };
  const admin = await mariadb.createConnection(options);
  let created = false;
  let prisma;
  t.after(async () => {
    await prisma?.$disconnect();
    if (created) await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  });
  await admin.query(`CREATE DATABASE \`${database}\``);
  created = true;
  prisma = new PrismaClient({ adapter: new PrismaMariaDb({ ...options, database, connectionLimit: 5 }) });

  const statements = [
    "CREATE TABLE tai_khoan (idTAI_KHOAN INT PRIMARY KEY, ten_tai_khoan VARCHAR(45)) ENGINE=InnoDB",
    "CREATE TABLE ho_so_ca_nhan (idHO_SO_CA_NHAN INT PRIMARY KEY, idTAI_KHOAN INT UNIQUE, ho_ten VARCHAR(255), anh VARCHAR(500)) ENGINE=InnoDB",
    "CREATE TABLE truyen (idTRUYEN INT PRIMARY KEY, slug VARCHAR(300) UNIQUE, ten_truyen VARCHAR(255), anh_bia LONGTEXT, anh_thumbnail LONGTEXT, trang_thai VARCHAR(30), is_deleted BOOLEAN DEFAULT FALSE, luot_theo_doi INT UNSIGNED DEFAULT 0, diem_danh_gia_trung_binh DECIMAL(3,2) DEFAULT 0, so_luot_danh_gia INT UNSIGNED DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB",
    "CREATE TABLE chuong (idCHUONG INT PRIMARY KEY, idTRUYEN INT NOT NULL, tieu_de_chuong VARCHAR(300), slug VARCHAR(300), is_free BOOLEAN, is_deleted BOOLEAN DEFAULT FALSE) ENGINE=InnoDB",
    "CREATE TABLE chuong_da_mua (idTAI_KHOAN INT NOT NULL, idCHUONG INT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (idTAI_KHOAN,idCHUONG)) ENGINE=InnoDB",
    "CREATE TABLE theo_doi_truyen (idTHEO_DOI_TRUYEN INT AUTO_INCREMENT PRIMARY KEY, idTRUYEN INT NOT NULL, idTAI_KHOAN INT NOT NULL, thong_bao_chuong_moi BOOLEAN DEFAULT TRUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE (idTAI_KHOAN,idTRUYEN)) ENGINE=InnoDB",
    "CREATE TABLE binh_luan (idBINH_LUAN INT AUTO_INCREMENT PRIMARY KEY, idTAI_KHOAN INT NOT NULL, idTRUYEN INT NOT NULL, idCHUONG INT, id_binh_luan_cha INT, noi_dung VARCHAR(1000), like_count INT UNSIGNED DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, is_deleted BOOLEAN DEFAULT FALSE) ENGINE=InnoDB",
    "CREATE TABLE tien_do_doc (idTIEN_DO_DOC INT AUTO_INCREMENT PRIMARY KEY, idTAI_KHOAN INT NOT NULL, idCHUONG INT NOT NULL, vi_tri_doc INT UNSIGNED, phan_tram_doc DECIMAL(5,2), ngay_doc_cuoi DATETIME, UNIQUE (idTAI_KHOAN,idCHUONG)) ENGINE=InnoDB",
    "CREATE TABLE danh_gia_truyen (idDANH_GIA INT AUTO_INCREMENT PRIMARY KEY, idTAI_KHOAN INT NOT NULL, idTRUYEN INT NOT NULL, so_sao TINYINT UNSIGNED NOT NULL, noi_dung TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, is_deleted BOOLEAN DEFAULT FALSE, UNIQUE (idTAI_KHOAN,idTRUYEN)) ENGINE=InnoDB",
  ];
  for (const sql of statements) await prisma.$executeRawUnsafe(sql);

  const compiledCache = new Map();
  async function compile(path) {
    if (!compiledCache.has(path)) {
      const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
      compiledCache.set(path, ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText);
    }
    return compiledCache.get(path);
  }
  const progressModule = { exports: {} };
  vm.runInNewContext(await compile("lib/reading-progress.ts"), { exports: progressModule.exports, module: progressModule, require });

  async function loadRoute(path, accountId = 7, client = prisma) {
    const routeModule = { exports: {} };
    vm.runInNewContext(await compile(path), {
      module: routeModule, exports: routeModule.exports, console: { error() {} },
      require(name) {
        if (name === "@/lib/server/notifications") return { createFollowNotifications: async () => null, dispatchNotification: async () => {} };
        if (name === "@/lib/prisma") return { prisma: client };
        if (name === "@/lib/server/studio-ownership") return { getStoryOwner: async () => null };
        if (name === "@/lib/reading-progress") return progressModule.exports;
        if (name === "@/lib/server/auth-session") return {
          requireUser: async () => ({ authorized: true, user: { idTaiKhoan: accountId, roles: ["user"] } }),
        };
        return require(name);
      },
    });
    return async ({ method = "GET", endpoint = "/test", params = {}, body } = {}) => {
      const request = new NextRequest(`https://webnovel.example${endpoint}`, {
        method,
        headers: { origin: "https://webnovel.example", cookie: "token=test", "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const response = await routeModule.exports[method](request, { params: Promise.resolve(params) });
      return { status: response.status, body: await response.json(), cacheControl: response.headers.get("cache-control") };
    };
  }

  async function reset() {
    for (const table of ["danh_gia_truyen", "tien_do_doc", "binh_luan", "theo_doi_truyen", "chuong_da_mua", "chuong", "truyen", "ho_so_ca_nhan", "tai_khoan"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM ${table}`);
    }
    await prisma.$executeRaw`INSERT INTO tai_khoan (idTAI_KHOAN, ten_tai_khoan) VALUES (7, 'reader-seven'), (99, 'private-reader')`;
    await prisma.$executeRaw`INSERT INTO ho_so_ca_nhan (idHO_SO_CA_NHAN,idTAI_KHOAN,ho_ten,anh) VALUES (1,7,'Public Author',NULL)`;
    await prisma.$executeRaw`INSERT INTO truyen (idTRUYEN,slug,ten_truyen,anh_bia,trang_thai) VALUES (1,'sample-story','Sample Story','/cover.jpg','dang_tien_hanh'), (2,'other-story','Other Story','/other.jpg','hoan_thanh')`;
    await prisma.$executeRaw`INSERT INTO chuong (idCHUONG,idTRUYEN,tieu_de_chuong,slug,is_free) VALUES (11,1,'Free Chapter','free-chapter',1), (12,1,'Paid Chapter','paid-chapter',0)`;
  }

  await t.test("follow is idempotent under concurrent requests and never exposes another reader's follow", async () => {
    await reset();
    const follow = await loadRoute("app/api/truyen/[slug]/follow/route.ts");
    const mutation = { method: "PUT", params: { slug: "sample-story" }, body: { following: true } };
    const results = await Promise.all([follow(mutation), follow(mutation)]);
    assert.deepEqual(results.map(({ status }) => status), [200, 200]);
    assert.equal(await prisma.theoDoiTruyen.count(), 1);
    assert.equal((await prisma.truyen.findUnique({ where: { idTruyen: 1 }, select: { luotTheoDoi: true } })).luotTheoDoi, 1);
    const otherReader = await loadRoute("app/api/truyen/[slug]/follow/route.ts", 99);
    assert.equal((await otherReader({ params: { slug: "sample-story" } })).body.following, false);
    await follow({ ...mutation, body: { following: false } });
    await follow({ ...mutation, body: { following: false } });
    assert.equal(await prisma.theoDoiTruyen.count(), 0);
    assert.equal((await prisma.truyen.findUnique({ where: { idTruyen: 1 }, select: { luotTheoDoi: true } })).luotTheoDoi, 0);
  });

  await t.test("a failed follow counter write rolls back the relation creation", async () => {
    await reset();
    let reachedCounter = false;
    const failingClient = {
      $transaction: (callback) => prisma.$transaction((tx) => callback(new Proxy(tx, {
        get(target, property) {
          if (property === "$executeRaw") return async () => {
            reachedCounter = true;
            throw new Error("Injected counter failure");
          };
          return Reflect.get(target, property);
        },
      }))),
    };
    const follow = await loadRoute("app/api/truyen/[slug]/follow/route.ts", 7, failingClient);
    assert.equal((await follow({ method: "PUT", params: { slug: "sample-story" }, body: { following: true } })).status, 500);
    assert.equal(reachedCounter, true);
    assert.equal(await prisma.theoDoiTruyen.count(), 0);
    assert.equal((await prisma.truyen.findUnique({ where: { idTruyen: 1 }, select: { luotTheoDoi: true } })).luotTheoDoi, 0);
  });

  await t.test("posted comments persist and public pages omit chapter/reply/deleted content", async () => {
    await reset();
    const comments = await loadRoute("app/api/truyen/[slug]/comments/route.ts");
    const createdComment = await comments({ method: "POST", params: { slug: "sample-story" }, body: { noiDung: "  Persisted comment  " } });
    assert.equal(createdComment.status, 201);
    assert.equal(createdComment.body.data.authorName, "Public Author");
    assert.equal(createdComment.body.data.noiDung, "Persisted comment");
    const row = await prisma.binhLuan.findUnique({ where: { idBinhLuan: createdComment.body.data.idBinhLuan }, select: { idTaiKhoan: true, idTRUYEN: true, noiDung: true } });
    assert.deepEqual(row, { idTaiKhoan: 7, idTRUYEN: 1, noiDung: "Persisted comment" });
    await prisma.$executeRaw`INSERT INTO binh_luan (idTAI_KHOAN,idTRUYEN,idCHUONG,noi_dung) VALUES (99,1,12,'Chapter spoiler')`;
    await prisma.$executeRaw`INSERT INTO binh_luan (idTAI_KHOAN,idTRUYEN,id_binh_luan_cha,noi_dung) VALUES (99,1,${createdComment.body.data.idBinhLuan},'Reply')`;
    await prisma.$executeRaw`INSERT INTO binh_luan (idTAI_KHOAN,idTRUYEN,is_deleted,noi_dung) VALUES (99,1,1,'Deleted comment')`;
    const page = await comments({ params: { slug: "sample-story" } });
    assert.equal(page.body.meta.total, 1);
    assert.equal(page.body.data[0].noiDung, "Persisted comment");
    assert.deepEqual(Object.keys(page.body.data[0]).sort(), ["idBinhLuan", "noiDung", "likeCount", "createdAt", "authorName", "authorAvatar", "isStoryAuthor", "replyTo"].sort());
  });

  await t.test("reading progress upserts one owned row and history isolates account state", async () => {
    await reset();
    const progress = await loadRoute("app/api/chapters/[id]/progress/route.ts");
    const first = await progress({ method: "PUT", params: { id: "11" }, body: { position: 120, percent: 12.345 } });
    assert.equal(first.status, 200);
    assert.equal(first.body.data.percent, 12.35);
    await progress({ method: "PUT", params: { id: "11" }, body: { position: 500, percent: 50 } });
    assert.equal(await prisma.tienDoDoc.count(), 1);
    const restored = await progress({ params: { id: "11" } });
    assert.equal(restored.body.data.position, 500);
    assert.equal(restored.cacheControl, "private, no-store");
    const otherProgress = await loadRoute("app/api/chapters/[id]/progress/route.ts", 99);
    assert.equal((await otherProgress({ params: { id: "11" } })).body.data.position, 0);
    const history = await loadRoute("app/api/reading-history/route.ts");
    const ownHistory = await history();
    assert.equal(ownHistory.body.meta.total, 1);
    assert.equal(ownHistory.body.data[0].chapterId, 11);
    assert.equal(ownHistory.body.data[0].percent, 50);
    const otherHistory = await loadRoute("app/api/reading-history/route.ts", 99);
    assert.equal((await otherHistory()).body.meta.total, 0);
    const parallel = await Promise.all([
      progress({ method: "PUT", params: { id: "11" }, body: { position: 330, percent: 33 } }),
      progress({ method: "PUT", params: { id: "11" }, body: { position: 660, percent: 66 } }),
    ]);
    assert.deepEqual(parallel.map(({ status }) => status), [200, 200]);
    assert.equal(await prisma.tienDoDoc.count(), 1);
  });

  await t.test("VIP progress requires purchase and deleted stories cannot receive progress", async () => {
    await reset();
    const progress = await loadRoute("app/api/chapters/[id]/progress/route.ts");
    const mutation = { method: "PUT", params: { id: "12" }, body: { position: 100, percent: 10 } };
    assert.equal((await progress(mutation)).status, 403);
    assert.equal(await prisma.tienDoDoc.count(), 0);
    await prisma.$executeRaw`INSERT INTO chuong_da_mua (idTAI_KHOAN,idCHUONG) VALUES (7,12)`;
    assert.equal((await progress(mutation)).status, 200);
    await prisma.$executeRaw`UPDATE truyen SET is_deleted = 1 WHERE idTRUYEN = 1`;
    assert.equal((await progress(mutation)).status, 404);
    const history = await loadRoute("app/api/reading-history/route.ts");
    assert.equal((await history()).body.meta.total, 0);
  });

  await t.test("ratings persist one vote per account, maintain aggregates and preserve chapter timestamp", async () => {
    await reset();
    await prisma.$executeRaw`UPDATE truyen SET updated_at = '2020-01-01 00:00:00' WHERE idTRUYEN = 1`;
    const rating = await loadRoute("app/api/truyen/[slug]/rating/route.ts");
    const otherRating = await loadRoute("app/api/truyen/[slug]/rating/route.ts", 99);
    const mutation = { method: "PUT", params: { slug: "sample-story" }, body: { stars: 5, content: "  My real review  " } };
    const submitted = await rating(mutation);
    assert.equal(submitted.status, 200);
    assert.deepEqual(submitted.body.rating, { stars: 5, content: "My real review" });
    assert.equal(submitted.body.total, 1);
    const updated = await rating({ ...mutation, body: { stars: 2 } });
    assert.equal(updated.body.total, 1);
    assert.equal(await prisma.danhGiaTruyen.count(), 1);
    assert.equal((await otherRating({ params: mutation.params })).body.rating, null);
    const concurrent = await Promise.all([
      rating({ ...mutation, body: { stars: 4 } }),
      otherRating({ ...mutation, body: { stars: 5 } }),
    ]);
    assert.deepEqual(concurrent.map(({ status }) => status), [200, 200]);
    const summary = await rating({ params: mutation.params });
    assert.equal(summary.body.average, 4.5);
    assert.equal(summary.body.total, 2);
    const stored = await prisma.truyen.findUnique({
      where: { idTruyen: 1 }, select: { diemDanhGiaTrungBinh: true, soLuotDanhGia: true, updatedAt: true },
    });
    assert.equal(Number(stored.diemDanhGiaTrungBinh), 4.5);
    assert.equal(stored.soLuotDanhGia, 2);
    assert.equal(stored.updatedAt.getUTCFullYear(), 2020);
    await prisma.$executeRaw`UPDATE danh_gia_truyen SET is_deleted = 1 WHERE idTAI_KHOAN = 7`;
    assert.equal((await rating({ params: mutation.params })).body.rating, null);
    const restored = await rating(mutation);
    assert.equal(restored.body.total, 2);
    assert.equal(await prisma.danhGiaTruyen.count(), 2);
  });

  await t.test("failed aggregate update rolls back the stored star rating", async () => {
    await reset();
    let reachedCounter = false;
    const failingClient = {
      $transaction: (callback) => prisma.$transaction((tx) => callback(new Proxy(tx, {
        get(target, property) {
          if (property === "$executeRaw") return async () => {
            reachedCounter = true;
            throw new Error("Injected rating aggregate failure");
          };
          return Reflect.get(target, property);
        },
      }))),
    };
    const rating = await loadRoute("app/api/truyen/[slug]/rating/route.ts", 7, failingClient);
    assert.equal((await rating({ method: "PUT", params: { slug: "sample-story" }, body: { stars: 5 } })).status, 500);
    assert.equal(reachedCounter, true);
    assert.equal(await prisma.danhGiaTruyen.count(), 0);
  });
});
