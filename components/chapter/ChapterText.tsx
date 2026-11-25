"use client";

import { memo } from "react";
import Image from "next/image";
import { normalizeVietnameseText } from "@/lib/utils";

function isChapterImageSource(source: string): boolean {
  if (/^\/uploads\/chapters\/[a-z0-9-]+\/[a-f0-9]{64}\.webp$/.test(source)) return true;
  if (!source.startsWith("https://") || /[\s\\]/u.test(source)) return false;
  try {
    const url = new URL(source);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com" &&
      !url.port && !url.username && !url.password;
  } catch {
    return false;
  }
}

// Settings are inherited from the article; only a content change rebuilds the text tree.
export const ChapterText = memo(function ChapterText({ content }: { content: string }) {
  return normalizeVietnameseText(content).split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean).map((paragraph, index) => {
    // Recognize only the importer's exact tag shape and trusted image sources.
    // All other HTML stays escaped React text, including extra attributes.
    const image = paragraph.match(/^<img src="([^"<>]+)" alt="([^"<>]*)" \/>$/);
    if (image && isChapterImageSource(image[1])) return <Image key={index} src={image[1]} alt={image[2]} width={800} height={1000} unoptimized className="mx-auto h-auto max-w-full rounded" />;
    return <p key={index} className="indent-6 break-words text-justify sm:indent-8">{paragraph}</p>;
  });
});
