import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { loadNotificationModule as load } from "./notification-support.mjs";

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require("next/server");
const plain = (value) => JSON.parse(JSON.stringify(value));
function apiHarness(authorized = true) {
  const rows = Array.from({ length: 45 }, (_, i) => ({ idThongBao: 45 - i, idTaiKhoan: 7, tieu_de: "Title", noiDung: "Body", daDoc: i < 30, createdAt: new Date() }));
  rows.push({ idThongBao: 99, idTaiKhoan: 8, daDoc: false });
  const matching = (where) => rows.filter((row) => row.idTaiKhoan === where.idTaiKhoan && (where.idThongBao === undefined || row.idThongBao === where.idThongBao) && (!where.OR || where.OR.some((clause) => row.daDoc === clause.daDoc)));
  const writes = [];
  const api = load("app/api/admin/notifications/route.ts", {
    "@/lib/prisma": { prisma: { thongBao: {
      findMany: async ({ where, skip, take }) => matching(where).slice(skip, skip + take),
      count: async ({ where }) => matching(where).length,
      updateMany: async (args) => { writes.push(args); const owned = matching(args.where); owned.forEach((row) => { row.daDoc = args.data.daDoc; }); return { count: owned.length }; },
      findFirst: async ({ where }) => matching(where)[0] ?? null,
      deleteMany: async (args) => { writes.push(args); const owned = matching(args.where); for (const row of owned) rows.splice(rows.indexOf(row), 1); return { count: owned.length }; },
    } } },
    "@/lib/server/auth-session": { requireAdmin: async () => authorized ? { authorized: true, user: { idTaiKhoan: 7 } } : { authorized: false, response: NextResponse.json({}, { status: 403 }) } },
  });
  return { rows, writes, async call(method = "GET", query = "", body, rawBody, origin = "https://novel.test") {
    const response = await api[method](new NextRequest(`https://novel.test/api/admin/notifications${query}`, { method, headers: { origin, "content-type": "application/json" }, ...(method === "PUT" ? { body: rawBody ?? JSON.stringify(body) } : {}) }));
    return { status: response.status, data: await response.json() };
  } };
}

test("admin pagination returns every page and unread count across the whole inbox", async () => {
  const h = apiHarness();
  const first = await h.call();
  assert.equal(first.data.data.length, 20);
  assert.equal(first.data.unreadCount, 15);
  assert.equal(first.data.meta.total, 45);
  const all = [];
  for (let page = 1; page <= 3; page++) all.push(...(await h.call("GET", `?page=${page}`)).data.data);
  assert.equal(new Set(all.map((row) => row.idThongBao)).size, 45);
  assert.ok(!all.some((row) => row.idThongBao === 99));
});

test("admin rejects malformed/ambiguous payloads without changing any inbox", async () => {
  const h = apiHarness();
  for (const body of [{ all: "false" }, { all: false }, { all: true, id: 1 }, { id: 1, isRead: "false" }, { id: -1 }, { id: "1.5" }, { id: 1, idTaiKhoan: 8 }]) assert.equal((await h.call("PUT", "", body)).status, 400);
  assert.equal((await h.call("PUT", "", undefined, "{")).status, 400);
  for (const query of ["?page=0", "?limit=101", "?page=1&page=2"]) assert.equal((await h.call("GET", query)).status, 400);
  for (const query of ["?all=false", "?all=true&id=1", "?id=abc", "?id=1&id=2"]) assert.equal((await h.call("DELETE", query)).status, 400);
  assert.equal(h.writes.length, 0);
});

test("admin writes require admin authorization, same origin and notification ownership", async () => {
  const denied = apiHarness(false);
  for (const method of ["GET", "PUT", "DELETE"]) assert.equal((await denied.call(method, "?id=1", { id: 1 })).status, 403);
  assert.equal(denied.writes.length, 0);
  const h = apiHarness();
  assert.equal((await h.call("PUT", "", { all: true }, undefined, "https://external.test")).status, 403);
  assert.equal((await h.call("PUT", "", { id: 99, isRead: true })).status, 404);
  assert.equal((await h.call("DELETE", "?id=99")).status, 404);
  assert.equal((await h.call("PUT", "", { id: "1", isRead: true })).status, 200);
  assert.equal((await h.call("PUT", "", { all: true })).data.unreadCount, 0);
  assert.equal(h.rows.find((row) => row.idThongBao === 99).daDoc, false);
  assert.equal((await h.call("DELETE", "?all=true")).status, 200);
  assert.deepEqual(h.rows.map((row) => row.idThongBao), [99]);
});

