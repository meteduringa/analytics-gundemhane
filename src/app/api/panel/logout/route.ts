import { NextResponse } from "next/server";
import { clearPanelSessionCookie } from "@/lib/panel-session";

export async function POST() {
  await clearPanelSessionCookie();
  return NextResponse.json({ ok: true });
}
