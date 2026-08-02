import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";

dotenv.config();

const app = express();

// Cấu hình các cổng và nguồn đáng tin cậy
const PORT: number = Number(process.env.PORT) || 3001;
const ALLOWED_ORIGINS: string[] = (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",");
const SECRET_TOKEN: string = process.env.INTERNAL_SECRET_TOKEN || "super-secret-token";
app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: true
}));
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"],
        credentials: true
    }
});
// Định nghĩa kiểu dữ liệu cho thông báo gửi đến từ Next.js
interface NotificationPayload {
    type: string;
    category?: string;
    priority?: "urgent" | "warning" | "success" | "normal";
    title?: string;
    message: string;
    data?: Record<string, any>;
}

import { registerNotificationHandlers } from "./handlers/notification";
import { registerCollaborativeHandlers } from "./handlers/collaborative";

// Quản lý các kết nối Socket.IO
io.on("connection", (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Đăng ký các Handler
    registerNotificationHandlers(io, socket);
    registerCollaborativeHandlers(io, socket);

    socket.on("disconnect", (reason: string) => {
        console.log(`[Socket] Client disconnected: ${socket.id} (Reason: ${reason})`);
    });
});

// Endpoint HTTP để Next.js API gửi tin nhắn kích hoạt thông báo
app.post("/api/trigger-notification", (req: Request<{}, {}, NotificationPayload>, res: Response) => {
    const authHeader = req.headers["authorization"];

    // Kiểm tra Secret Token bảo mật tránh spam thông báo
    if (!authHeader || authHeader !== `Bearer ${SECRET_TOKEN}`) {
        console.warn("[Auth] Unauthorized trigger request attempt");
        return res.status(401).json({ success: false, message: "Unauthorized token" });
    }

    const { type, category, priority, title, message, data } = req.body;

    if (!type || !message) {
        return res.status(400).json({ success: false, message: "Missing type or message" });
    }

    console.log(`[Notification] Triggering '${type}' [Category: ${category}] [Priority: ${priority}]: ${message}`);

    // Phát tín hiệu WebSocket cho tất cả admin đã join room
    io.to("admins").emit("notification", {
        type,
        category: category || "follow",
        priority: priority || "normal",
        title: title || "Thông báo mới",
        message,
        data: data || {},
        timestamp: new Date()
    });

    return res.json({ success: true, message: "Notification broadcasted successfully" });
});

// Khởi chạy server
httpServer.listen(PORT, () => {
    console.log(`[Server] Socket.IO Server is running on TS on port ${PORT}`);
    console.log(`[Server] Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
