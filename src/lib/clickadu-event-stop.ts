export type ClickaduEventStopRule = {
  campaignId: string;
  siteKey?: string;
  websiteId?: string;
  trackingCode: string;
  landingPath?: string;
  targetUrl?: string;
  stopTarget: number;
  baselineClean?: number;
  baselineAt?: string;
  status: "active" | "paused";
  source?: string;
  updatedAt?: string;
};

type EventStopRedis = {
  set: (...args: any[]) => Promise<any>;
  get: (...args: any[]) => Promise<any>;
  sAdd: (...args: any[]) => Promise<any>;
  sCard: (...args: any[]) => Promise<any>;
  sMembers: (...args: any[]) => Promise<any>;
  expire: (...args: any[]) => Promise<any>;
  lPush: (...args: any[]) => Promise<any>;
  lTrim: (...args: any[]) => Promise<any>;
};

type EventStopInput = {
  redis: EventStopRedis;
  websiteId: string;
  eventType: string;
  eventData: unknown;
  visitorId: string;
  createdAt: Date;
};

const CLICKADU_BASE_URL = "https://ssp.clickadu.com";
const RULE_INDEX_KEY = "clickadu:event-stop:rules";
const LOG_KEY = "clickadu:event-stop:log";
const RULE_TTL_SECONDS = 60 * 60 * 24 * 14;
const VISITOR_TTL_SECONDS = 60 * 60 * 24 * 4;
const STATE_TTL_SECONDS = 60 * 60 * 24 * 14;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown) =>
  typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();

