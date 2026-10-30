# Milestone 1 acceptance with real phones

Use https://live.clearway.co. This is the foundation only, so no sessions, TV pairing, remote or realtime wall appears yet.

Before starting:

- Correct Google’s authorized callback to `https://uxfypmohciupjyzbonlq.supabase.co/auth/v1/callback` on client `256944515209-t0nh1o4mbhu5fm3auiqval2cqfnkm6en.apps.googleusercontent.com`.
- Review/run `supabase/team-hub/live_reader.sql` yourself in Team Hub, set the dedicated reader password privately, and set `TEAM_HUB_DATABASE_URL` in Live’s Vercel production environment. Redeploy for a new environment value. Never use an administrator connection string.
- Approve the separate website `/live` redirect patch if not already applied. It does not affect direct room links.

## Clearway access and linked setup

1. Open Clearway sign-in and sign in as the listed `@clearway.co` Google account. Setup and control open.
2. In a separate browser, try an unlisted Google account and an external-domain Google account. Both stay outside setup/control.
3. Create an engagement by choosing a Team Hub church and its engagement. Check both Team Hub ids are stored. CORE remains empty. Add a co-facilitator from the Clearway user list if needed.
4. Refresh from Team Hub. Church details, planned elements/events and people are available. Choose the planned pre-call/retreat dates deliberately, then save.
5. Edit the church’s time zone, governance term, engagement dates, base year, Five Lenses and settings. Reload and confirm the changes persist. Leave the base year blank once and confirm it becomes the retreat year. Set an explicit year and confirm it stays.
6. Edit **How the room decides**. Save and check its text on the phone room welcome.

## Attendees and invitations

1. Open Riverside’s fictional engagement. There are eight fictional people and one scribe. Replace one attendee email with your own real test email, or add a new person with that email.
2. Review a pasted list containing the same email in different case. Only the first appears. Save and verify no duplicate.
3. Review a CSV with `name,email,role,notes`. Check a quoted comma/newline and the additional notes field. Existing scribe status stays unless `room_role` explicitly changes it.
4. Select your real test email and review the invite. Check dates, time zone, prefilled room link and the exact saved consensus wording. Send it, then open the received email.

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

Record any failed step with device/browser and what happened. Accept milestone 1 only when these steps pass. Then review the motion prototypes and design pass 2 before starting milestone 2.
