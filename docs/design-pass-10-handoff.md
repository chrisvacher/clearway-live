# Clearway Live admin refresh handoff

## Implemented

| Workstream | Items |
| --- | --- |
| F, foundation | Shared app tokens, page headers, buttons and Go live styling. Shared stage, step and status chips and the stage model. Save bar, dirty-form handling, toasts, confirmations, danger zone and searchable pickers. Settings, tabs, table primitives and the Jump to dialog. |
| A, shell | Shared facilitator navigation, engagement switching, collapsed rail, saved sidebar preference and Jump to. Navigation follows the engagement type and the current stage. |
| B1 to B3, engagements | Searchable and filterable engagement list with archive and restore. Create uses the Team Hub picker and checks optional workshop link names. Overview brings together readiness, invitation details, screen and remote links, and stage actions. |
| C1 and C2, details and screens | Details uses one save bar for edits that need review. Brand and AI switches save immediately with Undo. Screens shares the TV size control with Room admin and saves theme, size and motion changes immediately. |
| D1 to D4, people and access | People and Access tabs combine roster, joining controls and the event admin link. Presence, duplicate merging and waiting guests appear with the roster. The older people and door routes redirect to the relevant roster view. |
| E1 to E5, live room | Redesigned header, run list, TV and phone monitors, transport controls and Room admin drawer. Added responsive controls and a simplified facilitator remote. |
| R1 to R5, run of show | Three desktop panes hold the step list, engagement-skinned TV and phone preview, and the selected step's settings. Step editing autosaves. File, template, print and reload actions stay in the toolbar or its More menu. |
| G1 to G5, results and admin | Results has summary and download actions and a per-step results grid. Templates and Blocks share a library. Clearway users and Operations use the shared admin patterns. Date and time formatting on Templates and the live room is deterministic across server and browser. |
| S, sweep | Added a reproducible signed-in browser sweep for both workshop brands and Wayfinding. It checks page widths and route destinations and records 1440-pixel screenshots. |

## Migrations for rollout

Apply these in order to the Clearway Live project.

| Migration | Purpose |
| --- | --- |
| `20261120100000_engagement_archive.sql` | Archive and restore engagements. |
| `20261120100500_engagement_creation.sql` | Create engagements with optional workshop link names. |
| `20261120110000_attendee_merge.sql` | Merge duplicate attendee records and retain their references. |
| `20261120110500_people_presence.sql` | Expose facilitator roster presence. |
| `20261120120000_template_manage.sql` | Manage user-created templates and blocks. |
| `20261120130000_engagement_details_patch.sql` | Save targeted details changes without replacing room access settings. |
| `20261120140000_clearway_user_management.sql` | Update Clearway user roles and remove access. |

The sweep uses isolated migrations in CI. Hosted application of these files needs verification in the rollout record.

## Verification and handoff

The [evidence directory](evidence/design-pass-10/) describes how to reproduce the screenshots and where to find the CI artifacts. The sweep checks all signed-in facilitator routes at 390, 1280, 1440 and 1512 pixels and captures each rendered view at 1440 pixels. The separate browser kits exercise the interactions those layouts support.

A completed combined browser run, the screenshots and visual review are pending. Chris will run practice-room acceptance after those checks pass.
