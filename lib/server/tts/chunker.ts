import { load } from "cheerio";

export const MIN_CHUNK_LENGTH = 1_000;
export const MAX_CHUNK_LENGTH = 1_400;

/** Strip markup/artifacts, normalize Vietnamese Unicode and retain paragraph boundaries. */
export function cleanChapterText(content: string): string {
  const $ = load(content, null, false);
  $("script, style, noscript, iframe, svg, img, picture, source, video, audio").remove();
  $("br").replaceWith("\n");
  $("p, div, section, h1, h2, h3, h4, li, blockquote").each((_index, node) => { $(node).append("\n"); });
  return $.root().text().normalize("NFC")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/(?:https?:\/\/|www\.)[^\s<>"”]+/giu, " ")
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/[*=_-]{3,}/gu, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‍﻿]/gu, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/[^\S\n]+/gu, " ")
    .split(/\n+/u).map((line) => line.trim()).filter(Boolean).join("\n");
}

/** Split near 1,200 chars, preferring paragraph then sentence then whitespace boundaries. */
export function chunkChapterText(content: string): string[] {
  const clean = cleanChapterText(content);
  if (!clean) return [];
  const chunks: string[] = [];
  let remaining = clean;
  if (remaining.length > 180) {
    let cut = remaining.lastIndexOf(" ", 180);
    if (cut < 100) cut = 180;
    if (/[\uD800-\uDBFF]/u.test(remaining[cut - 1] ?? "")) cut--;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  while (remaining.length > MAX_CHUNK_LENGTH) {
    const target = Math.min(1_200, remaining.length - 1);
    const floor = Math.min(MIN_CHUNK_LENGTH, target);
    let cut = remaining.lastIndexOf("\n", target);
    if (cut < floor) {
      const prefix = remaining.slice(0, target + 1);
      const matches = [...prefix.matchAll(/[.!?…][”"')\]]?\s+/gu)];
      cut = matches.at(-1)?.index ?? -1;
      if (cut >= 0) cut += matches.at(-1)?.[0].length ?? 0;
    }
    if (cut < floor) cut = remaining.lastIndexOf(" ", target);
    if (cut <= 0) cut = target;
    if (/[\uD800-\uDBFF]/u.test(remaining[cut - 1] ?? "")) cut--;
    const chunk = remaining.slice(0, cut).trim();
    if (!chunk) break;
    chunks.push(chunk);
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
