import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { getIstanbulDayRange } from "@/lib/bik-time";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");

  if (!siteId) {
    return NextResponse.json({ error: "siteId zorunludur." }, { status: 400 });
  }

  const cacheKey = `simple:live:clean:${siteId}`;

  try {
    const redis = await getRedis();
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return NextResponse.json(JSON.parse(cached));
      }
    }
  } catch {
    // Ignore cache errors.
  }

  const { start } = getIstanbulDayRange(new Date());
  const record = await prisma.analyticsDailySimple.findUnique({
    where: {
      siteId_day: {
        siteId,
        day: start,
      },
    },
  });

  const payload = {
    siteId,
    day: start.toISOString().split("T")[0],
    daily_unique_users: record?.dailyUniqueUsers ?? 0,
    daily_direct_unique_users: record?.dailyDirectUniqueUsers ?? 0,
    daily_pageviews: record?.dailyPageviews ?? 0,
    daily_avg_time_on_site_seconds_per_unique:
      record?.dailyAvgTimeOnSiteSecondsPerUnique ?? 0,
    daily_popcent_unique_users: 0,
    daily_popcent_pageviews: 0,
  };

  try {
    const redis = await getRedis();
    if (redis) {
      await redis.set(cacheKey, JSON.stringify(payload), { EX: 30 });
    }
  } catch {
    // Ignore cache errors.
  }

  return NextResponse.json(payload);
}
