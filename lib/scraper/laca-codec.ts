import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { normalizeVietnameseText } from "../vietnamese-text";

export { normalizeVietnameseText };
// Compatibility for existing crawler imports; one shared implementation.
export const normalizeVietnamese = normalizeVietnameseText;

// Wire format observed in the site's public browser client (module 98530).
// This is a transport codec, not the user's JWT. Access decisions stay server-side.
const seed = "T5Hr41U5jKTTrtUOXdYZnyx3wjZEKUoxv16Clwwu4D5zIbd0";
const shift = [..."q9sdfh"].reduce((value, char) => value * char.charCodeAt(0) % 255, 1);
const transportKey = [...seed].map((char, index) => {
  const code = char.charCodeAt(0);
  const offset = (shift + index * code) % 26;
  return code >= 65 && code <= 90 ? String.fromCharCode((code - 65 + offset) % 26 + 65)
    : code >= 97 && code <= 122 ? String.fromCharCode((code - 97 + offset) % 26 + 97) : char;
}).join("");

function keyIv(password: string, salt: Buffer) {
  let previous: Buffer = Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for (let length = 0; length < 48; length += previous.length) {
    previous = createHash("md5").update(Buffer.concat([previous, Buffer.from(password), salt])).digest();
    chunks.push(previous);
  }
  const material = Buffer.concat(chunks);
  return { key: material.subarray(0, 32), iv: material.subarray(32, 48) };
}

export function encryptSource(value: string, password = transportKey): string {
  const salt = randomBytes(8);
  const { key, iv } = keyIv(password, salt);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([Buffer.from("Salted__"), salt, cipher.update(value, "utf8"), cipher.final()]).toString("base64");
}

export function decryptSource(value: string, password = transportKey): string {
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 32 || bytes.subarray(0, 8).toString() !== "Salted__") throw new Error("Unsupported source transport encoding");
  try {
    const { key, iv } = keyIv(password, bytes.subarray(8, 16));
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat([decipher.update(bytes.subarray(16)), decipher.final()])).normalize("NFC");
  } catch { throw new Error("Source transport decode failed; browser protocol may have changed"); }
}
