"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Plus, Radio, Search } from "lucide-react";
import type { Skin } from "@/lib/brand";
import { StageChip } from "@/components/ui/chips";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Menu } from "@/components/ui/menu";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { CopyRoomLink, engagementRequest, useEventMenu } from "./engagement-actions";
import { groupNames, typeName, type ListGroup } from "@/lib/setup/listing";
import type { Stage } from "@/lib/setup/stage";

type Bucket = ListGroup | "archived";
export type EngagementTableRow = {
  id: string; title: string; church: string; type: string; place: string | null; skin: Skin; brand: string;
  group: Bucket; stage: Stage; stageNote: string; date: { month: string; day: string; weekday: string } | null;
  soon: boolean; host: string; origin: string; code: string;
};
const groups = { ...groupNames, archived: "Archived" };
const kinds = [
  { id: "", label: "All kinds" }, { id: "team_workshop", label: "Workshop" },
  { id: "wayfinding", label: "Wayfinding" }, { id: "day_and_a_half", label: "Day and a half" },
];
const brands = [{ id: "", label: "All brands" }, { id: "clearway", label: "Clearway" }, { id: "novetera", label: "Novetera" }];
const columns = [
  { id: "date", label: "Date", className: "eng-col-date" }, { id: "event", label: "Event" },
  { id: "stage", label: "Stage", className: "eng-col-stage" }, { id: "link", label: "Room link", className: "eng-col-link" },
  { id: "actions", label: "Actions", align: "end" as const, className: "eng-col-actions" },
];

function actionFor(row: EngagementTableRow) {
  if (row.stage === "done" || row.stage === "closed" || (row.group === "past" && !["setup", "ready", "live", "retreat"].includes(row.stage))) {
    return <Button size="small" href={`/control/${row.id}/recap`}>See results</Button>;
  }
  if (["ready", "live", "retreat"].includes(row.stage)) {
    return <Button size="small" variant="primary" href={`/control/${row.id}`}><Radio aria-hidden="true" />Open the live room</Button>;
  }
  return <Button size="small" href={`/admin/${row.id}`}>{row.stage === "setup" ? "Continue setup" : "Open overview"}</Button>;
}

