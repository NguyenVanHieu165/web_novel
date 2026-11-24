import "dotenv/config";
import type { SecureContextOptions } from "tls";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import mariadb, { type Pool } from "mariadb";
import { PrismaClient } from "../app/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    prismaAdapter: PrismaMariaDb | undefined;
    prismaPool: Pool | undefined;
};

interface DatabaseConnectionConfig {
    host: string;
    port: number;
    user: string;
    password?: string;
    database: string;
    ssl?: boolean | (SecureContextOptions & { rejectUnauthorized?: boolean });
    connectionLimit: number;
    connectTimeout: number;
    acquireTimeout: number;
}

function parsePositiveInteger(value: string | null | undefined): number | undefined {
    if (!value || !/^\d+$/u.test(value)) return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function resolveConnectionConfig(): DatabaseConnectionConfig {
    let urlHost: string | undefined;
    let urlPort: number | undefined;
    let urlUser: string | undefined;
    let urlPassword: string | undefined;
    let urlDatabase: string | undefined;
    let urlSslAccept: string | null = null;
    let urlSsl: string | null = null;
    let urlSslMode: string | null = null;
    let urlConnectionLimit: number | undefined;
    let urlConnectTimeout: number | undefined;
    let urlAcquireTimeout: number | undefined;

    const rawUrl = process.env.DATABASE_URL;
    if (rawUrl) {
        try {
            // Chuẩn hóa giao thức để URL parser phân tích chính xác
            const parsed = new URL(rawUrl.replace(/^(mysql|mysql2|mariadb):/i, "http:"));
            urlHost = parsed.hostname ? decodeURIComponent(parsed.hostname) : undefined;
            urlPort = parsed.port ? Number(parsed.port) : undefined;
            urlUser = parsed.username ? decodeURIComponent(parsed.username) : undefined;
            urlPassword = parsed.password ? decodeURIComponent(parsed.password) : undefined;
            urlDatabase = parsed.pathname ? decodeURIComponent(parsed.pathname.replace(/^\//, "")) : undefined;
            urlSslAccept = parsed.searchParams.get("sslaccept");
            urlSsl = parsed.searchParams.get("ssl");
            urlSslMode = parsed.searchParams.get("sslmode");
            urlConnectionLimit = parsePositiveInteger(parsed.searchParams.get("connection_limit") ?? parsed.searchParams.get("connectionLimit"));
            urlConnectTimeout = parsePositiveInteger(parsed.searchParams.get("connect_timeout") ?? parsed.searchParams.get("connectTimeout"));
            urlAcquireTimeout = parsePositiveInteger(parsed.searchParams.get("acquire_timeout") ?? parsed.searchParams.get("acquireTimeout"));
        } catch {
            console.error("[lib/prisma] Failed to parse DATABASE_URL.");
        }
    }

    const host = process.env.DATABASE_HOST || urlHost || "127.0.0.1";
    const port = Number(process.env.DATABASE_PORT) || urlPort || (host.includes("tidbcloud.com") ? 4000 : 3306);
    const user = process.env.DATABASE_USER || urlUser || "root";
    const password = process.env.DATABASE_PASSWORD ?? urlPassword;
    const database = process.env.DATABASE_NAME || urlDatabase || "web_novel";

    // Kiểm tra cấu hình SSL/TLS cho MySQL / TiDB Cloud:
    // 1. Tắt tường minh nếu DATABASE_SSL="false" hoặc "0"
    const isExplicitlyDisabled =
        process.env.DATABASE_SSL === "false" || process.env.DATABASE_SSL === "0";

    // 2. Bật SSL nếu:
    // - DATABASE_SSL="true" / "1"
    // - DATABASE_URL chứa sslaccept=strict / sslaccept=accept_invalid_certs / ssl=true / sslmode=...
    // - Host thuộc TiDB Cloud (*.tidbcloud.com luôn bắt buộc TLS/SSL)
    // - Môi trường production với host từ xa (không phải localhost/127.0.0.1)
    const isTiDbCloud = host.includes("tidbcloud.com");
    const isSslRequired =
        isTiDbCloud ||
        (!isExplicitlyDisabled &&
        (process.env.DATABASE_SSL === "true" ||
            process.env.DATABASE_SSL === "1" ||
            urlSslAccept === "strict" ||
            urlSslAccept === "accept_invalid_certs" ||
            urlSsl === "true" ||
            urlSslMode?.toUpperCase() === "REQUIRED" ||
            urlSslMode?.toUpperCase() === "VERIFY_IDENTITY" ||
            urlSslMode?.toUpperCase() === "VERIFY_CA" ||
            isTiDbCloud ||
            (process.env.NODE_ENV === "production" &&
                host !== "localhost" &&
                host !== "127.0.0.1" &&
                host !== "::1" &&
                !host.endsWith(".local"))));

    let ssl: DatabaseConnectionConfig["ssl"] = undefined;
    if (isSslRequired) {
        // TiDB Cloud requires a verified TLS connection; never allow its
        // certificate validation to be downgraded through environment flags.
        const rejectUnauthorized = isTiDbCloud ||
            (urlSslAccept !== "accept_invalid_certs" &&
                process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false");

        ssl = {
            rejectUnauthorized,
            minVersion: "TLSv1.2",
            ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA } : {}),
        };
    }

    const configuredLimit = parsePositiveInteger(process.env.DATABASE_CONNECTION_LIMIT) ?? urlConnectionLimit ?? 10;
    const configuredConnectTimeout = parsePositiveInteger(process.env.DATABASE_CONNECT_TIMEOUT) ?? urlConnectTimeout ?? 15_000;
    const configuredAcquireTimeout = parsePositiveInteger(process.env.DATABASE_ACQUIRE_TIMEOUT) ?? urlAcquireTimeout ?? 20_000;

    return {
        host,
        port,
        user,
        password,
        database,
        ssl,
        // A supplied low value is not sufficient for this deployment's serverless fan-out.
        connectionLimit: Math.max(10, configuredLimit),
        connectTimeout: Math.min(20_000, Math.max(15_000, configuredConnectTimeout)),
        acquireTimeout: Math.min(20_000, Math.max(15_000, configuredAcquireTimeout)),
    };
}

function createPrismaPool() {
    const dbConfig = resolveConnectionConfig();
    return mariadb.createPool({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        ssl: dbConfig.ssl,
        connectionLimit: dbConfig.connectionLimit,
        connectTimeout: dbConfig.connectTimeout,
        acquireTimeout: dbConfig.acquireTimeout,
        multipleStatements: false,
        bigIntAsNumber: true,
        insertIdAsNumber: true,
        timezone: "Z",
    });
}

const prismaPool = globalForPrisma.prismaPool ?? createPrismaPool();
globalForPrisma.prismaPool = prismaPool;
const prismaAdapter = globalForPrisma.prismaAdapter ?? new PrismaMariaDb(prismaPool, { disposeExternalPool: true });
globalForPrisma.prismaAdapter = prismaAdapter;
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
    adapter: prismaAdapter,
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
});
globalForPrisma.prisma = prisma;
