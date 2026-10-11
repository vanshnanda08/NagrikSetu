# Verification harnesses

Run against a **local, seeded scratch database**, with the backend on `:8080`
using the `demo` profile and `civictrack.demo.staff-password=demo1234`, and the
frontend on `:3000` pointing to that backend. These scripts mutate issues and
create a citizen account; they are not production monitoring tools.

```bash
cd tools
npm ci
npx playwright install chrome
npm run contract
npm run transitions
npm run uiwalk
npm run sweep
```

Restart the frontend after building so it serves matching chunks.

| Script | What it checks |
|---|---|
| `contract.mjs <path-to-types.ts>` | Required and unexpected JSON fields, including phase 6 verification/notifications and phase 7 dashboard, review and assignment contracts. HTTP errors and missing required fixtures fail. This checks field names, not field value types. |
| `table.mjs` | NEW → ACKNOWLEDGED → ASSIGNED → IN_PROGRESS → PENDING_VERIFICATION through the API, asserting successful responses and resulting states. |
| `uiwalk.mjs` | Exact actions offered at those five states, successful transition responses and no browser runtime errors. |
| `sweep.mjs` | Runtime and unexpected HTTP errors on routes through phase 7, anonymous and as CITIZEN, STAFF, SUPERVISOR and ADMIN. Includes notifications, verification, assignment, review and split/merge screens. Deliberate 404s are narrowly allowed; missing Cloudinary photos must render their fallback. |

Last run on 2026-10-11, after the frontend refresh: all four pass against the
local scratch database (the route sweep reports 0 failing route checks; `/` now
redirects to `/dashboard`). The lifecycle scripts create demo issues as they
run, so expect the ticket numbers to climb.

All four scripts exit nonzero on failed checks. The CI verification job runs
them against a fresh PostGIS service and gates Render deployment. It uses
`demo,seed`, which disables scheduled writers while the harness mutates its
fixtures. Browser checks cover routes and lifecycle actions; the backend suite
checks vote/quorum, split/merge, assignment guards and SSE behavior.

If a local corpus has no usable NEW Roads issues left, the lifecycle scripts
try CLOSED Roads locations and verify the resulting issue is actually NEW.
They fail clearly if another active cluster absorbs every attempted report;
reseed a scratch database in that case. They never reset a database themselves.
