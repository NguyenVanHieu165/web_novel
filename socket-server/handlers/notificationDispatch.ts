import type { Server } from "socket.io";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function dispatchInternalNotification(io: Server, body: unknown): boolean {
  if (!isRecord(body) || typeof body.type !== "string" || !body.type || typeof body.message !== "string" || !body.message || body.message.length > 10_000) return false;
  for (const key of ["title", "category", "priority"]) {
    if (body[key] !== undefined && typeof body[key] !== "string") return false;
  }
  if (body.data !== undefined && !isRecord(body.data)) return false;
  if (body.userId !== undefined && body.userIds !== undefined) return false;
  const ids: unknown = body.userId === undefined ? body.userIds : [body.userId];
  if (ids !== undefined && (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every((id: unknown) => typeof id === "number" && Number.isSafeInteger(id) && id > 0))) return false;
  // A targeted event never falls back to broadcasting. Absent audience retains
  // the existing admin-only demo contract.
  const rooms = ids === undefined ? ["admins"] : [...new Set((ids as number[]).map((id) => `user:${id}`))];
  io.to(rooms).emit("notification", {
    type: body.type, title: body.title || "Thông báo mới", message: body.message,
    category: body.category || "follow", priority: body.priority || "normal",
    data: body.data || {}, timestamp: new Date(),
  });
  return true;
}
