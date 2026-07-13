import { NextResponse } from "next/server";
import { readPanelSession } from "@/lib/panel-session";
import { computeBikReferenceMetrics } from "@/lib/bik-reference-model";
import {
  istanbulDayString,
  readEventsForDay,
  readRejectionsForDay,
  readTestSites,
  type BikTestStoredEvent,
} from "@/lib/bik-test-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadString = (
  payload: Record<string, unknown>,
  key: string
) => {
  const value = payload[key];
  return typeof value === "string" ? value : value == null ? null : String(value);
};

const referenceEventId = (event: BikTestStoredEvent) =>
  event.eventId || payloadString(event.payload, "pageViewEvent");

const visitorKey = (event: BikTestStoredEvent) =>
  event.visitorId || event.fingerprint || event.ipHash || event.id;

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

  const [events, rejections] = await Promise.all([
    readEventsForDay(day, { siteId: site.id }),
    readRejectionsForDay(day, {
      siteId: site.id,
      websiteIds: [site.websiteId, site.legacyWebsiteId],
    }),
  ]);

  const siteEvents = events.filter((event) => event.siteId === site.id);
  const siteRejections = rejections.filter(
    (event) =>
      event.siteId === site.id ||
      event.websiteId === site.websiteId ||
      event.websiteId === site.legacyWebsiteId
  );
  const recentSiteEvents = siteEvents;
  const recentSiteRejections = siteRejections;
  const referenceMetrics = computeBikReferenceMetrics(
    siteEvents
      .filter((event) => event.isPageview || event.isHeartbeat)
      .map((event) =>
        event.isPageview
          ? {
              eventType: "pageview" as const,
              siteId: event.siteId,
              visitorId: visitorKey(event),
              sessionId: event.sessionId,
              eventId: referenceEventId(event),
              url: event.url || "/",
              referrer: event.referrer,
              ts: event.ts,
              activeSeconds: event.activeSeconds,
              isBot: event.isBot,
            }
          : {
              eventType: "check" as const,
              siteId: event.siteId,
              visitorId: event.visitorId || null,
              sessionId: event.sessionId,
              eventId: referenceEventId(event),
              url: event.url,
              ts: event.ts,
              activeSeconds: event.activeSeconds,
              isBot: event.isBot,
            }
      ),
    { minimumActiveSeconds: 1 }
  );
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
      pageviews: referenceMetrics.daily_pageviews,
      rawPageviews: siteEvents.filter((event) => event.isPageview).length,
      uniqueVisitors: referenceMetrics.daily_unique_visitors,
      directUniqueVisitors: referenceMetrics.daily_direct_unique_visitors,
      sessions: referenceMetrics.daily_sessions,
      heartbeats: siteEvents.filter((event) => event.isHeartbeat).length,
      customEvents: siteEvents.filter(
        (event) => !event.isPageview && !event.isHeartbeat
      ).length,
      botEvents: siteEvents.filter((event) => event.isBot).length,
      avgActiveSeconds: referenceMetrics.daily_avg_time_on_site_seconds,
      diagnostics: referenceMetrics.diagnostics,
    },
    recent,
  });
}
