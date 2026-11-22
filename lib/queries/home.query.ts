import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { unstable_cache } from "next/cache";
import { publicCacheTags } from "@/lib/server/public-cache";

const CARD_SELECT = {
  idTruyen: true,
  tenTruyen: true,
  slug: true,
  anhBia: true,
  soChuong: true,
  luotXem: true,
  diemDanhGiaTrungBinh: true,
  trang_thai: true,
  truyenTheLoai: {
    select: {
      theLoai: { select: { idTheLoai: true, tenTheLoai: true } },
    },
  },
} satisfies Prisma.TruyenSelect;

const emptyHomeData = () => ({
  featured: null,
  latest: [],
  updated: [],
  popular: [],
  rated: [],
  completed: [],
});

function serializeHomeStory<T extends { diemDanhGiaTrungBinh: { toString(): string } | null }>(story: T) {
  return { ...story, diemDanhGiaTrungBinh: story.diemDanhGiaTrungBinh?.toString() ?? null };
}

const getCachedHomeData = unstable_cache(async () => {
    // Each tab is ranked across the catalog on the server, not within the latest 12.
    // Keep five bounded parallel queries; the popular list also supplies the hero.
    const [latest, updated, popular, rated, completed] = await Promise.all([
      prisma.truyen.findMany({
        where: { isDeleted: false },
        orderBy: [{ createdAt: "desc" }, { idTruyen: "desc" }],
        take: 12,
        select: CARD_SELECT,
      }),
      prisma.truyen.findMany({
        where: { isDeleted: false },
        orderBy: [{ updatedAt: "desc" }, { idTruyen: "desc" }],
        take: 10,
        select: {
          ...CARD_SELECT,
          updatedAt: true,
          chuong: {
            where: { isDeleted: false },
            orderBy: [{ chuongSo: "desc" }, { idChuong: "desc" }],
            take: 1,
            select: { tieuDeChuong: true, slug: true },
          },
        },
      }),
      prisma.truyen.findMany({
        where: { isDeleted: false },
        orderBy: [{ luotXem: "desc" }, { idTruyen: "desc" }],
        take: 12,
        select: CARD_SELECT,
      }),
      prisma.truyen.findMany({
        where: { isDeleted: false, soLuotDanhGia: { gt: 0 } },
        orderBy: [{ diemDanhGiaTrungBinh: "desc" }, { soLuotDanhGia: "desc" }, { idTruyen: "desc" }],
        take: 10,
        select: CARD_SELECT,
      }),
      prisma.truyen.findMany({
        where: { isDeleted: false, trang_thai: "hoan_thanh" },
        orderBy: [{ luotXem: "desc" }, { idTruyen: "desc" }],
        take: 10,
        select: CARD_SELECT,
      }),
    ]);

    return {
      featured: popular[0] ? serializeHomeStory(popular[0]) : null,
      latest: latest.map(serializeHomeStory),
      updated: updated.map((story) => ({ ...serializeHomeStory(story), updatedAt: story.updatedAt?.toISOString() ?? null })),
      popular: popular.map(serializeHomeStory),
      rated: rated.map(serializeHomeStory),
      completed: completed.map(serializeHomeStory),
    };
}, ["public-home-v1"], { revalidate: 60, tags: [publicCacheTags.home] });

export async function getHomeData() {
  // Hosting adapters may evaluate modules at build time; defer database reads.
  if (process.env.NEXT_PHASE === "phase-production-build") return emptyHomeData();
  try {
    return await getCachedHomeData();
  } catch (error) {
    console.error("[getHomeData] Error fetching home data:", error);
    return emptyHomeData();
  }
}
