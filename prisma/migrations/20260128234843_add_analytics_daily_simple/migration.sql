-- Create analytics daily simple rollup table
CREATE TABLE "analytics_daily_simple" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "day" TIMESTAMP(3) NOT NULL,
  "dailyUniqueUsers" INTEGER NOT NULL,
  "dailyDirectUniqueUsers" INTEGER NOT NULL,
  "dailyPageviews" INTEGER NOT NULL,
  "dailyAvgTimeOnSiteSecondsPerUnique" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "analytics_daily_simple_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analytics_daily_simple_siteId_day_key" ON "analytics_daily_simple"("siteId", "day");
CREATE INDEX "analytics_daily_simple_siteId_day_idx" ON "analytics_daily_simple"("siteId", "day");

ALTER TABLE "analytics_daily_simple" ADD CONSTRAINT "analytics_daily_simple_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "analytics_websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
