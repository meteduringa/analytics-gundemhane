import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDayParam } from "@/lib/bik-time";
import { computeSimpleDayMetrics } from "@/lib/analytics-simple";
import { getIstanbulDayRange } from "@/lib/bik-time";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const siteId = String(payload.siteId ?? "");
  const dateParam = payload.date ?? null;

  if (!siteId) {
    return NextResponse.json({ error: "siteId zorunludur." }, { status: 400 });
  }

  const dayDate = parseDayParam(dateParam) ?? new Date();
  const { start: dayStart } = getIstanbulDayRange(dayDate);
  const lockKey = `simple:recompute:lock:${siteId}:${dayStart.toISOString()}`;
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
    const computed = await computeSimpleDayMetrics(siteId, dayDate);

    const saved = await prisma.analyticsDailySimple.upsert({
      where: {
        siteId_day: {
          siteId,
          day: computed.dayStart,
        },
      },
      create: {
        siteId,
        day: computed.dayStart,
        dailyUniqueUsers: computed.daily_unique_users,
        dailyDirectUniqueUsers: computed.daily_direct_unique_users,
        dailyPageviews: computed.daily_pageviews,
        dailyAvgTimeOnSiteSecondsPerUnique:
          computed.daily_avg_time_on_site_seconds_per_unique,
      },
      update: {
        dailyUniqueUsers: computed.daily_unique_users,
        dailyDirectUniqueUsers: computed.daily_direct_unique_users,
        dailyPageviews: computed.daily_pageviews,
        dailyAvgTimeOnSiteSecondsPerUnique:
          computed.daily_avg_time_on_site_seconds_per_unique,
      },
    });

    return NextResponse.json({
      siteId,
      day: computed.dayString,
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
