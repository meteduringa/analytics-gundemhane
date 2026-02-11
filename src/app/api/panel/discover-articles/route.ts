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

type ArticleRow = {
  url: string;
  title: string | null;
  total_pageviews: bigint;
  total_unique: bigint;
  direct_pageviews: bigint;
  direct_unique: bigint;
  facebook_pageviews: bigint;
  facebook_unique: bigint;
  instagram_pageviews: bigint;
  instagram_unique: bigint;
  google_search_pageviews: bigint;
  google_search_unique: bigint;
  google_discover_pageviews: bigint;
  google_discover_unique: bigint;
  other_pageviews: bigint;
  other_unique: bigint;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const websiteId = searchParams.get("websiteId");
  const category = searchParams.get("category")?.trim();
  const startValue = searchParams.get("start") ?? "";
  const endValue = searchParams.get("end") ?? "";

  if (!websiteId) {
    return NextResponse.json(
      { error: "websiteId zorunludur." },
      { status: 400 }
    );
  }
  if (!category) {
    return NextResponse.json(
      { error: "Kategori zorunludur." },
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

  const pathExpr = Prisma.sql`trim(both '/' from split_part(e."url", '?', 1))`;
  const firstSegment = Prisma.sql`split_part(${pathExpr}, '/', 1)`;
  const secondSegment = Prisma.sql`split_part(${pathExpr}, '/', 2)`;
  const fallbackCategoryExpr = Prisma.sql`
    CASE
      WHEN ${firstSegment} IN ('haberler', 'kategori', 'category', 'news')
        AND ${secondSegment} <> '' THEN ${secondSegment}
      WHEN ${firstSegment} ~ '^[0-9]+$' OR ${firstSegment} = '' THEN 'genel'
      ELSE ${firstSegment}
    END
  `;
  const categoryExpr = Prisma.sql`
    COALESCE(NULLIF(e."eventData"->>'page_category', ''), ${fallbackCategoryExpr})
  `;

  const titleExpr = Prisma.sql`
    COALESCE(
      NULLIF(e."eventData"->>'page_title', ''),
      NULLIF(e."eventData"->>'pageTitle', ''),
      NULLIF(e."eventData"->>'title', ''),
      NULLIF(replace(regexp_replace(${pathExpr}, '^.*/', ''), '-', ' '), ''),
      ${pathExpr}
    )
  `;

  const sourceExpr = Prisma.sql`
    CASE
      WHEN e."referrer" IS NULL OR e."referrer" = '' THEN 'direct'
      WHEN e."referrer" ILIKE '%facebook.com%' OR e."referrer" ILIKE '%l.facebook.com%'
        OR e."referrer" ILIKE '%lm.facebook.com%' OR e."referrer" ILIKE '%m.facebook.com%'
        THEN 'facebook'
      WHEN e."referrer" ILIKE '%instagram.com%' THEN 'instagram'
      WHEN e."referrer" ILIKE 'android-app://com.google.android.googlequicksearchbox/%' THEN 'google_search'
      WHEN e."referrer" ILIKE '%://www.google.%' OR e."referrer" ILIKE '%://google.%' OR e."referrer" ILIKE '%://news.google.%'
        THEN CASE
          WHEN e."referrer" ILIKE '%q=%' OR e."referrer" ILIKE '%/search%' THEN 'google_search'
          ELSE 'google_discover'
        END
      ELSE 'other'
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

  const rows = (await prisma.$queryRaw`
    WITH events AS (
      SELECT
        e."visitorId" AS visitor_id,
        split_part(e."url", '?', 1) AS url,
        ${categoryExpr} AS category,
        ${titleExpr} AS title,
        ${sourceExpr} AS source
      FROM "analytics_events" e
      WHERE ${whereClause}
    )
    SELECT
      url,
      MAX(title) AS title,
      COUNT(*) AS total_pageviews,
      COUNT(DISTINCT visitor_id) AS total_unique,
      COUNT(*) FILTER (WHERE source = 'direct') AS direct_pageviews,
      COUNT(DISTINCT visitor_id) FILTER (WHERE source = 'direct') AS direct_unique,
      COUNT(*) FILTER (WHERE source = 'facebook') AS facebook_pageviews,
      COUNT(DISTINCT visitor_id) FILTER (WHERE source = 'facebook') AS facebook_unique,
      COUNT(*) FILTER (WHERE source = 'instagram') AS instagram_pageviews,
      COUNT(DISTINCT visitor_id) FILTER (WHERE source = 'instagram') AS instagram_unique,
      COUNT(*) FILTER (WHERE source = 'google_search') AS google_search_pageviews,
      COUNT(DISTINCT visitor_id) FILTER (WHERE source = 'google_search') AS google_search_unique,
      COUNT(*) FILTER (WHERE source = 'google_discover') AS google_discover_pageviews,
      COUNT(DISTINCT visitor_id) FILTER (WHERE source = 'google_discover') AS google_discover_unique,
      COUNT(*) FILTER (WHERE source = 'other') AS other_pageviews,
      COUNT(DISTINCT visitor_id) FILTER (WHERE source = 'other') AS other_unique
    FROM events
    WHERE lower(category) = lower(${category})
    GROUP BY url
    ORDER BY total_pageviews DESC
    LIMIT 100
  `) as ArticleRow[];

  return NextResponse.json({
    category,
    articles: rows.map((row) => ({
      url: row.url,
      title: row.title,
      totalPageviews: Number(row.total_pageviews ?? 0),
      totalUnique: Number(row.total_unique ?? 0),
      sources: {
        direct: {
          pageviews: Number(row.direct_pageviews ?? 0),
          unique: Number(row.direct_unique ?? 0),
        },
        facebook: {
          pageviews: Number(row.facebook_pageviews ?? 0),
          unique: Number(row.facebook_unique ?? 0),
        },
        instagram: {
          pageviews: Number(row.instagram_pageviews ?? 0),
          unique: Number(row.instagram_unique ?? 0),
        },
        googleSearch: {
          pageviews: Number(row.google_search_pageviews ?? 0),
          unique: Number(row.google_search_unique ?? 0),
        },
        googleDiscover: {
          pageviews: Number(row.google_discover_pageviews ?? 0),
          unique: Number(row.google_discover_unique ?? 0),
        },
        other: {
          pageviews: Number(row.other_pageviews ?? 0),
          unique: Number(row.other_unique ?? 0),
        },
      },
    })),
  });
}
