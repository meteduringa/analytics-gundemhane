import { prisma } from "@/lib/prisma";
import { getIstanbulDayRange } from "@/lib/bik-time";
import {
  computeBikReferenceMetrics,
  type BikReferenceEvent,
} from "@/lib/bik-reference-model";

const DEDUPE_WINDOW_MS = 1500;
const SESSION_INACTIVITY_MINUTES = 35;
const MAX_GAP_FOR_TIME_SECONDS = 1800;
const LAST_PAGE_ESTIMATE_SECONDS = 30;
const MIN_VISITOR_SECONDS = 1;

const normalizeUrl = (value: string) => {
  try {
    const parsed = new URL(value, "https://example.com");
    parsed.hash = "";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return value.split("#")[0] ?? value;
  }
};

const CAMPAIGN_KEYS = new Set([
  "gclid",
  "fbclid",
  "igshid",
  "msclkid",
  "yclid",
  "_openstat",
  "pc_source",
  "pc_cat",
  "ec",
]);

const hasCampaignParams = (value: string) => {
  try {
    const parsed = new URL(value, "https://example.com");
    const params = parsed.searchParams;
    for (const key of params.keys()) {
      const normalized = key.toLowerCase();
      if (normalized.startsWith("utm_")) return true;
      if (CAMPAIGN_KEYS.has(normalized)) {
        return true;
      }
    }
    return false;
  } catch {
    const lowered = value.toLowerCase();
    return (
      lowered.includes("utm_") ||
      lowered.includes("gclid=") ||
      lowered.includes("fbclid=") ||
      lowered.includes("igshid=") ||
      lowered.includes("msclkid=") ||
      lowered.includes("yclid=") ||
      lowered.includes("_openstat=") ||
      lowered.includes("pc_source=") ||
      lowered.includes("pc_cat=") ||
      lowered.includes("ec=")
    );
  }
};

const hasCampaignEventData = (value: unknown) => {
  if (!value || typeof value !== "object") return false;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (normalized.startsWith("utm_")) return true;
    if (CAMPAIGN_KEYS.has(normalized)) return true;
  }
  return false;
};

const normalizeHost = (value: string | null) => {
  if (!value) return "";
  try {
    const parsed = new URL(value, "https://example.com");
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return value.replace(/^www\./, "").toLowerCase();
  }
};

type SimpleEvent = {
  id: string;
  visitorId: string;
  sessionId: string;
  url: string;
  referrer: string | null;
  eventData: unknown;
  createdAt: Date;
  clientTimestamp: Date | null;
  countryCode: string | null;
};

type PingEvent = {
  id: string;
  visitorId: string;
  sessionId: string;
  url: string;
  referrer: string | null;
  createdAt: Date;
  clientTimestamp: Date | null;
  eventData: unknown;
  countryCode: string | null;
};

export type SimpleMetricsMode = "AUTO" | "RAW" | "BIK_STRICT";

const extractPcSource = (value: unknown) => {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>).pc_source;
  return typeof raw === "string" ? raw : null;
};

const eventDataObject = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const dataString = (value: unknown, key: string) => {
  const raw = eventDataObject(value)[key];
  return typeof raw === "string" ? raw : raw == null ? null : String(raw);
};

const dataNumber = (value: unknown, key: string) => {
  const parsed = Number(eventDataObject(value)[key]);
  return Number.isFinite(parsed) ? parsed : null;
};

const dataBoolean = (value: unknown, key: string) => {
  const raw = eventDataObject(value)[key];
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    if (raw.toLowerCase() === "true" || raw === "1") return true;
    if (raw.toLowerCase() === "false" || raw === "0") return false;
  }
  if (typeof raw === "number") return raw !== 0;
  return null;
};

