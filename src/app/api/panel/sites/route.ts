import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const normalizeUrl = (value: string) => {
  try {
    return new URL(value);
  } catch {
    return new URL(`https://${value}`);
  }
};

const buildAllowedDomains = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  if (normalized.startsWith("www.")) {
    return [normalized, normalized.replace(/^www\./, "")];
  }
  return [normalized, `www.${normalized}`];
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "";
  const role = searchParams.get("role") ?? "";

  if (role === "ADMIN") {
    const sites = await prisma.analyticsWebsite.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ sites });
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Kullanıcı bilgisi gerekli." },
      { status: 400 }
    );
  }

  const links = await prisma.analyticsUserWebsite.findMany({
    where: { userId },
    include: { website: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    sites: links.map((link) => link.website),
  });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const name = String(payload.name ?? "").trim();
  const url = String(payload.url ?? "").trim();
  const actorRole = String(payload.actorRole ?? "");
  const userEmail = String(payload.userEmail ?? "").trim();
  const userPassword = String(payload.userPassword ?? "");

  if (actorRole !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  if (!name || !url) {
    return NextResponse.json(
      { error: "Site adı ve URL zorunludur." },
      { status: 400 }
    );
  }

  const parsedUrl = normalizeUrl(url);
  const allowedDomains = buildAllowedDomains(parsedUrl.hostname);

  const website = await prisma.analyticsWebsite.create({
    data: {
      name,
      allowedDomains,
    },
  });

  let createdUser = null;
  if (userEmail) {
    let user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user) {
      if (!userPassword) {
        return NextResponse.json(
          { error: "Yetkili için şifre zorunludur." },
          { status: 400 }
        );
      }
      const passwordHash = await bcrypt.hash(userPassword, 10);
      user = await prisma.user.create({
        data: {
          email: userEmail,
          passwordHash,
          role: "CUSTOMER",
          name: userEmail.split("@")[0],
        },
      });
      createdUser = { id: user.id, email: user.email };
    }

    await prisma.analyticsUserWebsite.create({
      data: {
        userId: user.id,
        websiteId: website.id,
      },
    });
  }

  return NextResponse.json({ website, user: createdUser });
}
