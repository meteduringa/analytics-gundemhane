import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDayParam } from "@/lib/bik-time";
import { computeSimpleDayMetrics } from "@/lib/analytics-simple";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const siteId = String(payload.siteId ?? "");
  const dateParam = payload.date ?? null;

  if (!siteId) {
    return NextResponse.json({ error: "siteId zorunludur." }, { status: 400 });
  }

  const dayDate = parseDayParam(dateParam) ?? new Date();
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
