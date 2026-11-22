import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/server/auth-session";

const idSchema = z.union([z.number().int().positive().max(2_147_483_647), z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(2_147_483_647))]);
const querySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const readSchema = z.union([
  z.strictObject({ all: z.literal(true) }),
  z.strictObject({ id: idSchema, isRead: z.boolean().default(true) }),
]);
const deleteSchema = z.union([
  z.strictObject({ all: z.literal("true") }),
  z.strictObject({ id: idSchema }),
]);
const privateHeaders = { "Cache-Control": "private, no-store" };
const unreadWhere = { OR: [{ daDoc: false }, { daDoc: null }] };
const invalid = () => NextResponse.json({ success: false, message: "Yêu cầu thông báo không hợp lệ" }, { status: 400 });
function crossOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  return req.headers.get("sec-fetch-site") === "cross-site" || (origin !== null && origin !== req.nextUrl.origin);
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const params = req.nextUrl.searchParams;
  const query = querySchema.safeParse(Object.fromEntries(params));
  if (!query.success || [...params.keys()].some((key) => params.getAll(key).length > 1)) return invalid();
  const { page, limit } = query.data;
  const where = { idTaiKhoan: auth.user.idTaiKhoan };
  try {
    const [data, total, unreadCount] = await Promise.all([
      prisma.thongBao.findMany({ where, orderBy: [{ createdAt: "desc" }, { idThongBao: "desc" }], skip: (page - 1) * limit, take: limit,
        select: { idThongBao: true, tieu_de: true, noiDung: true, daDoc: true, createdAt: true } }),
      prisma.thongBao.count({ where }),
      prisma.thongBao.count({ where: { ...where, ...unreadWhere } }),
    ]);
    return NextResponse.json({ success: true, data, unreadCount, meta: { page, limit, total, totalPage: Math.max(1, Math.ceil(total / limit)) } }, { headers: privateHeaders });
  } catch (error) {
    console.error("GET Notifications Error:", error);
    return NextResponse.json({ success: false, message: "Không thể tải thông báo" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (crossOrigin(req)) return NextResponse.json({ success: false }, { status: 403 });
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const parsed = readSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid();
  const where = { idTaiKhoan: auth.user.idTaiKhoan, ...("id" in parsed.data ? { idThongBao: parsed.data.id } : {}) };
  try {
    const updated = await prisma.thongBao.updateMany({ where, data: { daDoc: "isRead" in parsed.data ? parsed.data.isRead : true } });
    if ("id" in parsed.data && updated.count === 0) {
      const existing = await prisma.thongBao.findFirst({ where, select: { idThongBao: true } });
      if (!existing) return NextResponse.json({ success: false, message: "Không tìm thấy thông báo" }, { status: 404 });
    }
    const unreadCount = await prisma.thongBao.count({ where: { idTaiKhoan: auth.user.idTaiKhoan, ...unreadWhere } });
    return NextResponse.json({ success: true, unreadCount }, { headers: privateHeaders });
  } catch (error) {
    console.error("PUT Notifications Error:", error);
    return NextResponse.json({ success: false, message: "Không thể cập nhật thông báo" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (crossOrigin(req)) return NextResponse.json({ success: false }, { status: 403 });
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const params = req.nextUrl.searchParams;
  const parsed = deleteSchema.safeParse(Object.fromEntries(params));
  if (!parsed.success || [...params.keys()].some((key) => params.getAll(key).length > 1)) return invalid();
  try {
    const deleted = await prisma.thongBao.deleteMany({ where: { idTaiKhoan: auth.user.idTaiKhoan, ...("id" in parsed.data ? { idThongBao: parsed.data.id } : {}) } });
    if ("id" in parsed.data && deleted.count === 0) return NextResponse.json({ success: false, message: "Không tìm thấy thông báo" }, { status: 404 });
    return NextResponse.json({ success: true }, { headers: privateHeaders });
  } catch (error) {
    console.error("DELETE Notifications Error:", error);
    return NextResponse.json({ success: false, message: "Không thể xóa thông báo" }, { status: 500 });
  }
}
