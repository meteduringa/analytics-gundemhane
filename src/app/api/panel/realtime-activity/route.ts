import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type BucketRow = { minute: Date; visitors: bigint };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const websiteId = searchParams.get("websiteId");

  if (!websiteId) {
    return NextResponse.json(
      { error: "websiteId zorunludur." },
      { status: 400 }
    );
  }

  const now = new Date();
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

  const standardCount = await prisma.analyticsEvent.count({
    where: {
      websiteId,
      type: "PAGEVIEW",
      createdAt: { gte: thirtyMinAgo, lte: now },
    },
  });

  const [buckets, active30Rows, active5Rows] =
    standardCount > 0
      ? await Promise.all([
          prisma.$queryRaw`
            SELECT date_trunc('minute', "createdAt") AS minute,
                   COUNT(DISTINCT "visitorId") AS visitors
            FROM "analytics_events"
            WHERE "websiteId" = ${websiteId}
              AND "type" = 'PAGEVIEW'
              AND "createdAt" >= ${thirtyMinAgo}
              AND "createdAt" <= ${now}
            GROUP BY minute
            ORDER BY minute ASC
          ` as Promise<BucketRow[]>,
          prisma.$queryRaw`
            SELECT COUNT(DISTINCT "visitorId") AS count
            FROM "analytics_events"
            WHERE "websiteId" = ${websiteId}
              AND "type" = 'PAGEVIEW'
              AND "createdAt" >= ${thirtyMinAgo}
              AND "createdAt" <= ${now}
          ` as Promise<{ count: bigint }[]>,
          prisma.$queryRaw`
            SELECT COUNT(DISTINCT "visitorId") AS count
            FROM "analytics_events"
            WHERE "websiteId" = ${websiteId}
              AND "type" = 'PAGEVIEW'
              AND "createdAt" >= ${fiveMinAgo}
              AND "createdAt" <= ${now}
          ` as Promise<{ count: bigint }[]>,
        ])
      : await Promise.all([
          prisma.$queryRaw`
            SELECT date_trunc('minute', "ts") AS minute,
                   COUNT(DISTINCT "visitorId") AS visitors
            FROM "bik_events"
            WHERE "websiteId" = ${websiteId}
              AND "type" = 'PAGE_VIEW'
              AND "ts" >= ${thirtyMinAgo}
              AND "ts" <= ${now}
              AND "isValid" = true
              AND "isSuspicious" = false
            GROUP BY minute
            ORDER BY minute ASC
          ` as Promise<BucketRow[]>,
          prisma.$queryRaw`
            SELECT COUNT(DISTINCT "visitorId") AS count
            FROM "bik_events"
            WHERE "websiteId" = ${websiteId}
              AND "type" = 'PAGE_VIEW'
              AND "ts" >= ${thirtyMinAgo}
              AND "ts" <= ${now}
              AND "isValid" = true
              AND "isSuspicious" = false
          ` as Promise<{ count: bigint }[]>,
          prisma.$queryRaw`
            SELECT COUNT(DISTINCT "visitorId") AS count
            FROM "bik_events"
            WHERE "websiteId" = ${websiteId}
              AND "type" = 'PAGE_VIEW'
              AND "ts" >= ${fiveMinAgo}
              AND "ts" <= ${now}
              AND "isValid" = true
              AND "isSuspicious" = false
          ` as Promise<{ count: bigint }[]>,
        ]);

  const active30Count = Number(
    (active30Rows as { count: bigint }[])[0]?.count ?? 0
  );
  const active5Count = Number(
    (active5Rows as { count: bigint }[])[0]?.count ?? 0
  );

  const bucketMap = new Map(
    buckets.map((bucket) => [bucket.minute.toISOString(), Number(bucket.visitors)])
  );

  const series: { minute: string; visitors: number }[] = [];
  for (let i = 29; i >= 0; i -= 1) {
    const minute = new Date(now.getTime() - i * 60 * 1000);
    minute.setSeconds(0, 0);
    const key = minute.toISOString();
    series.push({ minute: key, visitors: bucketMap.get(key) ?? 0 });
  }

  return NextResponse.json({
    active_30m: active30Count,
    active_5m: active5Count,
    series,
    now: now.toISOString(),
  });
}
