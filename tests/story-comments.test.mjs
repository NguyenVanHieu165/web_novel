import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require("next/server");
const source = await readFile(new URL("../app/api/truyen/[slug]/comments/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ authorized = true, available = true, failRead = false, failCreate = false, ownerId = null } = {}) {
  const comments = Array.from({ length: 31 }, (_, index) => ({
    idBinhLuan: index + 1,
    idTaiKhoan: 99,
    idTRUYEN: 5,
    idChuong: null,
    idBinhLuanCha: null,
    isDeleted: false,
    noiDung: `Comment ${index + 1}`,
    likeCount: null,
    createdAt: new Date("2026-11-19T00:00:00Z"),
    taiKhoan: { tenTaiKhoan: "reader", matKhau: "must-not-leak", email: "private@example.test", hoSoCaNhan: { ho_ten: "Reader Name", anh: null } },
  }));
  comments.push({ ...comments[0], idBinhLuan: 32, idChuong: 12, noiDung: "Chapter-specific spoiler" });
  comments.push({ ...comments[0], idBinhLuan: 33, idBinhLuanCha: 1, noiDung: "Reply" });
  comments.push({ ...comments[0], idBinhLuan: 34, isDeleted: true, noiDung: "Deleted" });
  let createdData;
  let authCalls = 0;
  let readCalls = 0;
  const filtered = ({ where }) => {
    assert.equal(where.idTRUYEN, 5);
    assert.equal(where.idChuong, null);
    assert.deepEqual(JSON.parse(JSON.stringify(where.OR)), [{ isDeleted: false }, { isDeleted: null }]);
    return comments.filter((item) => item.idTRUYEN === where.idTRUYEN && item.idChuong === null && item.idBinhLuanCha === where.idBinhLuanCha && !item.isDeleted);
  };
  const prisma = {
    truyen: {
      async findFirst({ where }) {
        assert.equal(where.isDeleted, false);
        return available && where.slug === "sample-story" ? { idTruyen: 5 } : null;
      },
    },
    binhLuan: {
      async findFirst({ where }) {
        assert.equal(where.idTRUYEN, 5);
        assert.equal(where.idChuong, null);
        assert.equal(where.idBinhLuanCha, null);
        return comments.find(item => item.idBinhLuan === where.idBinhLuan && item.idTRUYEN === where.idTRUYEN && item.idChuong === null && item.idBinhLuanCha === null && !item.isDeleted) ?? null;
      },
      async findMany(query) {
        readCalls += 1;
        if (failRead) throw new Error("Sensitive database read details");
        assert.deepEqual(JSON.parse(JSON.stringify(query.orderBy)), [{ createdAt: "desc" }, { idBinhLuan: "desc" }]);
        return filtered(query).sort((a, b) => b.idBinhLuan - a.idBinhLuan).slice(query.skip, query.skip + query.take);
      },
      async count(query) { return filtered(query).length; },
      async create({ data }) {
        if (failCreate) throw new Error("Sensitive database write details");
        createdData = data;
        return { ...comments[0], ...data, idBinhLuan: 100 };
      },
    },
  };
  const routeModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: routeModule,
    exports: routeModule.exports,
    console: { error() {} },
    require(name) {
      if (name === "@/lib/prisma") return { prisma };
      if (name === "@/lib/server/studio-ownership") return { getStoryOwner: async (_tx, id) => { assert.equal(id, 5); return ownerId ? { ownerId, authorId: 2 } : null; } };
      if (name === "@/lib/server/auth-session") return {
        async requireUser() {
          authCalls += 1;
          return authorized
            ? { authorized: true, user: { idTaiKhoan: 7, roles: ["user"] } }
            : { authorized: false, response: NextResponse.json({ success: false }, { status: 401 }) };
        },
      };
      return require(name);
    },
  });
  return {
    get createdData() { return createdData; },
    get authCalls() { return authCalls; },
    get readCalls() { return readCalls; },
    async request({ method = "GET", query = "", slug = "sample-story", body = { noiDung: "A good story" }, rawBody, headers = {} } = {}) {
      const request = new NextRequest(`https://webnovel.example/api/truyen/${slug}/comments${query}`, {
        method,
        headers: { "content-type": "application/json", origin: "https://webnovel.example", ...headers },
        ...(method === "POST" ? { body: rawBody ?? JSON.stringify(body) } : {}),
      });
      const response = await routeModule.exports[method](request, { params: Promise.resolve({ slug }) });
      return { status: response.status, body: await response.json() };
    },
  };
}

test("public comment pages are bounded, stable and exclude chapter comments, replies and deleted content", async () => {
  const app = harness({ authorized: false });
  const result = await app.request({ query: "?page=2&limit=15" });
  assert.equal(result.status, 200);
  assert.equal(result.body.meta.total, 31);
  assert.equal(result.body.meta.totalPage, 3);
  assert.equal(result.body.data.length, 15);
  assert.deepEqual(result.body.data.map((item) => item.idBinhLuan), Array.from({ length: 15 }, (_, index) => 16 - index));
  assert.equal(app.authCalls, 0);
  assert.equal(result.body.data[0].authorName, "Reader Name");
  assert.equal(result.body.data[0].likeCount, 0);
  assert.equal(JSON.stringify(result.body).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(result.body).includes("private@example"), false);
});

