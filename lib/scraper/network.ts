import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { networkErrorCode } from "./errors";
import { ImportSourceError, SourceBlockedError, SourceLockedError, SourceRateLimitError } from "./types";

export function isPublicAddress(address: string) {
  try { return ipaddr.process(address).range() === "unicast"; } catch { return false; }
}
export function selectPublicAddress(addresses: Array<{ address: string; family: number }>) {
  if (!addresses.length || addresses.some(row => !isPublicAddress(row.address))) throw new ImportSourceError("Không cho phép truy cập IP nội bộ hoặc IP dành riêng.");
  // Keep DNS pinning while avoiding broken IPv6 connectivity on local Windows hosts.
  return (addresses.find(row => row.family === 4) ?? addresses[0]).address;
}
export async function publicTarget(raw: string, signal?: AbortSignal) {
  const url = new URL(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
      (url.port && !["80", "443"].includes(url.port)) || !hostname.includes(".") && !isIP(hostname) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(hostname)) throw new ImportSourceError("URL nguồn không hợp lệ hoặc thuộc mạng nội bộ.");
  const dnsSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000);
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
    const abort = () => reject(dnsSignal.reason); dnsSignal.addEventListener("abort", abort, { once: true });
    lookup(hostname, { all: true }).then(resolve, reject).finally(() => dnsSignal.removeEventListener("abort", abort));
    if (dnsSignal.aborted) abort();
  });
  return { url, address: selectPublicAddress(addresses), hostname };
}
export const pause = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal.throwIfAborted();
  const done = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); resolve(); };
  const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
  const timer = setTimeout(done, ms); signal.addEventListener("abort", abort, { once: true });
});

