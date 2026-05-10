import { Prisma, type PanelAlertRule, type PanelAlertType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getIstanbulDayRange, parseDayParam } from "@/lib/bik-time";

export type AlertMetric = "unique" | "pageview" | "direct";

export type TargetPaceBelowConfig = {
  metric: AlertMetric;
  lagPercent: number;
  startsAtHour?: number;
};

export type ProjectedMissConfig = {
  metric: AlertMetric;
  shortfallPercent?: number;
  startsAtHour?: number;
};

export type CurrentTargetBelowConfig = {
  metric: AlertMetric;
  shortfallPercent?: number;
  startsAtHour?: number;
};

export type StagnationConfig = {
  lookbackMinutes: number;
  minUniqueDelta?: number;
  minPageviewDelta?: number;
};

export type CacheStaleConfig = {
  maxAgeMinutes: number;
};

export type TrafficDropConfig = {
  metric: AlertMetric;
  lookbackMinutes: number;
  dropPercent: number;
};

export type PanelAlertConfig =
  | TargetPaceBelowConfig
  | ProjectedMissConfig
  | CurrentTargetBelowConfig
  | StagnationConfig
  | CacheStaleConfig
  | TrafficDropConfig;

export type TargetBoardRow = {
  websiteId: string;
  websiteName: string;
  date: string;
  telegramChatId: string | null;
  dailyUniqueTarget: number | null;
  dailyDirectUniqueTarget: number | null;
  dailyPageviewTarget: number | null;
  currentUnique: number;
  currentDirectUnique: number;
  currentPageviews: number;
  remainingUnique: number | null;
  remainingDirectUnique: number | null;
  remainingPageviews: number | null;
  progressUniquePercent: number | null;
  progressDirectUniquePercent: number | null;
  progressPageviewsPercent: number | null;
  projectedUniqueAtMidnight: number | null;
  projectedDirectUniqueAtMidnight: number | null;
  projectedPageviewsAtMidnight: number | null;
  uniqueRisk: "green" | "yellow" | "red" | "none";
  directRisk: "green" | "yellow" | "red" | "none";
  pageviewRisk: "green" | "yellow" | "red" | "none";
  recordUpdatedAt: string | null;
};

export type AlertEvaluation = {
  triggered: boolean;
  title: string;
  description: string;
  value: number | null;
  threshold: number | null;
  payload: Record<string, unknown>;
};

const clampRatio = (value: number) => Math.min(Math.max(value, 0), 1);

const round = (value: number) => Math.round(Number.isFinite(value) ? value : 0);

const normalizeMetric = (value: unknown): AlertMetric => {
  if (value === "pageview") return "pageview";
  if (value === "direct" || value === "direct_unique" || value === "directUnique") {
    return "direct";
  }
  return "unique";
};

const normalizeConfig = (
  type: PanelAlertType,
  config: Prisma.JsonValue
): PanelAlertConfig => {
  const value =
    config && typeof config === "object" && !Array.isArray(config) ? config : {};
  const record = value as Record<string, unknown>;

  switch (type) {
    case "TARGET_PACE_BELOW":
      return {
        metric: normalizeMetric(record.metric),
        lagPercent: Number(record.lagPercent ?? 15),
        startsAtHour: record.startsAtHour ? Number(record.startsAtHour) : undefined,
      };
    case "PROJECTED_MISS":
      return {
        metric: normalizeMetric(record.metric),
        shortfallPercent: Number(record.shortfallPercent ?? 0),
        startsAtHour: record.startsAtHour
          ? Number(record.startsAtHour)
          : undefined,
      };
    case "CURRENT_TARGET_BELOW":
      return {
        metric: normalizeMetric(record.metric),
        shortfallPercent: Number(record.shortfallPercent ?? 0),
        startsAtHour: record.startsAtHour
          ? Number(record.startsAtHour)
          : undefined,
      };
    case "STAGNATION":
      return {
        lookbackMinutes: Number(record.lookbackMinutes ?? 10),
        minUniqueDelta:
          record.minUniqueDelta !== undefined
            ? Number(record.minUniqueDelta)
            : undefined,
        minPageviewDelta:
          record.minPageviewDelta !== undefined
            ? Number(record.minPageviewDelta)
            : undefined,
      };
    case "CACHE_STALE":
      return {
        maxAgeMinutes: Number(record.maxAgeMinutes ?? 10),
      };
    case "TRAFFIC_DROP":
      return {
        metric: normalizeMetric(record.metric),
        lookbackMinutes: Number(record.lookbackMinutes ?? 15),
        dropPercent: Number(record.dropPercent ?? 30),
      };
  }
};

