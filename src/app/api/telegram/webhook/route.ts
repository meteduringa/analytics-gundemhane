import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTargetBoard, type TargetBoardRow } from "@/lib/panel-alerts";
import { sendTelegramMessage } from "@/lib/telegram";
import { consumeTelegramLinkCode } from "@/lib/telegram-link";
import {
  CUSTOMER_ALERT_SHORTCUTS,
  type CustomerAlertShortcut,
} from "@/lib/alert-presets";

export const runtime = "nodejs";

type TelegramUpdate = {
  message?: {
    chat?: { id?: number; type?: string };
    text?: string;
  };
};

const normalize = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const formatIstanbulDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const buildHelpMessage = () =>
  [
    "Kullanılabilir komutlar:",
    "/rakam — Bugünkü rakamları gösterir",
    "/hedef — Bugünkü hedef durumunu gösterir",
    "/siteler — Yetkili olduğun siteleri listeler",
    "/alarmlar — Alarm durumlarını gösterir",
    "/alarmac ANAHTAR [site] — Alarmı açar",
    "/alarmkapat ANAHTAR [site] — Alarmı kapatır",
    "/testalarm — Test mesajı gönderir",
    "/baglan KOD — Telegram hesabını panel hesabına bağlar",
    "/baglantikes — Telegram hesabı bağlantısını kaldırır",
    "/yardim — Yardım metni",
    "",
    "Birden fazla siten varsa komuta site adı ekleyebilirsin.",
    "Örnek: /rakam haber expres",
    "Örnek: /alarmac 23tekil",
  ].join("\n");

const buildStatsLine = (row: TargetBoardRow) =>
  [
    `${row.websiteName}`,
    `Direct: ${row.currentDirectUnique}`,
    `Tekil: ${row.currentUnique}`,
    `PV: ${row.currentPageviews}`,
    `Cache: ${formatIstanbulDateTime(row.recordUpdatedAt)}`,
  ].join(" | ");

const buildTargetLine = (row: TargetBoardRow) =>
  [
    `${row.websiteName}`,
    `Direct ${row.currentDirectUnique}/${row.dailyDirectUniqueTarget ?? "-"}`,
    `Tekil ${row.currentUnique}/${row.dailyUniqueTarget ?? "-"}`,
    `PV ${row.currentPageviews}/${row.dailyPageviewTarget ?? "-"}`,
    `00:00 D/T/PV ${row.projectedDirectUniqueAtMidnight ?? "-"}/${row.projectedUniqueAtMidnight ?? "-"}/${row.projectedPageviewsAtMidnight ?? "-"}`,
  ].join(" | ");

const findMatchingRows = (rows: TargetBoardRow[], query: string) => {
  const normalizedQuery = normalize(query);
  return rows.filter((row) => normalize(row.websiteName).includes(normalizedQuery));
};

const resolveShortcut = (value: string) => {
  const normalizedValue = normalize(value);
  return (
    CUSTOMER_ALERT_SHORTCUTS.find((item) =>
      item.aliases.some((alias) => normalize(alias) === normalizedValue)
    ) ?? null
  );
};

const buildAlarmCatalogMessage = () =>
  [
    "Kullanılabilir alarm anahtarları:",
    ...CUSTOMER_ALERT_SHORTCUTS.map(
      (item) => `- ${item.key}: ${item.description}`
    ),
  ].join("\n");

const buildRuleStatusLine = (
  row: TargetBoardRow,
  shortcut: CustomerAlertShortcut,
  isActive: boolean
) =>
  `${row.websiteName} | ${shortcut.key} | ${shortcut.label} | ${
    isActive ? "Açık" : "Kapalı"
  }`;

const getAuthorizedRows = async (chatId: string) => {
  const [linkedUser, siteLinkedRows] = await Promise.all([
    prisma.user.findUnique({
      where: { telegramChatId: chatId },
      include: {
        userWebsites: {
          include: {
            website: true,
          },
        },
      },
    }),
    prisma.analyticsWebsite.findMany({
      where: { telegramChatId: chatId },
      orderBy: { name: "asc" },
      select: { id: true },
    }),
  ]);

  let websiteIds: string[] = [];
  if (linkedUser) {
    if (linkedUser.role === "ADMIN") {
      const allSites = await prisma.analyticsWebsite.findMany({
        orderBy: { name: "asc" },
        select: { id: true },
      });
      websiteIds = allSites.map((site) => site.id);
    } else {
      websiteIds = linkedUser.userWebsites.map((item) => item.websiteId);
    }
  }

  for (const site of siteLinkedRows) {
    if (!websiteIds.includes(site.id)) {
      websiteIds.push(site.id);
    }
  }

  if (websiteIds.length === 0) {
    return [];
  }

  const board = await getTargetBoard(new Date());
  return board.filter((row) => websiteIds.includes(row.websiteId));
};

