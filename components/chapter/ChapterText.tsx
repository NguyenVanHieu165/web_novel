"use client";

import { memo } from "react";
import Image from "next/image";
import { normalizeVietnameseText } from "@/lib/utils";

// Settings are inherited from the article; only a content change rebuilds the text tree.
export const ChapterText = memo(function ChapterText({ content }: { content: string }) {
  return normalizeVietnameseText(content).split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean).map((paragraph, index) => {
    // Only generated local tags are rendered. Arbitrary HTML remains escaped text.
    const image = paragraph.match(/^<img src="(\/uploads\/chapters\/[a-z0-9-]+\/[a-f0-9]{64}\.webp)" alt="([^"<>]*)" \/>$/);
    if (image) return <Image key={index} src={image[1]} alt={image[2]} width={800} height={1000} unoptimized className="mx-auto h-auto max-w-full rounded" />;
    return <p key={index} className="indent-6 break-words text-justify sm:indent-8">{paragraph}</p>;
  });
});
