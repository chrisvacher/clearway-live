# Remote boundary

`/remote/[engagement]` is FAC-03, the facilitator's phone remote. It belongs to the
control surface: a current Clearway facilitator session and engagement assignment
are required, and every press goes through `/api/control/[engagement]`. It runs on
its own connection, so it works with the facilitator's laptop closed.

Team facilitator handover (D2-11) is implemented. That remote is scoped to its
assigned block and server-authorized controls, without presenter notes,
Discover data or the private alignment signal. Follow-up link/code access also
uses `app/f/[token]`. See `docs/handover-intent.md` for the exact database allow
list and the distinction between visible buttons and permitted actions.
Do not import setup UI here.
