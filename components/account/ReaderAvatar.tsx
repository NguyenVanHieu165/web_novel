"use client";

import Image from "next/image";
import { useState } from "react";
import { avatarUrlSchema } from "@/schemas/reader-account.schema";

export default function ReaderAvatar({ url, name, size }: { url: string | null; name: string; size: number }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const src = url && avatarUrlSchema.safeParse(url).success ? url : null;

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-200"
      style={{ width: size, height: size }}
    >
      {src && src !== failedUrl ? (
        <Image src={src} width={size} height={size} alt="" unoptimized referrerPolicy="no-referrer"
          className="size-full object-cover" onError={() => setFailedUrl(src)} />
      ) : (
        Array.from(name.trim())[0]?.toLocaleUpperCase("vi-VN") || "?"
      )}
    </span>
  );
}
