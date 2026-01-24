import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

export async function GET(request: Request) {
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

  const startDate = parseFilterDate(startValue);
  const endDate = parseFilterDate(endValue, true);

  const sessionWhere: {
    websiteId: string;
    startedAt?: { gte?: Date; lte?: Date };
  } = { websiteId };
  if (startDate || endDate) {
    sessionWhere.startedAt = {
      gte: startDate ?? undefined,
      lte: endDate ?? undefined,
    };
  }

  const sessions = await prisma.analyticsSession.findMany({
    where: sessionWhere,
    select: {
      sessionId: true,
      visitorId: true,
      startedAt: true,
      lastSeenAt: true,
    },
  });

  const sessionDurations = sessions.map((session) => ({
    sessionId: session.sessionId,
    visitorId: session.visitorId,
    durationSec: Math.max(
      0,
      Math.round(
        (session.lastSeenAt.getTime() - session.startedAt.getTime()) / 1000
      )
    ),
  }));

  const visitorTotals = new Map<string, number>();
  for (const session of sessionDurations) {
    visitorTotals.set(
      session.visitorId,
      (visitorTotals.get(session.visitorId) ?? 0) + session.durationSec
    );
  }

  const allowedVisitorIds = hideShortReads
    ? new Set(
        [...visitorTotals.entries()]
          .filter(([, total]) => total >= 1)
          .map(([visitorId]) => visitorId)
      )
    : new Set(visitorTotals.keys());

  const filteredSessions = hideShortReads
    ? sessionDurations.filter((session) => allowedVisitorIds.has(session.visitorId))
    : sessionDurations;

  const totalDuration = hideShortReads
    ? [...allowedVisitorIds].reduce(
        (sum, visitorId) => sum + (visitorTotals.get(visitorId) ?? 0),
        0
      )
    : [...visitorTotals.values()].reduce((sum, value) => sum + value, 0);

  const uniqueVisitors = allowedVisitorIds.size;
  const avgDuration =
    uniqueVisitors > 0 ? Math.round(totalDuration / uniqueVisitors) : 0;

  const eventWhere: {
    websiteId: string;
    type: "PAGEVIEW";
    createdAt?: { gte?: Date; lte?: Date };
    sessionId?: { in: string[] };
    visitorId?: { in: string[] };
  } = { websiteId, type: "PAGEVIEW" };

  if (startDate || endDate) {
    eventWhere.createdAt = {
      gte: startDate ?? undefined,
      lte: endDate ?? undefined,
    };
  }

  if (hideShortReads) {
    eventWhere.visitorId = {
      in: allowedVisitorIds.size ? [...allowedVisitorIds] : ["__none__"],
    };
  }

  const totalPageviews = await prisma.analyticsEvent.count({
    where: eventWhere,
  });

  const dailyRange = getIstanbulDayRange();
  const dailySessions = await prisma.analyticsSession.findMany({
    where: {
      websiteId,
      startedAt: {
        gte: dailyRange.start,
        lte: dailyRange.end,
      },
    },
    select: {
      visitorId: true,
      startedAt: true,
      lastSeenAt: true,
    },
  });

  const dailyVisitorTotals = new Map<string, number>();
  for (const session of dailySessions) {
    const duration = Math.max(
      0,
      Math.round((session.lastSeenAt.getTime() - session.startedAt.getTime()) / 1000)
    );
    dailyVisitorTotals.set(
      session.visitorId,
      (dailyVisitorTotals.get(session.visitorId) ?? 0) + duration
    );
  }

  const dailyAllowedVisitorIds = hideShortReads
    ? new Set(
        [...dailyVisitorTotals.entries()]
          .filter(([, total]) => total >= 1)
          .map(([visitorId]) => visitorId)
      )
    : new Set(dailyVisitorTotals.keys());

  const now = new Date();
  const liveThreshold = new Date(now.getTime() - 5 * 60 * 1000);
  const liveSessions = await prisma.analyticsSession.findMany({
    where: {
      websiteId,
      lastSeenAt: { gte: liveThreshold },
    },
    select: { visitorId: true, startedAt: true, lastSeenAt: true },
  });

  const liveVisitorTotals = new Map<string, number>();
  for (const session of liveSessions) {
    const duration = Math.max(
      0,
      Math.round((session.lastSeenAt.getTime() - session.startedAt.getTime()) / 1000)
    );
    liveVisitorTotals.set(
      session.visitorId,
      (liveVisitorTotals.get(session.visitorId) ?? 0) + duration
    );
  }

  const liveAllowedVisitorIds = hideShortReads
    ? new Set(
        [...liveVisitorTotals.entries()]
          .filter(([, total]) => total >= 1)
          .map(([visitorId]) => visitorId)
      )
    : new Set(liveVisitorTotals.keys());

  return NextResponse.json({
    totalPageviews,
    totalDuration,
    avgDuration,
    dailyUniqueVisitors: dailyAllowedVisitorIds.size,
    liveVisitors: liveAllowedVisitorIds.size,
  });
}
