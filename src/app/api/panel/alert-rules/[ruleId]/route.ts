import { NextResponse } from "next/server";
import { PanelAlertType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readPanelSession } from "@/lib/panel-session";

export const runtime = "nodejs";

const ALERT_TYPES = new Set<PanelAlertType>([
  "TARGET_PACE_BELOW",
  "PROJECTED_MISS",
  "CURRENT_TARGET_BELOW",
  "STAGNATION",
  "CACHE_STALE",
  "TRAFFIC_DROP",
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ ruleId: string }> }
) {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const { ruleId } = await context.params;
  const payload = await request.json();
  const data: Record<string, unknown> = {};

  if (payload.name !== undefined) {
    data.name = String(payload.name).trim();
  }
  if (payload.type !== undefined) {
    const type = String(payload.type) as PanelAlertType;
    if (!ALERT_TYPES.has(type)) {
      return NextResponse.json({ error: "Geçersiz type." }, { status: 400 });
    }
    data.type = type;
  }
  if (payload.config !== undefined) {
    data.config =
      payload.config && typeof payload.config === "object" ? payload.config : {};
  }
  if (payload.telegramEnabled !== undefined) {
    data.telegramEnabled = Boolean(payload.telegramEnabled);
  }
  if (payload.telegramChatId !== undefined) {
    data.telegramChatId = payload.telegramChatId
      ? String(payload.telegramChatId).trim()
      : null;
  }
  if (payload.cooldownSeconds !== undefined) {
    data.cooldownSeconds = Math.max(60, Number(payload.cooldownSeconds ?? 900));
  }
  if (payload.isActive !== undefined) {
    data.isActive = Boolean(payload.isActive);
  }

  const rule = await prisma.panelAlertRule.update({
    where: { id: ruleId },
    data,
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

export async function DELETE(
  request: Request,
  context: { params: Promise<{ ruleId: string }> }
) {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const { ruleId } = await context.params;
  await prisma.panelAlertRule.delete({ where: { id: ruleId } });
  return NextResponse.json({ ok: true });
}
