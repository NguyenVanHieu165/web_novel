import assert from "node:assert/strict";
import test from "node:test";
import { loadNotificationModule as load } from "./notification-support.mjs";

const schema = load("schemas/admin-chapters.schema.ts");
const maxPurchasablePrice = 2_147_483_647;

test("bulk and auto-VIP prices stay within the purchase API's supported integer range", () => {
  for (const giaXu of [1, 5, maxPurchasablePrice]) {
    assert.equal(schema.chapterBulkSchema.safeParse({ action: "set-vip", chapterIds: [1], giaXu }).success, true);
    assert.equal(schema.autoVipSchema.safeParse({ storyId: 1, fromChapter: 1, giaXu }).success, true);
  }
  for (const giaXu of [maxPurchasablePrice + 1, 4_294_967_295, 0, -1, 1.5]) {
    assert.equal(schema.chapterBulkSchema.safeParse({ action: "set-vip", chapterIds: [1], giaXu }).success, false);
    assert.equal(schema.autoVipSchema.safeParse({ storyId: 1, fromChapter: 1, giaXu }).success, false);
  }
});

test("VIP price sheet uses the same maximum accepted by the purchase API", () => {
  const jsx = (type, props) => ({ type, props });
  const component = load("components/chapters/ChapterPriceSheet.tsx", {
    react: { useState: (value) => [value, () => {}] },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/components/ui/sheet": Object.fromEntries(["Sheet", "SheetContent", "SheetHeader", "SheetTitle", "SheetDescription"].map((name) => [name, name])),
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/input": { Input: "input" },
    "@/lib/axios": { default: {}, __esModule: true },
    "@/schemas/admin-chapters.schema": schema,
    sonner: { toast: {} },
  }).default;
  function inputs(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(inputs);
    return [...(node.type === "input" ? [node] : []), ...inputs(node.props?.children)];
  }
  for (const target of [{ kind: "chapters", ids: [1] }, { kind: "story", storyId: 1 }]) {
    const tree = component({ target, onClose() {}, onSuccess() {} });
    const price = inputs(tree).find((node) => node.props.name === "giaXu");
    assert.equal(Number(price.props.max), maxPurchasablePrice);
  }
});
