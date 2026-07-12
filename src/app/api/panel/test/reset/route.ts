import { mkdir, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { readPanelSession } from "@/lib/panel-session";
import { backupTestData, dataPaths } from "@/lib/bik-test-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const backup = await backupTestData("manual-panel-reset");
  await mkdir(dataPaths.dataDir, { recursive: true });
  await Promise.all([
    writeFile(dataPaths.eventsPath, "", "utf8"),
    writeFile(dataPaths.rejectionsPath, "", "utf8"),
  ]);

  return NextResponse.json({ ok: true, backup });
}
