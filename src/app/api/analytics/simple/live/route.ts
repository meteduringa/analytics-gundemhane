import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { computeLiveMetrics } from "@/lib/analytics-live";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");

  if (!siteId) {
    return NextResponse.json({ error: "siteId zorunludur." }, { status: 400 });
  }

  const cacheKey = `simple:live:${siteId}`;

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

  const metrics = await computeLiveMetrics(siteId);
  const payload = {
    siteId: metrics.siteId,
    day: metrics.day,
    live_total_events: metrics.totalEvents,
    live_unique_users: metrics.uniqueVisitors,
    live_direct_unique_users: metrics.directUniqueVisitors,
    live_popcent_unique_users: metrics.popcentUniqueVisitors,
    live_popcent_pageviews: metrics.popcentTotalEvents,
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
