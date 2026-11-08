import { DRAFT_MARK, FIRM, type Block, type ReportModel } from "@/lib/export/report-model";

// A few pages of the Word file, drawn in HTML from the same document model (AFT-01 WordPreview): the cover, the first section, and the first page with a
// table. Each page is laid out at Letter size and scaled down, so line breaks and proportions match the file. Nothing here is a source marker: the model has none.
const PAGE_W = 612, PAGE_H = 792, SCALE = 0.34;

function BlockHtml({ b }: { b: Block }) {
  switch (b.type) {
    case "paragraph": return <p className="p">{b.text}</p>;
    case "quote": return <div className="qb">{`“${b.text}”`}</div>;
    case "callout": return <div className="co"><span>{b.label}</span>{b.text}</div>;
    case "subheading": return <h3>{b.text}</h3>;
    case "list": return <ul>{b.items.map((t, i) => <li key={i}>{t}</li>)}</ul>;
    case "card": return <div><h3>{b.title}</h3>{b.lines.map((l, i) => <div key={i} className="cr"><span>{l.label}</span><div>{l.text}{l.meta ? <small>{l.meta}</small> : null}</div></div>)}</div>;
    case "table": return <table><thead><tr>{b.columns.map((c, i) => <th key={i} style={{ width: `${b.widths[i] / 93.6}%` }}>{c}</th>)}</tr></thead>
      <tbody>{b.rows.map((r, n) => <tr key={n}>{b.columns.map((_, i) => <td key={i}>{(r[i] ?? "").split("\n").map((t, k) => <div key={k}>{t}</div>)}</td>)}</tr>)}</tbody></table>;
  }
}

export function WordPreview({ model }: { model: ReportModel }) {
  const first = model.sections[0], table = model.sections.find(s => s.blocks.some(b => b.type === "table" || b.type === "card"));
  const pages = [first, table && table !== first ? table : model.sections[3]].filter((s, i, a): s is NonNullable<typeof s> => !!s && a.indexOf(s) === i);
  const frame = (label: string, children: React.ReactNode, key: string) => <figure key={key}>
    <div className="rpt-pvbox" style={{ width: PAGE_W * SCALE, height: PAGE_H * SCALE }}><div className="rpt-pg" style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${SCALE})` }}>
      {model.draft && <div className="dr">{DRAFT_MARK.toUpperCase()}</div>}{children}</div></div><figcaption>{label}</figcaption></figure>;
  return <div className="rpt-pv" data-testid="rpt-preview" aria-label="A preview of the Word file">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {frame("Cover", <div className="cv"><img src="/marks/clearway-solid.svg" alt="" width="30" height="30" /><div className="br">CLEARWAY CHURCH SOLUTIONS</div><div className="t1">{model.church}</div><div className="t2">{model.title}</div>
      {model.dates && <div className="dt">{model.dates}</div>}<div className="bar" /><div className="pb">{model.preparedBy}</div>{model.draft && <div className="pb">{DRAFT_MARK}. This report has not been signed off.</div>}</div>, "cover")}
    {pages.map(s => frame(s.heading, <><div className="ey">{s.eyebrow}</div><h2>{s.heading}</h2>{s.blocks.slice(0, 6).map((b, i) => <BlockHtml key={i} b={b} />)}<div className="ft"><span>{FIRM}</span></div></>, s.key))}
  </div>;
}
