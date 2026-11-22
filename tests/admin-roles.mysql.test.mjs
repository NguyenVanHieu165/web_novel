import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import "dotenv/config";

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require("next/server");
const modules = {
  "@/lib/auth": "lib/auth.ts",
  "@/lib/api": "lib/api.ts",
  "@/lib/server/account-roles": "lib/server/account-roles.ts",
  "@/lib/server/spreadsheet-upload": "lib/server/spreadsheet-upload.ts",
  "@/schemas/admin-roles.schema": "schemas/admin-roles.schema.ts",
  "@/schemas/auth.schema": "schemas/auth.schema.ts",
  "@/schemas/user_schema": "schemas/user_schema.ts",
  register: "app/api/auth/register/route.ts",
  create: "app/api/admin/users/route.ts",
  importUsers: "app/api/admin/users/import/route.ts",
  membership: "app/api/admin/users/[id]/roles/route.ts",
  bulkMembership: "app/api/admin/users/roles/bulk/route.ts",
  account: "app/api/admin/users/[id]/route.ts",
};

const compiled = new Map(await Promise.all(Object.entries(modules).map(async ([name, path]) => {
  const source = await readFile(new URL("../" + path, import.meta.url), "utf8");
  return [name, ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText];
})));

function loadRoutes(prisma, { actorId = 1, authorized = true } = {}) {
  const cache = new Map();
  function load(name) {
    if (name === "server-only") return {};
    if (name === "@/lib/prisma") return { prisma };
    if (name === "./admin-roles.schema") return load("@/schemas/admin-roles.schema");
    if (name === "@/lib/server/auth-session") {
      return {
        requireAdmin: async () => authorized
          ? { authorized: true, user: { idTaiKhoan: actorId } }
          : { authorized: false, response: NextResponse.json({ success: false }, { status: 403 }) },
      };
    }
    if (!compiled.has(name)) return require(name);
    if (cache.has(name)) return cache.get(name).exports;
    const current = { exports: {} };
    cache.set(name, current);
    vm.runInThisContext(
      "(function (module, exports, require, process, console) {" + compiled.get(name) + "\n})",
      { filename: modules[name] },
    )(current, current.exports, load, {
      env: { ADMIN_IMPORTED_USER_PASSWORD: "TestPassword123" },
    }, { error() {} });
    return current.exports;
  }
  return {
    register: load("register").POST,
    create: load("create").POST,
    importUsers: load("importUsers").POST,
    roles: load("membership").PUT,
    bulkRoles: load("bulkMembership").PUT,
    account: load("account"),
  };
}

