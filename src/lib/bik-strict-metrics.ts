import { prisma } from "@/lib/prisma";
import { getBikConfig } from "@/lib/bik-config";
import { getIstanbulDayRange } from "@/lib/bik-time";
import { isDirectLanding } from "@/lib/bik-rules";

type StrictMetrics = {
  daily_unique_visitors_strict: number;
  daily_direct_unique_visitors_strict: number;
  daily_pageviews_strict: number;
  daily_sessions_strict: number;
  daily_avg_time_on_site_seconds_strict: number;
  daily_total_time_on_site_seconds_strict: number;
};

const istanbulDayString = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

export const getBikStrictDayMetrics = async (
  siteId: string,
  dayDate: Date,
  options: {
    hideShortReads?: boolean;
    countryCode?: string;
  } = {}
): Promise<StrictMetrics> => {
  const { start, end, dayString } = getIstanbulDayRange(dayDate);
  const todayString = istanbulDayString(new Date());
  const isTodayInIstanbul = dayString === todayString;
  const config = await getBikConfig(siteId);
  const includeCountry = (countryCode?: string | null) =>
    !options.countryCode || !countryCode || countryCode === options.countryCode;

  const events = await prisma.analyticsEvent.findMany({
    where: {
      websiteId: siteId,
      type: "PAGEVIEW",
      mode: "BIK_STRICT",
      ...(options.countryCode
        ? { OR: [{ countryCode: options.countryCode }, { countryCode: null }, { countryCode: "" }] }
        : {}),
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    select: {
      visitorId: true,
      url: true,
      referrer: true,
      createdAt: true,
      countryCode: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // For today only, simulate the new strict dedupe guard prospectively at aggregation
  // time to approximate "as if the fix existed since 00:00" without mutating history.
  const DEDUPE_WINDOW_MS = 1500;
  const dedupedEvents = !isTodayInIstanbul
    ? events
    : (() => {
        const lastSeenByKey = new Map<string, number>();
        const kept: typeof events = [];
        for (const event of events) {
          const key = `${event.visitorId}||${event.url ?? ""}||${event.referrer ?? ""}`;
          const ts = event.createdAt.getTime();
          const lastTs = lastSeenByKey.get(key);
          if (lastTs && ts - lastTs <= DEDUPE_WINDOW_MS) {
            continue;
          }
          lastSeenByKey.set(key, ts);
          kept.push(event);
        }
        return kept;
      })();

  const dailyPageviews = dedupedEvents.length;
  const uniqueVisitors = new Set<string>();
  const firstLanding = new Map<string, { referrer: string | null; url: string }>();
  const visitorEvents = new Map<
    string,
    { createdAt: Date; referrer: string | null; url: string }[]
  >();

  for (const event of dedupedEvents.filter((e) => includeCountry(e.countryCode))) {
    uniqueVisitors.add(event.visitorId);
    if (!firstLanding.has(event.visitorId)) {
      firstLanding.set(event.visitorId, {
        referrer: event.referrer ?? null,
        url: event.url ?? "/",
      });
    }
    const list = visitorEvents.get(event.visitorId) ?? [];
    list.push({
      createdAt: event.createdAt,
      referrer: event.referrer ?? null,
      url: event.url ?? "/",
    });
    visitorEvents.set(event.visitorId, list);
  }

  let directUnique = 0;
  for (const landing of firstLanding.values()) {
    if (isDirectLanding(landing.referrer, landing.url)) {
      directUnique += 1;
    }
  }

  const sessionTimeoutSeconds = Math.max(
    1,
    config.strictSessionInactivityMinutes * 60
  );
  const maxGapSeconds = Math.max(0, config.strictMaxGapSeconds);
  const lastPageEstimateSeconds = Math.max(0, config.strictLastPageEstimateSeconds);

  let sessionCount = 0;
  let totalDurationSeconds = 0;
  let filteredPageviews = 0;
  let filteredUniqueVisitors = 0;
  let filteredDirectUnique = 0;

  const hideShortReads = Boolean(options.hideShortReads);
  const hideShortThresholdSeconds = 1;

  const keptVisitors = new Set<string>();
  const keptFirstLanding = new Map<string, { referrer: string | null; url: string }>();

  for (const [visitorId, eventsForVisitor] of visitorEvents.entries()) {
    const sorted = [...eventsForVisitor].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    if (sorted.length === 0) continue;

    let sessionEvents: typeof sorted = [sorted[0]];
    let lastTs = sorted[0].createdAt.getTime();
    let observedSeconds = 0;

    const finalizeSession = () => {
      const isShort = observedSeconds < hideShortThresholdSeconds;
      if (!hideShortReads || !isShort) {
        sessionCount += 1;
        totalDurationSeconds += observedSeconds + lastPageEstimateSeconds;
        filteredPageviews += sessionEvents.length;
        keptVisitors.add(visitorId);
        if (!keptFirstLanding.has(visitorId)) {
          keptFirstLanding.set(visitorId, {
            referrer: sessionEvents[0]?.referrer ?? null,
            url: sessionEvents[0]?.url ?? "/",
          });
        }
      }
      sessionEvents = [];
      observedSeconds = 0;
    };

    for (let i = 1; i < sorted.length; i += 1) {
      const current = sorted[i];
      const currentTs = current.createdAt.getTime();
      const deltaSeconds = (currentTs - lastTs) / 1000;
      if (deltaSeconds > sessionTimeoutSeconds) {
        finalizeSession();
        sessionEvents = [current];
      } else {
        sessionEvents.push(current);
        if (deltaSeconds > 0) {
          observedSeconds += Math.min(deltaSeconds, maxGapSeconds);
        }
      }
      lastTs = currentTs;
    }

    if (sessionEvents.length) {
      finalizeSession();
    }
  }

  filteredUniqueVisitors = keptVisitors.size;
  for (const landing of keptFirstLanding.values()) {
    if (isDirectLanding(landing.referrer, landing.url)) {
      filteredDirectUnique += 1;
    }
  }

  const avgSeconds =
    sessionCount > 0 ? Math.round(totalDurationSeconds / sessionCount) : 0;

  return {
    daily_unique_visitors_strict: filteredUniqueVisitors,
    daily_direct_unique_visitors_strict: filteredDirectUnique,
    daily_pageviews_strict: filteredPageviews,
    daily_sessions_strict: sessionCount,
    daily_avg_time_on_site_seconds_strict: avgSeconds,
    daily_total_time_on_site_seconds_strict: Math.round(totalDurationSeconds),
  };
};
