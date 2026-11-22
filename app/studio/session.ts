import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateUser } from "@/lib/server/auth-session";

export const requireStudioUser = cache(async () => {
  const auth = await authenticateUser((await cookies()).get("token")?.value);
  if (!auth.authorized) redirect("/dang-nhap?redirect=%2Fstudio");
  return auth.user;
});
