# Clearway live app: instructions for Codex

The Clearway live app (working name) is Clearway Church Solutions' live facilitation platform, at live.clearway.co. It is built first for the Wayfinding retreat, a two-day strategic planning retreat for a church team of about 8 people.

## Read first, in this order

1. `docs/prd.md`: the PRD. The source of truth for behaviour. Where anything else disagrees, the PRD wins.
2. `docs/milestone-1-brief.md`: what to build now.
3. `design/clearway-live/README.md`: the design system rules.
4. `design/clearway-live/live_tokens.css`: the token file. Load it after `design/clearway-base/colors_and_type.css`.

## The three surfaces

The app runs on three separate surfaces at once, all following one room state on the server:

- **Control surface:** the facilitator's laptop view and phone remote. Private, never shown to the room.
- **TV or projector:** a separate computer at the screen, connected by HDMI or screen mirroring, paired to the engagement. Never cabled to the facilitator's laptop.
- **Phone:** each participant's own phone, in the browser, no app.

## Non-negotiables

- **The screen is alive.** Every submission reaches the TV in under 1 second (95 in 100). Nothing on the TV redraws, refreshes, blanks or waits for a reveal. Everything animates from its current state to the next. This applies from milestone 2, but don't build anything in milestone 1 that makes it harder.
- **Data is organized around the engagement:** church, then engagement, then Discover inputs, then sessions, then outputs.
- **Row-level security on every table,** with tests proving each role reads only what the PRD allows.
- **Secrets stay on the server,** in Vercel environment variables only.
- **Copy follows "Words in the app" in the PRD:** sentence case, plain words, buttons start with a verb, no em dashes or en dashes anywhere, horizon terms written exactly (10-year Future, 3-year Vision, 1-year Outlook).
- **Styles come only from tokens.** No raw hex values in components.

## Stack

Match CORE (`chrisvacher/clearway-core`) as closely as possible: copy its package versions, linting, folder layout and styling approach.

- Next.js App Router and TypeScript on Node 22.x
- Supabase: Postgres 17, Auth, Realtime, Storage
- Vercel
- Resend for email
- Claude through Anthropic's API, server only, from milestone 3

## How work runs

- One milestone at a time. Chris accepts each in the practice room before the next starts.
- Write tests from the acceptance criteria. They run on every pull request.
- Every pull request gets a Vercel preview.
- Raise a question rather than work around a decision marked Decided in the PRD.
- Build to every Default in the PRD until Chris changes it.

## Ask Chris before

- Running any migration on Team Hub (Supabase project `clearway-team-hub`) or touching CORE (`clearway-core`). Both are live production systems. The app never writes to Team Hub.
- Changing the clearway.co website repository (`chrisvacher/clearway-dot-co`).
- Adding a paid service or changing anything outside this repository.

## Design files

- Phone screens are designed first. Laptop screens follow once Clearway Live's laptop components are published.
- When high-fidelity screens aren't in `design/` yet, build working screens from the wireframe layouts described in the PRD, using Clearway Live tokens. Restyle them when the designs land.
- `design/clearway-live/components/bundle.js` contains working reference code for FLIP motion, the arrival flow, word sizing and textures. Port its logic into the app's components rather than loading it as a script.
