"use client";
import "./discover.css";
import { Lock } from "lucide-react";
import Link from "next/link";
import type { DiscoverState } from "@/lib/discover/types";
import { Findings, SurveyTotal } from "./findings";
import { NotesUpload } from "./notes-upload";
import { ThemeList } from "./theme-list";
import { useDiscover } from "./use-discover";

// The Discover page for one engagement (SET-06 and the survey findings form). Facilitators only.
export function Discover({ engagement, title, initial, closed }: { engagement: string; title: string; initial: DiscoverState; closed: boolean }) {
  const { state, refresh, send } = useDiscover(engagement, initial);
  return <main id="main" className="dsc">
    <header className="dsc-head"><span className="dsc-private"><Lock aria-hidden="true" />Only you see this</span><h1>Discover</h1><span className="dsc-muted">{title}</span>
      <nav className="dsc-links" aria-label="Setup"><Link href={`/setup/${engagement}`}>Edit engagement</Link><Link href={`/setup/${engagement}/run-of-show`}>Edit run of show</Link></nav></header>
    {closed ? <p className="dsc-empty" role="status">This engagement is closed. Discover is read only.</p> : null}
    <section className="dsc-part" aria-labelledby="dsc-survey"><h2 id="dsc-survey">Survey findings</h2>
      <p>The congregational survey runs in Team Hub. Add the report&apos;s key findings here, one at a time, as the report gives them. Each one becomes a theme.</p>
      <SurveyTotal total={state.survey_respondents} send={send} closed={closed} />
      <Findings findings={state.findings} total={state.survey_respondents} send={send} closed={closed} />
    </section>
    <section className="dsc-part" aria-labelledby="dsc-notes"><h2 id="dsc-notes">Interviews and input conversations</h2>
      <p>Add notes or transcripts from leadership interviews and from board and staff input conversations. The person is kept for the record only.</p>
      <NotesUpload engagement={engagement} notes={state.notes} send={send} refresh={refresh} closed={closed} />
    </section>
    <section className="dsc-part" aria-labelledby="dsc-themes"><h2 id="dsc-themes">Themes</h2>
      <ThemeList themes={state.themes} />
    </section>
  </main>;
}
