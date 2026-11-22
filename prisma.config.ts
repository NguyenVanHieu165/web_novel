import "dotenv/config";
import { defineConfig } from "prisma/config";

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    let url = process.env.DATABASE_URL;
    const isTiDb = url.includes("tidbcloud.com") || process.env.DATABASE_SSL === "true";
    if (isTiDb && !url.includes("sslaccept=")) {
      const sep = url.includes("?") ? "&" : "?";
      url = `${url}${sep}sslaccept=strict`;
    }
    return url;
  }

  const host = process.env.DATABASE_HOST || "127.0.0.1";
  const port = process.env.DATABASE_PORT || (host.includes("tidbcloud.com") ? "4000" : "3306");
  const user = process.env.DATABASE_USER || "root";
  const password = process.env.DATABASE_PASSWORD ? encodeURIComponent(process.env.DATABASE_PASSWORD) : "";
  const database = process.env.DATABASE_NAME || "web_novel";
  const isSsl = process.env.DATABASE_SSL === "true" || host.includes("tidbcloud.com");
  const sslParam = isSsl ? "?sslaccept=strict" : "";

  return `mysql://${user}:${password}@${host}:${port}/${database}${sslParam}`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: getDatabaseUrl(),
  },
});
