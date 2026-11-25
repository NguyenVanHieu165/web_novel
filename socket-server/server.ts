import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { z } from "zod";
import { authenticateSocket, confirmSocketAdministrator, monitorSocketAdministrator, type SocketSession } from "./auth/socketAuth";
import { isInternalStatsRequestAuthorized, OnlinePresenceTracker } from "./onlineStats";

dotenv.config();
dotenv.config({ path: "../.env" });

const app = express();
app.disable("x-powered-by");

// Cấu hình các cổng và nguồn đáng tin cậy
const PORT: number = Number(process.env.PORT) || 3001;
const REQUIRED_ALLOWED_ORIGINS = [
    "https://web-novel-ete3.vercel.app",
    "http://localhost:3000",
] as const;
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/web-novel-ete3-.*\.vercel\.app$/;
const configuredOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const ALLOWED_ORIGINS: Array<string | RegExp> = [
    ...new Set([...REQUIRED_ALLOWED_ORIGINS, ...configuredOrigins]),
    VERCEL_PREVIEW_ORIGIN,
];
const SECRET_TOKEN = process.env.INTERNAL_SECRET_TOKEN;
if (!SECRET_TOKEN) {
    throw new Error("INTERNAL_SECRET_TOKEN is required");
}
app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: true
}));
app.use(express.json());
const wakeJobSchema = z.object({ jobId: z.string().uuid() }).strict();
const httpServer = createServer(app);
const onlinePresence = new OnlinePresenceTracker();
const io = new Server(httpServer, {
    maxHttpBufferSize: 256 * 1024,
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.get("/healthz", (_req: Request, res: Response) => {
    return res.json({ status: "ok", service: "web-novel-realtime", connections: io.engine.clientsCount });
});

app.get("/readyz", (_req: Request, res: Response) => {
    return res.json({ status: "ready", service: "web-novel-realtime" });
});

app.get("/internal/online-stats", (req: Request, res: Response) => {
    if (!isInternalStatsRequestAuthorized(req.headers["x-internal-token"], SECRET_TOKEN)) {
        return res.status(401).json({ success: false, message: "Unauthorized token" });
    }
    return res.set("Cache-Control", "no-store").json(onlinePresence.snapshot());
});

io.use(async (socket, next) => {
    try {
        const session = await authenticateSocket(socket);
        if (session?.roles.includes("admin") && !await confirmSocketAdministrator(socket, session)) {
            return next(new Error("Unauthorized"));
        }
        socket.data.session = session;
        socket.data.userId = session?.idTaiKhoan ?? null;
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
    const session = socket.data.session as SocketSession | null;
    onlinePresence.connect(socket.id, session?.idTaiKhoan ?? null);
    socket.once("disconnect", () => onlinePresence.disconnect(socket.id));
    monitorSocketAdministrator(socket, session);

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

// A successful request wakes a sleeping Render web service. TiDB remains the
// source of truth; the worker will claim the job on its next bounded poll.
app.post("/api/internal/jobs/wake", (req: Request<Record<string, never>, unknown, unknown>, res: Response) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader || authHeader !== `Bearer ${SECRET_TOKEN}`) {
        return res.status(401).json({ success: false, message: "Unauthorized token" });
    }
    const parsed = wakeJobSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ success: false, message: "Invalid job wake payload" });
    }
    return res.status(202).json({
        success: true,
        jobId: parsed.data.jobId,
        workerEnabled: process.env.WORKER_ENABLED !== "false",
    });
});

// Khởi chạy server
httpServer.listen(PORT, () => {
    console.info(`[realtime] listening on port ${PORT}`);
});

let shuttingDown = false;
function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[realtime] received ${signal}, closing connections`);
    io.close(() => {
        httpServer.close(() => { process.exit(0); });
    });
    setTimeout(() => process.exit(1), 10_000).unref();
}
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
