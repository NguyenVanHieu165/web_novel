import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePublicStoryDetails } from "@/lib/server/public-cache";
import { requireUser } from "@/lib/server/auth-session";
import { getStoryOwner } from "@/lib/server/studio-ownership";
const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
export async function DELETE(request: NextRequest, { params }: { params: Promise<unknown> }) {
  const auth = await requireUser(request); if (!auth.authorized) return auth.response;
  const parsed = paramsSchema.safeParse(await params); if (!parsed.success) return NextResponse.json({ success: false, message: "Bình luận không hợp lệ." }, { status: 400 });
  const comment = await prisma.binhLuan.findFirst({ where: { idBinhLuan: parsed.data.id, OR: [{ isDeleted: false }, { isDeleted: null }] }, select: { idBinhLuan: true, idTaiKhoan: true, idTRUYEN: true, truyen: { select: { slug: true } } } });
  if (!comment) return NextResponse.json({ success: false, message: "Không tìm thấy bình luận." }, { status: 404 });
  const owner = await getStoryOwner(prisma, comment.idTRUYEN);
  if (comment.idTaiKhoan !== auth.user.idTaiKhoan && owner?.ownerId !== auth.user.idTaiKhoan && !auth.user.roles.includes("admin")) return NextResponse.json({ success: false, message: "Bạn không có quyền xóa bình luận này." }, { status: 403 });
  await prisma.binhLuan.update({ where: { idBinhLuan: comment.idBinhLuan }, data: { isDeleted: true } });
  revalidatePublicStoryDetails([comment.truyen.slug]);
  return NextResponse.json({ success: true });
}
