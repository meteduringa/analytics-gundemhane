import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const parseFilterDate = (value: string | null, endOfDay = false) => {
  if (!value) return null;
  const iso = `${value}T${endOfDay ? "23:59:59" : "00:00:00"}+03:00`;
  return new Date(iso);
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const websiteId = searchParams.get("websiteId");
  const startValue = searchParams.get("start");
  const endValue = searchParams.get("end");
  const hideShortReads = searchParams.get("hideShortReads") === "1";
  const limit = Math.min(Number(searchParams.get("limit") ?? 10), 50);

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

  let allowedVisitorIds: Set<string> | null = null;
  if (hideShortReads) {
    const sessions = await prisma.analyticsSession.findMany({
      where: sessionWhere,
      select: {
        visitorId: true,
        startedAt: true,
        lastSeenAt: true,
      },
    });

    const visitorTotals = new Map<string, number>();
    for (const session of sessions) {
      const duration = Math.max(
        0,
        Math.round((session.lastSeenAt.getTime() - session.startedAt.getTime()) / 1000)
      );
      visitorTotals.set(
        session.visitorId,
        (visitorTotals.get(session.visitorId) ?? 0) + duration
      );
    }

    allowedVisitorIds = new Set(
      [...visitorTotals.entries()]
        .filter(([, total]) => total >= 1)
        .map(([visitorId]) => visitorId)
    );
  }

  const eventWhere: {
    websiteId: string;
    type: "PAGEVIEW";
    createdAt?: { gte?: Date; lte?: Date };
    visitorId?: { in: string[] };
  } = { websiteId, type: "PAGEVIEW" };

  if (startDate || endDate) {
    eventWhere.createdAt = {
      gte: startDate ?? undefined,
      lte: endDate ?? undefined,
    };
  }

  if (hideShortReads && allowedVisitorIds) {
    eventWhere.visitorId = {
      in: allowedVisitorIds.size ? [...allowedVisitorIds] : ["__none__"],
    };
  }

  const standardCount = await prisma.analyticsEvent.count({
    where: eventWhere,
  });

  if (standardCount === 0) {
    const bikPages = await prisma.bIKEvent.groupBy({
      by: ["url"],
      where: {
        websiteId,
        type: "PAGE_VIEW",
        ts: {
          gte: startDate ?? undefined,
          lte: endDate ?? undefined,
        },
        isValid: true,
        isSuspicious: false,
      },
      _count: { url: true },
      orderBy: { _count: { url: "desc" } },
      take: limit,
    });

    return NextResponse.json({
      pages: bikPages.map((page) => ({
        url: page.url,
        pageviews: page._count.url,
      })),
    });
  }

  const pages = await prisma.analyticsEvent.groupBy({
    by: ["url"],
    where: eventWhere,
    _count: { url: true },
    orderBy: { _count: { url: "desc" } },
    take: limit,
  });

  return NextResponse.json({
    pages: pages.map((page) => ({
      url: page.url,
      pageviews: page._count.url,
    })),
  });
}
