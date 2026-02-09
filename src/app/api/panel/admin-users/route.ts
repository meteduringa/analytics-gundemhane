import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const parseSections = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,
]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role") ?? "";

  if (role !== "ADMIN") {
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
  const payload = await request.json();
  const actorRole = String(payload.actorRole ?? "");
  const email = String(payload.email ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");
  const name = payload.name ? String(payload.name).trim() : null;
  const role = String(payload.role ?? "CUSTOMER");
  const websiteId = String(payload.websiteId ?? "");
  const panelSections = parseSections(payload.panelSections);

  if (actorRole !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }
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
      name,
      passwordHash,
      role: role === "ADMIN" ? "ADMIN" : "CUSTOMER",
      panelSections,
      ...(websiteId
        ? {
            userWebsites: {
              create: { websiteId },
            },
          }
        : {}),
    },
    include: {
      userWebsites: { include: { website: true } },
    },
  });

  return NextResponse.json({ user });
}

export async function PATCH(request: Request) {
  const payload = await request.json();
  const actorRole = String(payload.actorRole ?? "");
  const userId = String(payload.userId ?? "");

  if (actorRole !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }
  if (!userId) {
    return NextResponse.json({ error: "userId gerekli." }, { status: 400 });
  }

  const updates: {
    name?: string | null;
    email?: string;
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
  if (payload.role) {
    updates.role = String(payload.role) === "ADMIN" ? "ADMIN" : "CUSTOMER";
  }
  if (payload.panelSections !== undefined) {
    updates.panelSections = parseSections(payload.panelSections);
  }
  if (payload.password) {
    updates.passwordHash = await bcrypt.hash(String(payload.password), 10);
  }

  const websiteId = payload.websiteId ? String(payload.websiteId) : null;

  const user = await prisma.user.update({
    where: { id: userId },
    data: updates,
    include: { userWebsites: { include: { website: true } } },
  });

  if (websiteId) {
    await prisma.analyticsUserWebsite.deleteMany({
      where: { userId },
    });
    await prisma.analyticsUserWebsite.create({
      data: { userId, websiteId },
    });
  }

  const refreshed = await prisma.user.findUnique({
    where: { id: userId },
    include: { userWebsites: { include: { website: true } } },
  });

  return NextResponse.json({ user: refreshed ?? user });
}

export async function DELETE(request: Request) {
  const payload = await request.json();
  const actorRole = String(payload.actorRole ?? "");
  const userId = String(payload.userId ?? "");

  if (actorRole !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }
  if (!userId) {
    return NextResponse.json({ error: "userId gerekli." }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ ok: true });
}
