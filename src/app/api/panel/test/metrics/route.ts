import { NextResponse } from "next/server";
import { readPanelSession } from "@/lib/panel-session";
import {
  istanbulDayString,
  readEventsForDay,
  readRecentEvents,
  readRecentRejections,
  readRejectionsForDay,
  readTestSites,
  type BikTestStoredEvent,
} from "@/lib/bik-test-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sameDay = (event: BikTestStoredEvent, day: string) =>
  istanbulDayString(new Date(event.ts)) === day;

export async function GET(request: Request) {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId") || "";
  const day = searchParams.get("date") || istanbulDayString(new Date());
  const sites = await readTestSites();
  const site = sites.find((item) => item.id === siteId) || sites[0] || null;
  if (!site) {
    return NextResponse.json({ error: "Test sitesi bulunamadi." }, { status: 404 });
  }

  const [events, rejections, recentEvents, recentRejections] = await Promise.all([
    readEventsForDay(day),
    readRejectionsForDay(day),
    readRecentEvents(20000),
    readRecentRejections(5000),
  ]);

  const siteEvents = events.filter(
    (event) => event.siteId === site.id && sameDay(event, day)
  );
  const siteRejections = rejections.filter(
    (event) =>
      (event.siteId === site.id || event.websiteId === site.websiteId || event.websiteId === site.legacyWebsiteId) &&
      sameDay(event, day)
  );
  const recentSiteEvents = recentEvents.filter(
    (event) => event.siteId === site.id && sameDay(event, day)
  );
  const recentSiteRejections = recentRejections.filter(
    (event) =>
      (event.siteId === site.id || event.websiteId === site.websiteId || event.websiteId === site.legacyWebsiteId) &&
      sameDay(event, day)
  );
  const countedPageviews = siteEvents.filter(
    (event) => event.isPageview && !event.isBot
  );
  const uniqueVisitors = new Set(
    countedPageviews.map((event) => event.visitorId || event.fingerprint || event.ipHash)
  );
  const directVisitors = new Set(
    countedPageviews
      .filter((event) => event.isDirect)
      .map((event) => event.visitorId || event.fingerprint || event.ipHash)
  );
  const sessions = new Set(
    siteEvents.map((event) => event.sessionId).filter(Boolean)
  );
  const activeBySession = new Map<string, number>();
  for (const event of siteEvents) {
    const key = event.sessionId || event.visitorId || event.id;
    const current = activeBySession.get(key) || 0;
    activeBySession.set(key, Math.max(current, event.activeSeconds || 0));
  }
  const activeSeconds = [...activeBySession.values()].reduce(
    (sum, value) => sum + value,
    0
  );
  const avgActiveSeconds = uniqueVisitors.size
    ? Math.round(activeSeconds / uniqueVisitors.size)
    : 0;
  const recent = [...recentSiteEvents, ...recentSiteRejections]
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 30);

  return NextResponse.json({
    site,
    day,
    asOf: new Date().toISOString(),
    metrics: {
      accepted: siteEvents.length,
      rejected: siteRejections.length,
      pageviews: countedPageviews.length,
      rawPageviews: siteEvents.filter((event) => event.isPageview).length,
      uniqueVisitors: uniqueVisitors.size,
      directUniqueVisitors: directVisitors.size,
      sessions: sessions.size,
      heartbeats: siteEvents.filter((event) => event.isHeartbeat).length,
      customEvents: siteEvents.filter(
        (event) => !event.isPageview && !event.isHeartbeat
      ).length,
      botEvents: siteEvents.filter((event) => event.isBot).length,
      avgActiveSeconds,
    },
    recent,
  });
}
