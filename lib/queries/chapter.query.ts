import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { cookies } from "next/headers";
import { cache } from "react";

export const getChapterDetail = cache(async (storySlug: string, chapterSlug: string) => {
  try {
    // 1. Tìm thông tin truyện
    const story = await prisma.truyen.findFirst({
      where: {
        slug: storySlug,
        isDeleted: false,
      },
      select: {
        idTruyen: true,
        tenTruyen: true,
        slug: true,
        anhBia: true,
      },
    });

    if (!story) return null;

    // 2. Tìm thông tin chương hiện tại kèm nội dung
    const currentChapter = await prisma.chuong.findFirst({
      where: {
        idTruyen: story.idTruyen,
        slug: chapterSlug,
        isDeleted: false,
      },
      select: {
        idChuong: true,
        idTruyen: true,
        chuongSo: true,
        tieuDeChuong: true,
        slug: true,
        isFree: true,
        giaXu: true,
        createdAt: true,
      },
    });

    if (!currentChapter) return null;

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    const session = token ? await verifyToken(token) : null;
    let account: { idTaiKhoan: number; isAdmin: boolean; balance: number } | null = null;

    if (session?.idTaiKhoan) {
      const authenticatedAccount = await prisma.taiKhoan.findFirst({
        where: {
          idTaiKhoan: session.idTaiKhoan,
          trangThai: "active",
          OR: [{ isDeleted: false }, { isDeleted: null }],
        },
        select: {
          idTaiKhoan: true,
          viTien: { select: { soDuXu: true } },
          vaiTroNguoiDung: {
            select: { vaiTro: { select: { tenVaiTro: true } } },
          },
        },
      });

      if (authenticatedAccount) {
        account = {
          idTaiKhoan: authenticatedAccount.idTaiKhoan,
          balance: authenticatedAccount.viTien?.soDuXu ?? 0,
          isAdmin: authenticatedAccount.vaiTroNguoiDung.some(
            ({ vaiTro }) => vaiTro.tenVaiTro === "admin",
          ),
        };
      }
    }

    const isFree = currentChapter.isFree ?? true;
    const hasPurchased = account
      ? Boolean(
          await prisma.chuongDaMua.findUnique({
            where: {
              idTaiKhoan_idChuong: {
                idTaiKhoan: account.idTaiKhoan,
                idChuong: currentChapter.idChuong,
              },
            },
            select: { idChuong: true },
          }),
        )
      : false;
    const canRead = isFree || Boolean(account?.isAdmin) || hasPurchased;
    // 4. Tìm chương trước & chương sau
    const [content, prevChapter, nextChapter] = await Promise.all([
      canRead
        ? prisma.noiDungChuong.findUnique({
            where: { idChuong: currentChapter.idChuong },
            select: { noiDung: true },
          })
        : null,
      // Chương trước: số chương nhỏ hơn gần nhất
      prisma.chuong.findFirst({
        where: {
          idTruyen: story.idTruyen,
          chuongSo: { lt: currentChapter.chuongSo },
          isDeleted: false,
        },
        orderBy: { chuongSo: "desc" },
        select: { slug: true, tieuDeChuong: true, chuongSo: true },
      }),

      // Chương sau: số chương lớn hơn gần nhất
      prisma.chuong.findFirst({
        where: {
          idTruyen: story.idTruyen,
          chuongSo: { gt: currentChapter.chuongSo },
          isDeleted: false,
        },
        orderBy: { chuongSo: "asc" },
        select: { slug: true, tieuDeChuong: true, chuongSo: true },
      }),

    ]);

    return {
      story,
      prevChapter,
      nextChapter,
      access: {
        canRead,
        requiresLogin: !account && !isFree,
        hasPurchased,
        balance: account?.balance ?? null,
      },
      currentChapter: {
        ...currentChapter,
        noiDungChuong: content,
      },
    };
  } catch (error) {
    console.error(
      `[Chapter Query] Error fetching chapter "${chapterSlug}" of story "${storySlug}":`,
      error
    );
    throw error;
  }
});