export function EngagementsTable({ rows, archiveAvailable, canCreate, canDuplicate, unavailable }: {
  rows: EngagementTableRow[]; archiveAvailable: boolean; canCreate: boolean; canDuplicate: boolean; unavailable: boolean;
}) {
  const router = useRouter(), toast = useToast();
  const eventMenu = useEventMenu(canDuplicate);
  const [query, setQuery] = useState(""), [kind, setKind] = useState(""), [brand, setBrand] = useState("");
  const [tab, setTab] = useState<Bucket>("upcoming");
  const [archive, setArchive] = useState<EngagementTableRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState("");
  const filtered = rows.filter(row => (!kind || row.type === kind) && (!brand || row.skin === brand)
    && `${row.title} ${row.church}`.toLowerCase().includes(query.trim().toLowerCase()));
  const tabs = (Object.keys(groups) as Bucket[]).filter(id => id !== "archived" || archiveAvailable).map(id => ({
    id, label: groups[id], count: filtered.filter(row => row.group === id).length,
  }));

  async function changeArchive(row: EngagementTableRow, restore: boolean) {
    if (busy) return;
    setBusy(row.id);
    setError("");
    try {
      await engagementRequest({ action: restore ? "restore" : "archive", id: row.id });
      setArchive(null);
      toast(restore ? "Engagement restored" : "Engagement archived");
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "We couldn't finish that.";
      setError(message);
      if (restore) toast(message);
    } finally {
      setBusy(null);
    }
  }

  const create = canCreate && <Button variant="primary" href="/admin/new"><Plus aria-hidden="true" />New engagement</Button>;
  const tableRows = (group: Bucket) => filtered.filter(row => row.group === group).map(row => ({
    id: row.id,
    className: row.soon ? "eng-row is-soon" : "eng-row",
    cells: {
      date: row.date ? <div className="eng-date"><span>{row.date.month}</span><strong>{row.date.day}</strong><small>{row.date.weekday}</small></div>
        : <div className="eng-date is-undated">No date</div>,
      event: <div className="eng-event"><div><strong>{row.title}</strong><span className="eng-brand" data-testid="brand-label">{row.brand}</span></div>
        <p>{[row.church, typeName(row.type), row.place].filter(Boolean).join(" · ")}</p></div>,
      stage: <div className="eng-stage"><StageChip stage={row.stage} /><small>{row.stageNote}</small></div>,
      link: <div className="eng-room-link"><a href={`${row.origin}/${row.code}`}><span>{row.host}/</span><strong>{row.code}</strong></a>
        <CopyRoomLink href={`${row.origin}/${row.code}`} label={`${row.host}/${row.code}`} /></div>,
      actions: <div className="eng-row-actions">
        {group === "archived" ? <Button size="small" disabled={busy === row.id} onClick={() => void changeArchive(row, true)}>Restore</Button> : actionFor(row)}
        <Menu items={[
          { href: `/admin/${row.id}`, label: "Overview" },
          { href: `/admin/${row.id}/run-of-show`, label: "Run of show" },
          { href: `/admin/${row.id}/joining`, label: "People" },
          { href: `/control/${row.id}/recap`, label: "Results" },
          ...eventMenu.actions(row),
          ...(archiveAvailable && row.type !== "practice" && group !== "archived"
            ? [{ label: "Archive", danger: true, dividerBefore: true, onSelect: () => { setError(""); setArchive(row); } }] : []),
        ]} />
      </div>,
    },
  }));

  function filterMenu(label: string, filter: string, options: typeof kinds, select: (id: string) => void) {
    return <Menu className="eng-filter" label={label} trigger={<>{options.find(option => option.id === filter)?.label}<ChevronDown aria-hidden="true" /></>}
      items={options.map(option => ({ label: option.label, onSelect: () => select(option.id) }))} />;
  }

  return <>
    <PageHeader title="Engagements" lead="Every event Clearway runs on Live, newest first."
      secondary={<label className="eng-search"><Search aria-hidden="true" /><input type="search" aria-label="Search churches and events" placeholder="Search churches and events" value={query} onChange={event => setQuery(event.target.value)} /></label>}
      primary={create} />
    {unavailable ? <section className="admin-panel" role="status"><h2>Engagements unavailable</h2><p>We couldn’t load your engagements. Please try again.</p><Button href="/admin">Try again</Button></section> : <>
      <div className="eng-table-tabs">
        <Tabs label="Engagements by date" items={tabs} value={tab} onChange={id => setTab(id as Bucket)} />
        <div className="eng-filters">{filterMenu("Kind", kind, kinds, setKind)}{filterMenu("Brand", brand, brands, setBrand)}</div>
      </div>
      {tabs.map(({ id, label }) => <TabPanel key={id} id={id} active={id === tab}>
        {id === tab && <DataTable label={`${label} engagements`} columns={columns} rows={tableRows(id)} empty={<div className="eng-empty">
          <h2>{query || kind || brand ? "No matching engagements" : id === "undated" ? "No undated engagements" : `No ${label.toLowerCase()} engagements`}</h2>
          {canCreate && <Button href="/admin/new"><Plus aria-hidden="true" />New engagement</Button>}
        </div>} />}
      </TabPanel>)}
    </>}
    {archive && <ConfirmDialog open title={`Archive ${archive.title}?`} confirmLabel="Archive"
      description={<><p>It leaves Engagements. Answers and results are kept, and you can restore it from Archived.</p>{error && <p role="alert">{error}</p>}</>}
      onCancel={() => setArchive(null)} onConfirm={() => void changeArchive(archive, false)} busy={Boolean(busy)} />}
    {eventMenu.templateDialog}
  </>;
}
