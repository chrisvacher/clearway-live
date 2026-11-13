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
