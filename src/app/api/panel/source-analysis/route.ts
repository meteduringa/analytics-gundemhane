import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const POPCENT_REFERRER_HOSTS = [
  "ppcnt.org",
  "ppcnt.net",
  "ppcnt.live",
  "ppcnt.us",
  "ppcnt.co",
  "ppcnt.eu",
  "popcent.org",
  "flarby.com",
];

const normalizeDateInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const dotMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
  if (dotMatch) {
    const [, day, month, year] = dotMatch;
    return `${year}-${month}-${day}`;
  }
  const slashMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month}-${day}`;
  }
  return null;
};

const parseFilterDate = (value: string | null, endOfDay = false) => {
  if (!value) return null;
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  const iso = `${normalized}T${endOfDay ? "23:59:59" : "00:00:00"}+03:00`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const normalizeLandingUrl = (value: string | null) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return value.trim();
  }
};

type SourceRow = {
  source_website_id: string;
  total_sessions: bigint;
  total_visitors: bigint;
  long_sessions_1: bigint;
  long_sessions_3: bigint;
  long_sessions_5: bigint;
  long_sessions_10: bigint;
  long_visitors_1: bigint;
  long_visitors_3: bigint;
  long_visitors_5: bigint;
  long_visitors_10: bigint;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const websiteId = searchParams.get("websiteId");
  const startValue = searchParams.get("start");
  const endValue = searchParams.get("end");
  const landingUrlRaw = searchParams.get("landingUrl");
  const popcentOnly = searchParams.get("popcentOnly") !== "0";

  if (!websiteId) {
    return NextResponse.json(
      { error: "websiteId zorunludur." },
      { status: 400 }
    );
  }

  const normalizedStart = startValue ? normalizeDateInput(startValue) : null;
  const normalizedEnd = endValue ? normalizeDateInput(endValue) : null;
  const startDate = parseFilterDate(startValue);
  const endDate = parseFilterDate(endValue, true);
  if (startValue && !normalizedStart) {
    return NextResponse.json(
      { error: "Başlangıç tarihi geçersiz." },
      { status: 400 }
    );
  }
  if (endValue && !normalizedEnd) {
    return NextResponse.json(
      { error: "Bitiş tarihi geçersiz." },
      { status: 400 }
    );
  }
  const landingUrl = normalizeLandingUrl(landingUrlRaw);

  const popcentHostList = Prisma.join(
    POPCENT_REFERRER_HOSTS.map((host) => Prisma.sql`${host}`),
    ", "
  );

  const createdAtLocal = Prisma.sql`(e."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')`;
  const startTs = normalizedStart ? `${normalizedStart} 00:00:00` : null;
  const endTs = normalizedEnd ? `${normalizedEnd} 23:59:59` : null;

  const conditions: Prisma.Sql[] = [
    Prisma.sql`e."websiteId" = ${websiteId}`,
    Prisma.sql`e."type" = 'PAGEVIEW'`,
    Prisma.sql`e."mode" = 'RAW'`,
  ];

  if (popcentOnly) {
    conditions.push(Prisma.sql`
      (
        (e."eventData"->>'source_website_id' IS NOT NULL AND e."eventData"->>'source_website_id' <> '')
        OR
        (COALESCE(NULLIF(regexp_replace(e."referrer", '^https?://([^/]+)/?.*$', '\\1'), ''), '') IN (${popcentHostList}))
      )
    `);
  }

  if (startTs) {
    conditions.push(
      Prisma.sql`${createdAtLocal} >= to_timestamp(${startTs}, 'YYYY-MM-DD HH24:MI:SS')`
    );
  }
  if (endTs) {
    conditions.push(
      Prisma.sql`${createdAtLocal} <= to_timestamp(${endTs}, 'YYYY-MM-DD HH24:MI:SS')`
    );
  }
  if (landingUrl) {
    conditions.push(Prisma.sql`e."url" = ${landingUrl}`);
  }

  const whereClause = Prisma.join(conditions, " AND ");

  const rows = (await prisma.$queryRaw`
    WITH matched AS (
      SELECT DISTINCT
        e."sessionId" AS "sessionId",
        e."visitorId" AS "visitorId",
        (e."eventData"->>'source_website_id') AS source_website_id,
        NULLIF(regexp_replace(e."referrer", '^https?://([^/]+)/?.*$', '\\1'), '') AS referrer_host
      FROM "analytics_events" e
      WHERE ${whereClause}
    ),
    durations AS (
      SELECT
        COALESCE(m.source_website_id, m.referrer_host, '[DIRECT]') AS source_website_id,
        m."sessionId" AS "sessionId",
        m."visitorId" AS "visitorId",
        GREATEST(
          0,
          EXTRACT(EPOCH FROM (s."lastSeenAt" - s."startedAt"))
        ) AS duration_seconds
      FROM matched m
      JOIN "analytics_sessions" s
        ON s."websiteId" = ${websiteId}
       AND s."sessionId" = m."sessionId"
    )
    SELECT
      source_website_id,
      COUNT(*) AS total_sessions,
      COUNT(DISTINCT "visitorId") AS total_visitors,
      SUM(CASE WHEN duration_seconds >= 1 THEN 1 ELSE 0 END) AS long_sessions_1,
      SUM(CASE WHEN duration_seconds >= 3 THEN 1 ELSE 0 END) AS long_sessions_3,
      SUM(CASE WHEN duration_seconds >= 5 THEN 1 ELSE 0 END) AS long_sessions_5,
      SUM(CASE WHEN duration_seconds >= 10 THEN 1 ELSE 0 END) AS long_sessions_10,
      COUNT(DISTINCT CASE WHEN duration_seconds >= 1 THEN "visitorId" END) AS long_visitors_1,
      COUNT(DISTINCT CASE WHEN duration_seconds >= 3 THEN "visitorId" END) AS long_visitors_3,
      COUNT(DISTINCT CASE WHEN duration_seconds >= 5 THEN "visitorId" END) AS long_visitors_5,
      COUNT(DISTINCT CASE WHEN duration_seconds >= 10 THEN "visitorId" END) AS long_visitors_10
    FROM durations
    GROUP BY source_website_id
    ORDER BY long_sessions_3 DESC
    LIMIT 200
  `) as SourceRow[];

  return NextResponse.json({
    sources: rows.map((row) => ({
      sourceWebsiteId: row.source_website_id,
      totalSessions: Number(row.total_sessions ?? 0),
      totalVisitors: Number(row.total_visitors ?? 0),
      longSessions: {
        1: Number(row.long_sessions_1 ?? 0),
        3: Number(row.long_sessions_3 ?? 0),
        5: Number(row.long_sessions_5 ?? 0),
        10: Number(row.long_sessions_10 ?? 0),
      },
      longVisitors: {
        1: Number(row.long_visitors_1 ?? 0),
        3: Number(row.long_visitors_3 ?? 0),
        5: Number(row.long_visitors_5 ?? 0),
        10: Number(row.long_visitors_10 ?? 0),
      },
      longShare: {
        1: row.total_sessions
          ? Math.round((Number(row.long_sessions_1 ?? 0) / Number(row.total_sessions)) * 100)
          : 0,
        3: row.total_sessions
          ? Math.round((Number(row.long_sessions_3 ?? 0) / Number(row.total_sessions)) * 100)
          : 0,
        5: row.total_sessions
          ? Math.round((Number(row.long_sessions_5 ?? 0) / Number(row.total_sessions)) * 100)
          : 0,
        10: row.total_sessions
          ? Math.round((Number(row.long_sessions_10 ?? 0) / Number(row.total_sessions)) * 100)
          : 0,
      },
    })),
    thresholds: [1, 3, 5, 10],
    popcentOnly,
  });
}
