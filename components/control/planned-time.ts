import { formatInZone } from "@/lib/time/format";

// The route supplies the first labels from the server. Refreshes use the same
// formatter, without relying on the browser's locale or zone.
export function formatPlannedTime(iso: string | null, zone: string): string {
  return iso ? formatInZone(iso, zone, "time") : "";
}
