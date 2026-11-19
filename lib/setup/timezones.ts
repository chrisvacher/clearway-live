// The time zone picker's option list: Canada and the United States first, then every other IANA zone.
// The stored value is always present, so a church whose zone the browser doesn't list still shows it selected.
export const canadaZones = ["America/St_Johns", "America/Halifax", "America/Toronto", "America/Winnipeg", "America/Regina", "America/Edmonton", "America/Vancouver"];
export const usZones = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "America/Adak", "Pacific/Honolulu"];
export type ZoneGroup = { label: string; zones: string[] };
export function supportedZones(): string[] {
  try { const list = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone"); return list && list.length ? list : []; } catch { return []; }
}
export function zoneOptions(stored: string, supported: string[] = []): ZoneGroup[] {
  const first = new Set([...canadaZones, ...usZones]);
  const groups: ZoneGroup[] = [{ label: "Canada", zones: canadaZones }, { label: "United States", zones: usZones }];
  const rest = [...new Set(supported)].filter(z => !first.has(z));
  if (stored && !first.has(stored) && !rest.includes(stored)) rest.unshift(stored);
  rest.sort((a, b) => a.localeCompare(b));
  if (rest.length) groups.push({ label: "All time zones", zones: rest });
  return groups;
}

const commonDetailsZones = [
  ["America/St_Johns", "Newfoundland Time"],
  ["America/Halifax", "Atlantic Time"],
  ["America/Toronto", "Eastern Time"],
  ["America/New_York", "Eastern Time"],
  ["America/Winnipeg", "Central Time"],
  ["America/Chicago", "Central Time"],
  ["America/Regina", "Central Time"],
  ["America/Edmonton", "Mountain Time"],
  ["America/Denver", "Mountain Time"],
  ["America/Phoenix", "Mountain Time"],
  ["America/Vancouver", "Pacific Time"],
  ["America/Los_Angeles", "Pacific Time"],
] as const;

export function detailsTimeZones(stored: string, at: string) {
  const common = commonDetailsZones.map(([value, region]) => ({ value, label: `${region} · ${city(value)}`, group: "Common" }));
  const listed = new Set<string>(common.map(option => option.value));
  const all = [...new Set([...supportedZones(), stored])].filter(value => value && !listed.has(value)).sort();
  const options = [...common, ...all.map(value => ({
    value, label: value.split("/").map(piece => piece.replaceAll("_", " ")).join(" · "), group: "All zones",
  }))];
  const now = new Date(at);
  return options.flatMap(option => {
    try {
      const format = new Intl.DateTimeFormat("en-CA", { timeZone: option.value, timeZoneName: "shortOffset", hour: "numeric", minute: "2-digit", hour12: true });
      const parts = format.formatToParts(now);
      const zone = parts.find(part => part.type === "timeZoneName")?.value ?? "GMT";
      const time = parts.filter(part => part.type !== "timeZoneName").map(part => part.value).join("").trim();
      return [{ ...option, keywords: option.value, detail: `${zone.replace("GMT", "UTC").replace("-", "−")} · ${time}` }];
    } catch {
      return [];
    }
  });
}

function city(zone: string) {
  return zone.split("/").at(-1)?.replaceAll("_", " ") ?? zone;
}
