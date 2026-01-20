import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";

const ONLINE_WINDOW_MS = 120_000;
const LIVE_WINDOW_MS = 5 * 60_000;

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

  const redis = await getRedis();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let active = true;

      const sendUpdate = async () => {
        if (!active) return;
        const now = Date.now();

        await redis.zRemRangeByScore(
          `analytics:online:${websiteId}`,
          0,
          now - ONLINE_WINDOW_MS
        );
        await redis.zRemRangeByScore(
          `analytics:pageviews:${websiteId}`,
          0,
          now - LIVE_WINDOW_MS
        );

        const [onlineCount, pageviewsCount, events] = await Promise.all([
          redis.zCard(`analytics:online:${websiteId}`),
          redis.zCount(
            `analytics:pageviews:${websiteId}`,
            now - LIVE_WINDOW_MS,
            now
          ),
          redis.lRange(`analytics:stream:${websiteId}`, 0, 20),
        ]);

        const payload = JSON.stringify({
          onlineCount,
          pageviewsCount,
          recentEvents: events.map((entry) => JSON.parse(entry)),
          now,
        });

        controller.enqueue(encoder.encode(`event: update
data: ${payload}

`));
      };

      const interval = setInterval(sendUpdate, 2000);
      sendUpdate();

      const close = () => {
        active = false;
        clearInterval(interval);
        controller.close();
      };

      request.signal.addEventListener("abort", close);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
