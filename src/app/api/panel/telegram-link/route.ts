import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readPanelSession } from "@/lib/panel-session";
import {
  generateTelegramLinkCode,
  getActiveTelegramLinkToken,
} from "@/lib/telegram-link";

export const runtime = "nodejs";

export async function GET() {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }

  const [user, activeToken] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.id },
      include: {
        userWebsites: {
          include: {
            website: {
              select: { id: true, name: true },
            },
          },
        },
      },
    }),
    getActiveTelegramLinkToken(session.id),
  ]);

  if (!user) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({
    linked: Boolean(user.telegramChatId),
    telegramChatId: user.telegramChatId,
    activeTokenExpiresAt: activeToken?.expiresAt ?? null,
    websites: user.userWebsites.map((item) => item.website),
  });
}

export async function POST() {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }

  const result = await generateTelegramLinkCode(session.id);
  return NextResponse.json(result);
}

export async function DELETE() {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: session.id },
    data: { telegramChatId: null },
  });

  await prisma.telegramLinkToken.deleteMany({
    where: { userId: session.id, consumedAt: null },
  });

  return NextResponse.json({ ok: true });
}
