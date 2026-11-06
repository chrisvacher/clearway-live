import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { uuid } from "@/lib/room/identity";
import { cleanLine, discoverMessage, fileSource, MAX_FILE_BYTES, MAX_PERSON, MAX_TITLE, noteKinds, titleFromFileName, wordCount, type NoteKind } from "@/lib/discover/policy";
import { extractNoteText, ReadError } from "@/lib/discover/extract";

export const dynamic = "force-dynamic";
// Reading a long PDF can take a moment.
export const maxDuration = 60;
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// A note from a file: Word, PDF or text, up to 10 MB. The text is read here, on the server, and added as a note.
// The file itself is not kept anywhere. (Vercel caps a request body at 4.5 MB, so larger files stop before this runs.)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  if (Number(request.headers.get("content-length") || 0) > MAX_FILE_BYTES + 262144) return answer({ status: "unreadable", message: "That file is larger than 10 MB. Paste the text instead." }, 413);
  try {
    const form = await request.formData(), file = form.get("file"), noteId = form.get("id"), kind = form.get("kind");
    if (!(file instanceof File) || !uuid(noteId) || !noteKinds.includes(kind as NoteKind)) return answer({ status: "invalid_request", message: "Choose which conversation this is, then pick the file again." }, 422);
    const source = fileSource(file.name);
    if (!source) return answer({ status: "unreadable", message: "Use a Word (.docx), PDF or text (.txt) file, or paste the text." }, 422);
    if (file.size > MAX_FILE_BYTES) return answer({ status: "unreadable", message: "That file is larger than 10 MB. Paste the text instead." }, 413);
    // The facilitator's role is checked before any reading, so a stranger can't spend the server's time.
    const check = await fac.client.rpc("discover_state", { p_engagement: id });
    if (check.error) throw check.error;
    if (check.data?.status !== "ok") return answer({ status: check.data?.status, message: discoverMessage(check.data?.status) }, check.data?.status === "denied" ? 403 : 409);
    let text: string;
    try { text = await extractNoteText(source, new Uint8Array(await file.arrayBuffer())); }
    catch (error) {
      if (error instanceof ReadError) return answer({ status: "unreadable", message: error.message }, 422);
      throw error;
    }
    const title = cleanLine(form.get("title"), MAX_TITLE) || titleFromFileName(file.name);
    const { data, error } = await fac.client.rpc("discover_note_add", { p_engagement: id, p_id: noteId, p_kind: kind, p_person: cleanLine(form.get("person"), MAX_PERSON) || null, p_title: title, p_body: text, p_source: source });
    if (error) throw error;
    const ok = data.status === "ok" || data.status === "duplicate";
    return answer({ ...data, words: wordCount(text), ...(ok ? {} : { message: discoverMessage(data.status) }) }, ok ? 200 : data.status === "denied" ? 403 : data.status === "too_long" || data.status === "empty" ? 422 : 409);
  } catch { return answer({ status: "unavailable", message: "We couldn't read that file just now. Try again, or paste the text." }, 503); }
}
