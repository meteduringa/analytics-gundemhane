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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ websiteId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { websiteId } = await context.params;
  const payload = await request.json();
  const name = payload.name ? String(payload.name).trim() : null;
  const allowedDomains = payload.allowedDomains
    ? parseDomains(payload.allowedDomains)
    : null;

  if (!name && !allowedDomains) {
    return NextResponse.json(
      { error: "Nothing to update." },
      { status: 400 }
    );
  }
  if (allowedDomains && allowedDomains.length === 0) {
    return NextResponse.json(
      { error: "Allowed domains cannot be empty." },
      { status: 400 }
    );
  }

  const website = await prisma.analyticsWebsite.update({
    where: { id: websiteId },
    data: {
      ...(name ? { name } : {}),
      ...(allowedDomains ? { allowedDomains } : {}),
    },
  });

  return NextResponse.json({ website });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ websiteId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { websiteId } = await context.params;
  await prisma.analyticsWebsite.delete({
    where: { id: websiteId },
  });

  return NextResponse.json({ ok: true });
}
