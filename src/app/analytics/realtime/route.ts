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
  const now = Date.now();
  const onlineKey = `bik:online_valid:${siteId}`;
  const pageviewsKey = `bik:pageviews_valid:${siteId}`;

  const [liveVisitors, livePageviews] = await Promise.all([
    redis.zCard(onlineKey),
    redis.zCount(pageviewsKey, now - 5 * 60_000, now),
  ]);

  return NextResponse.json({
    site_id: siteId,
    live_visitors: liveVisitors,
    live_pageviews: livePageviews,
    updated_at: new Date().toISOString(),
  });
}
