import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import crypto from "node:crypto";

export type BikTestSite = {
  id: string;
  name: string;
  legacyWebsiteId: string;
  websiteId: string;
  publishCode: string;
  domain: string;
  domainSlug: string;
  collectorNode: string;
  allowedDomains: string[];
  scriptVersion: number;
  createdAt: string;
};

export type BikTestEventInput = {
  version: "v1" | "v2";
  endpoint: "send" | "check" | "collect";
  websiteId: string;
  hostname?: string | null;
  url?: string | null;
  referrer?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;
  fingerprint?: string | null;
  type?: string | null;
  name?: string | null;
  eventId?: string | null;
  activeSeconds?: number | null;
  screen?: string | null;
  language?: string | null;
  userAgent?: string | null;
  botSignals?: Record<string, unknown>;
  payload: Record<string, unknown>;
};

export type BikTestStoredEvent = BikTestEventInput & {
  id: string;
  accepted: boolean;
  rejectReason?: string;
  siteId?: string;
  siteName?: string;
  domain?: string;
  isBot: boolean;
  isDirect: boolean;
  isPageview: boolean;
  isHeartbeat: boolean;
  ts: string;
  ipHash: string;
};

const dataDir = join(process.cwd(), "data", "bik-test");
const sitesPath = join(dataDir, "sites.json");
const eventsPath = join(dataDir, "events.jsonl");
const rejectionsPath = join(dataDir, "rejections.jsonl");

const nowIso = () => new Date().toISOString();

const defaultSites = (): BikTestSite[] => [
  {
    id: "test-site-elmas-panel",
    name: "Elmas Panel Self Test",
    legacyWebsiteId: "0e7f6b57-3ac5-45b7-bd2f-7f6b9fc4f901",
    websiteId: "b5e2cda6-7018-4929-a9d5-7c1d87b1fd20",
    publishCode: "INT-TEST-001",
    domain: "giris.elmasistatistik.com.tr",
    domainSlug: "giris-elmasistatistik-com-tr",
    collectorNode: "ns01",
    allowedDomains: [
      "giris.elmasistatistik.com.tr",
      "localhost",
      "127.0.0.1",
    ],
    scriptVersion: 0,
    createdAt: nowIso(),
  },
  {
    id: "test-site-haberexpres",
    name: "Haber Expres Kalibrasyon",
    legacyWebsiteId: "415236ee-f7c1-465f-a5f2-aa47605f08c5",
    websiteId: "d4c0b744-8210-48b7-92ac-f092ab8706e0",
    publishCode: "INT-000304",
    domain: "haberexpres.com.tr",
    domainSlug: "haberexpres-com-tr",
    collectorNode: "ns02",
    allowedDomains: ["haberexpres.com.tr", "www.haberexpres.com.tr"],
    scriptVersion: 0,
    createdAt: nowIso(),
  },
  {
    id: "test-site-gercekfethiye",
    name: "Gercek Fethiye Kalibrasyon",
    legacyWebsiteId: "cffecbff-e1b2-4802-bb54-56389bd945f9",
    websiteId: "416d540d-3cc6-4026-bd9e-1aab5d66f7fc",
    publishCode: "INT-000271",
    domain: "gercekfethiye.com",
    domainSlug: "gercekfethiye-com",
    collectorNode: "ns01",
    allowedDomains: ["gercekfethiye.com", "www.gercekfethiye.com"],
    scriptVersion: 0,
    createdAt: nowIso(),
  },
  {
    id: "test-site-ozdiyarbakir",
    name: "Oz Diyarbakir Kalibrasyon",
    legacyWebsiteId: "608f0fb4-d5af-47c2-9ba2-3a3faea7e25b",
    websiteId: "b13e4934-6a51-4d0d-a3a1-aa92614bf9f3",
    publishCode: "INT-TEST-004",
    domain: "ozdiyarbakirgazetesi.com",
    domainSlug: "https-www-ozdiyarbakirgazetesi-com",
    collectorNode: "ns01",
    allowedDomains: [
      "ozdiyarbakirgazetesi.com",
      "www.ozdiyarbakirgazetesi.com",
    ],
    scriptVersion: 0,
    createdAt: nowIso(),
  },
];

