import assert from "node:assert/strict";
import test from "node:test";
import { candidates, deleteEmptyStory, fingerprint, localCoverName } from "../scripts/prune-empty-stories.ts";

function harness({ hasChapters = false, linkedVolume = false, failAt, race = false } = {}) {
  const committed = [];
  const calls = [];
  function delegate(name) {
    return { async deleteMany(query) {
      calls.push({ name, query });
      if (name === failAt) throw new Error("injected failure");
      return { count: name === "truyen" && race ? 0 : 1 };
    } };
  }
  return { calls, committed, async run() {
    const tx = {
      async $queryRaw(strings, id) { calls.push({ name: "lock", text: strings.join("?"), id }); return [{ id }]; },
      truyen: { ...delegate("truyen"), async findFirst(query) { calls.push({ name: "recheck", query }); return hasChapters ? null : { idTruyen: 42, tenTruyen: "Empty story", slug: "empty", anhBia: "/uploads/covers/empty.webp", anhThumbnail: null }; } },
      chuong: { async count() { return linkedVolume ? 1 : 0; } },
      binhLuan: { ...delegate("comments"), async count() { return 0; } },
      likeBinhLuan: delegate("likes"), danhGiaTruyen: delegate("ratings"), theoDoiTruyen: delegate("follows"),
      lichSuDoc: delegate("history"), truyenTheLoai: delegate("genres"), truyen_tac_gia_dich: delegate("authors"), quyen: delegate("volumes"),
    };
    // Only publish the simulated writes when the transaction callback succeeds.
    const result = await deleteEmptyStory(tx, 42);
    committed.push(...calls.filter(call => !["lock", "recheck"].includes(call.name)));
    return result;
  } };
}

test("candidate scan uses absence of ALL chapter rows, never the cached chapter count", async () => {
  const queries = [];
  const rows = await candidates({ truyen: { async findMany(query) { queries.push(query); return queries.length === 1 ? [{ idTruyen: 42 }] : []; } } });
  assert.deepEqual(rows, [{ idTruyen: 42 }]);
  assert.deepEqual(queries[0].where.chuong, { none: {} });
  assert.equal(queries[0].where.soChuong, undefined);
  assert.equal(queries[1].where.idTruyen.gt, 42);
});

test("a story gaining a chapter is skipped after the row lock, with no dependent deletes", async () => {
  const h = harness({ hasChapters: true });
  assert.equal((await h.run()).status, "has-chapters");
  assert.equal(h.committed.length, 0);
  assert.match(h.calls[0].text, /FOR UPDATE/);
  assert.deepEqual(h.calls[1].query.where.chuong, { none: {} });
});

test("likes precede comments, dependent rows precede the final guarded story delete", async () => {
  const h = harness();
  assert.equal((await h.run()).status, "deleted");
  const order = h.committed.map(call => call.name);
  assert.ok(order.indexOf("likes") < order.indexOf("comments"));
  assert.equal(order.at(-1), "truyen");
  assert.deepEqual(h.committed.at(-1).query.where, { idTruyen: 42, chuong: { none: {} } });
  assert.equal(h.calls.some(call => call.name === "chapterDelete"), false);
});

test("failure and final predicate failure roll back all prior dependent deletes", async () => {
  for (const scenario of [{ failAt: "ratings" }, { race: true }]) {
    const h = harness(scenario);
    await assert.rejects(h.run(), /injected failure|rolled back/);
    assert.equal(h.committed.length, 0);
  }
});

test("cross-story volume references prevent any deletion", async () => {
  const h = harness({ linkedVolume: true });
  await assert.rejects(h.run(), /volume is referenced/);
  assert.equal(h.committed.length, 0);
});

test("cover paths stay inside the explicit cover directory and recognize shared aliases", () => {
  assert.equal(localCoverName("/uploads/covers/laca-abc.webp"), "laca-abc.webp");
  assert.equal(localCoverName("/_next/image?url=%2Fuploads%2Fcovers%2Flaca-abc.webp&w=500"), "laca-abc.webp");
  assert.equal(localCoverName("https://app.example/uploads/covers/shared.webp", true), "shared.webp");
  for (const value of ["/uploads/covers/../outside.webp", "/uploads/covers/%2e%2e%2foutside.webp", "/uploads/covers/nested/a.webp", "C:\\outside.webp", "/other/a.webp", "/uploads/covers/file.txt", "https://evil.example/uploads/covers/a.webp", "//evil.example/uploads/covers/a.webp", "/_next/image?url=https%3A%2F%2Fevil.example%2Fuploads%2Fcovers%2Fa.webp"]) assert.equal(localCoverName(value), null);
});

test("preservation fingerprints ignore row order and detect any chapter text change", () => {
  assert.equal(fingerprint([{ id: 2 }, { id: 1 }]), fingerprint([{ id: 1 }, { id: 2 }]));
  assert.notEqual(fingerprint([{ id: 1, body: "original" }]), fingerprint([{ id: 1, body: "changed" }]));
});
