type SimpleMetrics = {
  daily_unique_users: number;
  daily_direct_unique_users: number;
  daily_pageviews: number;
};

const GAZETE_ARENA_ID = "87652606-1a83-4dd5-8fbc-3680b00ead7f";
const HABER_EXPRES_ID = "13b45b00-d3de-4904-81d9-c4d37c0313db";
const GERCEK_FETHIYE_ID = "66b31527-c90e-41ec-9a67-6d003aeee99e";
const HABER_EXPRES_MODEL_SITE_IDS = new Set([HABER_EXPRES_ID, GERCEK_FETHIYE_ID]);

const roundNonNegative = (value: number) => Math.max(0, Math.round(value));

const rawDirectShare = (metrics: SimpleMetrics) => {
  const unique = Number(metrics.daily_unique_users || 0);
  return unique ? Number(metrics.daily_direct_unique_users || 0) / unique : 0;
};

const applyGazeteArenaDisplay = (metrics: SimpleMetrics): SimpleMetrics => {
  const rawUnique = Number(metrics.daily_unique_users || 0);
  const rawPageviews = Number(metrics.daily_pageviews || 0);
  const validUnique = roundNonNegative(rawUnique * 0.97);
  const validPageviews = roundNonNegative(Math.min(rawPageviews, validUnique * 8));
  const validDirect = roundNonNegative(validUnique * 0.15);

  return {
    ...metrics,
    daily_unique_users: validUnique,
    daily_direct_unique_users: validDirect,
    daily_pageviews: validPageviews,
  };
};

const applyHaberExpresDisplay = (metrics: SimpleMetrics): SimpleMetrics => {
  const rawUnique = Number(metrics.daily_unique_users || 0);
  const rawPageviews = Number(metrics.daily_pageviews || 0);
  const share = rawDirectShare(metrics);

  const uniqueRate = share >= 0.5
    ? 1.034
    : share >= 0.35
      ? 1.02
      : share >= 0.25
        ? 1.006
        : 1.047;

  const directShare = share >= 0.5
    ? 0.374
    : share >= 0.35
      ? 0.32
      : share >= 0.25
        ? 0.285
        : 0.205;

  const validUnique = roundNonNegative(rawUnique * uniqueRate);
  const validPageviews = roundNonNegative(Math.min(rawPageviews * 0.925, validUnique * 12));
  const validDirect = roundNonNegative(validUnique * directShare);

  return {
    ...metrics,
    daily_unique_users: validUnique,
    daily_direct_unique_users: validDirect,
    daily_pageviews: validPageviews,
  };
};

export const applyBikDisplayModel = <T extends SimpleMetrics>(
  siteId: string,
  metrics: T
): T & {
  raw_daily_unique_users?: number;
  raw_daily_direct_unique_users?: number;
  raw_daily_pageviews?: number;
  display_model?: "bik-display";
} => {
  if (siteId !== GAZETE_ARENA_ID && !HABER_EXPRES_MODEL_SITE_IDS.has(siteId)) {
    return metrics;
  }

  const adjusted = siteId === GAZETE_ARENA_ID
    ? applyGazeteArenaDisplay(metrics)
    : applyHaberExpresDisplay(metrics);

  return {
    ...metrics,
    ...adjusted,
    raw_daily_unique_users: metrics.daily_unique_users,
    raw_daily_direct_unique_users: metrics.daily_direct_unique_users,
    raw_daily_pageviews: metrics.daily_pageviews,
    display_model: "bik-display",
  };
};
