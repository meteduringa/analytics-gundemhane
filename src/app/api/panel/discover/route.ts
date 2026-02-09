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

type SummaryRow = {
  total_unique: bigint;
  loyal_unique: bigint;
  total_pageviews: bigint;
  loyal_pageviews: bigint;
};

type CategoryRow = {
  category: string;
  loyal_pageviews: bigint;
  loyal_unique: bigint;
};

type HourRow = {
  hour: number;
  loyal_pageviews: bigint;
};

type ComboRow = {
  category: string;
  hour: number;
  loyal_pageviews: bigint;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const websiteId = searchParams.get("websiteId");
  const startValue = searchParams.get("start") ?? "";
  const endValue = searchParams.get("end") ?? "";

  if (!websiteId) {
    return NextResponse.json(
      { error: "websiteId zorunludur." },
      { status: 400 }
    );
  }

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

  const createdAtLocal = Prisma.sql`(e."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')`;
  const startTs = normalizedStart ? `${normalizedStart} 00:00:00` : null;
  const endTs = normalizedEnd ? `${normalizedEnd} 23:59:59` : null;
  const startDate = normalizedStart ? new Date(`${normalizedStart}T00:00:00+03:00`) : null;
  const endDate = normalizedEnd ? new Date(`${normalizedEnd}T00:00:00+03:00`) : null;
  const totalDays =
    startDate && endDate
      ? Math.max(
          1,
          Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1
        )
      : 7;

  const pathExpr = Prisma.sql`trim(both '/' from split_part(e."url", '?', 1))`;
  const firstSegment = Prisma.sql`split_part(${pathExpr}, '/', 1)`;
  const secondSegment = Prisma.sql`split_part(${pathExpr}, '/', 2)`;
  const categoryExpr = Prisma.sql`
    CASE
      WHEN ${firstSegment} IN ('haberler', 'kategori', 'category', 'news')
        AND ${secondSegment} <> '' THEN ${secondSegment}
      WHEN ${firstSegment} ~ '^[0-9]+$' OR ${firstSegment} = '' THEN 'genel'
      ELSE ${firstSegment}
    END
  `;

  const conditions: Prisma.Sql[] = [
    Prisma.sql`e."websiteId" = ${websiteId}`,
    Prisma.sql`e."type" = 'PAGEVIEW'`,
    Prisma.sql`e."mode" = 'RAW'`,
    Prisma.sql`e."url" IS NOT NULL`,
  ];

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

  const summaryRows = (await prisma.$queryRaw`
    WITH events AS (
      SELECT
        e."visitorId" AS visitor_id,
        ${createdAtLocal} AS created_local
      FROM "analytics_events" e
      WHERE ${whereClause}
    ),
    daily AS (
      SELECT
        visitor_id,
        COUNT(*) AS pageviews,
        COUNT(DISTINCT created_local::date) AS days_seen
      FROM events
      GROUP BY visitor_id
    ),
    loyal AS (
      SELECT visitor_id
      FROM daily
      WHERE days_seen >= ${totalDays}
    )
    SELECT
      (SELECT COUNT(DISTINCT visitor_id) FROM events) AS total_unique,
      (SELECT COUNT(DISTINCT visitor_id) FROM events WHERE visitor_id IN (SELECT visitor_id FROM loyal)) AS loyal_unique,
      (SELECT COUNT(*) FROM events) AS total_pageviews,
      (SELECT COUNT(*) FROM events WHERE visitor_id IN (SELECT visitor_id FROM loyal)) AS loyal_pageviews
  `) as SummaryRow[];

  const summaryRow = summaryRows[0];

  const categoryRows = (await prisma.$queryRaw`
    WITH events AS (
      SELECT
        e."visitorId" AS visitor_id,
        ${createdAtLocal} AS created_local,
        ${categoryExpr} AS category
      FROM "analytics_events" e
      WHERE ${whereClause}
    ),
    daily AS (
      SELECT
        visitor_id,
        COUNT(*) AS pageviews,
        COUNT(DISTINCT created_local::date) AS days_seen
      FROM events
      GROUP BY visitor_id
    ),
    loyal AS (
      SELECT visitor_id
      FROM daily
      WHERE days_seen >= ${totalDays}
    )
    SELECT
      category,
      COUNT(*) AS loyal_pageviews,
      COUNT(DISTINCT visitor_id) AS loyal_unique
    FROM events
    WHERE visitor_id IN (SELECT visitor_id FROM loyal)
    GROUP BY category
    ORDER BY loyal_pageviews DESC
    LIMIT 50
  `) as CategoryRow[];

  const hourRows = (await prisma.$queryRaw`
    WITH events AS (
      SELECT
        e."visitorId" AS visitor_id,
        ${createdAtLocal} AS created_local,
        EXTRACT(HOUR FROM ${createdAtLocal})::int AS hour
      FROM "analytics_events" e
      WHERE ${whereClause}
    ),
    daily AS (
      SELECT
        visitor_id,
        COUNT(*) AS pageviews,
        COUNT(DISTINCT created_local::date) AS days_seen
      FROM events
      GROUP BY visitor_id
    ),
    loyal AS (
      SELECT visitor_id
      FROM daily
      WHERE days_seen >= ${totalDays}
    )
    SELECT
      hour,
      COUNT(*) AS loyal_pageviews
    FROM events
    WHERE visitor_id IN (SELECT visitor_id FROM loyal)
    GROUP BY hour
    ORDER BY hour
  `) as HourRow[];

  const comboRows = (await prisma.$queryRaw`
    WITH events AS (
      SELECT
        e."visitorId" AS visitor_id,
        ${createdAtLocal} AS created_local,
        ${categoryExpr} AS category,
        EXTRACT(HOUR FROM ${createdAtLocal})::int AS hour
      FROM "analytics_events" e
      WHERE ${whereClause}
    ),
    daily AS (
      SELECT
        visitor_id,
        COUNT(*) AS pageviews,
        COUNT(DISTINCT created_local::date) AS days_seen
      FROM events
      GROUP BY visitor_id
    ),
    loyal AS (
      SELECT visitor_id
      FROM daily
      WHERE days_seen >= ${totalDays}
    )
    SELECT
      category,
      hour,
      COUNT(*) AS loyal_pageviews
    FROM events
    WHERE visitor_id IN (SELECT visitor_id FROM loyal)
    GROUP BY category, hour
    ORDER BY loyal_pageviews DESC
    LIMIT 100
  `) as ComboRow[];

  const totalLoyalPageviews = Number(summaryRow?.loyal_pageviews ?? 0);

  return NextResponse.json({
    summary: {
      totalUnique: Number(summaryRow?.total_unique ?? 0),
      loyalUnique: Number(summaryRow?.loyal_unique ?? 0),
      totalPageviews: Number(summaryRow?.total_pageviews ?? 0),
      loyalPageviews: totalLoyalPageviews,
      loyalShare:
        summaryRow && Number(summaryRow.total_unique ?? 0)
          ? Math.round(
              (Number(summaryRow.loyal_unique ?? 0) /
                Number(summaryRow.total_unique ?? 1)) *
                100
            )
          : 0,
    },
    byCategory: categoryRows.map((row) => ({
      category: row.category || "genel",
      loyalPageviews: Number(row.loyal_pageviews ?? 0),
      loyalUnique: Number(row.loyal_unique ?? 0),
      share:
        totalLoyalPageviews > 0
          ? Math.round((Number(row.loyal_pageviews ?? 0) / totalLoyalPageviews) * 100)
          : 0,
    })),
    byHour: hourRows.map((row) => ({
      hour: row.hour,
      loyalPageviews: Number(row.loyal_pageviews ?? 0),
      share:
        totalLoyalPageviews > 0
          ? Math.round((Number(row.loyal_pageviews ?? 0) / totalLoyalPageviews) * 100)
          : 0,
    })),
    byCategoryHour: comboRows.map((row) => ({
      category: row.category || "genel",
      hour: row.hour,
      loyalPageviews: Number(row.loyal_pageviews ?? 0),
      share:
        totalLoyalPageviews > 0
          ? Math.round((Number(row.loyal_pageviews ?? 0) / totalLoyalPageviews) * 100)
          : 0,
    })),
  });
}