const getAuthorizedAlarmRules = async (websiteIds: string[]) => {
  if (websiteIds.length === 0) return [];
  return prisma.panelAlertRule.findMany({
    where: { websiteId: { in: websiteIds } },
    select: {
      id: true,
      name: true,
      websiteId: true,
      isActive: true,
      website: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{ website: { name: "asc" } }, { name: "asc" }],
  });
};

const resolveSingleRowForToggle = (
  rows: TargetBoardRow[],
  siteQuery: string
) => {
  const matchingRows = siteQuery ? findMatchingRows(rows, siteQuery) : rows;
  if (matchingRows.length === 0) {
    return {
      error: siteQuery ? `Eşleşen site bulunamadı: ${siteQuery}` : "Yetkili site bulunamadı.",
      row: null,
    };
  }
  if (matchingRows.length > 1) {
    return {
      error:
        "Birden fazla site eşleşti. Komutu site adıyla tekrar yaz. Örnek: /alarmac 23tekil haber expres",
      row: null,
    };
  }
  return { error: null, row: matchingRows[0] };
};

const unlinkTelegramAccount = async (chatId: string) => {
  const user = await prisma.user.findUnique({
    where: { telegramChatId: chatId },
    select: { id: true, email: true },
  });

  if (!user) {
    return null;
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: null },
    }),
    prisma.telegramLinkToken.deleteMany({
      where: { userId: user.id, consumedAt: null },
    }),
  ]);

  return user;
};

const ensureWebhookSecret = (request: Request) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return true;
  return (
    request.headers.get("x-telegram-bot-api-secret-token") === secret
  );
};

