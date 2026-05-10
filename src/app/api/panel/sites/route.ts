import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readPanelSession } from "@/lib/panel-session";

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
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }

  if (session.role === "ADMIN") {
    const sites = await prisma.analyticsWebsite.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ sites });
  }

  const links = await prisma.analyticsUserWebsite.findMany({
    where: { userId: session.id },
    include: { website: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    sites: links.map((link) => link.website),
  });
}

const parseIds = (input: unknown) => {
  if (Array.isArray(input)) {
    return input
      .map((value) => String(value).trim())
      .filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
};

export async function POST(request: Request) {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const payload = await request.json();
  const name = String(payload.name ?? "").trim();
  const url = String(payload.url ?? "").trim();

  if (!name || !url) {
    return NextResponse.json(
      { error: "Site adı ve URL zorunludur." },
      { status: 400 }
    );
  }

  const parsedUrl = normalizeUrl(url);
  const siteUrl = parsedUrl.origin.replace(/\/+$/, "");
  const primaryDomain = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
  const allowedDomains = buildAllowedDomains(parsedUrl.hostname);

  const existingWebsite = await prisma.analyticsWebsite.findFirst({
    where: {
      OR: [
        { primaryDomain },
        { allowedDomains: { hasSome: allowedDomains } },
      ],
    },
  });

  if (existingWebsite) {
    return NextResponse.json(
      {
        error: "Bu domain için zaten bir site kaydı var.",
        websiteId: existingWebsite.id,
      },
      { status: 409 }
    );
  }

  const website = await prisma.analyticsWebsite.create({
    data: {
      name,
      siteUrl,
      primaryDomain,
      allowedDomains,
    },
  });

  return NextResponse.json({ website });
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
  const websiteId = String(payload.websiteId ?? "");
  const whitelistWebsiteIds =
    payload.whitelistWebsiteIds !== undefined
      ? parseIds(payload.whitelistWebsiteIds)
      : null;
  const blacklistWebsiteIds =
    payload.blacklistWebsiteIds !== undefined
      ? parseIds(payload.blacklistWebsiteIds)
      : null;

  if (!websiteId) {
    return NextResponse.json(
      { error: "Website ID gerekli." },
      { status: 400 }
    );
  }
  if (whitelistWebsiteIds === null && blacklistWebsiteIds === null) {
    return NextResponse.json(
      { error: "Güncellenecek alan yok." },
      { status: 400 }
    );
  }

  const website = await prisma.analyticsWebsite.update({
    where: { id: websiteId },
    data: {
      ...(whitelistWebsiteIds !== null
        ? { whitelistWebsiteIds }
        : {}),
      ...(blacklistWebsiteIds !== null
        ? { blacklistWebsiteIds }
        : {}),
    },
  });

  return NextResponse.json({ website });
}
