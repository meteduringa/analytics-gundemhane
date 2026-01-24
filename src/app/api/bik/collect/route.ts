import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { getBikConfig } from "@/lib/bik-config";
import {
  buildEphemeralVisitorId,
  buildPageviewKey,
  evaluateBotSignals,
  getCountryCode,
  hashString,
  isDirectLanding,
  isValidEngagement,
  maskIpBucket,
  sessionize,
  stddev,
} from "@/lib/bik-rules";

export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 240;
const ONLINE_WINDOW_MS = 120_000;
const LIVE_WINDOW_MS = 5 * 60_000;

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

const getRequestIp = (request: Request) => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
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

const istanbulDayString = (date: Date) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
};

const istanbulDayStart = (date: Date) => {
  const day = istanbulDayString(date);
  return new Date(`${day}T00:00:00+03:00`);
};

const incrementRollupMinute = async (payload: {
  websiteId: string;
  minuteTs: Date;
  pageviews?: number;
  pageviewsRaw?: number;
  routeChangePageviews?: number;
  renderPings?: number;
  dedupedPageviews?: number;
  clientErrorCount?: number;
  engagementMs?: number;
  invalid?: number;
  suspicious?: number;
}) => {
  await prisma.bIKRollupMinute.upsert({
    where: {
      websiteId_minuteTs: {
        websiteId: payload.websiteId,
        minuteTs: payload.minuteTs,
      },
    },
    create: {
      websiteId: payload.websiteId,
      minuteTs: payload.minuteTs,
      pageviews: payload.pageviews ?? 0,
      pageviewsRaw: payload.pageviewsRaw ?? 0,
      routeChangePageviews: payload.routeChangePageviews ?? 0,
      renderPings: payload.renderPings ?? 0,
      dedupedPageviews: payload.dedupedPageviews ?? 0,
      clientErrorCount: payload.clientErrorCount ?? 0,
      engagementMsSum: payload.engagementMs ?? 0,
      invalidCount: payload.invalid ?? 0,
      suspiciousCount: payload.suspicious ?? 0,
    },
    update: {
      pageviews: payload.pageviews ? { increment: payload.pageviews } : undefined,
      pageviewsRaw: payload.pageviewsRaw
        ? { increment: payload.pageviewsRaw }
        : undefined,
      routeChangePageviews: payload.routeChangePageviews
        ? { increment: payload.routeChangePageviews }
        : undefined,
      renderPings: payload.renderPings
        ? { increment: payload.renderPings }
        : undefined,
      dedupedPageviews: payload.dedupedPageviews
        ? { increment: payload.dedupedPageviews }
        : undefined,
      clientErrorCount: payload.clientErrorCount
        ? { increment: payload.clientErrorCount }
        : undefined,
      engagementMsSum: payload.engagementMs
        ? { increment: payload.engagementMs }
        : undefined,
      invalidCount: payload.invalid ? { increment: payload.invalid } : undefined,
      suspiciousCount: payload.suspicious
        ? { increment: payload.suspicious }
        : undefined,
    },
  });
};

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
  const rateKey = `bik:rate:${ip}`;

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
  const referrer = asString(payload.referrer);
  const visitorIdSource = asString(payload.visitor_id_source);
  const errorCode = asString(payload.error_code);
  const isRouteChange =
    payload.is_route_change === true ||
    payload.is_route_change === "true" ||
    payload.is_route_change === "1";

  if (!websiteId || !type || !url) {
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

  const createdAt = new Date();
  const nowMs = createdAt.getTime();
  const config = await getBikConfig(websiteId);
  const includeSuspiciousInCounted = config.suspiciousSoftMode !== false;

  const visitorIdFromPayload = asString(payload.visitor_id);
  const ipBucket = maskIpBucket(ip);
  const dayKey = istanbulDayString(createdAt);
  const visitorId =
    visitorIdFromPayload ??
    buildEphemeralVisitorId({
      userAgent: asString(payload.userAgent) ?? request.headers.get("user-agent") ?? undefined,
      language: asString(payload.language) ?? undefined,
      timezone: asString(payload.timezone) ?? undefined,
      screen: asString(payload.screen) ?? undefined,
      ipBucket,
      day: dayKey,
    });

  const sessionStateKey = `bik:session:${websiteId}:${visitorId}`;
  const sessionStateRaw = await redis.get(sessionStateKey);
  const sessionState = sessionStateRaw
    ? (JSON.parse(sessionStateRaw) as {
        index: number;
        lastSeen: number;
        sessionId: string;
      })
    : { index: 0, lastSeen: 0, sessionId: "" };

  const sessionResult = sessionize(
    sessionState.lastSeen || null,
    nowMs,
    config.sessionInactivityMinutes,
    sessionState.index
  );

  const sessionId = `${visitorId}.${sessionResult.index}`;
  const isNewSession = sessionResult.isNew || sessionState.sessionId !== sessionId;

  await redis.set(
    sessionStateKey,
    JSON.stringify({ index: sessionResult.index, lastSeen: nowMs, sessionId }),
    { EX: 60 * 60 * 24 }
  );

  if (isNewSession && sessionState.sessionId) {
    await prisma.bIKSession.updateMany({
      where: { websiteId, sessionId: sessionState.sessionId, endedAt: null },
      data: { endedAt: createdAt },
    });
  }

  const sessionMetaKey = `bik:session:meta:${websiteId}:${sessionId}`;
  const sessionMetaRaw = await redis.get(sessionMetaKey);
  const sessionMeta = sessionMetaRaw
    ? (JSON.parse(sessionMetaRaw) as {
        engagementMs: number;
        interactionCount: number;
        isSuspicious: boolean;
      })
    : { engagementMs: 0, interactionCount: 0, isSuspicious: false };

  const countryCode = getCountryCode(request.headers);
  let isDirectSession = false;
  let existingSessionIsDirect = false;

  if (isNewSession) {
    isDirectSession = isDirectLanding(referrer, url);
    await prisma.bIKSession.create({
      data: {
        websiteId,
        visitorId,
        sessionId,
        startedAt: createdAt,
        lastSeenAt: createdAt,
        isDirect: isDirectSession,
        countryCode: countryCode ?? undefined,
      },
    });

    await prisma.bIKEvent.create({
      data: {
        websiteId,
        visitorId,
        sessionId,
        type: "SESSION_START",
        url,
        referrer,
        isDirectSession,
        countryCode: countryCode ?? undefined,
        userAgentHash: hashString(
          asString(payload.userAgent) ?? request.headers.get("user-agent") ?? ""
        ),
        metadata: { ipBucket },
        ts: createdAt,
      },
    });
  } else {
    const existingSession = await prisma.bIKSession.findUnique({
      where: { websiteId_sessionId: { websiteId, sessionId } },
      select: { isDirect: true },
    });
    existingSessionIsDirect = existingSession?.isDirect ?? false;
  }

  await prisma.bIKSession.updateMany({
    where: { websiteId, sessionId },
    data: { lastSeenAt: createdAt },
  });

  const eventTypeMap: Record<
    string,
    "PAGE_VIEW" | "HEARTBEAT" | "INTERACTION" | "SESSION_START" | "SESSION_END" | "RENDER_PING" | "CLIENT_ERROR"
  > =
    {
      page_view: "PAGE_VIEW",
      heartbeat: "HEARTBEAT",
      interaction: "INTERACTION",
      session_start: "SESSION_START",
      session_end: "SESSION_END",
      render_ping: "RENDER_PING",
      client_error: "CLIENT_ERROR",
    };
  const eventType = eventTypeMap[type];
  if (!eventType) {
    return NextResponse.json(
      { error: "Invalid event type." },
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  if (eventType === "SESSION_END") {
    await prisma.bIKSession.updateMany({
      where: { websiteId, sessionId },
      data: { endedAt: createdAt, lastSeenAt: createdAt },
    });
  }

  if (eventType === "INTERACTION") {
    sessionMeta.interactionCount += 1;
  }

  let engagementIncrement = 0;
  let isValidSession = isValidEngagement(sessionMeta.engagementMs);
  if (eventType === "HEARTBEAT") {
    const incrementMs = Number(
      payload.engagement_increment_ms ?? config.engagementFullMs ?? 5000
    );
    engagementIncrement = Number.isFinite(incrementMs) ? incrementMs : 0;
    sessionMeta.engagementMs += engagementIncrement;
    isValidSession = isValidEngagement(sessionMeta.engagementMs);
    await prisma.bIKSession.updateMany({
      where: { websiteId, sessionId },
      data: {
        engagementMs: { increment: engagementIncrement },
      },
    });
  }
  const minuteTs = new Date(Math.floor(nowMs / 60_000) * 60_000);

  let deduped = false;
  if (eventType === "PAGE_VIEW") {
    const slot = Math.floor(nowMs / 10_000);
    const pageviewKey = buildPageviewKey(visitorId, sessionId, url, slot);
    const dedupeKey = `bik:dedupe:${pageviewKey}`;
    const dedupe = await redis.set(dedupeKey, "1", { NX: true, EX: 10 });
    if (!dedupe) {
      await redis.incr(`bik:health:${websiteId}:dedupe`);
      await redis.expire(`bik:health:${websiteId}:dedupe`, 600);
      deduped = true;
      await incrementRollupMinute({
        websiteId,
        minuteTs,
        dedupedPageviews: 1,
      });
    }

    if (!deduped) {
      const pageviewEngagementIncrement =
        Number(config.engagementMinVisibleMs ?? 1000) || 1000;
      sessionMeta.engagementMs += pageviewEngagementIncrement;
      engagementIncrement += pageviewEngagementIncrement;
      isValidSession = isValidEngagement(sessionMeta.engagementMs);
      await prisma.bIKSession.updateMany({
        where: { websiteId, sessionId },
        data: { engagementMs: { increment: pageviewEngagementIncrement } },
      });
      await incrementRollupMinute({
        websiteId,
        minuteTs,
        pageviewsRaw: 1,
        routeChangePageviews: isRouteChange ? 1 : 0,
      });

      const pv10sKey = `bik:pv:10s:${websiteId}:${visitorId}`;
      const pv5mKey = `bik:pv:5m:${websiteId}:${visitorId}`;
      const pvIntervalsKey = `bik:pv:intervals:${websiteId}:${visitorId}`;

      await redis.zAdd(pv10sKey, { score: nowMs, value: String(nowMs) });
      await redis.zRemRangeByScore(pv10sKey, 0, nowMs - 10_000);
      await redis.expire(pv10sKey, 60);

      await redis.zAdd(pv5mKey, { score: nowMs, value: String(nowMs) });
      await redis.zRemRangeByScore(pv5mKey, 0, nowMs - 5 * 60_000);
      await redis.expire(pv5mKey, 3600);

      await redis.lPush(pvIntervalsKey, String(nowMs));
      await redis.lTrim(pvIntervalsKey, 0, 20);
      await redis.expire(pvIntervalsKey, 3600);

      const [pv10s, pv5m, intervalSamples] = await Promise.all([
        redis.zCard(pv10sKey),
        redis.zCard(pv5mKey),
        redis.lRange(pvIntervalsKey, 0, 20),
      ]);

      const timestamps = intervalSamples
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
        .reverse();
      const intervals = timestamps
        .slice(1)
        .map((value, index) => value - timestamps[index])
        .filter((value) => value > 0);

      const botEvaluation = evaluateBotSignals({
        pvCount10s: pv10s,
        pvCount5m: pv5m,
        periodicStddevMs: intervals.length >= 5 ? stddev(intervals) : 0,
        interactionCount: sessionMeta.interactionCount,
        engagementMs: sessionMeta.engagementMs,
        config,
      });

      sessionMeta.isSuspicious = botEvaluation.isSuspicious;
      await prisma.bIKSession.updateMany({
        where: { websiteId, sessionId },
        data: {
          isSuspicious: botEvaluation.isSuspicious,
          isValid: isValidSession,
          isDirect: isNewSession ? isDirectSession : undefined,
        },
      });

      await prisma.bIKEvent.create({
        data: {
          websiteId,
          visitorId,
          sessionId,
          type: "PAGE_VIEW",
          url,
          referrer,
          isDirectSession: isNewSession ? isDirectSession : existingSessionIsDirect,
          countryCode: countryCode ?? undefined,
          userAgentHash: hashString(
            asString(payload.userAgent) ?? request.headers.get("user-agent") ?? ""
          ),
          isRouteChange,
          visitorIdSource: visitorIdSource ?? undefined,
          pageviewKey,
          engagementIncrementMs: pageviewEngagementIncrement,
          botScore: botEvaluation.botScore,
          isSuspicious: botEvaluation.isSuspicious,
          isValid: isValidSession,
          metadata: { ipBucket, reasons: botEvaluation.reasons },
          ts: createdAt,
        },
      });

      if (
        isValidSession &&
        (includeSuspiciousInCounted || !botEvaluation.isSuspicious)
      ) {
        await redis.zAdd(`bik:pageviews_valid:${websiteId}`, {
          score: nowMs,
          value: pageviewKey,
        });
        await redis.zRemRangeByScore(
          `bik:pageviews_valid:${websiteId}`,
          0,
          nowMs - LIVE_WINDOW_MS
        );
        await redis.incr(`bik:health:${websiteId}:pageviews`);
        await redis.expire(`bik:health:${websiteId}:pageviews`, 600);
        await incrementRollupMinute({
          websiteId,
          minuteTs,
          pageviews: 1,
          engagementMs: pageviewEngagementIncrement,
        });
      }

      if (botEvaluation.isSuspicious) {
        await incrementRollupMinute({
          websiteId,
          minuteTs,
          suspicious: 1,
        });
      } else {
        if (!isValidSession) {
          await incrementRollupMinute({
            websiteId,
            minuteTs,
            invalid: 1,
          });
        }
      }
    }
  }

  await redis.zAdd(`bik:online:${websiteId}`, {
    score: nowMs,
    value: sessionId,
  });
  await redis.zRemRangeByScore(
    `bik:online:${websiteId}`,
    0,
    nowMs - ONLINE_WINDOW_MS
  );

  if (
    isValidSession &&
    (includeSuspiciousInCounted || !sessionMeta.isSuspicious)
  ) {
    await redis.zAdd(`bik:online_valid:${websiteId}`, {
      score: nowMs,
      value: sessionId,
    });
    await redis.zRemRangeByScore(
      `bik:online_valid:${websiteId}`,
      0,
      nowMs - ONLINE_WINDOW_MS
    );
  }

  if (eventType === "HEARTBEAT") {
    await prisma.bIKSession.updateMany({
      where: { websiteId, sessionId },
      data: { isValid: isValidSession },
    });
    if (isValidEngagement(sessionMeta.engagementMs)) {
      await incrementRollupMinute({
        websiteId,
        minuteTs,
        engagementMs: engagementIncrement,
      });
    }
  }

  if (eventType === "RENDER_PING") {
    await incrementRollupMinute({
      websiteId,
      minuteTs,
      renderPings: 1,
    });
  }

  if (eventType === "CLIENT_ERROR") {
    await incrementRollupMinute({
      websiteId,
      minuteTs,
      clientErrorCount: 1,
    });
  }

  if (eventType !== "PAGE_VIEW") {
    await prisma.bIKEvent.create({
      data: {
        websiteId,
        visitorId,
        sessionId,
        type: eventType,
        url,
        referrer,
        isDirectSession: isNewSession ? isDirectSession : existingSessionIsDirect,
        countryCode: countryCode ?? undefined,
        userAgentHash: hashString(
          asString(payload.userAgent) ?? request.headers.get("user-agent") ?? ""
        ),
        isRouteChange: false,
        visitorIdSource: visitorIdSource ?? undefined,
        errorCode: errorCode ?? undefined,
        engagementIncrementMs:
          eventType === "HEARTBEAT"
            ? Number(payload.engagement_increment_ms ?? config.engagementFullMs ?? 5000)
            : undefined,
        isValid: isValidSession,
        isSuspicious: sessionMeta.isSuspicious,
        metadata: { ipBucket },
        ts: createdAt,
      },
    });
  }

  await redis.set(
    sessionMetaKey,
    JSON.stringify(sessionMeta),
    { EX: 60 * 60 }
  );

  const dayStart = istanbulDayStart(createdAt);
  const directFlag = isNewSession ? isDirectSession : existingSessionIsDirect;
  await prisma.bIKDailyVisitor.upsert({
    where: {
      websiteId_day_visitorId: {
        websiteId,
        day: dayStart,
        visitorId,
      },
    },
    create: {
      websiteId,
      day: dayStart,
      visitorId,
      hasValidSession:
        isValidSession &&
        (includeSuspiciousInCounted || !sessionMeta.isSuspicious),
      hasDirectSession: directFlag,
      engagementMs: sessionMeta.engagementMs,
      isSuspicious: sessionMeta.isSuspicious,
      countryCode: countryCode ?? undefined,
    },
    update: {
      hasValidSession:
        isValidSession && (includeSuspiciousInCounted || !sessionMeta.isSuspicious)
          ? true
          : undefined,
      hasDirectSession: directFlag ? true : undefined,
      engagementMs: { increment: engagementIncrement },
      isSuspicious: sessionMeta.isSuspicious ? true : undefined,
      countryCode: countryCode ?? undefined,
    },
  });

  await redis.incr(`bik:health:${websiteId}:events`);
  await redis.expire(`bik:health:${websiteId}:events`, 600);

  return NextResponse.json(
    { ok: true },
    { status: 200, headers: corsHeaders(origin) }
  );
}
