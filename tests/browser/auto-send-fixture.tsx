import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ChoiceInput, PointsInput, RankingInput, ScaleInput, StatementsInput } from "../../components/interactions/bars/phone-bars";
import { GridInput } from "../../components/interactions/grid-form-sign/grid-input";
import type { PhoneInputProps } from "../../components/interactions/phone-inputs";
import type { PhoneStep } from "../../lib/phone/types";

declare global { interface Window { autoLog: { text: string; value?: unknown }[] } }
window.autoLog = [];
const items = [{ key: "o1", text: "First" }, { key: "o2", text: "Second" }, { key: "o3", text: "Third" }];
function Fixture() {
  const [kind, setKind] = useState("choice"), [mine, setMine] = useState<PhoneInputProps["mine"]>([]);
  const change = (kind: string) => { setKind(kind); setMine([]); window.autoLog = []; };
  const interaction = kind === "multiple" ? "choice" : kind === "slider" ? "scale" : kind;
  const step: PhoneStep = { id: kind, title: "A question", interaction: interaction as PhoneStep["interaction"], part: "Day 1", segment: "", state: "live", prompt: "A question", phone_depth: "", max_sends: 1, max_characters: 280, max_words: 50, closed_at: null, options: { items, multiple: kind === "multiple", max: kind === "slider" ? 10 : 5, low: "Low", high: "High" } };
  const send: PhoneInputProps["send"] = answer => { window.autoLog.push(answer); setMine([{ ...answer, id: String(window.autoLog.length), revision: 0, withdrawn: false, status: "sent" }]); };
  const Input = ({ choice: ChoiceInput, scale: ScaleInput, ranking: RankingInput, points: PointsInput, statements: StatementsInput, grid: GridInput } as Record<string, typeof ChoiceInput>)[interaction];
  return <div data-surface="phone" data-theme="light" data-skin={new URLSearchParams(location.search).get("skin") || "clearway"}>
    <select aria-label="Interaction" value={kind} onChange={e => change(e.target.value)}>{["choice", "multiple", "ranking", "points", "statements", "scale", "slider", "grid"].map(k => <option key={k}>{k}</option>)}</select>
    <Input key={kind} step={step} mine={mine} open send={send} change={(_id, answer) => send(answer)} withdraw={id => { window.autoLog.push({ text: `withdraw ${id}` }); setMine([]); }} />
  </div>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
