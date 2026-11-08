"use client";
import { useCallback, useEffect, useState } from "react";
import { FileDown, FileText, FileType, Loader, Palette, RotateCw, TriangleAlert, XCircle } from "lucide-react";
import type { ReportModel } from "@/lib/export/report-model";
import { WordPreview } from "./word-preview";

type Version = "signed" | "draft";
type Format = "docx" | "pdf";
type Signed = { n: number; signed_at: string; by: string | null; stale: boolean } | null;
const base = (id: string) => `/api/control/${id}/report/export`;

// AFT-01 ExportPanel: the report as a Clearway-branded Word file and PDF. The signed off version is clean. The draft says Draft in every page's header and in the
// file name. If the export isn't in the database yet the panel says so quietly and the rest of the page is unchanged.
export function ExportPanel({ engagement, signed, stamp }: { engagement: string; signed: Signed; stamp?: string }) {
  const [version, setVersion] = useState<Version>(signed ? "signed" : "draft");
  const [model, setModel] = useState<ReportModel | null>(null), [gone, setGone] = useState(false);
  const [state, setState] = useState<Record<Format, "ready" | "preparing" | "failed">>({ docx: "ready", pdf: "ready" });
  // A signed off version is what the panel offers first; the choice follows when the report is signed or the signing is lost.
  useEffect(() => { setVersion(v => signed ? v : "draft"); }, [signed]);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch(`${base(engagement)}?format=model&version=${version}`, { cache: "no-store" });
        const d = await r.json().catch(() => null) as { status?: string; model?: ReportModel } | null;
        if (!live) return;
        if (d?.status === "ok" && d.model) { setModel(d.model); setGone(false); } else { setModel(null); setGone(d?.status === "missing"); }
      } catch { if (live) { setModel(null); } }
    })();
    return () => { live = false; };
  }, [engagement, version, stamp, signed?.n]);

  const download = useCallback(async (format: Format) => {
    setState(s => ({ ...s, [format]: "preparing" }));
    try {
      const r = await fetch(`${base(engagement)}?format=${format}&version=${version}`, { cache: "no-store" });
      if (!r.ok) throw new Error("failed");
      const blob = await r.blob(), url = URL.createObjectURL(blob), a = document.createElement("a");
      const named = /filename\*=UTF-8''([^;]+)/.exec(r.headers.get("Content-Disposition") ?? "");
      a.href = url; a.download = named ? decodeURIComponent(named[1]) : `Wayfinding Report.${format}`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setState(s => ({ ...s, [format]: "ready" }));
    } catch { setState(s => ({ ...s, [format]: "failed" })); }
  }, [engagement, version]);

  if (gone) return <p className="ovr-muted" data-testid="rpt-export-missing">Export isn’t available yet.</p>;
  const draft = version === "draft", name = model?.fileName ?? "Wayfinding Report";
  const file = (format: Format, icon: React.ReactNode) => {
    const st = state[format];
    return <div className={`rpt-file is-${st}`} data-testid={`rpt-file-${format}`}>
      <span className="ic">{icon}</span>
      <div className="t"><b>{`${name}.${format}`}</b><span className="ovr-muted">{st === "preparing" ? "Building the pages in Clearway’s document design" : st === "failed" ? "Not built" : format === "docx" ? "Word, opens in Google Docs too" : "PDF, the same document"}</span></div>
      {st === "preparing" ? <Loader aria-hidden="true" className="rpt-spin" />
        : st === "failed" ? <button type="button" className="ovr-btn is-sm" onClick={() => void download(format)}><RotateCw aria-hidden="true" />Try again</button>
        : <button type="button" className="ovr-btn is-primary is-sm" disabled={!model} onClick={() => void download(format)} data-testid={`rpt-download-${format}`}><FileDown aria-hidden="true" />{format === "docx" ? "Download Word" : "Download PDF"}</button>}
    </div>;
  };
  return <section className="rpt-exp" data-testid="rpt-export" aria-label="Export">
    <header><div className="ovr-eyebrow">Export</div><h2>{draft ? "A draft for your own reading" : "Word and PDF, Clearway-branded"}</h2></header>
    <fieldset className="rpt-versions"><legend className="ovr-muted">Which version</legend>
      <label><input type="radio" name="rpt-version" checked={!draft} disabled={!signed} onChange={() => setVersion("signed")} data-testid="rpt-version-signed" />{signed ? `Signed off, version ${signed.n}${signed.stale ? " (the draft has changed since)" : ""}` : "Signed off (nothing is signed off yet)"}</label>
      <label><input type="radio" name="rpt-version" checked={draft} onChange={() => setVersion("draft")} data-testid="rpt-version-draft" />The draft as it stands, marked Draft</label>
    </fieldset>
    {draft && <p className="rpt-note" data-testid="rpt-draft-note"><TriangleAlert aria-hidden="true" />Not signed off yet, so every page carries a Draft mark in its header and the file name says Draft. Sign off for the clean copy.</p>}
    {(state.docx === "failed" || state.pdf === "failed") && <p className="ovr-banner is-warning" role="alert"><XCircle aria-hidden="true" /><span><strong>The file couldn’t be built.</strong> The report is safe. Nothing was changed.</span></p>}
    <div className="rpt-files">{file("docx", <FileText aria-hidden="true" />)}{file("pdf", <FileType aria-hidden="true" />)}</div>
    <p className="ovr-muted rpt-brand"><Palette aria-hidden="true" />Plus Jakarta Sans, Clearway’s colors and its document standard. Source markers stay in the app. Thin data labels and the room’s quotes stay in the document.</p>
    {model && <WordPreview model={model} />}
  </section>;
}
