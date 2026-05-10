import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { readPanelSession } from "@/lib/panel-session";

const parseSections = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const parseWebsiteIds = (value: unknown) => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.map((item) => String(item).trim()).filter(Boolean))
    );
  }
  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split(/[,\n]/)
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  }
  return [];
};

export async function GET(request: Request) {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      userWebsites: {
        include: { website: true },
      },
    },
  });

  return NextResponse.json({ users });
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
  const email = String(payload.email ?? "").trim().toLowerCase();
  const telegramChatId = payload.telegramChatId
    ? String(payload.telegramChatId).trim()
    : null;
  const password = String(payload.password ?? "");
  const name = payload.name ? String(payload.name).trim() : null;
  const role = String(payload.role ?? "CUSTOMER");
  const websiteIds = parseWebsiteIds(payload.websiteIds ?? payload.websiteId);
  const panelSections = parseSections(payload.panelSections);
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email ve şifre zorunludur." },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "Bu email zaten kayıtlı." },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      telegramChatId,
      name,
      passwordHash,
      role: role === "ADMIN" ? "ADMIN" : "CUSTOMER",
      panelSections,
    },
  });

  if (websiteIds.length) {
    await prisma.analyticsUserWebsite.createMany({
      data: websiteIds.map((websiteId) => ({
        userId: user.id,
        websiteId,
      })),
    });
  }

  const createdUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      userWebsites: { include: { website: true } },
    },
  });

  return NextResponse.json({ user: createdUser ?? user });
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
  const userId = String(payload.userId ?? "");
  if (!userId) {
    return NextResponse.json({ error: "userId gerekli." }, { status: 400 });
  }

  const updates: {
    name?: string | null;
    email?: string;
    telegramChatId?: string | null;
    role?: "ADMIN" | "CUSTOMER";
    passwordHash?: string;
    panelSections?: string[];
  } = {};

  if (payload.name !== undefined) {
    updates.name = payload.name ? String(payload.name).trim() : null;
  }
  if (payload.email !== undefined) {
    updates.email = String(payload.email).trim().toLowerCase();
  }
  if (payload.telegramChatId !== undefined) {
    updates.telegramChatId = payload.telegramChatId
      ? String(payload.telegramChatId).trim()
      : null;
  }
  if (payload.role) {
    updates.role = String(payload.role) === "ADMIN" ? "ADMIN" : "CUSTOMER";
  }
  if (payload.panelSections !== undefined) {
    updates.panelSections = parseSections(payload.panelSections);
  }
  if (payload.password) {
    updates.passwordHash = await bcrypt.hash(String(payload.password), 10);
  }

  const websiteIds =
    payload.websiteIds !== undefined || payload.websiteId !== undefined
      ? parseWebsiteIds(payload.websiteIds ?? payload.websiteId)
      : null;

  const user = await prisma.user.update({
    where: { id: userId },
    data: updates,
    include: { userWebsites: { include: { website: true } } },
  });

  if (websiteIds !== null) {
    await prisma.analyticsUserWebsite.deleteMany({
      where: { userId },
    });
    if (websiteIds.length) {
      await prisma.analyticsUserWebsite.createMany({
        data: websiteIds.map((websiteId) => ({ userId, websiteId })),
      });
    }
  }

  const refreshed = await prisma.user.findUnique({
    where: { id: userId },
    include: { userWebsites: { include: { website: true } } },
  });

  return NextResponse.json({ user: refreshed ?? user });
}

export async function DELETE(request: Request) {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const payload = await request.json();
  const userId = String(payload.userId ?? "");
  if (!userId) {
    return NextResponse.json({ error: "userId gerekli." }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ ok: true });
}
