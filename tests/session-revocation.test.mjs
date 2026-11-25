import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { loadNotificationModule } from "./notification-support.mjs";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const auth = loadNotificationModule("lib/auth.ts", {}, {
  process: { env: { JWT_SECRET: "session-revocation-unit-test-secret" } },
});

function selectFields(record, select) {
  if (!select) return record;
  if (Array.isArray(record)) return record.map(item => selectFields(item, select));
  return Object.fromEntries(Object.entries(select).map(([key, selection]) => [
    key,
    selection === true || record[key] == null ? record[key] : selectFields(record[key], selection.select),
  ]));
}

async function harness({ roles = ["user"], purchased = true, free = false, status = "active", deleted = false } = {}) {
  const account = {
    idTaiKhoan: 7, tenTaiKhoan: "reader", email: "reader@example.test", matKhau: "current-password-hash",
    trangThai: status, isDeleted: deleted, viTien: { soDuXu: 70, tongNapXu: 100 },
    hoSoCaNhan: { ho_ten: "Reader Name", anh: null },
    vaiTroNguoiDung: roles.map(tenVaiTro => ({ vaiTro: { tenVaiTro } })),
  };
  const reads = { content: 0, purchase: 0, wallet: 0, profile: 0 };
  const prisma = {
    taiKhoan: {
      async findFirst({ where, select }) {
        if (account.trangThai !== "active" || account.isDeleted || where.idTaiKhoan !== account.idTaiKhoan) return null;
        if (select.hoSoCaNhan || select.viTien) reads.profile++;
        return selectFields(account, select);
      },
      async findUnique({ select }) { reads.profile++; return selectFields(account, select); },
    },
    viTien: { async findUnique() { reads.wallet++; return account.viTien; } },
    truyen: { async findFirst() { return { idTruyen: 1, tenTruyen: "Story", slug: "story", anhBia: null }; } },
    chuong: { async findFirst({ where }) {
      return where.slug ? { idChuong: 11, idTruyen: 1, chuongSo: 1, tieuDeChuong: "Chapter", slug: "chapter", isFree: free, giaXu: free ? 0 : 10 } : null;
    } },
    chuongDaMua: { async findUnique() { reads.purchase++; return purchased ? { idChuong: 11 } : null; } },
    noiDungChuong: { async findUnique() { reads.content++; return { noiDung: "Protected chapter content" }; } },
  };
  let cookie;
  const session = loadNotificationModule("lib/server/auth-session.ts", {
    "@/lib/auth": auth, "@/lib/prisma": { prisma },
  });
  const sharedImports = { "@/lib/auth": auth, "@/lib/prisma": { prisma }, "@/lib/server/auth-session": session };
  const chapterQuery = loadNotificationModule("lib/queries/chapter.query.ts", {
    ...sharedImports, react: { cache: callback => callback },
    "next/headers": { cookies: async () => ({ get: () => cookie ? { value: cookie } : undefined }) },
  });
  const me = loadNotificationModule("app/api/auth/me/route.ts", sharedImports).GET;
  const payload = { idTaiKhoan: account.idTaiKhoan, tenTaiKhoan: account.tenTaiKhoan, email: account.email, roles };
  return {
    account, reads, session,
    token: version => auth.signToken({ ...payload, ...(version === undefined ? {} : { passwordVersion: version }) }),
    currentVersion: () => auth.passwordVersion(account.matKhau),
    readChapter: async token => { cookie = token; return chapterQuery.getChapterDetail("story", "chapter"); },
    readMe: token => me(new NextRequest("https://example.test/api/auth/me", {
      headers: token ? { cookie: `token=${token}` } : {},
    })),
  };
}

test("revoked and legacy sessions cannot read purchased or admin VIP content", async () => {
  for (const roles of [["user"], ["admin"]]) {
    for (const version of [auth.passwordVersion("old-password-hash"), undefined]) {
      const app = await harness({ roles });
      const chapter = await app.readChapter(await app.token(version));
      assert.equal(chapter.access.canRead, false);
      assert.equal(chapter.access.requiresLogin, true);
      assert.equal(chapter.access.balance, null);
      assert.equal(chapter.currentChapter.noiDungChuong, null);
      assert.equal(app.reads.content, 0);
      assert.equal(app.reads.purchase, 0);
      assert.equal(app.reads.wallet, 0);
    }
  }
});

test("current sessions preserve purchased/admin access, balance and non-purchaser restrictions", async () => {
  for (const options of [{ purchased: true }, { purchased: false, roles: ["admin"] }, { purchased: false }]) {
    const app = await harness(options);
    const chapter = await app.readChapter(await app.token(app.currentVersion()));
    const allowed = options.purchased !== false || options.roles?.includes("admin") === true;
    assert.equal(chapter.access.canRead, allowed);
    assert.equal(chapter.access.requiresLogin, false);
    assert.equal(chapter.access.balance, 70);
    assert.equal(app.reads.content, allowed ? 1 : 0);
  }
});

test("guest and revoked sessions retain public free chapters without private account data", async () => {
  for (const tokenType of ["guest", "revoked"]) {
    const app = await harness({ free: true });
    const chapter = await app.readChapter(tokenType === "guest" ? undefined : await app.token("old-version"));
    assert.equal(chapter.access.canRead, true);
    assert.equal(chapter.access.balance, null);
    assert.equal(app.reads.wallet, 0);
    assert.equal(app.reads.purchase, 0);
  }
});

test("auth/me rejects stale, missing-version and malformed tokens before private profile reads", async () => {
  const app = await harness();
  for (const token of [await app.token("old-version"), await app.token(undefined), "invalid.jwt.token"]) {
    const response = await app.readMe(token);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).success, false);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(response.cookies.get("token")?.value, "");
  }
  assert.equal(app.reads.profile, 0);
});

test("password rotation invalidates the same previously accepted token at both readers", async () => {
  const app = await harness();
  const token = await app.token(app.currentVersion());
  assert.equal((await app.readMe(token)).status, 200);
  assert.equal((await app.readChapter(token)).access.canRead, true);
  app.account.matKhau = "new-password-hash";
  const before = app.reads.content;
  assert.equal((await app.readMe(token)).status, 401);
  assert.equal((await app.readChapter(token)).access.canRead, false);
  assert.equal(app.reads.content, before);
  const refreshed = await app.token(app.currentVersion());
  assert.equal((await app.readMe(refreshed)).status, 200);
  assert.equal((await app.readChapter(refreshed)).access.canRead, true);
});

test("auth/me preserves its public DTO and never returns password credentials", async () => {
  const app = await harness();
  const token = await app.token(app.currentVersion());
  const response = await app.readMe(token);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, user: {
    idTaiKhoan: 7, tenTaiKhoan: "reader", email: "reader@example.test", roles: ["user"],
    soDuXu: 70, hoTen: "Reader Name", anh: null,
  } });
  const authenticated = await app.session.authenticateUser(token);
  assert.equal(authenticated.authorized, true);
  assert.equal("matKhau" in authenticated.user, false);
  assert.equal("passwordVersion" in authenticated.user, false);
});

test("locked or deleted accounts are denied despite a current password version", async () => {
  for (const options of [{ status: "locked" }, { deleted: true }]) {
    const app = await harness(options);
    const token = await app.token(app.currentVersion());
    assert.equal((await app.readMe(token)).status, 401);
    assert.equal((await app.readChapter(token)).access.canRead, false);
    assert.equal(app.reads.content, 0);
  }
});
