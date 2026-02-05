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
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return value.trim();
  }
};

type SourceRow = {
  source_website_id: string;
  short_sessions: bigint;
  long_sessions: bigint;
  short_visitors: bigint;
  long_visitors: bigint;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const websiteId = searchParams.get("websiteId");
  const startValue = searchParams.get("start");
  const endValue = searchParams.get("end");
  const landingUrlRaw = searchParams.get("landingUrl");

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
  const landingUrl = normalizeLandingUrl(landingUrlRaw);

  const conditions: Prisma.Sql[] = [
    Prisma.sql`e."websiteId" = ${websiteId}`,
    Prisma.sql`e."type" = 'PAGEVIEW'`,
    Prisma.sql`e."mode" = 'RAW'`,
    Prisma.sql`e."eventData"->>'source_website_id' IS NOT NULL`,
    Prisma.sql`e."eventData"->>'source_website_id' <> ''`,
  ];

  if (startDate) {
    conditions.push(Prisma.sql`e."createdAt" >= ${startDate}`);
  }
  if (endDate) {
    conditions.push(Prisma.sql`e."createdAt" <= ${endDate}`);
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
        (e."eventData"->>'source_website_id') AS source_website_id
      FROM "analytics_events" e
      WHERE ${whereClause}
    ),
    durations AS (
      SELECT
        m.source_website_id,
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
      SUM(CASE WHEN duration_seconds < 1 THEN 1 ELSE 0 END) AS short_sessions,
      SUM(CASE WHEN duration_seconds >= 1 THEN 1 ELSE 0 END) AS long_sessions,
      COUNT(DISTINCT CASE WHEN duration_seconds < 1 THEN "visitorId" END) AS short_visitors,
      COUNT(DISTINCT CASE WHEN duration_seconds >= 1 THEN "visitorId" END) AS long_visitors
    FROM durations
    GROUP BY source_website_id
    ORDER BY long_sessions DESC
    LIMIT 200
  `) as SourceRow[];

  return NextResponse.json({
    sources: rows.map((row) => ({
      sourceWebsiteId: row.source_website_id,
      shortSessions: Number(row.short_sessions ?? 0),
      longSessions: Number(row.long_sessions ?? 0),
      shortVisitors: Number(row.short_visitors ?? 0),
      longVisitors: Number(row.long_visitors ?? 0),
    })),
  });
}
