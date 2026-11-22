import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { safeAuthRedirect } from "@/lib/auth-redirect";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";

function baseUrl(request: NextRequest) {
  const configured = process.env.APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const host = request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || request.nextUrl.protocol.replace(/:$/, "");
  return host ? `${protocol}://${host}` : request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const rate = checkRateLimit(`google-oauth:${requestIp(request)}`, 10, 5 * 60_000);
  if (!rate.allowed) return NextResponse.json({ success: false, message: "Thử lại sau ít phút." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL("/dang-nhap?error=oauth_unavailable", request.nextUrl.origin));
  const state = randomBytes(32).toString("base64url");
  const redirect = safeAuthRedirect(request.nextUrl.searchParams.get("redirect"));
  const callback = new URL("/api/auth/google/callback", baseUrl(request));
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.searchParams.set("client_id", clientId);
  authorization.searchParams.set("redirect_uri", callback.toString());
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("scope", "openid email profile");
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("prompt", "select_account");
  const response = NextResponse.redirect(authorization);
  response.cookies.set("google_oauth_state", Buffer.from(JSON.stringify({ state, redirect })).toString("base64url"), { httpOnly: true, secure: process.env.COOKIE_SECURE === "false" ? false : process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/google", maxAge: 600 });
  return response;
}
