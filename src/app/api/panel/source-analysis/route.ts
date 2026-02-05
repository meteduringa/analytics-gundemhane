import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const parseFilterDate = (value: string | null, endOfDay = false) => {
  if (!value) return null;
  const iso = `${value}T${endOfDay ? "23:59:59" : "00:00:00"}+03:00`;
  return new Date(iso);
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
  sessions: bigint;
  visitors: bigint;
  avg_seconds: number | null;
  total_seconds: number | null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const websiteId = searchParams.get("websiteId");
  const startValue = searchParams.get("start");
  const endValue = searchParams.get("end");
  const landingUrlRaw = searchParams.get("landingUrl");
  const minAvgSeconds = Math.max(
    0,
    Number(searchParams.get("minAvgSeconds") ?? 1)
  );

  if (!websiteId) {
    return NextResponse.json(
      { error: "websiteId zorunludur." },
      { status: 400 }
    );
  }

  const startDate = parseFilterDate(startValue);
  const endDate = parseFilterDate(endValue, true);
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
    SELECT
      (e."eventData"->>'source_website_id') AS source_website_id,
      COUNT(DISTINCT s."sessionId") AS sessions,
      COUNT(DISTINCT s."visitorId") AS visitors,
      AVG(EXTRACT(EPOCH FROM (s."lastSeenAt" - s."startedAt"))) AS avg_seconds,
      SUM(EXTRACT(EPOCH FROM (s."lastSeenAt" - s."startedAt"))) AS total_seconds
    FROM "analytics_events" e
    JOIN "analytics_sessions" s
      ON s."websiteId" = e."websiteId"
     AND s."sessionId" = e."sessionId"
    WHERE ${whereClause}
    GROUP BY source_website_id
    HAVING AVG(EXTRACT(EPOCH FROM (s."lastSeenAt" - s."startedAt"))) >= ${minAvgSeconds}
    ORDER BY avg_seconds DESC
    LIMIT 200
  `) as SourceRow[];

  return NextResponse.json({
    sources: rows.map((row) => ({
      sourceWebsiteId: row.source_website_id,
      sessions: Number(row.sessions ?? 0),
      visitors: Number(row.visitors ?? 0),
      avgSeconds: Math.round(row.avg_seconds ?? 0),
      totalSeconds: Math.round(row.total_seconds ?? 0),
    })),
  });
}
