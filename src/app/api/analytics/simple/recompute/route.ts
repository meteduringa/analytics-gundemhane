import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDayParam } from "@/lib/bik-time";
import { getIstanbulDayRange } from "@/lib/bik-time";
import { getRedis } from "@/lib/redis";
import {
  saveSimpleDayMetrics,
  simpleRecomputeLockKey,
} from "@/lib/analytics-simple-cache";

export const runtime = "nodejs";

const canonicalSiteId = (siteId: string) => {
  const aliases: Record<string, string> = {
    gercekfethiye: "66b31527-c90e-41ec-9a67-6d003aeee99e",
    "4a2d21db-fb88-4445-883b-19e0b7e7deb0":
      "66b31527-c90e-41ec-9a67-6d003aeee99e",
    "d60207c2-9aa1-4fa8-9de4-6b8464be63ac":
      "66b31527-c90e-41ec-9a67-6d003aeee99e",
  };
  return aliases[siteId] ?? siteId;
};

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const siteIdParam = String(payload.siteId ?? "");
  const dateParam = payload.date ?? null;

  if (!siteIdParam) {
    return NextResponse.json({ error: "siteId zorunludur." }, { status: 400 });
  }
  const siteId = canonicalSiteId(siteIdParam);

  const dayDate = parseDayParam(dateParam) ?? new Date();
  const { start: dayStart, dayString } = getIstanbulDayRange(dayDate);
  const lockKey = simpleRecomputeLockKey(siteId, dayStart);
  const lockValue = `${process.pid}:${Date.now()}`;
  const redis = await getRedis().catch(() => null);

  if (redis) {
    const acquired = await redis.set(lockKey, lockValue, {
      NX: true,
      EX: 180,
    });
    if (!acquired) {
      const existing = await prisma.analyticsDailySimple.findUnique({
        where: {
          siteId_day: {
            siteId,
            day: dayStart,
          },
        },
      });

      return NextResponse.json(
        {
          siteId,
          day: dayStart.toISOString().split("T")[0],
          in_progress: true,
          record_updated_at: existing?.updatedAt?.toISOString() ?? null,
          daily_unique_users: existing?.dailyUniqueUsers ?? 0,
          daily_direct_unique_users: existing?.dailyDirectUniqueUsers ?? 0,
          daily_pageviews: existing?.dailyPageviews ?? 0,
          daily_avg_time_on_site_seconds_per_unique:
            existing?.dailyAvgTimeOnSiteSecondsPerUnique ?? 0,
        },
        { status: 202 }
      );
    }
  }

  try {
    const saved = await saveSimpleDayMetrics(siteId, dayDate);

    return NextResponse.json({
      siteId,
      day: dayString,
      daily_unique_users: saved.dailyUniqueUsers,
      daily_direct_unique_users: saved.dailyDirectUniqueUsers,
      daily_pageviews: saved.dailyPageviews,
      daily_avg_time_on_site_seconds_per_unique:
        saved.dailyAvgTimeOnSiteSecondsPerUnique,
    });
  } finally {
    if (redis) {
      await redis.del(lockKey).catch(() => undefined);
    }
  }
}
