import "server-only";

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { publicTarget, safeRequest } from "./scraper/network";

type CloudinaryConfig = { cloudName: string; apiKey: string; apiSecret: string };
const maxImageBytes = 16 * 1024 * 1024;

export class ImageUploadError extends Error {
  constructor(message: string, readonly code: string, readonly status = 503) { super(message); }
}

function configuration(): CloudinaryConfig | null {
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
    } catch { /* Incomplete configuration follows the explicit fallback policy below. */ }
  }
  return cloudName && /^[a-z0-9_-]+$/i.test(cloudName) && apiKey && apiSecret
    ? { cloudName, apiKey, apiSecret } : null;
}

async function normalizedImage(input: Buffer): Promise<Buffer> {
  if (!input.length || input.length > maxImageBytes) {
    throw new ImageUploadError("Ảnh rỗng hoặc vượt giới hạn 16 MB.", "INVALID_IMAGE", 400);
  }
  try {
    const image = sharp(input, { limitInputPixels: 40_000_000, animated: false });
    if ((await image.metadata()).format === "svg") throw new Error("Unsupported image format");
    return await image.rotate().webp({ quality: 85 }).toBuffer();
  } catch {
    throw new ImageUploadError("Ảnh không hợp lệ. Dùng ảnh JPG, PNG, GIF hoặc WebP.", "INVALID_IMAGE", 400);
  }
}

/** Server-only upload; credentials and upstream diagnostics never reach clients. */
export async function uploadImageToCloudinary(input: Buffer | string, folder = "web-novel/covers", signal?: AbortSignal): Promise<string> {
  if (folder.length > 255 || !/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/i.test(folder)) {
    throw new ImageUploadError("Thư mục ảnh không hợp lệ.", "INVALID_IMAGE_FOLDER", 400);
  }
  signal?.throwIfAborted();
  let source: string | undefined;
  if (typeof input === "string") {
    if (/^\/(?:uploads|images)\/[a-z0-9/_.,%()-]+$/i.test(input) && !input.includes("..")) return input;
    try {
      const { url } = await publicTarget(input, signal);
      source = url.href;
    } catch {
      signal?.throwIfAborted();
      throw new ImageUploadError("URL ảnh phải trỏ tới website công khai hợp lệ.", "INVALID_IMAGE_URL", 400);
    }
    if (new URL(source).hostname === "res.cloudinary.com") return source;
  }
  const config = configuration();
  if (!config) {
    if (process.env.VERCEL) {
      if (source) return source;
      throw new ImageUploadError("Chưa cấu hình dịch vụ lưu ảnh. Vui lòng thử lại sau.", "IMAGE_CONFIGURATION_MISSING");
    }
    const downloaded = source ? await safeRequest(source, signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000)) : null;
    if (downloaded && (!downloaded.type.startsWith("image/") || /svg/i.test(downloaded.type))) {
      throw new ImageUploadError("URL không trả về ảnh hợp lệ.", "INVALID_IMAGE", 400);
    }
    const image = downloaded?.bytes ?? (typeof input === "string" ? Buffer.alloc(0) : input);
    const bytes = await normalizedImage(image);
    signal?.throwIfAborted();
    const localFolder = folder.replace(/^web-novel\//, "");
    const filename = createHash("sha256").update(bytes).digest("hex") + ".webp";
    const directory = path.join(process.cwd(), "public", "uploads", localFolder);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), bytes);
    return "/uploads/" + localFolder + "/" + filename;
  }
  const bytes = typeof input === "string" ? null : await normalizedImage(input);
  signal?.throwIfAborted();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHash("sha1").update("folder=" + folder + "&timestamp=" + timestamp + config.apiSecret).digest("hex");
  const form = new FormData();
  form.set("folder", folder);
  form.set("timestamp", timestamp);
  form.set("api_key", config.apiKey);
  form.set("signature", signature);
  if (source) form.set("file", source);
  else if (bytes) form.set("file", new Blob([new Uint8Array(bytes)], { type: "image/webp" }), "image.webp");
  try {
    const response = await fetch("https://api.cloudinary.com/v1_1/" + config.cloudName + "/image/upload", {
      method: "POST", body: form, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000), cache: "no-store",
    });
    if (!response.ok) throw new Error("Cloudinary upload rejected");
    const result: unknown = await response.json();
    if (typeof result !== "object" || result === null || !("secure_url" in result) || typeof result.secure_url !== "string") {
      throw new Error("Invalid Cloudinary response");
    }
    const url = new URL(result.secure_url);
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.username || url.password) {
      throw new Error("Invalid Cloudinary image URL");
    }
    return url.href;
  } catch {
    signal?.throwIfAborted();
    if (process.env.VERCEL && source) return source;
    throw new ImageUploadError("Không thể lưu ảnh lên Cloudinary. Vui lòng thử lại.", "IMAGE_UPLOAD_FAILED");
  }
}