const getIstanbulHour = (value: Date) =>
  Number(
    value.toLocaleString("en-GB", {
      timeZone: "Europe/Istanbul",
      hour: "2-digit",
      hour12: false,
    })
  );

const getElapsedDayRatio = (targetDate: Date, now = new Date()) => {
  const { start, end } = getIstanbulDayRange(targetDate);
  if (now <= start) return 0;
  if (now >= end) return 1;
  return clampRatio((now.getTime() - start.getTime()) / (end.getTime() - start.getTime()));
};

const getWindowStats = async (
  websiteId: string,
  start: Date,
  end: Date
) => {
  const rows = await prisma.$queryRaw<
    Array<{ pageviews: bigint; unique_visitors: bigint }>
  >(Prisma.sql`
    SELECT
      COUNT(*)::bigint AS pageviews,
      COUNT(DISTINCT "visitorId")::bigint AS unique_visitors
    FROM "analytics_events"
    WHERE "websiteId" = ${websiteId}
      AND type = 'PAGEVIEW'
      AND mode = 'RAW'
      AND "countryCode" = 'TR'
      AND "createdAt" >= ${start}
      AND "createdAt" < ${end}
  `);

  const row = rows[0];
  return {
    pageviews: Number(row?.pageviews ?? 0),
    uniqueVisitors: Number(row?.unique_visitors ?? 0),
  };
};

export const getTargetBoard = async (targetDate: Date) => {
  const { start, dayString } = getIstanbulDayRange(targetDate);
  const websites = await prisma.analyticsWebsite.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      dailyUniqueTarget: true,
      dailyDirectUniqueTarget: true,
      dailyPageviewTarget: true,
      telegramChatId: true,
      dailySimple: {
        where: { day: start },
        take: 1,
        select: {
          dailyUniqueUsers: true,
          dailyDirectUniqueUsers: true,
          dailyPageviews: true,
          updatedAt: true,
        },
      },
    },
  });

  const elapsedRatio = getElapsedDayRatio(targetDate);

  return websites.map<TargetBoardRow>((website) => {
    const record = website.dailySimple[0];
    const currentUnique = record?.dailyUniqueUsers ?? 0;
    const currentDirectUnique = record?.dailyDirectUniqueUsers ?? 0;
    const currentPageviews = record?.dailyPageviews ?? 0;
    const projectedUniqueAtMidnight =
      elapsedRatio > 0 ? round(currentUnique / Math.max(elapsedRatio, 0.01)) : null;
    const projectedDirectUniqueAtMidnight =
      elapsedRatio > 0
        ? round(currentDirectUnique / Math.max(elapsedRatio, 0.01))
        : null;
    const projectedPageviewsAtMidnight =
      elapsedRatio > 0
        ? round(currentPageviews / Math.max(elapsedRatio, 0.01))
        : null;

    const remainingUnique =
      website.dailyUniqueTarget !== null && website.dailyUniqueTarget !== undefined
        ? Math.max(website.dailyUniqueTarget - currentUnique, 0)
        : null;
    const remainingDirectUnique =
      website.dailyDirectUniqueTarget !== null &&
      website.dailyDirectUniqueTarget !== undefined
        ? Math.max(website.dailyDirectUniqueTarget - currentDirectUnique, 0)
        : null;
    const remainingPageviews =
      website.dailyPageviewTarget !== null &&
      website.dailyPageviewTarget !== undefined
        ? Math.max(website.dailyPageviewTarget - currentPageviews, 0)
        : null;

    const progressUniquePercent =
      website.dailyUniqueTarget && website.dailyUniqueTarget > 0
        ? round((currentUnique / website.dailyUniqueTarget) * 100)
        : null;
    const progressDirectUniquePercent =
      website.dailyDirectUniqueTarget && website.dailyDirectUniqueTarget > 0
        ? round((currentDirectUnique / website.dailyDirectUniqueTarget) * 100)
        : null;
    const progressPageviewsPercent =
      website.dailyPageviewTarget && website.dailyPageviewTarget > 0
        ? round((currentPageviews / website.dailyPageviewTarget) * 100)
        : null;

    const resolveRisk = (
      target: number | null | undefined,
      projected: number | null
    ): "green" | "yellow" | "red" | "none" => {
      if (!target || !projected) return "none";
      const ratio = projected / target;
      if (ratio >= 1) return "green";
      if (ratio >= 0.9) return "yellow";
      return "red";
    };

    return {
      websiteId: website.id,
      websiteName: website.name,
      date: dayString,
      telegramChatId: website.telegramChatId ?? null,
      dailyUniqueTarget: website.dailyUniqueTarget ?? null,
      dailyDirectUniqueTarget: website.dailyDirectUniqueTarget ?? null,
      dailyPageviewTarget: website.dailyPageviewTarget ?? null,
      currentUnique,
      currentDirectUnique,
      currentPageviews,
      remainingUnique,
      remainingDirectUnique,
      remainingPageviews,
      progressUniquePercent,
      progressDirectUniquePercent,
      progressPageviewsPercent,
      projectedUniqueAtMidnight,
      projectedDirectUniqueAtMidnight,
      projectedPageviewsAtMidnight,
      uniqueRisk: resolveRisk(
        website.dailyUniqueTarget,
        projectedUniqueAtMidnight
      ),
      directRisk: resolveRisk(
        website.dailyDirectUniqueTarget,
        projectedDirectUniqueAtMidnight
      ),
      pageviewRisk: resolveRisk(
        website.dailyPageviewTarget,
        projectedPageviewsAtMidnight
      ),
      recordUpdatedAt: record?.updatedAt?.toISOString() ?? null,
    };
  });
};

