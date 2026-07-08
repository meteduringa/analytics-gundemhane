import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readPanelSession } from "@/lib/panel-session";
import { canAccessPanelWebsite } from "@/lib/panel-website-access";

const normalizeDateInput = (value: string) => {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const dot = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
  if (dot) return `${dot[3]}-${dot[2]}-${dot[1]}`;
  const slash = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`;
  return null;
};

const parseFilterDate = (value: string | null, endOfDay = false) => {
  if (!value) return null;
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  const date = new Date(`${normalized}T${endOfDay ? "23:59:59" : "00:00:00"}+03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeLandingPath = (value: string | null) => {
  if (!value) return null;
  try {
    return new URL(value).pathname;
  } catch {
    return value.trim();
  }
};

const num = (value: bigint | number | null | undefined) => Number(value ?? 0);

type SummaryRow = {
  anchor_events: bigint;
  anchor_sessions: bigint;
  anchor_visitors: bigint;
  chain_sessions: bigint;
  chain_visitors: bigint;
  raw_chain_events: bigint;
  distinct_session_pageviews: bigint;
  distinct_visitor_pageviews: bigint;
  observed_max_page: number | null;
  manual_raw_events: bigint;
  native_raw_events: bigint;
  exact_token_events: bigint;
  wrong_pc_cat_events: bigint;
};

type PageRow = {
  page_no: number;
  raw_events: bigint;
  sessions: bigint;
  visitors: bigint;
  manual_events: bigint;
  native_events: bigint;
  exact_token_events: bigint;
  wrong_pc_cat_events: bigint;
};

type SessionDepthRow = {
  pages_read: number;
  sessions: bigint;
  visitors: bigint;
};

type PcCatRow = {
  pc_cat: string | null;
  raw_events: bigint;
  sessions: bigint;
  visitors: bigint;
};

export async function GET(request: Request) {
  const session = await readPanelSession();
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const websiteId = searchParams.get("websiteId")?.trim() || "";
  const pcCat = searchParams.get("pcCat")?.trim() || "";
  const landingPath = normalizeLandingPath(searchParams.get("landingUrl"));
  const startDate = parseFilterDate(searchParams.get("start"));
  const endDate = parseFilterDate(searchParams.get("end"), true);
  const expectedPages = Math.max(0, Math.floor(Number(searchParams.get("expectedPages") || 0)));
  const windowMinutes = Math.min(
    Math.max(1, Math.floor(Number(searchParams.get("windowMinutes") || 60))),
    240
  );

  if (!websiteId || !pcCat || !landingPath) {
    return NextResponse.json(
      { error: "websiteId, pcCat ve landingUrl zorunludur." },
      { status: 400 }
    );
  }
  if (searchParams.get("start") && !startDate) {
    return NextResponse.json({ error: "Başlangıç tarihi geçersiz." }, { status: 400 });
  }
  if (searchParams.get("end") && !endDate) {
    return NextResponse.json({ error: "Bitiş tarihi geçersiz." }, { status: 400 });
  }
  if (!(await canAccessPanelWebsite(session, websiteId))) {
    return NextResponse.json({ error: "Bu firmaya erişim yetkiniz yok." }, { status: 403 });
  }

  const baseEventConditions: Prisma.Sql[] = [
    Prisma.sql`e."websiteId" = ${websiteId}`,
    Prisma.sql`e."type" = 'PAGEVIEW'`,
    Prisma.sql`e."mode" = 'RAW'`,
    Prisma.sql`rtrim(split_part(e."url", '?', 1), '/') = rtrim(${landingPath}, '/')`,
  ];
  if (startDate) baseEventConditions.push(Prisma.sql`e."createdAt" >= ${startDate}`);
  if (endDate) baseEventConditions.push(Prisma.sql`e."createdAt" <= ${endDate}`);

  const chainEventConditions: Prisma.Sql[] = [
    Prisma.sql`ce."websiteId" = ${websiteId}`,
    Prisma.sql`ce."type" = 'PAGEVIEW'`,
    Prisma.sql`ce."mode" = 'RAW'`,
    Prisma.sql`rtrim(split_part(ce."url", '?', 1), '/') = rtrim(${landingPath}, '/')`,
  ];
  if (startDate) chainEventConditions.push(Prisma.sql`ce."createdAt" >= ${startDate}`);
  if (endDate) chainEventConditions.push(Prisma.sql`ce."createdAt" <= ${endDate}`);

  const baseWhere = Prisma.join(baseEventConditions, " AND ");
  const chainWhere = Prisma.join(chainEventConditions, " AND ");

  const chainSql = Prisma.sql`
    WITH anchor_events AS (
      SELECT
        e."sessionId" AS session_id,
        e."visitorId" AS visitor_id,
        e."createdAt" AS anchor_at
      FROM "analytics_events" e
      WHERE ${baseWhere}
        AND e."eventData"->>'pc_cat' = ${pcCat}
    ),
    matched AS (
      SELECT DISTINCT ON (session_id)
        session_id,
        visitor_id,
        anchor_at
      FROM anchor_events
      ORDER BY session_id, anchor_at ASC
    ),
    chain_events AS (
      SELECT DISTINCT ON (ce.id)
        ce.id,
        ce."sessionId" AS session_id,
        ce."visitorId" AS visitor_id,
        ce."createdAt" AS created_at,
        ce."url" AS url,
        ce."eventData"->>'pc_cat' AS event_pc_cat,
        ce."eventData"->>'source' AS event_source,
        COALESCE(
          NULLIF(ce."eventData"->>'gallery_page', ''),
          NULLIF(substring(ce."url" from '[?&]p=([0-9]+)'), ''),
          NULLIF(substring(ce."url" from '[?&]pg=([0-9]+)'), ''),
          NULLIF(substring(ce."url" from '[?&]page=([0-9]+)'), ''),
          '1'
        ) AS page_text
      FROM "analytics_events" ce
      JOIN matched m
        ON (ce."sessionId" = m.session_id OR ce."visitorId" = m.visitor_id)
       AND ce."createdAt" >= m.anchor_at
       AND ce."createdAt" <= m.anchor_at + (${windowMinutes} * interval '1 minute')
      WHERE ${chainWhere}
      ORDER BY ce.id, m.anchor_at ASC
    ),
    clean_chain AS (
      SELECT
        id,
        session_id,
        visitor_id,
        created_at,
        url,
        event_pc_cat,
        event_source,
        CASE WHEN page_text ~ '^[0-9]+$' THEN page_text::int ELSE 1 END AS page_no
      FROM chain_events
    )
  `;

  const summaryRows = (await prisma.$queryRaw`
    ${chainSql},
    session_pages AS (
      SELECT
        session_id,
        visitor_id,
        COUNT(DISTINCT page_no) AS pages_read,
        MAX(page_no) AS max_page
      FROM clean_chain
      GROUP BY session_id, visitor_id
    )
    SELECT
      (SELECT COUNT(*) FROM anchor_events) AS anchor_events,
      (SELECT COUNT(*) FROM matched) AS anchor_sessions,
      (SELECT COUNT(DISTINCT visitor_id) FROM matched) AS anchor_visitors,
      COUNT(DISTINCT c.session_id) AS chain_sessions,
      COUNT(DISTINCT c.visitor_id) AS chain_visitors,
      COUNT(c.id) AS raw_chain_events,
      COUNT(DISTINCT concat_ws('|', c.session_id, c.page_no)) AS distinct_session_pageviews,
      COUNT(DISTINCT concat_ws('|', c.visitor_id, c.page_no)) AS distinct_visitor_pageviews,
      MAX(c.page_no) AS observed_max_page,
      COUNT(c.id) FILTER (WHERE c.event_source = 'elmas-ec-gallery-scroll') AS manual_raw_events,
      COUNT(c.id) FILTER (WHERE COALESCE(c.event_source, '') <> 'elmas-ec-gallery-scroll') AS native_raw_events,
      COUNT(c.id) FILTER (WHERE c.event_pc_cat = ${pcCat}) AS exact_token_events,
      COUNT(c.id) FILTER (WHERE c.event_pc_cat IS NOT NULL AND c.event_pc_cat <> ${pcCat}) AS wrong_pc_cat_events
    FROM clean_chain c
    LEFT JOIN session_pages sp ON sp.session_id = c.session_id
  `) as SummaryRow[];

  const pageRows = (await prisma.$queryRaw`
    ${chainSql}
    SELECT
      page_no,
      COUNT(*) AS raw_events,
      COUNT(DISTINCT session_id) AS sessions,
      COUNT(DISTINCT visitor_id) AS visitors,
      COUNT(*) FILTER (WHERE event_source = 'elmas-ec-gallery-scroll') AS manual_events,
      COUNT(*) FILTER (WHERE COALESCE(event_source, '') <> 'elmas-ec-gallery-scroll') AS native_events,
      COUNT(*) FILTER (WHERE event_pc_cat = ${pcCat}) AS exact_token_events,
      COUNT(*) FILTER (WHERE event_pc_cat IS NOT NULL AND event_pc_cat <> ${pcCat}) AS wrong_pc_cat_events
    FROM clean_chain
    GROUP BY page_no
    ORDER BY page_no ASC
  `) as PageRow[];

  const sessionDepthRows = (await prisma.$queryRaw`
    ${chainSql},
    session_pages AS (
      SELECT
        session_id,
        visitor_id,
        COUNT(DISTINCT page_no) AS pages_read
      FROM clean_chain
      GROUP BY session_id, visitor_id
    )
    SELECT
      pages_read::int AS pages_read,
      COUNT(*) AS sessions,
      COUNT(DISTINCT visitor_id) AS visitors
    FROM session_pages
    GROUP BY pages_read
    ORDER BY pages_read ASC
  `) as SessionDepthRow[];

  const pcCatRows = (await prisma.$queryRaw`
    ${chainSql}
    SELECT
      event_pc_cat AS pc_cat,
      COUNT(*) AS raw_events,
      COUNT(DISTINCT session_id) AS sessions,
      COUNT(DISTINCT visitor_id) AS visitors
    FROM clean_chain
    GROUP BY event_pc_cat
    ORDER BY raw_events DESC
    LIMIT 20
  `) as PcCatRow[];

  const summary = summaryRows[0];
  const sessions = num(summary?.anchor_sessions);
  const pageviews = num(summary?.distinct_session_pageviews);
  const observedMaxPage = num(summary?.observed_max_page);
  const completionPage = expectedPages || observedMaxPage;
  const completedSessions = completionPage
    ? pageRows
        .filter((row) => Number(row.page_no) >= completionPage)
        .reduce((max, row) => Math.max(max, num(row.sessions)), 0)
    : 0;

  return NextResponse.json({
    engine: "gallery-analysis-v2",
    usesOldSourceAnalysis: false,
    websiteId,
    pcCat,
    landingPath,
    start: searchParams.get("start") ?? null,
    end: searchParams.get("end") ?? null,
    expectedPages: expectedPages || null,
    windowMinutes,
    summary: {
      anchorEvents: num(summary?.anchor_events),
      sessions,
      visitors: num(summary?.anchor_visitors),
      chainSessions: num(summary?.chain_sessions),
      chainVisitors: num(summary?.chain_visitors),
      rawChainEvents: num(summary?.raw_chain_events),
      galleryPageviews: pageviews,
      visitorGalleryPageviews: num(summary?.distinct_visitor_pageviews),
      averagePagesPerSession: sessions ? Number((pageviews / sessions).toFixed(2)) : 0,
      observedMaxPage,
      completedSessions,
      completionRate: sessions ? Math.round((completedSessions / sessions) * 100) : 0,
      manualRawEvents: num(summary?.manual_raw_events),
      nativeRawEvents: num(summary?.native_raw_events),
      exactTokenEvents: num(summary?.exact_token_events),
      wrongPcCatEvents: num(summary?.wrong_pc_cat_events),
    },
    pages: pageRows.map((row) => ({
      page: Number(row.page_no),
      rawEvents: num(row.raw_events),
      sessions: num(row.sessions),
      visitors: num(row.visitors),
      manualEvents: num(row.manual_events),
      nativeEvents: num(row.native_events),
      exactTokenEvents: num(row.exact_token_events),
      wrongPcCatEvents: num(row.wrong_pc_cat_events),
    })),
    sessionDepth: sessionDepthRows.map((row) => ({
      pagesRead: Number(row.pages_read),
      sessions: num(row.sessions),
      visitors: num(row.visitors),
    })),
    pcCatBreakdown: pcCatRows.map((row) => ({
      pcCat: row.pc_cat ?? "[NULL]",
      rawEvents: num(row.raw_events),
      sessions: num(row.sessions),
      visitors: num(row.visitors),
    })),
  });
}
