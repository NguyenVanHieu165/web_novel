import type { StoryCardData } from "@/components/story/StoryCard";

export type HomeDiscoveryTab = "all" | "trending" | "newest" | "top-rated" | "completed";

export interface HomeStoryCollections {
  latest: StoryCardData[];
  popular: StoryCardData[];
  rated: StoryCardData[];
  completed: StoryCardData[];
}

export interface HomeGenreLink {
  idTheLoai: number;
  tenTheLoai: string;
}

export function mergeUniqueStories<T extends { idTruyen: number }>(
  ...collections: ReadonlyArray<ReadonlyArray<T>>
): T[] {
  const stories = new Map<number, T>();
  for (const collection of collections) {
    for (const story of collection) {
      if (!stories.has(story.idTruyen)) stories.set(story.idTruyen, story);
    }
  }
  return Array.from(stories.values());
}

export function getHomeTabStories(collections: HomeStoryCollections, tab: HomeDiscoveryTab): StoryCardData[] {
  switch (tab) {
    case "trending":
      return mergeUniqueStories(collections.popular).slice(0, 10);
    case "newest":
      return mergeUniqueStories(collections.latest).slice(0, 10);
    case "top-rated":
      return mergeUniqueStories(collections.rated).slice(0, 10);
    case "completed":
      return mergeUniqueStories(collections.completed)
        .filter((story) => story.trang_thai === "hoan_thanh")
        .slice(0, 10);
    default: {
      // Mix the server-ranked lists without pretending to rank a recent-only sample.
      const suggestions = collections.latest.flatMap((story, index) => [
        story,
        collections.popular[index],
        collections.rated[index],
      ].filter((item): item is StoryCardData => Boolean(item)));
      return mergeUniqueStories(suggestions, collections.popular, collections.rated, collections.completed).slice(0, 10);
    }
  }
}

export function getHomeGenres(
  stories: ReadonlyArray<{ truyenTheLoai: Array<{ theLoai: HomeGenreLink }> }>,
): HomeGenreLink[] {
  const genres = new Map<number, HomeGenreLink>();
  for (const story of stories) {
    for (const { theLoai } of story.truyenTheLoai) genres.set(theLoai.idTheLoai, theLoai);
  }
  return Array.from(genres.values()).sort((a, b) => a.tenTheLoai.localeCompare(b.tenTheLoai, "vi"));
}
