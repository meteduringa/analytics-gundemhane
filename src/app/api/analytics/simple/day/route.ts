import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDayParam } from "@/lib/bik-time";
import { getIstanbulDayRange } from "@/lib/bik-time";
import {
  refreshSimpleDayMetricsWithLock,
  startSimpleDayMetricsRefresh,
} from "@/lib/analytics-simple-cache";

export const runtime = "nodejs";

const TODAY_CACHE_MAX_AGE_MS = 60_000;
const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteIdParam = searchParams.get("siteId");
  const dateParam = searchParams.get("date");

  if (!siteIdParam) {
    return NextResponse.json({ error: "siteId zorunludur." }, { status: 400 });
  }
  const siteId = canonicalSiteId(siteIdParam);

  const dayDate = parseDayParam(dateParam) ?? new Date();
  const { dayString, start, end } = getIstanbulDayRange(dayDate);
  const now = new Date();
  const isToday =
    now >= start && now <= end;
  const existing = await prisma.analyticsDailySimple.findUnique({
    where: {
      siteId_day: {
        siteId,
        day: start,
      },
    },
  });

  const popcentSummary = {
    total_events: BigInt(0),
    unique_visitors: BigInt(0),
  };

  const existingIsFreshEnough =
    existing &&
    (!isToday ||
      now.getTime() - existing.updatedAt.getTime() <= TODAY_CACHE_MAX_AGE_MS);

  if (existingIsFreshEnough) {
    return NextResponse.json({
      siteId,
      day: dayString,
      as_of_utc: now.toISOString(),
      record_updated_at: existing.updatedAt.toISOString(),
      daily_unique_users: existing.dailyUniqueUsers,
      daily_direct_unique_users: existing.dailyDirectUniqueUsers,
      daily_pageviews: existing.dailyPageviews,
      daily_avg_time_on_site_seconds_per_unique:
        existing.dailyAvgTimeOnSiteSecondsPerUnique,
      daily_popcent_unique_users: Number(popcentSummary.unique_visitors),
      daily_popcent_pageviews: Number(popcentSummary.total_events),
      refresh_in_progress: false,
    }, { headers: noStoreHeaders });
  }
  if (existing) {
    const refresh = await startSimpleDayMetricsRefresh({ siteId, dayDate });
    return NextResponse.json({
      siteId,
      day: dayString,
      as_of_utc: now.toISOString(),
      record_updated_at: existing.updatedAt.toISOString(),
      daily_unique_users: existing.dailyUniqueUsers,
      daily_direct_unique_users: existing.dailyDirectUniqueUsers,
      daily_pageviews: existing.dailyPageviews,
      daily_avg_time_on_site_seconds_per_unique:
        existing.dailyAvgTimeOnSiteSecondsPerUnique,
      daily_popcent_unique_users: Number(popcentSummary.unique_visitors),
      daily_popcent_pageviews: Number(popcentSummary.total_events),
      refresh_in_progress: refresh.refreshInProgress,
    }, { headers: noStoreHeaders });
  }

  const refresh = await refreshSimpleDayMetricsWithLock({
    siteId,
    dayDate,
    existing,
  });
  const saved = refresh.record;

  return NextResponse.json({
    siteId,
    day: dayString,
    as_of_utc: now.toISOString(),
    record_updated_at: saved?.updatedAt.toISOString() ?? null,
    daily_unique_users: saved?.dailyUniqueUsers ?? 0,
    daily_direct_unique_users: saved?.dailyDirectUniqueUsers ?? 0,
    daily_pageviews: saved?.dailyPageviews ?? 0,
    daily_avg_time_on_site_seconds_per_unique:
      saved?.dailyAvgTimeOnSiteSecondsPerUnique ?? 0,
    daily_popcent_unique_users: Number(popcentSummary.unique_visitors),
    daily_popcent_pageviews: Number(popcentSummary.total_events),
    refresh_in_progress: refresh.refreshInProgress,
  }, {
    headers: noStoreHeaders,
    status: saved ? 200 : 202,
  });
}
