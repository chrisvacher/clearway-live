import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFacilitator } from "@/lib/server/facilitator";
import { uuid } from "@/lib/room/identity";
import { readShow } from "@/lib/run-of-show/server";
import { fillYears } from "@/lib/run-of-show/policy";
import { parts } from "@/lib/run-of-show/types";
import { PrintButton } from "@/components/run-of-show/print-button";

export const metadata = { title: "Print run of show", robots: { index: false, follow: false } };
export default async function PrintShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) notFound();
  const { client } = await requireFacilitator(); const show = await readShow(client, id); if (!show) notFound();
  const { context, sessions } = show;
  const date = (v: string | null) => v ? new Intl.DateTimeFormat("en-CA", { timeZone: context.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(v)) : "Unscheduled";
  return <main id="main" className="show-print">
    <div className="show-print-actions"><Link className="show-button" href={`/setup/${id}/run-of-show`}>Return to run of show</Link><PrintButton /></div>
    <p className="show-eyebrow">{context.church} · Clearway</p><h1>{context.title}</h1><h2>Run of show</h2>
    <p className="show-muted">Only facilitators see these notes. Times in {context.timezone}.</p>
    <p className="show-muted">Room link: https://live.clearway.co/room/{id}</p>
    {parts.map(part => {
      const group = sessions.filter(s => s.part === part); if (!group.length) return null;
      return <section key={part}><h2>{part}</h2><table><thead><tr><th scope="col">Time</th><th scope="col">Session</th><th scope="col">Prompt and phone depth</th><th scope="col">Presenter notes</th></tr></thead><tbody>{group.map(s => <tr key={s.id}>
        <td>{date(s.planned_start)}<div>{s.planned_minutes} min</div></td>
        <td><strong>{s.title}</strong><div>{s.interaction === "word_cloud" ? "Word cloud" : s.interaction === "wall" ? "Open text wall" : "Content"} · {s.mode === "live" ? "Live" : "Self-paced"} · {s.state.replaceAll("_", " ")}</div>
          <div>{s.settings.burst_minutes}-minute burst · {s.max_sends} answers · {s.max_characters} characters · {s.max_words} words</div>
          {s.mode === "self_paced" && <div>Opens {date(s.opens_at)}. Closes {date(s.closes_at)}.</div>}{s.lands_in && <div>Lands in: {s.lands_in}</div>}</td>
        <td><p>{fillYears(s.prompt, context.base_year)}</p>{s.phone_depth && <><strong>Phone depth</strong><p>{fillYears(s.phone_depth, context.base_year)}</p></>}</td>
        <td><p>{s.notes}</p></td>
      </tr>)}</tbody></table></section>;
    })}
    {!sessions.length && <p>Add sessions before printing your run of show.</p>}
    <section className="show-fallback"><h2>If the tech fails</h2><p>The easel carries the room. Ask each prompt aloud and capture answers on sticky notes.</p></section>
  </main>;
}
