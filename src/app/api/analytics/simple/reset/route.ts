import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const confirm = String(payload.confirm ?? "");
  const mode = String(payload.mode ?? "rollups_only");
  const siteId = payload.siteId ? String(payload.siteId) : null;

  if (confirm !== "RESET_ANALYTICS") {
    return NextResponse.json({ error: "Invalid confirmation." }, { status: 400 });
  }

  const whereSite = siteId ? { siteId } : undefined;
  const whereWebsite = siteId ? { websiteId: siteId } : undefined;

  const dailySimple = await prisma.analyticsDailySimple.deleteMany({
    where: whereSite,
  });

  const bikRollupMinutes = await prisma.bIKRollupMinute.deleteMany({
    where: whereWebsite,
  });

  const bikRollupDays = await prisma.bIKRollupDay.deleteMany({
    where: whereWebsite,
  });

  let analyticsEvents = { count: 0 };
  if (mode === "full") {
    analyticsEvents = await prisma.analyticsEvent.deleteMany({
      where: whereWebsite,
    });
  }

  return NextResponse.json({
    ok: true,
    mode,
    siteId,
    deleted: {
      analytics_daily_simple: dailySimple.count,
      bik_rollup_minutes: bikRollupMinutes.count,
      bik_rollup_days: bikRollupDays.count,
      analytics_events: analyticsEvents.count,
    },
  });
}
