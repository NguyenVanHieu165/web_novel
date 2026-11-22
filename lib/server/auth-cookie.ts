import "server-only";

import { NextResponse } from "next/server";
import { passwordVersion, signToken } from "@/lib/auth";

type SessionAccount = { idTaiKhoan: number; tenTaiKhoan: string; email: string; matKhau: string; roles: string[] };

export async function setSessionCookie(response: NextResponse, account: SessionAccount) {
  const token = await signToken({
    idTaiKhoan: account.idTaiKhoan,
    tenTaiKhoan: account.tenTaiKhoan,
    email: account.email,
    roles: account.roles,
    passwordVersion: passwordVersion(account.matKhau),
  });
  response.cookies.set("token", token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "false" ? false : process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
}
