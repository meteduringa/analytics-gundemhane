import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDayParam } from "@/lib/bik-time";
import { computeSimpleDayMetrics } from "@/lib/analytics-simple";
import { getIstanbulDayRange } from "@/lib/bik-time";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  const dateParam = searchParams.get("date");

  if (!siteId) {
    return NextResponse.json({ error: "siteId zorunludur." }, { status: 400 });
  }

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

  const popcentHostList = Prisma.join(
    [
      "ppcnt.org",
      "ppcnt.net",
      "ppcnt.live",
      "ppcnt.us",
      "ppcnt.co",
      "ppcnt.eu",
      "popcent.org",
      "flarby.com",
    ].map((host) => Prisma.sql`${host}`),
    ", "
  );

  const popcentCounts = (await prisma.$queryRaw`
    SELECT
      COUNT(*) AS total_events,
      COUNT(DISTINCT "visitorId") AS unique_visitors
    FROM "analytics_events"
    WHERE "websiteId" = ${siteId}
      AND "type" = 'PAGEVIEW'
      AND (
        ("eventData"->>'pc_source' = 'popcent')
        OR ("eventData"->>'source_website_id' IS NOT NULL AND "eventData"->>'source_website_id' <> '')
        OR (COALESCE(NULLIF(regexp_replace("referrer", '^https?://([^/]+)/?.*$', '\\1'), ''), '') IN (${popcentHostList}))
      )
      AND (
        ("createdAt" >= ${start} AND "createdAt" <= ${end})
        OR ("clientTimestamp" >= ${start} AND "clientTimestamp" <= ${end})
      );
  `) as { total_events: bigint; unique_visitors: bigint }[];

  const popcentSummary = popcentCounts[0] ?? {
    total_events: BigInt(0),
    unique_visitors: BigInt(0),
  };

  if (existing && !isToday) {
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
    });
  }
  if (existing && isToday) {
    const staleAfterMs = 2 * 60 * 1000;
    const isFresh = now.getTime() - existing.updatedAt.getTime() < staleAfterMs;
    if (isFresh) {
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
      });
    }
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
    as_of_utc: now.toISOString(),
    record_updated_at: saved.updatedAt.toISOString(),
    daily_unique_users: saved.dailyUniqueUsers,
    daily_direct_unique_users: saved.dailyDirectUniqueUsers,
    daily_pageviews: saved.dailyPageviews,
    daily_avg_time_on_site_seconds_per_unique:
      saved.dailyAvgTimeOnSiteSecondsPerUnique,
    daily_popcent_unique_users: Number(popcentSummary.unique_visitors),
    daily_popcent_pageviews: Number(popcentSummary.total_events),
  });
}