const getMetricValues = (row: TargetBoardRow, metric: AlertMetric) => {
  if (metric === "direct") {
    return {
      current: row.currentDirectUnique,
      target: row.dailyDirectUniqueTarget,
      projected: row.projectedDirectUniqueAtMidnight,
      label: "direct tekil",
    };
  }
  if (metric === "pageview") {
    return {
      current: row.currentPageviews,
      target: row.dailyPageviewTarget,
      projected: row.projectedPageviewsAtMidnight,
      label: "pageview",
    };
  }
  return {
    current: row.currentUnique,
    target: row.dailyUniqueTarget,
    projected: row.projectedUniqueAtMidnight,
    label: "tekil",
  };
};

export const evaluatePanelAlertRule = async (
  rule: Pick<
    PanelAlertRule,
    | "id"
    | "name"
    | "type"
    | "config"
    | "websiteId"
    | "telegramEnabled"
    | "telegramChatId"
    | "cooldownSeconds"
    | "lastTriggeredAt"
  > & {
    website: {
      id: string;
      name: string;
      dailyUniqueTarget: number | null;
      dailyDirectUniqueTarget: number | null;
      dailyPageviewTarget: number | null;
      telegramChatId: string | null;
    };
  },
  targetRow: TargetBoardRow,
  now = new Date()
): Promise<AlertEvaluation> => {
  const config = normalizeConfig(rule.type, rule.config);
  const istanbulHour = getIstanbulHour(now);
  const alertDate = parseDayParam(targetRow.date) ?? now;
  const elapsedRatio = getElapsedDayRatio(alertDate, now);

  switch (rule.type) {
    case "TARGET_PACE_BELOW": {
      const typed = config as TargetPaceBelowConfig;
      if (typed.startsAtHour !== undefined && istanbulHour < typed.startsAtHour) {
        return {
          triggered: false,
          title: "Henüz kontrol saati gelmedi",
          description: `${typed.startsAtHour}:00 sonrası aktif.`,
          value: null,
          threshold: null,
          payload: {},
        };
      }
      const metric = getMetricValues(targetRow, typed.metric);
      if (!metric.target) {
        return {
          triggered: false,
          title: "Hedef tanımlı değil",
          description: `${rule.website.name} için ${metric.label} hedefi yok.`,
          value: metric.current,
          threshold: null,
          payload: { metric: typed.metric },
        };
      }
      const expectedNow = metric.target * elapsedRatio;
      const minimumAllowed = expectedNow * (1 - typed.lagPercent / 100);
      const triggered = metric.current < minimumAllowed;
      return {
        triggered,
        title: triggered ? "Hedef temposu geride" : "Tempo normal",
        description: `${metric.label} şu an ${metric.current}, beklenen en az ${round(
          minimumAllowed
        )}.`,
        value: metric.current,
        threshold: round(minimumAllowed),
        payload: {
          metric: typed.metric,
          current: metric.current,
          expectedNow: round(expectedNow),
          lagPercent: typed.lagPercent,
        },
      };
    }
    case "PROJECTED_MISS": {
      const typed = config as ProjectedMissConfig;
      if (typed.startsAtHour !== undefined && istanbulHour < typed.startsAtHour) {
        return {
          triggered: false,
          title: "Henüz kontrol saati gelmedi",
          description: `${typed.startsAtHour}:00 sonrası aktif.`,
          value: null,
          threshold: null,
          payload: {},
        };
      }
      const metric = getMetricValues(targetRow, typed.metric);
      if (!metric.target || !metric.projected) {
        return {
          triggered: false,
          title: "Projeksiyon için hedef yok",
          description: `${rule.website.name} için ${metric.label} hedefi tanımlı değil.`,
          value: metric.projected,
          threshold: null,
          payload: { metric: typed.metric },
        };
      }
      const minimumProjected = metric.target * (1 - (typed.shortfallPercent ?? 0) / 100);
      const triggered = metric.projected < minimumProjected;
      return {
        triggered,
        title: triggered ? "00:00 tahmini hedef altında" : "Projeksiyon yeterli",
        description: `${metric.label} gün sonu tahmini ${metric.projected}. Hedef ${metric.target}.`,
        value: metric.projected,
        threshold: round(minimumProjected),
        payload: {
          metric: typed.metric,
          projected: metric.projected,
          target: metric.target,
          shortfallPercent: typed.shortfallPercent ?? 0,
        },
      };
    }
    case "CURRENT_TARGET_BELOW": {
      const typed = config as CurrentTargetBelowConfig;
      if (typed.startsAtHour !== undefined && istanbulHour < typed.startsAtHour) {
        return {
          triggered: false,
          title: "Henüz kontrol saati gelmedi",
          description: `${typed.startsAtHour}:00 sonrası aktif.`,
          value: null,
          threshold: null,
          payload: {},
        };
      }
      const metric = getMetricValues(targetRow, typed.metric);
      if (!metric.target) {
        return {
          triggered: false,
          title: "Hedef tanımlı değil",
          description: `${rule.website.name} için ${metric.label} hedefi tanımlı değil.`,
          value: metric.current,
          threshold: null,
          payload: { metric: typed.metric },
        };
      }
      const minimumRequired = metric.target * (1 - (typed.shortfallPercent ?? 0) / 100);
      const triggered = metric.current < minimumRequired;
      return {
        triggered,
        title: triggered ? "Saat bazlı hedef altında" : "Hedefe ulaşıldı",
        description: `${metric.label} şu an ${metric.current}. ${typed.startsAtHour ?? 23}:00 kontrol eşiği ${round(
          minimumRequired
        )}, hedef ${metric.target}.`,
        value: metric.current,
        threshold: round(minimumRequired),
        payload: {
          metric: typed.metric,
          current: metric.current,
          target: metric.target,
          startsAtHour: typed.startsAtHour ?? 23,
          shortfallPercent: typed.shortfallPercent ?? 0,
        },
      };
    }
    case "STAGNATION": {
      const typed = config as StagnationConfig;
      const end = now;
      const start = new Date(now.getTime() - typed.lookbackMinutes * 60_000);
      const stats = await getWindowStats(rule.websiteId, start, end);
      const uniqueTriggered =
        typed.minUniqueDelta !== undefined &&
        stats.uniqueVisitors < typed.minUniqueDelta;
      const pageviewTriggered =
        typed.minPageviewDelta !== undefined &&
        stats.pageviews < typed.minPageviewDelta;
      const triggered = uniqueTriggered || pageviewTriggered;
      return {
        triggered,
        title: triggered ? "Duraklama tespit edildi" : "Akış normal",
        description: `Son ${typed.lookbackMinutes} dk: ${stats.uniqueVisitors} tekil, ${stats.pageviews} pageview.`,
        value: stats.pageviews,
        threshold: typed.minPageviewDelta ?? typed.minUniqueDelta ?? null,
        payload: {
          lookbackMinutes: typed.lookbackMinutes,
          uniqueVisitors: stats.uniqueVisitors,
          pageviews: stats.pageviews,
          minUniqueDelta: typed.minUniqueDelta,
          minPageviewDelta: typed.minPageviewDelta,
        },
      };
    }
    case "CACHE_STALE": {
      const typed = config as CacheStaleConfig;
      const recordUpdatedAt = targetRow.recordUpdatedAt
        ? new Date(targetRow.recordUpdatedAt)
        : null;
      const ageMinutes = recordUpdatedAt
        ? (now.getTime() - recordUpdatedAt.getTime()) / 60_000
        : Number.POSITIVE_INFINITY;
      const triggered = ageMinutes > typed.maxAgeMinutes;
      return {
        triggered,
        title: triggered ? "Cache eski" : "Cache güncel",
        description: recordUpdatedAt
          ? `Son hesaplanma ${round(ageMinutes)} dk önce.`
          : "Bugün için henüz cache kaydı yok.",
        value: round(ageMinutes),
        threshold: typed.maxAgeMinutes,
        payload: {
          maxAgeMinutes: typed.maxAgeMinutes,
          recordUpdatedAt: targetRow.recordUpdatedAt,
          ageMinutes,
        },
      };
    }
    case "TRAFFIC_DROP": {
      const typed = config as TrafficDropConfig;
      const currentEnd = now;
      const currentStart = new Date(now.getTime() - typed.lookbackMinutes * 60_000);
      const previousEnd = currentStart;
      const previousStart = new Date(
        currentStart.getTime() - typed.lookbackMinutes * 60_000
      );
      const [currentStats, previousStats] = await Promise.all([
        getWindowStats(rule.websiteId, currentStart, currentEnd),
        getWindowStats(rule.websiteId, previousStart, previousEnd),
      ]);
      const currentValue =
        typed.metric === "pageview"
          ? currentStats.pageviews
          : currentStats.uniqueVisitors;
      const previousValue =
        typed.metric === "pageview"
          ? previousStats.pageviews
          : previousStats.uniqueVisitors;
      const threshold = previousValue * (1 - typed.dropPercent / 100);
      const triggered = previousValue > 0 && currentValue < threshold;
      return {
        triggered,
        title: triggered ? "Ani düşüş tespit edildi" : "Düşüş yok",
        description: `Son ${typed.lookbackMinutes} dk ${currentValue}, önceki pencerede ${previousValue}.`,
        value: currentValue,
        threshold: round(threshold),
        payload: {
          metric: typed.metric,
          lookbackMinutes: typed.lookbackMinutes,
          currentValue,
          previousValue,
          dropPercent: typed.dropPercent,
        },
      };
    }
  }
};

export const buildAlertMessage = (
  rule: Pick<PanelAlertRule, "name" | "type"> & {
    website: { name: string };
  },
  evaluation: AlertEvaluation,
  targetRow: TargetBoardRow
) => {
  return [
    `[${targetRow.websiteName}] ${rule.name}`,
    evaluation.title,
    evaluation.description,
    `Gün: ${targetRow.date}`,
    `Direct Tekil: ${targetRow.currentDirectUnique}`,
    `Tekil: ${targetRow.currentUnique}`,
    `Pageview: ${targetRow.currentPageviews}`,
  ].join("\n");
};
