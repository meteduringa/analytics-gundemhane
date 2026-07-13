import { NextResponse } from "next/server";
import { readPanelSession } from "@/lib/panel-session";
import {
  istanbulDayString,
  readEventsForDay,
  readTestSites,
  type BikTestStoredEvent,
} from "@/lib/bik-test-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mask = (value: string | null | undefined) => {
  if (!value) return null;
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
};

const payloadString = (
  payload: Record<string, unknown>,
  key: string
) => {
  const value = payload[key];
  return typeof value === "string" ? value : value == null ? null : String(value);
};

const visitorKey = (event: BikTestStoredEvent) =>
  event.fingerprint ||
  event.visitorId ||
  event.sessionId ||
  event.ipHash ||
  event.id;

const traceType = (event: BikTestStoredEvent) =>
  event.endpoint === "send"
    ? "v2/send"
    : event.isHeartbeat || event.endpoint === "check"
      ? "v2/check/heartbeat"
      : `v2/${event.endpoint}`;

const compactEvent = (event: BikTestStoredEvent) => ({
  id: event.id,
  ts: event.ts,
  type: traceType(event),
  endpoint: event.endpoint,
  eventId: event.eventId || payloadString(event.payload, "pageViewEvent"),
  url: event.url,
  referrer: event.referrer,
  activeSeconds: event.activeSeconds || 0,
  isPageview: event.isPageview,
  isHeartbeat: event.isHeartbeat,
  isBot: event.isBot,
  botReasons: event.botReasons || [],
});

export async function GET(request: Request) {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const day = searchParams.get("date") || istanbulDayString(new Date());
  const siteId = searchParams.get("siteId") || "test-site-ozdiyarbakir";
  const fingerprint = searchParams.get("fingerprint") || "";
  const visitorId = searchParams.get("visitorId") || "";
  const sessionId = searchParams.get("sessionId") || "";
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") || 5), 1),
    20
  );

  const sites = await readTestSites();
  const site = sites.find((item) => item.id === siteId) || null;
  if (!site) {
    return NextResponse.json({ error: "Test sitesi bulunamadi." }, { status: 404 });
  }

  const events = (await readEventsForDay(day, { siteId: site.id }))
    .filter((event) => event.siteId === site.id)
    .filter((event) => event.version === "v2")
    .filter((event) => event.endpoint === "send" || event.endpoint === "check");

  const filtered = events.filter((event) => {
    if (fingerprint) return event.fingerprint === fingerprint;
    if (visitorId) return event.visitorId === visitorId;
    if (sessionId) return event.sessionId === sessionId;
    return true;
  });

  const groups = new Map<string, BikTestStoredEvent[]>();
  for (const event of filtered) {
    const key = visitorKey(event);
    const group = groups.get(key) || [];
    group.push(event);
    groups.set(key, group);
  }

  const visitors = [...groups.entries()]
    .map(([key, group]) => {
      const sorted = group.sort((a, b) => a.ts.localeCompare(b.ts));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const pageviews = sorted.filter((event) => event.isPageview);
      const heartbeats = sorted.filter((event) => event.isHeartbeat);
      const maxActiveSeconds = Math.max(
        0,
        ...sorted.map((event) => event.activeSeconds || 0)
      );

      return {
        key,
        keyMasked: mask(key),
        fingerprint: first?.fingerprint || null,
        fingerprintMasked: mask(first?.fingerprint),
        visitorId: first?.visitorId || null,
        visitorIdMasked: mask(first?.visitorId),
        sessionIds: [...new Set(sorted.map((event) => event.sessionId).filter(Boolean))],
        firstTs: first?.ts || null,
        lastTs: last?.ts || null,
        eventCount: sorted.length,
        sendCount: sorted.filter((event) => event.endpoint === "send").length,
        heartbeatCount: heartbeats.length,
        pageviewCount: pageviews.length,
        maxActiveSeconds,
        isBot: sorted.some((event) => event.isBot),
        urls: [...new Set(sorted.map((event) => event.url).filter(Boolean))].slice(0, 10),
        events: sorted.slice(-25).map(compactEvent),
      };
    })
    .sort((a, b) => String(b.lastTs || "").localeCompare(String(a.lastTs || "")))
    .slice(0, fingerprint || visitorId || sessionId ? 1 : limit);

  return NextResponse.json({
    site: {
      id: site.id,
      name: site.name,
      domain: site.domain,
    },
    day,
    asOf: new Date().toISOString(),
    totalEvents: events.length,
    visitors,
  });
}
