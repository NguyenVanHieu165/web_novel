import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire, registerHooks } from "node:module";
import test from "node:test";
import "dotenv/config";
import { loadNotificationModule as load } from "./notification-support.mjs";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
test("MySQL chapter list, preview, bulk prices, auto-VIP and atomic hard deletion", { skip: process.env.RUN_ADMIN_CHAPTERS_MYSQL_TESTS !== "1", timeout: 30_000 }, async (t) => {
  const hooks = registerHooks({ resolve(specifier, context, next) {
    return next(specifier.startsWith(".") && context.parentURL?.includes("/generated/prisma/") && !/\.[a-z]+$/i.test(specifier) ? specifier + ".ts" : specifier, context);
  } });
  t.after(() => hooks.deregister());
  const { PrismaClient, Prisma } = await import("../app/generated/prisma/client.ts");
  const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
  const mariadb = await import("mariadb");
  const database = `web_novel_chapters_test_${randomBytes(8).toString("hex")}`;
  const source = process.env.DATABASE_NAME;
  assert.match(source, /^[a-zA-Z0-9_]+$/); assert.match(database, /^web_novel_chapters_test_[a-f0-9]{16}$/);
  const options = { host: process.env.DATABASE_HOST, user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD };
  const admin = await mariadb.createConnection(options);
  let db, created = false;
  t.after(async () => { await db?.$disconnect(); if (created) await admin.query(`DROP DATABASE \`${database}\``); await admin.end(); });
  await admin.query(`CREATE DATABASE \`${database}\``); created = true;
  for (const table of ["truyen", "chuong", "noi_dung_chuong", "binh_luan", "like_binh_luan", "tien_do_doc", "lich_su_doc", "chuong_da_mua", "cai_dat_he_thong"]) await admin.query(`CREATE TABLE \`${database}\`.\`${table}\` LIKE \`${source}\`.\`${table}\``);
  // CREATE TABLE LIKE omits foreign keys; restore relevant constraints in the
  // disposable database so hard deletion is tested against real FK ordering.
  for (const [table, column, parent, parentColumn] of [
    ["chuong", "idTRUYEN", "truyen", "idTRUYEN"],
    ["noi_dung_chuong", "idCHUONG", "chuong", "idCHUONG"],
    ["binh_luan", "idCHUONG", "chuong", "idCHUONG"],
    ["like_binh_luan", "idBINH_LUAN", "binh_luan", "idBINH_LUAN"],
    ["tien_do_doc", "idCHUONG", "chuong", "idCHUONG"],
    ["lich_su_doc", "idCHUONG", "chuong", "idCHUONG"],
    ["chuong_da_mua", "idCHUONG", "chuong", "idCHUONG"],
  ]) await admin.query(`ALTER TABLE \`${database}\`.\`${table}\` ADD FOREIGN KEY (\`${column}\`) REFERENCES \`${database}\`.\`${parent}\` (\`${parentColumn}\`)`);
  db = new PrismaClient({ adapter: new PrismaMariaDb({ ...options, database, connectionLimit: 5 }) });
  await db.truyen.createMany({ data: [{ idTruyen: 1, tenTruyen: "Truyện một", slug: "one", anhBia: "", soChuong: 4 }, { idTruyen: 2, tenTruyen: "Truyện hai", slug: "two", anhBia: "", soChuong: 1 }] });
  const contents = ["", "Tiếng\u00a0Việt\n\tchương\u200bmới", Array(100).fill("chữ").join(" "), Array(2450).fill("chữ").join(" "), "Khác"];
  for (let i = 0; i < 5; i++) await db.chuong.create({ data: { idChuong: i + 1, idTruyen: i === 4 ? 2 : 1, chuongSo: i + 1, tieuDeChuong: `Chương ${i + 1}`, slug: `chapter-${i + 1}`, giaXu: i === 2 ? 5 : 0, isFree: i !== 2, noiDungChuong: { create: { noiDung: contents[i] } } } });
  const schema = load("schemas/admin-chapters.schema.ts");
  const service = load("lib/server/admin-chapters.ts", { "@/lib/prisma": { prisma: db }, "@/app/generated/prisma/client": { Prisma }, "@/lib/vietnamese-text": load("lib/vietnamese-text.ts"), "@/schemas/admin-chapters.schema": schema });
  const list = (query) => service.listAdminChapters(schema.adminChaptersQuerySchema.parse(query));
  assert.deepEqual((await list({ storyId: "1" })).data.map((row) => row.wordCount), [0, 4, 100, 2450]);
  assert.deepEqual((await list({ storyId: "1", shortOnly: "true" })).data.map((row) => row.idChuong), [1, 2]);
  assert.deepEqual((await list({ q: "2-3", vipFilter: "vip" })).data.map((row) => row.idChuong), [3]);
  assert.deepEqual((await list({ storyId: "1", sortBy: "wordCount", sortOrder: "desc", limit: "2", page: "2" })).data.map((row) => row.wordCount), [4, 0]);
  assert.equal((await list({ q: "Truyện hai" })).meta.total, 1);
  assert.equal((await list({})).data[0].noiDungChuong, undefined);
  const common = { "@/lib/prisma": { prisma: db }, "@/lib/server/admin-chapters": service, "@/schemas/admin-chapters.schema": schema, "@/lib/server/auth-session": { requireAdmin: async () => ({ authorized: true, user: { idTaiKhoan: 1 } }) } };
  const req = (path, body) => new NextRequest(`http://novel.test/api/admin/chapters${path}`, body ? { method: "POST", headers: { origin: "http://novel.test", "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const preview = load("app/api/admin/chapters/[id]/preview/route.ts", common);
  const data = await (await preview.GET(req("/2/preview"), { params: Promise.resolve({ id: "2" }) })).json();
  assert.equal(data.data.content, data.data.content.normalize("NFC")); assert.equal(data.data.wordCount, 4);
  await service.mutateChapters({ action: "set-vip", chapterIds: [1, 2, 3], giaXu: 5 });
  assert.equal(await db.chuong.count({ where: { idTruyen: 1, giaXu: 5, isFree: false } }), 3);
  await service.mutateChapters({ action: "set-free", chapterIds: [1, 2, 3] });
  assert.equal(await db.chuong.count({ where: { idTruyen: 1, giaXu: 0, isFree: true } }), 4);
  const auto = load("app/api/admin/chapters/auto-vip/route.ts", common);
  assert.equal((await auto.POST(req("/auto-vip", { storyId: 1, fromChapter: 3, giaXu: 7 }))).status, 200);
  assert.equal(await db.chuong.count({ where: { idTruyen: 1, giaXu: 7 } }), 2);
  assert.equal((await db.chuong.findUnique({ where: { idChuong: 5 } })).giaXu, 0);
  await assert.rejects(() => service.mutateChapters({ action: "delete", chapterIds: [1, 999] }));
  assert.equal(await db.chuong.count(), 5);
  await db.binhLuan.create({ data: { idBinhLuan: 1, idTaiKhoan: 1, idTRUYEN: 1, idChuong: 1, noiDung: "Comment" } });
  await db.likeBinhLuan.create({ data: { idTaiKhoan: 1, idBinhLuan: 1 } });
  await db.chuongDaMua.create({ data: { idChuong: 1, idTaiKhoan: 1 } });
  await db.tienDoDoc.create({ data: { idChuong: 1, idTaiKhoan: 1 } });
  await db.lichSuDoc.create({ data: { idChuong: 1, idTaiKhoan: 1, idTruyen: 1 } });
  // Inject a failure after dependent deletes and verify the real DB rolls back.
  const failingDb = { $transaction: (fn) => db.$transaction((tx) => fn({ ...tx, chuong: { ...tx.chuong, deleteMany: async () => { throw new Error("Injected deletion failure"); } } })) };
  const failingService = load("lib/server/admin-chapters.ts", { "@/lib/prisma": { prisma: failingDb }, "@/app/generated/prisma/client": { Prisma }, "@/lib/vietnamese-text": load("lib/vietnamese-text.ts"), "@/schemas/admin-chapters.schema": schema });
  await assert.rejects(() => failingService.mutateChapters({ action: "delete", chapterIds: [1, 2] }), /Injected deletion failure/);
  assert.equal(await db.chuong.count(), 5); assert.equal(await db.noiDungChuong.count(), 5);
  assert.equal(await db.likeBinhLuan.count(), 1); assert.equal(await db.chuongDaMua.count(), 1);
  await service.mutateChapters({ action: "delete", chapterIds: [1, 2] });
  assert.equal(await db.chuong.count(), 3); assert.equal(await db.noiDungChuong.count(), 3);
  for (const model of ["binhLuan", "likeBinhLuan", "chuongDaMua", "tienDoDoc", "lichSuDoc"]) assert.equal(await db[model].count(), 0);
  assert.equal((await db.truyen.findUnique({ where: { idTruyen: 1 } })).soChuong, 2);
  // Exercise a library larger than the requested 2,500 chapters without ever
  // loading full content into a list response.
  for (let offset = 0; offset < 2505; offset += 500) {
    await db.chuong.createMany({ data: Array.from({ length: Math.min(500, 2505 - offset) }, (_, i) => ({ idTruyen: 2, chuongSo: offset + i + 10, tieuDeChuong: `Kho lớn ${offset + i}`, slug: `large-${offset + i}`, giaXu: 0, isFree: true })) });
  }
  const lastPage = await list({ limit: "100", page: "26", sortBy: "id" });
  assert.equal(lastPage.meta.total, 2508);
  assert.equal(lastPage.data.length, 8);
  assert.ok(lastPage.data.every((row) => row.noiDungChuong === undefined && row.wordCount === 0));
});
