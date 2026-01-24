import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("site_id");

  if (!siteId) {
    return NextResponse.json({ error: "site_id zorunludur." }, { status: 400 });
  }

  const redis = await getRedis();
  const [events, pageviews, dedupe] = await Promise.all([
    redis.get(`bik:health:${siteId}:events`),
    redis.get(`bik:health:${siteId}:pageviews`),
    redis.get(`bik:health:${siteId}:dedupe`),
  ]);

  const eventsCount = Number(events ?? 0);
  const pageviewsCount = Number(pageviews ?? 0);
  const dedupeCount = Number(dedupe ?? 0);
  const dedupeRate =
    pageviewsCount > 0 ? dedupeCount / pageviewsCount : 0;

  let score = 100;
  const warnings: string[] = [];

  if (eventsCount === 0) {
    score -= 60;
    warnings.push("no_events_last_10m");
  }

  if (pageviewsCount > 0 && dedupeRate > 0.05) {
    score -= 25;
    warnings.push("pageview_duplicate_rate_high");
  }

  if (pageviewsCount === 0 && eventsCount > 0) {
    score -= 15;
    warnings.push("no_pageviews_last_10m");
  }

  score = Math.max(0, Math.min(100, score));

  return NextResponse.json({
    site_id: siteId,
    health_score: score,
    events_10m: eventsCount,
    pageviews_10m: pageviewsCount,
    dedupe_rate: dedupeRate,
    warnings,
  });
}
