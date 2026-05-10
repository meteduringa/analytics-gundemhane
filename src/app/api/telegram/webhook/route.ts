import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTargetBoard, type TargetBoardRow } from "@/lib/panel-alerts";
import { sendTelegramMessage } from "@/lib/telegram";
import { consumeTelegramLinkCode } from "@/lib/telegram-link";

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
    "/baglan KOD — Telegram hesabını panel hesabına bağlar",
    "/baglantikes — Telegram hesabı bağlantısını kaldırır",
    "/yardim — Yardım metni",
    "",
    "Birden fazla siten varsa komuta site adı ekleyebilirsin.",
    "Örnek: /rakam haber expres",
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