function request(path, method, data, origin = "https://webnovel.example") {
  return new NextRequest("https://webnovel.example" + path, {
    method,
    headers: { origin, "content-type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}

function updateRoles(handler, id, expectedRoleIds, roleIds, origin) {
  return handler(request("/api/admin/users/" + id + "/roles", "PUT", { expectedRoleIds, roleIds }, origin), {
    params: Promise.resolve({ id: String(id) }),
  });
}

test("role assignment validates ownership, and preserves an active admin on MySQL", {
  skip: process.env.RUN_MYSQL_SOCIAL_TESTS !== "1",
}, async (t) => {
  const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
  const { PrismaClient } = await import("../app/generated/prisma/client.ts");
  const mariadb = await import("mariadb");
  const database = "web_novel_roles_test_" + randomBytes(8).toString("hex");
  assert.match(database, /^web_novel_roles_test_[a-f0-9]{16}$/);
  const options = { host: process.env.DATABASE_HOST, user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD };
  const admin = await mariadb.createConnection(options);
  let prisma;
  let created = false;
  t.after(async () => {
    try {
      await prisma?.$disconnect();
      if (created) await admin.query("DROP DATABASE " + database);
    } finally {
      await admin.end();
    }
  });
  await admin.query("CREATE DATABASE " + database);
  created = true;
  prisma = new PrismaClient({ adapter: new PrismaMariaDb({ ...options, database, connectionLimit: 5 }) });
  for (const directory of ["20260618033143_increase_story_image_size", "20261119000000_add_data_integrity_constraints"]) {
    const migration = await readFile(new URL("../prisma/migrations/" + directory + "/migration.sql", import.meta.url), "utf8");
    for (const statement of migration.replace(/^--.*$/gm, "").split(";").map((sql) => sql.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
  }
  await prisma.vaiTro.createMany({ data: [
    { idVaiTro: 1, tenVaiTro: "admin" },
    { idVaiTro: 2, tenVaiTro: "user" },
    { idVaiTro: 3, tenVaiTro: "author" },
  ] });
  for (const idTaiKhoan of [1, 2]) {
    await prisma.taiKhoan.create({ data: {
      idTaiKhoan, tenTaiKhoan: "admin_" + idTaiKhoan, email: "admin_" + idTaiKhoan + "@example.test",
      matKhau: "fixture", vaiTroNguoiDung: { create: { idVaiTro: 1 } },
    } });
  }

  const routes = loadRoutes(prisma);
  const users = (account) => prisma.taiKhoan.findUnique({
    where: { tenTaiKhoan: account },
    include: { vaiTroNguoiDung: { orderBy: { idVaiTro: "asc" } }, viTien: true },
  });

  await t.test("signup grants reader role even if the caller submits an admin role field", async () => {
    const registered = await routes.register(request("/api/auth/register", "POST", {
      tenTaiKhoan: "new_reader", email: "new_reader@example.test", matKhau: "ReaderPass123",
      xacNhanMatKhau: "ReaderPass123", roleId: 1,
    }));
    assert.equal(registered.status, 201);
    const account = await users("new_reader");
    assert.deepEqual(account.vaiTroNguoiDung.map((role) => role.idVaiTro), [2]);
    assert.equal(account.viTien.soDuXu, 0);
  });

  await t.test("CMS grants the selected role and rejects an unknown role", async () => {
    const body = { tenTaikhoan: "new_author", email: "new_author@example.test", trangThai: "active" };
    assert.equal((await routes.create(request("/api/admin/users", "POST", { ...body, roleId: 999 }))).status, 400);
    assert.equal(await users("new_author"), null);
    assert.equal((await routes.create(request("/api/admin/users", "POST", { ...body, roleId: 3 }))).status, 201);
    const account = await users("new_author");
    assert.deepEqual(account.vaiTroNguoiDung.map((role) => role.idVaiTro), [3]);
    assert.equal(account.viTien.soDuXu, 0);
  });

  await t.test("administrator creation and promotion reject the shared default password", async () => {
    const body = { tenTaikhoan: "new_admin", email: "new_admin@example.test", trangThai: "locked", roleId: 1 };
    assert.equal((await routes.create(request("/api/admin/users", "POST", body))).status, 400);
    assert.equal((await routes.create(request("/api/admin/users", "POST", { ...body, initialPassword: "TestPassword123" }))).status, 400);
    assert.equal((await routes.create(request("/api/admin/users", "POST", { ...body, initialPassword: "PrivateAdmin123" }))).status, 201);
    assert.deepEqual((await users("new_admin")).vaiTroNguoiDung.map((role) => role.idVaiTro), [1]);
    const author = await users("new_author");
    assert.equal((await updateRoles(routes.roles, author.idTaiKhoan, [3], [1])).status, 409);
    assert.deepEqual((await users("new_author")).vaiTroNguoiDung.map((role) => role.idVaiTro), [3]);
  });

  await t.test("Excel import assigns readers and leaves existing admin memberships intact", async () => {
    const xlsx = require("xlsx");
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([
      { tenTaiKhoan: "imported_reader", email: "imported@example.test", roleId: 1 },
      { tenTaiKhoan: "admin_1", email: "admin_1@example.test", roleId: 3 },
    ]));
    const form = new FormData();
    form.set("file", new File([xlsx.write(workbook, { type: "buffer", bookType: "xlsx" })], "users.xlsx"));
    const response = await routes.importUsers(new NextRequest("https://webnovel.example/api/admin/users/import", {
      method: "POST",
      headers: { origin: "https://webnovel.example" },
      body: form,
    }));
    assert.equal(response.status, 200);
    const account = await users("imported_reader");
    assert.deepEqual(account.vaiTroNguoiDung.map((role) => role.idVaiTro), [2]);
    assert.equal(account.viTien.soDuXu, 0);
    assert.deepEqual((await users("admin_1")).vaiTroNguoiDung.map((role) => role.idVaiTro), [1]);
  });

  await t.test("role updates reject insufficient permission, cross-site writes, duplicate roles and stale edits", async () => {
    const account = await users("new_reader");
    const id = account.idTaiKhoan;
    assert.equal((await updateRoles(loadRoutes(prisma, { authorized: false }).roles, id, [2], [1])).status, 403);
    assert.equal((await updateRoles(routes.roles, id, [2], [1], "https://other.example")).status, 403);
    assert.equal((await updateRoles(routes.roles, id, [2], [2, 2])).status, 400);
    assert.equal((await updateRoles(routes.roles, id, [2], [2, 3])).status, 200);
    assert.equal((await updateRoles(routes.roles, id, [2], [1])).status, 409);
    assert.deepEqual((await users("new_reader")).vaiTroNguoiDung.map((role) => role.idVaiTro), [2, 3]);
  });

  await t.test("bulk role grant and revoke preserve unrelated memberships and skip repeat grants", async () => {
    const names = ["new_reader", "admin_2"];
    const accounts = await Promise.all(names.map(users));
    const accountIds = accounts.map(({ idTaiKhoan }) => idTaiKhoan);
    const listRoleIds = async (name) => (await users(name)).vaiTroNguoiDung.map(({ idVaiTro }) => idVaiTro);
    const original = await Promise.all(names.map(listRoleIds));
    const change = (operation) => routes.bulkRoles(request("/api/admin/users/roles/bulk", "PUT", { accountIds, roleId: 3, operation }));

    assert.equal((await change("grant")).status, 200);
    assert.equal((await change("grant")).status, 200);
    assert.deepEqual(await Promise.all(names.map(listRoleIds)), original.map((ids) => [...new Set([...ids, 3])]));
    assert.equal((await change("revoke")).status, 200);
    assert.deepEqual(await Promise.all(names.map(listRoleIds)), original.map((ids) => ids.filter((id) => id !== 3)));
  });

  await t.test("bulk writes reject unauthorized access, self-demotion and removal of the only role", async () => {
    const reader = await users("new_reader");
    const second = await users("admin_2");
    const listRoleIds = async (idTaiKhoan) => (await prisma.vaiTroNguoiDung.findMany({
      where: { idTaiKhoan }, select: { idVaiTro: true }, orderBy: { idVaiTro: "asc" },
    })).map(({ idVaiTro }) => idVaiTro);
    const accountIds = [reader.idTaiKhoan, second.idTaiKhoan];
    const before = await Promise.all([1, ...accountIds].map(listRoleIds));
    const makeRequest = (ids, roleId, operation, origin) =>
      request("/api/admin/users/roles/bulk", "PUT", { accountIds: ids, roleId, operation }, origin);
    assert.equal((await loadRoutes(prisma, { authorized: false }).bulkRoles(makeRequest(accountIds, 3, "grant"))).status, 403);
    assert.equal((await routes.bulkRoles(makeRequest(accountIds, 3, "grant", "https://other.example"))).status, 403);
    assert.equal((await routes.bulkRoles(makeRequest([1, ...accountIds], 1, "revoke"))).status, 409);
    assert.equal((await routes.bulkRoles(makeRequest(accountIds, 2, "revoke"))).status, 409);
    assert.equal((await routes.bulkRoles(makeRequest([reader.idTaiKhoan, 2_000_000], 3, "grant"))).status, 404);
    const author = await users("new_author");
    assert.equal((await routes.bulkRoles(makeRequest([reader.idTaiKhoan, author.idTaiKhoan], 1, "grant"))).status, 409);
    assert.deepEqual(await listRoleIds(author.idTaiKhoan), [3]);
    assert.deepEqual(await Promise.all([1, ...accountIds].map(listRoleIds)), before);
  });

  await t.test("prevents self-demotion, locking and deletion and serializes simultaneous admin removals", async () => {
    const context = { params: Promise.resolve({ id: "1" }) };
    assert.equal((await updateRoles(routes.roles, 1, [1], [2])).status, 409);
    assert.equal((await routes.account.PUT(request("/api/admin/users/1", "PUT", {
      tenTaikhoan: "admin_1", email: "admin_1@example.test", trangThai: "locked",
    }), context)).status, 409);
    assert.equal((await routes.account.DELETE(request("/api/admin/users/1", "DELETE"), context)).status, 409);

    const responses = await Promise.all([
      updateRoles(routes.roles, 2, [1], [2]),
      loadRoutes(prisma, { actorId: 2 }).account.DELETE(request("/api/admin/users/1", "DELETE"), context),
    ]);
    assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 403]);
    const activeAdmins = await prisma.taiKhoan.count({ where: {
      isDeleted: false, trangThai: "active", vaiTroNguoiDung: { some: { idVaiTro: 1 } },
    } });
    assert.equal(activeAdmins, 1);
  });

});
