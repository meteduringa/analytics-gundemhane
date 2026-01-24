import { prisma } from "@/lib/prisma";

export const DEFAULT_BIK_CONFIG = {
  sessionInactivityMinutes: 30,
  botPvRate10s: 30,
  botPv5Min: 200,
  botPeriodicStddevMs: 200,
  botNoInteractionMs: 2000,
  avgTimeMode: "SESSION",
  cookieLessAggressiveness: 1.0,
  category: "GENEL",
};

export const getBikConfig = async (websiteId: string) => {
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
    avgTimeMode: config.avgTimeMode,
    cookieLessAggressiveness: config.cookieLessAggressiveness,
    category: config.category,
  };
};

