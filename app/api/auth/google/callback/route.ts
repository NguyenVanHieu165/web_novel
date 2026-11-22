import { uploadImageToCloudinary } from "@/lib/cloudinary";
export const maxDuration = 60;
import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { safeAuthRedirect } from "@/lib/auth-redirect";
import { setSessionCookie } from "@/lib/server/auth-cookie";
import { resolveAccountRole } from "@/lib/server/account-roles";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";

const tokenSchema = z.object({ access_token: z.string().min(1) });
const googleUserSchema = z.object({ email: z.string().email(), email_verified: z.boolean(), name: z.string().trim().min(1).max(255).optional(), picture: z.string().url().max(500).optional() });
function baseUrl(request: NextRequest) { const configured = process.env.APP_URL?.replace(/\/+$/, ""); if (configured) return configured; const host = request.headers.get("host"); const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || request.nextUrl.protocol.replace(/:$/, ""); return host ? `${protocol}://${host}` : request.nextUrl.origin; }
function failed(request: NextRequest, error: string) { return NextResponse.redirect(new URL(`/dang-nhap?error=${encodeURIComponent(error)}`, baseUrl(request))); }
function readState(value: string | undefined) { try { const parsed: unknown = JSON.parse(Buffer.from(value ?? "", "base64url").toString()); return z.object({ state: z.string().min(32), redirect: z.string() }).safeParse(parsed); } catch { return { success: false as const }; } }
function stateMatches(expected: string | undefined, received: string | null) { const parsed = readState(expected); if (!parsed.success || !received) return null; const left = Buffer.from(parsed.data.state), right = Buffer.from(received); return left.length === right.length && timingSafeEqual(left, right) ? parsed.data.redirect : null; }
function usernameFrom(email: string) { const base = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 30) || "reader"; return `${base}_${randomBytes(4).toString("hex")}`.slice(0, 45); }

export async function GET(request: NextRequest) {
  const rate = checkRateLimit(`google-oauth:${requestIp(request)}`, 20, 5 * 60_000);
  if (!rate.allowed) return failed(request, "oauth_rate_limited");
  const state = request.nextUrl.searchParams.get("state"), redirect = stateMatches(request.cookies.get("google_oauth_state")?.value, state);
  if (redirect === null) return failed(request, "oauth_state_invalid");
  const clearState = (response: NextResponse) => { response.cookies.set("google_oauth_state", "", { httpOnly: true, secure: process.env.COOKIE_SECURE === "false" ? false : process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/google", maxAge: 0 }); return response; };
  const code = request.nextUrl.searchParams.get("code");
  if (!code || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return clearState(failed(request, "oauth_failed"));
  try {
    const callback = new URL("/api/auth/google/callback", baseUrl(request));
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: callback.toString(), grant_type: "authorization_code" }), cache: "no-store" });
    const token = tokenSchema.safeParse(await tokenResponse.json()); if (!tokenResponse.ok || !token.success) return clearState(failed(request, "oauth_failed"));
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${token.data.access_token}` }, cache: "no-store" });
    const googleUser = googleUserSchema.safeParse(await userResponse.json()); if (!userResponse.ok || !googleUser.success || !googleUser.data.email_verified) return clearState(failed(request, "email_not_verified"));
    const picture = googleUser.data.picture ? await uploadImageToCloudinary(googleUser.data.picture, "web-novel/avatars") : undefined;
    const email = googleUser.data.email.toLowerCase();
    const account = await prisma.$transaction(async tx => {
      const existing = await tx.taiKhoan.findUnique({ where: { email }, include: { hoSoCaNhan: true, vaiTroNguoiDung: { include: { vaiTro: true } } } });
      if (existing) {
        if (existing.trangThai !== "active" || existing.isDeleted) return null;
        if (googleUser.data.picture && !existing.hoSoCaNhan?.anh) await tx.hoSoCaNhan.upsert({ where: { idTaiKhoan: existing.idTaiKhoan }, create: { idTaiKhoan: existing.idTaiKhoan, ho_ten: googleUser.data.name || existing.tenTaiKhoan, anh: picture }, update: { anh: picture } });
        return { ...existing, roles: existing.vaiTroNguoiDung.map(item => item.vaiTro.tenVaiTro) };
      }
      const role = await resolveAccountRole(tx);
      const created = await tx.taiKhoan.create({ data: { tenTaiKhoan: usernameFrom(email), email, matKhau: await hashPassword(randomBytes(32).toString("base64url")), emailXacThuc: true, trangThai: "active" }, select: { idTaiKhoan: true, tenTaiKhoan: true, email: true, matKhau: true } });
      await Promise.all([tx.hoSoCaNhan.create({ data: { idTaiKhoan: created.idTaiKhoan, ho_ten: googleUser.data.name || created.tenTaiKhoan, anh: picture } }), tx.viTien.create({ data: { idTaiKhoan: created.idTaiKhoan, soDuXu: 0, tongNapXu: 0 } }), tx.vaiTroNguoiDung.create({ data: { idTaiKhoan: created.idTaiKhoan, idVaiTro: role.idVaiTro } })]);
      return { ...created, roles: [role.tenVaiTro] };
    });
    if (!account) return clearState(failed(request, "account_locked"));
    await prisma.taiKhoan.update({ where: { idTaiKhoan: account.idTaiKhoan }, data: { lastLogin: new Date() } });
    const response = NextResponse.redirect(new URL(safeAuthRedirect(redirect), baseUrl(request))); await setSessionCookie(response, account); return clearState(response);
  } catch { return clearState(failed(request, "oauth_failed")); }
}
