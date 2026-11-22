// Local HTTP/MySQL acceptance checks. Uses the temporary QA actor created for UI verification.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { prisma as db } from "../lib/prisma.ts";
import { signToken } from "../lib/auth.ts";
import sharp from "sharp";

const BASE = "http://localhost:3000";
const DIR = "node_modules/.cache/import-url";
const options = { url: "https://truyendocviet1.shop/doc-truyen/trong-sinh-chi-danh-mon-doc-sung.html", maxChapters: 5, downloadImages: true, skipExisting: true, skipLocked: true };
const serialize = value => JSON.parse(JSON.stringify(value));
async function call(path, method, token, body) {
  return fetch(BASE + path, { method, headers: { ...(token ? { Cookie: `token=${token}` } : {}), Origin: BASE, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
try {
  assert.equal((await db.$queryRaw`SELECT DATABASE() AS db`)[0]?.db, "web_truyen");
  const baseline = JSON.parse(await fs.readFile(DIR + "/baseline.json", "utf8"));
  assert.equal(createHash("sha256").update(await fs.readFile("prisma/schema.prisma")).digest("hex"), baseline.schemaHash);
  const qa = JSON.parse(await fs.readFile(DIR + "/qa-account.json", "utf8"));
  const actor = await db.taiKhoan.findUnique({ where: { idTaiKhoan: qa.idTaiKhoan }, select: { idTaiKhoan: true, tenTaiKhoan: true, email: true } });
  const token = await signToken({ ...actor, roles: ["admin"] }, "15m");
  const endpoint = "/api/admin/stories/import-url";
  const missing = "00000000-0000-4000-8000-000000000001";
  for (const method of ["POST", "GET", "DELETE"]) {
    const r = await call(method === "POST" ? endpoint : endpoint + "/" + missing, method, null, method === "POST" ? options : undefined);
    assert.equal(r.status, 401, method + " requires login");
  }
  const normal = await db.taiKhoan.findFirst({ where: { trangThai: "active", isDeleted: false, vaiTroNguoiDung: { none: { vaiTro: { tenVaiTro: "admin" } } } }, select: { idTaiKhoan: true, tenTaiKhoan: true, email: true } });
  assert.ok(normal);
  const forgedRoles = await signToken({ ...normal, roles: ["admin"] }, "15m");
  assert.equal((await call(endpoint, "POST", forgedRoles, options)).status, 403, "Actual DB role required, not just JWT role");
  for (const url of ["http://127.1", "http://[::1]", "http://169.254.169.254/latest", "file:///etc/passwd"]) assert.equal((await call(endpoint, "POST", token, { ...options, url })).status, 400);
  assert.equal((await call(endpoint + "/" + missing, "GET", token)).status, 404);
  const current = await db.truyen.findUnique({ where: { slug: "trong-sinh-chi-danh-mon-doc-sung" }, include: { chuong: { orderBy: { chuongSo: "asc" }, include: { noiDungChuong: true } } } });
  assert.equal(current.chuong.length, 5);
  assert.ok(current.chuong.every(c => c.noiDungChuong?.noiDung?.length > 200));
  assert.ok(current.anhBia.startsWith("/uploads/covers/"));
  await sharp("public" + current.anhBia).metadata();
  const rerun = await call(endpoint, "POST", token, options); assert.equal(rerun.status, 202);
  const { jobId } = await rerun.json();
  let state;
  for (let i = 0; i < 30; i++) {
    state = await (await call(endpoint + "/" + jobId, "GET", token)).json();
    if (["completed", "partial", "failed", "cancelled"].includes(state.status)) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  assert.equal(state.status, "completed", JSON.stringify(state));
  assert.equal(state.savedChapters, 0); assert.equal(state.skippedChapters, 5);
  const otherAdmin = await db.taiKhoan.findFirst({ where: { idTaiKhoan: { not: actor.idTaiKhoan }, isDeleted: false, trangThai: "active", vaiTroNguoiDung: { some: { vaiTro: { tenVaiTro: "admin" } } } }, select: { idTaiKhoan: true, tenTaiKhoan: true, email: true } });
  assert.ok(otherAdmin);
  const otherToken = await signToken({ ...otherAdmin, roles: ["admin"] }, "15m");
  assert.equal((await call(endpoint + "/" + jobId, "GET", otherToken)).status, 404);
  const cancelStart = await call(endpoint, "POST", token, options); assert.equal(cancelStart.status, 202);
  const cancelId = (await cancelStart.json()).jobId;
  assert.equal((await call(endpoint, "POST", token, options)).status, 409, "Concurrent job refused");
  assert.equal((await call(endpoint + "/" + cancelId, "DELETE", token)).status, 200);
  for (let i = 0; i < 15; i++) { state = await (await call(endpoint + "/" + cancelId, "GET", token)).json(); if (state.status === "cancelled") break; await new Promise(r => setTimeout(r, 500)); }
  assert.equal(state.status, "cancelled");
  const oldStories = await db.truyen.findMany({ where: { idTruyen: { in: baseline.stories.map(b => b.idTruyen) } }, orderBy: { idTruyen: "asc" } });
  const oldChapters = await db.chuong.findMany({ where: { idChuong: { in: baseline.chapters.map(c => c.idChuong) } }, orderBy: { idChuong: "asc" }, include: { noiDungChuong: true } });
  assert.deepEqual(serialize(oldStories), baseline.stories); assert.deepEqual(serialize(oldChapters), baseline.chapters);
  const report = { database: "web_truyen", authenticatedAdminApi: true, loginRequired: true, actualAdminRoleRequired: true, ssrfRejected: true, ownerScoped: true, cancelPassed: true, concurrentJobRejected: true, resumeSkipped: 5,
    importedStoryId: current.idTruyen, importedChapters: 5, localCoverVerified: true, chapterImagesInSample: current.chuong.reduce((n, c) => n + (c.noiDungChuong?.noiDung?.match(/<img /g)?.length ?? 0), 0),
    preservedStories: oldStories.length, preservedChapters: oldChapters.length, schemaUnchanged: true };
  await fs.writeFile(DIR + "/http-verification.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await db.$disconnect(); }