const ensureDir = async () => {
  await mkdir(dataDir, { recursive: true });
};

const safeJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const hostFromInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.hostname;
  } catch {
    const schemeIndex = trimmed.indexOf("://");
    const hostish =
      schemeIndex >= 0 ? trimmed.slice(schemeIndex + 3) : trimmed;
    return hostish.split(/[/?#]/)[0]?.replace(/:\d+$/, "") || "";
  }
};

export const normalizeHost = (value: string) =>
  hostFromInput(value).replace(/:\d+$/, "").replace(/^www\./, "").toLowerCase();

export const domainSlug = (domain: string) =>
  normalizeHost(domain)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const exactOrSubdomain = (host: string, domain: string) => {
  const normalizedHost = normalizeHost(host);
  const normalizedDomain = normalizeHost(domain);
  return (
    normalizedHost === normalizedDomain ||
    normalizedHost.endsWith(`.${normalizedDomain}`)
  );
};

export const extractHostname = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return value.split("/")[0]?.split(":")[0] || null;
  }
};

export const getRequestIp = (request: Request) => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
};

export const ipHash = (ip: string) =>
  crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24);

export const readTestSites = async () => {
  await ensureDir();
  const existing = await readFile(sitesPath, "utf8").catch(() => "");
  if (!existing) {
    const sites = defaultSites();
    await writeFile(sitesPath, `${JSON.stringify(sites, null, 2)}\n`, "utf8");
    return sites;
  }
  return safeJson<BikTestSite[]>(existing, defaultSites());
};

export const writeTestSites = async (sites: BikTestSite[]) => {
  await ensureDir();
  const tmp = `${sitesPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(sites, null, 2)}\n`, "utf8");
  await rename(tmp, sitesPath);
};

export const findSiteByAnyWebsiteId = async (websiteId: string) => {
  const sites = await readTestSites();
  return (
    sites.find((site) => site.websiteId === websiteId) ||
    sites.find((site) => site.legacyWebsiteId === websiteId) ||
    null
  );
};

export const findSiteBySlug = async (slug: string) => {
  const sites = await readTestSites();
  return (
    sites.find((site) => site.domainSlug === slug) ||
    sites.find((site) => domainSlug(site.domain) === slug) ||
    null
  );
};

export const siteAllowsHost = (site: BikTestSite, host: string | null) => {
  if (!host) return true;
  return site.allowedDomains.some((domain) => exactOrSubdomain(host, domain));
};

export const parseBody = async (request: Request) => {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await request.json()) as Record<string, unknown>;
  }
  const text = await request.text();
  return Object.fromEntries(new URLSearchParams(text));
};

const asString = (value: unknown) =>
  typeof value === "string" ? value : value === null || value === undefined ? null : String(value);

const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const truthy = (value: unknown) =>
  value === true || value === "true" || value === "1" || value === 1;

export const normalizeEventPayload = (
  payload: Record<string, unknown>,
  version: "v1" | "v2",
  endpoint: "send" | "check" | "collect"
): BikTestEventInput => ({
  version,
  endpoint,
  websiteId: String(payload.website ?? payload.website_id ?? payload.websiteId ?? ""),
  hostname: asString(payload.hostname ?? payload.host),
  url: asString(payload.url ?? payload.href),
  referrer: asString(payload.referrer),
  visitorId: asString(payload.id ?? payload.visitor_id ?? payload.visitorId),
  sessionId: asString(payload.sesId ?? payload.session_id ?? payload.sessionId),
  fingerprint: asString(payload.fingerprint),
  type: asString(payload.type ?? payload.tag),
  name: asString(payload.name ?? payload.event_name),
  eventId: asString(payload.eventId ?? payload.eid),
  activeSeconds: asNumber(payload.activeSeconds),
  screen: asString(payload.screen),
  language: asString(payload.language),
  userAgent: asString(payload.userAgent ?? payload["user-agent"]),
  botSignals: {
    webdriver: payload.webdriver,
    headless: payload.headless,
    automationTool: payload.automationTool,
    isBot: payload.isBot,
    outerWidth: payload.outerWidth,
    outerHeight: payload.outerHeight,
  },
  payload,
});

