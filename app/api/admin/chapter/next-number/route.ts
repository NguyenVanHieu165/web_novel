import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/server/auth-session";
import { nextWritingChapterNumber } from "@/lib/server/chapter-writing";
import { writingErrorResponse } from "@/lib/server/chapter-document-http";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  try {
    const id = z.coerce.number().int().positive().parse(request.nextUrl.searchParams.get("storyId"));
    return NextResponse.json({ success: true, data: { nextNumber: await nextWritingChapterNumber(prisma, auth.user, id, "admin") } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return writingErrorResponse(error); }
}
