# D: After pages

Local fictional Riverside Wayfinding engagement. Existing designed workspaces are retained, with church/event navigation and a list link on each page. The standalone Map now has the main landmark used by Skip to content. On narrow windows, the review/report/plan navigation takes its content height instead of stretching into oversized rows. The engagement navigation is hidden in print.

| Page | Desktop before | Desktop after | Narrow before | Narrow after |
| --- | --- | --- | --- | --- |
| After | [Before](before/control-engagement-after-1440.png) | [After](after-d/control-engagement-after-1440.png) | [Before](before/control-engagement-after-390.png) | [After](after-d/control-engagement-after-390.png) |
| Check-ins | [Before](before/control-engagement-check-ins-1440.png) | [After](after-d/control-engagement-check-ins-1440.png) | [Before](before/control-engagement-check-ins-390.png) | [After](after-d/control-engagement-check-ins-390.png) |
| Recap | [Before](before/control-engagement-recap-1440.png) | [After](after-d/control-engagement-recap-1440.png) | [Before](before/control-engagement-recap-390.png) | [After](after-d/control-engagement-recap-390.png) |
| Share | [Before](before/control-engagement-share-1440.png) | [After](after-d/control-engagement-share-1440.png) | [Before](before/control-engagement-share-390.png) | [After](after-d/control-engagement-share-390.png) |
| Report | [Before](before/control-engagement-report-1440.png) | [After](after-d/control-engagement-report-1440.png) | [Before](before/control-engagement-report-390.png) | [After](after-d/control-engagement-report-390.png) |
| Visibility plan | [Before](before/control-engagement-plan-1440.png) | [After](after-d/control-engagement-plan-1440.png) | [Before](before/control-engagement-plan-390.png) | [After](after-d/control-engagement-plan-390.png) |
| Map | [Before](before/control-engagement-map-1440.png) | [After](after-d/control-engagement-map-1440.png) | [Before](before/control-engagement-map-390.png) | [After](after-d/control-engagement-map-390.png) |
| Overnight review | [Before](before/control-engagement-review-1440.png) | [After](after-d/control-engagement-review-1440.png) | [Before](before/control-engagement-review-390.png) | [After](after-d/control-engagement-review-390.png) |
| Phone to TV | [Before](before/control-engagement-latency-1440.png) | [After](after-d/control-engagement-latency-1440.png) | [Before](before/control-engagement-latency-390.png) | [After](after-d/control-engagement-latency-390.png) |

These are empty-state/navigation captures. Existing browser kits additionally exercise populated editing, sign-off, exports, sharing and check-ins with local fake email/model services. Narrow layout repair does not add a phone-specific overnight-review flow.

Validation passed: `npm run check`, final lint/typecheck, the nine-page desktop/narrow audit, and the Map/templates (6), overnight (12), report, check-ins (19), visibility-plan (15), read-only/share (14) and team-workshop (19) browser kits. The audit additionally checks the main landmark and compact narrow navigation.
