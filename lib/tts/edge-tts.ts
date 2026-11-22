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
  filePath: string;
  fingerprint: string;
  bytes: number;
  cached: boolean;
}

export class AudioBusyError extends Error {}
const inFlight = new Map<string, Promise<CachedChapterAudio>>();
let activeJobs = 0;
const maxAudioBytes = 80 * 1024 * 1024;

function cachePath(input: ChapterAudioInput): string {
  // Database slugs are never trusted as filesystem paths.
  const normalized = input.storySlug.normalize("NFC");
  const safe = normalized.replace(/[^\p{L}\p{N}_-]/gu, "-").slice(0, 120) || "truyen";
  const slug = safe === normalized && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(safe) ? safe :
    safe + "-" + createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return path.join(process.cwd(), "public", "uploads", "audio", slug,
    "chuong-" + input.chapterNumber + "-" + input.voice + ".mp3");
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
  const filePath = cachePath(input);
  const cached = await readCache(filePath, fingerprint);
  if (cached) return cached;

  const pending = inFlight.get(filePath);
  if (pending) {
    const result = await pending;
    return result.fingerprint === fingerprint ? { ...result, cached: true } : getChapterAudio(input);
  }
  if (activeJobs >= 2) throw new AudioBusyError("Audio generation is busy");
  activeJobs++;
  const job = (async () => {
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
  inFlight.set(filePath, job);
  try { return await job; }
  finally { inFlight.delete(filePath); activeJobs--; }
}
