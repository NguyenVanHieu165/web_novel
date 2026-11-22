import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/server/auth-session";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  try {
    // Small metadata lookup for searchable story selectors. No chapter relations/content.
    const data = await prisma.truyen.findMany({ where: { OR: [{ isDeleted: false }, { isDeleted: null }] }, select: { idTruyen: true, tenTruyen: true }, orderBy: { tenTruyen: "asc" } });
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { console.error("CHAPTER STORY OPTIONS", error); return NextResponse.json({ success: false, message: "Không thể tải danh sách truyện" }, { status: 500 }); }
}
