import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { verifyToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Never expose paid content through Next's public static-file handler.
  // Audio is served exclusively by the chapter API, which rechecks each request.
  let decodedPath = pathname;
  try {
    decodedPath = decodeURIComponent(decodeURIComponent(pathname)).replace(/\\/gu, "/")
      .split("/").map((segment) => segment.replace(/[. ]+$/gu, "")).join("/");
  }
  catch { return new NextResponse(null, { status: 400 }); }
  if (/(?:^|\/)uploads\/audio(?:\/|$)/iu.test(decodedPath)) {
    return new NextResponse(null, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  const guarded = /^\/(?:admin|api\/admin|tu-sach|tai-khoan|lich-su|vi-xu)(?:\/|$)/u.test(pathname) ||
    pathname === "/dang-nhap" || pathname === "/dang-ky";
  if (!guarded) return NextResponse.next();
  const token = request.cookies.get("token")?.value;
  const session = token ? await verifyToken(token) : null;

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (!session) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { success: false, code: "UNAUTHENTICATED", message: "Vui lòng đăng nhập để tiếp tục" },
          { status: 401 },
        );
      }
      const loginUrl = new URL("/dang-nhap", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (!session.roles.includes("admin")) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { success: false, code: "FORBIDDEN", message: "Bạn không có quyền quản trị" },
          { status: 403 },
        );
      }
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  const protectedReaderPaths = ["/tu-sach", "/tai-khoan", "/lich-su", "/vi-xu"];
  if (protectedReaderPaths.some((path) => pathname.startsWith(path)) && !session) {
    const loginUrl = new URL("/dang-nhap", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if ((pathname === "/dang-nhap" || pathname === "/dang-ky") && session) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Also inspect encoded/case-varied public paths before Next decodes filesystem names.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
