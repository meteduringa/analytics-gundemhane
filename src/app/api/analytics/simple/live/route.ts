import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { getIstanbulDayRange } from "@/lib/bik-time";
import { computeSimpleDayMetrics } from "@/lib/analytics-simple";

export const runtime = "nodejs";
const LIVE_REFRESH_MS = 30_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");

  if (!siteId) {
    return NextResponse.json({ error: "siteId zorunludur." }, { status: 400 });
  }

  const cacheKey = `simple:live:clean:${siteId}`;

  try {
    const redis = await getRedis();
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return NextResponse.json(JSON.parse(cached), {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        });
      }
    }
  } catch {
    // Ignore cache errors.
  }

  const now = new Date();
  const { start } = getIstanbulDayRange(now);
  let record = await prisma.analyticsDailySimple.findUnique({
    where: {
      siteId_day: {
        siteId,
        day: start,
      },
    },
  });

  const shouldRefresh =
    !record || now.getTime() - record.updatedAt.getTime() >= LIVE_REFRESH_MS;
  if (shouldRefresh) {
    const computed = await computeSimpleDayMetrics(siteId, now);
    record = await prisma.analyticsDailySimple.upsert({
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
  }

  const istanbulFormatter = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const asOfLocal = istanbulFormatter.format(now);
  const dayStartLocal = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(start);

  const payload = {
    siteId,
    day: start.toISOString().split("T")[0],
    day_start_local: dayStartLocal,
    as_of_local: asOfLocal,
    as_of_utc: now.toISOString(),
    record_updated_at: record?.updatedAt?.toISOString() ?? null,
    daily_unique_users: record?.dailyUniqueUsers ?? 0,
    daily_direct_unique_users: record?.dailyDirectUniqueUsers ?? 0,
    daily_pageviews: record?.dailyPageviews ?? 0,
    daily_avg_time_on_site_seconds_per_unique:
      record?.dailyAvgTimeOnSiteSecondsPerUnique ?? 0,
    daily_popcent_unique_users: 0,
    daily_popcent_pageviews: 0,
  };

  try {
    const redis = await getRedis();
    if (redis) {
      await redis.set(cacheKey, JSON.stringify(payload), { EX: 20 });
    }
  } catch {
    // Ignore cache errors.
  }

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
