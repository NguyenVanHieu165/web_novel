import { Socket, Server } from "socket.io";

export const registerNotificationHandlers = (io: Server, socket: Socket) => {
  socket.on("join-admin-room", () => {
    socket.join("admins");
    console.log(`[Socket] Socket ${socket.id} joined 'admins' room`);
  });
};
