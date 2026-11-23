import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePublicStoryDetails } from "@/lib/server/public-cache";
import { requireUser } from "@/lib/server/auth-session";
import { isSameOriginRequest } from "@/lib/server/same-origin";

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
export async function POST(request: NextRequest, { params }: { params: Promise<unknown> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ success: false, message: "Yêu cầu thích bình luận không hợp lệ." }, { status: 403 });
  const auth = await requireUser(request); if (!auth.authorized) return auth.response;
  const parsed = paramsSchema.safeParse(await params); if (!parsed.success) return NextResponse.json({ success: false, message: "Bình luận không hợp lệ." }, { status: 400 });
  try {
    const comment = await prisma.binhLuan.findFirst({ where: { idBinhLuan: parsed.data.id, OR: [{ isDeleted: false }, { isDeleted: null }] }, select: { idBinhLuan: true, truyen: { select: { slug: true } } } });
    if (!comment) return NextResponse.json({ success: false, message: "Không tìm thấy bình luận." }, { status: 404 });
    const existing = await prisma.likeBinhLuan.findUnique({ where: { idTaiKhoan_idBinhLuan: { idTaiKhoan: auth.user.idTaiKhoan, idBinhLuan: comment.idBinhLuan } }, select: { idLike: true } });
    const result = await prisma.$transaction(async tx => {
      if (existing) { await tx.likeBinhLuan.delete({ where: { idLike: existing.idLike } }); return tx.binhLuan.update({ where: { idBinhLuan: comment.idBinhLuan }, data: { likeCount: { decrement: 1 } }, select: { likeCount: true } }); }
      await tx.likeBinhLuan.create({ data: { idTaiKhoan: auth.user.idTaiKhoan, idBinhLuan: comment.idBinhLuan } });
      return tx.binhLuan.update({ where: { idBinhLuan: comment.idBinhLuan }, data: { likeCount: { increment: 1 } }, select: { likeCount: true } });
    });
    revalidatePublicStoryDetails([comment.truyen.slug]);
    return NextResponse.json({ success: true, isLiked: !existing, likeCount: result.likeCount ?? 0 });
  } catch { return NextResponse.json({ success: false, message: "Không thể cập nhật lượt thích." }, { status: 500 }); }
}
