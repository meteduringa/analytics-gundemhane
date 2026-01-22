export const formatDuration = (seconds: number) => {
  if (seconds <= 0) {
    return "0 sn";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} sa`);
  if (minutes > 0) parts.push(`${minutes} dk`);
  if (secs > 0) parts.push(`${secs} sn`);
  return parts.join(" ");
};
