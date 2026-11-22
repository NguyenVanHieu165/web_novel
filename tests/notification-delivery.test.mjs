import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { loadNotificationModule as load } from "./notification-support.mjs";

const require = createRequire(import.meta.url);
const socketRequire = createRequire(new URL("../socket-server/package.json", import.meta.url));
const { Server } = socketRequire("socket.io");
const { io: connect } = require("socket.io-client");
const { dispatchInternalNotification } = load("socket-server/handlers/notificationDispatch.ts");
const { registerNotificationHandlers } = load("socket-server/handlers/notification.ts", { "../auth/socketAuth": { requireSocketRole: (socket, role) => socket.data.session.roles.includes(role) } });

export async function notificationServer() {
  let port;
  const http = createServer();
  const io = new Server(http);
  io.use((socket, next) => {
    const match = /token=(\d+):(user|admin)/.exec(socket.handshake.headers.cookie || "");
    if (!match) return next(new Error("Unauthorized"));
    socket.data.session = { idTaiKhoan: Number(match[1]), roles: [match[2]] };
    next();
  });
  io.on("connection", (socket) => registerNotificationHandlers(io, socket));
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  port = http.address().port;
  const clients = [];
  return { io, async client(id, role = "user") {
    const socket = connect(`http://127.0.0.1:${port}`, { transports: ["websocket"], extraHeaders: { cookie: `token=${id}:${role}` }, forceNew: true });
    clients.push(socket);
    await once(socket, "connect");
    return socket;
  }, async close() { clients.forEach((socket) => socket.disconnect()); await new Promise((resolve) => io.close(resolve)); } };
}

test("real Socket.IO delivers targeted notifications to all recipient tabs, never other users/admins", async () => {
  const h = await notificationServer();
  try {
    const a = await h.client(7), secondTab = await h.client(7), other = await h.client(8), admin = await h.client(1, "admin");
    const otherEvents = [], adminEvents = [];
    other.on("notification", (event) => otherEvents.push(event)); admin.on("notification", (event) => adminEvents.push(event));
    admin.emit("join-admin-room");
    const denied = once(other, "authorization-error"); other.emit("join-admin-room"); await denied;
    const received = once(a, "notification"), receivedSecondTab = once(secondTab, "notification");
    assert.equal(dispatchInternalNotification(h.io, { type: "new-chapter", message: "Chapter 1", userIds: [7] }), true);
    assert.equal((await received)[0].message, "Chapter 1"); await receivedSecondTab;
    const adminReceived = once(admin, "notification");
    dispatchInternalNotification(h.io, { type: "demo", message: "Admin only" }); await adminReceived;
    assert.equal(otherEvents.length, 0); assert.equal(adminEvents.length, 1);
  } finally { await h.close(); }
});

test("invalid audience never falls back to broadcasting", () => {
  let sends = 0;
  const io = { to: () => ({ emit: () => { sends++; } }) };
  for (const value of [null, {}, { type: "new", message: "test", userIds: [] }, { type: "new", message: "test", userIds: ["7"] }, { type: "new", message: "test", userId: 7, userIds: [8] }, { type: "new", message: "test", userIds: [-1] }, { type: "new", message: "test", userIds: Array(501).fill(7) }]) assert.equal(dispatchInternalNotification(io, value), false);
  assert.equal(sends, 0);
});

test("chapter notifications honor opt-in, batch followers and use bulk writes", async () => {
  const { createChapterNotifications } = load("lib/server/notifications.ts");
  const writes = [], queries = [];
  const followers = Array.from({ length: 501 }, (_, i) => ({ idTheoDoiTruyen: i + 1, idTaiKhoan: i + 1 }));
  const tx = {
    theoDoiTruyen: { findMany: async (args) => { queries.push(args); return followers.filter((row) => row.idTheoDoiTruyen > (args.cursor?.idTheoDoiTruyen ?? 0)).slice(0, args.take); } },
    thongBao: { createMany: async (args) => { writes.push(args); return { count: args.data.length }; } },
  };
  const result = await createChapterNotifications(tx, { idTruyen: 1, tenTruyen: "Story" }, { idChuong: 2, chuongSo: 3.5 });
  assert.equal(result.userIds.length, 501);
  assert.deepEqual(writes.map((write) => write.data.length), [500, 1]);
  assert.equal(writes[0].data[0].loai, "chuong_moi");
  assert.match(writes[0].data[0].noiDung, /3.5/);
  assert.equal(queries[0].where.thong_bao_chuong_moi, true);
  assert.equal(queries[0].where.taiKhoan.trangThai, "active");
});

test("socket failure preserves saved inboxes and dispatch batches stay bounded", async () => {
  const batches = [];
  const service = load("lib/server/notifications.ts", {}, { process: { env: { INTERNAL_SECRET_TOKEN: "fixture" } }, console: { error() {} }, fetch: async (_url, args) => { batches.push(JSON.parse(args.body)); throw new Error("offline"); } });
  await service.dispatchNotification({ type: "new", message: "test", userIds: Array.from({ length: 501 }, (_, i) => i + 1) });
  assert.deepEqual(batches.map((batch) => batch.userIds.length), [500, 1]);
});
