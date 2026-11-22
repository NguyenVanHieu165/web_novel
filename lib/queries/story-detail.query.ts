import { prisma } from "@/lib/prisma";
import { cache } from "react";
import { getStoryOwner } from "@/lib/server/studio-ownership";
import { unstable_cache } from "next/cache";
import { publicCacheTags, publicStoryTag } from "@/lib/server/public-cache";
import { mapStoryDetail, type StoryDetailData } from "@/lib/mappers/story-detail.mapper";

export const getStoryDetailBySlug = cache(async (slug: string) => {
  try {
    const story = await prisma.truyen.findFirst({
      where: {
        slug,
        isDeleted: false,
      },
      include: {
        truyenTheLoai: {
          include: {
            theLoai: true,
          },
        },
        danhGiaTruyen: {
          where: {
            OR: [{ isDeleted: false }, { isDeleted: null }],
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
          include: {
            taiKhoan: {
              select: {
                tenTaiKhoan: true,
                hoSoCaNhan: {
                  select: {
                    ho_ten: true,
                    anh: true,
                  },
                },
              },
            },
          },
        },
        binh_luan: {
          where: {
            isDeleted: false,
            idBinhLuanCha: null,
            idChuong: null,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 15,
          include: {
            taiKhoan: {
              select: {
                tenTaiKhoan: true,
                hoSoCaNhan: {
                  select: {
                    ho_ten: true,
                    anh: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            theoDoiTruyen: true,
            danhGiaTruyen: { where: { OR: [{ isDeleted: false }, { isDeleted: null }] } },
            chuong: { where: { isDeleted: false } },
            binh_luan: true,
          },
        },
      },
    });

    if (!story) return null;

    const chapterWhere = { idTruyen: story.idTruyen, isDeleted: false };
    const [firstChapter, latestChapters, owner] = await Promise.all([
      prisma.chuong.findFirst({
        where: chapterWhere,
        orderBy: { chuongSo: "asc" },
        select: { slug: true },
      }),
      prisma.chuong.findMany({
        where: chapterWhere,
        orderBy: { chuongSo: "desc" },
        take: 6,
        select: {
          idChuong: true,
          chuongSo: true,
          tieuDeChuong: true,
          slug: true,
          isFree: true,
          giaXu: true,
          luotXem: true,
          updatedAt: true,
        },
      }),
      getStoryOwner(prisma, story.idTruyen),
    ]);

    return { ...story, binh_luan: story.binh_luan.map(comment => ({ ...comment,
      isStoryAuthor: owner !== null && comment.idTaiKhoan === owner.ownerId,
    })), chuong: latestChapters, firstChapter };
  } catch (error) {
    console.error(`[StoryDetail Query] Error fetching story with slug "${slug}":`, error);
    throw error;
  }
});

interface StoryDetailPageData {
  metadata: { tenTruyen: string; moTa: string | null; anhBia: string | null };
  story: StoryDetailData;
}

class StoryNotFoundError extends Error {}

// Cache the public DTO, after Date/Decimal formatting, and deduplicate SEO/page reads.
export const getStoryDetailPageBySlug = cache(async (slug: string): Promise<StoryDetailPageData | null> => {
  try {
    return await unstable_cache(async (): Promise<StoryDetailPageData> => {
      const raw = await getStoryDetailBySlug(slug);
      const story = mapStoryDetail(raw);
      if (!raw || !story) throw new StoryNotFoundError();
      return { metadata: { tenTruyen: raw.tenTruyen, moTa: raw.moTa, anhBia: raw.anhBia }, story };
    }, ["public-story-detail-v1", slug], {
      revalidate: 60,
      tags: [publicCacheTags.storyDetails, publicStoryTag(slug)],
    })();
  } catch (error) {
    // Missing stories and database failures must never become shared cached results.
    if (error instanceof StoryNotFoundError) return null;
    throw error;
  }
});
