# Milestone 1, PR 3: Facilitator Google sign-in

## Access

`/sign-in` starts Supabase Google OAuth with PKCE. The hosted-domain hint helps
choose an account. The database independently requires a confirmed @clearway.co
email, a verified matching Google identity, a real unexpired Auth session with
OAuth proof, and an active `clearway_users` record linked to a Team Hub member.
Google must remain the only enabled external OAuth provider. Email Auth remains
available for the separate participant flow in PR 4, but never grants facilitator
access, even for an account that has previously linked Google.

The callback invokes the argument-free `claim_clearway_access()` RPC. Its public
wrapper is security invoker. The unexposed private definer binds the current
verified identity only to an existing unclaimed profile with the same email.
It does not create accounts, change admin status, accept an email or user id from
the caller, or take a profile away from another Auth identity. Repeated claims
are safe. Account removal and session revocation take effect on the next read.

Both the protected layout and each page check Auth using `getUser()`, then read
the current profile through RLS. Middleware only refreshes cookies and is never
the access boundary. Setup reads engagement titles using the user's session and
RLS. An unassigned facilitator gets an empty list. Engagement editing arrives in
PR 6. `/control` is a protected entry page, with no live-room engine yet.

## Configuration

Use `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in Vercel. Existing
`NEXT_PUBLIC_SUPABASE_*` configuration is supported as a fallback. Legacy anon
keys are supported, but service/secret keys are explicitly rejected here. No
service key, Google secret or Team Hub connection is used by this sign-in flow.
Missing or malformed configuration disables sign-in and denies protected pages.

`APP_ORIGIN` defaults to `https://live.clearway.co`. Set it explicitly for local
or isolated preview environments. OAuth redirects and mutation Origin checks
use this configured origin, never an untrusted Host or forwarded header. Only
`/setup` and `/control` are accepted as return paths.

In the Live Supabase Auth settings:

1. Enable Google with the client created in Clearway's Google Cloud project.
2. Add the provider callback in Google: `https://uxfypmohciupjyzbonlq.supabase.co/auth/v1/callback`.
3. Set the production Site URL to `https://live.clearway.co` and allow the app
   redirect `https://live.clearway.co/auth/callback` (including its `next` query).
4. Keep other external OAuth providers disabled.

Previews need their own Supabase branch or staging project, matching migrations,
Google redirect allowlist, public configuration and exact `APP_ORIGIN`. Production
keys are not copied to previews. Until staging is configured, previews show the
signed-out unavailable state. CI uses a local Auth fixture and disposable Postgres.

Before a person's first sign-in, an admin must create their `clearway_users`
record using the verified Team Hub member id, normalized email and intended admin
flag. `auth_user_id` starts null and is bound by the first verified Google sign-in.
The initial production admin is Chris's existing Team Hub identity. Other team
members are not granted access automatically. To restore an account recreated in
Auth with a different id, an admin must explicitly release the previous binding.
The application does not silently reassign it by matching email.

## Session handling

Facilitator cookies use the `cw-facilitator` namespace, separate from future room
sessions. They are host-only, HttpOnly, SameSite=Lax, and Secure on HTTPS. Tokens
never enter browser props or JavaScript. Google provider credentials from the
OAuth exchange are discarded before issuing the final application session cookie. Supabase handles PKCE and refresh token
rotation. Middleware preserves refreshed cookies on the response and request.
Auth and private responses are dynamic, private and no-store. Referrers are
suppressed so callback codes are not forwarded.

Google initiation and sign-out are POST-only and require an exact Origin match.
The callback exchanges its one-time code, checks the verified user and claims
allowlisted access. A denied new session is signed out locally and its cookies
removed. An unsolicited or failed callback cannot sign out an existing session.
Explicit sign-out revokes only this session, preserving other signed-in devices.

## Verification

`npm run check` runs policy/contrast/foundation tests, builds the production app,
and starts it against an isolated local HTTP Auth/PostgREST fixture. The real SSR
SDK handles PKCE, cookie chunking, callback exchange, refresh and sign-out. Tests
exercise admitted and denied accounts, participant cookies on private routes,
wrong domains, revoked sessions, missing/wrong/cancelled PKCE, open redirect
attempts, cross-site requests, middleware bypass headers, private response
headers and token isolation. The fixture does not stand in for RLS verification.

The PostgreSQL 17 pgTAP suite separately exercises real Auth tables and RLS,
including initial profile binding, missing Google verification, email OTP,
metadata spoofing, expired/revoked sessions, deleted profiles and attempted
identity theft. All test data rolls back. No fixture or bypass is deployed.

A real Google consent/login needs Chris's browser and Google account. Production
checks can confirm the Google redirect, callback URL, signed-out gates and security
headers without impersonating him. His final practice check is to sign in as
`chris@clearway.co`, open setup/control, sign out, and confirm both private routes
return to sign-in.

## Approved security updates

Chris approved updating Live's vulnerable CORE pins for this PR. Live uses Next.js
and eslint-config-next 15.5.28, PostCSS 8.5.23, and an override for Next's transitive
PostCSS. Other locked transitive security fixes are included. The exact original
CORE reference is preserved in `core-reference.json`, alongside the explicit Live
overrides. The Supabase clients match CORE exactly: SSR 0.6.1 and supabase-js 2.50.3.
Next's generated declaration is excluded from lint, and typechecking generates
route types first. CI audits production dependencies. CORE itself is unchanged.

## Production migration

`20261030033500_facilitator_google_sign_in.sql` matches the Live database migration
history. The identical SQL passed all 369 pgTAP assertions before application.
The initial Chris admin profile is linked to his verified Team Hub member record,
with its Auth binding left pending until his first Google sign-in. Other accounts
remain unlisted. The app suite passes 28 tests.
