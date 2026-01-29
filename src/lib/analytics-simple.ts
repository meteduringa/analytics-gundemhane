import { prisma } from "@/lib/prisma";
import { getIstanbulDayRange } from "@/lib/bik-time";

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

type SimpleEvent = {
  visitorId: string;
  url: string;
  referrer: string | null;
  createdAt: Date;
  clientTimestamp: Date | null;
  countryCode: string | null;
};

const resolveEventTimestamp = (event: SimpleEvent) =>
  event.clientTimestamp ?? event.createdAt;

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

export const computeSimpleDayMetrics = async (siteId: string, dayDate: Date) => {
  const { start, end, dayString } = getIstanbulDayRange(dayDate);
  const isInDay = (event: SimpleEvent) => {
    const ts = resolveEventTimestamp(event).getTime();
    return ts >= start.getTime() && ts <= end.getTime();
  };
  const whereTimeRange = {
    OR: [
      { createdAt: { gte: start, lte: end } },
      { clientTimestamp: { gte: start, lte: end } },
    ],
  };

  const strictEvents = await prisma.analyticsEvent.findMany({
    where: {
      websiteId: siteId,
      type: "PAGEVIEW",
      mode: "BIK_STRICT",
      countryCode: "TR",
      ...whereTimeRange,
    },
    select: {
      visitorId: true,
      url: true,
      referrer: true,
      createdAt: true,
      clientTimestamp: true,
      countryCode: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const eventsSource = strictEvents.length
    ? strictEvents
    : await prisma.analyticsEvent.findMany({
        where: {
          websiteId: siteId,
          type: "PAGEVIEW",
          mode: "RAW",
          countryCode: "TR",
          ...whereTimeRange,
        },
        select: {
          visitorId: true,
          url: true,
          referrer: true,
          createdAt: true,
          clientTimestamp: true,
          countryCode: true,
        },
        orderBy: { createdAt: "asc" },
      });

  const deduped = dedupeEvents(eventsSource.filter(isInDay));
  const dailyPageviews = deduped.length;

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
    const timestamps = events.map((event) => resolveEventTimestamp(event));
    const observedSeconds = computeObservedSeconds(timestamps);
    if (observedSeconds < MIN_VISITOR_SECONDS) {
      continue;
    }
    uniqueVisitors.add(visitorId);
    totalVisitorSeconds += computeVisitorTime(timestamps);
    totalVisitorCounted += 1;
    if (first && first.referrer === "") {
      directUnique += 1;
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
