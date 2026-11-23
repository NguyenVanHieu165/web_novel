import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { loadNotificationModule as load } from "./notification-support.mjs";

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require("next/server");

function listHarness(authorized = true) {
  const calls = [];
  const rows = [{
    idHoaDonNap: 4,
    maGiaoDich: "NVH123456",
    so_xu_nap: 550,
    soTienVnd: { toString: () => "50000" },
    trang_thai: "pending",
    phuongThuc: "bank",
    ghiChu: "popular_50k",
    createdAt: new Date("2026-11-23T03:00:00Z"),
    ngay_xac_nhan: null,
    taiKhoan: { idTaiKhoan: 7, tenTaiKhoan: "reader", email: "reader@example.com" },
  }];
  const route = load("app/api/admin/topups/route.ts", {
    "@/lib/prisma": { prisma: { hoaDonNap: {
      findMany: async (args) => { calls.push(args); return rows; },
      count: async () => rows.length,
    } } },
    "@/lib/server/auth-session": { requireAdmin: async () => authorized
      ? { authorized: true, user: { idTaiKhoan: 1 } }
      : { authorized: false, response: NextResponse.json({}, { status: 403 }) } },
  });
  return { calls, async get(query = "") {
    const response = await route.GET(new NextRequest(`https://novel.test/api/admin/topups${query}`));
    return { status: response.status, body: await response.json() };
  } };
}

test("admin top-up list is protected, paginated and uses server-side filters", async () => {
  assert.equal((await listHarness(false).get()).status, 403);
  const h = listHarness();
  const result = await h.get("?page=2&limit=10&status=pending&search=NVH");
  assert.equal(result.status, 200);
  assert.equal(result.body.data[0].amountVnd, 50_000);
  assert.equal(result.body.data[0].account.username, "reader");
  assert.equal(h.calls[0].skip, 10);
  assert.equal(h.calls[0].take, 10);
  assert.equal(h.calls[0].where.AND[0].trang_thai, "pending");
  assert.equal(h.calls[0].where.AND[1].OR[0].maGiaoDich.contains, "NVH");
});

test("admin top-up list rejects malformed and duplicated query values", async () => {
  const h = listHarness();
  for (const query of ["?page=0", "?limit=101", "?status=unknown", "?page=1&page=2"]) {
    assert.equal((await h.get(query)).status, 400);
  }
  assert.equal(h.calls.length, 0);
});

function actionHarness({ authorized = true, approveKind = "credited", cancelKind = "cancelled" } = {}) {
  const calls = [];
  const dispatched = [];
  const route = load("app/api/admin/topups/[id]/route.ts", {
    "@/lib/server/auth-session": { requireAdmin: async () => authorized
      ? { authorized: true, user: { idTaiKhoan: 1 } }
      : { authorized: false, response: NextResponse.json({}, { status: 403 }) } },
    "@/lib/server/wallet-topup": {
      confirmAdminTopUp: async (id) => {
        calls.push(["approve", id]);
        if (approveKind !== "credited") return { kind: approveKind };
        return { kind: "credited", creditedCoins: 550, balance: 900, notification: { userIds: [7] } };
      },
      cancelAdminTopUp: async (id) => { calls.push(["cancel", id]); return { kind: cancelKind }; },
    },
    "@/lib/server/notifications": { dispatchNotification: async (notification) => { dispatched.push(notification); } },
  });
  return { calls, dispatched, async patch(body, { id = "4", origin = "https://novel.test" } = {}) {
    const request = new NextRequest(`https://novel.test/api/admin/topups/${id}`, {
      method: "PATCH",
      headers: { origin, "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    const response = await route.PATCH(request, { params: Promise.resolve({ id }) });
    return { status: response.status, body: await response.json() };
  } };
}

test("admin approval dispatches the committed user notification", async () => {
  const h = actionHarness();
  const result = await h.patch({ action: "approve" });
  assert.equal(result.status, 200);
  assert.deepEqual(h.calls, [["approve", 4]]);
  assert.deepEqual(h.dispatched, [{ userIds: [7] }]);
  assert.equal(result.body.data.creditedCoins, 550);
});

test("admin top-up actions enforce authorization, origin, validation and pending state", async () => {
  assert.equal((await actionHarness({ authorized: false }).patch({ action: "approve" })).status, 403);
  assert.equal((await actionHarness().patch({ action: "approve" }, { origin: "https://external.test" })).status, 403);
  for (const [body, id] of [[{ action: "refund" }, "4"], [{ action: "approve", amount: 1 }, "4"], ["{", "4"], [{ action: "approve" }, "0"]]) {
    assert.equal((await actionHarness().patch(body, { id })).status, 400);
  }
  assert.equal((await actionHarness({ approveKind: "already_processed" }).patch({ action: "approve" })).status, 409);
  assert.equal((await actionHarness({ cancelKind: "inactive" }).patch({ action: "cancel" })).status, 409);
});
