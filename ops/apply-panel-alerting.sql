DO $$
BEGIN
  CREATE TYPE "PanelAlertType" AS ENUM (
    'TARGET_PACE_BELOW',
    'PROJECTED_MISS',
    'STAGNATION',
    'CACHE_STALE',
    'TRAFFIC_DROP'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "analytics_websites"
  ADD COLUMN IF NOT EXISTS "siteUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "primaryDomain" TEXT,
  ADD COLUMN IF NOT EXISTS "dailyUniqueTarget" INTEGER,
  ADD COLUMN IF NOT EXISTS "dailyPageviewTarget" INTEGER,
  ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "analytics_websites_primaryDomain_key"
  ON "analytics_websites" ("primaryDomain");

CREATE TABLE IF NOT EXISTS "panel_alert_rules" (
  "id" TEXT NOT NULL,
  "websiteId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "PanelAlertType" NOT NULL,
  "config" JSONB NOT NULL,
  "telegramEnabled" BOOLEAN NOT NULL DEFAULT true,
  "telegramChatId" TEXT,
  "cooldownSeconds" INTEGER NOT NULL DEFAULT 900,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastTriggeredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "panel_alert_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "panel_alert_rules_websiteId_fkey"
    FOREIGN KEY ("websiteId")
    REFERENCES "analytics_websites"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "panel_alert_events" (
  "id" TEXT NOT NULL,
  "alertRuleId" TEXT NOT NULL,
  "websiteId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "payload" JSONB,
  "deliveredToTelegram" BOOLEAN NOT NULL DEFAULT false,
  "telegramChatId" TEXT,
  "telegramError" TEXT,
  "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "panel_alert_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "panel_alert_events_alertRuleId_fkey"
    FOREIGN KEY ("alertRuleId")
    REFERENCES "panel_alert_rules"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT "panel_alert_events_websiteId_fkey"
    FOREIGN KEY ("websiteId")
    REFERENCES "analytics_websites"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "panel_alert_rules_websiteId_isActive_idx"
  ON "panel_alert_rules" ("websiteId", "isActive");

CREATE INDEX IF NOT EXISTS "panel_alert_events_alertRuleId_triggeredAt_idx"
  ON "panel_alert_events" ("alertRuleId", "triggeredAt");

CREATE INDEX IF NOT EXISTS "panel_alert_events_websiteId_triggeredAt_idx"
  ON "panel_alert_events" ("websiteId", "triggeredAt");
