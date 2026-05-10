import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readPanelSession } from "@/lib/panel-session";
import { evaluatePanelAlertRule, getTargetBoard } from "@/lib/panel-alerts";
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
  const websiteId = url.searchParams.get("websiteId") ?? undefined;
  const date = parseDayParam(url.searchParams.get("date")) ?? new Date();

  const [rules, boardRows] = await Promise.all([
    prisma.panelAlertRule.findMany({
      where: websiteId ? { websiteId } : undefined,
      include: {
        website: {
          select: {
            id: true,
            name: true,
            dailyUniqueTarget: true,
            dailyPageviewTarget: true,
            telegramChatId: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    getTargetBoard(date),
  ]);

  const boardMap = new Map(boardRows.map((row) => [row.websiteId, row]));

  const statuses = await Promise.all(
    rules.map(async (rule) => {
      const row = boardMap.get(rule.websiteId);
      if (!row) {
        return {
          ruleId: rule.id,
          websiteId: rule.websiteId,
          triggered: false,
          title: "Veri bulunamadı",
          description: "Seçili gün için hedef verisi bulunamadı.",
        };
      }
      const evaluation = await evaluatePanelAlertRule(rule, row);
      return {
        ruleId: rule.id,
        websiteId: rule.websiteId,
        ...evaluation,
      };
    })
  );

  return NextResponse.json({ statuses });
}
