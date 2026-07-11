import { NextResponse } from "next/server";
import { readPanelSession } from "@/lib/panel-session";
import { createSite, readTestSites } from "@/lib/bik-test-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const sites = await readTestSites();
  return NextResponse.json({ sites });
}

export async function POST(request: Request) {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  const name = String(payload?.name || "").trim();
  const domain = String(payload?.domain || "").trim();
  const publishCode = String(payload?.publishCode || "").trim();
  const collectorNode = String(payload?.collectorNode || "").trim();

  if (!name || !domain) {
    return NextResponse.json(
      { error: "Site adi ve domain zorunludur." },
      { status: 400 }
    );
  }

  const site = await createSite({
    name,
    domain,
    publishCode: publishCode || undefined,
    collectorNode: collectorNode || undefined,
  });

  return NextResponse.json({ site });
}
