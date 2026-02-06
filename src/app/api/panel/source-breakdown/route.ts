import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

type BreakdownRow = {
  key: string;
  total_sessions: bigint;
  lt1_sessions: bigint;
  lt3_sessions: bigint;
  ge5_sessions: bigint;
  ge10_sessions: bigint;
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

  const landingPath = normalizeLandingUrl(landingUrlRaw);
  if (!landingPath) {
    return NextResponse.json(
      { error: "Haber URL zorunludur." },
      { status: 400 }
    );
  }

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
    Prisma.sql`split_part(e."url", '?', 1) = ${landingPath}`,
  ];

  if (popcentOnly) {
    conditions.push(
      Prisma.sql`
        (
          (e."eventData"->>'pc_source' = 'popcent')
          OR
          (e."eventData"->>'source_website_id' IS NOT NULL AND e."eventData"->>'source_website_id' <> '')
          OR
          (COALESCE(NULLIF(regexp_replace(e."referrer", '^https?://([^/]+)/?.*$', '\\1'), ''), '') IN (${popcentHostList}))
        )
      `
    );
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

  const whereClause = Prisma.join(conditions, " AND ");

  const rows = (await prisma.$queryRaw`
    WITH matched AS (
      SELECT DISTINCT
        e."sessionId" AS "sessionId",
        e."visitorId" AS "visitorId",
        COALESCE(e."userAgent", '') AS "userAgent"
      FROM "analytics_events" e
      WHERE ${whereClause}
    ),
    durations AS (
      SELECT
        m."sessionId" AS "sessionId",
        m."visitorId" AS "visitorId",
        m."userAgent" AS "userAgent",
        GREATEST(
          0,
          EXTRACT(EPOCH FROM (s."lastSeenAt" - s."startedAt"))
        ) AS duration_seconds
      FROM matched m
      JOIN "analytics_sessions" s
        ON s."websiteId" = ${websiteId}
       AND s."sessionId" = m."sessionId"
    ),
    classified AS (
      SELECT
        "sessionId",
        "visitorId",
        duration_seconds,
        CASE
          WHEN lower("userAgent") LIKE '%iphone%' OR lower("userAgent") LIKE '%ipad%' THEN 'iPhone'
          WHEN lower("userAgent") LIKE '%android%' THEN 'Android'
          ELSE 'Desktop'
        END AS device,
        CASE
          WHEN lower("userAgent") LIKE '%edg/%' OR lower("userAgent") LIKE '%edge/%' THEN 'Edge'
          WHEN lower("userAgent") LIKE '%opr/%' OR lower("userAgent") LIKE '%opera%' THEN 'Opera'
          WHEN lower("userAgent") LIKE '%yabrowser%' THEN 'Yandex'
          WHEN lower("userAgent") LIKE '%ucbrowser%' THEN 'UCBrowser'
          WHEN lower("userAgent") LIKE '%samsungbrowser%' THEN 'Samsung'
          WHEN lower("userAgent") LIKE '%huaweibrowser%' THEN 'Huawei'
          WHEN lower("userAgent") LIKE '%firefox%' THEN 'Firefox'
          WHEN lower("userAgent") LIKE '%chrome%' AND lower("userAgent") NOT LIKE '%edg/%'
            AND lower("userAgent") NOT LIKE '%opr/%' AND lower("userAgent") NOT LIKE '%yabrowser%'
            AND lower("userAgent") NOT LIKE '%ucbrowser%' AND lower("userAgent") NOT LIKE '%samsungbrowser%'
            AND lower("userAgent") NOT LIKE '%huaweibrowser%' THEN 'Chrome'
          WHEN lower("userAgent") LIKE '%safari%' THEN 'Safari'
          ELSE 'Other'
        END AS browser
      FROM durations
    )
    SELECT 'device:' || device AS key,
           COUNT(*) AS total_sessions,
           SUM(CASE WHEN duration_seconds < 1 THEN 1 ELSE 0 END) AS lt1_sessions,
           SUM(CASE WHEN duration_seconds < 3 THEN 1 ELSE 0 END) AS lt3_sessions,
           SUM(CASE WHEN duration_seconds >= 5 THEN 1 ELSE 0 END) AS ge5_sessions,
           SUM(CASE WHEN duration_seconds >= 10 THEN 1 ELSE 0 END) AS ge10_sessions
    FROM classified
    GROUP BY device
    UNION ALL
    SELECT 'browser:' || browser AS key,
           COUNT(*) AS total_sessions,
           SUM(CASE WHEN duration_seconds < 1 THEN 1 ELSE 0 END) AS lt1_sessions,
           SUM(CASE WHEN duration_seconds < 3 THEN 1 ELSE 0 END) AS lt3_sessions,
           SUM(CASE WHEN duration_seconds >= 5 THEN 1 ELSE 0 END) AS ge5_sessions,
           SUM(CASE WHEN duration_seconds >= 10 THEN 1 ELSE 0 END) AS ge10_sessions
    FROM classified
    GROUP BY browser
    UNION ALL
    SELECT 'combo:' || device || '|' || browser AS key,
           COUNT(*) AS total_sessions,
           SUM(CASE WHEN duration_seconds < 1 THEN 1 ELSE 0 END) AS lt1_sessions,
           SUM(CASE WHEN duration_seconds < 3 THEN 1 ELSE 0 END) AS lt3_sessions,
           SUM(CASE WHEN duration_seconds >= 5 THEN 1 ELSE 0 END) AS ge5_sessions,
           SUM(CASE WHEN duration_seconds >= 10 THEN 1 ELSE 0 END) AS ge10_sessions
    FROM classified
    GROUP BY device, browser
  `) as BreakdownRow[];

  const device = rows
    .filter((row) => row.key.startsWith("device:"))
    .map((row) => {
      const label = row.key.replace("device:", "");
      const total = Number(row.total_sessions ?? 0);
      return {
        label,
        totalSessions: total,
        longSessions: {
          lt1: Number(row.lt1_sessions ?? 0),
          lt3: Number(row.lt3_sessions ?? 0),
          ge5: Number(row.ge5_sessions ?? 0),
          ge10: Number(row.ge10_sessions ?? 0),
        },
        longShare: {
          lt1: total ? Math.round((Number(row.lt1_sessions ?? 0) / total) * 100) : 0,
          lt3: total ? Math.round((Number(row.lt3_sessions ?? 0) / total) * 100) : 0,
          ge5: total ? Math.round((Number(row.ge5_sessions ?? 0) / total) * 100) : 0,
          ge10: total ? Math.round((Number(row.ge10_sessions ?? 0) / total) * 100) : 0,
        },
      };
    })
    .sort((a, b) => b.longShare.ge5 - a.longShare.ge5);

  const browser = rows
    .filter((row) => row.key.startsWith("browser:"))
    .map((row) => {
      const label = row.key.replace("browser:", "");
      const total = Number(row.total_sessions ?? 0);
      return {
        label,
        totalSessions: total,
        longSessions: {
          lt1: Number(row.lt1_sessions ?? 0),
          lt3: Number(row.lt3_sessions ?? 0),
          ge5: Number(row.ge5_sessions ?? 0),
          ge10: Number(row.ge10_sessions ?? 0),
        },
        longShare: {
          lt1: total ? Math.round((Number(row.lt1_sessions ?? 0) / total) * 100) : 0,
          lt3: total ? Math.round((Number(row.lt3_sessions ?? 0) / total) * 100) : 0,
          ge5: total ? Math.round((Number(row.ge5_sessions ?? 0) / total) * 100) : 0,
          ge10: total ? Math.round((Number(row.ge10_sessions ?? 0) / total) * 100) : 0,
        },
      };
    })
    .sort((a, b) => b.longShare.ge5 - a.longShare.ge5);

  const combos = rows
    .filter((row) => row.key.startsWith("combo:"))
    .map((row) => {
      const label = row.key.replace("combo:", "");
      const total = Number(row.total_sessions ?? 0);
      return {
        label,
        totalSessions: total,
        longSessions: {
          lt1: Number(row.lt1_sessions ?? 0),
          lt3: Number(row.lt3_sessions ?? 0),
          ge5: Number(row.ge5_sessions ?? 0),
          ge10: Number(row.ge10_sessions ?? 0),
        },
        longShare: {
          lt1: total ? Math.round((Number(row.lt1_sessions ?? 0) / total) * 100) : 0,
          lt3: total ? Math.round((Number(row.lt3_sessions ?? 0) / total) * 100) : 0,
          ge5: total ? Math.round((Number(row.ge5_sessions ?? 0) / total) * 100) : 0,
          ge10: total ? Math.round((Number(row.ge10_sessions ?? 0) / total) * 100) : 0,
        },
      };
    })
    .sort((a, b) => {
      const primary = b.longShare.ge10 - a.longShare.ge10;
      if (primary !== 0) return primary;
      const secondary = b.longShare.ge5 - a.longShare.ge5;
      if (secondary !== 0) return secondary;
      return b.totalSessions - a.totalSessions;
    });

  return NextResponse.json({
    thresholds: ["lt1", "lt3", "ge5", "ge10"],
    popcentOnly,
    device,
    browser,
    combos,
  });
}
