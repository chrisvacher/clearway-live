// Server code only: the Discover file route is the one caller. mammoth and unpdf load on demand, so nothing here reaches a browser bundle.
import { cleanNoteText, MAX_FILE_BYTES, MAX_NOTE_CHARS, type FileSource } from "./policy";

// Reads the text out of an uploaded note on the server. The file itself is never kept: only the text it held.
// A failure carries the sentence the facilitator sees, with what to do next.
export class ReadError extends Error {
  constructor(message: string) { super(message); this.name = "ReadError"; }
}

const TOO_BIG = "That file is larger than 4 MB. Paste the text instead.";
const MAX_PDF_PAGES = 400;
const MAX_UNZIPPED = 100 * 1024 * 1024;

// A Word file is a zip. Add up what it would unpack to before anything unpacks it, so a small file can't hold a huge one.
export function unzippedBytes(buffer: Uint8Array): number | null {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let end = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 65535); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) return null;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true), total = 0;
  if (count > 5000) return Infinity;
  for (let i = 0; i < count; i++) {
    if (at + 46 > buffer.byteLength || view.getUint32(at, true) !== 0x02014b50) return null;
    total += view.getUint32(at + 24, true);
    at += 46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return total;
}

async function fromDocx(buffer: Uint8Array): Promise<string> {
  const size = unzippedBytes(buffer);
  if (size === null) throw new ReadError("That doesn't look like a Word (.docx) file. Save it as .docx or paste the text instead.");
  if (size > MAX_UNZIPPED) throw new ReadError(TOO_BIG);
  const mammoth = await import("mammoth");
  try {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return value;
  } catch { throw new ReadError("We couldn't read that Word file. It may be damaged or protected. Save a copy as .docx or paste the text instead."); }
}

async function fromPdf(buffer: Uint8Array): Promise<string> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    if (pdf.numPages > MAX_PDF_PAGES) throw new ReadError(`That PDF has more than ${MAX_PDF_PAGES} pages. Paste the part you need instead.`);
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n\n") : text;
  } catch (error) {
    if (error instanceof ReadError) throw error;
    throw new ReadError("We couldn't read that PDF. It may be damaged or protected with a password. Paste the text instead.");
  }
}

function fromText(buffer: Uint8Array): string {
  if (buffer.includes(0)) throw new ReadError("That doesn't look like a text file. Save it as plain text or paste the text instead.");
  return new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, "");
}

export async function extractNoteText(source: FileSource, buffer: Uint8Array): Promise<string> {
  if (buffer.byteLength === 0) throw new ReadError("That file is empty.");
  if (buffer.byteLength > MAX_FILE_BYTES) throw new ReadError(TOO_BIG);
  const raw = source === "docx" ? await fromDocx(buffer) : source === "pdf" ? await fromPdf(buffer) : fromText(buffer);
  const text = cleanNoteText(raw);
  if (!text) throw new ReadError(source === "pdf" ? "That PDF has no text in it. It may be a scan. Paste the text instead." : "That file has no text in it.");
  if (text.length > MAX_NOTE_CHARS) throw new ReadError(`That note is ${text.length.toLocaleString("en-CA")} characters and a note can hold ${MAX_NOTE_CHARS.toLocaleString("en-CA")}. Split it into two files.`);
  return text;
}
