import { uuid } from "../room/identity";

const logos = "https://tilmrkgiwlpuflbtueen.supabase.co/storage/v1/object/public/logos/";

// Team Hub stores a filename under the client's folder, or a complete bucket path.
// Live stores an HTTPS address, so resolve the storage reference at the reader boundary.
export function teamHubLogoAddress(client: string, value: string | null): string | null {
  const logo = value?.trim();
  if (!logo) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(logo)) {
    try {
      const url = new URL(logo);
      return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }
  if (!uuid(client) || logo.includes("\\")) return null;
  const parts = (logo.includes("/") ? logo : `${client}/${logo}`).split("/");
  if (parts.some(part => !part || part === "." || part === "..")) return null;
  return logos + parts.map(encodeURIComponent).join("/");
}
