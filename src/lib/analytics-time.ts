import { addDays, startOfDay, subHours } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

const ISTANBUL_TZ = "Europe/Istanbul";

export function getIstanbulTodayRange(now = new Date()) {
  const zonedNow = toZonedTime(now, ISTANBUL_TZ);
  const startLocal = startOfDay(zonedNow);
  const endLocal = addDays(startLocal, 1);

  return {
    startUtc: fromZonedTime(startLocal, ISTANBUL_TZ),
    endUtc: fromZonedTime(endLocal, ISTANBUL_TZ),
  };
}

export function getLast24HoursRange(now = new Date()) {
  return {
    startUtc: subHours(now, 24),
    endUtc: now,
  };
}

export const ISTANBUL_TIMEZONE = ISTANBUL_TZ;
