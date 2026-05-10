import { NextResponse } from "next/server";
import { readPanelSession } from "@/lib/panel-session";
import {
  ALERT_PRESET_OPTIONS,
  applyAlertPreset,
  type AlertPresetKey,
} from "@/lib/alert-presets";

export const runtime = "nodejs";

export async function GET() {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  return NextResponse.json({ presets: ALERT_PRESET_OPTIONS });
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
  const websiteId = String(payload.websiteId ?? "").trim();
  const presetKey = String(payload.presetKey ?? "").trim() as AlertPresetKey;

  if (!websiteId || !presetKey) {
    return NextResponse.json(
      { error: "websiteId ve presetKey zorunludur." },
      { status: 400 }
    );
  }

  const result = await applyAlertPreset(websiteId, presetKey);
  return NextResponse.json({ result });
}
