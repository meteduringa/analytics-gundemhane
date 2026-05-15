import { NextResponse } from "next/server";
import { readPanelSession } from "@/lib/panel-session";

export async function GET() {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: session.id,
      email: session.email,
      name: session.name ?? null,
      role: session.role,
      panelSections: session.panelSections,
    },
  });
}
