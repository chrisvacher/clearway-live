"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronDown, Smartphone, ZoomIn } from "lucide-react";
import { Bold } from "@/components/tv/content-screen";
import { contentOf, depthBlocks, plainText, type DepthBlock } from "@/lib/interactions/kinds";
import { mediaUrl } from "@/lib/interactions/media";
import { imageUrl, stepImage } from "@/lib/images/shared";
import { loopIndex, loopOf } from "@/lib/images/loop";
import { serverNow } from "@/lib/live/protocol";
import "@/components/tv/images.css";
import type { PhoneStep } from "@/lib/phone/types";

export function Blocks({ blocks }: { blocks: DepthBlock[] }) {
  return <>{blocks.map((block, i) => block.kind === "text" ? <p key={i} className="ph-text ph-depth">{block.text}</p>
    : block.kind === "quote" ? <blockquote key={i} className="ph-quote"><p>{block.text}</p>{block.source && <p className="ph-source">{block.source}</p>}</blockquote>
    : <details key={i} className="ph-section"><summary>{block.title}<ChevronDown size={18} aria-hidden="true" /></summary><Blocks blocks={block.blocks} /></details>)}</>;
}

// Content screens on the phone: never empty. The phone carries the depth, the passage
// to read, or one line about what happens next.
export function PhoneContent({ engagement, step, startedAt = null }: { engagement: string; step: PhoneStep; startedAt?: string | null }) {
  const o = contentOf(step.options);
  switch (o.screen) {
    case "loop": {
      const loop = loopOf(step.options);
      return <div className="ph-content ph-still">
        {loop && <PhoneLoop engagement={engagement} images={loop.images} seconds={loop.seconds} startedAt={startedAt} />}
        <p className="ph-muted">{step.phone_depth.trim() || "Watch the screen. Your phone will wake when we start."}</p></div>;
    }
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
      const image = stepImage(step.options), src = image ? imageUrl(engagement, image.id, "phone") : o.media ? mediaUrl(engagement, o.media, "phone") : null;
      // An Image step shows its title once the facilitator has typed one (the greyed "Image 1" is only for the run of show).
      return <div className="ph-content">
        {image && !(step.options as { untitled?: boolean } | undefined)?.untitled && <h1 className="ph-headline">{step.title}</h1>}
        {src ? <div className="ph-zoom"><Image unoptimized src={src} alt={plainText(step.prompt) || step.title} width={1200} height={1600} /></div> : null}
        <p className="ph-note"><ZoomIn size={16} aria-hidden="true" />Pinch to zoom.</p>
        {step.phone_depth && <Blocks blocks={depthBlocks(step.phone_depth)} />}
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

// An image loop on the phone (LP-1): the image the TV shows now, from the room's clock and the moment the screen went up.
// The new image fades in over the old one, so the phone is never blank between them.
export function PhoneLoop({ engagement, images, seconds, startedAt, join = false }: { engagement: string; images: string[]; seconds: number; startedAt: string | null; join?: boolean }) {
  const [now, setNow] = useState(() => serverNow());
  const index = loopIndex({ images, seconds, startedAt }, now), id = images[index] ?? images[0];
  const [shown, setShown] = useState<{ prev: string | null; cur: string }>({ prev: null, cur: id });
  if (id && id !== shown.cur) setShown({ prev: shown.cur, cur: id });
  useEffect(() => {
    if (images.length < 2 || !seconds) return;
    const period = seconds * 1000, started = startedAt ? Date.parse(startedAt) : serverNow();
    const wait = period - ((serverNow() - started) % period + period) % period;
    const timer = setTimeout(() => setNow(serverNow()), Math.max(50, wait + 20));
    return () => clearTimeout(timer);
  }, [images.length, seconds, startedAt, now]);
  if (!id) return null;
  const src = (image: string) => join ? `/api/images/${engagement}/${image}?surface=join` : imageUrl(engagement, image, "phone");
  return <figure className="ph-loop" data-phone-loop={index}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {shown.prev && <img key={`p:${shown.prev}`} className="ph-loop-img is-under" src={src(shown.prev)} alt="" />}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img key={`c:${shown.cur}`} className={`ph-loop-img${shown.prev ? " is-new" : ""}`} src={src(shown.cur)} alt="" onAnimationEnd={() => setShown(v => v.prev ? { prev: null, cur: v.cur } : v)} />
  </figure>;
}

// An image on any other step: under the step's phone content, with pinch to zoom (TC-3). The Image screen and the loop draw their own.
export function PhoneStepImage({ engagement, step }: { engagement: string; step: PhoneStep }) {
  const image = stepImage(step.options);
  if (!image || (step.interaction === "content" && ["image", "loop"].includes(contentOf(step.options).screen))) return null;
  return <figure className="ph-step-image">
    <div className="ph-zoom"><Image unoptimized src={imageUrl(engagement, image.id, "phone")} alt="" width={1200} height={675} /></div>
    <figcaption className="ph-note"><ZoomIn size={16} aria-hidden="true" />Pinch to zoom.</figcaption>
  </figure>;
}
