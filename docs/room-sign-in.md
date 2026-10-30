# Milestone 1, PR 4: Room sign-in and the door list

Phones open `/room/<engagement UUID>`. A public projection returns only the church
name, engagement title/type, whether it is closed, consensus copy and a neutral
join-message flag. It never returns the roster, settings object or integration ids.
Facilitators open `/setup/<engagement UUID>/door` with their current Google session.

A phone initializes an opaque device id and a separate 256-bit secret in an
HttpOnly host-only cookie. The printed eight-character device code is safe to show
the facilitator. Initialization never creates a signed-in device or changes the
presence count. Closing a room, changing a roster identity or resetting practice
revokes its proofs, so reopening cannot resurrect an old approval.

Codes are six digits, expire after 10 minutes and allow five attempts total across
all devices. The database atomically increments attempts and consumes proofs.
It stores purpose-bound HMACs and hashes, never the code or confirmation token.
Requests are limited per normalized email and device, with larger IP budgets for
50 phones sharing venue Wi-Fi. No in-memory rate limiter is used. HMAC keys derive
from the existing server service credential. Rotating it invalidates pending codes.

Resend sends the code and a random confirmation link. Its GET page performs no
Auth exchange or device initialization, even when JavaScript executes. Only a tap
on Confirm sign-in POSTs the proof. Referrers are reduced to the origin and the
page is no-store. Codes also work after entering the same email on another device.
All mutating endpoints require the configured Origin and bounded JSON bodies.

A valid code/link, manual device approval or approved join request creates a
short-lived server claim. Only then does the server use Supabase Admin generateLink
and immediately exchange the native token. It accepts the native signup/magiclink
verification type and binds the resulting real OTP Auth session to the intended
attendee. The native token is never emailed or returned to a phone. A failed Auth
exchange releases the claim for retry without repeating the user's proof.

Room Auth cookies have a separate per-engagement namespace from facilitator
cookies. Active device bindings are retained until engagement closure, subject to
explicit revocation or Auth session revocation. Signing in on a second phone does
not revoke the first. Auth refresh cookies are preserved on status responses.
Phones poll for approval and claim it automatically without another tap.

Unlisted emails receive a gentle message or the engagement's neutral message.
They can ask to join. The assigned facilitator's atomic approval creates or reuses
the attendee and approves that exact device. Manual sign-in binds a listed attendee
to the short code on the phone. Both database operations independently check the
current verified Google session and engagement assignment. Participants, scribes,
unassigned Clearway users and facilitators from another engagement are refused.

The door list counts real nonrevoked device bindings joined to current Auth
sessions. Here now additionally requires a recent heartbeat from a verified room
session. Page loads, scanners and requests to join never count as sign-ins.
All three private proof/rate tables have forced RLS, created/updated timestamps and
soft-delete flags. Only server-only service RPCs can access their rows. Public
wrappers are security invoker and have explicit execution grants. Internal definer
helpers are narrowly scoped to Auth-owned validation or current-facilitator actions.

## Configuration and checks

Existing production Supabase server credentials, `RESEND_API_KEY` and `EMAIL_FROM`
(or `RESEND_FROM_EMAIL`) are required in Vercel. No new paid service is introduced.
Production credentials are never copied to previews. `RESEND_API_URL` defaults to
Resend and is overridden only by the local email fixture during HTTP tests.

`npm run check` exercises the production HTTP routes with isolated Auth/database/
email fixtures and checks phone/control boundaries, fonts, tokens and contrast.
`supabase test db --local` tests real PostgreSQL roles, proof expiry, attempts,
resends, replay, identity binding, approvals, presence and revocation.
`npm run test:auth` requires the disposable local Supabase stack, verifies native
GoTrue signup/magiclink issuance, real OTP AMR proof, two-device persistence and
RLS isolation. It refuses any non-loopback API URL. CI starts this isolated stack
without Team Hub, CORE, hosted credentials or real email delivery.

For interactive local QA, `CLEARWAY_SMOKE_HOLD=1 npm run test:smoke` keeps only the
fixture server open after the HTTP tests. It prints the fixture URL and fake emails.
This mode is test-only and no fixture route is shipped in the app.

Sources: [Supabase generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink),
[Resend send email](https://resend.com/docs/api-reference/emails/send-email).

Production migration `20261030041545_room_sign_in.sql` matches Supabase history.
The identical SQL passed all 444 database assertions, 38 application checks and
the real native Auth two-device test before being applied to Live. No Team Hub
or CORE migration was run.
