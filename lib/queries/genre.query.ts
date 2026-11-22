import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { publicCacheTags } from "@/lib/server/public-cache";

export type GenreItem = {
  idTheLoai: number;
  tenTheLoai: string;
  slug: string;
  moTa: string | null;
  storyCount: number;
};

export const getAllGenresWithCount = cache(unstable_cache(async (): Promise<GenreItem[]> => {
  const genres = await prisma.theLoai.findMany({
    orderBy: {
      tenTheLoai: "asc",
    },
    select: {
      idTheLoai: true,
      tenTheLoai: true,
      moTa: true,
      _count: {
        select: {
          truyenTheLoai: {
            where: {
              truyen: {
                isDeleted: false,
              },
            },
          },
        },
      },
    },
  });

  return genres.map((g) => ({
    idTheLoai: g.idTheLoai,
    tenTheLoai: g.tenTheLoai,
    slug: slugify(g.tenTheLoai),
    moTa: g.moTa,
    storyCount: g._count.truyenTheLoai,
  }));
}, ["public-genres-with-count-v1"], { revalidate: 300, tags: [publicCacheTags.genres] }));

// The existing schema has no stored genre slug. Read only its small identity catalog,
// shared between requests; resolving metadata must not count every story in every genre.
const getGenreCatalog = cache(unstable_cache(async () => {
  const genres = await prisma.theLoai.findMany({
    select: { idTheLoai: true, tenTheLoai: true, moTa: true },
    orderBy: { idTheLoai: "asc" },
  });
  return genres.map((genre) => ({ ...genre, slug: slugify(genre.tenTheLoai) }));
}, ["public-genre-catalog-v1"], { revalidate: 300, tags: [publicCacheTags.genres] }));

export const getGenreBySlug = cache(async (slug: string): Promise<Omit<GenreItem, "storyCount"> | null> => {
  const all = await getGenreCatalog();
  const normalizedSlug = slug.trim().toLowerCase();
  const found = all.find(
    (g) => g.slug === normalizedSlug || g.idTheLoai.toString() === normalizedSlug
  );

  return found ?? null;
});
