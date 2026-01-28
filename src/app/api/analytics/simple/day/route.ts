import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDayParam } from "@/lib/bik-time";
import { computeSimpleDayMetrics } from "@/lib/analytics-simple";
import { getIstanbulDayRange } from "@/lib/bik-time";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  const dateParam = searchParams.get("date");

  if (!siteId) {
    return NextResponse.json({ error: "siteId zorunludur." }, { status: 400 });
  }

  const dayDate = parseDayParam(dateParam) ?? new Date();
  const { dayString, start } = getIstanbulDayRange(dayDate);
  const existing = await prisma.analyticsDailySimple.findUnique({
    where: {
      siteId_day: {
        siteId,
        day: start,
      },
    },
  });

  if (existing) {
    return NextResponse.json({
      siteId,
      day: dayString,
      daily_unique_users: existing.dailyUniqueUsers,
      daily_direct_unique_users: existing.dailyDirectUniqueUsers,
      daily_pageviews: existing.dailyPageviews,
      daily_avg_time_on_site_seconds_per_unique:
        existing.dailyAvgTimeOnSiteSecondsPerUnique,
    });
  }

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
}
