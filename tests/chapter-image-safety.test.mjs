import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadNotificationModule } from "./notification-support.mjs";
import { normalizeVietnameseText } from "../lib/vietnamese-text.ts";

const { ChapterText } = loadNotificationModule("components/chapter/ChapterText.tsx", {
  "@/lib/utils": { normalizeVietnameseText },
});
const render = content => renderToStaticMarkup(React.createElement(ChapterText, { content }));

test("chapter reader renders generated local images and trusted Cloudinary HTTPS images", () => {
  for (const src of [
    `/uploads/chapters/story/${"a".repeat(64)}.webp`,
    "https://res.cloudinary.com/demo/image/upload/v1/web-novel/chapters/story/image.webp",
    "https://res.cloudinary.com/demo/image/upload/w_800,q_auto/image.jpg?version=1&format=auto",
  ]) {
    const html = render(`<img src="${src}" alt="Hình minh họa" />`);
    assert.match(html, /<img\b/);
    assert.doesNotMatch(html, /&lt;img/);
    assert.match(html, /alt="Hình minh họa"/);
    assert.match(html, /width="800"/);
    assert.match(html, /height="1000"/);
  }
});

test("chapter reader escapes untrusted schemes, hosts, credentials and deceptive image URLs", () => {
  for (const src of [
    "http://res.cloudinary.com/demo/image.png", "https://evil.example/image.png",
    "https://res.cloudinary.com.evil.example/image.png", "https://res.cloudinary.com@evil.example/image.png",
    "https://user:secret@res.cloudinary.com/image.png", "https://res.cloudinary.com:8443/image.png",
    "//res.cloudinary.com/demo/image.png", "javascript:alert(1)", "data:image/svg+xml,bad",
    "https://res.cloudinary.com\\@evil.example/image.png", "/uploads/chapters/story/../../image.webp",
  ]) {
    const html = render(`<img src="${src}" alt="Unsafe" />`);
    assert.doesNotMatch(html, /<img\b/, src);
    assert.match(html, /&lt;img/, src);
  }
});

test("trusted image hosts never allow event handlers, arbitrary HTML or additional attributes", () => {
  for (const content of [
    '<img src="https://res.cloudinary.com/demo/image.png" alt="Unsafe" onerror="alert(1)" />',
    '<img src="https://res.cloudinary.com/demo/image.png" alt="Unsafe" /><script>alert(1)</script>',
    '<svg onload="alert(1)">test</svg>', '<iframe src="https://res.cloudinary.com/demo"></iframe>',
  ]) {
    const html = render(content);
    assert.doesNotMatch(html, /<(?:img|script|svg|iframe)\b/);
    assert.match(html, /&lt;/);
  }
});
