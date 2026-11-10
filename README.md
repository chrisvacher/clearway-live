# Clearway Live

Clearway Church Solutions' live facilitation app. The [PRD](docs/prd.md) governs
behaviour. Read [AGENTS.md](AGENTS.md) before changing the app.

Implementations for milestones 1 to 7, workshop open joining, and the facilitator
admin refresh are present. See [project status and remaining work](docs/project-status.md)
for implementation evidence, acceptance still to record, and next actions.

## Local development

Use Node 22 (`nvm use`) and npm:

```sh
npm ci
npm run dev
```

The public shell builds without credentials. Open http://localhost:3000,
`/sign-in` for facilitator Google sign-in, `/room` for room-link help,
or `/practice` to join the seeded practice room with a name.
Facilitator access requires an isolated Supabase project with Google configured
and an approved Clearway user. See [facilitator authentication](docs/facilitator-auth.md).

For authenticated local development, use an isolated local Supabase stack and
set `APP_ORIGIN=http://localhost:3000` plus that stack's server variables from
[`.env.example`](.env.example) in an ignored `.env.local`. Change the production
origin in the example locally because writes check the request origin. Never
copy production credentials into development or previews. See
[database checks](docs/database.md) for local startup and reset commands.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:smoke
```

`npm run check` runs all five in order. Unit tests use CORE's `tsx` and Node's test
runner. Smoke tests start and stop a real production server and verify routes,
headers, styles and fonts. They require `npm run build` first. The same commands
run in GitHub Actions on every pull request and push to main. Database migrations and real pgTAP RLS tests also run against isolated Postgres 17
in CI. See [database access and local checks](docs/database.md).

## Structure

- `app/(public)`: public entry page.
- `app/(facilitator)`: sign-in and protected setup/control pages.
- `app/(room)`: phone pages, with no facilitator providers or integration code.
- `app/(display)`: the paired `/tv` display, independent of the facilitator laptop.
- `app/(remote)`: `/remote/[id]`, including the scoped team facilitator remote.
- `app/f/[token]`: follow-up remote and TV access by link and code.
- `app/v/[token]`, `app/c/[token]`: the read-only copy and owner check-ins.
- `app/api`: guarded room, control, setup, drafting, export and scheduled routes.
- `components/ui`, `components/layout`: shared server components.
- `lib`, `hooks`, `utils`, `types`: CORE's root-level conventions.
- `design`: authoritative base and Clearway Live tokens and reference material.
- `supabase/team-hub`: reviewed reader installer. Chris reviews and runs it in Team Hub himself.

## Styles

`app/globals.css` imports `colors_and_type.css` first and `live_tokens.css` second.
Tailwind 3 and component CSS consume those variables. Tailwind's default color,
font and spacing theme is replaced with token mappings, and its preflight is off
so it does not override the supplied base styles. The design preview bundles are
references, never production scripts. Surface attributes are on each layout root;
OS reduced-motion and text-size preferences remain enabled.

See [foundation notes](docs/foundation.md) for CORE parity, assets, preview setup
and the PR 1 practice-room checks.

## Foundation workflows

`/setup` is the facilitator home, with upcoming events and engagement actions.
`/control` redirects there. Admins manage Clearway accounts at `/setup/users`.
Facilitators manage church details, dates, settings, attendee imports,
invitation review and the door list. Team workshops can optionally allow
name-only joining, enabled by an admin. See
[engagement setup](docs/engagement-setup.md), [room sign-in](docs/room-sign-in.md)
and the [restricted Team Hub reader](docs/team-hub-reader.md).

After starting and resetting a local Supabase stack, run `npm run db:seed` for
the permanent practice room and Riverside’s eight fictional people. The seed
command refuses hosted database URLs. See [practice joining and reset](docs/practice-room.md).

[Milestone 1 acceptance checks](docs/milestone-1-acceptance.md) passed on October 30,
2026, including Chris’s real-phone checks. Chris supplied design pass 2 and
approved motion on October 30. See the [design handoff](docs/design-pass-2-handoff.md)
and [milestone 2 room engine](docs/live-room-engine.md).

## App workflows

- Build a [run of show](docs/run-of-show.md) or use a [template](docs/templates.md),
  pair the [TV](docs/tv-pairing.md), and run from the [controls or remote](docs/live-controls.md).
- Run [Wayfinding](docs/milestone-4-brief.md), capture [scribe notes](docs/scribe-console.md),
  review [overnight drafts](docs/overnight-review.md), and confirm the [read-back](docs/read-back.md).
- Add [findings and notes](docs/discover-records.md), accept [themes](docs/discover-themes.md),
  and use the private [alignment signal](docs/signal.md).
- After the retreat, sign off the [report](docs/report.md), export [Word and PDF](docs/report-export.md),
  review the [visibility plan](docs/visibility-plan.md), [share the plan](docs/read-only-copy.md),
  and review [check-ins](docs/check-ins.md).

The app reads restricted church, engagement and people records from Team Hub.
Survey findings are entered by hand from Team Hub's report. The app never reads
survey responses or connects to CORE. Clearway's team enters the plan into CORE
after the retreat. See the [documentation index](docs/README.md) for all guides.
