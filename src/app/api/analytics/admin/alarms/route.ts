  import { NextResponse } from "next/server";
  import { getServerSession } from "next-auth";
  import { authOptions } from "@/lib/auth";
  import { prisma } from "@/lib/prisma";

  const ALARM_TYPES = ["EVENT_THRESHOLD", "ONLINE_BELOW"] as const;
  type AlarmType = (typeof ALARM_TYPES)[number];

  export const runtime = "nodejs";

  export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const url = new URL(request.url);
    const websiteId = url.searchParams.get("websiteId") ?? undefined;

    const alarms = await prisma.analyticsAlarm.findMany({
      where: websiteId ? { websiteId } : undefined,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ alarms });
  }

  export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const payload = await request.json();
    const name = String(payload.name ?? "").trim();
    const websiteId = String(payload.websiteId ?? "");
    const type = String(payload.type ?? "");
    const threshold = Number(payload.threshold ?? 0);
    const windowSeconds = Number(payload.windowSeconds ?? 60);

    if (!name || !websiteId || !type || !threshold) {
      return NextResponse.json(
        { error: "Name, website, type, and threshold are required." },
        { status: 400 }
      );
    }

    if (!ALARM_TYPES.includes(type as AlarmType)) {
      return NextResponse.json({ error: "Invalid alarm type." }, { status: 400 });
    }

    const website = await prisma.analyticsWebsite.findUnique({
      where: { id: websiteId },
    });
    if (!website) {
      return NextResponse.json({ error: "Website not found." }, { status: 404 });
    }

    const alarm = await prisma.analyticsAlarm.create({
      data: {
        name,
        websiteId,
        type: type as AlarmType,
        threshold,
        windowSeconds: Math.max(30, windowSeconds),
      },
    });

    return NextResponse.json({ alarm });
  }

