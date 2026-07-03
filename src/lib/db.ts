import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import path from "path";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Resolve SQLite path mismatch: we force an absolute path to prisma/dev.db if using SQLite
let dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/postgres";

console.log(`[Database Client] Connecting to database provider with URL: ${dbUrl.split("@")[1] || dbUrl}`);

export const db =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasourceUrl: dbUrl,
    log: ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
