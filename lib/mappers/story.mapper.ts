import type { Chuong, TheLoai, Truyen } from "@/app/generated/prisma/client";
import type { StoryCardData } from "@/components/story/StoryCard";

type StoryBadge = NonNullable<StoryCardData["badge"]>;
type StoryIdentity = Pick<Truyen, "idTruyen" | "tenTruyen" | "slug" | "anhBia"> & {
  truyenTheLoai?: { theLoai?: Pick<TheLoai, "tenTheLoai"> | null }[];
};
type StoryCardSource = StoryIdentity &
  Pick<Truyen, "soChuong" | "luotXem" | "diemDanhGiaTrungBinh" | "trang_thai">;
type RecentlyUpdatedSource = StoryIdentity & Pick<Truyen, "updatedAt"> & {
  chuong?: Pick<Chuong, "tieuDeChuong" | "slug">[];
};

export function mapStory(
  story: StoryCardSource | null | undefined,
  badge?: StoryBadge
): StoryCardData {
  if (!story) {
    return {
      idTruyen: 0,
      tenTruyen: "",
      slug: "",
      anhBia: "",
      soChuong: 0,
      luotXem: 0,
      diemDanhGiaTrungBinh: null,
      trang_thai: null,
      genres: [],
    };
  }

  return {
    idTruyen: story.idTruyen,
    tenTruyen: story.tenTruyen,
    slug: story.slug,
    anhBia: story.anhBia ?? "",
    soChuong: story.soChuong ?? 0,
    luotXem: story.luotXem ?? 0,
    diemDanhGiaTrungBinh: story.diemDanhGiaTrungBinh
      ? story.diemDanhGiaTrungBinh.toString()
      : null,
    trang_thai: story.trang_thai ?? null,
    genres:
      story.truyenTheLoai
        ?.map((item) => item.theLoai?.tenTheLoai ?? "")
        .filter(Boolean) ?? [],
    badge,
  };
}

export function mapRecentlyUpdated(story: RecentlyUpdatedSource) {
  return {
    idTruyen: story.idTruyen,
    tenTruyen: story.tenTruyen,
    slug: story.slug,
    anhBia: story.anhBia ?? "",
    latestChapterName: story.chuong?.[0]?.tieuDeChuong ?? null,
    latestChapterSlug: story.chuong?.[0]?.slug ?? null,
    genres:
      story.truyenTheLoai
        ?.map((item) => item.theLoai?.tenTheLoai ?? "")
        .filter(Boolean) ?? [],
    updatedAt: story.updatedAt,
  };
}
