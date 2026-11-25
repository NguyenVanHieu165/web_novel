import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { registerCollaborativeHandlers } from "../socket-server/handlers/collaborative.ts";
import { activeRooms } from "../socket-server/rooms/activeDocs.ts";

const require = createRequire(new URL("../socket-server/package.json", import.meta.url));
const Y = require("yjs");

function harness(t, { admin = true, join, leave } = {}) {
  const handlers = new Map(), messages = [], broadcasts = [], rooms = new Set();
  const socket = {
    id: "editor-test",
    data: { session: admin ? { roles: ["admin"], tenTaiKhoan: "Editor" } : null },
    on: (event, callback) => handlers.set(event, callback),
    emit: (event, payload) => messages.push({ event, payload }),
    join: join ?? (room => { rooms.add(room); }),
    leave: leave ?? (room => { rooms.delete(room); }),
    to: room => ({ emit: (event, payload) => broadcasts.push({ room, event, payload }) }),
  };
  const io = { to: socket.to };
  registerCollaborativeHandlers(io, socket);
  t.after(() => {
    for (const room of activeRooms.values()) {
      clearTimeout(room.gcTimeout);
      room.doc.destroy();
    }
    activeRooms.clear();
  });
  return { socket, rooms, messages, broadcasts, send: (event, payload) => handlers.get(event)(payload) };
}

test("all editor events reject malformed bodies without throwing, including guests", async t => {
  for (const admin of [false, true]) {
    const h = harness(t, { admin });
    for (const event of ["join-chapter", "update-crdt", "awareness-update", "leave-chapter"]) {
      for (const payload of [undefined, null, [], "bad", 1, true, {}, { chapterId: null }]) {
        await assert.doesNotReject(async () => h.send(event, payload), `${event}: ${JSON.stringify(payload)}`);
      }
    }
    assert.equal(activeRooms.size, 0);
    assert.equal(h.rooms.size, 0);
  }
});

test("chapter identifiers, initial content and binary payloads have strict bounds", async t => {
  const h = harness(t);
  for (const chapterId of [0, -1, 1.5, NaN, Infinity, 2_147_483_648, "0", "01", "1e2", " 1", "1.0", "2147483648"]) {
    await h.send("join-chapter", { chapterId, initialContent: "seed" });
  }
  for (const initialContent of [42, null, {}, "x".repeat(256 * 1024 + 1), "ế".repeat(100_000)]) {
    await h.send("join-chapter", { chapterId: 1, initialContent });
  }
  for (const stateUpdate of [[], {}, "bad", new ArrayBuffer(2), new Uint8Array(), new Uint8Array(256 * 1024 + 1), Uint8Array.of(255)]) {
    await assert.doesNotReject(async () => h.send("join-chapter", { chapterId: 1, stateUpdate }));
  }
  assert.equal(activeRooms.size, 0);
  assert.equal(h.rooms.size, 0);
});

test("well-formed guest events cannot join or remove an administrator's room", async t => {
  const admin = harness(t);
  await admin.send("join-chapter", { chapterId: 7, initialContent: "private draft" });
  const guest = harness(t, { admin: false });
  await guest.send("join-chapter", { chapterId: "7", initialContent: "forged" });
  await guest.send("leave-chapter", { chapterId: "7" });
  await guest.send("update-crdt", { chapterId: "7", update: Uint8Array.of(0, 0) });
  assert.equal(guest.rooms.size, 0);
  assert.equal(activeRooms.get(7).doc.getText("content").toString(), "private draft");
  assert.equal(activeRooms.get(7).users.size, 1);
});

