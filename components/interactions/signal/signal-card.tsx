"use client";
import { CircleCheck, CircleDashed, Split, VolumeX, type LucideIcon } from "lucide-react";
import { signalKinds, type SignalCardData, type SignalKind } from "@/lib/interactions/signal";

const icons: Record<SignalKind, LucideIcon> = { aligned: CircleCheck, divergent: Split, silent: VolumeX, thin: CircleDashed };
export function SignalDisc({ kind }: { kind: SignalKind }) {
  const Icon = icons[kind];
  return <span className="cwl-signal-disc" aria-hidden="true"><Icon className="cwl-icon" /></span>;
}

// One card in the list: the kind, the line, and what it rests on in a few words. Tap it for the evidence.
export function SignalCard({ card, arriving, leaving, onOpen }: { card: SignalCardData; arriving: boolean; leaving: boolean; onOpen: () => void }) {
  return <li className={`cwl-sg-item${arriving ? " is-arriving" : ""}${leaving ? " is-leaving" : ""}`} data-signal={card.kind} data-signal-id={card.id}>
    <button type="button" className={`cwl-signal cwl-sg-card is-${card.kind}`} onClick={onOpen} aria-label={`${signalKinds[card.kind].label}: ${card.title}. Open the evidence`} disabled={leaving}>
      <SignalDisc kind={card.kind} />
      <span className="b"><span className="k">{signalKinds[card.kind].label}</span><span className="cwl-signal-title">{card.title}</span><span className="ln">{card.line}</span>
        {card.saved && <span className="sv"><CircleCheck className="cwl-icon" aria-hidden="true" />Saved as a citation</span>}
        {card.on_tv && <span className="sv">Question is on the TV</span>}</span>
    </button>
  </li>;
}
