"use client";
import { ChevronDown, Smartphone } from "lucide-react";
import { Bold } from "@/components/tv/content-screen";
import { contentOf, depthBlocks, plainText, type DepthBlock } from "@/lib/interactions/kinds";
import type { PhoneStep } from "@/lib/phone/types";

export function Blocks({ blocks }: { blocks: DepthBlock[] }) {
  return <>{blocks.map((block, i) => block.kind === "text" ? <p key={i} className="ph-text ph-depth">{block.text}</p>
    : block.kind === "quote" ? <blockquote key={i} className="ph-quote"><p>{block.text}</p>{block.source && <p className="ph-source">{block.source}</p>}</blockquote>
    : <details key={i} className="ph-section"><summary>{block.title}<ChevronDown size={18} aria-hidden="true" /></summary><Blocks blocks={block.blocks} /></details>)}</>;
}

// Content screens on the phone: never empty. The phone carries the depth, the passage
// to read, or one line about what happens next. Slide images are for the TV only (November 19): a phone never draws one
// and never asks for one, so an Image step shows its title and phone words, and a loop shows the waiting message alone.
export function PhoneContent({ step }: { step: PhoneStep }) {
  const o = contentOf(step.options);
  switch (o.screen) {
    case "loop":
      return <div className="ph-content ph-still">
        <p className="ph-muted">{step.phone_depth.trim() || "Watch the screen. Your phone will wake when we start."}</p></div>;
    case "scripture":
      return <div className="ph-content ph-scripture">
        <p className="ph-passage"><Bold text={step.prompt} /></p>
        {(o.reference || o.translation) && <div>{o.reference && <p className="ph-headline ph-reference">{o.reference}</p>}{o.translation && <p className="ph-source">{o.translation}</p>}</div>}
        {step.phone_depth && <Blocks blocks={depthBlocks(step.phone_depth)} />}
      </div>;
    case "prayer":
      return <div className="ph-content ph-still"><p className="ph-down"><Smartphone size={20} aria-hidden="true" />Phones away</p>
        <p className="ph-muted">{step.phone_depth.trim() || "We’re praying together. Your phone will wake when we’re back."}</p></div>;
    case "image": {
      // The title once the facilitator has typed one (the greyed "Image 1" is only for the run of show), and the phone words.
      const title = !(step.options as { untitled?: boolean } | undefined)?.untitled && step.title.trim(), depth = step.phone_depth.trim();
      return <div className="ph-content">
        {title && <h1 className="ph-headline">{step.title}</h1>}
        {depth ? <Blocks blocks={depthBlocks(step.phone_depth)} /> : !title && <p className="ph-muted">Watch the screen.</p>}
      </div>;
    }
    case "screen_check":
      return <div className="ph-content"><h1 className="ph-headline">If the screen looks wrong</h1>
        {[["A Lime corner is cut off", "The TV is overscanning. In its picture settings choose Just Scan, Screen Fit, 1:1 or Full pixel."],
          ["The circle looks oval", "Set the computer’s display to 1920 by 1080, and the TV’s aspect to 16:9 or Original."],
          ["Text looks blurry", "Mirror at 1080p, not 4K scaled. On a Mac, choose 1080p in Displays."]].map(([title, body]) =>
          <details key={title} className="ph-section"><summary>{title}<ChevronDown size={18} aria-hidden="true" /></summary><p className="ph-text">{body}</p></details>)}
      </div>;
    case "holding":
      return <div className="ph-content ph-still"><h1 className="ph-headline">You’re in</h1>
        <p className="ph-muted">{o.line || step.phone_depth.trim() || "Your phone will wake when we start."}</p></div>;
    default:
      return <div className="ph-content">
        <h1 className="ph-headline">{o.number ? `${o.number} ` : ""}{plainText(step.prompt)}</h1>
        {o.source && <p className="ph-source">{o.source}</p>}
        {step.phone_depth && <Blocks blocks={depthBlocks(step.phone_depth)} />}
      </div>;
  }
}
// Waiting screens: prayer and holding carry the offset pattern like waiting phones.
export const phoneContentWaits = (step: PhoneStep | null) => Boolean(step && step.interaction === "content" && ["prayer", "holding", "loop"].includes(contentOf(step.options).screen));