test("valid numeric and canonical string IDs preserve join, updates, awareness, leave and reconnect", async t => {
  const h = harness(t);
  await h.send("join-chapter", { chapterId: "12", initialContent: "seed" });
  assert.equal(h.socket.data.chapterId, 12);
  assert.equal(activeRooms.get(12).doc.getText("content").toString(), "seed");
  const peer = new Y.Doc();
  t.after(() => peer.destroy());
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(activeRooms.get(12).doc));
  let update;
  peer.on("update", value => { update = value; });
  peer.getText("content").insert(4, " updated");
  await h.send("update-crdt", { chapterId: "12", update: Buffer.from(update) });
  assert.equal(activeRooms.get(12).doc.getText("content").toString(), "seed updated");
  await h.send("awareness-update", { chapterId: "12", update: Uint8Array.of(0) });
  assert.ok(h.broadcasts.some(event => event.event === "awareness-update-client"));
  await h.send("leave-chapter", { chapterId: "12" });
  assert.equal(h.rooms.size, 0);
  assert.equal(activeRooms.get(12).users.size, 0);
  assert.ok(activeRooms.get(12).gcTimeout);
  await h.send("join-chapter", { chapterId: 12, initialContent: "old seed" });
  assert.equal(activeRooms.get(12).gcTimeout, undefined);
  assert.equal(activeRooms.get(12).doc.getText("content").toString(), "seed updated");
  await h.send("disconnect");
  assert.equal(activeRooms.get(12).users.size, 0);
});

test("invalid updates and nonmember leaves cannot mutate or relay another document", async t => {
  const h = harness(t);
  await h.send("join-chapter", { chapterId: 1, initialContent: "seed" });
  const broadcasts = h.broadcasts.length;
  for (const update of [null, [], {}, "bad", new Uint8Array(), new Uint8Array(256 * 1024 + 1), Uint8Array.of(255)]) {
    await assert.doesNotReject(async () => h.send("update-crdt", { chapterId: 1, update }));
  }
  for (const update of [null, [], {}, "bad", new Uint8Array(), new Uint8Array(32 * 1024 + 1)]) {
    await h.send("awareness-update", { chapterId: 1, update });
  }
  await h.send("leave-chapter", { chapterId: 2 });
  assert.equal(activeRooms.get(1).doc.getText("content").toString(), "seed");
  assert.equal(activeRooms.get(1).users.size, 1);
  assert.equal(h.broadcasts.length, broadcasts);
});

test("adapter join/leave rejections and synchronous event errors stay contained", async t => {
  let joinFails = true, leaveFails = true;
  const h = harness(t, {
    join: async () => { if (joinFails) throw new Error("adapter join failed"); },
    leave: async () => { if (leaveFails) throw new Error("adapter leave failed"); },
  });
  await assert.doesNotReject(async () => h.send("join-chapter", { chapterId: 1, initialContent: "seed" }));
  assert.equal(activeRooms.size, 0);
  joinFails = false;
  await h.send("join-chapter", { chapterId: 1, initialContent: "seed" });
  await assert.doesNotReject(async () => h.send("leave-chapter", { chapterId: 1 }));
  assert.equal(activeRooms.get(1).users.size, 1);
  leaveFails = false;
  await h.send("leave-chapter", { chapterId: 1 });
  assert.equal(activeRooms.get(1).users.size, 0);
});

test("synchronous transport failures are caught and a later valid event can recover", async t => {
  let failed = true;
  const h = harness(t, { join: () => { if (failed) throw new Error("sync adapter failure"); } });
  await assert.doesNotReject(async () => h.send("join-chapter", { chapterId: 2, initialContent: "seed" }));
  assert.equal(activeRooms.size, 0);
  failed = false;
  await h.send("join-chapter", { chapterId: 2, initialContent: "seed" });
  assert.equal(activeRooms.get(2).doc.getText("content").toString(), "seed");
});

test("binary document seeds and queued async joins keep following updates in order", async t => {
  const peer = new Y.Doc();
  t.after(() => peer.destroy());
  peer.getText("content").insert(0, "binary seed");
  const stateUpdate = Y.encodeStateAsUpdate(peer);
  let update, release;
  peer.on("update", value => { update = value; });
  peer.getText("content").insert(11, " plus update");
  const gate = new Promise(resolve => { release = resolve; });
  const h = harness(t, { join: () => gate });
  const joining = h.send("join-chapter", { chapterId: 3, stateUpdate });
  const updating = h.send("update-crdt", { chapterId: 3, update });
  release();
  await Promise.all([joining, updating]);
  assert.equal(activeRooms.get(3).doc.getText("content").toString(), "binary seed plus update");
});
