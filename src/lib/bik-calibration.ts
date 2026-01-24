type Metrics = {
  daily_unique_visitors: number;
  daily_direct_unique_visitors: number;
  daily_pageviews: number;
  daily_sessions: number;
};

export const calibrateConfig = (
  current: {
    sessionInactivityMinutes: number;
    botPvRate10s: number;
    botPv5Min: number;
    botPeriodicStddevMs: number;
    cookieLessAggressiveness: number;
  },
  local: Metrics,
  bik: Metrics
) => {
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  const sessionDiff = bik.daily_sessions - local.daily_sessions;
  const pageviewDiff = bik.daily_pageviews - local.daily_pageviews;
  const uniqueDiff = bik.daily_unique_visitors - local.daily_unique_visitors;

  const nextSessionTimeout = clamp(
    current.sessionInactivityMinutes + (sessionDiff > 0 ? -5 : sessionDiff < 0 ? 5 : 0),
    20,
    45
  );

  const nextBotPvRate = clamp(
    current.botPvRate10s + (pageviewDiff < 0 ? -5 : pageviewDiff > 0 ? 5 : 0),
    10,
    60
  );

  const nextBotPv5m = clamp(
    current.botPv5Min + (pageviewDiff < 0 ? -25 : pageviewDiff > 0 ? 25 : 0),
    50,
    400
  );

  const nextStddev = clamp(
    current.botPeriodicStddevMs + (pageviewDiff < 0 ? -20 : pageviewDiff > 0 ? 20 : 0),
    50,
    500
  );

  const nextCookieLess = clamp(
    current.cookieLessAggressiveness + (uniqueDiff > 0 ? 0.05 : uniqueDiff < 0 ? -0.05 : 0),
    0.7,
    1.3
  );

  return {
    sessionInactivityMinutes: nextSessionTimeout,
    botPvRate10s: nextBotPvRate,
    botPv5Min: nextBotPv5m,
    botPeriodicStddevMs: nextStddev,
    cookieLessAggressiveness: nextCookieLess,
  };
};

