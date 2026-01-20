import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { role: "CUSTOMER" },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      userWebsites: {
        include: { website: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const payload = await request.json();
  const name = payload.name ? String(payload.name).trim() : null;
  const email = String(payload.email ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");
  const websiteId = String(payload.websiteId ?? "");

  if (!email || !password || !websiteId) {
    return NextResponse.json(
      { error: "Email, password, and website are required." },
      { status: 400 }
    );
  }

  const website = await prisma.analyticsWebsite.findUnique({
    where: { id: websiteId },
  });
  if (!website) {
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "User already exists." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: "CUSTOMER",
      userWebsites: {
        create: {
          websiteId,
        },
      },
    },
    include: {
      userWebsites: {
        include: { website: true },
      },
    },
  });

  return NextResponse.json({ user });
}
