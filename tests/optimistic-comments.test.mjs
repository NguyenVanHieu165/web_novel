import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sources = await Promise.all([
  readFile(new URL("../components/comments/CommentSection.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/story/detail/StoryReviews.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/story/detail/StoryCommentReplies.tsx", import.meta.url), "utf8"),
]);

test("comment composers insert a temporary item before awaiting POST", () => {
  for (const source of sources) {
    const optimisticIndex = source.indexOf("isPending: true");
    const postIndex = source.indexOf('method: "POST"');
    assert.ok(optimisticIndex >= 0, "optimistic item is marked pending");
    assert.ok(postIndex > optimisticIndex, "POST follows optimistic insertion data");
    assert.match(source, /set(?:Comment)?Text\(""\)/, "composer is cleared immediately");
  }
});

test("comment composers replace the temporary item on success and restore text on rollback", () => {
  assert.match(sources[0], /item\.idBinhLuan === tempId \? payload\.data : item/);
  assert.match(sources[0], /setText\(content\)/);
  assert.match(sources[1], /item\.idBinhLuan === tempId \? parsed\.data\.data : item/);
  assert.match(sources[1], /previous\.filter\(item => item\.idBinhLuan !== tempId\)/);
  assert.match(sources[2], /item\.idBinhLuan === tempId \? parsed\.data\.data : item/);
  assert.match(sources[2], /setText\(content\)/);
});

test("pending comments disable chapter comment actions", () => {
  assert.match(sources[0], /disabled=\{pending \|\| id === null\}/);
  assert.match(sources[0], /Đang gửi…/);
});
