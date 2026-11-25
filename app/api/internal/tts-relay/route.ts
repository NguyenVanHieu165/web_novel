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
  let detail = "Unknown synthesis failure";
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (request.signal.aborted) break;
    const tts = new MsEdgeTTS({ connectionTimeoutMs: 10000, synthesisTimeoutMs: 12000 });
    let expired = false;
    let rejectAttempt!: (error: Error) => void;
    const deadline = new Promise<never>((_resolve, reject) => { rejectAttempt = reject; });
    const stop = (message: string) => {
      expired = true;
      rejectAttempt(new Error(message));
      tts.close();
    };
    const timeout = setTimeout(() => stop("Edge synthesis deadline exceeded"), 12000);
    const abort = () => stop("Request aborted");
    request.signal.addEventListener("abort", abort, { once: true });
    try {
      if (request.signal.aborted) throw new Error("Request aborted");
      const synthesize = async () => {
        await tts.setMetadata(input.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        if (expired) throw new Error("Attempt expired");
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
        return new Uint8Array(Buffer.concat(parts));
      };
      const audio = await Promise.race([synthesize(), deadline]);
      return new NextResponse(audio, { headers: { ...headers, "Content-Type": "audio/mpeg", "Content-Length": String(audio.length) } });
    } catch (error) {
      // Error names expose no upstream URL, token, stack or chapter text.
      detail = expired ? (request.signal.aborted ? "Request aborted" : "Edge synthesis deadline exceeded") : error instanceof Error ? error.name.slice(0, 80) : "Unknown synthesis failure";
      console.error("[tts-relay] synthesis attempt failed", { attempt, detail });
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener("abort", abort);
      tts.close();
    }
    if (attempt < 3 && !request.signal.aborted) await new Promise(resolve => setTimeout(resolve, 250));
  }
  return NextResponse.json({ error: "TTS_RELAY_FAILED", detail }, { status: 502, headers });
}
