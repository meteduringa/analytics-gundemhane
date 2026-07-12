import { NextResponse } from "next/server";
import { readPanelSession } from "@/lib/panel-session";
import {
  istanbulDayString,
  readEventsForDay,
  type BikTestStoredEvent,
} from "@/lib/bik-test-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const targets = [
  {
    label: "HE Galeri / HE11",
    code: "HE11",
    host: "www.haberexpres.com.tr",
    path: "/galeriler/yason-burnu-ziyaretcilerin-ilgi-odagi-oldu/",
  },
  {
    label: "HE Normal / HE-N01",
    code: "HE-N01",
    host: "www.haberexpres.com.tr",
    path: "/hazirlik-macinda-fenerbahce-pogon-szczecin-i-4-0-yendi/165443/",
  },
  {
    label: "OD Galeri / OD41",
    code: "OD41",
    host: "www.ozdiyarbakirgazetesi.com",
    path: "/foto-galeri/diyarbakir-ciger-kebabina-uluslararasi-odul-yilin-en-iyi-otantik-lezzeti-secildi",
  },
  {
    label: "OD Normal / OD-N01",
    code: "OD-N01",
    host: "www.ozdiyarbakirgazetesi.com",
    path: "/intihar-dedi-sorguda-cinayeti-itiraf-etti",
  },
  {
    label: "GF Galeri / GERFET31",
    code: "GERFET31",
    host: "www.gercekfethiye.com",
    path: "/insaat-kazisinda-gocuk-altinda-kalan-kepce-operatoru-hayatini-kaybetti/125435/",
  },
  {
    label: "GF Normal / GF-N01",
    code: "GF-N01",
    host: "www.gercekfethiye.com",
    path: "/yeterince-temizlenmeyen-havuzlar-cocuklarda-enfeksiyon-riskini-artiriyor/125437/",
  },
];

const signalFields = [
  "automationTool",
  "headless",
  "webdriver",
  "pluginCount",
  "outerWidth",
  "outerHeight",
  "hasWindowChrome",
  "isIframe",
  "isPuppeteer",
  "isPlaywright",
  "isHeadless",
  "hasUndetectedBehavior",
  "isBrave",
  "deviceMemory",
  "cpuCore",
  "hardwareConcurrency",
  "languagesLength",
  "isPageReloaded",
  "isTouchable",
  "maxTouchPoints",
  "scrollWidth",
  "scrollHeight",
  "canvas",
  "webgl",
  "fontMetrics",
  "permissionState",
] as const;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown) =>
  typeof value === "string" ? value : value == null ? "" : String(value);

const normalizePath = (value: string) => {
  try {
    const parsed = new URL(value, "https://example.com");
    return parsed.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return value.split("?")[0]?.replace(/\/+$/, "") || "/";
  }
};

const searchValue = (event: BikTestStoredEvent) => {
  const payload = asRecord(event.payload);
  const data = asRecord(payload.data);
  return [
    event.url,
    payload.url,
    payload.href,
    payload.referrer,
    event.referrer,
    data.pc_cat,
    data.pcCat,
    data.category,
  ]
    .map(asString)
    .filter(Boolean)
    .join(" ");
};

const pcCatFrom = (event: BikTestStoredEvent) => {
  const payload = asRecord(event.payload);
  const data = asRecord(payload.data);
  const direct =
    data.pc_cat ||
    data.pcCat ||
    payload.pc_cat ||
    payload.pcCat ||
    event.payload?.pc_cat;
  if (direct) return asString(direct);

  for (const candidate of [
    event.url,
    event.referrer,
    payload.url,
    payload.href,
    payload.referrer,
  ]) {
    const raw = asString(candidate);
    if (!raw) continue;
    try {
      const parsed = new URL(raw, "https://example.com");
      const code = parsed.searchParams.get("pc_cat");
      if (code) return code;
    } catch {
      // ignore malformed URL-shaped strings
    }
  }
  return "";
};

const targetMatch = (event: BikTestStoredEvent, target: (typeof targets)[number]) => {
  const code = pcCatFrom(event);
  if (code === target.code) return "pc_cat";

  const payload = asRecord(event.payload);
  const eventHost = asString(event.hostname || payload.hostname).replace(/^www\./, "");
  const targetHost = target.host.replace(/^www\./, "");
  const hostMatches = !eventHost || eventHost === targetHost;
  const eventPaths = [event.url, payload.url, payload.href]
    .map(asString)
    .filter(Boolean)
    .map(normalizePath);
  const targetPath = normalizePath(target.path);
  if (hostMatches && eventPaths.some((path) => path === targetPath)) {
    return "path";
  }

  const haystack = searchValue(event);
  if (haystack.includes(target.code)) return "text";
  return "";
};

