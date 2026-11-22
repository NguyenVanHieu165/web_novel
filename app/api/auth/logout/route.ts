import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: "Đăng xuất thành công",
  });

  // Xóa cookie bằng cách set maxAge = 0
  response.cookies.set("token", "", {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "false" ? false : process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
