import { prisma } from "@/lib/prisma";

export const DEFAULT_BIK_CONFIG = {
  sessionInactivityMinutes: 30,
  botPvRate10s: 30,
  botPv5Min: 200,
  botPeriodicStddevMs: 200,
  botNoInteractionMs: 2000,
  engagementMinVisibleMs: 1000,
  engagementFullMs: 5000,
  suspiciousSoftMode: true,
  strictSessionInactivityMinutes: 35,
  strictMaxGapSeconds: 1800,
  strictLastPageEstimateSeconds: 30,
  strictDirectReferrerEmptyOnly: true,
  avgTimeMode: "SESSION",
  cookieLessAggressiveness: 1.0,
  category: "GENEL",
};

export type BikConfig = typeof DEFAULT_BIK_CONFIG;

export const getBikConfig = async (websiteId: string): Promise<BikConfig> => {
  const config = await prisma.bIKConfig.findUnique({
    where: { websiteId },
  });
  if (!config) {
    return { ...DEFAULT_BIK_CONFIG };
  }
  return {
    sessionInactivityMinutes: config.sessionInactivityMinutes,
    botPvRate10s: config.botPvRate10s,
    botPv5Min: config.botPv5Min,
    botPeriodicStddevMs: config.botPeriodicStddevMs,
    botNoInteractionMs: config.botNoInteractionMs,
    engagementMinVisibleMs: config.engagementMinVisibleMs,
    engagementFullMs: config.engagementFullMs,
    suspiciousSoftMode: config.suspiciousSoftMode,
    strictSessionInactivityMinutes: config.strictSessionInactivityMinutes,
    strictMaxGapSeconds: config.strictMaxGapSeconds,
    strictLastPageEstimateSeconds: config.strictLastPageEstimateSeconds,
    strictDirectReferrerEmptyOnly: config.strictDirectReferrerEmptyOnly,
    avgTimeMode: config.avgTimeMode,
    cookieLessAggressiveness: config.cookieLessAggressiveness,
    category: config.category,
  };
};
