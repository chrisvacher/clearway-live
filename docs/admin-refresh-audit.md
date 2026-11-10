# Facilitator admin refresh

Source audit, November 9, 2026. Chris approved `/setup` as the facilitator home and admin-only `/setup/users`. The PRD records those decisions.

**Implementation status, November 10:** all four areas are merged to main in
PRs #133, #134, #135 and #136. Evidence and recorded local validation are in
`docs/evidence/admin/area-a.md` through `area-d.md`. The work column below
describes the completed changes. Further acceptance and operational checks are
tracked in [project status](project-status.md).

| Area | Pages | Work |
| --- | --- | --- |
| A | Sign-in, setup home, control picker, user administration | Replace placeholder layouts, one home, upcoming first, event identity and direct actions, reusable engagement navigation |
| B | Create and edit | Designed form panels, fields by type, plain labels, joining details, linked engagement protection and duplicate conflict response, remove embedded account administration |
| C | Door list, TV management, Discover, Four Helpful Lists, templates | Replace placeholder wrappers, keep designed workspaces, add church/event context and engagement navigation, inspect empty states and narrow widths |
| D | After, check-ins, recap, share, report, plan, map, review, latency | Preserve designed workspaces, consistent church/event navigation, fix remaining usability and narrow-width issues |

## Boundaries

The live control surface, run of show and print view, remote, TV display, phones, scribe and public pages retain their appearance and behaviour. No shared practice-room reset or live action, real email, Team Hub write or CORE access is part of this work. Browser evidence uses isolated local fixtures.

## Validation

Each area runs `npm run check`, the admin browser audit at 1440px and 390px, and applicable existing browser kits. Screenshot pairs live in `docs/evidence/admin`. PRs are stacked in A, B, C, D order so shared styles and navigation remain one implementation.

## Review coverage clarified November 10

The existing A to D evidence documents 20 views at 1440px and 390px. It covers
navigation, headings, main landmarks, horizontal fit, empty states and the named
form/layout fixes. Feature browser kits additionally exercise editing, sharing
and export flows, as each area's record describes.

Codex reviewed this evidence during the production audit. It has not independently
completed a fresh visual and task-based UX review of every admin route and every
state. Run of show, print, live controls, remote, TV and scribe were explicitly
outside the four-area refresh. This evidence does not establish complete UX
acceptance of all private application workflows.

The new Operations page is covered separately by the operations browser kit at
1440px and 390px, including populated monitoring data, controls and downloads.
Codex visually reviewed the final `cba45a2` captures at
[1440px](evidence/admin/operations-1440.png) and
[390px](evidence/admin/operations-390.png), and inspected the production desktop
page during the [recovery and monitoring checks](evidence/production/2026-11-10-operations.md).
This does not replace the outstanding venue/device acceptance.
