# Milestone 1 acceptance

All foundation acceptance checks passed on October 30, 2026. Chris confirmed the real-phone checks below against https://live.clearway.co, using production as explicitly requested. Application fixes through PR 17 are merged into remote main and deployed. These results combine real-device checks, isolated browser checks and native database/Auth tests; the evidence column distinguishes them.

## Completed checks

| Requirement | Result and evidence |
| --- | --- |
| Facilitator access | Chris selected the listed `chris@clearway.co` Google account and opened setup/control. Automated Auth and role tests reject external domains, unlisted accounts and invalid sessions. |
| Participant isolation | After email/code sign-in in the private phone browser, opening `/control` required Google sign-in instead of exposing facilitator controls. Native role tests also protect setup, roster and facilitator-only data. |
| Invite and code | Chris received the Riverside invitation and signed in with its code. Reading the latest email on the phone and entering its code on the laptop joined the laptop as Chris while the phone stayed signed in. |
| Confirmation link | Chris saw **Confirm sign-in** before any sign-in occurred, then tapped to join with his name immediately. Automated tests verify GET cannot consume the link or create a room session. |
| Expiry and abuse limits | Native database/Auth tests verify consumed/expired codes, five-attempt limits, send rate limits and invalid device bindings. These abuse cases were automated rather than repeated against production. |
| Phone feedback and email | Chris confirmed the sending button changes immediately, the new email has a large readable code without a trailing period, and the unlisted-email Sunrise callout is visible. |
| Join request | Chris requested access as Guest check, saw the prominent waiting card, then chose **Let in** on the laptop. The phone joined automatically without refreshing. |
| Manual device sign-in | Chris entered a separate private phone tab's device code beside his attendee entry. That phone joined as Chris automatically without refreshing. |
| Session persistence | Practice phones CCC and HHFDR retained their own names on refresh without a sign-in form flashing. Normal room sign-ins stayed active across devices. |
| Removal | Chris removed the temporary Guest check attendee. Its phone returned to sign-in automatically without refreshing. Native tests also cover attendee email changes. |
| Close and reopen | Closing Riverside automatically showed the closed message on Chris's phone. After reopening to **pre call** and refreshing, the old session remained signed out and the sign-in form appeared. |
| Linked Team Hub setup | A temporary Live-only engagement stored the actual Team Hub client/engagement IDs, kept CORE empty, loaded six planned elements and ten people, and persisted edited settings and an explicit base year after reload. The temporary records were soft-deleted with no attendees or invitations. Chris installed the reviewed Team Hub reader script himself. Live made no writes to Team Hub or CORE. |
| Attendee imports and invitations | Isolated browser/API checks cover mixed-case email deduplication, quoted CSV commas/newlines, additional fields, scribe preservation, **Add and invite**, existing-person invitations and safe retries. Chris received the real Riverside invitation. |
| Consensus | Chris verified that the phone welcome and invitation both say: “The room makes each decision by consensus. Votes and points show where the room is. We listen to each other and make space for concerns before agreeing on what we’ll do next.” |
| Practice and seed data | Chris joined and reset practice across two browsers, then rejoined with names appearing immediately. Native tests verify idempotent seeds, reset isolation, session revocation and Riverside's eight fictional people. |
| RLS and CI | All 11 app tables were read back with RLS enabled and forced. PR 17 CI passed 27 unit tests, 28 HTTP checks, lint, types, production build, dependency audit and the PostgreSQL 17 role/native Auth/Team Hub fixture/practice suites. Each PR has a Vercel preview. |
| Production prerequisites | Google callback and account chooser work, the dedicated Team Hub reader works with verified TLS, and `clearway.co/live` redirects to `live.clearway.co`. |

Riverside is reopened in **pre call**. Guest check was removed during the revocation test. Chris's final phone session is a participant session; `/control` correctly asks for a separate Clearway Google sign-in.

## Milestone 2 entry gates