const toBikReferenceEvents = (
  pageviews: SimpleEvent[],
  pings: PingEvent[]
): BikReferenceEvent[] => [
  ...pageviews.map((event) => ({
    eventType: "pageview" as const,
    visitorId: event.visitorId,
    sessionId: dataString(event.eventData, "sessionId") ?? event.sessionId,
    eventId: dataString(event.eventData, "eventId"),
    url: event.url,
    referrer: event.referrer ?? "",
    ts: resolveEventTimestamp(event),
    activeSeconds: dataNumber(event.eventData, "activeSeconds"),
    isBot: dataBoolean(event.eventData, "isBot"),
    countryCode: event.countryCode,
  })),
  ...pings.map((event) => ({
    eventType: "check" as const,
    visitorId: event.visitorId,
    sessionId: dataString(event.eventData, "sessionId") ?? event.sessionId,
    eventId: dataString(event.eventData, "eventId"),
    url: event.url,
    ts: resolveEventTimestamp(event),
    activeSeconds:
      dataNumber(event.eventData, "activeSeconds") ??
      dataNumber(event.eventData, "elapsedSeconds"),
    isBot: dataBoolean(event.eventData, "isBot"),
    countryCode: event.countryCode,
  })),
];

const resolveEventTimestamp = (event: {
  createdAt: Date;
  clientTimestamp: Date | null;
  eventData: unknown;
}) => {
  const pcSource = extractPcSource(event.eventData);
  if (pcSource === "popcent") {
    return event.createdAt;
  }
  return event.clientTimestamp ?? event.createdAt;
};

const dedupeEvents = (events: SimpleEvent[]) => {
  const seen = new Map<string, number>();
  const deduped: SimpleEvent[] = [];
  for (const event of events) {
    const normalizedUrl = normalizeUrl(event.url);
    const referrer = event.referrer ?? "";
    const key = `${event.visitorId}||${normalizedUrl}||${referrer}`;
    const ts = resolveEventTimestamp(event).getTime();
    const lastTs = seen.get(key);
    if (lastTs && ts - lastTs <= DEDUPE_WINDOW_MS) {
      continue;
    }
    seen.set(key, ts);
    deduped.push({ ...event, url: normalizedUrl, referrer });
  }
  return deduped;
};

const computeObservedSeconds = (timestamps: Date[]) => {
  if (timestamps.length <= 1) return 0;
  const sorted = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
  const sessionGapSeconds = SESSION_INACTIVITY_MINUTES * 60;
  let totalSeconds = 0;
  let sessionStartIndex = 0;

  const flushSession = (startIndex: number, endIndex: number) => {
    if (endIndex <= startIndex) return 0;
    let duration = 0;
    for (let i = startIndex; i < endIndex; i += 1) {
      const deltaSeconds = (sorted[i + 1].getTime() - sorted[i].getTime()) / 1000;
      if (deltaSeconds > 0) {
        duration += Math.min(deltaSeconds, MAX_GAP_FOR_TIME_SECONDS);
      }
    }
    return duration;
  };

  for (let i = 1; i < sorted.length; i += 1) {
    const gapSeconds = (sorted[i].getTime() - sorted[i - 1].getTime()) / 1000;
    if (gapSeconds > sessionGapSeconds) {
      totalSeconds += flushSession(sessionStartIndex, i - 1);
      sessionStartIndex = i;
    }
  }

  totalSeconds += flushSession(sessionStartIndex, sorted.length - 1);
  return totalSeconds;
};

const computeVisitorTime = (timestamps: Date[]) => {
  if (!timestamps.length) return 0;
  const sorted = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
  const sessionGapSeconds = SESSION_INACTIVITY_MINUTES * 60;

  let totalSeconds = 0;
  let sessionStartIndex = 0;

  const flushSession = (startIndex: number, endIndex: number) => {
    const count = endIndex - startIndex + 1;
    if (count <= 1) {
      return LAST_PAGE_ESTIMATE_SECONDS;
    }
    let duration = 0;
    for (let i = startIndex; i < endIndex; i += 1) {
      const deltaSeconds = (sorted[i + 1].getTime() - sorted[i].getTime()) / 1000;
      if (deltaSeconds > 0) {
        duration += Math.min(deltaSeconds, MAX_GAP_FOR_TIME_SECONDS);
      }
    }
    return duration + LAST_PAGE_ESTIMATE_SECONDS;
  };

  for (let i = 1; i < sorted.length; i += 1) {
    const gapSeconds = (sorted[i].getTime() - sorted[i - 1].getTime()) / 1000;
    if (gapSeconds > sessionGapSeconds) {
      totalSeconds += flushSession(sessionStartIndex, i - 1);
      sessionStartIndex = i;
    }
  }

  totalSeconds += flushSession(sessionStartIndex, sorted.length - 1);
  return totalSeconds;
};

