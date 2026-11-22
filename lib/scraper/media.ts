import type { SourceClient } from "./network";
import { SourceBlockedError } from "./types";
import { ImageUploadError, uploadImageToCloudinary } from "../cloudinary";

export async function downloadImage(raw: string, base: string, folder: string, client: SourceClient, counted: () => void) {
  let url = new URL(raw, base);
  if (url.pathname === "/_next/image" && url.searchParams.get("url")) url = new URL(url.searchParams.get("url")!, url);
  if (!/^(?:covers|chapters\/[a-z0-9-]{1,220})$/.test(folder)) throw new Error("Thư mục ảnh không hợp lệ.");
  const image = await client.get(url.href);
  if (!image.type.startsWith("image/") || /svg/i.test(image.type)) throw new Error("Ảnh nguồn không hợp lệ.");
  client.signal.throwIfAborted();
  try {
    const result = await uploadImageToCloudinary(image.url, "web-novel/" + folder, client.signal, { remoteSourceFallback: true });
    counted();
    return result;
  } catch (error) {
    client.signal.throwIfAborted();
    if (process.env.VERCEL && error instanceof ImageUploadError &&
        ["IMAGE_CONFIGURATION_MISSING", "IMAGE_UPLOAD_FAILED"].includes(error.code)) return url.href;
    throw error;
  }
}
export async function optionalImage(work: () => Promise<string>, warning: () => void) {
  try { return await work(); } catch (error) { if (error instanceof SourceBlockedError || error instanceof Error && error.name === "AbortError") throw error; warning(); return null; }
}
