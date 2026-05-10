import { NextResponse } from "next/server";
import { PanelAlertType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readPanelSession } from "@/lib/panel-session";

export const runtime = "nodejs";

const ALERT_TYPES = new Set<PanelAlertType>([
  "TARGET_PACE_BELOW",
  "PROJECTED_MISS",
  "STAGNATION",
  "CACHE_STALE",
  "TRAFFIC_DROP",
]);

export async function GET() {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const rules = await prisma.panelAlertRule.findMany({
    include: {
      website: {
        select: {
          id: true,
          name: true,
          dailyUniqueTarget: true,
          dailyDirectUniqueTarget: true,
          dailyPageviewTarget: true,
          telegramChatId: true,
        },
      },
    },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ rules });
}

export async function POST(request: Request) {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const payload = await request.json();
  const websiteId = String(payload.websiteId ?? "");
  const name = String(payload.name ?? "").trim();
  const type = String(payload.type ?? "") as PanelAlertType;
  const config =
    payload.config && typeof payload.config === "object" ? payload.config : {};
  const telegramEnabled = payload.telegramEnabled !== false;
  const telegramChatId = payload.telegramChatId
    ? String(payload.telegramChatId).trim()
    : null;
  const cooldownSeconds = Math.max(60, Number(payload.cooldownSeconds ?? 900));

  if (!websiteId || !name || !ALERT_TYPES.has(type)) {
    return NextResponse.json(
      { error: "websiteId, name ve geçerli type zorunludur." },
      { status: 400 }
    );
  }

  const rule = await prisma.panelAlertRule.create({
    data: {
      websiteId,
      name,
      type,
      config,
      telegramEnabled,
      telegramChatId,
      cooldownSeconds,
    },
    include: {
      website: {
        select: {
          id: true,
          name: true,
          dailyUniqueTarget: true,
          dailyDirectUniqueTarget: true,
          dailyPageviewTarget: true,
          telegramChatId: true,
        },
      },
    },
  });

  return NextResponse.json({ rule });
}
