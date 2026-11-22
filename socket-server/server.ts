import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { authenticateSocket, confirmSocketAdministrator, monitorSocketAdministrator, type SocketSession } from "./auth/socketAuth";

dotenv.config();
dotenv.config({ path: "../.env" });

const app = express();

// Cấu hình các cổng và nguồn đáng tin cậy
const PORT: number = Number(process.env.PORT) || 3001;
const ALLOWED_ORIGINS: string[] = (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",");
const SECRET_TOKEN = process.env.INTERNAL_SECRET_TOKEN;
if (!SECRET_TOKEN) {
    throw new Error("INTERNAL_SECRET_TOKEN is required");
}
app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: true
}));
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, {
    maxHttpBufferSize: 256 * 1024,
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"],
        credentials: true
    }
});

io.use(async (socket, next) => {
    try {
        const session = await authenticateSocket(socket);
        if (session.roles.includes("admin") && !await confirmSocketAdministrator(socket, session)) {
            return next(new Error("Unauthorized"));
        }
        socket.data.session = session;
        next();
    } catch {
        next(new Error("Unauthorized"));
    }
});
import { dispatchInternalNotification } from "./handlers/notificationDispatch";
import { registerNotificationHandlers } from "./handlers/notification";
import { registerCollaborativeHandlers } from "./handlers/collaborative";

// Quản lý các kết nối Socket.IO
io.on("connection", (socket: Socket) => {
    monitorSocketAdministrator(socket, socket.data.session as SocketSession);

    // Đăng ký các Handler
    registerNotificationHandlers(io, socket);
    registerCollaborativeHandlers(io, socket);

});

// Endpoint HTTP để Next.js API gửi tin nhắn kích hoạt thông báo
app.post("/api/trigger-notification", (req: Request<Record<string, never>, unknown, unknown>, res: Response) => {
    const authHeader = req.headers["authorization"];

    // Kiểm tra Secret Token bảo mật tránh spam thông báo
    if (!authHeader || authHeader !== `Bearer ${SECRET_TOKEN}`) {
        console.warn("[Auth] Unauthorized trigger request attempt");
        return res.status(401).json({ success: false, message: "Unauthorized token" });
    }

    if (!dispatchInternalNotification(io, req.body)) {
        return res.status(400).json({ success: false, message: "Invalid notification payload" });
    }

    return res.json({ success: true, message: "Notification broadcasted successfully" });
});

// Khởi chạy server
httpServer.listen(PORT, () => {
});
