import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { jwtVerify } from "jose";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { chunkChapterText } from "./tts/chunker";
import { getOrCreateAudio, type TtsVoice } from "./tts/audioCache";
import { loadWorkerConfig } from "./jobs/config";
import { createJobPool } from "./jobs/database";
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
const ttsVoiceSchema = z.enum(["vi-VN-HoaiMyNeural", "vi-VN-NamMinhNeural"]).default("vi-VN-HoaiMyNeural");
const chapterIdSchema = z.string().regex(/^[1-9]\d*$/u).transform(Number).pipe(z.number().int().positive().max(2_147_483_647));
const ttsPool = createJobPool(loadWorkerConfig().database);
async function identifyTtsUser(req: Request): Promise<number | null> {
    const cookie = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("token="));
    const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;
    const token = cookie ? decodeURIComponent(cookie.slice("token=".length)) : bearer;
    if (!token || !process.env.JWT_SECRET) return null;
    try {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET));
        const id = payload.idTaiKhoan;
        return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
    } catch { return null; }
}
async function loadChapter(chapterId: number, userId: number | null) {
    const rows = await ttsPool.query<Array<{ idChuong: number; idTruyen: number; title: string; isFree: number | boolean | null; giaXu: number | null; content: string | null }>>(
        `SELECT c.idCHUONG AS idChuong, c.idTRUYEN AS idTruyen, c.tieu_de_chuong AS title, c.is_free AS isFree, c.gia_xu AS giaXu, n.noi_dung AS content
         FROM chuong c LEFT JOIN noi_dung_chuong n ON n.idCHUONG = c.idCHUONG
         WHERE c.idCHUONG = ? AND (c.is_deleted = 0 OR c.is_deleted IS NULL) LIMIT 1`, [chapterId]);
    const chapter = rows[0];
    if (!chapter) return { status: 404 as const };
    if (chapter.isFree === false || chapter.isFree === 0 || (chapter.giaXu ?? 0) > 0) {
        if (!userId) return { status: 401 as const };
        const accounts = await ttsPool.query<Array<{ validUser: number | boolean; purchased: number | boolean; isAdmin: number | boolean }>>(
            `SELECT EXISTS(SELECT 1 FROM chuong_da_mua WHERE idTAI_KHOAN = ? AND idCHUONG = ?) AS purchased,
             EXISTS(SELECT 1 FROM tai_khoan tk JOIN vai_tro_nguoi_dung tv ON tv.idTAI_KHOAN=tk.idTAI_KHOAN JOIN vai_tro v ON v.idVAI_TRO=tv.idVAI_TRO WHERE tk.idTAI_KHOAN=? AND v.ten_vai_tro='admin') AS isAdmin`, [userId, userId, chapterId, userId]);
        const account = accounts[0];
        if (!account?.validUser || (!account.purchased && !account.isAdmin)) return { status: 403 as const };
    }
    if (!chapter.content?.trim()) return { status: 404 as const };
    return { status: 200 as const, chapter: { ...chapter, content: chapter.content } };
}
async function synthesizeChunk(text: string, voice: TtsVoice): Promise<Buffer> {
    const tts = new MsEdgeTTS({ connectionTimeoutMs: 12_000, synthesisTimeoutMs: 15_000 });
    try {
        await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        const { audioStream } = tts.rawToStream(`<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="vi-VN"><voice name="${voice}">${text.replace(/[<>&]/gu, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char] ?? char)}</voice></speak>`);
        const parts: Buffer[] = [];
        for await (const part of audioStream) parts.push(Buffer.isBuffer(part) ? part : Buffer.from(part));
        const buffer = Buffer.concat(parts);
        if (!buffer.length) throw new Error("Edge TTS returned empty audio");
        return buffer;
    } finally { tts.close(); }
}
app.get("/api/tts/chapters/:chapterId/meta", async (req: Request, res: Response) => {
    const id = chapterIdSchema.safeParse(req.params.chapterId);
    const voice = ttsVoiceSchema.safeParse(req.query.voice);
    if (!id.success || !voice.success) return res.status(400).json({ message: "ID chương hoặc giọng đọc không hợp lệ." });
    try {
        const result = await loadChapter(id.data, await identifyTtsUser(req));
        if (result.status !== 200) return res.status(result.status).json({ message: result.status === 401 ? "Vui lòng đăng nhập để nghe chương VIP." : result.status === 403 ? "Bạn cần mở khóa chương trước khi nghe." : "Không tìm thấy chương." });
        return res.set("Cache-Control", "private, no-store").json({ chapterId: id.data, title: result.chapter.title, totalChunks: chunkChapterText(result.chapter.content).length, voice: voice.data });
    } catch (error) { console.error("[tts] chapter metadata failed", error instanceof Error ? error.name : "UNKNOWN"); return res.status(503).json({ message: "Chưa thể tải thông tin audio." }); }
});
app.get("/api/tts/chapters/:chapterId/chunk/:index", async (req: Request, res: Response) => {
    const id = chapterIdSchema.safeParse(req.params.chapterId);
    const index = z.string().regex(/^(0|[1-9]\d{0,5})$/u).transform(Number).safeParse(req.params.index);
    const voice = ttsVoiceSchema.safeParse(req.query.voice);
    if (!id.success || !index.success || !voice.success) return res.status(400).json({ message: "Tham số audio không hợp lệ." });
    try {
        const result = await loadChapter(id.data, await identifyTtsUser(req));
        if (result.status !== 200) return res.status(result.status).json({ message: result.status === 401 ? "Vui lòng đăng nhập để nghe chương VIP." : result.status === 403 ? "Bạn cần mở khóa chương trước khi nghe." : "Không tìm thấy chương." });
        const chunks = chunkChapterText(result.chapter.content);
        if (index.data >= chunks.length) return res.status(404).json({ message: "Không tìm thấy đoạn audio." });
        const { createHash } = await import("node:crypto");
        const textHash = createHash("sha256").update(chunks[index.data]).digest("hex");
        const key = `${id.data}:${voice.data}:${index.data}:${textHash}`;
        const buffer = await getOrCreateAudio(key, () => synthesizeChunk(chunks[index.data], voice.data));
        return res.status(200).set({ "Content-Type": "audio/mpeg", "Content-Length": String(buffer.length), "Cache-Control": "private, max-age=1200", "X-Content-Type-Options": "nosniff" }).send(buffer);
    } catch (error) { console.error("[tts] chunk synthesis failed", error instanceof Error ? error.name : "UNKNOWN"); return res.status(503).json({ message: "Chưa thể tạo đoạn audio. Vui lòng thử lại." }); }
});
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
        httpServer.close(() => { void ttsPool.end().finally(() => process.exit(0)); });
    });
    setTimeout(() => process.exit(1), 10_000).unref();
}
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
