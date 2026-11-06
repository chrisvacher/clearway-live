import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { cleanLine, cleanNoteText, discoverMessage, findingInput, MAX_NOTE_CHARS, MAX_PERSON, MAX_RESPONDENTS, MAX_TITLE, noteKinds, type NoteKind } from "@/lib/discover/policy";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
const code = (status: string) => ["ok", "duplicate"].includes(status) ? 200 : status === "denied" ? 403 : status === "not_found" ? 404
  : ["invalid_request", "empty", "too_long", "exceeds_total", "below_findings"].includes(status) ? 422 : 409;
const reply = (data: { status: string } & Record<string, unknown>) => answer({ ...data, ...(data.status === "ok" || data.status === "duplicate" ? {} : { message: discoverMessage(data.status, { total: data.total as number | undefined, most: data.most as number | undefined }) }) }, code(data.status));

// Discover for one engagement: facilitators of the engagement only. The functions check the role again.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  try {
    const note = request.nextUrl.searchParams.get("note");
    if (note) {
      if (!uuid(note)) return answer({ status: "invalid_request" }, 422);
      const { data, error } = await fac.client.rpc("discover_note_read", { p_engagement: id, p_id: note });
      if (error) throw error;
      return reply(data);
    }
    const { data, error } = await fac.client.rpc("discover_state", { p_engagement: id });
    if (error) throw error;
    return reply(data);
  } catch { return answer({ status: "unavailable", message: "Discover isn't available right now. Try again." }, 503); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let call: { fn: string; args: Record<string, unknown> };
  try {
    const body = await limitedJson(request, 262144), action = String(body.action);
    const target = () => { if (!uuid(body.id)) throw new Error("Reload the page and try again."); return body.id as string; };
    if (action === "total") {
      const total = body.total === null || body.total === "" ? null : Number(body.total);
      if (total !== null && (!Number.isInteger(total) || total < 1 || total > MAX_RESPONDENTS)) throw new Error("Say how many people answered the survey, as a whole number.");
      call = { fn: "discover_total_set", args: { p_total: total } };
    } else if (action === "finding_save") {
      const f = findingInput(body);
      if (!f.ok) throw new Error(f.message);
      call = { fn: "discover_finding_save", args: { p_id: target(), p_title: f.title, p_figure: f.figure, p_rests_on: f.restsOn } };
    } else if (action === "finding_delete") call = { fn: "discover_finding_delete", args: { p_id: target() } };
    else if (action === "note_add") {
      const text = cleanNoteText(typeof body.text === "string" ? body.text : "");
      const kind = noteKinds.includes(body.kind as NoteKind) ? body.kind : null, title = cleanLine(body.title, MAX_TITLE);
      if (!kind) throw new Error("Choose which conversation this is.");
      if (!title) throw new Error("Give the notes a title.");
      if (!text) throw new Error("Paste the notes first.");
      if (text.length > MAX_NOTE_CHARS) throw new Error(`A note can hold ${MAX_NOTE_CHARS.toLocaleString("en-CA")} characters. Split it into two notes.`);
      call = { fn: "discover_note_add", args: { p_id: target(), p_kind: kind, p_person: cleanLine(body.person, MAX_PERSON) || null, p_title: title, p_body: text, p_source: "paste" } };
    } else if (action === "note_update") {
      const kind = noteKinds.includes(body.kind as NoteKind) ? body.kind : null, title = cleanLine(body.title, MAX_TITLE);
      if (!kind || !title) throw new Error("Choose the conversation and give the notes a title.");
      call = { fn: "discover_note_update", args: { p_id: target(), p_kind: kind, p_person: cleanLine(body.person, MAX_PERSON) || null, p_title: title } };
    } else if (action === "note_delete") call = { fn: "discover_note_delete", args: { p_id: target() } };
    else throw new Error("Choose a Discover action.");
  } catch (error) {
    // An oversize body is the only thing the body reader refuses as "Invalid request": say what to do about a long note.
    const message = error instanceof Error ? (error.message === "Invalid request" ? discoverMessage("too_long") : error.message) : "Check the details and try again.";
    return answer({ status: "invalid_request", message }, 422);
  }
  try {
    const { data, error } = await fac.client.rpc(call.fn, { p_engagement: id, ...call.args });
    if (error) throw error;
    return reply(data);
  } catch { return answer({ status: "unavailable", message: "Discover isn't available right now. Try again." }, 503); }
}
