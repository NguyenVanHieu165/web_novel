import { createHash } from "node:crypto";
import type { ImageDownloader } from "./executor";

type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

function cloudinaryConfig(): CloudinaryConfig | null {
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
      // Explicit variables below remain authoritative when CLOUDINARY_URL is malformed.
    }
  }

  return cloudName && /^[a-z0-9_-]+$/iu.test(cloudName) && apiKey && apiSecret
    ? { cloudName, apiKey, apiSecret }
    : null;
}

async function uploadRemoteImage(source: string, folder: string, signal: AbortSignal) {
  const config = cloudinaryConfig();
  if (!config) return source;

  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const signature = createHash("sha1")
    .update(`folder=${folder}&timestamp=${timestamp}${config.apiSecret}`)
    .digest("hex");
  const form = new FormData();
  form.set("folder", folder);
  form.set("timestamp", timestamp);
  form.set("api_key", config.apiKey);
  form.set("signature", signature);
  form.set("file", source);

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (!response.ok) throw new Error("Cloudinary upload rejected");
    const result: unknown = await response.json();
    if (typeof result !== "object" || result === null || !("secure_url" in result) || typeof result.secure_url !== "string") {
      throw new Error("Invalid Cloudinary response");
    }
    const uploaded = new URL(result.secure_url);
    if (uploaded.protocol !== "https:" || uploaded.hostname !== "res.cloudinary.com" || uploaded.username || uploaded.password) {
      throw new Error("Invalid Cloudinary image URL");
    }
    return uploaded.href;
  } catch (error) {
    signal.throwIfAborted();
    console.warn("[import-image-upload-failed]", error instanceof Error ? error.name : "UnknownError");
    return source;
  }
}

export const downloadImportImage: ImageDownloader = async (raw, base, folder, client, counted) => {
  let url = new URL(raw, base);
  if (url.pathname === "/_next/image" && url.searchParams.get("url")) {
    url = new URL(url.searchParams.get("url")!, url);
  }
  if (!/^(?:covers|chapters\/[a-z0-9-]{1,220})$/u.test(folder)) {
    throw new Error("Thư mục ảnh không hợp lệ.");
  }

  const image = await client.get(url.href);
  if (!image.type.startsWith("image/") || /svg/iu.test(image.type)) {
    throw new Error("Ảnh nguồn không hợp lệ.");
  }
  client.signal.throwIfAborted();
  const validatedUrl = new URL(image.url);
  const storedUrl = validatedUrl.hostname === "res.cloudinary.com"
    ? validatedUrl.href
    : await uploadRemoteImage(validatedUrl.href, `web-novel/${folder}`, client.signal);
  counted();
  return storedUrl;
};
