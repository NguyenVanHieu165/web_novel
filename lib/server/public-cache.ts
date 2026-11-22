import "server-only";
import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";

export const publicCacheTags = {
  home: "public-home",
  storyList: "public-story-list",
  storyDetails: "public-story-details",
  genres: "public-genres",
} as const;

export function publicStoryTag(slug: string): string {
  return `public-story:${createHash("sha256").update(slug.normalize("NFC").toLowerCase()).digest("hex")}`;
}

export function revalidatePublicStoryDetails(slugs?: readonly string[]): void {
  if (slugs?.length) {
    for (const slug of new Set(slugs)) revalidateTag(publicStoryTag(slug), { expire: 0 });
  } else {
    revalidateTag(publicCacheTags.storyDetails, { expire: 0 });
  }
}

// Call only after a mutation commits. Bulk mutations can expire all story details.
export function revalidatePublicStories(slugs?: readonly string[], genres = false): void {
  revalidateTag(publicCacheTags.home, { expire: 0 });
  revalidateTag(publicCacheTags.storyList, { expire: 0 });
  revalidatePublicStoryDetails(slugs);
  if (genres) revalidateTag(publicCacheTags.genres, { expire: 0 });
}
