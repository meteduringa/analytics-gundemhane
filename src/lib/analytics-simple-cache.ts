import type { AnalyticsDailySimple } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { getIstanbulDayRange } from "@/lib/bik-time";
import { computeSimpleDayMetrics } from "@/lib/analytics-simple";

export const simpleRecomputeLockKey = (siteId: string, dayStart: Date) =>
  `simple:recompute:lock:${siteId}:${dayStart.toISOString()}`;

export const saveSimpleDayMetrics = async (
  siteId: string,
  dayDate: Date
): Promise<AnalyticsDailySimple> => {
  const computed = await computeSimpleDayMetrics(siteId, dayDate);
  return prisma.analyticsDailySimple.upsert({
    where: {
      siteId_day: {
        siteId,
        day: computed.dayStart,
      },
    },
    create: {
      siteId,
      day: computed.dayStart,
      dailyUniqueUsers: computed.daily_unique_users,
      dailyDirectUniqueUsers: computed.daily_direct_unique_users,
      dailyPageviews: computed.daily_pageviews,
      dailyAvgTimeOnSiteSecondsPerUnique:
        computed.daily_avg_time_on_site_seconds_per_unique,
    },
    update: {
      dailyUniqueUsers: computed.daily_unique_users,
      dailyDirectUniqueUsers: computed.daily_direct_unique_users,
      dailyPageviews: computed.daily_pageviews,
      dailyAvgTimeOnSiteSecondsPerUnique:
        computed.daily_avg_time_on_site_seconds_per_unique,
    },
  });
};

export const refreshSimpleDayMetricsWithLock = async (input: {
  siteId: string;
  dayDate: Date;
  existing: AnalyticsDailySimple | null;
}) => {
  const { start: dayStart } = getIstanbulDayRange(input.dayDate);
  const lockKey = simpleRecomputeLockKey(input.siteId, dayStart);
  const lockValue = `${process.pid}:${Date.now()}`;
  const redis = await getRedis().catch(() => null);

  if (redis) {
    const acquired = await redis
      .set(lockKey, lockValue, { NX: true, EX: 180 })
      .catch(() => null);
    if (!acquired) {
      return {
        record: input.existing,
        refreshed: false,
        refreshInProgress: true,
      };
    }
  }

  try {
    const record = await saveSimpleDayMetrics(input.siteId, input.dayDate);
    return {
      record,
      refreshed: true,
      refreshInProgress: false,
    };
  } finally {
    if (redis) {
      const currentValue = await redis.get(lockKey).catch(() => null);
      if (currentValue === lockValue) {
        await redis.del(lockKey).catch(() => undefined);
      }
    }
  }
};
