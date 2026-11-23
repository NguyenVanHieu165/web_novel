import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { prepareStoryTextForSpeech, splitStoryText, storySSML } from "./story-text";
import { storyVoices, type StoryVoice } from "./voices";

export { prepareStoryTextForSpeech } from "./story-text";

export interface ChapterAudioInput {
  chapterId: number;
  storySlug: string;
  chapterNumber: number;
  title: string;
  content: string;
  voice: StoryVoice;
}
export interface CachedChapterAudio {
  filePath?: string;
  remoteUrl?: string;
  fingerprint: string;
  bytes: number;
  cached: boolean;
}

export class AudioBusyError extends Error {}
const inFlight = new Map<string, Promise<CachedChapterAudio>>();
let activeJobs = 0;
const maxAudioBytes = 80 * 1024 * 1024;
type CloudinaryConfig = { cloudName: string; apiKey: string; apiSecret: string };

function safeStorySlug(storySlug: string): string {
  const normalized = storySlug.normalize("NFC");
  const safe = normalized.replace(/[^\p{L}\p{N}_-]/gu, "-").slice(0, 120) || "truyen";
  return safe === normalized && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(safe)
    ? safe
    : safe + "-" + createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}

function cachePath(input: ChapterAudioInput): string {
  // Database slugs are never trusted as filesystem paths.
  return path.join(process.cwd(), "public", "uploads", "audio", safeStorySlug(input.storySlug),
    "chuong-" + input.chapterNumber + "-" + input.voice + ".mp3");
}

function cloudinaryConfiguration(): CloudinaryConfig | null {
  let cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  let apiKey = process.env.CLOUDINARY_API_KEY;
  let apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (process.env.CLOUDINARY_URL) {
    try {
      const url = new URL(process.env.CLOUDINARY_URL);
      if (url.protocol === "cloudinary:") {
        cloudName ||= url.hostname;
        apiKey ||= decodeURIComponent(url.username);
        apiSecret ||= decodeURIComponent(url.password);
      }
    } catch {
      // Incomplete credentials are handled as a configuration error during upload.
    }
  }

  return cloudName && /^[a-z0-9_-]+$/iu.test(cloudName) && apiKey && apiSecret
    ? { cloudName, apiKey, apiSecret }
    : null;
}

function cloudinaryPublicId(input: ChapterAudioInput, fingerprint: string): string {
  const chapter = String(input.chapterNumber).replace(/[^0-9.-]/gu, "-");
  return `web-novel/audio/${safeStorySlug(input.storySlug)}/chuong-${chapter}-${input.voice}-${fingerprint}.mp3`;
}

function cloudinaryRawUrl(cloudName: string, publicId: string): string {
  const encodedId = publicId.split("/").map(encodeURIComponent).join("/");
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/raw/upload/${encodedId}`;
}

async function readCloudinaryCache(publicId: string, fingerprint: string): Promise<CachedChapterAudio | null> {
  const config = cloudinaryConfiguration();
  if (!config) return null;
  const remoteUrl = cloudinaryRawUrl(config.cloudName, publicId);

  try {
    const response = await fetch(remoteUrl, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const bytes = Number(response.headers.get("content-length"));
    if (response.ok && Number.isSafeInteger(bytes) && bytes > 0 && bytes <= maxAudioBytes) {
      return { remoteUrl, fingerprint, bytes, cached: true };
    }
  } catch {
    // A cache lookup failure is recoverable; synthesis and upload can still proceed.
  }

  return null;
}

async function uploadAudioToCloudinary(buffer: Buffer, publicId: string): Promise<string> {
  const config = cloudinaryConfiguration();
  if (!config) throw new Error("Cloudinary audio storage is not configured");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHash("sha1")
    .update(`public_id=${publicId}&timestamp=${timestamp}${config.apiSecret}`)
    .digest("hex");
  const form = new FormData();
  form.set("public_id", publicId);
  form.set("timestamp", timestamp);
  form.set("api_key", config.apiKey);
  form.set("signature", signature);
  form.set("file", new Blob([new Uint8Array(buffer)], { type: "audio/mpeg" }), "chapter.mp3");

  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/raw/upload`, {
    method: "POST",
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error("Cloudinary audio upload was rejected");
  const result: unknown = await response.json();
  if (typeof result !== "object" || result === null || !("secure_url" in result) || typeof result.secure_url !== "string") {
    throw new Error("Cloudinary returned an invalid audio response");
  }
  const url = new URL(result.secure_url);
  if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || !url.pathname.includes("/raw/upload/")) {
    throw new Error("Cloudinary returned an invalid audio URL");
  }
  return url.href;
}

