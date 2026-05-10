import type { PanelAlertType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AlertPresetKey = "GOAL_TRACKING_18H";

type PresetRuleInput = {
  name: string;
  type: PanelAlertType;
  config: Prisma.JsonObject;
  cooldownSeconds: number;
  telegramEnabled?: boolean;
};

const buildGoalTracking18hPreset = (): PresetRuleInput[] => [
  {
    name: "Preset • Direct Tempo Uyarı",
    type: "TARGET_PACE_BELOW",
    config: { metric: "direct", lagPercent: 15, startsAtHour: 12 },
    cooldownSeconds: 900,
  },
  {
    name: "Preset • Tekil Tempo Uyarı",
    type: "TARGET_PACE_BELOW",
    config: { metric: "unique", lagPercent: 15, startsAtHour: 12 },
    cooldownSeconds: 900,
  },
  {
    name: "Preset • PV Tempo Uyarı",
    type: "TARGET_PACE_BELOW",
    config: { metric: "pageview", lagPercent: 15, startsAtHour: 12 },
    cooldownSeconds: 900,
  },
  {
    name: "Preset • 18 Sonrası Direct Kritik",
    type: "PROJECTED_MISS",
    config: { metric: "direct", shortfallPercent: 0, startsAtHour: 18 },
    cooldownSeconds: 600,
  },
  {
    name: "Preset • 18 Sonrası Tekil Kritik",
    type: "PROJECTED_MISS",
    config: { metric: "unique", shortfallPercent: 0, startsAtHour: 18 },
    cooldownSeconds: 600,
  },
  {
    name: "Preset • 18 Sonrası PV Kritik",
    type: "PROJECTED_MISS",
    config: { metric: "pageview", shortfallPercent: 0, startsAtHour: 18 },
    cooldownSeconds: 600,
  },
  {
    name: "Preset • Duraklama 10dk",
    type: "STAGNATION",
    config: { lookbackMinutes: 10, minUniqueDelta: 40, minPageviewDelta: 150 },
    cooldownSeconds: 600,
  },
  {
    name: "Preset • Cache 10dk",
    type: "CACHE_STALE",
    config: { maxAgeMinutes: 10 },
    cooldownSeconds: 600,
  },
];

export const ALERT_PRESET_OPTIONS: { key: AlertPresetKey; label: string; description: string }[] = [
  {
    key: "GOAL_TRACKING_18H",
    label: "Standart Hedef Takibi (18:00 kritik)",
    description:
      "Direct 1000 / Tekil 10000 / PV 30000 mantığına uygun tempo, 18:00 sonrası kritik, duraklama ve cache alarmları.",
  },
];

const getPresetRules = (key: AlertPresetKey) => {
  switch (key) {
    case "GOAL_TRACKING_18H":
      return buildGoalTracking18hPreset();
  }
};

export const applyAlertPreset = async (websiteId: string, key: AlertPresetKey) => {
  const rules = getPresetRules(key);
  const existing = await prisma.panelAlertRule.findMany({
    where: {
      websiteId,
      name: { in: rules.map((rule) => rule.name) },
    },
    select: { name: true },
  });

  const existingNames = new Set(existing.map((item) => item.name));
  const data = rules
    .filter((rule) => !existingNames.has(rule.name))
    .map((rule) => ({
      websiteId,
      name: rule.name,
      type: rule.type,
      config: rule.config,
      cooldownSeconds: rule.cooldownSeconds,
      telegramEnabled: rule.telegramEnabled ?? true,
    }));

  if (data.length > 0) {
    await prisma.panelAlertRule.createMany({
      data: data.map((item) => ({
        ...item,
        config: item.config as Prisma.InputJsonValue,
      })),
    });
  }

  return {
    created: data.length,
    skipped: rules.length - data.length,
    total: rules.length,
  };
};
