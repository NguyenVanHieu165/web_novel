import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateUser } from "@/lib/server/auth-session";

export const requireAdminPage = cache(async () => {
  const auth = await authenticateUser((await cookies()).get("token")?.value);
  if (!auth.authorized) redirect("/dang-nhap");
  if (!auth.user.roles.includes("admin")) redirect("/");
  return auth.user;
});
