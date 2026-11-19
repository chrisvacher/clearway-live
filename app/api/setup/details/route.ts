import { NextResponse, type NextRequest } from "next/server";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { skins } from "@/lib/brand";
import { roomMutation } from "@/lib/live/mutation";
import { uuid } from "@/lib/room/identity";
import { getFacilitator } from "@/lib/server/facilitator";
import { serviceClient } from "@/lib/server/supabase";
import { limitedJson } from "@/lib/server/request";
import { applyDetailsChange, detailsChurchFields, detailsEventFields, detailsValues, lensFields, parseDetailsChange } from "@/lib/setup/details";
import { deliberate } from "@/lib/setup/errors";
import { setupFormFromRows } from "@/lib/setup/form";
import { localTime, setupInput } from "@/lib/setup/policy";

const answer = (data: Record<string, unknown>, status = 200) => privateResponse(NextResponse.json(data, { status }));
const problem = (message: string, status: number) => answer({ ok: false, message }, status);

export async function POST(request: NextRequest) {
  const config = authConfig();
  if (!config || !sameOrigin(request, config.origin)) return problem("Open Details to make this change.", 403);
  const fac = await getFacilitator();
  if (!fac) return problem("Sign in to change these details.", 401);
  const { client, profile } = fac;
  const body = await limitedJson(request, 262144).catch(() => null);
  if (!body || !uuid(body.id)) return problem("Choose an engagement.", 400);
  const id = body.id as string;
  const { data: event, error: eventError } = await client.from("engagements").select("*").eq("id", id).eq("deleted", false).maybeSingle();
  if (eventError || !event) return problem("That engagement is unavailable.", 404);
  const [church, assignments] = await Promise.all([
    client.from("churches").select("*").eq("id", event.church_id).eq("deleted", false).maybeSingle(),
    client.from("engagement_facilitators").select("clearway_user_id,role,user:clearway_users!inner(kind)").eq("user.kind", "person")
      .eq("engagement_id", id).eq("deleted", false),
  ]);
  if (!church.data || assignments.error) return problem("We couldn't load the engagement details.", 503);

  const form = setupFormFromRows(event, church.data, assignments.data);
  const action = body.action;
  const change = action === "fields" ? parseDetailsChange(body.fields, event.type === "team_workshop") : null;
  if (action === "fields" && change) {
    if (change.lead !== undefined && !profile.is_admin) return problem("Only an admin can change the lead facilitator.", 403);
    if (change.co !== undefined && profile.kind !== "person") return problem("Sign in with your Clearway account to change the co-facilitator.", 403);
    if ((change.lead !== undefined && !uuid(change.lead)) || (change.co && !uuid(change.co))) return problem("Choose a facilitator.", 400);
    applyDetailsChange(form, change);
    if (change.timezone && change.pre_call_local === undefined) {
      try { form.engagement.pre_call_local = localTime(event.pre_call_at, change.timezone); }
      catch { return problem("Choose a time zone from the list.", 400); }
    }
  } else if (action === "brand" && typeof body.value === "string" && (skins as readonly string[]).includes(body.value)) {
    if (!profile.is_admin) return problem("Only an admin can change the brand.", 403);
    form.engagement.skin = body.value;
  } else if (action === "ai" && typeof body.value === "boolean") {
    form.engagement.settings.ai_enabled = body.value;
  } else {
    return problem("Check the engagement details.", 400);
  }

  let input;
  try { input = setupInput(form as unknown as Record<string, unknown>); }
  catch (error) { return problem(error instanceof Error ? error.message : "Check the engagement details.", 400); }
  const settings = action === "ai" ? { ai_enabled: input.engagement.settings.ai_enabled }
    : change?.scripture_translation !== undefined ? { scripture_translation: input.engagement.settings.scripture_translation }
    : {};
  const assignmentsPatch = {
    ...(change?.lead !== undefined && { lead: form.lead }),
    ...(change?.co !== undefined && { co: form.co || null }),
  };
  const churchPatch = Object.fromEntries(detailsChurchFields.filter(key => change?.[key] !== undefined).map(key => [key, input.church[key]]));
  const eventPatch: Record<string, unknown> = Object.fromEntries(detailsEventFields.filter(key => change?.[key] !== undefined).map(key => {
    const field = key === "pre_call_local" ? "pre_call_at" : key;
    return [field, input.engagement[field]];
  }));
  if (lensFields.some(key => change?.[key] !== undefined)) eventPatch.lens_names = input.engagement.lens_names;
  if (action === "brand") eventPatch.skin = form.engagement.skin;

  const result = await roomMutation(client, id, () => client.rpc("engagement_details_patch", {
    p_engagement: id, p_change: { church: churchPatch, event: eventPatch, settings, assignments: assignmentsPatch },
  }));
  if (result.error?.code === "PGRST202" || result.error?.code === "42883") {
    // An older schema lacks the atomic Details RPC. Keep single-row changes available without replacing any assignments.
    const hasChurch = Object.keys(churchPatch).length > 0;
    const hasSettings = Object.keys(settings).length > 0;
    const hasEvent = Object.keys(eventPatch).length > 0 || hasSettings;
    if (Object.keys(assignmentsPatch).length || (hasChurch && hasEvent)) {
      return problem("These changes can be saved together once the server update finishes. Your changes are still here.", 503);
    }
    if (hasChurch) {
      const updated = await client.from("churches").update(churchPatch).eq("id", event.church_id).eq("deleted", false).select("id").maybeSingle();
      if (updated.error || !updated.data) return problem("We couldn't save those details. Try again.", 409);
    } else if (hasEvent) {
      // The old database only grants brand updates through the broad save. This branch is reached only after the admin check.
      const actor = action === "brand" ? serviceClient() : client;
      const updated = await roomMutation(client, id, () => {
        const write = actor.from("engagements").update({
          ...eventPatch, ...(hasSettings && { settings: { ...event.settings, ...settings } }),
        }).eq("id", id).eq("deleted", false);
        if (hasSettings) write.eq("settings", JSON.stringify(event.settings));
        return write.select("id").maybeSingle();
      });
      if (updated.error || !updated.data) return problem("The engagement changed while you were saving. Try again.", 409);
    }
  } else if (result.error) {
    const failure = deliberate(result.error);
    return problem(failure?.message ?? "We couldn't save those details. Try again.", failure?.status ?? 409);
  } else if (result.data !== "ok") {
    if (result.data === "denied") return problem("You don't have access to change these details.", 403);
    if (result.data === "missing") return problem("That engagement is unavailable.", 404);
    return problem("Check the engagement details and try again.", 400);
  }
  return answer(action === "fields" ? { ok: true, values: detailsValues(form) } : { ok: true });
}
