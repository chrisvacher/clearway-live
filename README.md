# Clearway Live

Clearway Church Solutions' live facilitation app. The [PRD](docs/prd.md) governs
behaviour. Read [AGENTS.md](AGENTS.md) before changing the app.

## Local development

Use Node 22 (`nvm use`) and npm:

```sh
npm ci
npm run dev
```

The public shell builds without credentials. Open http://localhost:3000,
`/sign-in` for facilitator Google sign-in, or `/room` for the phone shell.
Facilitator access requires an isolated Supabase project with Google configured
and an approved Clearway user. See [facilitator authentication](docs/facilitator-auth.md).

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
- `app/(display)` and `app/(remote)`: reserved route boundaries for milestone 2.
- `components/ui`, `components/layout`: shared server components.
- `lib`, `hooks`, `utils`, `types`: CORE's root-level conventions.
- `design`: authoritative base and Clearway Live tokens and reference material.
- `supabase/team-hub`: review-only SQL draft. Never run against Team Hub.

## Styles

`app/globals.css` imports `colors_and_type.css` first and `live_tokens.css` second.
Tailwind 3 and component CSS consume those variables. Tailwind's default color,
font and spacing theme is replaced with token mappings, and its preflight is off
so it does not override the supplied base styles. The design preview bundles are
references, never production scripts. Surface attributes are on each layout root;
OS reduced-motion and text-size preferences remain enabled.

See [foundation notes](docs/foundation.md) for CORE parity, assets, preview setup
and the PR 1 practice-room checks.
