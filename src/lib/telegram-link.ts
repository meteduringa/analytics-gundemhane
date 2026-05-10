import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

const TELEGRAM_LINK_TTL_MINUTES = 10;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const hashCode = (code: string) =>
  createHash("sha256").update(code).digest("hex");

const randomCode = (length = 8) => {
  const bytes = randomBytes(length);
  let output = "";
  for (let i = 0; i < length; i += 1) {
    output += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return output;
};

export const generateTelegramLinkCode = async (userId: string) => {
  await prisma.telegramLinkToken.deleteMany({
    where: {
      userId,
      consumedAt: null,
    },
  });

  const code = randomCode(8);
  const expiresAt = new Date(Date.now() + TELEGRAM_LINK_TTL_MINUTES * 60 * 1000);

  await prisma.telegramLinkToken.create({
    data: {
      userId,
      codeHash: hashCode(code),
      expiresAt,
    },
  });

  return { code, expiresAt };
};

export const consumeTelegramLinkCode = async (code: string, chatId: string) => {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) {
    return { ok: false as const, reason: "missing" as const };
  }

  const codeHash = hashCode(normalizedCode);
  const token = await prisma.telegramLinkToken.findFirst({
    where: {
      codeHash,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });

  if (!token) {
    return { ok: false as const, reason: "invalid" as const };
  }

  return finalizeToken(token.id, token.userId, chatId, token.user.email);
};

const finalizeToken = async (
  tokenId: string,
  userId: string,
  chatId: string,
  username: string
) => {
  const conflictingUser = await prisma.user.findFirst({
    where: {
      telegramChatId: chatId,
      NOT: { id: userId },
    },
    select: { id: true },
  });

  if (conflictingUser) {
    return { ok: false as const, reason: "chat_in_use" as const };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { telegramChatId: chatId },
    }),
    prisma.telegramLinkToken.update({
      where: { id: tokenId },
      data: {
        consumedAt: new Date(),
        consumedChatId: chatId,
      },
    }),
  ]);

  return {
    ok: true as const,
    username,
  };
};

export const getActiveTelegramLinkToken = async (userId: string) => {
  const token = await prisma.telegramLinkToken.findFirst({
    where: {
      userId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      expiresAt: true,
      createdAt: true,
    },
  });

  return token;
};
