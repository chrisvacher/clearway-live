"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserBlobs, ScribeOutbox, type BlobStore } from "@/lib/scribe/outbox";
import { fitPhoto } from "@/lib/scribe/image";
import { checkFile, consoleMode, shownCards, shownFiles } from "@/lib/scribe/policy";
import type { OutboxEntry, OutboxItem, ScribeState } from "@/lib/scribe/types";
import type { CaptureInput } from "./capture-composer";
import type { ShownCard } from "@/lib/scribe/policy";

const newId = () => crypto.randomUUID();
type Reply = { status: string; uploaded?: boolean; upload?: { url: string; key: string } };

// The scribe's side of the room (SCR-01, SCR-02, FAIL-03). Everything made here goes into the
// outbox first, so the console never waits on the network, then goes to the server one item at a
// time in the order it was made. The card ids are made here, so a replay is a duplicate.
export function useScribe(engagement: string, blobs?: BlobStore) {
  const [state, setState] = useState<ScribeState | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [online, setOnline] = useState(true);
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [fileError, setFileError] = useState("");
  const [now, setNow] = useState(() => new Date().toISOString());
  const outbox = useRef<ScribeOutbox | null>(null);
  const store = useRef<BlobStore | null>(null);
  const live = useRef<ScribeState["live"]>(null);
  const loading = useRef(false);
  // Items the server has settled whose state read has not come back yet. They stay on the screen
  // as Synced so a card never blinks out between leaving the outbox and arriving in the state.
  const sentRef = useRef<{ entry: OutboxEntry; since: number }[]>([]);
  const [sent, setSent] = useState<OutboxEntry[]>([]);
  const wasOnline = useRef(true);

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    const started = Date.now();
    try {
      const response = await fetch(`/api/scribe/${engagement}`, { cache: "no-store" });
      if (response.status === 403) { setSignedOut(true); setOnline(true); return; }
      const data = await response.json() as ScribeState;
      if (data.status === "ok") { setState(data); live.current = data.live; setSignedOut(false); setOnline(true); if (!wasOnline.current) outbox.current?.kick(); wasOnline.current = true; const left = sentRef.current.filter(s => s.since >= started); if (left.length !== sentRef.current.length) { sentRef.current = left; setSent(left.map(s => s.entry)); } }
    } catch { setOnline(false); wasOnline.current = false; } finally { loading.current = false; }
  }, [engagement]);

  useEffect(() => {
    store.current = blobs ?? browserBlobs();
    const post = async (body: Record<string, unknown>): Promise<Reply> => {
      const response = await fetch(`/api/scribe/${engagement}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
      const data = await response.json() as Reply;
      return { ...data, status: typeof data.status === "string" ? (response.status >= 500 ? "unavailable" : data.status) : "unavailable" };
    };
    const send = async (item: OutboxItem): Promise<{ status: string }> => {
      if (item.type === "capture") return post({ action: "capture", id: item.id, session: item.session, kind: item.kind, text: item.text, detail: item.detail, speaker: item.speaker, capturedAt: item.capturedAt, queuedAt: item.queuedAt ?? null });
      if (item.type === "edit") return post({ action: "edit", id: item.id, text: item.text, detail: item.detail, speaker: item.speaker, revision: item.revision });
      if (item.type === "refile") return post({ action: "refile", id: item.id, session: item.session });
      // A file: the row first, the bytes to the signed address, then the word that they arrived.
      const begun = await post({ action: "file_begin", id: item.id, session: item.session, fileKind: item.fileKind, name: item.name, contentType: item.contentType, bytes: item.bytes, capturedAt: item.capturedAt, queuedAt: item.queuedAt ?? null });
      if (begun.status !== "accepted" && begun.status !== "duplicate") return begun;
      if (!begun.uploaded && begun.upload) {
        const blob = await store.current!.get(item.id);
        if (!blob) return { status: "invalid_request" };
        const form = new FormData(); form.append("cacheControl", "3600"); form.append("", blob);
        const put = await fetch(begun.upload.url, { method: "PUT", body: form, headers: { "x-upsert": "true", apikey: begun.upload.key } });
        if (!put.ok) return { status: "unavailable" };
      }
      return post({ action: "file_done", id: item.id });
    };
    const box = new ScribeOutbox(`cw-scribe-outbox-${engagement}`, send, setEntries, (item, reason) => {
      if (item.type === "file") void store.current?.delete(item.id).catch(() => {});
      if (!reason) { sentRef.current = [...sentRef.current, { entry: { item, state: "sent" }, since: Date.now() }]; setSent(sentRef.current.map(s => s.entry)); }
      void load();
    }, undefined, () => navigator.onLine);
    outbox.current = box; setEntries(box.entries); box.kick();
    void load();
    const poll = setInterval(() => void load(), 2500);
    const tick = setInterval(() => setNow(new Date().toISOString()), 1000);
    const wake = () => { setOnline(true); box.kick(); void load(); };
    const sleep = () => setOnline(false);
    const visible = () => { if (document.visibilityState === "visible") wake(); };
    window.addEventListener("online", wake); window.addEventListener("offline", sleep); document.addEventListener("visibilitychange", visible);
    return () => { box.stop(); clearInterval(poll); clearInterval(tick); window.removeEventListener("online", wake); window.removeEventListener("offline", sleep); document.removeEventListener("visibilitychange", visible); };
  }, [engagement, blobs, load]);

  const mode = consoleMode(signedOut ? null : state);
  const overlay = useMemo(() => [...sent, ...entries], [sent, entries]);
  const cards = useMemo(() => shownCards(state, overlay, online, now), [state, overlay, online, now]);
  const files = useMemo(() => shownFiles(state, overlay, online, now), [state, overlay, online, now]);

  const capture = useCallback((input: CaptureInput) => {
    const where = live.current;
    if (!where || where.team_led) return;
    outbox.current?.add({ type: "capture", id: newId(), session: where.id, kind: input.kind, text: input.text, detail: input.detail, speaker: input.speaker, capturedAt: new Date().toISOString() });
  }, []);
  const edit = useCallback((card: ShownCard, next: { text: string; detail: CaptureInput["detail"]; speaker: string }) => {
    outbox.current?.add({ type: "edit", id: card.id, text: next.text, detail: next.detail, speaker: next.speaker, revision: card.revision });
  }, []);
  const refile = useCallback((id: string, session: string) => { outbox.current?.add({ type: "refile", id, session }); }, []);
  const dismiss = useCallback((id: string) => { outbox.current?.dismiss(id); }, []);
  const addFiles = useCallback(async (list: File[], asPhoto = false) => {
    const where = live.current;
    if (!where || where.team_led) return;
    setFileError("");
    for (const file of list) {
      const type = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
      let blob: Blob = file, contentType = type, name = file.name || "Easel photo";
      if (asPhoto || type.startsWith("image/")) {
        try { blob = await fitPhoto(file); contentType = "image/jpeg"; name = name.replace(/\.[a-z0-9]+$/i, "") + ".jpg"; } catch { /* Send the original if it is a type we accept. */ }
      }
      const problem = checkFile({ size: blob.size, type: contentType });
      if (problem) { setFileError(`${name}: ${problem}`); continue; }
      const id = newId();
      try { await store.current!.put(id, blob); } catch { setFileError(`${name}: This device couldn’t hold the file. Try again.`); continue; }
      outbox.current?.add({ type: "file", id, session: where.id, fileKind: contentType.startsWith("image/") ? "photo" : "file", name, contentType, bytes: blob.size, capturedAt: new Date().toISOString() });
    }
  }, []);

  const waiting = entries.filter(e => e.state !== "failed").length;
  return { state, mode, online, cards, files, entries, waiting, fileError, capture, edit, refile, dismiss, addFiles, reload: load };
}
