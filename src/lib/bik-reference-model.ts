const SEARCH_ENGINES = [
  "google.",
  "bing.com",
  "yandex.",
  "duckduckgo.",
  "search.yahoo.",
  "baidu.",
];

export type BikReferenceTimestamp = Date | string | number;

export type BikReferencePageviewEvent = {
  eventType: "pageview";
  siteId?: string;
  visitorId: string;
  sessionId?: string | null;
  eventId?: string | null;
  url: string;
  referrer?: string | null;
  ts: BikReferenceTimestamp;
  activeSeconds?: number | null;
  isBot?: boolean | null;
  countryCode?: string | null;
};

export type BikReferenceCheckEvent = {
  eventType: "check";
  siteId?: string;
  visitorId?: string | null;
  sessionId?: string | null;
  eventId?: string | null;
  url?: string | null;
  ts: BikReferenceTimestamp;
  activeSeconds?: number | null;
  isBot?: boolean | null;
  countryCode?: string | null;
};

export type BikReferenceEvent =
  | BikReferencePageviewEvent
  | BikReferenceCheckEvent;

export type BikReferenceOptions = {
  minimumActiveSeconds?: number;
  sessionInactivitySeconds?: number;
  dedupeWindowMs?: number;
  checkAttributionWindowSeconds?: number;
  countryCode?: string;
  includeUnknownCountry?: boolean;
};

export type BikReferenceMetrics = {
  daily_unique_visitors: number;
  daily_direct_unique_visitors: number;
  daily_pageviews: number;
  daily_sessions: number;
  daily_avg_time_on_site_seconds: number;
  daily_total_time_on_site_seconds: number;
  diagnostics: {
    rawPageviews: number;
    dedupedPageviews: number;
    duplicatePageviews: number;
    rawChecks: number;
    linkedChecks: number;
    orphanChecks: number;
    botFilteredPageviews: number;
    shortActivePageviews: number;
    validPageviews: number;
  };
};

type NormalizedPageview = BikReferencePageviewEvent & {
  tsMs: number;
  normalizedUrl: string;
  normalizedReferrer: string;
  assignedSessionId: string;
};

type NormalizedCheck = BikReferenceCheckEvent & {
  tsMs: number;
  normalizedUrl: string;
};

type LinkedCheckSummary = {
  activeSeconds: number;
  isBot: boolean;
  count: number;
};

const DEFAULT_OPTIONS: Required<BikReferenceOptions> = {
  minimumActiveSeconds: 1,
  sessionInactivitySeconds: 30 * 60,
  dedupeWindowMs: 1500,
  checkAttributionWindowSeconds: 60 * 60,
  countryCode: "",
  includeUnknownCountry: true,
};

const toMs = (value: BikReferenceTimestamp) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
};

const finiteNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeBikUrl = (value: string | null | undefined) => {
  const raw = String(value || "/");
  try {
    const parsed = new URL(raw, "https://example.com");
    parsed.hash = "";
    if (parsed.pathname === "/index.html") {
      parsed.pathname = "/";
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    const withoutHash = raw.split("#")[0] || "/";
    return withoutHash === "/index.html" ? "/" : withoutHash;
  }
};

const getHostname = (value?: string | null) => {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const isHomeUrl = (url: string) => {
  try {
    const parsed = new URL(url, "https://example.com");
    return parsed.pathname === "/" || parsed.pathname === "/index.html";
  } catch {
    const normalized = normalizeBikUrl(url);
    return normalized === "/" || normalized.startsWith("/?");
  }
};

export const isBikDirectLanding = (
  referrer: string | null | undefined,
  url: string
) => {
  const refHost = getHostname(referrer);
  if (!refHost) return true;
  return SEARCH_ENGINES.some((engine) => refHost.includes(engine)) && isHomeUrl(url);
};

const countryAllowed = (
  countryCode: string | null | undefined,
  options: Required<BikReferenceOptions>
) => {
  if (!options.countryCode) return true;
  if (!countryCode) return options.includeUnknownCountry;
  return countryCode.toUpperCase() === options.countryCode.toUpperCase();
};

const normalizeEvents = (
  events: BikReferenceEvent[],
  options: Required<BikReferenceOptions>
) => {
  const pageviews = events
    .filter((event): event is BikReferencePageviewEvent => event.eventType === "pageview")
    .map((event) => ({
      ...event,
      tsMs: toMs(event.ts),
      normalizedUrl: normalizeBikUrl(event.url),
      normalizedReferrer: String(event.referrer || ""),
      assignedSessionId: "",
    }))
    .filter((event) => Number.isFinite(event.tsMs))
    .sort((a, b) => a.tsMs - b.tsMs);

  const lastSessionByVisitor = new Map<
    string,
    { index: number; lastTs: number; sessionId: string }
  >();

  for (const pageview of pageviews) {
    if (pageview.sessionId) {
      pageview.assignedSessionId = pageview.sessionId;
      continue;
    }
    const previous = lastSessionByVisitor.get(pageview.visitorId);
    const shouldStart =
      !previous ||
      pageview.tsMs - previous.lastTs >
        options.sessionInactivitySeconds * 1000;
    const nextIndex = shouldStart ? (previous?.index || 0) + 1 : previous.index;
    const sessionId = `${pageview.visitorId}.${nextIndex}`;
    pageview.assignedSessionId = sessionId;
    lastSessionByVisitor.set(pageview.visitorId, {
      index: nextIndex,
      lastTs: pageview.tsMs,
      sessionId,
    });
  }

  const checks = events
    .filter((event): event is BikReferenceCheckEvent => event.eventType === "check")
    .map((event) => ({
      ...event,
      tsMs: toMs(event.ts),
      normalizedUrl: normalizeBikUrl(event.url || "/"),
    }))
    .filter((event) => Number.isFinite(event.tsMs))
    .sort((a, b) => a.tsMs - b.tsMs);

  return { pageviews, checks };
};

const dedupePageviews = (
  pageviews: NormalizedPageview[],
  dedupeWindowMs: number
) => {
  const kept: NormalizedPageview[] = [];
  const lastByKey = new Map<string, number>();
  const seenEventIds = new Set<string>();

  for (const pageview of pageviews) {
    if (pageview.eventId) {
      if (seenEventIds.has(pageview.eventId)) continue;
      seenEventIds.add(pageview.eventId);
    }

    const key = [
      pageview.visitorId,
      pageview.assignedSessionId,
      pageview.normalizedUrl,
      pageview.normalizedReferrer,
    ].join("||");
    const lastTs = lastByKey.get(key);
    if (lastTs !== undefined && pageview.tsMs - lastTs <= dedupeWindowMs) {
      continue;
    }
    lastByKey.set(key, pageview.tsMs);
    kept.push(pageview);
  }

  return kept;
};

const summarizeChecksByEventId = (checks: NormalizedCheck[]) => {
  const byEventId = new Map<string, LinkedCheckSummary>();
  for (const check of checks) {
    if (!check.eventId) continue;
    const previous = byEventId.get(check.eventId) || {
      activeSeconds: 0,
      isBot: false,
      count: 0,
    };
    byEventId.set(check.eventId, {
      activeSeconds: Math.max(
        previous.activeSeconds,
        finiteNumber(check.activeSeconds)
      ),
      isBot: previous.isBot || check.isBot === true,
      count: previous.count + 1,
    });
  }
  return byEventId;
};

const fallbackCheckSummary = (
  pageview: NormalizedPageview,
  checks: NormalizedCheck[],
  windowSeconds: number
): LinkedCheckSummary => {
  let activeSeconds = 0;
  let isBot = false;
  let count = 0;
  const endTs = pageview.tsMs + windowSeconds * 1000;
  for (const check of checks) {
    if (check.tsMs < pageview.tsMs || check.tsMs > endTs) continue;
    if (check.eventId) continue;
    if (check.visitorId && check.visitorId !== pageview.visitorId) continue;
    if (check.sessionId && check.sessionId !== pageview.assignedSessionId) continue;
    if (check.url && check.normalizedUrl !== pageview.normalizedUrl) continue;
    activeSeconds = Math.max(activeSeconds, finiteNumber(check.activeSeconds));
    isBot = isBot || check.isBot === true;
    count += 1;
  }
  return { activeSeconds, isBot, count };
};

export const computeBikReferenceMetrics = (
  events: BikReferenceEvent[],
  optionsInput: BikReferenceOptions = {}
): BikReferenceMetrics => {
  const options = { ...DEFAULT_OPTIONS, ...optionsInput };
  const { pageviews, checks } = normalizeEvents(events, options);
  const dedupedPageviews = dedupePageviews(pageviews, options.dedupeWindowMs);
  const checksByEventId = summarizeChecksByEventId(checks);

  const uniqueVisitors = new Set<string>();
  const directVisitors = new Set<string>();
  const validSessionIds = new Set<string>();
  const firstValidPageviewByVisitor = new Map<string, NormalizedPageview>();
  const sessionActiveSeconds = new Map<string, number>();

  let linkedChecks = 0;
  let botFilteredPageviews = 0;
  let shortActivePageviews = 0;
  let validPageviews = 0;

  for (const pageview of dedupedPageviews) {
    if (!countryAllowed(pageview.countryCode, options)) continue;
    const linked = pageview.eventId
      ? checksByEventId.get(pageview.eventId) || {
          activeSeconds: 0,
          isBot: false,
          count: 0,
        }
      : fallbackCheckSummary(
          pageview,
          checks,
          options.checkAttributionWindowSeconds
        );
    linkedChecks += linked.count;

    const activeSeconds = Math.max(
      finiteNumber(pageview.activeSeconds),
      linked.activeSeconds
    );
    const isBot = pageview.isBot === true || linked.isBot;

    if (isBot) {
      botFilteredPageviews += 1;
      continue;
    }
    if (activeSeconds <= options.minimumActiveSeconds) {
      shortActivePageviews += 1;
      continue;
    }

    validPageviews += 1;
    uniqueVisitors.add(pageview.visitorId);
    validSessionIds.add(pageview.assignedSessionId);
    sessionActiveSeconds.set(
      pageview.assignedSessionId,
      (sessionActiveSeconds.get(pageview.assignedSessionId) || 0) +
        activeSeconds
    );

    if (!firstValidPageviewByVisitor.has(pageview.visitorId)) {
      firstValidPageviewByVisitor.set(pageview.visitorId, pageview);
      if (isBikDirectLanding(pageview.referrer, pageview.url)) {
        directVisitors.add(pageview.visitorId);
      }
    }
  }

  const totalActiveSeconds = [...sessionActiveSeconds.values()].reduce(
    (sum, seconds) => sum + seconds,
    0
  );
  const sessionCount = validSessionIds.size;

  return {
    daily_unique_visitors: uniqueVisitors.size,
    daily_direct_unique_visitors: directVisitors.size,
    daily_pageviews: validPageviews,
    daily_sessions: sessionCount,
    daily_avg_time_on_site_seconds: sessionCount
      ? Math.round(totalActiveSeconds / sessionCount)
      : 0,
    daily_total_time_on_site_seconds: Math.round(totalActiveSeconds),
    diagnostics: {
      rawPageviews: pageviews.length,
      dedupedPageviews: dedupedPageviews.length,
      duplicatePageviews: pageviews.length - dedupedPageviews.length,
      rawChecks: checks.length,
      linkedChecks,
      orphanChecks: Math.max(0, checks.length - linkedChecks),
      botFilteredPageviews,
      shortActivePageviews,
      validPageviews,
    },
  };
};