const countBy = <T extends string>(items: T[]) =>
  items.reduce<Record<string, number>>((acc, item) => {
    if (!item) return acc;
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {});

const boolCount = (
  events: BikTestStoredEvent[],
  key: string
) => events.filter((event) => event.payload?.[key] === true).length;

const hasField = (event: BikTestStoredEvent, key: string) =>
  Object.prototype.hasOwnProperty.call(event.payload || {}, key);

export async function GET(request: Request) {
  const session = await readPanelSession();
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const day = searchParams.get("date") || istanbulDayString(new Date());
  const events = await readEventsForDay(day);

  const results = targets.map((target) => {
    const matched = events
      .map((event) => ({ event, matchType: targetMatch(event, target) }))
      .filter((item) => item.matchType);
    const targetEvents = matched.map((item) => item.event);
    const pageviews = targetEvents.filter((event) => event.isPageview);
    const heartbeats = targetEvents.filter((event) => event.isHeartbeat);
    const visitors = new Set(
      targetEvents.map((event) => event.visitorId || event.fingerprint || event.ipHash).filter(Boolean)
    );
    const sessions = new Set(
      targetEvents.map((event) => event.sessionId).filter(Boolean)
    );
    const fieldCoverage = Object.fromEntries(
      signalFields.map((field) => [
        field,
        targetEvents.filter((event) => hasField(event, field)).length,
      ])
    );
    const botReasons = countBy(
      targetEvents.flatMap((event) => event.botReasons || [])
    );
    const bundles = countBy(
      targetEvents.map((event) => asString(event.payload?.bundle || "unknown"))
    );
    const matchedBy = countBy(matched.map((item) => item.matchType));

    return {
      label: target.label,
      code: target.code,
      totalEvents: targetEvents.length,
      pageviews: pageviews.length,
      heartbeats: heartbeats.length,
      uniqueVisitors: visitors.size,
      sessions: sessions.size,
      botEvents: targetEvents.filter((event) => event.isBot).length,
      botPageviews: pageviews.filter((event) => event.isBot).length,
      maxActiveSeconds: Math.max(
        0,
        ...targetEvents.map((event) => event.activeSeconds || 0)
      ),
      avgActiveSeconds:
        targetEvents.length > 0
          ? Math.round(
              targetEvents.reduce((sum, event) => sum + (event.activeSeconds || 0), 0) /
                targetEvents.length
            )
          : 0,
      automation: {
        automationTool: targetEvents.filter((event) => Boolean(event.payload?.automationTool)).length,
        headless: boolCount(targetEvents, "headless"),
        webdriver: boolCount(targetEvents, "webdriver"),
        isPuppeteer: boolCount(targetEvents, "isPuppeteer"),
        isPlaywright: boolCount(targetEvents, "isPlaywright"),
        isHeadless: boolCount(targetEvents, "isHeadless"),
        hasUndetectedBehavior: boolCount(targetEvents, "hasUndetectedBehavior"),
      },
      fieldCoverage,
      botReasons,
      bundles,
      matchedBy,
      recentSamples: targetEvents
        .slice(-5)
        .reverse()
        .map((event) => ({
          ts: event.ts,
          endpoint: event.endpoint,
          name: event.name || "pageview",
          isPageview: event.isPageview,
          isHeartbeat: event.isHeartbeat,
          isBot: event.isBot,
          botReasons: event.botReasons || [],
          activeSeconds: event.activeSeconds || 0,
          bundle: event.payload?.bundle || null,
          url: event.url,
          signalSnapshot: {
            automationTool: event.payload?.automationTool || null,
            headless: event.payload?.headless ?? null,
            webdriver: event.payload?.webdriver ?? null,
            isPuppeteer: event.payload?.isPuppeteer ?? null,
            isPlaywright: event.payload?.isPlaywright ?? null,
            isHeadless: event.payload?.isHeadless ?? null,
            hasUndetectedBehavior: event.payload?.hasUndetectedBehavior ?? null,
            pluginCount: event.payload?.pluginCount ?? null,
            outerWidth: event.payload?.outerWidth ?? null,
            outerHeight: event.payload?.outerHeight ?? null,
          },
        })),
    };
  });

  return NextResponse.json({
    day,
    asOf: new Date().toISOString(),
    totalEvents: events.length,
    results,
  });
}
