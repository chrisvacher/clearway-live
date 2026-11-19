import type { SetupForm } from "./types";

export const lensFields = ["lens1", "lens2", "lens3", "lens4", "lens5"] as const;

export const detailsLabels = {
  title: "Event title", start_date: "Date", end_date: "Ends", lead: "Lead facilitator", co: "Co-facilitator",
  logo_url: "Logo", name: "Name on screens", timezone: "Time zone",
  pre_call_local: "Pre-call time in the church’s time zone", retreat_start_date: "Retreat start", retreat_end_date: "Retreat end",
  base_year: "Base year", governance_body_name: "Governance body’s name", scripture_translation: "Scripture translation",
  lens1: "Lens 1", lens2: "Lens 2", lens3: "Lens 3", lens4: "Lens 4", lens5: "Lens 5",
  mission: "Mission", purpose: "Purpose", values: "Values", strategy: "Strategy", leadership_rhythms: "Leadership Rhythms",
} as const;

export type DetailsField = keyof typeof detailsLabels;
export type DetailsValues = Record<DetailsField, string>;

export function detailsValues(form: SetupForm): DetailsValues {
  const { church, engagement } = form;
  return {
    title: engagement.title, start_date: engagement.start_date, end_date: engagement.end_date,
    lead: form.lead, co: form.co, logo_url: church.logo_url, name: church.name, timezone: church.timezone,
    pre_call_local: engagement.pre_call_local, retreat_start_date: engagement.retreat_start_date,
    retreat_end_date: engagement.retreat_end_date, base_year: engagement.base_year,
    governance_body_name: church.governance_body_name, scripture_translation: engagement.settings.scripture_translation,
    lens1: engagement.lens_names[0] ?? "", lens2: engagement.lens_names[1] ?? "", lens3: engagement.lens_names[2] ?? "",
    lens4: engagement.lens_names[3] ?? "", lens5: engagement.lens_names[4] ?? "",
    mission: church.mission, purpose: church.purpose, values: church.values, strategy: church.strategy,
    leadership_rhythms: church.leadership_rhythms,
  };
}

export const detailsChurchFields = ["logo_url", "name", "timezone", "governance_body_name", "mission", "purpose", "values", "strategy", "leadership_rhythms"] as const;
export const detailsEventFields = ["title", "start_date", "end_date", "pre_call_local", "retreat_start_date", "retreat_end_date", "base_year"] as const;
const workshopFields = new Set<DetailsField>(["title", "start_date", "end_date", "lead", "co", "logo_url", "name", "timezone"]);

export function parseDetailsChange(value: unknown, workshop: boolean): Partial<DetailsValues> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (!entries.length || entries.some(([key, field]) => typeof field !== "string" ||
    !Object.hasOwn(detailsLabels, key) || (workshop && !workshopFields.has(key as DetailsField)))) return null;
  return Object.fromEntries(entries);
}

export function applyDetailsChange(form: SetupForm, change: Partial<DetailsValues>) {
  for (const key of detailsChurchFields) if (change[key] !== undefined) form.church[key] = change[key];
  for (const key of detailsEventFields) if (change[key] !== undefined) form.engagement[key] = change[key];
  lensFields.forEach((key, index) => {
    if (change[key] !== undefined) form.engagement.lens_names[index] = change[key];
  });
  if (change.scripture_translation !== undefined) form.engagement.settings.scripture_translation = change.scripture_translation;
  if (change.lead !== undefined) form.lead = change.lead;
  if (change.co !== undefined) form.co = change.co;
}
