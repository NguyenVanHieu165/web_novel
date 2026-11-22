import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const { NextRequest } = require("next/server");

async function loader(replacements = {}, cwd = root) {
  const modules = new Map();
  async function preload(file) {
    const source = await readFile(file, "utf8");
    const imports = [...source.matchAll(/from\s+["'](\.[^"']+)["']/gu)].map((match) => match[1]);
    for (const name of imports) {
      const dependency = path.resolve(path.dirname(file), name + ".ts");
      if (!modules.has(dependency)) await preload(dependency);
    }
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    modules.set(file, compiled);
  }
  const entryPaths = [
    "lib/tts/story-text.ts", "lib/tts/voices.ts", "lib/tts/http-range.ts",
    "lib/tts/edge-tts.ts", "app/api/chapters/[id]/audio/route.ts", "proxy.ts",
  ];
  for (const entry of entryPaths) await preload(path.join(root, entry));
  const loaded = new Map();
  const load = (file) => {
    if (loaded.has(file)) return loaded.get(file);
    const targetModule = { exports: {} };
    loaded.set(file, targetModule.exports);
    vm.runInNewContext(modules.get(file), {
      module: targetModule, exports: targetModule.exports, Buffer, setTimeout, clearTimeout,
      process: { cwd: () => cwd }, console: { error() {} },
      require(name) {
        if (name in replacements) return replacements[name];
        if (name === "server-only") return {};
        if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name + ".ts"));
        if (name.startsWith("@/lib/tts/")) return load(path.join(root, name.slice(2) + ".ts"));
        return require(name);
      },
    });
    return targetModule.exports;
  };
  return (file) => load(path.join(root, file));
}

test("story preprocessing removes markup/noise and escapes all SSML input", async () => {
  const load = await loader();
  const { prepareStoryTextForSpeech, storySSML } = load("lib/tts/story-text.ts");
  const output = prepareStoryTextForSpeech('<p>Tiếng Việt</p><script>secret()</script><p>“Xin chào”</p>*** --- === https://example.test/x', "Chương một".normalize("NFD"));
  assert.equal(output, output.normalize("NFC"));
  assert.ok(output.includes("Chương một……\n\n"));
  assert.ok(output.includes("… “Xin chào.” …"));
  assert.doesNotMatch(output, /secret|https:|\*\*\*|---|===|<\/?p>/u);
  const ssml = storySSML('<voice name="evil">&text</voice>', "male-deep");
  assert.equal((ssml.match(/<voice /gu) ?? []).length, 1);
  assert.ok(ssml.includes("&lt;voice"));
  assert.ok(ssml.includes('pitch="-3%"'));
  assert.ok(ssml.includes('rate="-3%"'));
  assert.doesNotMatch(ssml, /<break|<mstts:/u);
});

test("speech chunks preserve long text, sentence boundaries and surrogate pairs", async () => {
  const { splitStoryText } = (await loader())("lib/tts/story-text.ts");
  const text = ("Một câu trọn vẹn. ".repeat(400) + "😀".repeat(1700)).trim();
  const chunks = splitStoryText(text);
  assert.ok(chunks.every((chunk) => chunk.length <= 1600 && !/[\uD800-\uDBFF]$/u.test(chunk)));
  assert.equal(chunks.join("").replace(/\s/gu, ""), text.replace(/\s/gu, ""));
  assert.ok(chunks.length > 2);
});

test("range parser supports Safari suffix and open ranges, rejects unsatisfiable ranges", async () => {
  const { parseAudioRange } = (await loader())("lib/tts/http-range.ts");
  const plain = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(parseAudioRange("bytes=0-1", 100)), { start: 0, end: 1, partial: true });
  assert.deepEqual(plain(parseAudioRange("bytes=-10", 100)), { start: 90, end: 99, partial: true });
  assert.deepEqual(plain(parseAudioRange("bytes=90-", 100)), { start: 90, end: 99, partial: true });
  for (const header of ["bytes=100-", "bytes=4-2", "bytes=-0", "bytes=0-1,4-5", "bytes=999999999999999999999-", "broken"]) {
    assert.equal(parseAudioRange(header, 100), null);
  }
});

