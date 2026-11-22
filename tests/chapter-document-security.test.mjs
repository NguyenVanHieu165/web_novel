import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { loadNotificationModule } from "./notification-support.mjs";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const members = [], directory = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name ?? "word/document.xml");
    const body = Buffer.isBuffer(entry.body) ? entry.body : Buffer.from(entry.body ?? "small document");
    const method = entry.method ?? 8, flags = entry.descriptor ? 8 : 0;
    const compressed = method === 8 ? deflateRawSync(body) : body;
    const size = entry.size ?? body.length, crc = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8); local.writeUInt32LE(entry.descriptor ? 0 : crc, 14);
    local.writeUInt32LE(entry.descriptor ? 0 : compressed.length, 18);
    local.writeUInt32LE(entry.descriptor ? 0 : size, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    let descriptor = Buffer.alloc(0);
    if (entry.descriptor) {
      descriptor = Buffer.alloc(16); descriptor.writeUInt32LE(0x08074b50, 0); descriptor.writeUInt32LE(crc, 4);
      descriptor.writeUInt32LE(compressed.length, 8); descriptor.writeUInt32LE(size, 12);
    }
    members.push(local, name, compressed, descriptor); directory.push(central, name);
    offset += local.length + name.length + compressed.length + descriptor.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...members, central, end]);
}

function harness() {
  let extractions = 0;
  const parser = loadNotificationModule("lib/chapter-document-parser.ts", {
    "./vietnamese-text": { normalizeVietnameseText: value => value.normalize("NFC") },
    "./utils": { slugify: value => value.toLowerCase().replace(/\s+/g, "-") },
    mammoth: { extractRawText: async () => { extractions++; return { value: "Chương 1: An toàn\nNội dung chương." }; } },
  }, { Buffer, TextDecoder });
  return { parser, get extractions() { return extractions; }, parse(bytes) {
    return parser.parseChapterDocument({ name: "novel.docx", size: bytes.length,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  } };
}

test("bounded actual inflation rejects ZIP members that lie about expanded sizes before Mammoth", async () => {
  const app = harness();
  const malicious = zip([{ body: Buffer.alloc(8 * 1024 * 1024, 65), size: 1 }]);
  assert.ok(malicious.length < 10 * 1024 * 1024);
  await assert.rejects(app.parse(malicious), error => error.code === "DOCUMENT_TOO_LARGE" && error.status === 413);
  assert.equal(app.extractions, 0);
});

test("valid deflated, stored and data-descriptor members pass the structural check", async () => {
  for (const entry of [{ method: 0 }, { method: 8 }, { method: 8, descriptor: true }]) {
    const app = harness();
    const result = await app.parse(zip([entry]));
    assert.equal(result.chapters[0].noiDung, "Nội dung chương.");
    assert.equal(app.extractions, 1);
  }
});

test("duplicate central names and reused local offsets cannot mask document members", async () => {
  const app = harness();
  await assert.rejects(app.parse(zip([{}, {}])));
  const reused = zip([{}, { name: "word/styles.xml" }]);
  const centralStart = reused.readUInt32LE(reused.length - 6);
  const secondCentral = centralStart + 46 + Buffer.byteLength("word/document.xml");
  reused.writeUInt32LE(0, secondCentral + 42);
  await assert.rejects(app.parse(reused));
  assert.equal(app.extractions, 0);
});

test("central/local name, method and flag disagreements fail before extraction", async () => {
  for (const mutate of [
    bytes => { bytes[30] = 88; },
    bytes => bytes.writeUInt16LE(0, 8),
    bytes => bytes.writeUInt16LE(1, 6),
  ]) {
    const app = harness(), bytes = zip([{}]);
    mutate(bytes);
    await assert.rejects(app.parse(bytes));
    assert.equal(app.extractions, 0);
  }
});

test("CRC damage, path traversal and encrypted entries are rejected", async () => {
  for (const make of [
    () => { const bytes = zip([{}]); bytes.writeUInt32LE(0, 14); return bytes; },
    () => zip([{}, { name: "../word/document.xml" }]),
    () => { const bytes = zip([{}]); const start = bytes.readUInt32LE(bytes.length - 6); bytes.writeUInt16LE(1, 6); bytes.writeUInt16LE(1, start + 8); return bytes; },
  ]) {
    const app = harness();
    await assert.rejects(app.parse(make()));
    assert.equal(app.extractions, 0);
  }
});

test("a forged data descriptor and declared 40 MB excess are rejected", async () => {
  const app = harness(), bytes = zip([{ descriptor: true }]);
  const descriptor = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x07, 0x08]));
  bytes.writeUInt32LE(1, descriptor + 12);
  await assert.rejects(app.parse(bytes));
  await assert.rejects(app.parse(zip([{ size: 41 * 1024 * 1024 }])), error => error.code === "DOCUMENT_TOO_LARGE");
  assert.equal(app.extractions, 0);
});