const positiveInteger = (value: unknown) => {
  const number = Math.floor(Number(value || 0));
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const nonNegativeInteger = (value: unknown) => {
  const number = Math.floor(Number(value ?? 0));
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const istanbulDayString = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const ruleKey = (trackingCode: string) => `clickadu:event-stop:rule:${trackingCode}`;
const visitorSetKey = (day: string, rule: ClickaduEventStopRule) =>
  `clickadu:event-stop:visitors:${day}:${rule.campaignId}:${rule.trackingCode}`;
const stoppedKey = (day: string, campaignId: string) =>
  `clickadu:event-stop:stopped:${day}:${campaignId}`;
const lockKey = (campaignId: string) => `clickadu:event-stop:lock:${campaignId}`;

export const eventStopEnabled = () => process.env.CLICKADU_EVENT_STOP_ENABLED === "1";
export const eventStopDryRun = () => process.env.CLICKADU_EVENT_STOP_DRY_RUN === "1";

export function normalizeClickaduEventStopRule(input: unknown): ClickaduEventStopRule | null {
  if (!isPlainObject(input)) return null;
  const campaignId = asString(input.campaignId);
  const trackingCode = asString(input.trackingCode || input.pcCat || input.pc_cat);
  const stopTarget = positiveInteger(input.stopTarget || input.cleanTarget || input.target);
  const baselineClean = nonNegativeInteger(input.baselineClean ?? input.currentClean ?? input.cleanUnique);
  if (!/^\d{5,}$/.test(campaignId) || !trackingCode || !stopTarget) return null;
  const rawStatus = asString(input.status || "active").toLowerCase();
  return {
    campaignId,
    siteKey: asString(input.siteKey) || undefined,
    websiteId: asString(input.websiteId || input.siteId) || undefined,
    trackingCode,
    landingPath: asString(input.landingPath) || undefined,
    targetUrl: asString(input.targetUrl) || undefined,
    stopTarget,
    baselineClean,
    baselineAt: asString(input.baselineAt) || undefined,
    status: rawStatus === "paused" ? "paused" : "active",
    source: asString(input.source) || "event-stop-sync",
    updatedAt: asString(input.updatedAt) || new Date().toISOString(),
  };
}

export async function upsertClickaduEventStopRule(redis: EventStopRedis, input: unknown) {
  const rule = normalizeClickaduEventStopRule(input);
  if (!rule) {
    return { ok: false, skipped: true, reason: "invalid-rule" };
  }
  await redis.set(ruleKey(rule.trackingCode), JSON.stringify(rule), { EX: RULE_TTL_SECONDS });
  await redis.sAdd(RULE_INDEX_KEY, rule.trackingCode);
  await redis.expire(RULE_INDEX_KEY, RULE_TTL_SECONDS);
  return { ok: true, rule };
}

export async function listClickaduEventStopRules(redis: EventStopRedis) {
  const codes = await redis.sMembers(RULE_INDEX_KEY);
  const rules: ClickaduEventStopRule[] = [];
  for (const code of codes) {
    const raw = await redis.get(ruleKey(code));
    if (!raw) continue;
    try {
      const rule = normalizeClickaduEventStopRule(JSON.parse(raw));
      if (rule) rules.push(rule);
    } catch {
      // Ignore corrupt Redis entries; the next sync overwrites them.
    }
  }
  return rules.sort((a, b) => (a.siteKey || "").localeCompare(b.siteKey || "") || a.trackingCode.localeCompare(b.trackingCode));
}

async function appendStopLog(redis: EventStopRedis, payload: Record<string, unknown>) {
  await redis.lPush(LOG_KEY, JSON.stringify({ at: new Date().toISOString(), ...payload }));
  await redis.lTrim(LOG_KEY, 0, 499);
}

async function stopClickaduCampaign(campaignId: string) {
  const token = asString(process.env.CLICKADU_API_TOKEN);
  if (!token) {
    return { ok: false, status: 0, error: "CLICKADU_API_TOKEN missing" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`${CLICKADU_BASE_URL}/api/v2/campaign/${campaignId}/change_status/stop/`, {
      method: "POST",
      headers: {
        Authorization: token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown = null;
    try {
      data = JSON.parse(text || "{}");
    } catch {
      data = { raw: text.slice(0, 500) };
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function clickaduMeta(eventData: unknown) {
  if (!isPlainObject(eventData)) return null;
  const pcSource = asString(eventData.pc_source).toLowerCase();
  const pcNetwork = asString(eventData.pc_network).toLowerCase();
  const trackingCode = asString(eventData.pc_cat);
  if (!trackingCode) return null;
  if (pcSource !== "clickadu" && pcNetwork !== "clickadu") return null;
  return { trackingCode };
}

export async function maybeRunClickaduEventStop(input: EventStopInput) {
  if (!eventStopEnabled() || input.eventType !== "PAGEVIEW") return { ok: true, skipped: true, reason: "disabled-or-not-pageview" };
  const meta = clickaduMeta(input.eventData);
  if (!meta) return { ok: true, skipped: true, reason: "not-clickadu" };
  const rawRule = await input.redis.get(ruleKey(meta.trackingCode));
  if (!rawRule) return { ok: true, skipped: true, reason: "rule-missing", trackingCode: meta.trackingCode };

  let rule: ClickaduEventStopRule | null = null;
  try {
    rule = normalizeClickaduEventStopRule(JSON.parse(rawRule));
  } catch {
    rule = null;
  }
  if (!rule || rule.status !== "active") return { ok: true, skipped: true, reason: "rule-inactive" };
  if (rule.websiteId && rule.websiteId !== input.websiteId) return { ok: true, skipped: true, reason: "website-mismatch" };

  const day = istanbulDayString(input.createdAt);
  const visitorsKey = visitorSetKey(day, rule);
  await input.redis.sAdd(visitorsKey, input.visitorId);
  await input.redis.expire(visitorsKey, VISITOR_TTL_SECONDS);
  const liveClean = await input.redis.sCard(visitorsKey);
  const baselineClean = rule.baselineClean || 0;
  const clean = baselineClean + liveClean;
  if (clean < rule.stopTarget) {
    return { ok: true, action: "watch", clean, liveClean, baselineClean, target: rule.stopTarget, campaignId: rule.campaignId };
  }

  const alreadyStopped = await input.redis.get(stoppedKey(day, rule.campaignId));
  if (alreadyStopped) {
    return { ok: true, action: "already-stopped", clean, liveClean, baselineClean, target: rule.stopTarget, campaignId: rule.campaignId };
  }

  const locked = await input.redis.set(lockKey(rule.campaignId), "1", { NX: true, PX: 120_000 });
  if (!locked) {
    return { ok: true, action: "stop-lock-held", clean, liveClean, baselineClean, target: rule.stopTarget, campaignId: rule.campaignId };
  }

  const baseLog = {
    action: eventStopDryRun() ? "dry-run-stop" : "stop",
    campaignId: rule.campaignId,
    trackingCode: rule.trackingCode,
    siteKey: rule.siteKey || "",
    websiteId: input.websiteId,
    clean,
    liveClean,
    baselineClean,
    target: rule.stopTarget,
    day,
  };

  if (eventStopDryRun()) {
    await appendStopLog(input.redis, { ...baseLog, result: "dry-run" });
    return { ok: true, ...baseLog, result: "dry-run" };
  }

  const stop = await stopClickaduCampaign(rule.campaignId);
  const stopped = stop.ok || stop.status === 200;
  await appendStopLog(input.redis, { ...baseLog, result: stopped ? "stopped" : "stop-failed", stop });
  if (stopped) {
    await input.redis.set(
      stoppedKey(day, rule.campaignId),
      JSON.stringify({ stoppedAt: new Date().toISOString(), clean, target: rule.stopTarget, stop }),
      { EX: STATE_TTL_SECONDS }
    );
  }
  return { ok: stopped, ...baseLog, result: stopped ? "stopped" : "stop-failed", stop };
}
