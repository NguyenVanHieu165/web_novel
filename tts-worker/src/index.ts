interface Env { TTS_BUCKET: R2Bucket; TTS_WORKER_SECRET: string; VERCEL_TTS_RELAY_URL: string }
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
      const relayUrl = new URL(env.VERCEL_TTS_RELAY_URL);
      if (relayUrl.protocol !== "https:") throw new Error("Relay URL must use HTTPS");
      const upstream = await fetch(relayUrl, {
        method: "POST", redirect: "error",
        headers: { Authorization: `Bearer ${env.TTS_WORKER_SECRET}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: body.text, voice: body.voice }),
        signal: AbortSignal.timeout(45000),
      });
      if (!upstream.ok) throw new Error(`TTS relay HTTP ${upstream.status}`);
      if (upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "audio/mpeg") throw new Error("TTS relay invalid content type");
      // Buffer bounded chunks before cache writes so partial/failed responses never enter R2.
      if (!upstream.body) throw new Error("TTS relay empty audio");
      const reader = upstream.body.getReader();
      const parts: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 4 * 1024 * 1024) { await reader.cancel(); throw new Error("TTS relay audio too large"); }
          parts.push(value);
        }
      } finally { reader.releaseLock(); }
      if (!size) throw new Error("TTS relay empty audio");
      const audio = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) { audio.set(part, offset); offset += part.length; }
      ctx.waitUntil(env.TTS_BUCKET.put(key, audio, { httpMetadata: { contentType: "audio/mpeg" } }).catch(() => console.error("TTS R2 write failed")));
      return new Response(audio, { headers: { ...headers, "X-TTS-Cache": "MISS" } });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown synthesis failure";
      console.error("TTS synthesis failed", detail);
      return Response.json({ error: "TTS_SYNTHESIS_FAILED", detail }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
  },
};

export default worker;