export const classifyEvent = (event: BikTestEventInput) => {
  const payload = event.payload;
  const bot =
    truthy(payload.isBot) ||
    truthy(payload.webdriver) ||
    truthy(payload.headless) ||
    Boolean(payload.automationTool);
  const name = String(event.name || "").toLowerCase();
  const endpoint = event.endpoint;
  const isHeartbeat = endpoint === "check" || name.includes("heartbeat");
  const isPageview = !event.name && endpoint !== "check";
  const referrer = event.referrer || "";
  const isDirect = !referrer || referrer === event.url;
  return { isBot: bot, isHeartbeat, isPageview, isDirect };
};

export const storeTestEvent = async (
  request: Request,
  input: BikTestEventInput
): Promise<BikTestStoredEvent> => {
  await ensureDir();
  const site = await findSiteByAnyWebsiteId(input.websiteId);
  const originHost =
    extractHostname(request.headers.get("origin")) ||
    extractHostname(request.headers.get("referer")) ||
    input.hostname ||
    null;
  const allowed = site ? siteAllowsHost(site, originHost) : false;
  const classification = classifyEvent(input);
  const accepted = Boolean(site && allowed);
  const rejectReason = !site
    ? "unknown-website"
    : !allowed
      ? "domain-not-allowed"
      : undefined;
  const stored: BikTestStoredEvent = {
    ...input,
    id: crypto.randomUUID(),
    accepted,
    rejectReason,
    siteId: site?.id,
    siteName: site?.name,
    domain: site?.domain,
    ...classification,
    ts: new Date().toISOString(),
    ipHash: ipHash(getRequestIp(request)),
  };

  const line = `${JSON.stringify(stored)}\n`;
  await appendFile(accepted ? eventsPath : rejectionsPath, line, "utf8");
  return stored;
};

export const readJsonl = async <T>(path: string, limit = 5000): Promise<T[]> => {
  const text = await readFile(path, "utf8").catch(() => "");
  if (!text) return [];
  const lines = text.trim().split("\n").filter(Boolean);
  return lines
    .slice(Math.max(0, lines.length - limit))
    .map((line) => safeJson<T | null>(line, null))
    .filter((item): item is T => Boolean(item));
};

export const readRecentEvents = async (limit = 5000) =>
  readJsonl<BikTestStoredEvent>(eventsPath, limit);

export const readRecentRejections = async (limit = 1000) =>
  readJsonl<BikTestStoredEvent>(rejectionsPath, limit);

export const istanbulDayString = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const readJsonlForIstanbulDay = async <T extends { ts?: string }>(
  path: string,
  day: string
): Promise<T[]> => {
  const text = await readFile(path, "utf8").catch(() => "");
  if (!text) return [];
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => safeJson<T | null>(line, null))
    .filter((item): item is T => {
      if (!item?.ts) return false;
      const ts = new Date(item.ts);
      if (Number.isNaN(ts.getTime())) return false;
      return istanbulDayString(ts) === day;
    });
};

export const readEventsForDay = async (day: string) =>
  readJsonlForIstanbulDay<BikTestStoredEvent>(eventsPath, day);

export const readRejectionsForDay = async (day: string) =>
  readJsonlForIstanbulDay<BikTestStoredEvent>(rejectionsPath, day);

export const createSite = async (input: {
  name: string;
  domain: string;
  publishCode?: string;
  collectorNode?: string;
}) => {
  const sites = await readTestSites();
  const domain = normalizeHost(input.domain);
  const slug = domainSlug(domain);
  const existing = sites.find((site) => site.domainSlug === slug);
  if (existing) return existing;
  const site: BikTestSite = {
    id: crypto.randomUUID(),
    name: input.name,
    legacyWebsiteId: crypto.randomUUID(),
    websiteId: crypto.randomUUID(),
    publishCode:
      input.publishCode ||
      `INT-TEST-${String(sites.length + 1).padStart(3, "0")}`,
    domain,
    domainSlug: slug,
    collectorNode: input.collectorNode || "ns01",
    allowedDomains: [domain, `www.${domain}`],
    scriptVersion: 0,
    createdAt: nowIso(),
  };
  sites.push(site);
  await writeTestSites(sites);
  return site;
};

export const dataPaths = {
  dataDir,
  sitesPath,
  eventsPath,
  rejectionsPath,
};
