# Milestone 7 motion spec

The screen is alive: every input appears at once, and existing items move, regroup and resize as new input arrives, with no refresh and no reveal step. Two movements are new in this pass. The report's source-light is pass 5's `cwl-dur-source-light`, and the count rolling on check-in results and the publish summary is pass 6's `cwl-dur-count`, so neither is repeated. Both prototypes are in `screens.html` under Motion.

| Movement | Tokens | What moves | Reduced motion |
| --- | --- | --- | --- |
| 1. A publish committing | `cwl-dur-settle-color` 600ms, `cwl-ease-signature`, `cwl-dur-count` 400ms | While the transaction runs, every row waits together and nothing shows as created. When CORE confirms, each waiting mark settles into a check in the same beat and the headline changes from Publishing to Published. Invitations then count up as they are sent. A failure sends every row to Not created together | The bar is still and the rows change at once |
| 2. The AI icon's sweep | `cwl-dur-ai-sweep` 900ms, `cwl-ease-calm` | When AI finishes drafting something, its icon in gradient ink runs one sweep of light across itself, then rests. Never loops, never while someone types, plain inside buttons and colored fills | No sweep |

Nothing in either movement runs on the TV or on a phone: the TV and phones change state at once when the publish commits.
