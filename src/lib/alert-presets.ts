import type { PanelAlertType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AlertPresetKey = "GOAL_TRACKING_18H";
export type CustomerAlertShortcut = {
  key: string;
  aliases: string[];
  ruleName: string;
  label: string;
  description: string;
};

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
    name: "Preset • 23 Sonrası Direct Alt Hedef",
    type: "CURRENT_TARGET_BELOW",
    config: { metric: "direct", shortfallPercent: 0, startsAtHour: 23 },
    cooldownSeconds: 3600,
  },
  {
    name: "Preset • 23 Sonrası Tekil Alt Hedef",
    type: "CURRENT_TARGET_BELOW",
    config: { metric: "unique", shortfallPercent: 0, startsAtHour: 23 },
    cooldownSeconds: 3600,
  },
  {
    name: "Preset • 23 Sonrası PV Alt Hedef",
    type: "CURRENT_TARGET_BELOW",
    config: { metric: "pageview", shortfallPercent: 0, startsAtHour: 23 },
    cooldownSeconds: 3600,
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

export const CUSTOMER_ALERT_SHORTCUTS: CustomerAlertShortcut[] = [
  {
    key: "23direct",
    aliases: ["23direct", "23d"],
    ruleName: "Preset • 23 Sonrası Direct Alt Hedef",
    label: "23 Sonrası Direct Alt Hedef",
    description: "23:00 sonrası direct tekil 1000 altıysa uyarır.",
  },
  {
    key: "23tekil",
    aliases: ["23tekil", "23unique"],
    ruleName: "Preset • 23 Sonrası Tekil Alt Hedef",
    label: "23 Sonrası Tekil Alt Hedef",
    description: "23:00 sonrası toplam tekil 10000 altıysa uyarır.",
  },
  {
    key: "23pv",
    aliases: ["23pv", "23pageview"],
    ruleName: "Preset • 23 Sonrası PV Alt Hedef",
    label: "23 Sonrası PV Alt Hedef",
    description: "23:00 sonrası pageview 30000 altıysa uyarır.",
  },
  {
    key: "18direct",
    aliases: ["18direct", "18d"],
    ruleName: "Preset • 18 Sonrası Direct Kritik",
    label: "18 Sonrası Direct Kritik",
    description: "18:00 sonrası gün sonu direct projeksiyonu hedef altındaysa uyarır.",
  },
  {
    key: "18tekil",
    aliases: ["18tekil", "18unique"],
    ruleName: "Preset • 18 Sonrası Tekil Kritik",
    label: "18 Sonrası Tekil Kritik",
    description: "18:00 sonrası tekil projeksiyonu hedef altındaysa uyarır.",
  },
  {
    key: "18pv",
    aliases: ["18pv", "18pageview"],
    ruleName: "Preset • 18 Sonrası PV Kritik",
    label: "18 Sonrası PV Kritik",
    description: "18:00 sonrası pageview projeksiyonu hedef altındaysa uyarır.",
  },
  {
    key: "directtempo",
    aliases: ["directtempo", "dtempo"],
    ruleName: "Preset • Direct Tempo Uyarı",
    label: "Direct Tempo Uyarı",
    description: "Gün içinde direct tempo gerideyse uyarır.",
  },
  {
    key: "tekiltempo",
    aliases: ["tekiltempo", "utempo"],
    ruleName: "Preset • Tekil Tempo Uyarı",
    label: "Tekil Tempo Uyarı",
    description: "Gün içinde tekil tempo gerideyse uyarır.",
  },
  {
    key: "pvtempo",
    aliases: ["pvtempo", "pageviewtempo"],
    ruleName: "Preset • PV Tempo Uyarı",
    label: "PV Tempo Uyarı",
    description: "Gün içinde pageview tempo gerideyse uyarır.",
  },
  {
    key: "duraklama",
    aliases: ["duraklama", "stagnation"],
    ruleName: "Preset • Duraklama 10dk",
    label: "Duraklama 10dk",
    description: "Son 10 dakikada trafik akışı zayıflarsa uyarır.",
  },
  {
    key: "cache",
    aliases: ["cache", "cache10"],
    ruleName: "Preset • Cache 10dk",
    label: "Cache 10dk",
    description: "Cache 10 dakikadan eskiyse uyarır.",
  },
];

export const ALERT_PRESET_OPTIONS: { key: AlertPresetKey; label: string; description: string }[] = [
  {
    key: "GOAL_TRACKING_18H",
    label: "Standart Hedef Takibi (18:00 kritik)",
    description:
      "Direct 1000 / Tekil 10000 / PV 30000 mantığına uygun tempo, 18:00 projeksiyon kritik, 23:00 gerçekleşen hedef altı, duraklama ve cache alarmları.",
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
