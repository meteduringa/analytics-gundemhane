import { prisma } from "@/lib/prisma";
import { getBikConfig } from "@/lib/bik-config";
import { getIstanbulDayRange } from "@/lib/bik-time";

export const getBikDayMetrics = async (siteId: string, dayDate: Date) => {
  const { start, end, dayString } = getIstanbulDayRange(dayDate);
  const config = await getBikConfig(siteId);
  const includeSuspiciousInCounted = config.suspiciousSoftMode !== false;

  const sessionWhere: {
    websiteId: string;
    startedAt: { gte: Date; lte: Date };
    engagementMs: { gte: number };
    isSuspicious?: boolean;
  } = {
    websiteId: siteId,
    startedAt: {
      gte: start,
      lte: end,
    },
    engagementMs: { gte: 1000 },
  };

  if (!includeSuspiciousInCounted) {
    sessionWhere.isSuspicious = false;
  }

  const validSessions = await prisma.bIKSession.findMany({
    where: sessionWhere,
    select: {
      sessionId: true,
      visitorId: true,
      isDirect: true,
      engagementMs: true,
      countryCode: true,
    },
  });

  const sessionIds = validSessions.map((session) => session.sessionId);
  const uniqueVisitors = new Set(validSessions.map((session) => session.visitorId));
  const directVisitors = new Set(
    validSessions.filter((session) => session.isDirect).map((session) => session.visitorId)
  );

  const totalEngagementMs = validSessions.reduce(
    (sum, session) => sum + (session.engagementMs ?? 0),
    0
  );

  const pageviews = await prisma.bIKEvent.count({
    where: {
      websiteId: siteId,
      type: "PAGE_VIEW",
      ts: {
        gte: start,
        lte: end,
      },
      sessionId: { in: sessionIds.length ? sessionIds : ["__none__"] },
    },
  });

  const directRatio =
    uniqueVisitors.size > 0 ? directVisitors.size / uniqueVisitors.size : 0;

  const visitorCountries = new Map<string, boolean>();
  for (const session of validSessions) {
    const isNonTr =
      session.countryCode && session.countryCode !== "TR" ? true : false;
    visitorCountries.set(
      session.visitorId,
      (visitorCountries.get(session.visitorId) ?? false) || isNonTr
    );
  }

  const nonTrCount = [...visitorCountries.values()].filter(Boolean).length;
  const trCount = uniqueVisitors.size - nonTrCount;
  const foreignAdjusted =
    config.category === "GENEL"
      ? trCount + Math.round(nonTrCount * 0.1)
      : uniqueVisitors.size;

  const dailyAvgSeconds =
    validSessions.length > 0
      ? Math.round(totalEngagementMs / 1000 / validSessions.length)
      : 0;

  return {
    date: dayString,
    daily_unique_visitors: uniqueVisitors.size,
    daily_direct_unique_visitors: directVisitors.size,
    daily_pageviews: pageviews,
    daily_sessions: validSessions.length,
    daily_avg_time_on_site_seconds: dailyAvgSeconds,
    direct_ratio: directRatio,
    foreign_traffic_adjusted: foreignAdjusted,
    category: config.category,
  };
};
