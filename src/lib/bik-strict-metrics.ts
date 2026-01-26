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

export const getBikStrictDayMetrics = async (
  siteId: string,
  dayDate: Date
): Promise<StrictMetrics> => {
  const { start, end } = getIstanbulDayRange(dayDate);
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
      referrer: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const dailyPageviews = events.length;
  const uniqueVisitors = new Set<string>();
  const firstReferrer = new Map<string, string | null>();
  const visitorEvents = new Map<string, Date[]>();

  for (const event of events) {
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
