import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/auth-session";
import { AudioBusyError, getChapterAudio } from "@/lib/tts/edge-tts";
import { parseAudioRange } from "@/lib/tts/http-range";
import { voiceSchema } from "@/lib/tts/voices";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 240;
const inputSchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/u).transform(Number).pipe(z.number().int().positive().max(2_147_483_647)),
  voice: voiceSchema.default("female-warm"),
  stream: z.literal("1").optional(),
  v: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
});
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status, headers: privateHeaders });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = inputSchema.safeParse({
    ...(await params),
    voice: request.nextUrl.searchParams.get("voice") ?? undefined,
    stream: request.nextUrl.searchParams.get("stream") ?? undefined,
    v: request.nextUrl.searchParams.get("v") ?? undefined,
  });
  if (!parsed.success) return errorResponse("ID chương hoặc giọng đọc không hợp lệ.", 400);
  const { id, voice, stream, v } = parsed.data;
  try {
    const chapter = await prisma.chuong.findFirst({
      where: { idChuong: id, isDeleted: false, truyen: { isDeleted: false } },
      select: {
        idChuong: true, chuongSo: true, tieuDeChuong: true, isFree: true, giaXu: true,
        truyen: { select: { slug: true } },
      },
    });
    if (!chapter) return errorResponse("Không tìm thấy chương.", 404);
    if (chapter.isFree === false || (chapter.giaXu ?? 0) > 0) {
      const auth = await requireUser(request);
      if (!auth.authorized) return errorResponse("Bạn cần đăng nhập và mở khóa chương để nghe.", 403);
      if (!auth.user.roles.includes("admin")) {
        const purchase = await prisma.chuongDaMua.findUnique({
          where: { idTaiKhoan_idChuong: { idTaiKhoan: auth.user.idTaiKhoan, idChuong: id } },
          select: { idChuong: true },
        });
        if (!purchase) return errorResponse("Bạn cần mở khóa chương trước khi nghe.", 403);
      }
    }
    // Content and cache are accessed only after authorization, including Range requests.
    const content = await prisma.noiDungChuong.findUnique({
      where: { idChuong: id }, select: { noiDung: true },
    });
    if (!content?.noiDung?.trim()) return errorResponse("Nội dung chương đang được cập nhật.", 404);
    if (content.noiDung.length > 200_000) return errorResponse("Chương quá dài để tạo audio trong một lần.", 422);
    if (!stream) {
      const rate = await checkRateLimit(`audio:${requestIp(request)}`, 15, 60_000);
      if (!rate.allowed) return NextResponse.json({ success: false, message: "Thử lại sau ít phút." }, { status: 429, headers: { ...privateHeaders, "Retry-After": String(rate.retryAfter) } });
    }
    const result = await getChapterAudio({
      chapterId: id, chapterNumber: Number(chapter.chuongSo), title: chapter.tieuDeChuong,
      storySlug: chapter.truyen.slug, content: content.noiDung, voice,
    });
    if (!stream) {
      const audioUrl = "/api/chapters/" + id + "/audio?voice=" + voice + "&stream=1&v=" + result.fingerprint;
      return NextResponse.json({ audioUrl, cached: result.cached }, { headers: privateHeaders });
    }
    if (v && v !== result.fingerprint) return errorResponse("Chương đã thay đổi. Hãy tải lại audio.", 409);
    const range = parseAudioRange(request.headers.get("range"), result.bytes);
    if (!range) {
      return new NextResponse(null, { status: 416, headers: { ...privateHeaders, "Content-Range": "bytes */" + result.bytes } });
    }
    const headers: Record<string, string> = {
      ...privateHeaders, "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes",
      "Content-Length": String(range.end - range.start + 1),
      "Content-Disposition": 'inline; filename="chapter-' + id + "-" + voice + '.mp3"',
    };
    if (range.partial) headers["Content-Range"] = "bytes " + range.start + "-" + range.end + "/" + result.bytes;
    let body: ReadableStream<Uint8Array> | null = null;
    if (request.method !== "HEAD") {
      if (result.remoteUrl) {
        const upstream = await fetch(result.remoteUrl, {
          headers: range.partial ? { Range: `bytes=${range.start}-${range.end}` } : undefined,
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
        });
        if (!upstream.ok || !upstream.body || (range.partial && upstream.status !== 206)) {
          throw new Error("Cloudinary audio stream failed");
        }
        body = upstream.body;
      } else if (result.filePath) {
        body = Readable.toWeb(createReadStream(result.filePath, { start: range.start, end: range.end })) as ReadableStream<Uint8Array>;
      } else {
        throw new Error("Audio storage result is missing");
      }
    }
    return new NextResponse(body, { status: range.partial ? 206 : 200, headers });
  } catch (error) {
    if (error instanceof AudioBusyError) {
      const response = errorResponse("Máy chủ đang tạo audio khác. Hãy thử lại sau ít phút.", 503);
      response.headers.set("Retry-After", "30");
      return response;
    }
    console.error("Chapter audio failed", error instanceof Error ? error.name : "UNKNOWN");
    return errorResponse("Chưa thể tạo audio. Vui lòng thử lại hoặc dùng giọng đọc trình duyệt.", 503);
  }
}

export const HEAD = GET;
