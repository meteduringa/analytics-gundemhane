import { NextResponse } from "next/server";
import { readPanelSession } from "@/lib/panel-session";
import { computeBikReferenceMetrics } from "@/lib/bik-reference-model";
import {
  istanbulDayString,
  readEventsForDay,
  readRejectionsForDay,
  readTestSites,
  type BikTestSite,
  type BikTestStoredEvent,
} from "@/lib/bik-test-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METRICS_CACHE_TTL_MS = 30_000;
const METRICS_STALE_TTL_MS = 10 * 60_000;
const metricsCache = new Map<
  string,
  {
    freshUntil: number;
    staleUntil: number;
    payload?: MetricsPayload;
    pending?: Promise<MetricsPayload>;
  }
>();

type MetricsPayload = {
  site: BikTestSite;
  day: string;
  asOf: string;
  metrics: {
    accepted: number;
    rejected: number;
    pageviews: number;
    rawPageviews: number;
    uniqueVisitors: number;
    directUniqueVisitors: number;
    sessions: number;
    heartbeats: number;
    customEvents: number;
    botEvents: number;
    avgActiveSeconds: number;
    diagnostics: unknown;
  };
  recent: ReturnType<typeof compactRecentEvent>[];
};

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

const compactRecentEvent = (event: BikTestStoredEvent) => ({
  id: event.id,
  ts: event.ts,
  version: event.version,
  endpoint: event.endpoint,
  accepted: event.accepted,
  rejectReason: event.rejectReason,
  isBot: event.isBot,
  isPageview: event.isPageview,
  isHeartbeat: event.isHeartbeat,
  hostname: event.hostname,
  url: event.url,
  name: event.name,
  activeSeconds: event.activeSeconds,
});

const buildMetricsPayload = async (
  site: BikTestSite,
  day: string
): Promise<MetricsPayload> => {
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

  let rawPageviews = 0;
  let heartbeats = 0;
  let customEvents = 0;
  let botEvents = 0;
  const referenceEvents = [];

  for (const event of siteEvents) {
    if (event.isPageview) rawPageviews += 1;
    if (event.isHeartbeat) heartbeats += 1;
    if (!event.isPageview && !event.isHeartbeat) customEvents += 1;
    if (event.isBot) botEvents += 1;
    if (!event.isPageview && !event.isHeartbeat) continue;
    referenceEvents.push(
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
    );
  }

  const referenceMetrics = computeBikReferenceMetrics(referenceEvents, {
    minimumActiveSeconds: 1,
  });
  const recent = [
    ...recentSiteEvents.slice(-30),
    ...recentSiteRejections.slice(-30),
  ]
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 30)
    .map(compactRecentEvent);

  return {
    site,
    day,
    asOf: new Date().toISOString(),
    metrics: {
      accepted: siteEvents.length,
      rejected: siteRejections.length,
      pageviews: referenceMetrics.daily_pageviews,
      rawPageviews,
      uniqueVisitors: referenceMetrics.daily_unique_visitors,
      directUniqueVisitors: referenceMetrics.daily_direct_unique_visitors,
      sessions: referenceMetrics.daily_sessions,
      heartbeats,
      customEvents,
      botEvents,
      avgActiveSeconds: referenceMetrics.daily_avg_time_on_site_seconds,
      diagnostics: referenceMetrics.diagnostics,
    },
    recent,
  };
};

const refreshMetricsCache = (cacheKey: string, site: BikTestSite, day: string) => {
  const pending = buildMetricsPayload(site, day).then((payload) => {
    metricsCache.set(cacheKey, {
      freshUntil: Date.now() + METRICS_CACHE_TTL_MS,
      staleUntil: Date.now() + METRICS_STALE_TTL_MS,
      payload,
    });
    return payload;
  });
  const existing = metricsCache.get(cacheKey);
  metricsCache.set(cacheKey, {
    freshUntil: existing?.freshUntil || 0,
    staleUntil: existing?.staleUntil || 0,
    payload: existing?.payload,
    pending,
  });
  return pending;
};

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

  const cacheKey = `${day}:${site.id}`;
  const cached = metricsCache.get(cacheKey);
  const now = Date.now();
  if (cached?.payload && cached.freshUntil > now) {
    return NextResponse.json(cached.payload);
  }
  if (cached?.payload && cached.staleUntil > now) {
    if (!cached.pending) {
      void refreshMetricsCache(cacheKey, site, day).catch(() => undefined);
    }
    return NextResponse.json(cached.payload);
  }
  const payload = await (cached?.pending || refreshMetricsCache(cacheKey, site, day));

  return NextResponse.json(payload);
}
