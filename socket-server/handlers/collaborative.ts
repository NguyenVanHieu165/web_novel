import { Socket, Server } from "socket.io";
import * as Y from "yjs";
import { activeRooms } from "../rooms/activeDocs";
import { requireSocketRole } from "../auth/socketAuth";

const ROOM_RETENTION_MS = 5 * 60 * 1000;

export const registerCollaborativeHandlers = (io: Server, socket: Socket) => {
  socket.on("join-chapter", ({ chapterId, initialContent, stateUpdate }: {
    chapterId: number;
    initialContent?: string;
    stateUpdate?: Uint8Array;
  }) => {
    if (!requireSocketRole(socket, "admin")) {
      socket.emit("authorization-error", { message: "Editor role required" });
      return;
    }

    if (!Number.isInteger(chapterId) || chapterId <= 0) return;

    const name = socket.data.session.tenTaiKhoan;
    socket.data.userName = name;
    socket.data.chapterId = chapterId;

    socket.join(`chapter-${chapterId}`);

    let room = activeRooms.get(chapterId);
    if (room?.gcTimeout) {
      clearTimeout(room.gcTimeout);
      room.gcTimeout = undefined;
    }
    if (!room) {
      const doc = new Y.Doc();
      if (stateUpdate && stateUpdate.byteLength <= 256 * 1024) {
        Y.applyUpdate(doc, stateUpdate);
      }
      if (doc.getText("content").length === 0 && initialContent) {
        doc.getText("content").insert(0, initialContent);
      }
      room = {
        doc,
        users: new Map<string, Set<string>>(),
        lastActive: new Date()
      };
      activeRooms.set(chapterId, room);
    }

    const userSockets = room.users.get(name) ?? new Set<string>();
    userSockets.add(socket.id);
    room.users.set(name, userSockets);
    room.lastActive = new Date();

    // Gửi toàn bộ dữ liệu nhị phân Y.Doc hiện tại cho Client mới join dưới dạng Buffer/Uint8Array
    const documentUpdate = Y.encodeStateAsUpdate(room.doc);
    socket.emit("initial-document", documentUpdate);
    socket.emit("document-state", { status: "saved" });

    // Phát đi danh sách tác giả online
    io.to(`chapter-${chapterId}`).emit("users-online", {
      users: Array.from(room.users.keys())
    });

  });

  socket.on("update-crdt", ({ chapterId, update }: { chapterId: number; update: Buffer | Uint8Array }) => {
    if (!requireSocketRole(socket, "admin") || socket.data.chapterId !== chapterId) return;

    if (!update || update.byteLength > 256 * 1024) return;

    const room = activeRooms.get(chapterId);
    if (room) {
      const updateBuffer = update instanceof Uint8Array ? update : new Uint8Array(update);
      Y.applyUpdate(room.doc, updateBuffer);
      room.lastActive = new Date();
      socket.emit("document-state", { status: "saved" });

      // Phát lại bản cập nhật nhị phân cho các client khác trong room
      socket.to(`chapter-${chapterId}`).emit("crdt-update", updateBuffer);
    }
  });

  socket.on("awareness-update", ({ chapterId, update }: { chapterId: number; update: Buffer | Uint8Array }) => {
    if (!requireSocketRole(socket, "admin") || socket.data.chapterId !== chapterId) return;

    if (!update || update.byteLength > 32 * 1024) return;

    const updateBuffer = update instanceof Uint8Array ? update : new Uint8Array(update);
    // Phát lại trạng thái con trỏ chuột cho các tác giả khác trong room
    socket.to(`chapter-${chapterId}`).emit("awareness-update-client", updateBuffer);
  });

  const leaveRoom = (chapterId: number) => {
    const room = activeRooms.get(chapterId);
    if (room) {
      const name = socket.data.userName;
      if (name) {
        const userSockets = room.users.get(name);
        userSockets?.delete(socket.id);
        if (userSockets?.size === 0) room.users.delete(name);
      }
      socket.leave(`chapter-${chapterId}`);

      if (room.users.size === 0) {
        if (room.gcTimeout) clearTimeout(room.gcTimeout);
        room.lastActive = new Date();
        room.gcTimeout = setTimeout(() => {
          if (room?.users.size === 0 && activeRooms.get(chapterId) === room) {
            activeRooms.delete(chapterId);
            room.doc.destroy();
            console.log(`[CRDT] Room ${chapterId} expired after retention window.`);
          }
        }, ROOM_RETENTION_MS);
      } else {
        io.to(`chapter-${chapterId}`).emit("users-online", {
          users: Array.from(room.users.keys())
        });
      }
    }
  };

  socket.on("leave-chapter", ({ chapterId }: { chapterId: number }) => {
    leaveRoom(chapterId);
  });

  socket.on("disconnect", () => {
    const chapterId = socket.data.chapterId;
    if (chapterId) {
      leaveRoom(chapterId);
    }
  });
};
