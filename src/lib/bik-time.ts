export const getIstanbulDayRange = (date: Date) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayString = formatter.format(date);
  const start = new Date(`${dayString}T00:00:00+03:00`);
  const end = new Date(`${dayString}T23:59:59+03:00`);
  return { start, end, dayString };
};

export const parseDayParam = (value?: string | null) => {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T12:00:00+03:00`);
};

