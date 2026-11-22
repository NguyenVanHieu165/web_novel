import { load } from "cheerio";
import { normalizeVietnameseText } from "../vietnamese-text";
import { storyVoices, type StoryVoice } from "./voices";

function cleanText(value: string): string {
  const $ = load(value, null, false);
  $("script, style, noscript, iframe").remove();
  $("br").replaceWith("\n");
  $("p, div, section, h1, h2, h3, li").each((_index, node) => { $(node).append("\n"); });
  return normalizeVietnameseText($.root().text())
    .replace(/(?:https?:\/\/|www\.)[^\s<>"”]+/giu, "")
    .replace(/[*=_-]{3,}/gu, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200d\ufeff]/gu, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/[^\S\n]+/gu, " ")
    .split("\n").map((line) => line.trim()).filter(Boolean).join("\n\n");
}

/** Edge Read Aloud accepts speak/voice/prosody only: punctuation provides the pauses. */
export function prepareStoryTextForSpeech(content: string, title = "", voice: StoryVoice = "female-warm"): string {
  const pause = storyVoices[voice].paragraphPause;
  const punctuate = (text: string) => text
    .replace(/([“"])([^”"\n]+)([”"])/gu, (_match, open: string, dialogue: string, close: string) =>
      "… " + open + (/[.!?…]$/u.test(dialogue) ? dialogue : dialogue + ".") + close + " …")
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph + " " + pause)
    .join("\n\n");
  const body = cleanText(content);
  const heading = cleanText(title);
  return [heading ? heading.replace(/[.!?…]*$/u, "……") : "", body ? punctuate(body) : ""]
    .filter(Boolean).join("\n\n");
}

/** Prefer paragraph/sentence boundaries; split pathological unbroken text without losing characters. */
export function splitStoryText(text: string, limit = 1600): string[] {
  if (!Number.isInteger(limit) || limit < 32) throw new Error("Invalid speech chunk limit");
  const result: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    let end = rest.lastIndexOf("\n\n", limit);
    if (end < limit / 3) {
      const prefix = rest.slice(0, limit);
      const sentences = [...prefix.matchAll(/[.!?…]["”]?\s+/gu)];
      end = sentences.at(-1)?.index ?? -1;
      if (end >= 0) end += (sentences.at(-1)?.[0].length ?? 0);
    }
    if (end < limit / 3) end = rest.lastIndexOf(" ", limit);
    if (end <= 0) end = limit;
    // Never split a UTF-16 surrogate pair.
    if (/[\uD800-\uDBFF]/u.test(rest[end - 1])) end--;
    result.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) result.push(rest);
  return result;
}

export function storySSML(text: string, voice: StoryVoice): string {
  const profile = storyVoices[voice];
  const escaped = text.replace(/[<>&"']/gu, (char) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
  return '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="vi-VN">' +
    '<voice name="' + profile.name + '"><prosody rate="' + profile.rate + '" pitch="' + profile.pitch + '">' +
    escaped + "</prosody></voice></speak>";
}