export const computeSimpleDayMetrics = async (
  siteId: string,
  dayDate: Date,
  mode: SimpleMetricsMode = "AUTO"
) => {
  const { start, end, dayString } = getIstanbulDayRange(dayDate);
  await prisma.analyticsWebsite.findUnique({
    where: { id: siteId },
    select: { id: true },
  });

  const isInDay = (event: SimpleEvent) => {
    const ts = resolveEventTimestamp(event).getTime();
    return ts >= start.getTime() && ts <= end.getTime();
  };
  const mergeById = <T extends { id: string; createdAt: Date }>(items: T[]) => {
    const merged = new Map<string, T>();
    for (const item of items) {
      merged.set(item.id, item);
    }
    return Array.from(merged.values()).sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
    );
  };

  const fetchSimpleEvents = async (mode: "RAW" | "BIK_STRICT") => {
    const [byCreatedAt, byClientTimestamp] = await Promise.all([
      prisma.analyticsEvent.findMany({
        where: {
          websiteId: siteId,
          type: "PAGEVIEW",
          mode,
          countryCode: "TR",
          createdAt: { gte: start, lte: end },
        },
        select: {
          id: true,
          visitorId: true,
          sessionId: true,
          url: true,
          referrer: true,
          eventData: true,
          createdAt: true,
          clientTimestamp: true,
          countryCode: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.analyticsEvent.findMany({
        where: {
          websiteId: siteId,
          type: "PAGEVIEW",
          mode,
          countryCode: "TR",
          clientTimestamp: { gte: start, lte: end },
          NOT: {
            createdAt: { gte: start, lte: end },
          },
        },
        select: {
          id: true,
          visitorId: true,
          sessionId: true,
          url: true,
          referrer: true,
          eventData: true,
          createdAt: true,
          clientTimestamp: true,
          countryCode: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return mergeById([...byCreatedAt, ...byClientTimestamp]);
  };

  const rawEvents = mode === "BIK_STRICT" ? [] : await fetchSimpleEvents("RAW");
  const strictEvents =
    mode === "RAW"
      ? []
      : mode === "BIK_STRICT" || !rawEvents.length
        ? await fetchSimpleEvents("BIK_STRICT")
        : [];
  const useStrictMode = mode === "BIK_STRICT" || (mode === "AUTO" && !rawEvents.length);
  const eventsSource = useStrictMode ? strictEvents : rawEvents;
  const deduped = dedupeEvents(eventsSource.filter(isInDay));

  const fetchPingEvents = async (mode: "RAW" | "BIK_STRICT") => {
    const [byCreatedAt, byClientTimestamp] = await Promise.all([
      prisma.analyticsEvent.findMany({
        where: {
          websiteId: siteId,
          type: "EVENT",
          mode,
          eventName: "ping",
          countryCode: "TR",
          createdAt: { gte: start, lte: end },
        },
        select: {
          id: true,
          visitorId: true,
          sessionId: true,
          url: true,
          referrer: true,
          createdAt: true,
          clientTimestamp: true,
          eventData: true,
          countryCode: true,
        },
      }),
      prisma.analyticsEvent.findMany({
        where: {
          websiteId: siteId,
          type: "EVENT",
          mode,
          eventName: "ping",
          countryCode: "TR",
          clientTimestamp: { gte: start, lte: end },
          NOT: {
            createdAt: { gte: start, lte: end },
          },
        },
        select: {
          id: true,
          visitorId: true,
          sessionId: true,
          url: true,
          referrer: true,
          createdAt: true,
          clientTimestamp: true,
          eventData: true,
          countryCode: true,
        },
      }),
    ]);

    return mergeById([...byCreatedAt, ...byClientTimestamp]);
  };

  const rawPingEvents = useStrictMode ? [] : await fetchPingEvents("RAW");
  const strictPingEvents = useStrictMode ? await fetchPingEvents("BIK_STRICT") : [];
  const pingEventsSource = useStrictMode ? strictPingEvents : rawPingEvents;

  if (useStrictMode && (strictEvents.length || pingEventsSource.length)) {
    const reference = computeBikReferenceMetrics(
      toBikReferenceEvents(strictEvents, pingEventsSource),
      { countryCode: "TR", includeUnknownCountry: true }
    );

    return {
      dayString,
      dayStart: new Date(`${dayString}T00:00:00+03:00`),
      daily_unique_users: reference.daily_unique_visitors,
      daily_direct_unique_users: reference.daily_direct_unique_visitors,
      daily_pageviews: reference.daily_pageviews,
      daily_avg_time_on_site_seconds_per_unique:
        reference.daily_avg_time_on_site_seconds,
    };
  }

  const pingEvents = pingEventsSource.filter((event) => {
    const ts = resolveEventTimestamp(event).getTime();
    return ts >= start.getTime() && ts <= end.getTime();
  });

  const pingMaxByVisitor = new Map<string, Map<number, number>>();
  for (const ping of pingEvents) {
    const data = ping.eventData as {
      pageviewTs?: number;
      elapsedSeconds?: number;
    };
    const pageviewTs = Number(data?.pageviewTs ?? NaN);
    const elapsedSeconds = Number(data?.elapsedSeconds ?? NaN);
    if (!Number.isFinite(pageviewTs) || !Number.isFinite(elapsedSeconds)) {
      continue;
    }
    const visitorMap = pingMaxByVisitor.get(ping.visitorId) ?? new Map();
    const currentMax = visitorMap.get(pageviewTs) ?? 0;
    if (elapsedSeconds > currentMax) {
      visitorMap.set(pageviewTs, elapsedSeconds);
    }
    pingMaxByVisitor.set(ping.visitorId, visitorMap);
  }
  const visitorEvents = new Map<string, SimpleEvent[]>();
  for (const event of deduped) {
    const list = visitorEvents.get(event.visitorId) ?? [];
    list.push(event);
    visitorEvents.set(event.visitorId, list);
  }

  const uniqueVisitors = new Set<string>();
  let directUnique = 0;
  let totalVisitorSeconds = 0;
  let totalVisitorCounted = 0;

  for (const [visitorId, events] of visitorEvents.entries()) {
    const sorted = [...events].sort(
      (a, b) => resolveEventTimestamp(a).getTime() - resolveEventTimestamp(b).getTime()
    );
    const first = sorted[0];
    const visitorPingMap = pingMaxByVisitor.get(visitorId);
    const observedSeconds = visitorPingMap
      ? Array.from(visitorPingMap.values()).reduce((sum, value) => sum + value, 0)
      : 0;
    if (observedSeconds < MIN_VISITOR_SECONDS) {
      continue;
    }
    uniqueVisitors.add(visitorId);
    totalVisitorSeconds += observedSeconds;
    totalVisitorCounted += 1;
    if (first) {
      const referrer = first.referrer ?? "";
      const isEmptyReferrer = referrer.trim() === "";
      const hasCampaign =
        hasCampaignParams(first.url) ||
        hasCampaignParams(referrer) ||
        hasCampaignEventData(first.eventData);
      if (isEmptyReferrer && !hasCampaign) {
        directUnique += 1;
      }
    }
  }

  const uniqueCount = uniqueVisitors.size;
  const avgTimePerUnique = totalVisitorCounted > 0
    ? Math.round(totalVisitorSeconds / totalVisitorCounted)
    : 0;

  return {
    dayString,
    dayStart: new Date(`${dayString}T00:00:00+03:00`),
    daily_unique_users: uniqueCount,
    daily_direct_unique_users: directUnique,
    daily_pageviews: deduped.filter((event) => uniqueVisitors.has(event.visitorId)).length,
    daily_avg_time_on_site_seconds_per_unique: avgTimePerUnique,
  };
};
