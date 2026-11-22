import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { createHash } from "node:crypto";

function getSecretKey() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }

  return new TextEncoder().encode(secret);
}

export interface UserSessionPayload {
  idTaiKhoan: number;
  tenTaiKhoan: string;
  email: string;
  roles: string[]; // RBAC: ["user"], ["admin"]...
  passwordVersion?: string;
}

export function passwordVersion(hash: string) {
  return createHash("sha256").update(hash).digest("hex");
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return await bcrypt.hash(plainPassword, 10);
}

export async function verifyPassword(plainPassword: string, storedHash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plainPassword, storedHash);
  } catch {
    return false;
  }
}

// 2. JWT Token Service (jose)
export async function signToken(payload: UserSessionPayload, expiresIn = process.env.JWT_EXPIRES_IN || "7d"): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecretKey());
}

export async function verifyToken(token: string): Promise<UserSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as UserSessionPayload;
  } catch {
    return null; // Token không hợp lệ hoặc đã hết hạn
  }
}
