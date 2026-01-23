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
      Math.round((session.lastSeenAt.getTime() - session.startedAt.getTime()) / 1000)
    ),
  }));

  const filteredSessions = hideShortReads
    ? sessionDurations.filter((session) => session.durationSec >= 1)
    : sessionDurations;

  const totalDuration = filteredSessions.reduce(
    (sum, session) => sum + session.durationSec,
    0
  );

  const uniqueVisitors = new Set(
    filteredSessions.map((session) => session.visitorId)
  );
  const avgDuration =
    uniqueVisitors.size > 0
      ? Math.round(totalDuration / uniqueVisitors.size)
      : 0;

  const sessionIds = filteredSessions.map((session) => session.sessionId);

  const eventWhere: {
    websiteId: string;
    type: "PAGEVIEW";
    createdAt?: { gte?: Date; lte?: Date };
    sessionId?: { in: string[] };
  } = { websiteId, type: "PAGEVIEW" };

  if (startDate || endDate) {
    eventWhere.createdAt = {
      gte: startDate ?? undefined,
      lte: endDate ?? undefined,
    };
  }

  if (hideShortReads) {
    eventWhere.sessionId = { in: sessionIds.length ? sessionIds : ["__none__"] };
  }

  const totalPageviews = await prisma.analyticsEvent.count({
    where: eventWhere,
  });

  const dailyRange = getIstanbulDayRange();
  const dailyEvents = await prisma.analyticsEvent.findMany({
    where: {
      websiteId,
      type: "PAGEVIEW",
      createdAt: {
        gte: dailyRange.start,
        lte: dailyRange.end,
      },
    },
    select: { visitorId: true },
    distinct: ["visitorId"],
  });

  const now = new Date();
  const liveThreshold = new Date(now.getTime() - 5 * 60 * 1000);
  const liveSessions = await prisma.analyticsSession.findMany({
    where: {
      websiteId,
      lastSeenAt: { gte: liveThreshold },
    },
    select: { visitorId: true },
    distinct: ["visitorId"],
  });

  return NextResponse.json({
    totalPageviews,
    totalDuration,
    avgDuration,
    dailyUniqueVisitors: dailyEvents.length,
    liveVisitors: liveSessions.length,
  });
}
