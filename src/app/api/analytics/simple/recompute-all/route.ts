import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDayParam, getIstanbulDayRange } from "@/lib/bik-time";
import { refreshSimpleDayMetricsWithLock } from "@/lib/analytics-simple-cache";

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

  const results: {
    id: string;
    name: string;
    ok: boolean;
    skipped?: boolean;
    error?: string;
  }[] = [];

  for (const website of websites) {
    try {
      const existing = await prisma.analyticsDailySimple.findUnique({
        where: {
          siteId_day: {
            siteId: website.id,
            day: dayStart,
          },
        },
      });
      const refresh = await refreshSimpleDayMetricsWithLock({
        siteId: website.id,
        dayDate: targetDay,
        existing,
      });
      results.push({
        id: website.id,
        name: website.name,
        ok: Boolean(refresh.record),
        skipped: refresh.refreshInProgress,
        error: refresh.record ? undefined : "recompute-in-progress",
      });
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
