import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import { loadNotificationModule as load } from "./notification-support.mjs";

// RUN_STUDIO_MYSQL_TESTS=1 node --import ./socket-server/node_modules/tsx/dist/loader.mjs --test tests/studio.mysql.test.mjs
// All writes stay in a uniquely named disposable database. Production guards
// remain unchanged: this facade translates ONLY SELECT DATABASE() after checking
// the underlying connection really targets the disposable database, not web_truyen.
test("Studio ownership, drafts, publication and batch rollback with generated Prisma/MySQL", {
  skip: process.env.RUN_STUDIO_MYSQL_TESTS !== "1", timeout: 60000,
}, async (t) => {
  const { PrismaClient, Prisma } = await import("../app/generated/prisma/client.ts");
  const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
  const mariadb = await import("mariadb");
  const database = `web_novel_studio_test_${randomBytes(8).toString("hex")}`;
  const source = process.env.DATABASE_NAME;
  assert.equal(source, "web_truyen", "copy only the application's existing table definitions");
  assert.match(database, /^web_novel_studio_test_[a-f0-9]{16}$/);
  const options = { host: process.env.DATABASE_HOST, user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD };
  const admin = await mariadb.createConnection(options);
  let db;
  let created = false;
  t.after(async () => {
    await db?.$disconnect();
    if (created) await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  });
  await admin.query(`CREATE DATABASE \`${database}\``);
  created = true;
  for (const table of ["tai_khoan", "ho_so_ca_nhan", "truyen", "tac_gia_dich", "truyen_tac_gia_dich", "cai_dat_he_thong", "chuong", "noi_dung_chuong", "theo_doi_truyen", "thong_bao", "lich_su_giao_dich"]) {
    await admin.query(`CREATE TABLE \`${database}\`.\`${table}\` LIKE \`${source}\`.\`${table}\``);
  }
  // CREATE TABLE LIKE excludes foreign keys. Reinstate ownership/content/inbox
  // constraints so assertions exercise actual FK and transaction behavior.
  for (const [table, column, parent, parentColumn] of [
    ["ho_so_ca_nhan", "idTAI_KHOAN", "tai_khoan", "idTAI_KHOAN"],
    ["truyen_tac_gia_dich", "idTRUYEN", "truyen", "idTRUYEN"],
    ["truyen_tac_gia_dich", "idTAC_GIA_DICH", "tac_gia_dich", "idTAC_GIA_DICH"],
    ["chuong", "idTRUYEN", "truyen", "idTRUYEN"],
    ["noi_dung_chuong", "idCHUONG", "chuong", "idCHUONG"],
    ["theo_doi_truyen", "idTRUYEN", "truyen", "idTRUYEN"],
    ["theo_doi_truyen", "idTAI_KHOAN", "tai_khoan", "idTAI_KHOAN"],
    ["thong_bao", "idTAI_KHOAN", "tai_khoan", "idTAI_KHOAN"],
  ]) {
    await admin.query(`ALTER TABLE \`${database}\`.\`${table}\` ADD FOREIGN KEY (\`${column}\`) REFERENCES \`${database}\`.\`${parent}\` (\`${parentColumn}\`)`);
  }
  db = new PrismaClient({ adapter: new PrismaMariaDb({ ...options, database, connectionLimit: 5 }) });
  assert.equal((await db.$queryRaw`SELECT DATABASE() AS databaseName`)[0].databaseName, database);
  function facade(client, transaction = false) {
    return new Proxy(client, { get(target, key) {
      if (key === "$queryRaw") return async (query, ...values) => {
        const sql = Array.isArray(query) ? query.join("") : "";
        if (/^\s*SELECT DATABASE\(\) AS databaseName\s*$/i.test(sql) && values.length === 0) {
          const actual = await target.$queryRaw`SELECT DATABASE() AS databaseName`;
          assert.equal(actual[0].databaseName, database, "guard translation never permits writes to production");
          return [{ databaseName: "web_truyen" }];
        }
        return target.$queryRaw(query, ...values);
      };
      if (key === "$transaction" && !transaction) return (callback, config) => target.$transaction((tx) => callback(facade(tx, true)), config);
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  }
  const client = facade(db);
  const vietnamese = load("lib/vietnamese-text.ts");
  const utils = load("lib/utils.ts", { "./vietnamese-text": vietnamese });
  const ownership = load("lib/server/studio-ownership.ts");
  const studio = load("lib/server/studio.ts", { "@/app/generated/prisma/client": { Prisma }, "@/lib/utils": utils, "@/lib/server/studio-ownership": ownership });
  const chapterSchema = load("schemas/chapter-schema.ts");
  const writingSchema = load("schemas/chapter-writing.schema.ts", { "./chapter-schema": chapterSchema });
  const parser = load("lib/chapter-document-parser.ts", { "./vietnamese-text": vietnamese, "./utils": utils }, { Buffer, TextDecoder });
  const realNotifications = load("lib/server/notifications.ts");
  const dispatched = [];
  const writing = load("lib/server/chapter-writing.ts", {
    "@/app/generated/prisma/client": { Prisma },
    "@/schemas/chapter-writing.schema": writingSchema,
    "@/lib/chapter-document-parser": parser, "@/lib/utils": utils,
    "./studio-ownership": ownership,
    "./notifications": { ...realNotifications, dispatchNotification: async (notification) => { dispatched.push(notification); } },
  });
  const actorA = { idTaiKhoan: 7, roles: ["user"] };
  const actorB = { idTaiKhoan: 8, roles: ["user"] };
  await db.taiKhoan.createMany({ data: [7, 8, 9].map((id) => ({ idTaiKhoan: id, tenTaiKhoan: `studio-${id}`, email: `studio-${id}@example.test`, matKhau: "test-only-no-login", trangThai: "active" })) });
  const story = await studio.createStudioStory(client, actorA, { tenTruyen: "Truyện Studio", moTa: "Văn án", anhBia: "", trang_thai: "dang_tien_hanh" });
  assert.equal(story.tenTruyen, "Truyện Studio");
  const owner = await ownership.getStoryOwner(client, story.idTruyen);
  assert.equal(owner.ownerId, 7);
  assert.equal(await db.tacGiaDich.count(), 1);
  await studio.createStudioStory(client, actorA, { tenTruyen: "Truyện thứ hai", moTa: "", anhBia: "", trang_thai: "dang_tien_hanh" });
  assert.equal(await db.tacGiaDich.count(), 1, "registered author reused with real account-row lock");
  await db.theoDoiTruyen.create({ data: { idTruyen: story.idTruyen, idTaiKhoan: 9, thong_bao_chuong_moi: true } });
  const chapterInput = (number, extra = {}) => ({ idTruyen: story.idTruyen, chuongSo: number, tieuDeChuong: `Chương ${number}`, slug: `chuong-${number}`, isFree: true, giaXu: 0, noiDung: "Hắn nắm chặt nắm đấm.\n\nToàn văn sạch.", publication: "published", ...extra });
  const draft = await writing.saveWritingChapter(client, actorA, chapterInput(1, { publication: "draft" }), "studio");
  assert.equal(draft.isDeleted, true);
  assert.equal(draft.noiDungChuong.noiDung, "Hắn nắm chặt nắm đấm.\n\nToàn văn sạch.");
  assert.equal((await db.truyen.findUnique({ where: { idTruyen: story.idTruyen } })).soChuong, 0);
  assert.equal(await db.thongBao.count(), 0);
  assert.equal((await studio.listStudioChapters(client, actorA, story.idTruyen)).chapters.length, 1, "valid draft remains editable in Studio");
  assert.equal((await studio.getStudioChapter(client, actorA, story.idTruyen, draft.idChuong)).chapter.publication, "draft");
  for (const publication of ["published", "published", "draft", "published"]) {
    await writing.saveWritingChapter(client, actorA, chapterInput(1, { idChuong: draft.idChuong, publication }), "studio");
  }
  assert.equal(await db.thongBao.count({ where: { idTaiKhoan: 9, loai: "chuong_moi" } }), 1);
  assert.equal(dispatched.length, 1, "socket dispatch only after first durable publication");
  assert.equal((await db.truyen.findUnique({ where: { idTruyen: story.idTruyen } })).soChuong, 1);
  const list = await studio.listStudioStories(client, actorA);
  assert.equal(list.stats.stories, 2);
  assert.equal(list.stats.publishedChapters, 1);
  assert.equal((await studio.listStudioStories(client, actorB)).stats.stories, 0);
  const stripped = (chapter) => { const copy = { ...chapter }; delete copy.idTruyen; return copy; };
  for (const duplicate of [chapterInput(1), chapterInput(9, { slug: "chuong-1" })]) {
    await assert.rejects(writing.importWritingChapters(client, actorA, { idTruyen: story.idTruyen, chapters: [stripped(chapterInput(2)), stripped(duplicate)] }, "studio"), (error) => error.status === 409);
    assert.equal(await db.chuong.count(), 1, "earlier chapter in failed batch rolled back");
    assert.equal(await db.noiDungChuong.count(), 1, "body rolled back alongside metadata");
    assert.equal(await db.thongBao.count(), 1, "durable notifications rolled back");
    assert.equal(await db.caiDatHeThong.count({ where: { khoa: { startsWith: "studio.chapter." } } }), 1);
    assert.equal(dispatched.length, 1, "no dispatch for uncommitted chapter");
  }
  for (const operation of [
    () => studio.updateStudioStory(client, actorB, story.idTruyen, { tenTruyen: "Stolen" }),
    () => studio.deleteStudioStory(client, actorB, story.idTruyen),
    () => writing.saveWritingChapter(client, actorB, chapterInput(2), "studio"),
    () => writing.importWritingChapters(client, actorB, { idTruyen: story.idTruyen, chapters: [stripped(chapterInput(2))] }, "studio"),
  ]) await assert.rejects(operation, (error) => error.status === 403);
  assert.equal(await db.chuong.count(), 1);
  const imported = await writing.importWritingChapters(client, actorA, { idTruyen: story.idTruyen, chapters: [stripped(chapterInput(2)), stripped(chapterInput(3))] }, "studio");
  assert.equal(imported.imported, 2);
  assert.equal(imported.nextNumber, 4);
  assert.equal(await db.chuong.count(), 3);
  assert.equal(await db.noiDungChuong.count(), 3);
  assert.equal(await db.thongBao.count(), 3);
  assert.equal((await db.truyen.findUnique({ where: { idTruyen: story.idTruyen } })).soChuong, 3);
});
