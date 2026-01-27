import { prisma } from "@/lib/prisma";
import { getBikConfig } from "@/lib/bik-config";
import { getIstanbulDayRange } from "@/lib/bik-time";

type StrictMetrics = {
  daily_unique_visitors_strict: number;
  daily_direct_unique_visitors_strict: number;
  daily_pageviews_strict: number;
  daily_sessions_strict: number;
  daily_avg_time_on_site_seconds_strict: number;
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
  dayDate: Date
): Promise<StrictMetrics> => {
  const { start, end, dayString } = getIstanbulDayRange(dayDate);
  const todayString = istanbulDayString(new Date());
  const isTodayInIstanbul = dayString === todayString;
  const config = await getBikConfig(siteId);

  const events = await prisma.analyticsEvent.findMany({
    where: {
      websiteId: siteId,
      type: "PAGEVIEW",
      mode: "BIK_STRICT",
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
  const firstReferrer = new Map<string, string | null>();
  const visitorEvents = new Map<string, Date[]>();

  for (const event of dedupedEvents) {
    uniqueVisitors.add(event.visitorId);
    if (!firstReferrer.has(event.visitorId)) {
      firstReferrer.set(event.visitorId, event.referrer ?? null);
    }
    const list = visitorEvents.get(event.visitorId) ?? [];
    list.push(event.createdAt);
    visitorEvents.set(event.visitorId, list);
  }

  const directEmptyOnly = config.strictDirectReferrerEmptyOnly !== false;
  let directUnique = 0;
  for (const referrer of firstReferrer.values()) {
    if (directEmptyOnly) {
      if (referrer === "") {
        directUnique += 1;
      }
    } else if (!referrer) {
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

  for (const timestamps of visitorEvents.values()) {
    const sorted = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
    if (sorted.length === 0) continue;
    sessionCount += 1;
    let lastTs = sorted[0].getTime();
    let sessionDuration = 0;

    for (let i = 1; i < sorted.length; i += 1) {
      const currentTs = sorted[i].getTime();
      const deltaSeconds = (currentTs - lastTs) / 1000;
      if (deltaSeconds > sessionTimeoutSeconds) {
        totalDurationSeconds += sessionDuration + lastPageEstimateSeconds;
        sessionCount += 1;
        sessionDuration = 0;
      } else if (deltaSeconds > 0) {
        sessionDuration += Math.min(deltaSeconds, maxGapSeconds);
      }
      lastTs = currentTs;
    }

    totalDurationSeconds += sessionDuration + lastPageEstimateSeconds;
  }

  const avgSeconds =
    sessionCount > 0 ? Math.round(totalDurationSeconds / sessionCount) : 0;

  return {
    daily_unique_visitors_strict: uniqueVisitors.size,
    daily_direct_unique_visitors_strict: directUnique,
    daily_pageviews_strict: dailyPageviews,
    daily_sessions_strict: sessionCount,
    daily_avg_time_on_site_seconds_strict: avgSeconds,
  };
};
