import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBikConfig } from "@/lib/bik-config";
import { calibrateConfig } from "@/lib/bik-calibration";
import { getBikDayMetrics } from "@/lib/bik-metrics";
import { parseDayParam } from "@/lib/bik-time";

export const runtime = "nodejs";

const asNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const payload = await request.json();
  const websiteId = String(payload.websiteId ?? "");
  const dateParam = String(payload.date ?? "");
  const bikMetrics = payload.bikMetrics ?? {};

  if (!websiteId) {
    return NextResponse.json({ error: "websiteId zorunludur." }, { status: 400 });
  }

  const dayDate = parseDayParam(dateParam);
  if (!dayDate) {
    return NextResponse.json({ error: "Geçersiz tarih." }, { status: 400 });
  }

  const bikInput = {
    daily_unique_visitors: asNumber(bikMetrics.daily_unique_visitors) ?? 0,
    daily_direct_unique_visitors:
      asNumber(bikMetrics.daily_direct_unique_visitors) ?? 0,
    daily_pageviews: asNumber(bikMetrics.daily_pageviews) ?? 0,
    daily_sessions: asNumber(bikMetrics.daily_sessions) ?? 0,
  };

  const localMetrics = await getBikDayMetrics(websiteId, dayDate);
  const currentConfig = await getBikConfig(websiteId);

  const nextConfig = calibrateConfig(currentConfig, localMetrics, bikInput);

  await prisma.bIKConfig.upsert({
    where: { websiteId },
    create: {
      websiteId,
      sessionInactivityMinutes: nextConfig.sessionInactivityMinutes,
      botPvRate10s: nextConfig.botPvRate10s,
      botPv5Min: nextConfig.botPv5Min,
      botPeriodicStddevMs: nextConfig.botPeriodicStddevMs,
      cookieLessAggressiveness: nextConfig.cookieLessAggressiveness,
    },
    update: {
      sessionInactivityMinutes: nextConfig.sessionInactivityMinutes,
      botPvRate10s: nextConfig.botPvRate10s,
      botPv5Min: nextConfig.botPv5Min,
      botPeriodicStddevMs: nextConfig.botPeriodicStddevMs,
      cookieLessAggressiveness: nextConfig.cookieLessAggressiveness,
    },
  });

  await prisma.bIKCalibrationRun.create({
    data: {
      websiteId,
      day: new Date(`${localMetrics.date}T00:00:00+03:00`),
      bikMetrics: bikInput,
      localMetrics,
      resultConfig: nextConfig,
    },
  });

  return NextResponse.json({
    ok: true,
    localMetrics,
    bikMetrics: bikInput,
    resultConfig: nextConfig,
  });
}