async function routeHarness({ price = 0, free = true, user = null, purchased = false, cached = true, available = true, body = "Nội dung" } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "novel-audio-route-"));
  const filePath = path.join(directory, "audio.mp3");
  await writeFile(filePath, Buffer.alloc(100, 7));
  const calls = { audio: 0, content: 0, purchase: 0, chapter: 0 };
  const fingerprint = "a".repeat(64);
  const prisma = {
    chuong: { async findFirst(query) {
      calls.chapter++;
      assert.equal(query.where.isDeleted, false);
      assert.equal(query.where.truyen.isDeleted, false);
      return available ? { idChuong: 11, chuongSo: 1, tieuDeChuong: "Chương một", isFree: free, giaXu: price, truyen: { slug: "test" } } : null;
    } },
    noiDungChuong: { async findUnique() { calls.content++; return { noiDung: body }; } },
    chuongDaMua: { async findUnique(query) {
      calls.purchase++;
      assert.equal(query.where.idTaiKhoan_idChuong.idTaiKhoan, user?.idTaiKhoan);
      return purchased ? { idChuong: 11 } : null;
    } },
  };
  const load = await loader({
    "@/lib/prisma": { prisma },
    "@/lib/server/auth-session": { requireUser: async () => user ? { authorized: true, user } : { authorized: false } },
    "@/lib/tts/edge-tts": { AudioBusyError: class extends Error {}, getChapterAudio: async () => {
      calls.audio++; return { filePath, bytes: 100, fingerprint, cached };
    } },
  });
  const handler = load("app/api/chapters/[id]/audio/route.ts");
  return {
    calls,
    async request(query = "", { id = "11", range, method = "GET" } = {}) {
      return handler.GET(new NextRequest("http://localhost/api/chapters/" + id + "/audio" + query, {
        method, headers: range ? { range } : {},
      }), { params: Promise.resolve({ id }) });
    },
    close: () => rm(directory, { recursive: true, force: true }),
  };
}

test("VIP cache and Range access are denied before reading content for guests and unpurchased users", async () => {
  for (const setup of [{ free: false }, { price: 10 }, { free: false, user: { idTaiKhoan: 7, roles: [] } }]) {
    const app = await routeHarness(setup);
    try {
      for (const query of ["", "?stream=1&voice=male-deep"]) {
        assert.equal((await app.request(query, { range: "bytes=0-1" })).status, 403);
      }
      assert.equal(app.calls.audio, 0);
      assert.equal(app.calls.content, 0);
    } finally { await app.close(); }
  }
});

test("free, purchased and admin chapters return protected URLs and exact byte ranges", async () => {
  for (const setup of [{}, { free: false, purchased: true, user: { idTaiKhoan: 7, roles: [] } }, { free: false, user: { idTaiKhoan: 1, roles: ["admin"] } }]) {
    const app = await routeHarness(setup);
    try {
      const metadata = await app.request("?voice=female-story");
      const result = await metadata.json();
      assert.equal(metadata.status, 200);
      assert.equal(result.cached, true);
      assert.match(result.audioUrl, /^\/api\/chapters\/11\/audio\?/u);
      const stream = await app.request("?stream=1", { range: "bytes=10-19" });
      assert.equal(stream.status, 206);
      assert.equal(stream.headers.get("content-range"), "bytes 10-19/100");
      assert.equal(stream.headers.get("cache-control"), "private, no-store");
      assert.equal(stream.headers.get("content-type"), "audio/mpeg");
      assert.equal((await stream.arrayBuffer()).byteLength, 10);
      assert.equal((await app.request("?stream=1", { range: "bytes=200-" })).status, 416);
      assert.equal((await app.request("?stream=1&v=" + "b".repeat(64))).status, 409);
      const head = await app.request("?stream=1", { method: "HEAD" });
      assert.equal((await head.arrayBuffer()).byteLength, 0);
    } finally { await app.close(); }
  }
});

