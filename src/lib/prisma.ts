import { PrismaClient } from "@prisma/client";

const normalizeQuotedEnv = (key: string) => {
  const value = process.env[key];
  if (!value) return;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    process.env[key] = value.slice(1, -1);
  }
};

normalizeQuotedEnv("DATABASE_URL");

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
