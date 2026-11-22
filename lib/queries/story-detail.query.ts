import { prisma } from "@/lib/prisma";
import { cache } from "react";
import { getStoryOwner } from "@/lib/server/studio-ownership";

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
