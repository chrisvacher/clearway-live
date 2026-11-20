"use client";
import { useState } from "react";
import { Eye, EyeOff, Sun, SunDim, X } from "lucide-react";
import type { Room } from "./live-controls";
import type { ControlItem } from "@/lib/control/types";
import { responsesView } from "@/lib/control/responses";
import { useToast } from "@/components/ui/toast";
import { formatPlannedTime } from "./planned-time";
import { PrivateTag } from "@/components/interactions/private-tag";
import { isPrivateStep } from "@/lib/interactions/visibility";

// Hide a response (MD-1): the live step's free-text responses, with All and Hidden. Tap a response, then Hide from the TV or
// Cancel; Spotlight stays beside them. A hidden response is struck through with who hid it and when, and Show again puts it
// back everywhere. Only the facilitators see this list. Answers stay anonymous here: no names.
export function ResponsesList({ room, onClose, title = "Responses" }: { room: Room; onClose?: () => void; title?: string }) {
  const items = room.status?.items ?? [], spot = room.frame?.state.spotlight_key, busy = Boolean(room.pending);
  const kind = room.frame?.session?.interaction, zone = room.show.context.timezone, hiddenStep = isPrivateStep(room.frame?.session);
  const [filter, setFilter] = useState<"all" | "hidden">("all"), [picked, setPicked] = useState<string | null>(null);
  const { shown, hidden: hiddenCount, list } = responsesView(items, filter);
  const toast = useToast();
  const press = async (action: "hide" | "unhide" | "spotlight", item: ControlItem) => {
    const result = await room.press(action, { item: item.key });
    if (result.status === "ok") {
      setPicked(null);
      if (action === "hide") toast("Response hidden", {
        icon: <EyeOff size={16} aria-hidden="true" />,
        action: { label: "Show again", icon: <Eye size={14} aria-hidden="true" />, onClick: async () => {
          await room.press("unhide", { item: item.key });
        } },
      });
    }
    return result;
  };
  return <section className="ctl-items ctl-responses" aria-labelledby="ctl-responses-title" data-responses>
    <div className="ctl-row is-between"><h2 id="ctl-responses-title">{title}</h2><PrivateTag step={room.frame?.session} />
      <span className="show-help">{shown} shown{hiddenCount ? ` · ${hiddenCount} hidden` : ""}</span>
      {onClose && <button className="show-button is-icon" aria-label="Close responses" onClick={onClose}><X size={20} aria-hidden="true" /></button>}</div>
    <div className="ctl-responses-filter" role="tablist" aria-label="Which responses">
      <button type="button" role="tab" aria-selected={filter === "all"} className={filter === "all" ? "is-on" : ""} onClick={() => setFilter("all")}>All</button>
      <button type="button" role="tab" aria-selected={filter === "hidden"} className={filter === "hidden" ? "is-on" : ""} onClick={() => setFilter("hidden")}>Hidden ({hiddenCount})</button>
    </div>
    {list.length ? <ul className="ctl-resp-list">{list.map(item => {
      const isPicked = picked === item.key && !item.hidden, isSpot = item.key === spot;
      return <li key={item.key} className={`ctl-resp${item.hidden ? " is-hidden" : ""}${isPicked ? " is-picked" : ""}${isSpot ? " is-spot" : ""}`} data-response={item.key}>
        {item.hidden
          ? <span className="ctl-resp-text">{item.text}</span>
          : <button type="button" className="ctl-resp-text" aria-expanded={isPicked} onClick={() => setPicked(isPicked ? null : item.key)}>{item.text}{kind === "word_cloud" && item.count > 1 && <small> · {item.count}</small>}</button>}
        {item.hidden && <span className="ctl-resp-tag"><EyeOff size={13} aria-hidden="true" />Hidden</span>}
        {isSpot && !item.hidden && <span className="ctl-resp-tag is-spot"><Sun size={13} aria-hidden="true" />Spotlit</span>}
        {item.hidden && <span className="ctl-resp-who">{item.hidden_by ? `Hidden by ${item.hidden_by}` : "Hidden"}{item.hidden_at ? ` at ${formatPlannedTime(item.hidden_at, zone)}` : ""}</span>}
        {item.hidden && <div className="ctl-resp-act"><button type="button" className="show-button is-small" disabled={busy} onClick={() => void press("unhide", item)}><Eye size={16} aria-hidden="true" />Show again</button></div>}
        {isPicked && <div className="ctl-resp-act">
          <button type="button" className="show-button is-small is-primary" disabled={busy} onClick={() => void press("hide", item)}><EyeOff size={16} aria-hidden="true" />Hide from the TV</button>
          {hiddenStep ? null : isSpot ? <button type="button" className="show-button is-small" disabled={busy} onClick={() => void room.press("clear_spotlight").then(r => { if (r.status === "ok") setPicked(null); })}><SunDim size={16} aria-hidden="true" />Clear spotlight</button>
            : <button type="button" className="show-button is-small" disabled={busy} onClick={() => void press("spotlight", item).then(r => { if (r.status === "ok") onClose?.(); })}><Sun size={16} aria-hidden="true" />Spotlight</button>}
          <button type="button" className="show-button is-small" disabled={busy} onClick={() => setPicked(null)}>Cancel</button>
        </div>}
      </li>;
    })}</ul> : <p className="show-empty">{filter === "hidden" ? "Nothing is hidden." : "Nothing on the TV yet."}</p>}
    {hiddenStep ? <p className="show-help">Only the facilitators see these answers. The TV and phones show how many have answered, never the answers.</p>
    : <p className="show-help">Tap a response, then Hide. A hidden response leaves the TV, the counts, AI grouping and the report. The person who wrote it still sees it on their phone.</p>}
  </section>;
}