async function readCache(filePath: string, fingerprint: string): Promise<CachedChapterAudio | null> {
  try {
    const [info, metadata] = await Promise.all([stat(filePath), readFile(filePath + ".json", "utf8")]);
    const saved: unknown = JSON.parse(metadata);
    if (info.isFile() && info.size > 0 && info.size <= maxAudioBytes &&
      typeof saved === "object" && saved !== null && "fingerprint" in saved &&
      saved.fingerprint === fingerprint && "bytes" in saved && saved.bytes === info.size) {
      return { filePath, fingerprint, bytes: info.size, cached: true };
    }
    return null;
  } catch (error) {
    if (error instanceof SyntaxError || (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) return null;
    throw error;
  }
}

async function synthesize(text: string, voice: StoryVoice): Promise<Buffer> {
  let tts = new MsEdgeTTS({ connectionTimeoutMs: 12_000, synthesisTimeoutMs: 15_000 });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; tts.close(); }, 180_000);
  try {
    await tts.setMetadata(storyVoices[voice].name, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const buffers: Buffer[] = [];
    let bytes = 0;
    for (const chunk of splitStoryText(text)) {
      let segment: Buffer | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (timedOut) throw new Error("Chapter audio deadline exceeded");
        try {
          const { audioStream } = tts.rawToStream(storySSML(chunk, voice));
          const parts: Buffer[] = [];
          let segmentBytes = 0;
          for await (const part of audioStream) {
            const buffer = Buffer.isBuffer(part) ? part : Buffer.from(part);
            segmentBytes += buffer.length;
            if (bytes + segmentBytes > maxAudioBytes) throw new Error("Audio output exceeds limit");
            parts.push(buffer);
          }
          segment = Buffer.concat(parts);
          if (!segment.length) throw new Error("Edge returned empty audio");
          break;
        } catch (error) {
          tts.close();
          if (attempt > 0 || timedOut) throw error;
          tts = new MsEdgeTTS({ connectionTimeoutMs: 12_000, synthesisTimeoutMs: 15_000 });
          await tts.setMetadata(storyVoices[voice].name, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        }
      }
      if (!segment || timedOut) throw new Error("Chapter audio synthesis did not finish");
      bytes += segment.length;
      buffers.push(segment);
    }
    // Each segment has the same CBR MPEG Layer III format, so its frames concatenate
    // into a single seekable MP3 stream without a platform-specific encoder.
    const audio = Buffer.concat(buffers);
    if (!audio.length) throw new Error("Empty audio");
    return audio;
  } finally {
    clearTimeout(timer);
    tts.close();
  }
}

export async function getChapterAudio(input: ChapterAudioInput): Promise<CachedChapterAudio> {
  if (!input.content.trim() || input.content.length > 200_000) throw new Error("Invalid chapter audio length");
  const text = prepareStoryTextForSpeech(input.content, input.title, input.voice);
  const fingerprint = createHash("sha256").update(JSON.stringify([2, input.chapterId, storyVoices[input.voice], text])).digest("hex");
  const useCloudinary = process.env.VERCEL === "1";
  const publicId = useCloudinary ? cloudinaryPublicId(input, fingerprint) : null;
  const filePath = cachePath(input);
  const cached = publicId
    ? await readCloudinaryCache(publicId, fingerprint)
    : await readCache(filePath, fingerprint);
  if (cached) return cached;

  const cacheKey = publicId ?? filePath;
  const pending = inFlight.get(cacheKey);
  if (pending) {
    const result = await pending;
    return result.fingerprint === fingerprint ? { ...result, cached: true } : getChapterAudio(input);
  }
  if (activeJobs >= 2) throw new AudioBusyError("Audio generation is busy");
  activeJobs++;
  const job = (async () => {
    if (publicId) {
      const buffer = await synthesize(text, input.voice);
      const remoteUrl = await uploadAudioToCloudinary(buffer, publicId);
      return { remoteUrl, fingerprint, bytes: buffer.length, cached: false };
    }

    const temporary = filePath + "." + randomUUID() + ".tmp";
    try {
      const buffer = await synthesize(text, input.voice);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(temporary, buffer, { flag: "wx" });
      await writeFile(temporary + ".json", JSON.stringify({ fingerprint, bytes: buffer.length }), { flag: "wx" });
      await rename(temporary, filePath);
      await rename(temporary + ".json", filePath + ".json");
      return { filePath, fingerprint, bytes: buffer.length, cached: false };
    } finally {
      await Promise.all([rm(temporary, { force: true }), rm(temporary + ".json", { force: true })]);
    }
  })();
  inFlight.set(cacheKey, job);
  try { return await job; }
  finally { inFlight.delete(cacheKey); activeJobs--; }
}
