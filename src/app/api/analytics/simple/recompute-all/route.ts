import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeSimpleDayMetrics } from "@/lib/analytics-simple";
import { parseDayParam, getIstanbulDayRange } from "@/lib/bik-time";

export const runtime = "nodejs";

const isAuthorized = (request: Request) => {
  const token = process.env.INTERNAL_CRON_TOKEN;
  if (!token) {
    return true;
  }
  const headerToken = request.headers.get("x-cron-token");
  const { searchParams } = new URL(request.url);
  const queryToken = searchParams.get("token");
  return headerToken === token || queryToken === token;
};

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const payload = await request.json().catch(() => ({}));
  const dateParam = payload?.date ?? null;
  const targetDay = parseDayParam(dateParam) ?? new Date();
  const { start: dayStart } = getIstanbulDayRange(targetDay);

  const websites = await prisma.analyticsWebsite.findMany({
    select: { id: true, name: true },
  });

  const results: { id: string; name: string; ok: boolean; error?: string }[] =
    [];

  for (const website of websites) {
    try {
      const computed = await computeSimpleDayMetrics(website.id, targetDay);
      await prisma.analyticsDailySimple.upsert({
        where: {
          siteId_day: {
            siteId: website.id,
            day: dayStart,
          },
        },
        create: {
          siteId: website.id,
          day: dayStart,
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
      results.push({ id: website.id, name: website.name, ok: true });
    } catch (error) {
      results.push({
        id: website.id,
        name: website.name,
        ok: false,
        error: error instanceof Error ? error.message : "Bilinmeyen hata",
      });
    }
  }

  return NextResponse.json({
    day: targetDay.toISOString().split("T")[0],
    total: results.length,
    results,
  });
}
