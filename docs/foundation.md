# Milestone 1, PR 1: Foundation scaffold

## CORE reference

Inspected `chrisvacher/clearway-core` read-only at commit
`ea0a669c066e20589c7bcec0094672925e1d11ac`. No CORE source, configuration or database
was changed. `core-reference.json` records the exact resolved versions copied
from its package lock. Only dependencies needed by this scaffold are installed.
No AI, billing, CRM or other CORE features were copied.

| Convention | Live scaffold |
| --- | --- |
| Runtime | Node 22.x, npm, lockfile v3 |
| Framework | Next.js 15.3.6 App Router, React and React DOM 19.1.0 |
| TypeScript | 5.8.3, strict, root `@/*` alias, CORE tsconfig |
| Lint | ESLint 9.30.1, eslint-config-next 15.3.1, core-web-vitals and typescript presets |
| Styling | Tailwind 3.4.17, PostCSS 8.5.6, Autoprefixer 10.4.21, clsx and tailwind-merge |
| Components | Root app/components/lib/hooks/utils/types, shadcn new-york configuration |
| Tests | tsx 4.20.3 and Node's built-in test runner |

Intentional adaptations: `eslint .` invokes CORE's presets directly instead of
its `next lint` script, allowing warnings to fail CI. CORE's font, raw brand
colors and unrelated providers are replaced with the supplied Clearway Live
tokens as requested. The existing design files, including the base stylesheet,
are unchanged. Four missing fonts referenced by that base file were restored
from the official tokotype/PlusJakartaSans repository (`master`, fonts/ttf), along
with its SIL Open Font License. Provided font weights 300 to 700 are preserved.
No external font service is used.

## Boundaries

Only the public entry and signed-out shells render. No private engagement route
or API exists, so this PR does not expose setup data while auth is unfinished.
404 checks prove reserved/private routes do not render data. These checks are
not a substitute for the role and RLS tests arriving in PRs 2 and 3.

Phone pages have their own layout and import no private facilitator providers.
TV and remote directories reserve independent layout boundaries for milestone 2,
without implementing a live screen or changing the PRD's build order.

## Preview deployment

The existing Vercel project is `clearway-live`, team `Chris' projects`, configured
for Next.js on Node 22.x. `vercel.json` provides install/build commands and enables
Git deployments. Connect this GitHub repository in that project's Git settings
if not already linked. The Vercel Git integration creates previews for PRs and
reports their results on GitHub; GitHub Actions runs the independent CI suite.
No Vercel token is required in GitHub Actions for this path.

PR 1 requires no environment secrets and does not connect to any Supabase project.
Starting with PR 2, preview deployments must use an isolated Supabase branch or
staging project, never production credentials. The final staging choice is still
required from Chris. No cloud project, DNS record, Team Hub migration or website
redirect is changed by this scaffold.

## Practice-room check for this PR

1. Open the preview on a laptop and a phone at 360px or wider.
2. Follow both entry links and return to the start. Each page should have one
   clear heading, readable text and no horizontal scrolling.
3. Confirm light facilitator shells and Navy phone shell use Plus Jakarta Sans.
4. Tab through every link. Focus must remain visible and Skip to content must work.
5. Increase phone text size and enable reduced motion. Navigation stays usable.
6. Confirm no sign-in form claims to authenticate and no private data is shown.

These are scaffold checks only. Milestone 1 acceptance still requires the seven
PRs and Chris's real-phone sign-in and door-list tests.