export async function POST(request: Request) {
  if (!ensureWebhookSecret(request)) {
    return NextResponse.json({ error: "Geçersiz webhook." }, { status: 401 });
  }

  const update = (await request.json().catch(() => ({}))) as TelegramUpdate;
  const text = update.message?.text?.trim();
  const rawChatId = update.message?.chat?.id;

  if (!text || rawChatId === undefined || rawChatId === null) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const chatId = String(rawChatId);
  const rows = await getAuthorizedRows(chatId);

  const [rawCommand, ...rest] = text.split(/\s+/);
  const command = rawCommand.split("@")[0].toLocaleLowerCase("tr-TR");
  const query = rest.join(" ").trim();

  if (command === "/baglan") {
    if (!query) {
      await sendTelegramMessage({
        chatId,
        text:
          "Önce panelden Telegram bağlantı kodu üret. Sonra bota şu formatta yaz:\n/baglan KOD",
      });
      return NextResponse.json({ ok: true, authorized: false, binding: "missing_code" });
    }

    const result = await consumeTelegramLinkCode(query, chatId);
    if (!result.ok) {
      const textByReason: Record<string, string> = {
        missing: "Bağlantı kodu eksik. Kullanım: /baglan KOD",
        invalid: "Bağlantı kodu geçersiz veya süresi dolmuş.",
        chat_in_use: "Bu Telegram hesabı başka bir kullanıcıya bağlı.",
      };
      await sendTelegramMessage({
        chatId,
        text: textByReason[result.reason] ?? "Bağlantı kurulamadı.",
      });
      return NextResponse.json({ ok: true, authorized: false, binding: result.reason });
    }

    await sendTelegramMessage({
      chatId,
      text: `Bağlantı tamamlandı. Hesap: ${result.username}\nArtık /rakam ve /hedef komutlarını kullanabilirsin.`,
    });
    return NextResponse.json({ ok: true, authorized: true, binding: "linked" });
  }

  if (command === "/baglantikes") {
    const unlinkedUser = await unlinkTelegramAccount(chatId);
    if (!unlinkedUser) {
      await sendTelegramMessage({
        chatId,
        text: "Bu Telegram hesabı şu anda bir panel kullanıcısına bağlı değil.",
      });
      return NextResponse.json({ ok: true, authorized: false, binding: "not_linked" });
    }

    await sendTelegramMessage({
      chatId,
      text: `Bağlantı kaldırıldı.\nHesap: ${unlinkedUser.email}\nTekrar bağlamak için panelden yeni kod üretip /baglan KOD kullan.`,
    });
    return NextResponse.json({ ok: true, authorized: false, binding: "unlinked" });
  }

  if (rows.length === 0) {
    await sendTelegramMessage({
      chatId,
      text:
        `Bu sohbet henüz bir kullanıcı veya site ile eşleştirilmemiş.\n\nChat ID: ${chatId}\n\nPanelden bağlantı kodu üretip şu komutu kullan:\n/baglan KOD`,
    });
    return NextResponse.json({ ok: true, authorized: false });
  }
  const matchingRows = query ? findMatchingRows(rows, query) : rows;

  if (query && matchingRows.length === 0) {
    await sendTelegramMessage({
      chatId,
      text: `Eşleşen site bulunamadı: ${query}`,
    });
    return NextResponse.json({ ok: true, authorized: true });
  }

  switch (command) {
    case "/start":
    case "/help":
    case "/yardim": {
      await sendTelegramMessage({ chatId, text: buildHelpMessage() });
      break;
    }
    case "/siteler": {
      const message = [
        "Yetkili siteler:",
        ...rows.map((row) => `- ${row.websiteName}`),
      ].join("\n");
      await sendTelegramMessage({ chatId, text: message });
      break;
    }
    case "/alarmlar": {
      const rules = await getAuthorizedAlarmRules(rows.map((row) => row.websiteId));
      const lines = rules
        .map((rule) => {
          const shortcut = CUSTOMER_ALERT_SHORTCUTS.find(
            (item) => item.ruleName === rule.name
          );
          if (!shortcut) return null;
          const row = rows.find((item) => item.websiteId === rule.websiteId);
          if (!row) return null;
          return buildRuleStatusLine(row, shortcut, rule.isActive);
        })
        .filter(Boolean) as string[];

      const message =
        lines.length > 0
          ? ["Alarm durumları:", ...lines, "", buildAlarmCatalogMessage()].join("\n")
          : `Bu hesaba tanımlı yönetilebilir alarm bulunamadı.\n\n${buildAlarmCatalogMessage()}`;

      await sendTelegramMessage({ chatId, text: message });
      break;
    }
    case "/alarmac":
    case "/alarmkapat": {
      const [shortcutInput, ...siteParts] = rest;
      if (!shortcutInput) {
        await sendTelegramMessage({
          chatId,
          text: `Kullanım:\n${command} ANAHTAR [site]\n\n${buildAlarmCatalogMessage()}`,
        });
        break;
      }

      const shortcut = resolveShortcut(shortcutInput);
      if (!shortcut) {
        await sendTelegramMessage({
          chatId,
          text: `Bilinmeyen alarm anahtarı: ${shortcutInput}\n\n${buildAlarmCatalogMessage()}`,
        });
        break;
      }

      const siteQuery = siteParts.join(" ").trim();
      const { row, error } = resolveSingleRowForToggle(rows, siteQuery);
      if (!row) {
        await sendTelegramMessage({ chatId, text: error ?? "Site çözümlenemedi." });
        break;
      }

      const rule = await prisma.panelAlertRule.findFirst({
        where: {
          websiteId: row.websiteId,
          name: shortcut.ruleName,
        },
        select: {
          id: true,
          isActive: true,
        },
      });

      if (!rule) {
        await sendTelegramMessage({
          chatId,
          text: `${row.websiteName} için ${shortcut.key} alarmı tanımlı değil. Yönetici önce preset uygulamalı.`,
        });
        break;
      }

      const shouldActivate = command === "/alarmac";
      if (rule.isActive === shouldActivate) {
        await sendTelegramMessage({
          chatId,
          text: `${row.websiteName} için ${shortcut.key} alarmı zaten ${
            shouldActivate ? "açık" : "kapalı"
          }.`,
        });
        break;
      }

      await prisma.panelAlertRule.update({
        where: { id: rule.id },
        data: { isActive: shouldActivate },
      });

      await sendTelegramMessage({
        chatId,
        text: `${row.websiteName} için ${shortcut.key} alarmı ${
          shouldActivate ? "açıldı" : "kapatıldı"
        }.`,
      });
      break;
    }
    case "/rakam": {
      const message = [
        "Bugünkü rakamlar:",
        ...matchingRows.map((row) => buildStatsLine(row)),
      ].join("\n");
      await sendTelegramMessage({ chatId, text: message });
      break;
    }
    case "/hedef": {
      const message = [
        "Bugünkü hedef durumu:",
        ...matchingRows.map((row) => buildTargetLine(row)),
      ].join("\n");
      await sendTelegramMessage({ chatId, text: message });
      break;
    }
    case "/testalarm": {
      const firstRow = rows[0];
      const text = firstRow
        ? [
            "[TEST] Telegram alarm hattı çalışıyor",
            `Site: ${firstRow.websiteName}`,
            `Saat: ${formatIstanbulDateTime(new Date().toISOString())}`,
            "Bu bir test mesajıdır.",
          ].join("\n")
        : "[TEST] Telegram alarm hattı çalışıyor";
      await sendTelegramMessage({ chatId, text });
      break;
    }
    default: {
      await sendTelegramMessage({
        chatId,
        text: `Bilinmeyen komut: ${rawCommand}\n\n${buildHelpMessage()}`,
      });
      break;
    }
  }

  return NextResponse.json({ ok: true, authorized: true });
}
