import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readPanelSession } from "@/lib/panel-session";
import { parseDayParam } from "@/lib/bik-time";
import {
  buildAlertMessage,
  evaluatePanelAlertRule,
  getTargetBoard,
} from "@/lib/panel-alerts";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";

const isLocalRunnerRequest = (request: Request) => {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
};

const toPrismaJson = (value: unknown): Prisma.InputJsonValue => {
  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue) => {
      if (nestedValue === undefined) return null;
      if (typeof nestedValue === "number" && !Number.isFinite(nestedValue)) {
        return null;
      }
      return nestedValue;
    })
  ) as Prisma.InputJsonValue;
};

const isCronAuthorized = (request: Request) => {
  const token = process.env.INTERNAL_CRON_TOKEN;
  if (!token) return false;
  const headerToken = request.headers.get("x-cron-token");
  const queryToken = new URL(request.url).searchParams.get("token");
  return headerToken === token || queryToken === token;
};

export async function POST(request: Request) {
  const session = await readPanelSession();
  const cronAuthorized = isCronAuthorized(request);
  const localRunnerRequest = isLocalRunnerRequest(request);
  if (!cronAuthorized && !localRunnerRequest) {
    if (!session) {
      return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
    }
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
    }
  }

  const payload = await request.json().catch(() => ({}));
  const websiteId = payload.websiteId ? String(payload.websiteId) : undefined;
  const date = parseDayParam(payload.date ?? null) ?? new Date();

  const [rules, boardRows] = await Promise.all([
    prisma.panelAlertRule.findMany({
      where: {
        isActive: true,
        ...(websiteId ? { websiteId } : {}),
      },
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
    }),
    getTargetBoard(date),
  ]);

  const boardMap = new Map(boardRows.map((row) => [row.websiteId, row]));

  const results = [];
  for (const rule of rules) {
    const row = boardMap.get(rule.websiteId);
    if (!row) continue;

    const evaluation = await evaluatePanelAlertRule(rule, row);
    let delivered = false;
    let telegramError: string | null = null;
    const shouldSend =
      evaluation.triggered &&
      rule.telegramEnabled &&
      (!rule.lastTriggeredAt ||
        Date.now() - rule.lastTriggeredAt.getTime() >= rule.cooldownSeconds * 1000);

    if (shouldSend) {
      const chatId =
        rule.telegramChatId ||
        rule.website.telegramChatId ||
        process.env.TELEGRAM_DEFAULT_CHAT_ID ||
        null;
      const message = buildAlertMessage(rule, evaluation, row);
      if (chatId) {
        try {
          await sendTelegramMessage({ chatId, text: message });
          delivered = true;
        } catch (error) {
          telegramError =
            error instanceof Error ? error.message : "Telegram gönderimi başarısız.";
        }
      } else {
        telegramError = "Telegram chat id tanımlı değil.";
      }

      await prisma.panelAlertEvent.create({
        data: {
          alertRuleId: rule.id,
          websiteId: rule.websiteId,
          message,
          payload: toPrismaJson(evaluation.payload),
          deliveredToTelegram: delivered,
          telegramChatId: chatId ?? undefined,
          telegramError: telegramError ?? undefined,
        },
      });

      await prisma.panelAlertRule.update({
        where: { id: rule.id },
        data: { lastTriggeredAt: new Date() },
      });
    }

    results.push({
      ruleId: rule.id,
      websiteId: rule.websiteId,
      delivered,
      telegramError,
      ...evaluation,
    });
  }

  return NextResponse.json({
    totalRules: rules.length,
    triggeredCount: results.filter((item) => item.triggered).length,
    results,
  });
}
