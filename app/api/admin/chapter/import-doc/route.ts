import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidatePublicStories } from "@/lib/server/public-cache";
import { requireAdmin } from "@/lib/server/auth-session";
import { ensureWritingDatabase, importWritingChapters } from "@/lib/server/chapter-writing";
import { previewChapterDocument, readWritingJson, writingOriginError, writingErrorResponse } from "@/lib/server/chapter-document-http";

export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const originError = writingOriginError(request);
  if (originError) return originError;
  try {
    await ensureWritingDatabase(prisma);
    const isPreview = request.headers.get("content-type")?.startsWith("multipart/form-data");
    const data = isPreview ? await previewChapterDocument(request) :
      await importWritingChapters(prisma, auth.user, await readWritingJson(request), "admin");
    if (!isPreview) revalidatePublicStories();
    return NextResponse.json({ success: true, data });
  } catch (error) { return writingErrorResponse(error); }
}