/** Pin the validated address on the socket. Each redirect is independently checked. */
export async function safeRequest(raw: string, signal: AbortSignal, body?: string, redirects = 0): Promise<{ bytes: Buffer; type: string; url: string }> {
  signal.throwIfAborted();
  if (redirects > 4) throw new ImportSourceError("Nguồn chuyển hướng quá nhiều lần.");
  const { url, address, hostname } = await publicTarget(raw, signal);
  signal.throwIfAborted();
  const response = await new Promise<{ status: number; headers: http.IncomingHttpHeaders; bytes: Buffer }>((resolve, reject) => {
    const controller = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
    const request = (url.protocol === "https:" ? https : http).request({
      protocol: url.protocol, hostname: address, servername: hostname, port: url.port || undefined,
      path: url.pathname + url.search, method: body ? "POST" : "GET", signal: controller,
      headers: { Host: url.host, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36", Accept: "text/html,application/json,image/*", "Accept-Encoding": "identity", ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}) },
    }, res => {
      const chunks: Buffer[] = []; let size = 0;
      res.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 16 * 1024 * 1024) request.destroy(new ImportSourceError("Phản hồi nguồn vượt 16 MB.")); else chunks.push(chunk); });
      res.on("error", reject);
      res.on("end", () => resolve({ status: res.statusCode ?? 500, headers: res.headers, bytes: Buffer.concat(chunks) }));
    });
    request.on("error", reject); request.end(body);
  });
  if (response.status >= 300 && response.status < 400 && response.headers.location) {
    const next = new URL(response.headers.location, url);
    if (/banned|security-check|captcha|challenge|bi-khoa/i.test(next.pathname)) throw new SourceBlockedError();
    if (/login|dang-nhap|pricing/i.test(next.pathname)) throw new SourceLockedError();
    return safeRequest(next.href, signal, undefined, redirects + 1);
  }
  if ([401, 402].includes(response.status)) throw new SourceLockedError();
  if (response.status === 403) throw new SourceBlockedError();
  if (response.status === 429 || response.status === 503) {
    const seconds = response.headers["retry-after"];
    let bodySeconds: number | undefined;
    try { const data: unknown = JSON.parse(response.bytes.toString());
      if (data && typeof data === "object" && "details" in data && data.details && typeof data.details === "object" && "retryAfter" in data.details && typeof data.details.retryAfter === "number") bodySeconds = data.details.retryAfter;
    } catch { /* Retry-After header remains authoritative for non-JSON error bodies. */ }
    throw new SourceRateLimitError(response.status, typeof seconds === "string" ? seconds : undefined, bodySeconds);
  }
  if (response.status < 200 || response.status >= 300) throw new ImportSourceError(`Nguồn trả HTTP ${response.status}. Kiểm tra URL truyện hoặc thử lại sau.`, `HTTP_${response.status}`);
  const encoding = response.headers["content-encoding"];
  const decompress = encoding === "gzip" ? gunzipSync : encoding === "br" ? brotliDecompressSync : encoding === "deflate" ? inflateSync : null;
  if (decompress) {
    try { response.bytes = decompress(response.bytes, { maxOutputLength: 16 * 1024 * 1024 }); }
    catch { throw new ImportSourceError("Không giải mã được phản hồi nén của nguồn hoặc dữ liệu vượt 16 MB.", "SOURCE_ENCODING_FAILED"); }
  }
  else if (encoding && encoding !== "identity") throw new ImportSourceError("Nguồn sử dụng kiểu nén chưa được hỗ trợ.", "SOURCE_ENCODING_FAILED");
  if (/captcha|cf-chl-|Just a moment\.\.\./i.test(response.bytes.subarray(0, 4000).toString())) throw new SourceBlockedError();
  return { bytes: response.bytes, type: String(response.headers["content-type"] ?? ""), url: url.href };
}
export type SourceClient = ReturnType<typeof sourceClient>;
type NetworkEvents = { waiting?: (retryAt: number, reason: string) => void; resumed?: () => void };
type NetworkRuntime = { request: typeof safeRequest; sleep: typeof pause; now: () => number };
export function sourceClient(signal: AbortSignal, events: NetworkEvents = {}, runtime: NetworkRuntime = { request: safeRequest, sleep: pause, now: Date.now }) {
  let cooldown = 0, interval = 250, nextStart = 0;
  async function schedule() {
    await runtime.sleep(200 + Math.floor(Math.random() * 201), signal);
    for (;;) {
      const scheduled = Math.max(runtime.now(), cooldown, nextStart); nextStart = scheduled + interval;
      await runtime.sleep(Math.max(0, scheduled - runtime.now()), signal);
      if (runtime.now() >= cooldown) break;
    }
  }
  const get = async (url: string, body?: unknown) => {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted(); await schedule();
      try {
        const result = await runtime.request(url, signal, body === undefined ? undefined : JSON.stringify(body));
        if (runtime.now() >= cooldown) events.resumed?.();
        return result;
      } catch (error) {
        if (signal.aborted) throw signal.reason;
        if (error instanceof SourceRateLimitError) {
          cooldown = Math.max(cooldown, error.retryAt, runtime.now() + 3000 * 2 ** attempt);
          interval = Math.min(3000, Math.max(750, interval * 2));
          events.waiting?.(cooldown, error.message);
          // Do not spend an unbounded request lifetime waiting: preserve checkpoint,
          // expose retryAt, and let the Admin resume after a long server cooldown.
          if (attempt >= 3 || cooldown - runtime.now() > 120000) throw error;
          continue;
        }
        const code = networkErrorCode(error);
        if (attempt < 2 && ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "TimeoutError"].includes(code)) { await runtime.sleep(1000 * 2 ** attempt, signal); continue; }
        throw error;
      }
    }
  };
  const document = async (url: string) => {
    const r = await get(url); if (!/html|text/.test(r.type)) throw new ImportSourceError("Nguồn không trả HTML; URL này có thể cần adapter riêng.", "UNSUPPORTED_SOURCE");
    const charset = r.type.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] ?? "utf-8";
    let html: string;
    try { html = new TextDecoder(charset).decode(r.bytes); } catch { throw new ImportSourceError("Bảng mã văn bản của nguồn chưa được hỗ trợ.", "UNSUPPORTED_CHARSET"); }
    return { html, url: r.url };
  };
  return { signal, get, document, html: async (url: string) => (await document(url)).html,
    json: async (url: string, body?: unknown): Promise<unknown> => JSON.parse((await get(url, body)).bytes.toString("utf8")) };
}
