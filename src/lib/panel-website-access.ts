import { prisma } from "@/lib/prisma";
import type { PanelSession } from "@/lib/panel-session";

export const getPanelAuthorizedWebsiteIds = async (
  session: PanelSession
): Promise<string[] | null> => {
  if (session.role === "ADMIN") {
    return null;
  }

  const links = await prisma.analyticsUserWebsite.findMany({
    where: { userId: session.id },
    select: { websiteId: true },
  });

  return links.map((item) => item.websiteId);
};

export const canAccessPanelWebsite = async (
  session: PanelSession,
  websiteId: string
) => {
  const allowedIds = await getPanelAuthorizedWebsiteIds(session);
  if (allowedIds === null) {
    return true;
  }

  return allowedIds.includes(websiteId);
};
