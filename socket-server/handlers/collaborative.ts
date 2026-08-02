import { Socket, Server } from "socket.io";
import * as Y from "yjs";
import { activeRooms } from "../rooms/activeDocs";

export const registerCollaborativeHandlers = (io: Server, socket: Socket) => {
  socket.on("join-chapter", ({ chapterId, initialContent, userName }: { chapterId: number; initialContent?: string; userName?: string }) => {
    const name = userName || `Tác giả ẩn danh (${socket.id.slice(0, 4)})`;
    (socket as any).userName = name;
    (socket as any).chapterId = chapterId;

    socket.join(`chapter-${chapterId}`);

    let room = activeRooms.get(chapterId);
    if (!room) {
      const doc = new Y.Doc();
      if (initialContent) {
        doc.getText("content").insert(0, initialContent);
      }
      room = {
        doc,
        users: new Set<string>(),
        lastActive: new Date()
      };
      activeRooms.set(chapterId, room);
    }

    room.users.add(name);
    room.lastActive = new Date();

    // Gửi toàn bộ dữ liệu nhị phân Y.Doc hiện tại cho Client mới join dưới dạng Buffer/Uint8Array
    const stateUpdate = Y.encodeStateAsUpdate(room.doc);
    socket.emit("initial-document", stateUpdate);

    // Phát đi danh sách tác giả online
    io.to(`chapter-${chapterId}`).emit("users-online", {
      users: Array.from(room.users)
    });

    console.log(`[CRDT] User "${name}" joined chapter ${chapterId}. Active users:`, Array.from(room.users));
  });

  socket.on("update-crdt", ({ chapterId, update }: { chapterId: number; update: Buffer | Uint8Array }) => {
    const room = activeRooms.get(chapterId);
    if (room) {
      const updateBuffer = update instanceof Uint8Array ? update : new Uint8Array(update);
      Y.applyUpdate(room.doc, updateBuffer);
      room.lastActive = new Date();

      // Phát lại bản cập nhật nhị phân cho các client khác trong room
      socket.to(`chapter-${chapterId}`).emit("crdt-update", updateBuffer);
    }
  });

  socket.on("awareness-update", ({ chapterId, update }: { chapterId: number; update: Buffer | Uint8Array }) => {
    const updateBuffer = update instanceof Uint8Array ? update : new Uint8Array(update);
    // Phát lại trạng thái con trỏ chuột cho các tác giả khác trong room
    socket.to(`chapter-${chapterId}`).emit("awareness-update-client", updateBuffer);
  });

  const leaveRoom = (chapterId: number) => {
    const room = activeRooms.get(chapterId);
    if (room) {
      const name = (socket as any).userName;
      if (name) {
        room.users.delete(name);
      }
      socket.leave(`chapter-${chapterId}`);

      if (room.users.size === 0) {
        activeRooms.delete(chapterId);
        console.log(`[CRDT] Room ${chapterId} is empty. Garbage collected.`);
      } else {
        io.to(`chapter-${chapterId}`).emit("users-online", {
          users: Array.from(room.users)
        });
      }
    }
  };

  socket.on("leave-chapter", ({ chapterId }: { chapterId: number }) => {
    leaveRoom(chapterId);
  });

  socket.on("disconnect", () => {
    const chapterId = (socket as any).chapterId;
    if (chapterId) {
      leaveRoom(chapterId);
    }
  });
};
