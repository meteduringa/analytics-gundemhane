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

type Row = {
  website_id: string;
  website_name: string;
  url: string;
  total_pageviews: bigint;
  unique_visitors: bigint;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const websiteId = searchParams.get("websiteId");
  const startValue = searchParams.get("start") ?? "";
  const endValue = searchParams.get("end") ?? "";
  const limitValue = searchParams.get("limit") ?? "2000";

  const normalizedStart = startValue ? normalizeDateInput(startValue) : null;
  const normalizedEnd = endValue ? normalizeDateInput(endValue) : null;
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

  const limitRaw = Number.parseInt(limitValue, 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 100), 10000)
    : 2000;

  const createdAtLocal = Prisma.sql`(e."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')`;
  const startTs = normalizedStart ? `${normalizedStart} 00:00:00` : null;
  const endTs = normalizedEnd ? `${normalizedEnd} 23:59:59` : null;

  const conditions: Prisma.Sql[] = [
    Prisma.sql`e."type" = 'PAGEVIEW'`,
    Prisma.sql`e."mode" = 'RAW'`,
    Prisma.sql`e."url" IS NOT NULL`,
  ];

  if (websiteId) {
    conditions.push(Prisma.sql`e."websiteId" = ${websiteId}`);
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
    SELECT
      w.id AS website_id,
      w.name AS website_name,
      rtrim(split_part(e."url", '?', 1), '/') AS url,
      COUNT(*) AS total_pageviews,
      COUNT(DISTINCT e."visitorId") AS unique_visitors
    FROM "analytics_events" e
    JOIN "analytics_websites" w
      ON w.id = e."websiteId"
    WHERE ${whereClause}
    GROUP BY w.id, w.name, url
    ORDER BY total_pageviews DESC
    LIMIT ${limit}
  `) as Row[];

  return NextResponse.json({
    rows: rows.map((row) => ({
      websiteId: row.website_id,
      websiteName: row.website_name,
      url: row.url,
      totalPageviews: Number(row.total_pageviews ?? 0),
      uniqueVisitors: Number(row.unique_visitors ?? 0),
    })),
  });
}
