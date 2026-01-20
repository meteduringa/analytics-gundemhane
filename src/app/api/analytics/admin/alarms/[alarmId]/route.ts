import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ alarmId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { alarmId } = await context.params;
  const payload = await request.json();
  const isActive =
    typeof payload.isActive === "boolean" ? payload.isActive : undefined;

  if (typeof isActive === "undefined") {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const alarm = await prisma.analyticsAlarm.update({
    where: { id: alarmId },
    data: { isActive },
  });

  return NextResponse.json({ alarm });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ alarmId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { alarmId } = await context.params;
  await prisma.analyticsAlarm.delete({
    where: { id: alarmId },
  });

  return NextResponse.json({ ok: true });
}