test("input validation and missing chapters never trigger synthesis", async () => {
  const app = await routeHarness();
  try {
    assert.equal((await app.request("?voice=invalid")).status, 400);
    assert.equal((await app.request("", { id: "../file" })).status, 400);
    assert.equal((await app.request("", { id: "0" })).status, 400);
    assert.equal(app.calls.chapter, 0);
  } finally { await app.close(); }
  const missing = await routeHarness({ available: false });
  try { assert.equal((await missing.request()).status, 404); assert.equal(missing.calls.audio, 0); }
  finally { await missing.close(); }
});

test("proxy refuses direct, encoded and case-varied public audio paths without auth work", async () => {
  let checks = 0;
  const load = await loader({ "@/lib/auth": { verifyToken: async () => { checks++; return null; } } });
  const { proxy } = load("proxy.ts");
  for (const pathname of ["/uploads/audio/test/file.mp3", "/%75ploads/audio/test/file.mp3", "/UPLOADS/AUDIO/test/file.mp3", "/uploads/audio/test/file.mp3.json", "/uploads/audio./test/file.mp3"]) {
    assert.equal((await proxy(new NextRequest("http://localhost" + pathname))).status, 403);
  }
  assert.equal(checks, 0);
});

test("failed synthesis never publishes a cache entry and releases in-flight work for a retry", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "novel-audio-failure-"));
  let fail = true;
  class FakeTTS {
    async setMetadata() {}
    close() {}
    rawToStream() {
      return { audioStream: Readable.from((async function* () {
        yield Buffer.from("partial");
        if (fail) throw new Error("Network interrupted");
        yield Buffer.from("complete");
      })()) };
    }
  }
  const load = await loader({ "msedge-tts": { MsEdgeTTS: FakeTTS, OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: "mp3" } } }, directory);
  const { getChapterAudio } = load("lib/tts/edge-tts.ts");
  const input = { chapterId: 12, storySlug: "test", chapterNumber: 1, title: "Chương một", content: "Xin chào.", voice: "female-warm" };
  try {
    await assert.rejects(getChapterAudio(input), /Network interrupted/u);
    const files = await readdir(directory);
    assert.equal(files.length, 0);
    fail = false;
    assert.equal((await getChapterAudio(input)).cached, false);
    assert.equal((await getChapterAudio(input)).cached, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("audio cache deduplicates simultaneous generation, persists atomically and invalidates edited text", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "novel-audio-cache-"));
  let calls = 0;
  class FakeTTS {
    async setMetadata() {}
    close() {}
    rawToStream() {
      calls++;
      return { audioStream: Readable.from((async function* () {
        await new Promise((resolve) => setTimeout(resolve, 20));
        yield Buffer.from("fff364c400000003", "hex");
      })()) };
    }
  }
  const load = await loader({ "msedge-tts": { MsEdgeTTS: FakeTTS, OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: "mp3" } } }, directory);
  const { getChapterAudio } = load("lib/tts/edge-tts.ts");
  const input = { chapterId: 11, storySlug: "../test", chapterNumber: 1, title: "Chương một", content: "Xin chào.", voice: "female-warm" };
  try {
    const [first, second] = await Promise.all([getChapterAudio(input), getChapterAudio(input)]);
    assert.equal(calls, 1);
    assert.equal(first.filePath, second.filePath);
    assert.equal(second.cached, true);
    assert.equal((await getChapterAudio(input)).cached, true);
    const edited = await getChapterAudio({ ...input, content: "Nội dung đã sửa." });
    assert.notEqual(edited.fingerprint, first.fingerprint);
    assert.equal(calls, 2);
    assert.ok(first.filePath.startsWith(path.join(directory, "public", "uploads", "audio")));
    const files = await readdir(path.dirname(first.filePath));
    assert.ok(files.every((file) => !file.endsWith(".tmp")));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
