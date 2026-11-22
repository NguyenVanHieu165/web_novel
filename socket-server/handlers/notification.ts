import { Socket, Server } from "socket.io";
import { requireSocketRole, type SocketSession } from "../auth/socketAuth";

export const registerNotificationHandlers = (io: Server, socket: Socket) => {
  const session = socket.data.session as SocketSession | undefined;
  if (session) void socket.join(`user:${session.idTaiKhoan}`);
  socket.on("join-admin-room", () => {
    if (!requireSocketRole(socket, "admin")) {
      socket.emit("authorization-error", { message: "Admin role required" });
      return;
    }

    socket.join("admins");
  });
};
