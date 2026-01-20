import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const parseDomains = (input: unknown) => {
  if (Array.isArray(input)) {
    return input
      .map((value) => String(value).trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/[,\s]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const websites = await prisma.analyticsWebsite.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ websites });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const payload = await request.json();
  const name = String(payload.name ?? "").trim();
  const allowedDomains = parseDomains(payload.allowedDomains);

  if (!name || allowedDomains.length === 0) {
    return NextResponse.json(
      { error: "Name and allowed domains are required." },
      { status: 400 }
    );
  }

  const website = await prisma.analyticsWebsite.create({
    data: {
      name,
      allowedDomains,
    },
  });

  return NextResponse.json({ website });
}
