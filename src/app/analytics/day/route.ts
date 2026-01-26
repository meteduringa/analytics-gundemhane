import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDayParam } from "@/lib/bik-time";
import { getBikDayMetrics } from "@/lib/bik-metrics";
import { getBikStrictDayMetrics } from "@/lib/bik-strict-metrics";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("site_id");
  const dateParam = searchParams.get("date");

  if (!siteId) {
    return NextResponse.json({ error: "site_id zorunludur." }, { status: 400 });
  }

  const dayDate = parseDayParam(dateParam) ?? new Date();
  const [metrics, strictMetrics] = await Promise.all([
    getBikDayMetrics(siteId, dayDate),
    getBikStrictDayMetrics(siteId, dayDate),
  ]);

  await prisma.bIKRollupDay.upsert({
    where: {
      websiteId_day: {
        websiteId: siteId,
        day: new Date(`${metrics.date}T00:00:00+03:00`),
      },
    },
    create: {
      websiteId: siteId,
      day: new Date(`${metrics.date}T00:00:00+03:00`),
      dailyUniqueVisitors: metrics.daily_unique_visitors,
      dailyDirectUniqueVisitors: metrics.daily_direct_unique_visitors,
      dailySessions: metrics.daily_sessions,
      dailyPageviews: metrics.daily_pageviews,
      dailyAvgTimeOnSiteSeconds: metrics.daily_avg_time_on_site_seconds,
      directRatio: metrics.direct_ratio,
      foreignAdjustmentApplied: metrics.category === "GENEL",
      category: metrics.category,
    },
    update: {
      dailyUniqueVisitors: metrics.daily_unique_visitors,
      dailyDirectUniqueVisitors: metrics.daily_direct_unique_visitors,
      dailySessions: metrics.daily_sessions,
      dailyPageviews: metrics.daily_pageviews,
      dailyAvgTimeOnSiteSeconds: metrics.daily_avg_time_on_site_seconds,
      directRatio: metrics.direct_ratio,
      foreignAdjustmentApplied: metrics.category === "GENEL",
      category: metrics.category,
    },
  });

  return NextResponse.json({
    site_id: siteId,
    ...metrics,
    ...strictMetrics,
  });
}
