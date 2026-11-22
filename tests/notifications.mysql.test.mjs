import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire, registerHooks } from "node:module";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import "dotenv/config";
import { loadNotificationModule as load } from "./notification-support.mjs";

const require = createRequire(import.meta.url);
const socketRequire = createRequire(new URL("../socket-server/package.json", import.meta.url));
const { NextRequest, NextResponse } = require("next/server");

test("MySQL + production HTTP/Socket.IO handlers: follow and public chapter reach the right inboxes", { skip: process.env.RUN_NOTIFICATION_MYSQL_TESTS !== "1", timeout: 30_000 }, async (t) => {
  const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL?.includes("/generated/prisma/") && !/\.[a-z]+$/i.test(specifier)) return nextResolve(specifier + ".ts", context);
    return nextResolve(specifier, context);
  } });
  t.after(() => hooks.deregister());
  const { PrismaClient } = await import("../app/generated/prisma/client.ts");
  const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
  const mariadb = await import("mariadb");
  const { SignJWT, jwtVerify } = await import("jose");
  const database = `web_novel_notifications_test_${randomBytes(8).toString("hex")}`;
  const sourceDatabase = process.env.DATABASE_NAME;
  assert.match(database, /^web_novel_notifications_test_[a-f0-9]{16}$/);
  assert.match(sourceDatabase, /^[a-zA-Z0-9_]+$/);
  const options = { host: process.env.DATABASE_HOST, user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD };
  const adminDb = await mariadb.createConnection(options);
  let db, io, created = false;
  const clients = [];
  t.after(async () => {
    clients.forEach((client) => client.disconnect());
    if (io) await new Promise((resolve) => io.close(resolve));
    await db?.$disconnect();
    if (created) await adminDb.query(`DROP DATABASE \`${database}\``);
    await adminDb.end();
  });
  await adminDb.query(`CREATE DATABASE \`${database}\``); created = true;
  // Copy table definitions only; no migrations or changes to the source database.
  for (const table of ["tai_khoan", "vai_tro", "vai_tro_nguoi_dung", "truyen", "theo_doi_truyen", "chuong", "noi_dung_chuong", "thong_bao"]) {
    await adminDb.query(`CREATE TABLE \`${database}\`.\`${table}\` LIKE \`${sourceDatabase}\`.\`${table}\``);
  }
  db = new PrismaClient({ adapter: new PrismaMariaDb({ ...options, database, connectionLimit: 5 }) });
  await db.taiKhoan.createMany({ data: [1, 7, 8, 9, 10].map((idTaiKhoan) => ({ idTaiKhoan, tenTaiKhoan: `fixture-${idTaiKhoan}`, email: `fixture-${idTaiKhoan}@example.test`, matKhau: "fixture", trangThai: idTaiKhoan === 10 ? "locked" : "active" })) });
  await db.vaiTro.createMany({ data: [{ idVaiTro: 1, tenVaiTro: "admin" }, { idVaiTro: 2, tenVaiTro: "user" }] });
  await db.vaiTroNguoiDung.createMany({ data: [1, 7, 8, 9, 10].map((idTaiKhoan) => ({ idTaiKhoan, idVaiTro: idTaiKhoan === 1 ? 1 : 2 })) });
  await db.truyen.create({ data: { idTruyen: 11, tenTruyen: "Fixture Story", slug: "fixture-story", anhBia: "" } });
  const jwtSecret = "notification-integration-fixture-secret";
  const secretBytes = new TextEncoder().encode(jwtSecret);
  const session = (idTaiKhoan) => ({ idTaiKhoan, tenTaiKhoan: `fixture-${idTaiKhoan}`, email: `fixture-${idTaiKhoan}@example.test`, roles: [idTaiKhoan === 1 ? "admin" : "user"] });
  const tokens = new Map(await Promise.all([1, 7, 8].map(async (id) => [id, await new SignJWT(session(id)).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(secretBytes)])));
  const auth = load("socket-server/auth/socketAuth.ts", {}, {
    process: { env: { JWT_SECRET: jwtSecret } }, fetch: async (_url, args) => {
      const token = decodeURIComponent(args.headers.cookie.slice("token=".length));
      const { payload } = await jwtVerify(token, secretBytes);
      const account = await db.taiKhoan.findUnique({ where: { idTaiKhoan: payload.idTaiKhoan }, select: { idTaiKhoan: true, trangThai: true, vaiTroNguoiDung: { select: { vaiTro: { select: { tenVaiTro: true } } } } } });
      return Response.json({ user: { idTaiKhoan: account.idTaiKhoan, roles: account.trangThai === "active" ? account.vaiTroNguoiDung.map((role) => role.vaiTro.tenVaiTro) : [] } });
    },
  });
  const handlers = load("socket-server/handlers/notification.ts", { "../auth/socketAuth": auth });
  const dispatch = load("socket-server/handlers/notificationDispatch.ts");
  const RealServer = socketRequire("socket.io").Server;
  let listen, http;
  load("socket-server/server.ts", {
    dotenv: { config() {} }, express: socketRequire("express"), cors: socketRequire("cors"),
    http: { createServer: (app) => { http = createServer(app); listen = http.listen.bind(http); http.listen = () => http; return http; } },
    "socket.io": { Server: function (...args) { io = new RealServer(...args); return io; } },
    "./auth/socketAuth": auth, "./handlers/notification": handlers, "./handlers/notificationDispatch": dispatch,
    "./handlers/collaborative": { registerCollaborativeHandlers() {} },
  }, { process: { env: { INTERNAL_SECRET_TOKEN: "internal-fixture" } } });
  await new Promise((resolve) => listen(0, "127.0.0.1", resolve));
  const socketUrl = `http://127.0.0.1:${http.address().port}`;
  const { io: connect } = require("socket.io-client");
  async function client(id) {
    const socket = connect(socketUrl, { transports: ["websocket"], extraHeaders: { cookie: `token=${tokens.get(id)}` }, forceNew: true });
    clients.push(socket); await once(socket, "connect"); return socket;
  }
  const admin = await client(1), reader = await client(7), other = await client(8);
  const otherEvents = []; other.on("notification", (event) => otherEvents.push(event));
  const notifications = load("lib/server/notifications.ts", {}, { process: { env: { INTERNAL_SECRET_TOKEN: "internal-fixture", SOCKET_SERVER_URL: socketUrl } } });
  const common = (id) => ({
    "../chapters/route": { GET: async () => { throw new Error("List endpoint is outside this notification test"); } },
    "@/lib/prisma": { prisma: db }, "@/lib/server/notifications": notifications,
    "@/lib/server/auth-session": { requireUser: async () => ({ authorized: true, user: session(id) }), requireAdmin: async () => id === 1 ? { authorized: true, user: session(id) } : { authorized: false, response: NextResponse.json({}, { status: 403 }) } },
  });
  const follow = load("app/api/truyen/[slug]/follow/route.ts", common(7));
  const chapter = load("app/api/admin/chapter/route.ts", { ...common(1), "@/schemas/chapter-schema": load("schemas/chapter-schema.ts"), "@/lib/api": { getRequestId: () => "fixture", resSuccess: (data) => ({ success: true, data }) } });
  const request = (path, method = "GET", body) => new NextRequest(`http://novel.test${path}`, { method, headers: { origin: "http://novel.test", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const adminEvent = once(admin, "notification");
  assert.equal((await follow.PUT(request("/api/truyen/fixture-story/follow", "PUT", { following: true }), { params: Promise.resolve({ slug: "fixture-story" }) })).status, 200);
  assert.equal((await adminEvent)[0].type, "new-follow");
  await follow.PUT(request("/api/truyen/fixture-story/follow", "PUT", { following: true }), { params: Promise.resolve({ slug: "fixture-story" }) });
  assert.equal(await db.thongBao.count({ where: { idTaiKhoan: 1 } }), 1);
  await db.theoDoiTruyen.createMany({ data: [{ idTruyen: 11, idTaiKhoan: 9, thong_bao_chuong_moi: false }, { idTruyen: 11, idTaiKhoan: 10, thong_bao_chuong_moi: true }] });
  const readerEvent = once(reader, "notification");
  const createdChapter = await chapter.POST(request("/api/admin/chapter", "POST", { idTruyen: 11, chuongSo: 1, tieuDeChuong: "First", slug: "first", noiDung: "Published content" }));
  assert.equal(createdChapter.status, 201);
  assert.equal((await readerEvent)[0].type, "new-chapter");
  const userApi = load("app/api/notifications/route.ts", common(7));
  const inbox = await (await userApi.GET(request("/api/notifications"))).json();
  assert.equal(inbox.meta.unread, 1); assert.match(inbox.data[0].content, /Fixture Story.*1/);
  assert.equal((await (await userApi.PUT(request("/api/notifications", "PUT", { id: inbox.data[0].id }))).json()).unread, 0);
  assert.equal(await db.thongBao.count({ where: { idTaiKhoan: { in: [8, 9, 10] } } }), 0);
  assert.equal(otherEvents.length, 0);
  await db.thongBao.createMany({ data: Array.from({ length: 45 }, () => ({ idTaiKhoan: 1, tieu_de: "Fixture", noiDung: "Text", daDoc: false })) });
  const adminApi = load("app/api/admin/notifications/route.ts", common(1));
  const page3 = await (await adminApi.GET(request("/api/admin/notifications?page=3"))).json();
  assert.equal(page3.data.length, 6); assert.equal(page3.unreadCount, 46);
  assert.equal((await (await adminApi.PUT(request("/api/admin/notifications", "PUT", { all: true }))).json()).unreadCount, 0);
  let failedDispatches = 0;
  const brokenService = { ...notifications, createChapterNotifications: async () => { throw new Error("Fixture notification insert failure"); }, dispatchNotification: async () => { failedDispatches++; } };
  const failingChapter = load("app/api/admin/chapter/route.ts", { ...common(1), "@/lib/server/notifications": brokenService, "@/schemas/chapter-schema": load("schemas/chapter-schema.ts"), "@/lib/api": { getRequestId: () => "fixture", resSuccess: (data) => ({ success: true, data }) } }, { console: { error() {} } });
  assert.equal((await failingChapter.POST(request("/api/admin/chapter", "POST", { idTruyen: 11, chuongSo: 2, tieuDeChuong: "Rolled back", slug: "rollback", noiDung: "Content" }))).status, 500);
  assert.equal(await db.chuong.count({ where: { idTruyen: 11 } }), 1);
  assert.equal((await db.truyen.findUnique({ where: { idTruyen: 11 } })).soChuong, 1);
  assert.equal(failedDispatches, 0);
  assert.equal((await fetch(`${socketUrl}/api/trigger-notification`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "forged", message: "blocked", userIds: [7] }) })).status, 401);
});
