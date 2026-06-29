type SimpleMetrics = {
  day?: string;
  daily_unique_users: number;
  daily_direct_unique_users: number;
  daily_pageviews: number;
};

const GAZETE_ARENA_ID = "87652606-1a83-4dd5-8fbc-3680b00ead7f";
const HABER_EXPRES_ID = "13b45b00-d3de-4904-81d9-c4d37c0313db";
const GERCEK_FETHIYE_ID = "66b31527-c90e-41ec-9a67-6d003aeee99e";

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

const applyGercekFethiyeDisplay = (metrics: SimpleMetrics): SimpleMetrics => {
  const rawUnique = Number(metrics.daily_unique_users || 0);
  const rawDirect = Number(metrics.daily_direct_unique_users || 0);
  const rawPageviews = Number(metrics.daily_pageviews || 0);
  const directShare = rawUnique ? rawDirect / rawUnique : 0;
  const pageviewsPerUnique = rawUnique ? rawPageviews / rawUnique : 0;

  const uniqueRate = directShare > 0.75
    ? 1.035
    : directShare < 0.09 && pageviewsPerUnique < 4.05
      ? directShare > 0.065
        ? 1.02
        : 0.985
      : directShare < 0.09
        ? 0.995
        : directShare > 0.28
          ? 0.985
          : 0.99;

  const pageviewRate = directShare > 0.75
    ? 0.944
    : directShare < 0.09 && pageviewsPerUnique >= 4.8
      ? 0.91
      : directShare < 0.09 && pageviewsPerUnique < 4.05
        ? directShare > 0.065
          ? 1.0
          : 0.92
        : directShare >= 0.09 && directShare < 0.2
          ? 0.93
          : 0.925;

  const validUnique = roundNonNegative(rawUnique * uniqueRate);
  const validPageviews = roundNonNegative(rawPageviews * pageviewRate);

  const modeledDirectShare = directShare > 0.75
    ? 0.63
    : directShare > 0.33
      ? 0.335
      : directShare > 0.28
        ? 0.405
        : directShare > 0.18
          ? 0.36
          : directShare > 0.14
            ? 0.33
            : directShare > 0.11
              ? 0.325
              : directShare > 0.085
                ? 0.29
                : directShare > 0.07 && pageviewsPerUnique > 5.0
                  ? 0.21
                  : directShare > 0.07 && pageviewsPerUnique > 4.4
                    ? 0.16
                    : directShare > 0.07
                      ? 0.245
                      : directShare > 0.055 && pageviewsPerUnique > 3.8
                        ? 0.35
                        : directShare > 0.055
                          ? 0.37
                          : directShare > 0.035
                            ? 0.31
                            : directShare > 0.018
                              ? 0.28
                              : 0.5;

  const validDirect = roundNonNegative(validUnique * modeledDirectShare);

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
  if (
    siteId !== GAZETE_ARENA_ID &&
    siteId !== HABER_EXPRES_ID &&
    siteId !== GERCEK_FETHIYE_ID
  ) {
    return metrics;
  }

  const adjusted = siteId === GAZETE_ARENA_ID
    ? applyGazeteArenaDisplay(metrics)
    : siteId === GERCEK_FETHIYE_ID
      ? applyGercekFethiyeDisplay(metrics)
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
