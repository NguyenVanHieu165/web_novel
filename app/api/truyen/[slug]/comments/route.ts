import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateUser, requireUser } from "@/lib/server/auth-session";
import { getStoryOwner } from "@/lib/server/studio-ownership";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";

const paramsSchema = z.object({ slug: z.string().trim().min(1).max(300) });
const querySchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(15), replyTo: z.coerce.number().int().positive().optional(), chapterId: z.coerce.number().int().positive().optional() });
const bodySchema = z.object({ noiDung: z.string().transform(value => value.normalize("NFC").trim()).pipe(z.string().min(1).max(1000)), replyTo: z.number().int().positive().optional(), chapterId: z.number().int().positive().optional() }).strict();
const active = { OR: [{ isDeleted: false }, { isDeleted: null }] };
type CommentRecord = { idBinhLuan: number; idTaiKhoan: number; idBinhLuanCha: number | null; noiDung: string; likeCount: number | null; createdAt: Date | null; chuong: { chuongSo: { toNumber(): number } } | null; taiKhoan: { tenTaiKhoan: string; hoSoCaNhan: { ho_ten: string | null; anh: string | null } | null; vaiTroNguoiDung: Array<{ vaiTro: { tenVaiTro: string } }> } };
const select = { idBinhLuan: true, idTaiKhoan: true, idBinhLuanCha: true, noiDung: true, likeCount: true, createdAt: true, chuong: { select: { chuongSo: true } }, taiKhoan: { select: { tenTaiKhoan: true, hoSoCaNhan: { select: { ho_ten: true, anh: true } }, vaiTroNguoiDung: { select: { vaiTro: { select: { tenVaiTro: true } } } } } } };
type Context = { params: Promise<{ slug: string }> };

async function storyFor(slug: string) { return prisma.truyen.findFirst({ where: { slug, isDeleted: false }, select: { idTruyen: true } }); }
function map(comment: CommentRecord, ownerId: number | undefined, liked: Set<number>, currentId?: number) {
  const isAdmin = comment.taiKhoan.vaiTroNguoiDung.some((role: { vaiTro: { tenVaiTro: string } }) => role.vaiTro.tenVaiTro === "admin");
  return { idBinhLuan: comment.idBinhLuan, noiDung: comment.noiDung, likeCount: comment.likeCount ?? 0, createdAt: comment.createdAt?.toLocaleDateString("vi-VN") ?? "", authorName: comment.taiKhoan.hoSoCaNhan?.ho_ten || comment.taiKhoan.tenTaiKhoan, authorAvatar: comment.taiKhoan.hoSoCaNhan?.anh ?? null, isAuthor: comment.idTaiKhoan === ownerId, isStoryAuthor: comment.idTaiKhoan === ownerId, isAdmin, isLiked: liked.has(comment.idBinhLuan), isOwn: comment.idTaiKhoan === currentId, replyTo: comment.idBinhLuanCha, chapterNumber: comment.chuong?.chuongSo.toNumber() ?? null };
}

export async function GET(request: NextRequest, { params }: Context) {
  const parsedParams = paramsSchema.safeParse(await params), query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsedParams.success || !query.success) return NextResponse.json({ success: false, message: "Tham số bình luận không hợp lệ." }, { status: 400 });
  try {
    const story = await storyFor(parsedParams.data.slug); if (!story) return NextResponse.json({ success: false, message: "Không tìm thấy truyện." }, { status: 404 });
    const { page, limit, replyTo, chapterId } = query.data;
    if (chapterId && !await prisma.chuong.findFirst({ where: { idChuong: chapterId, idTruyen: story.idTruyen, isDeleted: false }, select: { idChuong: true } })) return NextResponse.json({ success: false, message: "Không tìm thấy chương." }, { status: 404 });
    const where = { idTRUYEN: story.idTruyen, ...(chapterId ? { idChuong: chapterId } : {}), idBinhLuanCha: replyTo ?? null, ...active };
    const auth = await authenticateUser(request.cookies.get("token")?.value);
    const [items, total, owner] = await Promise.all([prisma.binhLuan.findMany({ where, select, orderBy: [{ createdAt: "desc" }, { idBinhLuan: "desc" }], skip: (page - 1) * limit, take: limit }), prisma.binhLuan.count({ where }), getStoryOwner(prisma, story.idTruyen)]);
    const likes = auth.authorized && items.length ? await prisma.likeBinhLuan.findMany({ where: { idTaiKhoan: auth.user.idTaiKhoan, idBinhLuan: { in: items.map(item => item.idBinhLuan) } }, select: { idBinhLuan: true } }) : [];
    const liked = new Set(likes.map(item => item.idBinhLuan));
    return NextResponse.json({ success: true, data: items.map(item => map(item, owner?.ownerId, liked, auth.authorized ? auth.user.idTaiKhoan : undefined)), meta: { page, limit, total, totalPage: Math.max(1, Math.ceil(total / limit)) } });
  } catch { return NextResponse.json({ success: false, message: "Không thể tải bình luận." }, { status: 500 }); }
}

export async function POST(request: NextRequest, { params }: Context) {
  const auth = await requireUser(request); if (!auth.authorized) return auth.response;
  const rate = checkRateLimit(`comment:${auth.user.idTaiKhoan}:${requestIp(request)}`, 8, 60_000); if (!rate.allowed) return NextResponse.json({ success: false, message: "Bạn gửi bình luận quá nhanh." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const parsedParams = paramsSchema.safeParse(await params), body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedParams.success || !body.success) return NextResponse.json({ success: false, message: "Bình luận cần có nội dung từ 1 đến 1.000 ký tự." }, { status: 400 });
  try {
    const story = await storyFor(parsedParams.data.slug); if (!story) return NextResponse.json({ success: false, message: "Không tìm thấy truyện." }, { status: 404 });
    const { chapterId, replyTo, noiDung } = body.data;
    if (chapterId && !await prisma.chuong.findFirst({ where: { idChuong: chapterId, idTruyen: story.idTruyen, isDeleted: false }, select: { idChuong: true } })) return NextResponse.json({ success: false, message: "Không tìm thấy chương." }, { status: 404 });
    if (replyTo && !await prisma.binhLuan.findFirst({ where: { idBinhLuan: replyTo, idTRUYEN: story.idTruyen, ...(chapterId ? { idChuong: chapterId } : {}), idBinhLuanCha: null, ...active }, select: { idBinhLuan: true } })) return NextResponse.json({ success: false, message: "Không tìm thấy bình luận gốc." }, { status: 404 });
    const [owner, item] = await Promise.all([getStoryOwner(prisma, story.idTruyen), prisma.binhLuan.create({ data: { idTaiKhoan: auth.user.idTaiKhoan, idTRUYEN: story.idTruyen, idChuong: chapterId ?? null, idBinhLuanCha: replyTo ?? null, noiDung }, select })]);
    return NextResponse.json({ success: true, data: map(item, owner?.ownerId, new Set(), auth.user.idTaiKhoan) }, { status: 201 });
  } catch { return NextResponse.json({ success: false, message: "Không thể đăng bình luận." }, { status: 500 }); }
}
