import { load } from "cheerio";
import { normalizeVietnameseText } from "../vietnamese-text";
export const normalized = (value: string) => normalizeVietnameseText(value).replace(/\s+/g, " ").trim();
export const nameKey = (value: string) => normalized(value).toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Metadata identity must retain non-Latin letters instead of collapsing them into an ASCII slug. */
export function metadataKey(value: string) {
  const name = normalized(value).toLocaleLowerCase("vi");
  const folded = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").normalize("NFC")
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return folded || `symbol:${name}`;
}
export function cleanFragment(html: string) {
  const $ = load(html, {}, false);
  $("script,style,iframe,object,embed,form,button,nav,aside,footer,ins,noscript,[hidden],[aria-hidden=true],.ads,.advertisement,.adsbygoogle,[id^=ads-],[class*=watermark],.chapter-nav,.chapter-navigation,.social-share").remove();
  $("[style]").each((_, el) => { if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test($(el).attr("style") ?? "")) $(el).remove(); });
  return $;
}
/** Only text and generated local-image tags survive, never arbitrary source HTML. */
export async function chapterContent(html: string, image: (url: string, alt: string) => Promise<string | null>) {
  const $ = cleanFragment(html);
  const images = $("img").toArray(); const tokens: string[] = [];
  for (const el of images) {
    const node = $(el), src = node.attr("data-src") || node.attr("data-original") || node.attr("src");
    const replacement = src ? await image(src, normalized(node.attr("alt") || "Hình minh họa")) : null;
    if (replacement) { const token = `SCRAPERIMAGE${tokens.length}END`; tokens.push(replacement); node.replaceWith(`\n\n${token}\n\n`); } else node.remove();
  }
  $("br").replaceWith("\n");
  $("p,div,section,h1,h2,h3,li,blockquote,figure").each((_, el) => { $(el).prepend("\n\n"); $(el).append("\n\n"); });
  let value = normalizeVietnameseText($.root().text()).replace(/[\u200b-\u200d\ufeff]/g, "").split(/\r?\n/).map(s => s.trim())
    .filter(line => !/(?:đọc truyện (?:tại|ở)|nguồn truyện|truyện được đăng tại)\s*(?:https?:\/\/|www\.)/i.test(line)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  tokens.forEach((token, i) => { value = value.replace(`SCRAPERIMAGE${i}END`, token); });
  return value;
}
export const plainText = (html: string) => normalized(cleanFragment(html).text());
