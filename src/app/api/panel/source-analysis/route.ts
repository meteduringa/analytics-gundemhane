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
    return parsed.pathname;
  } catch {
    return value.trim();
  }
};

type SourceRow = {
  source_website_id: string;
  total_sessions: bigint;
  total_visitors: bigint;
  lt1_sessions: bigint;
  lt3_sessions: bigint;
  ge5_sessions: bigint;
  ge10_sessions: bigint;
  lt1_visitors: bigint;
  lt3_visitors: bigint;
  ge5_visitors: bigint;
  ge10_visitors: bigint;
};

type SummaryRow = {
  total_sessions: bigint;
  total_visitors: bigint;
  lt1_sessions: bigint;
  lt3_sessions: bigint;
  ge5_sessions: bigint;
  ge10_sessions: bigint;
  lt1_visitors: bigint;
  lt3_visitors: bigint;
  ge5_visitors: bigint;
  ge10_visitors: bigint;
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

  const startDate = parseFilterDate(startValue);
  const endDate = parseFilterDate(endValue, true);
  if (startValue && !startDate) {
    return NextResponse.json(
      { error: "Başlangıç tarihi geçersiz." },
      { status: 400 }
    );
  }
  if (endValue && !endDate) {
    return NextResponse.json(
      { error: "Bitiş tarihi geçersiz." },
      { status: 400 }
    );
  }
  if (startDate && endDate && startDate > endDate) {
    return NextResponse.json(
      { error: "Başlangıç tarihi bitiş tarihinden büyük olamaz." },
      { status: 400 }
    );
  }
  const landingPath = normalizeLandingUrl(landingUrlRaw);

  const popcentHostList = Prisma.join(
    POPCENT_REFERRER_HOSTS.map((host) => Prisma.sql`${host}`),
    ", "
  );

  const conditions: Prisma.Sql[] = [
    Prisma.sql`e."websiteId" = ${websiteId}`,
    Prisma.sql`e."type" = 'PAGEVIEW'`,
    Prisma.sql`e."mode" = 'RAW'`,
  ];

  if (popcentOnly) {
    conditions.push(Prisma.sql`
      (
        (e."eventData"->>'pc_source' = 'popcent')
        OR
        (e."eventData"->>'source_website_id' IS NOT NULL AND e."eventData"->>'source_website_id' <> '')
        OR
        (COALESCE(NULLIF(regexp_replace(e."referrer", '^https?://([^/]+)/?.*$', '\\1'), ''), '') IN (${popcentHostList}))
      )
    `);
  }

  if (startDate) {
    conditions.push(Prisma.sql`e."createdAt" >= ${startDate}`);
  }
  if (endDate) {
    conditions.push(Prisma.sql`e."createdAt" <= ${endDate}`);
  }
  if (landingPath) {
    conditions.push(
      Prisma.sql`rtrim(split_part(e."url", '?', 1), '/') = rtrim(${landingPath}, '/')`
    );
  }

  const whereClause = Prisma.join(conditions, " AND ");

  const rows = (await prisma.$queryRaw`
    WITH matched AS (
      SELECT DISTINCT
        e."sessionId" AS "sessionId",
        e."visitorId" AS "visitorId",
        (e."eventData"->>'source_website_id') AS source_website_id,
        CASE
          -- Some in-app browsers / redirects drop referrer completely.
          -- If we still have strong campaign hints in the landing URL, classify those as social instead of [DIRECT].
          WHEN (e."referrer" IS NULL OR e."referrer" = '')
            AND (
              e."url" ILIKE '%fbclid=%'
              OR e."url" ILIKE '%utm_source=fb%'
              OR e."url" ILIKE '%utm_source=facebook%'
            )
            THEN 'facebook.com'
          WHEN (e."referrer" IS NULL OR e."referrer" = '')
            AND (
              e."url" ILIKE '%igshid=%'
              OR e."url" ILIKE '%utm_source=ig%'
              OR e."url" ILIKE '%utm_source=instagram%'
            )
            THEN 'instagram.com'
          ELSE NULLIF(regexp_replace(e."referrer", '^https?://([^/]+)/?.*$', '\\1'), '')
        END AS referrer_host
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
      SUM(CASE WHEN duration_seconds < 1 THEN 1 ELSE 0 END) AS lt1_sessions,
      SUM(CASE WHEN duration_seconds < 3 THEN 1 ELSE 0 END) AS lt3_sessions,
      SUM(CASE WHEN duration_seconds >= 5 THEN 1 ELSE 0 END) AS ge5_sessions,
      SUM(CASE WHEN duration_seconds >= 10 THEN 1 ELSE 0 END) AS ge10_sessions,
      COUNT(DISTINCT CASE WHEN duration_seconds < 1 THEN "visitorId" END) AS lt1_visitors,
      COUNT(DISTINCT CASE WHEN duration_seconds < 3 THEN "visitorId" END) AS lt3_visitors,
      COUNT(DISTINCT CASE WHEN duration_seconds >= 5 THEN "visitorId" END) AS ge5_visitors,
      COUNT(DISTINCT CASE WHEN duration_seconds >= 10 THEN "visitorId" END) AS ge10_visitors
    FROM durations
    GROUP BY source_website_id
    ORDER BY ge5_sessions DESC
    LIMIT 200
  `) as SourceRow[];

  const summaryRows = (await prisma.$queryRaw`
    WITH matched AS (
      SELECT DISTINCT
        e."sessionId" AS "sessionId",
        e."visitorId" AS "visitorId"
      FROM "analytics_events" e
      WHERE ${whereClause}
    ),
    durations AS (
      SELECT
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
      COUNT(*) AS total_sessions,
      COUNT(DISTINCT "visitorId") AS total_visitors,
      SUM(CASE WHEN duration_seconds < 1 THEN 1 ELSE 0 END) AS lt1_sessions,
      SUM(CASE WHEN duration_seconds < 3 THEN 1 ELSE 0 END) AS lt3_sessions,
      SUM(CASE WHEN duration_seconds >= 5 THEN 1 ELSE 0 END) AS ge5_sessions,
      SUM(CASE WHEN duration_seconds >= 10 THEN 1 ELSE 0 END) AS ge10_sessions,
      COUNT(DISTINCT CASE WHEN duration_seconds < 1 THEN "visitorId" END) AS lt1_visitors,
      COUNT(DISTINCT CASE WHEN duration_seconds < 3 THEN "visitorId" END) AS lt3_visitors,
      COUNT(DISTINCT CASE WHEN duration_seconds >= 5 THEN "visitorId" END) AS ge5_visitors,
      COUNT(DISTINCT CASE WHEN duration_seconds >= 10 THEN "visitorId" END) AS ge10_visitors
    FROM durations
  `) as SummaryRow[];

  const summaryRow = summaryRows[0];
  const summary = summaryRow
    ? {
        totalSessions: Number(summaryRow.total_sessions ?? 0),
        totalVisitors: Number(summaryRow.total_visitors ?? 0),
        longSessions: {
          lt1: Number(summaryRow.lt1_sessions ?? 0),
          lt3: Number(summaryRow.lt3_sessions ?? 0),
          ge5: Number(summaryRow.ge5_sessions ?? 0),
          ge10: Number(summaryRow.ge10_sessions ?? 0),
        },
        longVisitors: {
          lt1: Number(summaryRow.lt1_visitors ?? 0),
          lt3: Number(summaryRow.lt3_visitors ?? 0),
          ge5: Number(summaryRow.ge5_visitors ?? 0),
          ge10: Number(summaryRow.ge10_visitors ?? 0),
        },
        longShare: {
          lt1: summaryRow.total_sessions
            ? Math.round(
                (Number(summaryRow.lt1_sessions ?? 0) /
                  Number(summaryRow.total_sessions)) *
                  100
              )
            : 0,
          lt3: summaryRow.total_sessions
            ? Math.round(
                (Number(summaryRow.lt3_sessions ?? 0) /
                  Number(summaryRow.total_sessions)) *
                  100
              )
            : 0,
          ge5: summaryRow.total_sessions
            ? Math.round(
                (Number(summaryRow.ge5_sessions ?? 0) /
                  Number(summaryRow.total_sessions)) *
                  100
              )
            : 0,
          ge10: summaryRow.total_sessions
            ? Math.round(
                (Number(summaryRow.ge10_sessions ?? 0) /
                  Number(summaryRow.total_sessions)) *
                  100
              )
            : 0,
        },
      }
    : null;

  return NextResponse.json({
    sources: rows.map((row) => ({
      sourceWebsiteId: row.source_website_id,
      totalSessions: Number(row.total_sessions ?? 0),
      totalVisitors: Number(row.total_visitors ?? 0),
      longSessions: {
        lt1: Number(row.lt1_sessions ?? 0),
        lt3: Number(row.lt3_sessions ?? 0),
        ge5: Number(row.ge5_sessions ?? 0),
        ge10: Number(row.ge10_sessions ?? 0),
      },
      longVisitors: {
        lt1: Number(row.lt1_visitors ?? 0),
        lt3: Number(row.lt3_visitors ?? 0),
        ge5: Number(row.ge5_visitors ?? 0),
        ge10: Number(row.ge10_visitors ?? 0),
      },
      longShare: {
        lt1: row.total_sessions
          ? Math.round((Number(row.lt1_sessions ?? 0) / Number(row.total_sessions)) * 100)
          : 0,
        lt3: row.total_sessions
          ? Math.round((Number(row.lt3_sessions ?? 0) / Number(row.total_sessions)) * 100)
          : 0,
        ge5: row.total_sessions
          ? Math.round((Number(row.ge5_sessions ?? 0) / Number(row.total_sessions)) * 100)
          : 0,
        ge10: row.total_sessions
          ? Math.round((Number(row.ge10_sessions ?? 0) / Number(row.total_sessions)) * 100)
          : 0,
      },
    })),
    summary,
    thresholds: ["lt1", "lt3", "ge5", "ge10"],
    popcentOnly,
  });
}
