import { generateSecMsGec, TOKEN } from "./sec-ms-gec";
interface Env { TTS_BUCKET: R2Bucket; TTS_WORKER_SECRET: string }
async function synthesize(text: string, voice: string): Promise<{ stream: ReadableStream<Uint8Array>; completed: Promise<Uint8Array> }> {
  const id = crypto.randomUUID().replaceAll("-", "");
  const url = new URL("https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1");
  url.search = new URLSearchParams({ TrustedClientToken: TOKEN, ConnectionId: id, "Sec-MS-GEC": await generateSecMsGec(), "Sec-MS-GEC-Version": "2-143.0.3650.96" }).toString();
  const response = await fetch(url, { headers: { Upgrade: "websocket", Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold" }, signal: AbortSignal.timeout(12000) });
  const ws = response.webSocket;
  if (!ws) throw new Error("Upgrade failed");
  ws.accept();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; }, cancel() { cancelled = true; } });
  const completed = new Promise<Uint8Array>((resolve, reject) => {
    const parts: Uint8Array[] = [];
    let size = 0, done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true; clearTimeout(timer); ws.close();
      if (error || !size) { const failure = error ?? new Error("Empty audio"); if (!cancelled) controller.error(failure); reject(failure); return; }
      const audio = new Uint8Array(size); let offset = 0;
      for (const part of parts) { audio.set(part, offset); offset += part.length; }
      if (!cancelled) controller.close();
      resolve(audio);
    };
    const timer = setTimeout(() => finish(new Error("Synthesis timeout")), 25000);
    ws.addEventListener("error", () => finish(new Error("WebSocket error")));
    ws.addEventListener("close", () => finish(new Error("Premature close")));
    ws.addEventListener("message", event => {
      if (done) return;
      if (typeof event.data === "string") { if (event.data.includes("Path:turn.end")) finish(); return; }
      const data = new Uint8Array(event.data);
      if (data.length < 2) { finish(new Error("Invalid frame")); return; }
      const offset = 2 + new DataView(data.buffer).getUint16(0);
      if (offset > data.length) { finish(new Error("Invalid header")); return; }
      if (!new TextDecoder().decode(data.slice(2, offset)).includes("Path:audio")) return;
      const part = data.slice(offset); size += part.length;
      if (size > 4 * 1024 * 1024) { finish(new Error("Audio too large")); return; }
      parts.push(part);
      if (!cancelled) controller.enqueue(part);
    });
    const stamp = new Date().toUTCString();
    try {
    ws.send(`X-Timestamp:${stamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false }, outputFormat: "audio-24khz-48kbitrate-mono-mp3" } } } })}`);
    const escaped = text.replace(/[<>&"']/gu, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
    ws.send(`X-RequestId:${id}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${stamp}\r\nPath:ssml\r\n\r\n<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="vi-VN"><voice name="${voice}">${escaped}</voice></speak>`);
    } catch { finish(new Error("WebSocket send failed")); }
  });
  return { stream, completed };
}
const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/health" && request.method === "GET") return new Response("OK");
    if (path !== "/synthesize") return new Response("Not found", { status: 404 });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    if (!env.TTS_WORKER_SECRET || request.headers.get("Authorization") !== `Bearer ${env.TTS_WORKER_SECRET}`) return new Response("Unauthorized", { status: 401 });
    if (Number(request.headers.get("content-length")) > 16384) return new Response("Too large", { status: 413 });
    let body: unknown;
    try { const raw = await request.text(); if (raw.length > 16384) return new Response("Too large", { status: 413 }); body = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
    if (!body || typeof body !== "object" || !("cacheKey" in body) || !("text" in body) || !("voice" in body) || typeof body.cacheKey !== "string" || !/^[a-f0-9]{64}$/u.test(body.cacheKey) || typeof body.text !== "string" || !body.text.trim() || body.text.length > 1400 || (body.voice !== "vi-VN-HoaiMyNeural" && body.voice !== "vi-VN-NamMinhNeural")) return new Response("Invalid input", { status: 400 });
    try {
      const key = `chunks/${body.cacheKey}.mp3`;
      const cached = await env.TTS_BUCKET.get(key);
      const headers = { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store" };
      if (cached) return new Response(cached.body, { headers: { ...headers, "X-TTS-Cache": "HIT-R2" } });
      const audio = await synthesize(body.text, body.voice);
      ctx.waitUntil(audio.completed.then(bytes => env.TTS_BUCKET.put(key, bytes, { httpMetadata: { contentType: "audio/mpeg" } })).catch(() => { console.error("TTS R2 write failed"); }));
      return new Response(audio.stream, { headers: { ...headers, "X-TTS-Cache": "MISS" } });
    } catch { return new Response("Synthesis unavailable", { status: 502 }); }
  },
};

export default worker;
