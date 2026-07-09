import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import {
  listClickaduEventStopRules,
  upsertClickaduEventStopRule,
} from "@/lib/clickadu-event-stop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unauthorized = () =>
  NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

const unavailable = () =>
  NextResponse.json(
    { ok: false, error: "CLICKADU_EVENT_STOP_SECRET is not configured." },
    { status: 503 }
  );

function authorized(request: Request) {
  const secret = process.env.CLICKADU_EVENT_STOP_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("x-event-stop-secret")?.trim();
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return header === secret || bearer === secret;
}

function secretConfigured() {
  return Boolean(process.env.CLICKADU_EVENT_STOP_SECRET?.trim());
}

export async function GET(request: Request) {
  if (!secretConfigured()) return unavailable();
  if (!authorized(request)) return unauthorized();
  const redis = await getRedis();
  const rules = await listClickaduEventStopRules(redis);
  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    count: rules.length,
    rules,
  });
}

export async function POST(request: Request) {
  if (!secretConfigured()) return unavailable();
  if (!authorized(request)) return unauthorized();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const rules = Array.isArray((payload as { rules?: unknown[] })?.rules)
    ? (payload as { rules: unknown[] }).rules
    : [(payload as { rule?: unknown })?.rule ?? payload];

  const redis = await getRedis();
  const results = [];
  for (const rule of rules) {
    results.push(await upsertClickaduEventStopRule(redis, rule));
  }
  const activeRules = await listClickaduEventStopRules(redis);
  return NextResponse.json({
    ok: results.every((result) => result.ok || result.skipped),
    generatedAt: new Date().toISOString(),
    received: rules.length,
    saved: results.filter((result) => result.ok).length,
    results,
    count: activeRules.length,
    rules: activeRules,
  });
}
