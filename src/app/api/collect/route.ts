  import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { getCountryCode, normalizeCountryCode } from "@/lib/bik-rules";
  import crypto from "crypto";

  export const runtime = "nodejs";

  const RATE_LIMIT_WINDOW_MS = 60_000;
  const RATE_LIMIT_MAX = 120;
  const ONLINE_WINDOW_MS = 120_000;
  const LIVE_WINDOW_MS = 5 * 60_000;
  const ALARM_EVENT_WINDOW_MS = 60 * 60_000;

  const corsHeaders = (origin?: string | null) => ({
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });

  const normalizeHost = (value: string) => value.replace(/:\d+$/, "").toLowerCase();

  const extractHostname = (value: string | null) => {
    if (!value) return null;
    try {
      const url = new URL(value);
      return normalizeHost(url.hostname);
    } catch {
      return null;
    }
  };

  const normalizeIp = (value: string) => value.replace(/^\[|\]$/g, "");
  const stripPort = (value: string) => value.replace(/:\d+$/, "");
  const getRequestIp = (request: Request) => {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      const raw = forwardedFor.split(",")[0]?.trim() ?? "";
      const normalized = normalizeIp(raw);
      return stripPort(normalized);
    }
    const realIp = request.headers.get("x-real-ip");
    if (realIp) {
      const normalized = normalizeIp(realIp);
      return stripPort(normalized);
    }
    return "unknown";
  };

  const parsePayload = async (request: Request) => {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return request.json();
    }
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = await request.text();
      return Object.fromEntries(new URLSearchParams(body));
    }
    return request.json();
  };

  const asString = (value: unknown) =>
    typeof value === "string" ? value : value ? String(value) : null;
  const asStringAllowEmpty = (value: unknown) =>
    typeof value === "string" ? value : value === "" ? "" : value ? String(value) : null;
  const normalizeStrictUrl = (value: string) => {
    try {
      const parsed = new URL(value, "https://example.com");
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return value.split("#")[0] ?? value;
    }
  };
  const extractSourceWebsiteId = (value: string) => {
    if (!value) return null;
    try {
      const parsed = new URL(value, "https://example.com");
      return (
        parsed.searchParams.get("website_id") ||
        parsed.searchParams.get("site_id") ||
        null
      );
    } catch {
      return null;
    }
  };
  const extractPopcentMeta = (value: string) => {
    if (!value) return { pc_source: null, pc_cat: null };
    try {
      const parsed = new URL(value, "https://example.com");
      return {
        pc_source: parsed.searchParams.get("pc_source"),
        pc_cat: parsed.searchParams.get("pc_cat"),
      };
    } catch {
      return { pc_source: null, pc_cat: null };
    }
  };
  const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const istanbulDayString = (date: Date) => {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(date);
  };
  const hashKey = (value: string) =>
    crypto.createHash("sha256").update(value).digest("hex");

  export async function OPTIONS(request: Request) {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(request.headers.get("origin")),
    });
  }

  export async function POST(request: Request) {
    const origin = request.headers.get("origin");
    const redis = await getRedis();
    const ip = getRequestIp(request);
    const rateKey = `analytics:rate:${ip}`;

    const rate = await redis.incr(rateKey);
    if (rate === 1) {
      await redis.pExpire(rateKey, RATE_LIMIT_WINDOW_MS);
    }
    if (rate > RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: "Rate limit exceeded." },
        { status: 429, headers: corsHeaders(origin) }
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = await parsePayload(request);
    } catch {
      return NextResponse.json(
        { error: "Invalid payload." },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const websiteId = String(payload.website_id ?? payload.website ?? "");
    const type = String(payload.type ?? "");
    const url = String(payload.url ?? "");
    const visitorId = String(payload.visitor_id ?? payload.fingerprint ?? "");
    const sessionId = String(payload.session_id ?? "");
    const isStrictPageview = type === "bik_pageview";
    const isStrictPing = type === "bik_ping";
    const isStrict = isStrictPageview || isStrictPing;

    if (!websiteId || !type || !url || !visitorId || (!isStrict && !sessionId)) {
      return NextResponse.json(
        { error: "Invalid payload." },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const website = await prisma.analyticsWebsite.findUnique({
      where: { id: websiteId },
    });

    if (!website) {
      return NextResponse.json(
        { error: "Website not found." },
        { status: 404, headers: corsHeaders(origin) }
      );
    }

    const sourceWebsiteId =
      extractSourceWebsiteId(url) ??
      asString(payload.source_website_id) ??
      asString(payload.sourceWebsiteId) ??
      null;
    const popcentMeta = extractPopcentMeta(url);

    const originHost =
      extractHostname(origin) ?? extractHostname(request.headers.get("referer"));

    if (originHost) {
      const allowed = website.allowedDomains.some(
        (domain: string) => normalizeHost(domain) === originHost
      );
      if (!allowed) {
        return NextResponse.json(
          { error: "Domain not allowed." },
          { status: 403, headers: corsHeaders(origin) }
        );
      }
    }

    const clientTs = payload.ts ? new Date(String(payload.ts)) : null;
    const clientTimestamp =
      clientTs && !Number.isNaN(clientTs.getTime()) ? clientTs : null;

    const eventType =
      type === "pageview"
        ? "PAGEVIEW"
        : type === "event"
        ? "EVENT"
        : type === "bik_pageview"
        ? "PAGEVIEW"
        : type === "bik_ping"
        ? "EVENT"
        : null;

    if (!eventType) {
      return NextResponse.json(
        { error: "Invalid event type." },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const eventData =
      typeof payload.event_data === "string"
        ? JSON.parse(payload.event_data)
        : payload.event_data ?? undefined;
    const payloadPcSource =
      asString(payload.pc_source) ??
      (isPlainObject(eventData) ? asString(eventData.pc_source) : null);
    const payloadPcCat =
      asString(payload.pc_cat) ??
      (isPlainObject(eventData) ? asString(eventData.pc_cat) : null);
    const enrichedEventData = (() => {
      const extra: Record<string, unknown> = {};
      if (sourceWebsiteId) {
        extra.source_website_id = sourceWebsiteId;
      }
      const finalPcSource = payloadPcSource ?? popcentMeta.pc_source;
      const finalPcCat = payloadPcCat ?? popcentMeta.pc_cat;
      if (finalPcSource) {
        extra.pc_source = finalPcSource;
      }
      if (finalPcCat) {
        extra.pc_cat = finalPcCat;
      }
      if (!Object.keys(extra).length) {
        return eventData;
      }
      if (isPlainObject(eventData)) {
        return { ...eventData, ...extra };
      }
      return extra;
    })();
    const strictHostname = asString(payload.hostname);
    const strictNormalizedUrl = isStrict ? normalizeStrictUrl(url) : url;

    const createdAt = new Date();
    const dayKey = istanbulDayString(createdAt);

    if (isStrictPageview) {
      const strictReferrer = asStringAllowEmpty(payload.referrer) ?? "";
      const dedupeKey = hashKey(
        `${websiteId}:${visitorId}:${strictNormalizedUrl}:${strictReferrer}`
      );
      const dedupeRedisKey = `bik_strict:pv:dedupe:${dedupeKey}`;
      const dedupe = await redis.set(dedupeRedisKey, "1", {
        NX: true,
        PX: 1500,
      });
      await redis.incr(`bik_strict:pv:${websiteId}:${dayKey}:received`);
      await redis.expire(
        `bik_strict:pv:${websiteId}:${dayKey}:received`,
        60 * 60 * 48
      );
      if (!dedupe) {
        await redis.incr(`bik_strict:pv:${websiteId}:${dayKey}:deduped`);
        await redis.expire(
          `bik_strict:pv:${websiteId}:${dayKey}:deduped`,
          60 * 60 * 48
        );
        return NextResponse.json(
          { ok: true },
          { status: 200, headers: corsHeaders(origin) }
        );
      }
    }

    const payloadCountry = normalizeCountryCode(
      asStringAllowEmpty(payload.countryCode) ??
        asStringAllowEmpty(payload.country) ??
        asStringAllowEmpty(payload.cc)
    );
    const countryCode = getCountryCode(request.headers) ?? payloadCountry;
    const fallbackEventName = isStrictPing ? "ping" : undefined;
    const event = await prisma.analyticsEvent.create({
      data: {
        websiteId,
        type: eventType,
        mode: isStrict ? "BIK_STRICT" : "RAW",
        eventName: asString(payload.event_name) ?? fallbackEventName,
        eventData: isStrictPageview
          ? {
              hostname: strictHostname ?? undefined,
              ...(sourceWebsiteId ? { source_website_id: sourceWebsiteId } : {}),
            }
          : enrichedEventData,
        visitorId,
        sessionId: isStrict ? visitorId : sessionId,
        url: strictNormalizedUrl,
        referrer: isStrict ? asStringAllowEmpty(payload.referrer) : asString(payload.referrer),
        screen: asString(payload.screen),
        language: asString(payload.language),
        userAgent:
          asString(payload["user-agent"]) ??
          asString(payload.userAgent) ??
          request.headers.get("user-agent"),
        countryCode: countryCode ?? undefined,
        clientTimestamp,
        createdAt,
      },
    });

    if (isStrict) {
      await redis.incr(`bik_strict:pv:${websiteId}:${dayKey}:kept`);
      await redis.expire(
        `bik_strict:pv:${websiteId}:${dayKey}:kept`,
        60 * 60 * 48
      );
    }

    if (!isStrict) {
      await prisma.analyticsSession.upsert({
        where: {
          websiteId_sessionId: {
            websiteId,
            sessionId,
          },
        },
        create: {
          websiteId,
          sessionId,
          visitorId,
          startedAt: createdAt,
          lastSeenAt: createdAt,
        },
        update: {
          lastSeenAt: createdAt,
        },
      });
    }

    const nowMs = createdAt.getTime();
    if (!isStrict) {
      await redis.zAdd(`analytics:online:${websiteId}`, {
        score: nowMs,
        value: sessionId,
      });
      await redis.zRemRangeByScore(
        `analytics:online:${websiteId}`,
        0,
        nowMs - ONLINE_WINDOW_MS
      );

      if (eventType === "PAGEVIEW") {
        await redis.zAdd(`analytics:pageviews:${websiteId}`, {
          score: nowMs,
          value: event.id,
        });
        await redis.zRemRangeByScore(
          `analytics:pageviews:${websiteId}`,
          0,
          nowMs - LIVE_WINDOW_MS
        );
      }

      if (eventType === "EVENT") {
        await redis.zAdd(`analytics:events:${websiteId}`, {
          score: nowMs,
          value: event.id,
        });
        await redis.zRemRangeByScore(
          `analytics:events:${websiteId}`,
          0,
          nowMs - ALARM_EVENT_WINDOW_MS
        );
      }

      await redis.lPush(
        `analytics:stream:${websiteId}`,
        JSON.stringify({
          id: event.id,
          type: eventType,
          url,
          createdAt: createdAt.toISOString(),
          eventName: event.eventName,
        })
      );
      await redis.lTrim(`analytics:stream:${websiteId}`, 0, 199);
    }

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: corsHeaders(origin) }
    );
  }
