import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** Same-origin bridge keeps the HttpOnly JWT cookie available on cross-platform audio requests. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if ((path.length !== 3 && path.length !== 4) || path[0] !== "chapters" || !/^[1-9]\d*$/u.test(path[1])) {
    return NextResponse.json({ message: "Đường dẫn TTS không hợp lệ." }, { status: 404, headers: privateHeaders });
  }
  // Explicitly construct the only supported server routes; never forward an arbitrary host/path.
  const route = path.length === 3 && path[2] === "meta"
    ? `/api/tts/chapters/${path[1]}/meta`
    : path.length === 4 && path[2] === "chunk" && /^(0|[1-9]\d{0,5})$/u.test(path[3])
      ? `/api/tts/chapters/${path[1]}/chunk/${path[3]}`
      : null;
  const base = process.env.SOCKET_SERVER_URL?.replace(/\/+$/u, "");
  if (!base || !route) return NextResponse.json({ message: "Máy chủ audio chưa được cấu hình." }, { status: route ? 503 : 404, headers: privateHeaders });
  try {
    const cookie = request.headers.get("cookie");
    const authorization = request.headers.get("authorization");
    const upstream = await fetch(`${base}${route}${request.nextUrl.search}`, {
      method: "GET",
      headers: { ...(cookie ? { cookie } : {}), ...(authorization ? { authorization } : {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
      redirect: "error",
    });
    const headers = new Headers(privateHeaders);
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);
    if (upstream.ok && contentType?.startsWith("audio/")) headers.set("Cache-Control", "private, max-age=1200");
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch {
    return NextResponse.json({ message: "Máy chủ audio tạm thời không phản hồi." }, { status: 503, headers: privateHeaders });
  }
}
