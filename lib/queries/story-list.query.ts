import { prisma } from "@/lib/prisma";
import type { Prisma } from "../../app/generated/prisma/client";
import { parseStoryQueryParams, type StoryQueryInput } from "@/schemas/story-query.schema";
import { mapStory } from "@/lib/mappers/story.mapper";
import type { StoryCardData } from "@/components/story/StoryCard";
import { getGenreBySlug } from "./genre.query";

export interface StoryListResult {
  items: StoryCardData[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function getStoryList(
  input: Partial<StoryQueryInput>
): Promise<StoryListResult> {
  const query = parseStoryQueryParams(input);
  let { page } = query;
  const { limit } = query;

  const where: Prisma.TruyenWhereInput = {
    isDeleted: false,
  };

  // Keyword search
  if (query.q) {
    const keyword = query.q;
    where.OR = [
      { tenTruyen: { contains: keyword } },
      { moTa: { contains: keyword } },
      { tag: { contains: keyword } },
      {
        truyen_tac_gia_dich: {
          some: {
            tac_gia_dich: {
              ten: { contains: keyword },
            },
          },
        },
      },
    ];
  }

  // Genre filter
  if (query.theLoai && query.theLoai !== "tat-ca") {
    const genre = await getGenreBySlug(query.theLoai);
    // An unknown/deleted genre is an empty result, never an unfiltered library.
    where.truyenTheLoai = { some: { idTheLoai: genre?.idTheLoai ?? -1 } };
  }

  // Status filter
  if (query.trangThai !== "tat_ca") {
    where.trang_thai = query.trangThai;
  }

  // Chapter count filter
  if (query.soChuong !== "all") {
    if (query.soChuong === "duoi-100") {
      where.soChuong = { lt: 100 };
    } else if (query.soChuong === "100-500") {
      where.soChuong = { gte: 100, lte: 500 };
    } else if (query.soChuong === "tren-500") {
      where.soChuong = { gt: 500 };
    }
  }

  // Sorting
  let orderBy: Prisma.TruyenOrderByWithRelationInput = { luotXem: "desc" };
  if (query.sapXep === "moiNhat") {
    orderBy = { createdAt: "desc" };
  } else if (query.sapXep === "capNhat") {
    orderBy = { updatedAt: "desc" };
  } else if (query.sapXep === "danhGia") {
    orderBy = { diemDanhGiaTrungBinh: "desc" };
  } else if (query.sapXep === "luotXem") {
    orderBy = { luotXem: "desc" };
  }

  const select = {
    idTruyen: true, tenTruyen: true, slug: true, anhBia: true,
    soChuong: true, luotXem: true, diemDanhGiaTrungBinh: true, trang_thai: true,
    truyenTheLoai: { select: { theLoai: { select: { tenTheLoai: true } } } },
  } satisfies Prisma.TruyenSelect;
  const stableOrder = [orderBy, { idTruyen: "desc" } satisfies Prisma.TruyenOrderByWithRelationInput];
  const total = await prisma.truyen.count({ where });
  const totalPages = Math.ceil(total / limit) || 1;
  page = Math.min(page, totalPages);
  const rawStories = await prisma.truyen.findMany({
    where,
    skip: (page - 1) * limit,
    take: limit,
    orderBy: stableOrder,
    select,
  });
  const items = rawStories.map((story) => mapStory(story));

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}
