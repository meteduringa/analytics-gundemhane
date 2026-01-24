import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBikConfig } from "@/lib/bik-config";
import { getIstanbulDayRange, parseDayParam } from "@/lib/bik-time";

export const runtime = "nodejs";

const AD_BLOCK_WINDOW_MS = 30_000;

const pickBestSource = (current: string | null, incoming: string | null) => {
  const priority: Record<string, number> = {
    cookie: 3,
    localStorage: 2,
    ephemeral: 1,
  };
  if (!incoming) return current;
  if (!current) return incoming;
  return priority[incoming] > priority[current] ? incoming : current;
};

const hasPageviewWithin = (timestamps: number[], ts: number, windowMs: number) => {
  let left = 0;
  let right = timestamps.length - 1;
  let candidate = -1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (timestamps[mid] >= ts) {
      candidate = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  if (candidate === -1) return false;
  return timestamps[candidate] <= ts + windowMs;
};

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const siteId = url.searchParams.get("siteId");
  const dayParam = url.searchParams.get("date");
  const dayDate = parseDayParam(dayParam);

  if (!siteId || !dayDate) {
    return NextResponse.json(
      { error: "Missing siteId or date." },
      { status: 400 }
    );
  }

  if (session.user.role !== "ADMIN") {
    const link = await prisma.analyticsUserWebsite.findUnique({
      where: {
        userId_websiteId: {
          userId: session.user.id,
          websiteId: siteId,
        },
      },
    });
    if (!link) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  }

  const { start, end, dayString } = getIstanbulDayRange(dayDate);
  const config = await getBikConfig(siteId);

  const sessions = await prisma.bIKSession.findMany({
    where: {
      websiteId: siteId,
      startedAt: { gte: start, lte: end },
    },
    select: {
      sessionId: true,
      visitorId: true,
      engagementMs: true,
      isSuspicious: true,
      countryCode: true,
    },
  });

  const rawSessions = sessions.length;
  const rawVisitors = new Set(sessions.map((session) => session.visitorId));
  const rawEngagementMs = sessions.reduce(
    (sum, session) => sum + (session.engagementMs ?? 0),
    0
  );

  const invalidSessions = sessions.filter(
    (session) => (session.engagementMs ?? 0) < 1000
  );
  const suspiciousSessions = sessions.filter((session) => session.isSuspicious);

  const countedSessions = sessions.filter(
    (session) => (session.engagementMs ?? 0) >= 1000 && !session.isSuspicious
  );
  const countedVisitors = new Set(
    countedSessions.map((session) => session.visitorId)
  );

  const countedEngagementMs = countedSessions.reduce(
    (sum, session) => sum + (session.engagementMs ?? 0),
    0
  );

  const visitorCountries = new Map<string, boolean>();
  for (const session of countedSessions) {
    const isNonTr =
      session.countryCode && session.countryCode !== "TR" ? true : false;
    visitorCountries.set(
      session.visitorId,
      (visitorCountries.get(session.visitorId) ?? false) || isNonTr
    );
  }
  const nonTrCount = [...visitorCountries.values()].filter(Boolean).length;
  const trCount = countedVisitors.size - nonTrCount;
  const foreignAdjusted =
    config.category === "GENEL"
      ? trCount + Math.round(nonTrCount * 0.1)
      : countedVisitors.size;

  const [rawPageviews, countedPageviews, routeChangePageviews] =
    await Promise.all([
      prisma.bIKEvent.count({
        where: {
          websiteId: siteId,
          type: "PAGE_VIEW",
          ts: { gte: start, lte: end },
        },
      }),
      prisma.bIKEvent.count({
        where: {
          websiteId: siteId,
          type: "PAGE_VIEW",
          isValid: true,
          ts: { gte: start, lte: end },
        },
      }),
      prisma.bIKEvent.count({
        where: {
          websiteId: siteId,
          type: "PAGE_VIEW",
          isRouteChange: true,
          ts: { gte: start, lte: end },
        },
      }),
    ]);

  const dedupedAggregate = await prisma.bIKRollupMinute.aggregate({
    where: {
      websiteId: siteId,
      minuteTs: { gte: start, lte: end },
    },
    _sum: { dedupedPageviews: true },
  });

  const [renderPings, pageviews, sourceEvents, errorGroups] = await Promise.all([
    prisma.bIKEvent.findMany({
      where: {
        websiteId: siteId,
        type: "RENDER_PING",
        ts: { gte: start, lte: end },
      },
      select: { sessionId: true, url: true, ts: true },
    }),
    prisma.bIKEvent.findMany({
      where: {
        websiteId: siteId,
        type: "PAGE_VIEW",
        ts: { gte: start, lte: end },
      },
      select: { sessionId: true, url: true, ts: true },
    }),
    prisma.bIKEvent.findMany({
      where: {
        websiteId: siteId,
        type: { in: ["PAGE_VIEW", "RENDER_PING"] },
        visitorIdSource: { not: null },
        ts: { gte: start, lte: end },
      },
      select: { visitorId: true, visitorIdSource: true },
    }),
    prisma.bIKEvent.groupBy({
      by: ["errorCode"],
      where: {
        websiteId: siteId,
        type: "CLIENT_ERROR",
        errorCode: { not: null },
        ts: { gte: start, lte: end },
      },
      _count: { errorCode: true },
    }),
  ]);

  const pageviewMap = new Map<string, number[]>();
  for (const pv of pageviews) {
    const key = `${pv.sessionId}::${pv.url}`;
    const list = pageviewMap.get(key) ?? [];
    list.push(pv.ts.getTime());
    pageviewMap.set(key, list);
  }
  for (const list of pageviewMap.values()) {
    list.sort((a, b) => a - b);
  }

  let adblockSuspectCount = 0;
  for (const ping of renderPings) {
    const key = `${ping.sessionId}::${ping.url}`;
    const list = pageviewMap.get(key) ?? [];
    if (!hasPageviewWithin(list, ping.ts.getTime(), AD_BLOCK_WINDOW_MS)) {
      adblockSuspectCount += 1;
    }
  }

  const visitorSourceMap = new Map<string, string>();
  for (const event of sourceEvents) {
    const current = visitorSourceMap.get(event.visitorId) ?? null;
    const best = pickBestSource(current, event.visitorIdSource);
    if (best) visitorSourceMap.set(event.visitorId, best);
  }
  const sourceDistribution = { cookie: 0, localStorage: 0, ephemeral: 0 };
  for (const source of visitorSourceMap.values()) {
    if (source === "cookie") sourceDistribution.cookie += 1;
    else if (source === "localStorage") sourceDistribution.localStorage += 1;
    else sourceDistribution.ephemeral += 1;
  }

  const errorCodes: Record<string, number> = {};
  for (const group of errorGroups) {
    if (!group.errorCode) continue;
    errorCodes[group.errorCode] = group._count.errorCode;
  }

  const rawEngagementAvg =
    rawSessions > 0 ? Math.round(rawEngagementMs / 1000 / rawSessions) : 0;
  const countedEngagementAvg =
    countedSessions.length > 0
      ? Math.round(countedEngagementMs / 1000 / countedSessions.length)
      : 0;

  return NextResponse.json({
    date: dayString,
    raw_uniques: rawVisitors.size,
    raw_sessions: rawSessions,
    raw_pageviews: rawPageviews,
    render_ping_count: renderPings.length,
    raw_engagement_avg: rawEngagementAvg,
    counted_uniques: foreignAdjusted,
    counted_sessions: countedSessions.length,
    counted_pageviews: countedPageviews,
    counted_engagement_avg: countedEngagementAvg,
    invalid_sessions_count: invalidSessions.length,
    suspicious_sessions_count: suspiciousSessions.length,
    adblock_suspect_count: adblockSuspectCount,
    route_change_pv_count: routeChangePageviews,
    deduped_pv_count: dedupedAggregate._sum.dedupedPageviews ?? 0,
    visitor_id_source: sourceDistribution,
    error_codes: errorCodes,
  });
}
