import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readPanelSession } from "@/lib/panel-session";
import { canAccessPanelWebsite } from "@/lib/panel-website-access";

const parseFilterDate = (value: string | null, endOfDay = false) => {
  if (!value) return null;
  const iso = `${value}T${endOfDay ? "23:59:59" : "00:00:00"}+03:00`;
  return new Date(iso);
};

const getIstanbulDayRange = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayString = formatter.format(date);
  const start = new Date(`${dayString}T00:00:00+03:00`);
  const end = new Date(`${dayString}T23:59:59+03:00`);
  return { start, end };
};

type DurationAggregateRow = {
  unique_visitors: number | bigint | null;
  total_duration: number | bigint | null;
};

type CountRow = {
  count: number | bigint | null;
};

const asNumber = (value: number | bigint | null | undefined) =>
  typeof value === "bigint" ? Number(value) : Number(value ?? 0);

const sessionConditions = (
  websiteId: string,
  startDate?: Date | null,
  endDate?: Date | null,
  field: "startedAt" | "lastSeenAt" = "startedAt"
) => {
  const conditions: Prisma.Sql[] = [Prisma.sql`"websiteId" = ${websiteId}`];
  if (startDate) {
    conditions.push(Prisma.sql`${Prisma.raw(`"${field}"`)} >= ${startDate}`);
  }
  if (endDate) {
    conditions.push(Prisma.sql`${Prisma.raw(`"${field}"`)} <= ${endDate}`);
  }
  return Prisma.join(conditions, " AND ");
};

const eventConditions = (
  websiteId: string,
  startDate?: Date | null,
  endDate?: Date | null
) => {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`"websiteId" = ${websiteId}`,
    Prisma.sql`"type" = 'PAGEVIEW'`,
    Prisma.sql`"mode" = 'RAW'`,
  ];
  if (startDate) {
    conditions.push(Prisma.sql`"createdAt" >= ${startDate}`);
  }
  if (endDate) {
    conditions.push(Prisma.sql`"createdAt" <= ${endDate}`);
  }
  return Prisma.join(conditions, " AND ");
};

const readDurationAggregate = async (
  whereClause: Prisma.Sql,
  hideShortReads: boolean
) => {
  const rows = (await prisma.$queryRaw`
    WITH visitor_totals AS (
      SELECT
        "visitorId",
        SUM(GREATEST(0, EXTRACT(EPOCH FROM ("lastSeenAt" - "startedAt"))))::bigint AS duration_sec
      FROM "analytics_sessions"
      WHERE ${whereClause}
      GROUP BY "visitorId"
    )
    SELECT
      COUNT(*)::int AS unique_visitors,
      COALESCE(SUM(duration_sec), 0)::bigint AS total_duration
    FROM visitor_totals
    WHERE ${hideShortReads ? Prisma.sql`duration_sec >= 1` : Prisma.sql`true`}
  `) as DurationAggregateRow[];

  const row = rows[0];
  return {
    uniqueVisitors: asNumber(row?.unique_visitors),
    totalDuration: asNumber(row?.total_duration),
  };
};

const readPageviewCount = async (
  eventWhereClause: Prisma.Sql,
  sessionWhereClause: Prisma.Sql,
  hideShortReads: boolean
) => {
  if (!hideShortReads) {
    const rows = (await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM "analytics_events"
      WHERE ${eventWhereClause}
    `) as CountRow[];
    return asNumber(rows[0]?.count);
  }

  const rows = (await prisma.$queryRaw`
    WITH visitor_totals AS (
      SELECT
        "visitorId",
        SUM(GREATEST(0, EXTRACT(EPOCH FROM ("lastSeenAt" - "startedAt"))))::bigint AS duration_sec
      FROM "analytics_sessions"
      WHERE ${sessionWhereClause}
      GROUP BY "visitorId"
      HAVING SUM(GREATEST(0, EXTRACT(EPOCH FROM ("lastSeenAt" - "startedAt")))) >= 1
    )
    SELECT COUNT(*)::int AS count
    FROM "analytics_events" events
    WHERE ${eventWhereClause}
      AND EXISTS (
        SELECT 1
        FROM visitor_totals
        WHERE visitor_totals."visitorId" = events."visitorId"
      )
  `) as CountRow[];

  return asNumber(rows[0]?.count);
};

export async function GET(request: Request) {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const websiteId = searchParams.get("websiteId");
  const startValue = searchParams.get("start");
  const endValue = searchParams.get("end");
  const hideShortReads = searchParams.get("hideShortReads") === "1";

  if (!websiteId) {
    return NextResponse.json(
      { error: "websiteId zorunludur." },
      { status: 400 }
    );
  }

  if (!(await canAccessPanelWebsite(session, websiteId))) {
    return NextResponse.json({ error: "Bu firmaya erişim yetkiniz yok." }, { status: 403 });
  }

  const startDate = parseFilterDate(startValue);
  const endDate = parseFilterDate(endValue, true);

  const sessionWhereClause = sessionConditions(websiteId, startDate, endDate);
  const { uniqueVisitors, totalDuration } = await readDurationAggregate(
    sessionWhereClause,
    hideShortReads
  );
  const avgDuration =
    uniqueVisitors > 0 ? Math.round(totalDuration / uniqueVisitors) : 0;

  const totalPageviews = await readPageviewCount(
    eventConditions(websiteId, startDate, endDate),
    sessionWhereClause,
    hideShortReads
  );

  const dailyRange = getIstanbulDayRange();
  const dailyAggregate = await readDurationAggregate(
    sessionConditions(websiteId, dailyRange.start, dailyRange.end),
    hideShortReads
  );

  const now = new Date();
  const liveThreshold = new Date(now.getTime() - 5 * 60 * 1000);
  const liveAggregate = await readDurationAggregate(
    sessionConditions(websiteId, liveThreshold, null, "lastSeenAt"),
    hideShortReads
  );

  return NextResponse.json({
    totalPageviews,
    totalDuration,
    avgDuration,
    dailyUniqueVisitors: dailyAggregate.uniqueVisitors,
    liveVisitors: liveAggregate.uniqueVisitors,
  });
}
