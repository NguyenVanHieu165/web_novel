import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth-session";
import { adminChaptersQuerySchema } from "@/schemas/admin-chapters.schema";
import { listAdminChapters } from "@/lib/server/admin-chapters";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const params = req.nextUrl.searchParams;
  const parsed = adminChaptersQuerySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success || [...params.keys()].some((key) => params.getAll(key).length > 1)) return NextResponse.json({ success: false, message: "Bộ lọc chương không hợp lệ" }, { status: 400 });
  try { return NextResponse.json({ success: true, data: await listAdminChapters(parsed.data) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { console.error("LIST ADMIN CHAPTERS", error); return NextResponse.json({ success: false, message: "Không thể tải chương" }, { status: 500 }); }
}
