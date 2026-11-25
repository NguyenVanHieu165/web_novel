import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const schema = z.object({ text: z.string().trim().min(1).max(1400), voice: z.enum(["vi-VN-HoaiMyNeural", "vi-VN-NamMinhNeural"]) }).strict();

export async function POST(request: NextRequest) {
  const secret = process.env.TTS_WORKER_SECRET;
  if (!secret) return NextResponse.json({ error: "Relay not configured" }, { status: 503, headers });
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (Number(request.headers.get("content-length")) > 16384) return NextResponse.json({ error: "Payload too large" }, { status: 413, headers });
  let input: z.infer<typeof schema>;
  try {
    const raw = await request.text();
    if (raw.length > 16384) return NextResponse.json({ error: "Payload too large" }, { status: 413, headers });
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400, headers });
    input = parsed.data;
  } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers }); }
  const tts = new MsEdgeTTS({ connectionTimeoutMs: 10000, synthesisTimeoutMs: 20000 });
  const timeout = setTimeout(() => tts.close(), 35000);
  const abort = () => tts.close();
  request.signal.addEventListener("abort", abort, { once: true });
  try {
    if (request.signal.aborted) throw new Error("Request aborted");
    await tts.setMetadata(input.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const escaped = input.text.replace(/[<>&"']/gu, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '\"': "&quot;", "'": "&apos;" })[char]!);
    const { audioStream } = tts.rawToStream(`<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="vi-VN"><voice name="${input.voice}">${escaped}</voice></speak>`);
    const parts: Buffer[] = [];
    let size = 0;
    for await (const part of audioStream) {
      const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part);
      size += bytes.length;
      if (size > 4 * 1024 * 1024) throw new Error("Audio too large");
      parts.push(bytes);
    }
    if (!size) throw new Error("Empty audio");
    return new NextResponse(new Uint8Array(Buffer.concat(parts)), { headers: { ...headers, "Content-Type": "audio/mpeg", "Content-Length": String(size) } });
  } catch (error) {
    console.error("[tts-relay] synthesis failed", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "TTS_RELAY_FAILED" }, { status: 502, headers });
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abort);
    tts.close();
  }
}
