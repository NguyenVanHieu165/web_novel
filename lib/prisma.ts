import "dotenv/config";
import type { SecureContextOptions } from "tls";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../app/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

interface DatabaseConnectionConfig {
    host: string;
    port: number;
    user: string;
    password?: string;
    database: string;
    ssl?: boolean | (SecureContextOptions & { rejectUnauthorized?: boolean });
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

    return {
        host,
        port,
        user,
        password,
        database,
        ssl,
    };
}

function createPrismaClient() {
    const dbConfig = resolveConnectionConfig();
    const adapter = new PrismaMariaDb({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        ssl: dbConfig.ssl,
        connectionLimit: Number(process.env.DATABASE_CONNECTION_LIMIT) || (process.env.VERCEL ? 3 : 10),
        connectTimeout: Number(process.env.DATABASE_CONNECT_TIMEOUT) || 15000,
    });

    return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
    });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = prisma;
