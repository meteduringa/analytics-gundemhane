import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unauthorized = () =>
  NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

const unavailable = () =>
  NextResponse.json(
    { ok: false, error: "CLICKADU_EVENT_STOP_SECRET is not configured." },
    { status: 503 }
  );

function authorized(request: Request) {
  const secret = process.env.CLICKADU_EVENT_STOP_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("x-event-stop-secret")?.trim();
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return header === secret || bearer === secret;
}

function parseDay(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}+03:00`);
}

function landingPath(value: string | null) {
  if (!value) return "";
  try {
    const parsed = new URL(value, "https://example.com");
    return parsed.pathname;
  } catch {
    return value.split("?")[0] || "";
  }
}

const num = (value: unknown) => Number(value ?? 0);

type DiagnosticsRow = {
  metric: string;
  events: bigint;
  sessions: bigint;
  visitors: bigint;
  pageviews: bigint;
};

export async function GET(request: Request) {
  if (!process.env.CLICKADU_EVENT_STOP_SECRET?.trim()) return unavailable();
  if (!authorized(request)) return unauthorized();

  const { searchParams } = new URL(request.url);
  const websiteId = searchParams.get("websiteId")?.trim() || "";
  const date = searchParams.get("date")?.trim() || "";
  const code = searchParams.get("code")?.trim() || "";
  const path = landingPath(searchParams.get("landingPath") || searchParams.get("targetUrl"));
  const startDate = parseDay(date);
  const endDate = parseDay(date, true);

  if (!websiteId || !date || !code || !path || !startDate || !endDate) {
    return NextResponse.json(
      { ok: false, error: "websiteId, date, code ve landingPath zorunludur." },
      { status: 400 }
    );
  }

  const rows = (await prisma.$queryRaw`
    WITH base AS (
      SELECT
        e."id",
        e."sessionId",
        e."visitorId",
        e."url",
        e."eventData",
        e."createdAt",
        rtrim(split_part(e."url", '?', 1), '/') AS clean_path,
        COALESCE(NULLIF(substring(e."url" from '[?&]p=([0-9]+)'), ''), NULLIF(substring(e."url" from '[?&]pg=([0-9]+)'), ''), NULLIF(substring(e."url" from '[?&]page=([0-9]+)'), ''), '1') AS page_no,
        e."eventData"->>'pc_cat' AS event_pc_cat,
        e."eventData"->>'pc_source' AS event_pc_source,
        COALESCE(NULLIF(substring(e."url" from '[?&]ec=([^&#]+)'), ''), '') AS url_ec,
        COALESCE(NULLIF(substring(e."url" from '[?&]pc_cat=([^&#]+)'), ''), '') AS url_pc_cat,
        COALESCE(NULLIF(substring(e."url" from '[?&]c=([^&#]+)'), ''), '') AS url_c
      FROM "analytics_events" e
      WHERE e."websiteId" = ${websiteId}
        AND e."type" = 'PAGEVIEW'
        AND e."mode" = 'RAW'
        AND e."createdAt" >= ${startDate}
        AND e."createdAt" <= ${endDate}
    ),
    landing AS (
      SELECT * FROM base
      WHERE clean_path = rtrim(${path}, '/')
    ),
    anchors AS (
      SELECT DISTINCT ON ("sessionId")
        "sessionId",
        "visitorId",
        "createdAt" AS anchor_at
      FROM landing
      WHERE event_pc_cat = ${code}
         OR url_ec = ${code}
         OR url_pc_cat = ${code}
         OR url_c = ${code}
      ORDER BY "sessionId", "createdAt" ASC
    ),
    chain AS (
      SELECT DISTINCT ON (b."id")
        b.*
      FROM base b
      JOIN anchors a
        ON (b."sessionId" = a."sessionId" OR b."visitorId" = a."visitorId")
       AND b."createdAt" >= a.anchor_at
       AND b."createdAt" <= a.anchor_at + interval '60 minutes'
       AND b.clean_path = rtrim(${path}, '/')
      ORDER BY b."id"
    ),
    metric_rows AS (
      SELECT 'landing_all' AS metric, * FROM landing
      UNION ALL SELECT 'event_pc_cat' AS metric, * FROM landing WHERE event_pc_cat = ${code}
      UNION ALL SELECT 'event_pc_cat_clickadu' AS metric, * FROM landing WHERE event_pc_cat = ${code} AND event_pc_source = 'clickadu'
      UNION ALL SELECT 'url_ec' AS metric, * FROM landing WHERE url_ec = ${code}
      UNION ALL SELECT 'url_pc_cat' AS metric, * FROM landing WHERE url_pc_cat = ${code}
      UNION ALL SELECT 'url_c' AS metric, * FROM landing WHERE url_c = ${code}
      UNION ALL SELECT 'any_token_landing' AS metric, * FROM landing WHERE event_pc_cat = ${code} OR url_ec = ${code} OR url_pc_cat = ${code} OR url_c = ${code}
      UNION ALL SELECT 'any_token_chain' AS metric, * FROM chain
    )
    SELECT
      metric,
      COUNT(*) AS events,
      COUNT(DISTINCT "sessionId") AS sessions,
      COUNT(DISTINCT "visitorId") AS visitors,
      COUNT(DISTINCT concat_ws('|', "visitorId", "sessionId", clean_path, page_no)) AS pageviews
    FROM metric_rows
    GROUP BY metric
    ORDER BY metric
  `) as DiagnosticsRow[];

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    websiteId,
    date,
    code,
    landingPath: path,
    rows: rows.map((row) => ({
      metric: row.metric,
      events: num(row.events),
      sessions: num(row.sessions),
      visitors: num(row.visitors),
      pageviews: num(row.pageviews),
    })),
  });
}