The foundation implementation and acceptance checks are complete. The PRD and milestone 2 brief still require Chris's motion-prototype signoff on the TV computer in the practice room, plus Claude Design pass 2, before implementation starts. Neither is recorded as complete.

The repository currently includes Clearway Live tokens and shared `bundle.js`/`bundle.css` helpers. The complete pass 2 screen and motion-prototype exports are not present. The required handoff covers TV themes/type/texture, motion specifications and prototypes, remote and facilitator views, wall card, word cloud, offline/reconnecting states and private-view treatment. This acceptance record does not authorize skipping that gate.

## Repeatable test script

The following script remains available for regression testing. No further production test joins, emails or resets are needed merely to reconfirm the completed checks.

## Clearway access and linked setup

1. Open Clearway sign-in and sign in as the listed `@clearway.co` Google account. Setup and control open.
2. In a separate browser, try an unlisted Google account and an external-domain Google account. Both stay outside setup/control.
3. Create an engagement by choosing a Team Hub church and its engagement. Check both Team Hub ids are stored. CORE remains empty. Add a co-facilitator from the Clearway user list if needed.
4. Refresh from Team Hub. Church details, planned elements/events and people are available. Choose the planned pre-call/retreat dates deliberately, then save.
5. Edit the church’s time zone, governance term, engagement dates, base year, Five Lenses and settings. Reload and confirm the changes persist. Leave the base year blank once and confirm it becomes the retreat year. Set an explicit year and confirm it stays.
6. Edit **How the room decides**. Save and check its text on the phone room welcome.

## Attendees and invitations

1. Open Riverside’s fictional engagement. There are eight fictional people and one scribe. Enter your name and real test email under Add people, then choose **Add and invite**. The recipient preview appears while you type. Verify that the person is saved and the invitation arrives without selecting them again or opening another review step.
2. Choose Pasted list and enter the same email in different case. The preview keeps the first and identifies the duplicate. Choose **Add without inviting** and verify no duplicate person or email is created.
3. Choose CSV with `name,email,role,notes`. Check the automatic preview of a quoted comma/newline and the additional notes field. Existing scribe status stays unless `room_role` explicitly changes it.
4. An existing attendee has **Send invite** beside their name. Sending a selected group is one **Send invites** action. The optional **Preview email** shows dates, time zone, prefilled room link and the exact saved consensus wording.

## Sign-in on two phones or browsers

1. Open the invite on phone A and tap **Send me a sign-in code**. Enter the six-digit code on phone B. B joins as the right person.
2. Request a fresh code. Open the confirmation link without tapping. It stays on **Confirm sign-in** and does not add a signed-in device. Tap to join phone A.
3. Keep both devices open. Both remain signed in. Refresh each and check the room appears directly, without the email, code or name sign-in form appearing first. Presence and signed-in counts come from device sessions.
4. Try a consumed code, a code after ten minutes, and five wrong attempts followed by a correct attempt. None can sign in. Repeated sends eventually ask you to wait, and manual sign-in remains available.
5. On another phone/browser, use an email outside the list, ask to join and approve it in the facilitator’s door list. The waiting phone joins automatically.
6. On another phone/browser, show its device code. Enter it beside the intended person on the door list. That phone joins without email. Try this from a participant session and confirm setup/control remain inaccessible.
7. Change an attendee email or remove them. Their previous device loses access. Close the engagement and confirm every room device loses access. Reopening requires fresh sign-in.

## Permanent practice and reset

1. On a real phone, open https://live.clearway.co/practice. Enter your name and join with no email or code.
2. On a second phone, join with a different name. The facilitator’s practice door list shows both signed-in people.
3. On the practice setup page, choose **Reset practice room**, then **Confirm reset**. Both phones return to the name form and can rejoin. Old claims and refresh sessions cannot restore the previous place.
4. Riverside’s people and the unrelated engagement remain intact. Re-running the seed does not duplicate them or overwrite your edits.

For a regression run, record any failed step with device/browser and what happened. Motion-prototype signoff and design pass 2 remain separate entry gates before milestone 2 implementation.
