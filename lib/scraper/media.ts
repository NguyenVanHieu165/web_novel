import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { SourceClient } from "./network";
import { SourceBlockedError } from "./types";

export async function downloadImage(raw: string, base: string, folder: string, client: SourceClient, counted: () => void) {
  let url = new URL(raw, base);
  if (url.pathname === "/_next/image" && url.searchParams.get("url")) url = new URL(url.searchParams.get("url")!, url);
  if (!/^(?:covers|chapters\/[a-z0-9-]{1,220})$/.test(folder)) throw new Error("Thư mục ảnh không hợp lệ.");
  const name = createHash("sha256").update(url.href).digest("hex") + ".webp";
  const dir = path.join(process.cwd(), "public/uploads", folder), file = path.join(dir, name);
  try { await readFile(file); return `/uploads/${folder}/${name}`; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const r = await client.get(url.href);
  if (!r.type.startsWith("image/") || /svg/i.test(r.type)) throw new Error("Ảnh nguồn không hợp lệ.");
  // Re-encode to drop executable formats and metadata; bound decoded pixels.
  const bytes = await sharp(r.bytes, { limitInputPixels: 40000000, animated: false }).rotate().webp({ quality: 85 }).toBuffer();
  await mkdir(dir, { recursive: true }); const temp = file + "." + randomUUID() + ".tmp";
  try { await writeFile(temp, bytes, { flag: "wx" }); await rename(temp, file); } finally { await rm(temp, { force: true }); }
  counted(); return `/uploads/${folder}/${name}`;
}
export async function optionalImage(work: () => Promise<string>, warning: () => void) {
  try { return await work(); } catch (error) { if (error instanceof SourceBlockedError || error instanceof Error && error.name === "AbortError") throw error; warning(); return null; }
}
