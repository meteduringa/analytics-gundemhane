-- Add country code to analytics events for strict TR filtering
ALTER TABLE "analytics_events" ADD COLUMN "countryCode" TEXT;