test("malformed pagination fails before database comment queries", async () => {
  for (const query of ["?page=NaN", "?page=0", "?page=-1", "?page=1.5", "?page=1000001", "?limit=0", "?limit=51"]) {
    const app = harness();
    assert.equal((await app.request({ query })).status, 400, query);
    assert.equal(app.readCalls, 0);
  }
});

test("posting requires a server-authenticated account", async () => {
  const app = harness({ authorized: false });
  assert.equal((await app.request({ method: "POST" })).status, 401);
  assert.equal(app.createdData, undefined);
});

test("cross-origin posting is rejected before authentication or creation", async () => {
  for (const headers of [{ origin: "https://attacker.example" }, { "sec-fetch-site": "cross-site" }]) {
    const app = harness();
    assert.equal((await app.request({ method: "POST", headers })).status, 403);
    assert.equal(app.authCalls, 0);
    assert.equal(app.createdData, undefined);
  }
});

test("empty/oversized content, malformed JSON and client-owned identity fields cannot be posted", async () => {
  for (const body of [
    { noiDung: "   " }, { noiDung: "a".repeat(1001) }, { noiDung: 42 },
    { noiDung: "hi", idTaiKhoan: 99 }, { noiDung: "hi", idTRUYEN: 99 },
    { noiDung: "hi", idChuong: 12 }, { noiDung: "hi", idBinhLuanCha: 12 },
  ]) {
    const app = harness();
    assert.equal((await app.request({ method: "POST", body })).status, 400);
    assert.equal(app.createdData, undefined);
  }
  assert.equal((await harness().request({ method: "POST", rawBody: "{" })).status, 400);
});

test("a successful comment persists trimmed content with the session identity and server story", async () => {
  const app = harness();
  const result = await app.request({ method: "POST", body: { noiDung: "  My real comment  " } });
  assert.equal(result.status, 201);
  assert.deepEqual(JSON.parse(JSON.stringify(app.createdData)), {
    idTaiKhoan: 7, idTRUYEN: 5, idChuong: null, idBinhLuanCha: null, noiDung: "My real comment",
  });
  assert.equal(result.body.data.idBinhLuan, 100);
  assert.equal(result.body.data.noiDung, "My real comment");
  assert.equal(result.body.data.idTaiKhoan, undefined);
});

test("unavailable stories cannot be listed or receive a comment", async () => {
  const app = harness({ available: false });
  assert.equal((await app.request()).status, 404);
  assert.equal((await app.request({ method: "POST" })).status, 404);
  assert.equal(app.createdData, undefined);
});

test("database errors return a generic error and never a successful fake comment", async () => {
  const readResult = await harness({ failRead: true }).request();
  const writeResult = await harness({ failCreate: true }).request({ method: "POST" });
  for (const result of [readResult, writeResult]) {
    assert.equal(result.status, 500);
    assert.equal(result.body.success, false);
    assert.equal(JSON.stringify(result.body).includes("Sensitive"), false);
    assert.equal(result.body.data, undefined);
  }
});

test("only server-registered story owners receive the author badge, without leaking account ids", async () => {
  const owner = await harness({ ownerId: 99 }).request();
  assert.equal(owner.body.data[0].isStoryAuthor, true);
  assert.equal(owner.body.data[0].idTaiKhoan, undefined);
  const reader = await harness({ ownerId: 7 }).request();
  assert.equal(reader.body.data[0].isStoryAuthor, false);
  const posted = await harness({ ownerId: 7 }).request({ method: "POST" });
  assert.equal(posted.body.data.isStoryAuthor, true);
  assert.equal((await harness().request({ method: "POST", body: { noiDung: "Spoof", isStoryAuthor: true } })).status, 400);
});

test("reply lists are bounded and isolated to a valid root comment in this story", async () => {
  const replies = await harness({ ownerId: 99 }).request({ query: "?replyTo=1&limit=10" });
  assert.equal(replies.status, 200);
  assert.equal(replies.body.meta.total, 1);
  assert.equal(replies.body.data[0].noiDung, "Reply");
  assert.equal(replies.body.data[0].isStoryAuthor, true);
  assert.equal(replies.body.data[0].replyTo, 1);
  for (const replyTo of [32, 33, 34, 999]) {
    assert.equal((await harness().request({ query: `?replyTo=${replyTo}` })).status, 404);
  }
  assert.equal((await harness().request({ query: "?replyTo=-1" })).status, 400);
});

test("normal readers and authors can reply with server-bound identity and NFC text", async () => {
  for (const ownerId of [7, null]) {
    const app = harness({ ownerId });
    const result = await app.request({ method: "POST", body: { noiDung: "  Hắn trả lời  ", replyTo: 1 } });
    assert.equal(result.status, 201);
    assert.equal(result.body.data.replyTo, 1);
    assert.equal(result.body.data.isStoryAuthor, ownerId === 7);
    assert.equal(app.createdData.idTaiKhoan, 7);
    assert.equal(app.createdData.idBinhLuanCha, 1);
    assert.equal(app.createdData.noiDung, "Hắn trả lời");
  }
});

test("cross-story, chapter, deleted or nested reply targets cannot receive a reply", async () => {
  for (const replyTo of [32, 33, 34, 999]) {
    const app = harness();
    assert.equal((await app.request({ method: "POST", body: { noiDung: "Reply", replyTo } })).status, 404);
    assert.equal(app.createdData, undefined);
  }
});
