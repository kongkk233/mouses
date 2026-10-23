const DAY = 86400000;
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const time = Date.parse(value + "T00:00:00Z");
  return (
    Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
  );
}
export function dateNumber(date: string): number {
  return Date.parse(date + "T00:00:00Z") / DAY;
}
export function daysBetween(a: string, b: string): number {
  return dateNumber(b) - dateNumber(a);
}
export function addDays(date: string, days: number): string {
  return new Date((dateNumber(date) + days) * DAY).toISOString().slice(0, 10);
}
export function todayIn(timezone = "Asia/Shanghai", now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function timeIn(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}
export function ageText(dob: string, today: string, estimated = false): string {
  const days = Math.max(0, daysBetween(dob, today));
  return `${estimated ? "约" : ""}${Math.floor(days / 7)}周${days % 7}天`;
}
export function shortDate(date?: string | null): string {
  return date ? date.slice(5).replace("-", ".") : "未登记";
}
export function dateLabel(date: string, today: string): string {
  const days = daysBetween(today, date);
  return days === 0
    ? "今天"
    : days === 1
      ? "明天"
      : days === -1
        ? "昨天"
        : shortDate(date);
}
export function inQuietHours(
  time: string,
  start: string,
  end: string,
): boolean {
  if (start === end) return false;
  return start < end
    ? time >= start && time < end
    : time >= start || time < end;
}
