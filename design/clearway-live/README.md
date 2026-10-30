Clearway Live is the design system for the TV or projector and the phone screens of the Clearway live app at live.clearway.co, Clearway's live facilitation platform, built first for Wayfinding retreats. A facilitator runs sessions from a private control surface, a TV or projector shows the room's input landing and moving live, and each participant answers on their own phone.

It is a small layer on top of the **Clearway Design System** (https://claude.ai/artifact/HWe33WYnnbNRusJmQ8LZTA), not a copy of it. Requirements come from the PRD (https://claude.ai/artifact/3z9EoQKarV6LxuR1JSRLBy): "The non-negotiable: the screen is alive", "Three surfaces, one room", "Words in the app" and "Design system".

## How this layer relates to the base

- Take colors, Plus Jakarta Sans, the 4px spacing grid, radii, shadows, logos, Lucide icons and content rules from the base. Never change a base value here.
- This layer holds only what the live screens add. Never edit the Clearway Design System to make room for it. The live-only rules (Sunrise, the mark as texture, Lime as "live") stay out of the base.
- Every token has a semantic name mapped to a base value (or to one of the two live-only colors). No component uses a raw hex value.
- Scope is the TV and phone screens. The facilitator's control surface and setup screens are out of scope, except the facilitator-only tokens below.

## Files

| File | What it is |
| --- | --- |
| `live_tokens.css` | The token file Codex generates the app's styles from. Load it after the base `colors_and_type.css`. It reads `--cw-*` base values (with the base value only as a fallback) and adds `--cwl-*` tokens. |
| `tokens.json` | The same tokens for this page, generated from the same source. |
| `components/bundle.css` | Component styles, written only in tokens. |
| `components/bundle.js` | `window.ClearwayLive`: the traced mark, textures, the TV stage, FLIP motion, the arrival flow, word sizing, counts and the preview scaffold. |
| `components/<Name>/` | A guideline and a live preview for each component, foundation card and motion prototype. |
| `assets/Marks/` | The solid mark and the derived outline mark as single-ink SVGs. |
| `fonts/` | Plus Jakarta Sans 300 to 700, copied byte for byte from the base. |

Set three attributes on each screen's root: `data-surface="tv|phone|control"`, `data-theme="dark|light"` and `data-motion="full|reduced"` (phones follow the system setting when absent; the TV has its own setting). The TV renders a 1920x1080 stage scaled uniformly to its screen, so every TV size here is a design pixel at 1080p.

## Content fundamentals

App copy follows the base voice: calm, clear, decisive, plain. On these screens:

- Sentence case, plain words, contractions. "You're in", "Saved on this phone", "Nothing live right now".
- Buttons start with a verb: "Send", "Send me a sign-in code", "Ask", "Confirm". The base button style sets them in uppercase with 0.05em tracking; write them in sentence case in the source.
- No em dashes or en dashes anywhere in app copy, prompts or exports. A spaced hyphen is the only dash, and rarely.
- Write horizons exactly: **10-year Future**, **3-year Vision**, **1-year Outlook**. Never "Ten-year future", "three-year vision" or "3-year Outlook".
- Use Clearway's words: Vision Outcomes (not pillars or roadmap), engagement (not project), churches, pastors, leaders and team (not customers, stakeholders or staff group), seasons (not quarters), measurables or indicators (not KPIs), greenhouse (never pipeline), Five Lenses (capitalized), and the church's own term for its governance body and its own names for its ministries.
- Scripture and prayer screens name the translation used.
- No instructions to read on the waiting screen. Say what happens, in one line.
- Failures are said quietly and plainly: "Reconnecting", "Offline", "Saved on this phone". Never "Error", never an alarm.

## Color

Components use `cwl-*` tokens only. The roles:

| Role | Token | Base value | Job |
| --- | --- | --- | --- |
| Royal Blue | `cwl-surface-panel`, `cwl-accent`, `cwl-bar` | Royal Blue #3F72DE | The main live brand color: headers, primary buttons, bars, highlighted panels |
| Deeper Royal (live-only) | `cwl-surface-panel-small`, `cwl-button-primary` | #3868D4 | Small text on blue: Off-White on it is 4.9:1 |
| Navy | `cwl-surface`, `cwl-text-on-card` | Navy #03294E | Every dark screen background, and text on light cards |
| Lime | `cwl-live`, `cwl-word-new` | Lime #D2FF71 | Live, confirm and active: LIVE marker, current session, confirm buttons, confirmed items, newest arrival, progress |
| Sunrise (live-only) | `cwl-callout`, `cwl-bar-leader`, `cwl-word-leader` | #FFC845 | New and live-only. Look here: a spotlit item, a key number, the leading answer |
| Sky Blue, Soft Lime, Off-White and tints | `cwl-group-1` to `cwl-group-10` | Base values and derived tints | Cards and groups on the wall, so input reads as color |
| Lens color | `cwl-lens`, `cwl-on-lens` | Royal Blue, Off-White | One color for every lens heading, the same on every surface and in the report |

**Lime always means live. Sunrise always means look here.** Each gets at most one moment per screen, they never sit side by side (keep `cwl-tv-moment-gap`, 48px, between them on the TV), and neither goes in the group palette.

- Lime priority when two would compete: Confirm > burst progress > newest arrival > LIVE marker. The lower one takes its neutral form for that moment (the LIVE marker's outline form).
- Sunrise priority: spotlight > leading answer > key number. While a spotlight is on, the leading bar and word use their normal colors.
- Send is a primary button (`cwl-button-primary`), not a confirm. "Sent" is not Lime.
- On light backgrounds, Lime and Sunrise are filled blocks with Navy text, never text or thin lines.
- On Navy: Off-White 14.0:1, Lime 12.8:1 and Sunrise 9.5:1 pass as text at any size. Royal on Navy is 3.3:1: shapes and large text only. Off-White on Royal is 4.3:1: large text only (bar values at 44px+); use Deeper Royal under small text.
- Warning and Error never appear on the TV or phones. Failures show quietly. Warning stays on the facilitator and scribe views, and Sunrise never goes there, so the two warm colors never meet.
- Every meaning also carries a label, icon or size. All text meets WCAG AA for its size: see Contrast pairs, which checks every pairing automatically, including text over the lightest pixel of each texture and the glow.

**Group palette** (up to 10, Navy text on each, always with its number and label): 1 Sky, 2 Soft Lime, 3 Off-White, 4 Sky 20% toward Navy, 5 Soft Lime 16% toward Navy, 6 gray-300, 7 Sky 50% tint, 8 gray-400, 9 Sky 25% tint, 10 Soft Lime 30% toward Navy. Every fill passes 4.5:1 with Navy text and 3:1 against the Navy wall; the closest pair for any simulated color vision is ΔE 7.4.

**Lens color:** all Five Lenses share one lens color and one heading layout: `cwl-lens` (Royal) with `cwl-on-lens` (Off-White), always 20px bold or larger. The heading and its icon tell lenses apart: Congregation (`users`), Community (`map-pin`), Leadership (`compass`), Operations (`settings`), Learning (`book-open`). See Lens heading.

## Facilitator-only tokens

These are defined for the control surface and must never be used by a TV or phone component. `live_tokens.css` declares them only under `[data-surface="control"]`; `bundle.css` sets them to `initial` on `[data-surface="tv"]` and `[data-surface="phone"]`.

- **"Only you see this"**: `cwl-fac-private-surface` panel under a 32px `cwl-fac-private-band` with `cwl-fac-private-band-text` reading "Only you see this" and Lucide `eye-off`; text `cwl-fac-private-text`.
- **Alignment signal**, each a color, an icon and a label on a white `cwl-fac-signal-card`: Aligned (`cwl-fac-signal-aligned`, base Success, `circle-check`), Divergent (`cwl-fac-signal-divergent`, base Warning, `split`), Silent (`cwl-fac-signal-silent`, base Info, `volume-x`), Thin data (`cwl-fac-signal-thin`, base gray-500, `circle-dashed`). The glyph inside each disc is `cwl-fac-signal-glyph`.

## Texture on dark screens

Dark TV and phone screens carry a still texture made from the outline Clearway mark, applied automatically by screen type.

**The exception, stated once:** the base rule is that the Clearway mark is a logo, not a texture. The live app makes one exception: on **dark TV and phone screens of live.clearway.co only**, the mark may be used as a texture. It applies nowhere else: not the control surface, setup screens, documents, the report, the website, social or any other Clearway artifact. Everywhere else the base rule stands.

### Texture by screen type

| Screen type | `data-screen` | Texture |
| --- | --- | --- |
| Join, welcome, breaks, Nothing live | `holding` | G1: oversized outline mark with glow |
| Section openers (day, lens or part title cards) | `opener` | E1: offset pattern with glow |
| Live input screens (word cloud, wall, bars, grids, tally) | `input` | B1: edge strip. Its Lime mark is the LIVE marker |
| Headline with depth, Scripture, prayer | `content` | D: glow only |
| Phones, waiting and phones down | `phone-waiting` | A1: offset pattern |
| Phones, answering | `phone-answering` | None: plain Navy |

- Set `data-screen` on each TV or phone root, or call `ClearwayLive.screenTexture(el, type)`. `TEXTURE_BY_SCREEN` in `components/bundle.js` maps each type to its texture; no screen picks its own.
- Use the outline mark throughout. The solid mark stays in Marks for reference only.
- On input screens the strip's first mark is Lime while the session is live and is the TV's LIVE marker, so the TV draws no LIVE pill there. It eases back to the strip ink while a newest arrival has its Lime moment, and is not Lime when phones are down.
- Phone screens with an input (sign-in included) and phone screens for reading depth or Scripture count as answering: plain Navy. When phones go down, a phone fades to the offset pattern over `cwl-dur-phones-dim`.
- The mark keeps its shape. It is never stretched, rotated or skewed (uniform scale only).
- It sits behind content (`.cwl-texture`, the back layer) without changing text contrast past AA, and it is still, so it never competes with motion. The one exception is the edge strip's live mark changing color.
- Ink `cwl-texture-ink` (Royal) at `cwl-tex-outline` 0.22 or `cwl-tex-strip` 0.35; the glow is `cwl-glow`, Royal at 45%, from the top right corner. Light screens carry no texture.
- The outline mark is the solid mark's own edge, traced from the base artwork, not a redrawing. The Brain's logo entry needs the outline variant added.

## Type

Plus Jakarta Sans only, from the base. TV headlines use the base's signature treatment: light 300 with a bold 700 phrase.

**TV ramp at 1920x1080** (room scale 1.0): `tv-display` 144, `tv-headline-xl` 96, `tv-headline` 64, `tv-main` 56, `tv-body` 44, `tv-floor` 36, `tv-eyebrow` 36 uppercase, `tv-upclose` 24 (up-close marks only).

- Room-readable text is at least 36px; main content 44 to 56px; headlines 64px and up. The target is about 5% of screen height; never below about 3.4% (36px is 3.3%, confirm from the farthest seat).
- Keep a safe margin of about 1.5% on every edge: `cwl-tv-safe-x` 28px, `cwl-tv-safe-y` 16px.
- The ramp scales with the room size setting (`data-room` on the TV): very large screen 1.0, large 1.1, medium 1.2, small 1.35, very small 1.5. Very small screen is the largest type, for a U-shape of about 8, and the default.
- If a screen can't hold its content at the room scale, the whole ramp shrinks evenly (`--cwl-fit-scale`) down to the 1.0 floor ramp. Past that, words move to the phones rather than shrink further.
- A crowded TV steps content down to the floor, then groups or pages it (`ClearwayLive.fitWall()`), so text stays readable from the back of the room.

**Phone ramp from 360px**, from the base scale: `phone-headline` 28, `phone-prompt` 24, `phone-input` 20, `phone-body` 16, `phone-button` 16, `phone-label` 14, `phone-micro` 12. Touch targets at least 44px (`cwl-phone-touch`), primary buttons 56px. Inputs stay above the keyboard. Phones follow the system text size.

## Spacing, radii, elevation

Use the base 4px grid. The live layer adds `cwl-tv-gutter` 96, `cwl-tv-gap` 32, `cwl-tv-card-pad` 32, `cwl-tv-moment-gap` 48, `cwl-phone-gutter` 16 and `cwl-phone-stack` 24, all base steps. Radii are base values: buttons 6, phone cards 12, TV cards 16, pill. No shadow on the TV (`cwl-shadow-tv`); phones on light screens use base `shadow-md`.

## Motion: the screen is alive

Nothing on the TV ever redraws, refreshes, blanks or waits for a reveal. Everything moves from its current state to the next.

| Movement | Duration | Easing | Delay rule | Reduced motion |
| --- | --- | --- | --- | --- |
| Arriving | `cwl-dur-arrive` 500ms | `cwl-ease-arrive` | Steady flow, `cwl-delay-stagger` 120ms apart, compressing to 30ms | 150ms fade in place |
| Making room | `cwl-dur-make-room` 700ms | signature | With the arrival (FLIP) | Instant |
| Swelling | `cwl-dur-swell` 400ms | signature | Color shifts with it | Instant |
| Bars growing | `cwl-dur-bar-grow` 600ms | signature | From the previous value; zero only on first appearance | Instant |
| Bars trading places | `cwl-dur-bar-trade` 700ms | signature | Rows glide, never swap | Instant |
| Cut line sliding | `cwl-dur-cut-line` 700ms | signature | Locked to the trade | Instant |
| Drifting into groups | `cwl-dur-regroup` 1200ms | `cwl-ease-calm` | 40ms per card, 12 steps max; not during a burst of arrivals | Instant |
| Labels growing | `cwl-dur-label-grow` 600ms | `cwl-ease-arrive` | 600ms into the drift | Instant |
| Phones dimming | `cwl-dur-phones-dim` 300ms | signature | With phones down | Instant |
| Spotlight on / off | 600ms / 500ms | `cwl-ease-calm` | Scrim and item together | Instant |
| Hide | `cwl-dur-hide` 400ms | `cwl-ease-exit` | Neighbours close the gap 200ms later | 150ms fade |
| Newest arrival Lime | `cwl-dur-new-hold` 1200ms | | Settles over 600ms | Lime, no transition |
| Count tick | `cwl-dur-count` 400ms | ease out | With the item | In place |

- Signature easing is the base's cubic-bezier(0.25, 0.1, 0.25, 1). No bounces.
- When many phones submit at once, stagger arrivals into a steady flow. Never hold an answer more than 1.5 seconds (`cwl-delay-max-hold`). Answers replayed after a reconnect are exempt. `ClearwayLive.ArrivalFlow` implements this; the 50-arrival test shows it running.
- Every movement has a still equivalent for reduced motion.
- Dimming changes color to `cwl-text-muted`, never text opacity, so dimmed text still passes AA.

## How the TV shows popularity

- **Word clouds:** size and color together. Size follows the square root of the count, from the TV minimum to headline size (168px), never wider than 1280px. Color steps from Sky to Off-White to Sunrise for the leader. A new word shows Lime for a moment. A repeated word swells and shifts color over 400ms while its neighbours ease aside.
- **Polls, rankings and 100 points:** live horizontal bars, leader on top, growing as answers land and trading places with a smooth slide. Each bar has its label and its count or share. Royal on Navy, leading bar in Sunrise. On light screens, the same bars on Off-White with Navy labels.
- **Scales:** the average large (`tv-display`), with the spread as live columns beneath.

## Iconography

Lucide, stroke 2, from the base. Icons used here: `refresh-cw` (Reconnecting), `wifi-off` (Offline, Saved on this phone), `check` (Sent), `smartphone` (Phones down), `send`, `eye-off` (Anonymous, Only you see this), `user` (Named), `sparkles` (AI grouped, AI combined, AI drafted), `badge-check` (Reviewed), `arrow-up` (votes), lens icons `users`, `map-pin`, `compass`, `settings`, `book-open`, and signal icons `circle-check`, `split`, `volume-x`, `circle-dashed`. Previews load Lucide 0.441.0 from jsDelivr. No emoji, no unicode symbols.

## Components

Each is a TV and phone pair where it applies, and each covers: empty, first item, typical, crowded (50 phones, or more items than fit), offline and queued, phones down, AI off, reduced motion, and very long text.

Join screen · Lens heading · LIVE marker and room states (LIVE, Nothing live, Reconnecting, phones down) · Burst countdown (phones, not the TV) · Wall card · Cluster group and label · Word cloud word · Bar with cut line · Tally and count · Spotlight · Headline with depth · Scripture and prayer · Phone answer input · Phone states (sent, saved on this phone, anonymous, named) · AI markers (AI grouped, AI drafted, reviewed) · Facilitator only.

## Checks

Rerun these after any change:

1. **Contrast:** every color pairing passes WCAG AA in the automated check (Contrast pairs card; currently 100 pairs, 0 failing).
2. **No raw hex in components:** search `components/bundle.css` and every TV and phone component's `preview.html` for `#` followed by three to eight hex digits; there should be none. (The foundation report cards and `bundle.js`'s QR library output are exempt.)
3. **No facilitator-only token on a TV or phone screen:** search every component except `FacilitatorOnly` for `cwl-fac-`; only the guard block and the `[data-surface="control"]` rules in `bundle.css` may name them.
4. **50 arrivals:** run the 50-arrival test; it reports Pass when the longest hold is under 1.5 seconds and no frame drops two frames.
5. **Texture:** every TV and phone root carries a `data-screen` type from the texture table, and no screen sets its own texture.
