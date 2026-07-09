import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIstanbulDayRange, parseDayParam } from "@/lib/bik-time";
import { computeSimpleDayMetrics } from "@/lib/analytics-simple";
import { readPanelSession } from "@/lib/panel-session";

export const runtime = "nodejs";

const metricDiff = (oldValue: number, newValue: number) => {
  const delta = newValue - oldValue;
  return {
    delta,
    percent: oldValue > 0 ? Math.round((delta / oldValue) * 1000) / 10 : null,
  };
};

export async function GET(request: Request) {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  const dateParam = searchParams.get("date");

  if (!siteId) {
    return NextResponse.json({ error: "siteId zorunludur." }, { status: 400 });
  }

  const website = await prisma.analyticsWebsite.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      name: true,
      siteUrl: true,
      primaryDomain: true,
      allowedDomains: true,
    },
  });

  if (!website) {
    return NextResponse.json({ error: "Site bulunamadı." }, { status: 404 });
  }

  const dayDate = parseDayParam(dateParam) ?? new Date();
  const { dayString, start, end } = getIstanbulDayRange(dayDate);

  const [oldMetrics, newMetrics, eventCounts] = await Promise.all([
    computeSimpleDayMetrics(siteId, dayDate, "RAW"),
    computeSimpleDayMetrics(siteId, dayDate, "BIK_STRICT"),
    prisma.analyticsEvent.groupBy({
      by: ["mode", "type"],
      where: {
        websiteId: siteId,
        mode: { in: ["RAW", "BIK_STRICT"] },
        createdAt: { gte: start, lte: end },
      },
      _count: { _all: true },
    }),
  ]);

  const countFor = (mode: string, type: "PAGEVIEW" | "EVENT") =>
    eventCounts.find((row) => row.mode === mode && row.type === type)?._count._all ?? 0;

  return NextResponse.json({
    site: website,
    day: dayString,
    as_of_utc: new Date().toISOString(),
    old: {
      label: "Eski Elmas",
      daily_unique_users: oldMetrics.daily_unique_users,
      daily_direct_unique_users: oldMetrics.daily_direct_unique_users,
      daily_pageviews: oldMetrics.daily_pageviews,
      daily_avg_time_on_site_seconds_per_unique:
        oldMetrics.daily_avg_time_on_site_seconds_per_unique,
      raw_pageview_events: countFor("RAW", "PAGEVIEW"),
      raw_ping_events: countFor("RAW", "EVENT"),
    },
    new: {
      label: "Yeni BİK Test",
      daily_unique_users: newMetrics.daily_unique_users,
      daily_direct_unique_users: newMetrics.daily_direct_unique_users,
      daily_pageviews: newMetrics.daily_pageviews,
      daily_avg_time_on_site_seconds_per_unique:
        newMetrics.daily_avg_time_on_site_seconds_per_unique,
      strict_pageview_events: countFor("BIK_STRICT", "PAGEVIEW"),
      strict_ping_events: countFor("BIK_STRICT", "EVENT"),
    },
    diff: {
      daily_unique_users: metricDiff(
        oldMetrics.daily_unique_users,
        newMetrics.daily_unique_users
      ),
      daily_direct_unique_users: metricDiff(
        oldMetrics.daily_direct_unique_users,
        newMetrics.daily_direct_unique_users
      ),
      daily_pageviews: metricDiff(
        oldMetrics.daily_pageviews,
        newMetrics.daily_pageviews
      ),
      daily_avg_time_on_site_seconds_per_unique: metricDiff(
        oldMetrics.daily_avg_time_on_site_seconds_per_unique,
        newMetrics.daily_avg_time_on_site_seconds_per_unique
      ),
    },
  });
}
