ALTER TABLE "bik_configs"
ADD COLUMN "engagementMinVisibleMs" INTEGER NOT NULL DEFAULT 1000;

ALTER TABLE "bik_configs"
ADD COLUMN "engagementFullMs" INTEGER NOT NULL DEFAULT 5000;

ALTER TABLE "bik_configs"
ADD COLUMN "suspiciousSoftMode" BOOLEAN NOT NULL DEFAULT true;
