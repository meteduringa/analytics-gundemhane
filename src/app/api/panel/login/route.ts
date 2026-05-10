import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import {
  createPanelSessionToken,
  setPanelSessionCookie,
} from "@/lib/panel-session";

export async function POST(request: Request) {
  const payload = await request.json();
  const username = String(payload.username ?? "").trim();
  const password = String(payload.password ?? "");

  if (!username || !password) {
    return NextResponse.json(
      { error: "Kullanıcı adı ve şifre zorunludur." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { email: username } });

  if (!user || !user.passwordHash) {
    return NextResponse.json(
      { error: "Kullanıcı adı veya şifre hatalı." },
      { status: 401 }
    );
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return NextResponse.json(
      { error: "Kullanıcı adı veya şifre hatalı." },
      { status: 401 }
    );
  }

  const userPayload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    panelSections: user.panelSections ?? [],
  };

  const token = createPanelSessionToken(userPayload);
  await setPanelSessionCookie(token);

  return NextResponse.json({ user: userPayload });
}
