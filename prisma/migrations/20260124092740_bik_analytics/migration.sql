-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "AnalyticsEventType" AS ENUM ('PAGEVIEW', 'EVENT');

-- CreateEnum
CREATE TYPE "AnalyticsAlarmType" AS ENUM ('EVENT_THRESHOLD', 'ONLINE_BELOW');

-- CreateEnum
CREATE TYPE "BIKEventType" AS ENUM ('PAGE_VIEW', 'HEARTBEAT', 'INTERACTION', 'SESSION_START', 'SESSION_END');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_websites" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "allowedDomains" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_websites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_user_websites" (
    "userId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_user_websites_pkey" PRIMARY KEY ("userId","websiteId")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "type" "AnalyticsEventType" NOT NULL,
    "eventName" TEXT,
    "eventData" JSONB,
    "visitorId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "referrer" TEXT,
    "screen" TEXT,
    "language" TEXT,
    "userAgent" TEXT,
    "clientTimestamp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_sessions" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_alarms" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AnalyticsAlarmType" NOT NULL,
    "threshold" INTEGER NOT NULL,
    "windowSeconds" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_alarms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bik_configs" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "sessionInactivityMinutes" INTEGER NOT NULL DEFAULT 30,
    "botPvRate10s" INTEGER NOT NULL DEFAULT 30,
    "botPv5Min" INTEGER NOT NULL DEFAULT 200,
    "botPeriodicStddevMs" INTEGER NOT NULL DEFAULT 200,
    "botNoInteractionMs" INTEGER NOT NULL DEFAULT 2000,
    "avgTimeMode" TEXT NOT NULL DEFAULT 'SESSION',
    "cookieLessAggressiveness" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "category" TEXT NOT NULL DEFAULT 'GENEL',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bik_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bik_events" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "BIKEventType" NOT NULL,
    "url" TEXT NOT NULL,
    "referrer" TEXT,
    "isDirectSession" BOOLEAN NOT NULL DEFAULT false,
    "countryCode" TEXT,
    "userAgentHash" TEXT,
    "engagementIncrementMs" INTEGER,
    "botScore" INTEGER DEFAULT 0,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "isSuspicious" BOOLEAN NOT NULL DEFAULT false,
    "pageviewKey" TEXT,
    "metadata" JSONB,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bik_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bik_sessions" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "engagementMs" INTEGER NOT NULL DEFAULT 0,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "isSuspicious" BOOLEAN NOT NULL DEFAULT false,
    "isDirect" BOOLEAN NOT NULL DEFAULT false,
    "countryCode" TEXT,

    CONSTRAINT "bik_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bik_daily_visitors" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "visitorId" TEXT NOT NULL,
    "hasValidSession" BOOLEAN NOT NULL DEFAULT false,
    "hasDirectSession" BOOLEAN NOT NULL DEFAULT false,
    "engagementMs" INTEGER NOT NULL DEFAULT 0,
    "isSuspicious" BOOLEAN NOT NULL DEFAULT false,
    "countryCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bik_daily_visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bik_rollup_minute" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "minuteTs" TIMESTAMP(3) NOT NULL,
    "validUnique" INTEGER NOT NULL DEFAULT 0,
    "validDirectUnique" INTEGER NOT NULL DEFAULT 0,
    "validSessions" INTEGER NOT NULL DEFAULT 0,
    "pageviews" INTEGER NOT NULL DEFAULT 0,
    "engagementMsSum" INTEGER NOT NULL DEFAULT 0,
    "suspiciousCount" INTEGER NOT NULL DEFAULT 0,
    "invalidCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bik_rollup_minute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bik_rollup_day" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "dailyUniqueVisitors" INTEGER NOT NULL DEFAULT 0,
    "dailyDirectUniqueVisitors" INTEGER NOT NULL DEFAULT 0,
    "dailySessions" INTEGER NOT NULL DEFAULT 0,
    "dailyPageviews" INTEGER NOT NULL DEFAULT 0,
    "dailyAvgTimeOnSiteSeconds" INTEGER NOT NULL DEFAULT 0,
    "directRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "foreignAdjustmentApplied" BOOLEAN NOT NULL DEFAULT false,
    "healthScore" INTEGER NOT NULL DEFAULT 100,
    "category" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bik_rollup_day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bik_calibration_runs" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "bikMetrics" JSONB NOT NULL,
    "localMetrics" JSONB NOT NULL,
    "resultConfig" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bik_calibration_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "analytics_events_websiteId_createdAt_idx" ON "analytics_events"("websiteId", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_websiteId_sessionId_idx" ON "analytics_events"("websiteId", "sessionId");

-- CreateIndex
CREATE INDEX "analytics_events_websiteId_visitorId_idx" ON "analytics_events"("websiteId", "visitorId");

-- CreateIndex
CREATE INDEX "analytics_events_websiteId_type_createdAt_idx" ON "analytics_events"("websiteId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_sessions_websiteId_visitorId_idx" ON "analytics_sessions"("websiteId", "visitorId");

-- CreateIndex
CREATE INDEX "analytics_sessions_websiteId_lastSeenAt_idx" ON "analytics_sessions"("websiteId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_sessions_websiteId_sessionId_key" ON "analytics_sessions"("websiteId", "sessionId");

-- CreateIndex
CREATE INDEX "analytics_alarms_websiteId_isActive_idx" ON "analytics_alarms"("websiteId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "bik_configs_websiteId_key" ON "bik_configs"("websiteId");

-- CreateIndex
CREATE INDEX "bik_events_websiteId_ts_idx" ON "bik_events"("websiteId", "ts");

-- CreateIndex
CREATE INDEX "bik_events_websiteId_sessionId_idx" ON "bik_events"("websiteId", "sessionId");

-- CreateIndex
CREATE INDEX "bik_events_websiteId_visitorId_idx" ON "bik_events"("websiteId", "visitorId");

-- CreateIndex
CREATE INDEX "bik_events_websiteId_type_ts_idx" ON "bik_events"("websiteId", "type", "ts");

-- CreateIndex
CREATE INDEX "bik_sessions_websiteId_visitorId_idx" ON "bik_sessions"("websiteId", "visitorId");

-- CreateIndex
CREATE INDEX "bik_sessions_websiteId_lastSeenAt_idx" ON "bik_sessions"("websiteId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "bik_sessions_websiteId_sessionId_key" ON "bik_sessions"("websiteId", "sessionId");

-- CreateIndex
CREATE INDEX "bik_daily_visitors_websiteId_day_idx" ON "bik_daily_visitors"("websiteId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "bik_daily_visitors_websiteId_day_visitorId_key" ON "bik_daily_visitors"("websiteId", "day", "visitorId");

-- CreateIndex
CREATE INDEX "bik_rollup_minute_websiteId_minuteTs_idx" ON "bik_rollup_minute"("websiteId", "minuteTs");

-- CreateIndex
CREATE UNIQUE INDEX "bik_rollup_minute_websiteId_minuteTs_key" ON "bik_rollup_minute"("websiteId", "minuteTs");

-- CreateIndex
CREATE INDEX "bik_rollup_day_websiteId_day_idx" ON "bik_rollup_day"("websiteId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "bik_rollup_day_websiteId_day_key" ON "bik_rollup_day"("websiteId", "day");

-- CreateIndex
CREATE INDEX "bik_calibration_runs_websiteId_day_idx" ON "bik_calibration_runs"("websiteId", "day");

-- AddForeignKey
ALTER TABLE "analytics_user_websites" ADD CONSTRAINT "analytics_user_websites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_user_websites" ADD CONSTRAINT "analytics_user_websites_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "analytics_websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "analytics_websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_sessions" ADD CONSTRAINT "analytics_sessions_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "analytics_websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_alarms" ADD CONSTRAINT "analytics_alarms_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "analytics_websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bik_configs" ADD CONSTRAINT "bik_configs_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "analytics_websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bik_events" ADD CONSTRAINT "bik_events_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "analytics_websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bik_sessions" ADD CONSTRAINT "bik_sessions_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "analytics_websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bik_daily_visitors" ADD CONSTRAINT "bik_daily_visitors_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "analytics_websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bik_rollup_minute" ADD CONSTRAINT "bik_rollup_minute_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "analytics_websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bik_rollup_day" ADD CONSTRAINT "bik_rollup_day_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "analytics_websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bik_calibration_runs" ADD CONSTRAINT "bik_calibration_runs_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "analytics_websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
