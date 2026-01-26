ALTER TABLE "analytics_events"
ADD COLUMN "mode" VARCHAR(32) NOT NULL DEFAULT 'RAW';

CREATE INDEX "analytics_events_websiteId_mode_createdAt_idx"
ON "analytics_events"("websiteId", "mode", "createdAt");

ALTER TABLE "bik_configs"
ADD COLUMN "strictSessionInactivityMinutes" INTEGER NOT NULL DEFAULT 35;

ALTER TABLE "bik_configs"
ADD COLUMN "strictMaxGapSeconds" INTEGER NOT NULL DEFAULT 1800;

ALTER TABLE "bik_configs"
ADD COLUMN "strictLastPageEstimateSeconds" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "bik_configs"
ADD COLUMN "strictDirectReferrerEmptyOnly" BOOLEAN NOT NULL DEFAULT true;
