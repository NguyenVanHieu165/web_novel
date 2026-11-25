import { Socket, Server } from "socket.io";
import * as Y from "yjs";
import { z } from "zod";
import { activeRooms } from "../rooms/activeDocs";
import { requireSocketRole } from "../auth/socketAuth";

const ROOM_RETENTION_MS = 5 * 60 * 1000;
const MAX_DOCUMENT_BYTES = 256 * 1024;
const chapterIdSchema = z.union([
  z.number(),
  z.string().regex(/^[1-9]\d*$/u).transform(Number),
]).pipe(z.number().int().positive().max(2_147_483_647));
const binarySchema = (maxBytes: number) => z.instanceof(Uint8Array)
  .refine(value => value.byteLength > 0 && value.byteLength <= maxBytes);
const chapterSchema = z.object({ chapterId: chapterIdSchema }).strict();
const joinSchema = chapterSchema.extend({
  initialContent: z.string().max(MAX_DOCUMENT_BYTES)
    .refine(value => Buffer.byteLength(value, "utf8") <= MAX_DOCUMENT_BYTES).optional(),
  stateUpdate: binarySchema(MAX_DOCUMENT_BYTES).optional(),
});
const updateSchema = chapterSchema.extend({ update: binarySchema(MAX_DOCUMENT_BYTES) });
const awarenessSchema = chapterSchema.extend({ update: binarySchema(32 * 1024) });

export const registerCollaborativeHandlers = (io: Server, socket: Socket) => {
  // Serialize this socket's operations so updates cannot overtake an async join/leave.
  let pending = Promise.resolve();
  const onEvent = (event: string, handle: (payload: unknown) => void | Promise<void>) => {
    socket.on(event, (payload: unknown) => {
      pending = pending.then(() => handle(payload)).catch((error: unknown) => {
        console.warn("[CRDT] Event rejected", event, error instanceof Error ? error.name : "UnknownError");
        try {
          socket.emit("collaboration-error", { message: "Không thể xử lý yêu cầu cộng tác." });
        } catch {
          // A disconnected transport cannot receive the error; the event stays contained.
        }
      });
      return pending;
    });
  };

  const leaveRoom = async (chapterId: number, disconnected = false) => {
    if (socket.data.chapterId !== chapterId) return;
    try {
      await socket.leave(`chapter-${chapterId}`);
    } catch (error) {
      if (!disconnected) throw error;
      console.warn("[CRDT] Disconnected transport cleanup failed", error instanceof Error ? error.name : "UnknownError");
    }
    const room = activeRooms.get(chapterId);
    const name = socket.data.userName;
    socket.data.chapterId = undefined;
    socket.data.userName = undefined;
    if (!room) return;
    if (name) {
      const userSockets = room.users.get(name);
      userSockets?.delete(socket.id);
      if (userSockets?.size === 0) room.users.delete(name);
    }
    if (room.users.size === 0) {
      if (room.gcTimeout) clearTimeout(room.gcTimeout);
      room.lastActive = new Date();
      room.gcTimeout = setTimeout(() => {
        if (room.users.size === 0 && activeRooms.get(chapterId) === room) {
          activeRooms.delete(chapterId);
          room.doc.destroy();
        }
      }, ROOM_RETENTION_MS);
    } else {
      io.to(`chapter-${chapterId}`).emit("users-online", { users: Array.from(room.users.keys()) });
    }
  };

  onEvent("join-chapter", async (payload) => {
    const parsed = joinSchema.safeParse(payload);
    if (!parsed.success) return;
    if (!requireSocketRole(socket, "admin")) {
      socket.emit("authorization-error", { message: "Editor role required" });
      return;
    }
    const { chapterId, initialContent, stateUpdate } = parsed.data;
    if (stateUpdate) Y.decodeUpdate(stateUpdate);
    const name: unknown = socket.data.session?.tenTaiKhoan;
    if (typeof name !== "string" || !name) return;
    if (socket.data.chapterId !== undefined && socket.data.chapterId !== chapterId) {
      await leaveRoom(socket.data.chapterId);
    }
    await socket.join(`chapter-${chapterId}`);
    let room = activeRooms.get(chapterId);
    if (!room) {
      const doc = new Y.Doc();
      try {
        if (stateUpdate) Y.applyUpdate(doc, stateUpdate);
        if (doc.getText("content").length === 0 && initialContent) doc.getText("content").insert(0, initialContent);
      } catch (error) {
        doc.destroy();
        await socket.leave(`chapter-${chapterId}`);
        throw error;
      }
      room = { doc, users: new Map<string, Set<string>>(), lastActive: new Date() };
      activeRooms.set(chapterId, room);
    }
    if (room.gcTimeout) {
      clearTimeout(room.gcTimeout);
      room.gcTimeout = undefined;
    }
    socket.data.userName = name;
    socket.data.chapterId = chapterId;
    const userSockets = room.users.get(name) ?? new Set<string>();
    userSockets.add(socket.id);
    room.users.set(name, userSockets);
    room.lastActive = new Date();
    socket.emit("initial-document", Y.encodeStateAsUpdate(room.doc));
    socket.emit("document-state", { status: "saved" });
    io.to(`chapter-${chapterId}`).emit("users-online", { users: Array.from(room.users.keys()) });
  });

  onEvent("update-crdt", (payload) => {
    const parsed = updateSchema.safeParse(payload);
    if (!parsed.success || !requireSocketRole(socket, "admin")) return;
    const { chapterId, update } = parsed.data;
    if (socket.data.chapterId !== chapterId) return;
    const room = activeRooms.get(chapterId);
    if (!room) return;
    // Decode the complete packet before mutating the shared document or relaying it.
    Y.decodeUpdate(update);
    Y.applyUpdate(room.doc, update);
    room.lastActive = new Date();
    socket.emit("document-state", { status: "saved" });
    socket.to(`chapter-${chapterId}`).emit("crdt-update", update);
  });

  onEvent("awareness-update", (payload) => {
    const parsed = awarenessSchema.safeParse(payload);
    if (!parsed.success || !requireSocketRole(socket, "admin")) return;
    const { chapterId, update } = parsed.data;
    if (socket.data.chapterId !== chapterId) return;
    socket.to(`chapter-${chapterId}`).emit("awareness-update-client", update);
  });

  onEvent("leave-chapter", async (payload) => {
    const parsed = chapterSchema.safeParse(payload);
    if (!parsed.success || !requireSocketRole(socket, "admin")) return;
    await leaveRoom(parsed.data.chapterId);
  });

  onEvent("disconnect", async () => {
    const chapterId = chapterIdSchema.safeParse(socket.data.chapterId);
    if (chapterId.success) await leaveRoom(chapterId.data, true);
  });
};
