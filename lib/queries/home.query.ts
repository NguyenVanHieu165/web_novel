import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

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

export async function getHomeData() {
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

  // Database failures must reach the error UI rather than masquerading as an empty catalog.
  return { featured: popular[0] ?? null, latest, updated, popular, rated, completed };
}
