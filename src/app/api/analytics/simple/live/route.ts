import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIstanbulDayRange } from "@/lib/bik-time";
import { computeSimpleDayMetrics } from "@/lib/analytics-simple";

export const runtime = "nodejs";

const LIVE_CACHE_MAX_AGE_MS = 60_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");

  if (!siteId) {
    return NextResponse.json({ error: "siteId zorunludur." }, { status: 400 });
  }

  const { start } = getIstanbulDayRange(new Date());
  let record = await prisma.analyticsDailySimple.findUnique({
    where: {
      siteId_day: {
        siteId,
        day: start,
      },
    },
  });

  const now = new Date();
  const shouldRefresh =
    !record || now.getTime() - record.updatedAt.getTime() > LIVE_CACHE_MAX_AGE_MS;
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

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