function uiHarness(file, imports = {}, globals = {}) {
  const states = [], slots = [], effects = [], bus = new EventTarget();
  bus.location = { origin: "http://localhost" };
  let index = 0, dirty = false;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) { const i = index++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], (next) => { states[i] = typeof next === "function" ? next(states[i]) : next; dirty = true; }]; },
    useRef(value) { const i = index++; if (!slots[i]) slots[i] = { current: value }; return slots[i]; },
    useCallback(fn, deps) { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
    useSyncExternalStore() { index++; return true; },
  };
  const jsx = (type, props) => ({ type, props });
  const exports = load(file, { react, "react/jsx-runtime": { jsx, jsxs: jsx }, "lucide-react": new Proxy({}, { get: (_, key) => key }), "next/navigation": { usePathname: () => "/admin/notifications", useRouter: () => ({ push() {}, refresh() {} }) }, "next/link": { default: "a" }, sonner: { toast: { error() {}, success() {}, info() {} } }, ...imports }, { window: bus, document: new EventTarget(), ...globals });
  return { exports, states, bus, render(component = exports.default) { let result; do { dirty = false; index = 0; result = component(); } while (dirty); return result; }, commit() { while (effects.length) effects.shift()(); }, unmount() { for (const slot of slots) slot?.cleanup?.(); } };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function buttons(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(buttons);
  return [...(tree.type === "button" ? [tree] : []), ...buttons(tree.props?.children)];
}
const response = (id, page = 1) => ({ data: { success: true, data: [{ idThongBao: id, tieu_de: "Title", noiDung: "Text", daDoc: false, createdAt: "2026-11-21T00:00:00Z" }], unreadCount: 45, meta: { page, totalPage: 3, total: 45 } } });

test("admin cancels obsolete reads and load-more appends the next server page once", async () => {
  const requests = [];
  const h = uiHarness("app/admin/notifications/page.tsx", { "@/lib/axios": { __esModule: true, default: { get: (url, options) => new Promise((resolve) => requests.push({ url, options, resolve })) } } });
  h.render(); h.commit();
  h.bus.dispatchEvent(new Event("notifications-updated"));
  assert.equal(requests[0].options.signal.aborted, true);
  requests[1].resolve(response(2)); await flush();
  requests[0].resolve(response(1)); await flush();
  assert.deepEqual(plain(h.states[0].map((row) => row.id)), ["2"]);
  const more = buttons(h.render()).find((button) => JSON.stringify(button.props.children).includes("Tải thêm thông báo"));
  more.props.onClick(); more.props.onClick();
  assert.equal(requests.length, 3);
  assert.equal(requests[2].options.params.page, 2);
  requests[2].resolve(response(3, 2)); await flush();
  assert.deepEqual(plain(h.states[0].map((row) => row.id)), ["2", "3"]);
  h.unmount();
});

test("opening the admin sidebar never writes read-all; badges use API unreadCount", async () => {
  for (const file of ["components/admin/Sidebar.tsx", "components/admin/Navbar.tsx"]) {
    const calls = [];
    const h = uiHarness(file, { "socket.io-client": { io: () => ({ on() {}, disconnect() {} }) } }, { fetch: async (url, options) => { calls.push({ url, options }); return { json: async () => ({ success: true, data: [], unreadCount: 45 }) }; } });
    h.render(); h.commit(); await flush();
    assert.ok(calls.every((call) => !call.options?.method || call.options.method === "GET"));
    assert.ok(h.states.includes(45));
    h.unmount();
  }
});

test("reader socket events refresh the committed unread count and clean up on unmount", async () => {
  const handlers = {}, requests = [];
  let disconnected = false, count = 0;
  const h = uiHarness("components/notifications/NotificationBell.tsx", {
    "@/context/AuthContext": { useAuth: () => ({ user: { idTaiKhoan: 7 } }) },
    "socket.io-client": { io: () => ({ on: (event, fn) => { handlers[event] = fn; }, disconnect: () => { disconnected = true; } }) },
  }, { fetch: async (url) => { requests.push(url); return { ok: true, json: async () => ({ success: true, meta: { unread: count } }) }; } });
  const component = h.exports.default().type;
  h.render(component); h.commit(); await flush();
  count = 1; handlers.notification(); await flush();
  assert.equal(h.states[0], 1);
  handlers.notification(); await flush();
  assert.equal(h.states[0], 1);
  assert.ok(requests.length >= 3);
  h.unmount(); assert.equal(disconnected, true);
});

test("reader inbox refreshes on realtime event and cancels the older page read", async () => {
  const requests = [];
  const h = uiHarness("components/notifications/NotificationList.tsx", {
    "@/context/AuthContext": { useAuth: () => ({ user: { idTaiKhoan: 7 }, loading: false }) },
  }, { fetch: (url, options) => new Promise((resolve) => requests.push({ url, options, resolve })) });
  h.render(); h.commit();
  h.bus.dispatchEvent(new Event("notifications-updated")); h.render(); h.commit();
  assert.equal(requests[0].options.signal.aborted, true);
  assert.equal(requests.length, 2);
  const result = (id) => ({ ok: true, json: async () => ({ success: true, data: [{ id, title: "New chapter", content: "Chapter 1", read: false, createdAt: null }], meta: { page: 1, total: 1, totalPage: 1, unread: 1 } }) });
  requests[1].resolve(result(2)); await flush();
  requests[0].resolve(result(1)); await flush();
  assert.ok(JSON.stringify(h.render()).includes("New chapter"));
  const state = h.states.find((value) => value?.kind === "ready");
  assert.equal(state.result.data[0].id, 2);
  h.unmount();
});
