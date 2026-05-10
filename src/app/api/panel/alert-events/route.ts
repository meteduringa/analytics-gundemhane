import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readPanelSession } from "@/lib/panel-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const url = new URL(request.url);
  const websiteId = url.searchParams.get("websiteId") ?? undefined;

  const events = await prisma.panelAlertEvent.findMany({
    where: websiteId ? { websiteId } : undefined,
    include: {
      website: { select: { id: true, name: true } },
      alertRule: { select: { id: true, name: true, type: true } },
    },
    orderBy: { triggeredAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ events });
}
