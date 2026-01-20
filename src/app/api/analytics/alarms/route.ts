import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { AnalyticsAlarmType } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";

const ONLINE_WINDOW_MS = 120_000;

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const websiteId = url.searchParams.get("websiteId");
  if (!websiteId) {
    return NextResponse.json({ error: "Missing websiteId." }, { status: 400 });
  }

  if (session.user.role !== "ADMIN") {
    const link = await prisma.analyticsUserWebsite.findUnique({
      where: {
        userId_websiteId: {
          userId: session.user.id,
          websiteId,
        },
      },
    });
    if (!link) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  }

  const alarms = await prisma.analyticsAlarm.findMany({
    where: { websiteId, isActive: true },
  });

  const redis = await getRedis();
  const now = Date.now();
  await redis.zRemRangeByScore(
    `analytics:online:${websiteId}`,
    0,
    now - ONLINE_WINDOW_MS
  );

  const onlineCount = await redis.zCard(`analytics:online:${websiteId}`);

  const statuses = await Promise.all(
    alarms.map(async (alarm) => {
      if (alarm.type === AnalyticsAlarmType.ONLINE_BELOW) {
        return {
          alarmId: alarm.id,
          triggered: onlineCount < alarm.threshold,
          value: onlineCount,
        };
      }

      const windowMs = alarm.windowSeconds * 1000;
      const eventCount = await redis.zCount(
        `analytics:events:${websiteId}`,
        now - windowMs,
        now
      );

      return {
        alarmId: alarm.id,
        triggered: eventCount > alarm.threshold,
        value: eventCount,
      };
    })
  );

  return NextResponse.json({ statuses, onlineCount, now });
}
