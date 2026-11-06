import { Clipboard, MessageSquareText, Columns4 } from "lucide-react";
import { restsOnLabel } from "@/lib/discover/thin";
import { strength } from "@/lib/discover/strength";
import type { Theme } from "@/lib/discover/types";
import { StrongMark, ThinFlag } from "./thin-flag";

const sourceLabel = { survey: "Survey", conversations: "Interviews and conversations", four_lists: "Four Helpful Lists" } as const;
const sourceIcon = { survey: Clipboard, conversations: MessageSquareText, four_lists: Columns4 } as const;

// ThemeList and DiscoverTheme (design pass 6). Themes with what each rests on, a thin or strong mark and its source.
// Survey themes appear as findings are saved. Themes from notes and the Four Helpful Lists have their own step.
export function ThemeList({ themes }: { themes: Theme[] }) {
  const shown = themes.filter(t => t.status !== "rejected" && !t.merged_into);
  if (!shown.length) return <p className="dsc-empty" role="status">No themes yet. Each survey finding you save becomes a theme here.</p>;
  return <ul className="dsc-list" aria-label="Themes">{shown.map(t => {
    const counts = { source: t.source, restsOn: t.rests_on, outOf: t.out_of }, s = strength(counts), Icon = sourceIcon[t.source];
    return <li key={t.id} className={`dsc-theme${t.status === "accepted" ? " is-accepted" : ""}`}>
      <div className="top"><b className="label">{t.label}</b><span className="rest"><b>{t.rests_on}</b><span>{restsOnLabel(counts).replace(/^\d+\s?/, "") || "respondents"}</span></span></div>
      {t.detail ? <span className="dsc-muted">{t.detail}</span> : null}
      <div className="marks"><span className="dsc-chip"><Icon aria-hidden="true" />{sourceLabel[t.source]}</span>
        <span className="dsc-chip">{t.status === "accepted" ? "Accepted" : "Draft"}</span>
        {s.thin ? <ThinFlag reason={s.thinReason} /> : s.strong ? <StrongMark /> : null}</div>
    </li>;
  })}</ul>;
}
