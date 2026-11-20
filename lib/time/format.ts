const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export type DateStyle = "date" | "time" | "dateTime";

export function formatInZone(date: Date | string | number, zone: string, style: DateStyle = "dateTime"): string {
  const value = new Date(date);
  if (!Number.isFinite(value.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone: zone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(value).map(({ type, value }) => [type, value]));
  const day = `${months[Number(parts.month) - 1]} ${Number(parts.day)}`;
  const hour = Number(parts.hour);
  const time = `${hour % 12 || 12}:${parts.minute} ${hour < 12 ? "a.m." : "p.m."}`;
  return style === "date" ? day : style === "time" ? time : `${day}, ${time}`;
}
