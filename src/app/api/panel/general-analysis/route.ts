import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readPanelSession } from "@/lib/panel-session";
import { getPanelAuthorizedWebsiteIds } from "@/lib/panel-website-access";

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
  title: string | null;
  total_pageviews: bigint;
  unique_visitors: bigint;
  tracked_reads: bigint;
  untracked_pageviews: bigint;
  avg_read_seconds: number | null;
  avg_tracked_read_seconds: number | null;
  lt3_reads: bigint;
  ge10_reads: bigint;
  ge30_reads: bigint;
  ge50_reads: bigint;
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

type BaseRow = Omit<
  Row,
  | "tracked_reads"
  | "untracked_pageviews"
  | "avg_read_seconds"
  | "avg_tracked_read_seconds"
  | "lt3_reads"
  | "ge10_reads"
  | "ge30_reads"
  | "ge50_reads"
>;

type ReadRow = {
  website_id: string;
  url: string;
  tracked_reads: bigint;
  total_read_seconds: number | null;
  avg_tracked_read_seconds: number | null;
  lt3_reads: bigint;
  ge10_reads: bigint;
  ge30_reads: bigint;
  ge50_reads: bigint;
};

type SummaryRow = {
  total_pageviews: bigint;
  unique_visitors: bigint;
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
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const websiteId = searchParams.get("websiteId");
  const startValue = searchParams.get("start") ?? "";
  const endValue = searchParams.get("end") ?? "";
  const limitValue = searchParams.get("limit") ?? "2000";
  const onlyArticles = searchParams.get("onlyArticles") === "1";

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
  const authorizedWebsiteIds = await getPanelAuthorizedWebsiteIds(session);

  if (authorizedWebsiteIds && websiteId && !authorizedWebsiteIds.includes(websiteId)) {
    return NextResponse.json({ error: "Bu firmaya erişim yetkiniz yok." }, { status: 403 });
  }

  if (authorizedWebsiteIds && authorizedWebsiteIds.length === 0) {
    return NextResponse.json({ summary: null, rows: [] });
  }

  const startTs = normalizedStart ? `${normalizedStart} 00:00:00` : null;
  const endTs = normalizedEnd ? `${normalizedEnd} 23:59:59` : null;
  const startDate = normalizedStart
    ? new Date(`${normalizedStart}T00:00:00+03:00`)
    : null;
  const endDate = normalizedEnd
    ? new Date(`${normalizedEnd}T23:59:59+03:00`)
    : null;
  const normalizedUrlExpr = Prisma.sql`rtrim(split_part(e."url", '?', 1), '/')`;
  const pathExpr = Prisma.sql`trim(both '/' from split_part(e."url", '?', 1))`;
  const firstSegmentExpr = Prisma.sql`split_part(${pathExpr}, '/', 1)`;
  const secondSegmentExpr = Prisma.sql`split_part(${pathExpr}, '/', 2)`;
  const articleUrlCondition = Prisma.sql`
    ${pathExpr} <> ''
    AND (
      ${secondSegmentExpr} ~ '^[0-9]+$'
      OR (
        ${pathExpr} NOT LIKE '%/%'
        AND ${firstSegmentExpr} !~ '^(kategori|video|foto-galeri|e-gazete|yazarlar|arama|etiket|kunye|reklam|iletisim|gizlilik-politikasi|cerez-politikasi)$'
      )
    )
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
      WHEN (e."referrer" IS NULL OR e."referrer" = '')
        AND (
          e."url" ILIKE '%fbclid=%'
          OR e."url" ILIKE '%utm_source=fb%'
          OR e."url" ILIKE '%utm_source=facebook%'
        )
        THEN 'facebook'
      WHEN (e."referrer" IS NULL OR e."referrer" = '')
        AND (
          e."url" ILIKE '%igshid=%'
          OR e."url" ILIKE '%utm_source=ig%'
          OR e."url" ILIKE '%utm_source=instagram%'
        )
        THEN 'instagram'
      WHEN e."referrer" IS NULL OR e."referrer" = '' THEN 'direct'
      WHEN e."referrer" ILIKE '%facebook.com%'
        OR e."referrer" ILIKE '%l.facebook.com%'
        OR e."referrer" ILIKE '%lm.facebook.com%'
        OR e."referrer" ILIKE '%m.facebook.com%'
        THEN 'facebook'
      WHEN e."referrer" ILIKE '%instagram.com%' THEN 'instagram'
      WHEN e."referrer" ILIKE 'android-app://com.google.android.googlequicksearchbox/%' THEN 'google_search'
      WHEN e."referrer" ILIKE '%://www.google.%'
        OR e."referrer" ILIKE '%://google.%'
        OR e."referrer" ILIKE '%://news.google.%'
        THEN CASE
          WHEN e."referrer" ILIKE '%q=%' OR e."referrer" ILIKE '%/search%' THEN 'google_search'
          ELSE 'google_discover'
        END
      ELSE 'other'
    END
  `;

  const conditions: Prisma.Sql[] = [
    Prisma.sql`e."type" = 'PAGEVIEW'`,
    Prisma.sql`e."mode" = 'RAW'`,
    Prisma.sql`e."url" IS NOT NULL`,
  ];

  if (websiteId) {
    conditions.push(Prisma.sql`e."websiteId" = ${websiteId}`);
  } else if (authorizedWebsiteIds) {
    conditions.push(
      Prisma.sql`e."websiteId" IN (${Prisma.join(authorizedWebsiteIds)})`
    );
  }

  if (startTs) {
    conditions.push(Prisma.sql`e."createdAt" >= ${startDate}`);
  }
  if (endTs) {
    conditions.push(Prisma.sql`e."createdAt" <= ${endDate}`);
  }
  if (onlyArticles) {
    conditions.push(articleUrlCondition);
  }

  const whereClause = Prisma.join(conditions, " AND ");

  const baseRows = (await prisma.$queryRaw`
    WITH events AS (
      SELECT
        w.id AS website_id,
        w.name AS website_name,
        ${normalizedUrlExpr} AS url,
        e."visitorId" AS visitor_id,
        ${titleExpr} AS title,
        ${sourceExpr} AS source
      FROM "analytics_events" e
      JOIN "analytics_websites" w
        ON w.id = e."websiteId"
      WHERE ${whereClause}
    ),
    grouped AS (
      SELECT
        website_id,
        website_name,
        url,
        MAX(title) AS title,
        COUNT(*) AS total_pageviews,
        COUNT(DISTINCT visitor_id) AS unique_visitors,
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
      GROUP BY website_id, website_name, url
    )
    SELECT
      g.website_id,
      g.website_name,
      g.url,
      g.title,
      g.total_pageviews,
      g.unique_visitors,
      g.direct_pageviews,
      g.direct_unique,
      g.facebook_pageviews,
      g.facebook_unique,
      g.instagram_pageviews,
      g.instagram_unique,
      g.google_search_pageviews,
      g.google_search_unique,
      g.google_discover_pageviews,
      g.google_discover_unique,
      g.other_pageviews,
      g.other_unique
    FROM grouped g
    ORDER BY g.total_pageviews DESC
    LIMIT ${limit}
  `) as BaseRow[];

  const targetUrlTuples = baseRows
    .filter((row) => row.website_id && row.url)
    .map((row) => Prisma.sql`(${row.website_id}, ${row.url})`);

  const readRows = targetUrlTuples.length
    ? ((await prisma.$queryRaw`
        WITH target_urls(website_id, url) AS (
          VALUES ${Prisma.join(targetUrlTuples)}
        ),
        ping_samples AS (
          SELECT
            e."websiteId" AS website_id,
            ${normalizedUrlExpr} AS url,
            e."visitorId" AS visitor_id,
            NULLIF(e."eventData"->>'pageviewTs', '') AS pageview_ts,
            MAX(
              CASE
                WHEN (e."eventData"->>'elapsedSeconds') ~ '^[0-9]+(\\.[0-9]+)?$'
                  THEN (e."eventData"->>'elapsedSeconds')::numeric
                ELSE NULL
              END
            ) AS read_seconds
          FROM "analytics_events" e
          JOIN target_urls t
            ON t.website_id = e."websiteId"
           AND t.url = ${normalizedUrlExpr}
          WHERE ${Prisma.join(
            [
              Prisma.sql`e."type" = 'EVENT'`,
              Prisma.sql`e."mode" = 'RAW'`,
              Prisma.sql`e."eventName" = 'ping'`,
              Prisma.sql`e."url" IS NOT NULL`,
              ...(startTs
                ? [Prisma.sql`e."createdAt" >= ${startDate}`]
                : []),
              ...(endTs
                ? [Prisma.sql`e."createdAt" <= ${endDate}`]
                : []),
            ],
            " AND "
          )}
          GROUP BY e."websiteId", ${normalizedUrlExpr}, e."visitorId", NULLIF(e."eventData"->>'pageviewTs', '')
          HAVING MAX(
            CASE
              WHEN (e."eventData"->>'elapsedSeconds') ~ '^[0-9]+(\\.[0-9]+)?$'
                THEN (e."eventData"->>'elapsedSeconds')::numeric
              ELSE NULL
            END
          ) IS NOT NULL
        )
        SELECT
          website_id,
          url,
          COUNT(*) AS tracked_reads,
          SUM(read_seconds) AS total_read_seconds,
          AVG(read_seconds) AS avg_tracked_read_seconds,
          SUM(CASE WHEN read_seconds < 3 THEN 1 ELSE 0 END) AS lt3_reads,
          SUM(CASE WHEN read_seconds >= 10 THEN 1 ELSE 0 END) AS ge10_reads,
          SUM(CASE WHEN read_seconds >= 30 THEN 1 ELSE 0 END) AS ge30_reads,
          SUM(CASE WHEN read_seconds >= 50 THEN 1 ELSE 0 END) AS ge50_reads
        FROM ping_samples
        GROUP BY website_id, url
      `) as ReadRow[])
    : [];

  const readByPage = new Map(
    readRows.map((row) => [`${row.website_id}||${row.url}`, row])
  );

  const rows: Row[] = baseRows.map((row) => {
    const read = readByPage.get(`${row.website_id}||${row.url}`);
    const trackedReads = Number(read?.tracked_reads ?? 0);
    const totalReadSeconds = Number(read?.total_read_seconds ?? 0);
    return {
      ...row,
      tracked_reads: BigInt(trackedReads),
      untracked_pageviews: BigInt(
        Math.max(Number(row.total_pageviews ?? 0) - trackedReads, 0)
      ),
      avg_read_seconds:
        Number(row.total_pageviews ?? 0) > 0
          ? Math.round(totalReadSeconds / Number(row.total_pageviews))
          : 0,
      avg_tracked_read_seconds: Math.round(
        Number(read?.avg_tracked_read_seconds ?? 0)
      ),
      lt3_reads: BigInt(Number(read?.lt3_reads ?? 0)),
      ge10_reads: BigInt(Number(read?.ge10_reads ?? 0)),
      ge30_reads: BigInt(Number(read?.ge30_reads ?? 0)),
      ge50_reads: BigInt(Number(read?.ge50_reads ?? 0)),
    };
  });

  const summaryRows = (await prisma.$queryRaw`
    WITH events AS (
      SELECT
        e."visitorId" AS visitor_id,
        ${sourceExpr} AS source
      FROM "analytics_events" e
      WHERE ${whereClause}
    )
    SELECT
      COUNT(*) AS total_pageviews,
      COUNT(DISTINCT visitor_id) AS unique_visitors,
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
  `) as SummaryRow[];

  const summary = summaryRows[0];
  const displayedPageviews = rows.reduce(
    (sum, row) => sum + Number(row.total_pageviews ?? 0),
    0
  );
  const displayedTrackedReads = rows.reduce(
    (sum, row) => sum + Number(row.tracked_reads ?? 0),
    0
  );
  const displayedReadSeconds = rows.reduce(
    (sum, row) =>
      sum +
      Number(row.avg_read_seconds ?? 0) * Number(row.total_pageviews ?? 0),
    0
  );
  const displayedTrackedReadSeconds = rows.reduce(
    (sum, row) =>
      sum +
      Number(row.avg_tracked_read_seconds ?? 0) * Number(row.tracked_reads ?? 0),
    0
  );

  return NextResponse.json({
    summary: summary
      ? {
          totalPageviews: Number(summary.total_pageviews ?? 0),
          uniqueVisitors: Number(summary.unique_visitors ?? 0),
          trackedReads: displayedTrackedReads,
          untrackedPageviews: Math.max(displayedPageviews - displayedTrackedReads, 0),
          avgReadSeconds:
            displayedPageviews > 0
              ? Math.round(displayedReadSeconds / displayedPageviews)
              : 0,
          avgTrackedReadSeconds:
            displayedTrackedReads > 0
              ? Math.round(displayedTrackedReadSeconds / displayedTrackedReads)
              : 0,
          readBuckets: {
            lt3: rows.reduce((sum, row) => sum + Number(row.lt3_reads ?? 0), 0),
            ge10: rows.reduce((sum, row) => sum + Number(row.ge10_reads ?? 0), 0),
            ge30: rows.reduce((sum, row) => sum + Number(row.ge30_reads ?? 0), 0),
            ge50: rows.reduce((sum, row) => sum + Number(row.ge50_reads ?? 0), 0),
          },
          sources: {
            direct: {
              pageviews: Number(summary.direct_pageviews ?? 0),
              unique: Number(summary.direct_unique ?? 0),
            },
            facebook: {
              pageviews: Number(summary.facebook_pageviews ?? 0),
              unique: Number(summary.facebook_unique ?? 0),
            },
            instagram: {
              pageviews: Number(summary.instagram_pageviews ?? 0),
              unique: Number(summary.instagram_unique ?? 0),
            },
            googleSearch: {
              pageviews: Number(summary.google_search_pageviews ?? 0),
              unique: Number(summary.google_search_unique ?? 0),
            },
            googleDiscover: {
              pageviews: Number(summary.google_discover_pageviews ?? 0),
              unique: Number(summary.google_discover_unique ?? 0),
            },
            other: {
              pageviews: Number(summary.other_pageviews ?? 0),
              unique: Number(summary.other_unique ?? 0),
            },
          },
        }
      : null,
    rows: rows.map((row) => ({
      websiteId: row.website_id,
      websiteName: row.website_name,
      title: row.title,
      url: row.url,
      totalPageviews: Number(row.total_pageviews ?? 0),
      uniqueVisitors: Number(row.unique_visitors ?? 0),
      trackedReads: Number(row.tracked_reads ?? 0),
      untrackedPageviews: Number(row.untracked_pageviews ?? 0),
      avgReadSeconds: Number(row.avg_read_seconds ?? 0),
      avgTrackedReadSeconds: Number(row.avg_tracked_read_seconds ?? 0),
      readBuckets: {
        lt3: Number(row.lt3_reads ?? 0),
        ge10: Number(row.ge10_reads ?? 0),
        ge30: Number(row.ge30_reads ?? 0),
        ge50: Number(row.ge50_reads ?? 0),
      },
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
