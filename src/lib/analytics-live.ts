import { prisma } from "@/lib/prisma";
import { getIstanbulDayRange } from "@/lib/bik-time";
import { Prisma } from "@prisma/client";

export type LiveMetrics = {
  siteId: string;
  day: string;
  dayStart: Date;
  dayEnd: Date;
  totalEvents: number;
  uniqueVisitors: number;
  directUniqueVisitors: number;
  popcentTotalEvents: number;
  popcentUniqueVisitors: number;
};

export const computeLiveMetrics = async (siteId: string): Promise<LiveMetrics> => {
  const { start, dayString } = getIstanbulDayRange(new Date());
  const nowUtc = Prisma.sql`(now() AT TIME ZONE 'UTC')`;

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

  const [totals] = (await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS total_events,
      COUNT(DISTINCT "visitorId")::int AS unique_visitors,
      COUNT(DISTINCT CASE WHEN COALESCE("referrer", '') = '' THEN "visitorId" END)::int AS direct_unique_visitors
    FROM "analytics_events"
    WHERE "websiteId" = ${siteId}
      AND "type" = 'PAGEVIEW'
      AND "mode" = 'RAW'
      AND "createdAt" >= ${start}
      AND "createdAt" <= ${nowUtc};
  `) as {
    total_events: number;
    unique_visitors: number;
    direct_unique_visitors: number;
  }[];

  const [popcent] = (await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS total_events,
      COUNT(DISTINCT "visitorId")::int AS unique_visitors
    FROM "analytics_events"
    WHERE "websiteId" = ${siteId}
      AND "type" = 'PAGEVIEW'
      AND "mode" = 'RAW'
      AND (
        ("eventData"->>'pc_source' = 'popcent')
        OR ("eventData"->>'source_website_id' IS NOT NULL AND "eventData"->>'source_website_id' <> '')
        OR (COALESCE(NULLIF(regexp_replace("referrer", '^https?://([^/]+)/?.*$', '\\\\1'), ''), '') IN (${popcentHostList}))
      )
      AND "createdAt" >= ${start}
      AND "createdAt" <= ${nowUtc};
  `) as { total_events: number; unique_visitors: number }[];

  return {
    siteId,
    day: dayString,
    dayStart: start,
    dayEnd: new Date(),
    totalEvents: Number(totals?.total_events ?? 0),
    uniqueVisitors: Number(totals?.unique_visitors ?? 0),
    directUniqueVisitors: Number(totals?.direct_unique_visitors ?? 0),
    popcentTotalEvents: Number(popcent?.total_events ?? 0),
    popcentUniqueVisitors: Number(popcent?.unique_visitors ?? 0),
  };
};
