import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const CHECK_TIMEOUT_MS = 1500;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "health-check-failed";

const withTimeout = async (label: string, check: () => Promise<unknown>) => {
  const startedAt = Date.now();
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`${label} timeout after ${CHECK_TIMEOUT_MS}ms`)),
          CHECK_TIMEOUT_MS
        );
      }),
    ]);
    return { ok: true, durationMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      error: errorMessage(error),
    };
  }
};

export async function GET() {
  const [database, redis] = await Promise.all([
    withTimeout("database", () => prisma.$queryRaw`SELECT 1`),
    withTimeout("redis", async () => {
      const client = await getRedis();
      await client.ping();
    }),
  ]);

  return NextResponse.json(
    {
      ok: true,
      service: "analytics",
      time: new Date().toISOString(),
      dependenciesOk: database.ok && redis.ok,
      dependencies: { database, redis },
    },
    { status: 200 }
  );
}
