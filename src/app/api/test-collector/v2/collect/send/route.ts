import { NextResponse } from "next/server";
import {
  normalizeEventPayload,
  parseBody,
  storeTestEvent,
} from "@/lib/bik-test-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-bik-cache",
});

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  let payload: Record<string, unknown>;
  try {
    payload = await parseBody(request);
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid-payload" },
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  const input = normalizeEventPayload(payload, "v2", "send");
  if (!input.websiteId || !input.url) {
    return NextResponse.json(
      { ok: false, error: "missing-required-fields" },
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  const stored = await storeTestEvent(request, input);
  return NextResponse.json(
    {
      ok: stored.accepted,
      eventId: stored.id,
      accepted: stored.accepted,
      counted: stored.accepted && !stored.isBot,
      bot: stored.isBot,
      reason: stored.rejectReason || null,
    },
    {
      status: stored.accepted ? 200 : 403,
      headers: corsHeaders(origin),
    }
  );
}
