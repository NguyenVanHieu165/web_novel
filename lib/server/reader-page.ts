import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateUser } from "@/lib/server/auth-session";

export async function requireReaderPage(path: "/profile" | "/vi-xu") {
  const auth = await authenticateUser((await cookies()).get("token")?.value);
  if (!auth.authorized) redirect(`/dang-nhap?redirect=${encodeURIComponent(path)}`);
  return auth.user;
}
