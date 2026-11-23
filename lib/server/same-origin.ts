import "server-only";

import type { NextRequest } from "next/server";

export function isSameOriginRequest(request: NextRequest): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;

  const origin = request.headers.get("origin");
  return origin === null || origin === request.nextUrl.origin;
}
