import { NextResponse } from "next/server";
import { readPanelSession } from "@/lib/panel-session";
import { getTargetBoard } from "@/lib/panel-alerts";
import { prisma } from "@/lib/prisma";
import { parseDayParam } from "@/lib/bik-time";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const url = new URL(request.url);
  const date = parseDayParam(url.searchParams.get("date")) ?? new Date();
  const rows = await getTargetBoard(date);
  return NextResponse.json({ date: url.searchParams.get("date"), rows });
}

export async function PATCH(request: Request) {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const payload = await request.json();
  const websiteId = String(payload.websiteId ?? "");
  if (!websiteId) {
    return NextResponse.json({ error: "websiteId gerekli." }, { status: 400 });
  }

  const dailyUniqueTarget =
    payload.dailyUniqueTarget === null || payload.dailyUniqueTarget === ""
      ? null
      : Number(payload.dailyUniqueTarget);
  const dailyPageviewTarget =
    payload.dailyPageviewTarget === null || payload.dailyPageviewTarget === ""
      ? null
      : Number(payload.dailyPageviewTarget);
  const telegramChatId =
    payload.telegramChatId === null || payload.telegramChatId === ""
      ? null
      : String(payload.telegramChatId).trim();

  const website = await prisma.analyticsWebsite.update({
    where: { id: websiteId },
    data: {
      dailyUniqueTarget,
      dailyPageviewTarget,
      telegramChatId,
    },
  });

  return NextResponse.json({ website });
}
