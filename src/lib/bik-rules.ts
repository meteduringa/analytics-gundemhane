import crypto from "crypto";

const SEARCH_ENGINES = [
  "google.",
  "bing.com",
  "yandex.",
  "duckduckgo.",
  "search.yahoo.",
  "baidu.",
];

const UTM_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
];

export const ISTANBUL_TZ = "Europe/Istanbul";

export const hashString = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export const normalizeUrl = (url: string) => {
  try {
    const parsed = new URL(url, "https://example.com");
    parsed.hash = "";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url.split("#")[0] ?? url;
  }
};

export const buildPageviewKey = (
  visitorId: string,
  sessionId: string,
  url: string,
  slot: number
) => {
  const normalized = normalizeUrl(url);
  return hashString(`${visitorId}:${sessionId}:${normalized}:${slot}`);
};

const getHostname = (value?: string | null) => {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const hasTrackingParams = (url: string) => {
  try {
    const parsed = new URL(url, "https://example.com");
    return UTM_PARAMS.some((param) => parsed.searchParams.has(param));
  } catch {
    return false;
  }
};

export const isDirectLanding = (referrer: string | null, url: string) => {
  const refHost = getHostname(referrer);
  if (!refHost && !hasTrackingParams(url)) {
    return true;
  }
  if (refHost && SEARCH_ENGINES.some((engine) => refHost.includes(engine))) {
    const normalized = normalizeUrl(url);
    return normalized === "/" || normalized.startsWith("/?");
  }
  return false;
};

export const maskIpBucket = (ip: string) => {
  if (!ip) return "unknown";
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    }
  }
  if (ip.includes(":")) {
    const parts = ip.split(":").filter(Boolean);
    const bucket = parts.slice(0, 4).join(":");
    return `${bucket}::/64`;
  }
  return "unknown";
};

export const buildEphemeralVisitorId = (payload: {
  userAgent?: string;
  language?: string;
  timezone?: string;
  screen?: string;
  ipBucket: string;
  day: string;
}) => {
  const key = [
    payload.userAgent ?? "",
    payload.language ?? "",
    payload.timezone ?? "",
    payload.screen ?? "",
    payload.ipBucket,
    payload.day,
  ].join("|");
  return hashString(key);
};

export const sessionize = (
  lastSeenMs: number | null,
  nowMs: number,
  timeoutMinutes: number,
  currentIndex: number
) => {
  if (!lastSeenMs || nowMs - lastSeenMs > timeoutMinutes * 60_000) {
    return { isNew: true, index: currentIndex + 1 };
  }
  return { isNew: false, index: currentIndex };
};

export const isValidEngagement = (engagementMs: number) => engagementMs >= 1000;

export const stddev = (values: number[]) => {
  if (!values.length) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance =
    values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

export const evaluateBotSignals = (input: {
  pvCount10s: number;
  pvCount5m: number;
  periodicStddevMs: number;
  interactionCount: number;
  engagementMs: number;
  config: {
    botPvRate10s: number;
    botPv5Min: number;
    botPeriodicStddevMs: number;
    botNoInteractionMs: number;
  };
}) => {
  const reasons: string[] = [];
  if (input.pvCount10s >= input.config.botPvRate10s) {
    reasons.push("very_high_pv_rate");
  }
  if (input.pvCount5m >= input.config.botPv5Min) {
    reasons.push("extreme_pv_short_time");
  }
  if (input.periodicStddevMs > 0 && input.periodicStddevMs < input.config.botPeriodicStddevMs) {
    reasons.push("periodic_pattern");
  }
  if (
    input.interactionCount === 0 &&
    input.engagementMs < input.config.botNoInteractionMs
  ) {
    reasons.push("no_interaction");
  }

  return {
    isSuspicious: reasons.length > 0,
    botScore: reasons.length,
    reasons,
  };
};

export const getCountryCode = (headers: Headers) => {
  return (
    headers.get("cf-ipcountry") ||
    headers.get("x-vercel-ip-country") ||
    headers.get("x-country-code") ||
    null
  );
};
