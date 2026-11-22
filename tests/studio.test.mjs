import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const Prisma = {
  sql: require("@prisma/client/runtime/client").sqltag,
  TransactionIsolationLevel: { RepeatableRead: "RepeatableRead" },
};
const sources = new Map();
for (const path of ["lib/server/studio-ownership.ts", "lib/server/studio.ts", "lib/server/studio-http.ts", "lib/server/chapter-document-http.ts", "schemas/studio.schema.ts", "app/api/studio/stories/route.ts", "app/api/studio/stories/[id]/route.ts", "app/api/studio/stories/[id]/chapters/route.ts", "app/api/studio/stories/[id]/chapters/import-doc/route.ts"]) {
  sources.set(path, ts.transpileModule(await readFile(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
function load(path, overrides = {}) {
  const record = { exports: {} };
  vm.runInNewContext(sources.get(path), { module: record, exports: record.exports, Buffer, console: { error() {} },
    require(name) {
      if (name in overrides) return overrides[name];
      if (name === "server-only") return {};
      if (name === "@/lib/server/public-cache") return { revalidatePublicStories() {} };
      if (name === "@/app/generated/prisma/client") return { Prisma };
      if (name === "@/lib/utils") return { normalizeVietnameseText: (text) => text.normalize("NFC"), slugify: (text) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-") };
      return require(name);
    },
  }, { filename: path });
  return record.exports;
}
const ownership = load("lib/server/studio-ownership.ts");
class DocumentError extends Error { constructor(message, code = "DOCUMENT_ERROR", status = 400) { super(message); this.code = code; this.status = status; } }
const transport = load("lib/server/chapter-document-http.ts", {
  "./studio-ownership": ownership,
  "@/lib/chapter-document-parser": { ChapterDocumentError: DocumentError },
});
const studio = load("lib/server/studio.ts", { "@/lib/server/studio-ownership": ownership });
const schema = load("schemas/studio.schema.ts");
const actorA = { idTaiKhoan: 7, roles: ["user"] };
const actorB = { idTaiKhoan: 8, roles: ["user"] };

function database({ name = "web_truyen", failRegistry = false } = {}) {
  let state = { stories: new Map(), authors: new Map(), registry: new Map(), accounts: new Map([[7, { tenTaiKhoan: "Tác giả A", active: true }], [8, { tenTaiKhoan: "Tác giả B", active: true }]]) };
  let writes = 0;
  const tx = {
    async $queryRaw(strings, ...values) {
      if (strings.join("?").includes("DATABASE()")) return [{ databaseName: name }];
      if (strings.join("?").includes("FOR UPDATE")) return state.accounts.get(values[0])?.active ? [{ idTaiKhoan: values[0] }] : [];
      throw new Error("Unexpected SQL");
    },
    taiKhoan: {
      async findUnique({ where }) { return state.accounts.get(where.idTaiKhoan) ?? null; },
      async findFirst({ where }) { return state.accounts.get(where.idTaiKhoan)?.active ? { idTaiKhoan: where.idTaiKhoan } : null; },
    },
    caiDatHeThong: {
      async findUnique({ where }) { return state.registry.has(where.khoa) ? { giaTri: state.registry.get(where.khoa) } : null; },
      async create({ data }) {
        if (failRegistry && data.khoa.startsWith("studio.story.")) throw new Error("Registry write failed");
        if (state.registry.has(data.khoa)) throw Object.assign(new Error("Duplicate"), { code: "P2002" });
        state.registry.set(data.khoa, data.giaTri); writes++; return data;
      },
    },
    tacGiaDich: {
      async create({ data }) { const idTacGiaDich = state.authors.size + 1; const author = { ...data, idTacGiaDich }; state.authors.set(idTacGiaDich, author); writes++; return author; },
      async findFirst({ where }) { return state.authors.get(where.idTacGiaDich) ?? null; },
    },
    truyen: {
      async create({ data }) { const idTruyen = state.stories.size + 1; const story = { ...data, idTruyen }; state.stories.set(idTruyen, story); writes++; return story; },
      async findFirst({ where }) {
        const story = state.stories.get(where.idTruyen);
        if (!story || story.isDeleted || (where.nguon && story.nguon !== where.nguon)) return null;
        const principal = where.truyen_tac_gia_dich?.some;
        if (principal && (story.truyen_tac_gia_dich?.create.idTAC_GIA_DICH !== principal.idTAC_GIA_DICH || story.truyen_tac_gia_dich?.create.vai_tro !== "tac_gia_chinh")) return null;
        return story;
      },
      async update({ where, data }) { const story = state.stories.get(where.idTruyen); Object.assign(story, data); writes++; return story; },
    },
  };
  const db = { ...tx, async $transaction(callback) { const before = structuredClone(state); const previousWrites = writes; try { return await callback(tx); } catch (error) { state = before; writes = previousWrites; throw error; } } };
  return { db, tx, get state() { return state; }, get writes() { return writes; } };
}
const input = () => schema.studioStorySchema.parse({ tenTruyen: "Truyện sáng tác", moTa: "Văn án" });

test("Studio creation atomically registers account ownership and principal author; User B cannot edit/delete", async () => {
  const app = database();
  const story = await studio.createStudioStory(app.db, actorA, input());
  assert.equal(story.nguon, "sang_tac");
  assert.equal(story.tenTruyen, story.tenTruyen.normalize("NFC"));
  assert.equal(app.state.authors.size, 1);
  const owner = await ownership.getStoryOwner(app.tx, story.idTruyen);
  assert.equal(owner.ownerId, 7);
  await assert.rejects(studio.updateStudioStory(app.db, actorB, story.idTruyen, { tenTruyen: "Stolen" }), (error) => error.status === 403);
  await assert.rejects(studio.deleteStudioStory(app.db, actorB, story.idTruyen), (error) => error.status === 403);
  assert.equal(app.state.stories.get(story.idTruyen).isDeleted, false);
  await studio.updateStudioStory(app.db, actorA, story.idTruyen, { tenTruyen: "Tên đã sửa" });
  assert.equal(app.state.stories.get(story.idTruyen).tenTruyen, "Tên đã sửa");
  await studio.createStudioStory(app.db, actorA, input());
  assert.equal(app.state.authors.size, 1, "same account reuses its registered author");
});

test("ownership cannot be forged through names, malformed metadata, foreign source or inactive accounts", async () => {
  const app = database();
  const story = await studio.createStudioStory(app.db, actorA, input());
  const key = ownership.storyOwnershipKey(story.idTruyen);
  const original = app.state.registry.get(key);
  app.state.registry.set(key, "{broken");
  assert.equal(await ownership.getStoryOwner(app.tx, story.idTruyen), null);
  app.state.registry.set(key, original);
  app.state.stories.get(story.idTruyen).nguon = "dich";
  assert.equal(await ownership.getStoryOwner(app.tx, story.idTruyen), null);
  app.state.stories.get(story.idTruyen).nguon = "sang_tac";
  app.state.accounts.get(7).active = false;
  assert.equal(await ownership.getStoryOwner(app.tx, story.idTruyen), null);
  app.state.accounts.get(7).active = true;
  app.state.stories.get(story.idTruyen).truyen_tac_gia_dich.create.idTAC_GIA_DICH = 100;
  assert.equal(await ownership.getStoryOwner(app.tx, story.idTruyen), null);
  assert.throws(() => schema.studioStorySchema.parse({ ...input(), ownerId: 7 }));
  assert.deepEqual(Object.keys(schema.studioStoryUpdateSchema.parse({ tenTruyen: "Tên khác" })), ["tenTruyen"], "PATCH must not reset omitted description/cover/status to create defaults");
});

test("wrong database blocks writes and registry failures roll back story and author together", async () => {
  const wrong = database({ name: "mydb" });
  await assert.rejects(studio.createStudioStory(wrong.db, actorA, input()), (error) => error.code === "DATABASE_MISMATCH");
  assert.equal(wrong.writes, 0);
  const app = database({ failRegistry: true });
  await assert.rejects(studio.createStudioStory(app.db, actorA, input()), /Registry write failed/);
  assert.equal(app.state.stories.size, 0);
  assert.equal(app.state.authors.size, 0);
  assert.equal(app.state.registry.size, 0);
});

test("admin can manage an existing story; soft deletion preserves financial/reader records", async () => {
  const app = database();
  const story = await studio.createStudioStory(app.db, actorA, input());
  await studio.deleteStudioStory(app.db, { idTaiKhoan: 99, roles: ["admin"] }, story.idTruyen);
  assert.equal(app.state.stories.get(story.idTruyen).isDeleted, true);
  assert.ok(app.state.registry.has(ownership.storyOwnershipKey(story.idTruyen)));
  await assert.rejects(ownership.assertStudioStoryAccess(app.tx, actorA, 999), (error) => error.status === 404);
});

function routeHarness({ authorized = true, user = actorA } = {}) {
  const { NextRequest, NextResponse } = require("next/server");
  let saves = 0;
  let previews = 0;
  const app = database();
  const http = load("lib/server/studio-http.ts", {
    "@/lib/server/studio-ownership": ownership,
    "@/lib/server/chapter-document-http": transport,
    "@/lib/chapter-document-parser": { ChapterDocumentError: DocumentError },
    "@/lib/server/auth-session": { requireUser: async () => authorized ? { authorized: true, user } : { authorized: false, response: NextResponse.json({ success: false }, { status: 401 }) } },
  });
  const schemaChapter = require("zod").z.object({ idTruyen: require("zod").z.number(), idChuong: require("zod").z.number().optional() }).passthrough();
  const overrides = {
    "@/lib/prisma": { prisma: app.db }, "@/lib/server/studio-http": http,
    "@/lib/server/studio": studio, "@/schemas/studio.schema": schema,
    "@/lib/server/studio-ownership": ownership,
    "@/schemas/chapter-writing.schema": { writingChapterSchema: schemaChapter, chapterImportSchema: schemaChapter },
    "@/lib/server/chapter-writing": { saveWritingChapter: async (db, actor, input) => { await ownership.assertStudioStoryAccess(db, actor, input.idTruyen); saves++; return { idChuong: 1 }; }, importWritingChapters: async (db, actor, input) => { await ownership.assertStudioStoryAccess(db, actor, input.idTruyen); saves++; return { imported: 2 }; } },
    "@/lib/server/chapter-document-http": { previewChapterDocument: async () => { previews++; return { text: "Chapter", chapters: [] }; } },
  };
  return { app, get saves() { return saves; }, get previews() { return previews; },
    async request(path, method, body, { route = "app/api/studio/stories/[id]/chapters/route.ts", headers = {}, id = "1" } = {}) {
      const request = new NextRequest(`https://example.test${path}`, { method, headers: { "content-type": "application/json", origin: "https://example.test", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const response = await load(route, overrides)[method](request, { params: Promise.resolve({ id }) });
      return { status: response.status, data: await response.json() };
    },
  };
}

test("Studio chapter APIs authenticate, protect ownership and reject URL/body story mismatch", async () => {
  const signedOut = routeHarness({ authorized: false });
  assert.equal((await signedOut.request("/api/studio/stories/1/chapters", "POST", { idTruyen: 1 })).status, 401);
  const app = routeHarness();
  await studio.createStudioStory(app.app.db, actorA, input());
  assert.equal((await app.request("/api/studio/stories/1/chapters", "POST", { idTruyen: 1 })).status, 201);
  assert.equal((await app.request("/api/studio/stories/1/chapters", "POST", { idTruyen: 2 })).status, 400);
  assert.equal((await app.request("/api/studio/stories/1/chapters", "POST", { idTruyen: 1 }, { headers: { origin: "https://evil.test" } })).status, 403);
  assert.equal((await app.request("/api/studio/stories/1/chapters", "POST", { idTruyen: 1 }, { headers: { "content-length": String(13 * 1024 * 1024) } })).status, 413);
  const foreign = routeHarness({ user: actorB });
  await studio.createStudioStory(foreign.app.db, actorA, input());
  assert.equal((await foreign.request("/api/studio/stories/1/chapters", "POST", { idTruyen: 1 })).status, 403);
  assert.equal((await foreign.request("/api/studio/stories/1/chapters", "PATCH", { idTruyen: 1, idChuong: 1 })).status, 403);
  assert.equal(foreign.saves, 0);
});

test("Studio import preview and batch commit deny nonowners before parsing/writing", async () => {
  const app = routeHarness({ user: actorB });
  await studio.createStudioStory(app.app.db, actorA, input());
  const route = "app/api/studio/stories/[id]/chapters/import-doc/route.ts";
  assert.equal((await app.request("/api/studio/stories/1/chapters/import-doc", "POST", { idTruyen: 1, chapters: [] }, { route })).status, 403);
  assert.equal((await app.request("/api/studio/stories/1/chapters/import-doc", "POST", undefined, { route, headers: { "content-type": "multipart/form-data; boundary=test" } })).status, 403);
  assert.equal(app.saves, 0);
  assert.equal(app.previews, 0);
  const own = routeHarness();
  await studio.createStudioStory(own.app.db, actorA, input());
  assert.equal((await own.request("/api/studio/stories/1/chapters/import-doc", "POST", { idTruyen: 1, chapters: [{ chuongSo: 1 }] }, { route })).status, 201);
  assert.equal(own.saves, 1);
});
