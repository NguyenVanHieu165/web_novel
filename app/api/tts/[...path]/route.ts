import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateUser } from "@/lib/server/auth-session";
import { chunkChapterText } from "@/lib/server/tts/chunker";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const voiceSchema = z.enum(["vi-VN-HoaiMyNeural", "vi-VN-NamMinhNeural"]).default("vi-VN-HoaiMyNeural");
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const fail = (status: number, message: string) => NextResponse.json({ message }, { status, headers });
  if (path[0] !== "chapters" || !/^[1-9]\d*$/u.test(path[1] ?? "") || Number(path[1]) > 2147483647 || !((path.length === 3 && path[2] === "meta") || (path.length === 4 && path[2] === "chunk" && /^(0|[1-9]\d{0,5})$/u.test(path[3])))) return fail(404, "Đường dẫn không hợp lệ.");
  const voice = voiceSchema.safeParse(request.nextUrl.searchParams.get("voice") ?? undefined);
  if (!voice.success) return fail(400, "Giọng đọc không hợp lệ.");
  try {
    const chapterId = Number(path[1]);
    const chapter = await prisma.chuong.findFirst({ where: { idChuong: chapterId, OR: [{ isDeleted: false }, { isDeleted: null }], truyen: { trang_thai: { not: "sap_ra_mat" }, OR: [{ isDeleted: false }, { isDeleted: null }] } }, select: { tieuDeChuong: true, isFree: true, giaXu: true, noiDungChuong: { select: { noiDung: true } } } });
    if (!chapter) return fail(404, "Không tìm thấy chương.");
    if (chapter.isFree === false || (chapter.giaXu ?? 0) > 0) {
      const auth = await authenticateUser(request.cookies.get("token")?.value ?? (request.headers.get("authorization")?.startsWith("Bearer ") ? request.headers.get("authorization")!.slice(7) : undefined));
      if (!auth.authorized) return fail(401, "Vui lòng đăng nhập để nghe chương VIP.");
      const purchased = await prisma.chuongDaMua.findUnique({ where: { idTaiKhoan_idChuong: { idTaiKhoan: auth.user.idTaiKhoan, idChuong: chapterId } }, select: { idChuong: true } });
      if (!purchased && !auth.user.roles.includes("admin")) return fail(403, "Bạn cần mở khóa chương trước khi nghe.");
    }
    const chunks = chunkChapterText(chapter.noiDungChuong?.noiDung ?? "");
    if (!chunks.length) return fail(404, "Không tìm thấy nội dung.");
    if (path[2] === "meta") return NextResponse.json({ chapterId, title: chapter.tieuDeChuong, totalChunks: chunks.length, voice: voice.data }, { headers });
    const index = Number(path[3]);
    if (index >= chunks.length) return fail(404, "Không tìm thấy đoạn audio.");
    const base = process.env.TTS_WORKER_URL?.replace(/\/+$/u, "");
    const secret = process.env.TTS_WORKER_SECRET;
    if (!base || !secret) return fail(503, "Máy chủ audio chưa được cấu hình.");
    const fingerprint = createHash("sha256").update(JSON.stringify(chunks)).digest("hex");
    const cacheKey = createHash("sha256").update(JSON.stringify([chapterId, fingerprint, voice.data, index])).digest("hex");
    const upstream = await fetch(`${base}/synthesize`, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ cacheKey, text: chunks[index], voice: voice.data }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(50000) });
    if (!upstream.ok || !upstream.headers.get("content-type")?.startsWith("audio/mpeg")) return fail(503, "Chưa thể tạo audio.");
    return new NextResponse(upstream.body, { headers: { ...headers, "Content-Type": "audio/mpeg", "X-TTS-Cache": upstream.headers.get("X-TTS-Cache") ?? "UNKNOWN" } });
  } catch { return fail(503, "Máy chủ audio tạm thời không phản hồi."); }
}
