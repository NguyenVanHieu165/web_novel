import type { Socket } from "socket.io";
import { jwtVerify } from "jose";

export type SocketSession = {
  idTaiKhoan: number;
  tenTaiKhoan: string;
  email: string;
  roles: string[];
};

const adminRecheckMs = 15_000;

export async function confirmSocketAdministrator(socket: Socket, session: SocketSession) {
  const token = readCookie(socket.handshake.headers.cookie, "token");
  if (!token) return false;

  try {
    // Use server configuration only. A request's Origin must not choose where cookies are sent.
    const base = (process.env.INTERNAL_API_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
    const url = new URL(`${base}/api/auth/me`);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const response = await fetch(url, {
      headers: { cookie: `token=${encodeURIComponent(token)}` },
      redirect: "error",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return false;
    const result: { user?: { idTaiKhoan?: number; roles?: string[] } } = await response.json();
    return result.user?.idTaiKhoan === session.idTaiKhoan && result.user.roles?.includes("admin") === true;
  } catch {
    return false;
  }
}

export function monitorSocketAdministrator(socket: Socket, session: SocketSession) {
  if (!session.roles.includes("admin")) return;
  const timer = setInterval(() => {
    void confirmSocketAdministrator(socket, session).then((allowed) => {
      if (!allowed) socket.disconnect(true);
    });
  }, adminRecheckMs);
  socket.once("disconnect", () => clearInterval(timer));
}

function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return null;

  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator === -1) continue;

    const key = entry.slice(0, separator).trim();
    if (key !== name) continue;

    return decodeURIComponent(entry.slice(separator + 1).trim());
  }

  return null;
}

export async function authenticateSocket(socket: Socket): Promise<SocketSession> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required");

  const token = readCookie(socket.handshake.headers.cookie, "token");
  if (!token) throw new Error("Authentication required");

  const { payload } = await jwtVerify(
    token,
    new TextEncoder().encode(secret),
  );

  if (
    typeof payload.idTaiKhoan !== "number" ||
    typeof payload.tenTaiKhoan !== "string" ||
    typeof payload.email !== "string" ||
    !Array.isArray(payload.roles) ||
    !payload.roles.every((role) => typeof role === "string")
  ) {
    throw new Error("Invalid session payload");
  }

  return {
    idTaiKhoan: payload.idTaiKhoan,
    tenTaiKhoan: payload.tenTaiKhoan,
    email: payload.email,
    roles: payload.roles,
  };
}

export function requireSocketRole(socket: Socket, role: string) {
  const session = socket.data.session as SocketSession | undefined;
  return Boolean(session?.roles.includes(role));
}
