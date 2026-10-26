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
# Optional extended local checks (see prerequisites below):
npm run features
npm run audit
npx playwright install firefox webkit
npm run browsers
```

Restart the frontend after building so it serves matching chunks.

| Script | What it checks |
|---|---|
| `contract.mjs <path-to-types.ts>` | Required and unexpected JSON fields, including phase 6 verification/notifications and phase 7 dashboard, review and assignment contracts. HTTP errors and missing required fixtures fail. This checks field names, not field value types. |
| `table.mjs` | NEW → ACKNOWLEDGED → ASSIGNED → IN_PROGRESS → PENDING_VERIFICATION through the API, asserting successful responses and resulting states. |
| `uiwalk.mjs` | Exact actions offered at those five states, successful transition responses and no browser runtime errors. |
| `sweep.mjs` | Runtime and unexpected HTTP errors on every product route, anonymous and as CITIZEN, STAFF, SUPERVISOR and ADMIN. Includes recovery, offline outbox, profile/security/email preference, notification, verification, assignment, review, split/merge and admin configuration screens. Deliberate 404s are narrowly allowed; missing Cloudinary photos must render their fallback. |
| `features.mjs` | Local SMTP password reset, email preferences, cross-tab rotation, durable drafts/outbox, idempotency, admin save and mobile layouts. |
| `audit.mjs` | MFA/recovery/session controls, redirect/origin defenses, following/private messages, failed-write feedback, 70 authenticated responsive checks, 14 axe scans and manifest assets. Uses the axe-core installed through the frontend lint dependency tree. |
| `browsers.mjs` | Firefox and WebKit public routes at 320/1280px, keyboard dialog navigation, Escape and runtime errors; attempts both engines and exits nonzero if either fails. |

Recorded on 2026-10-26: contract, transitions, UI walk and sweep passed; the sweep
completed 190 checks with zero failures. Features and the final Chrome audit
passed, including 70 layouts and 14 axe scans with no violations. WebKit passed
10 route checks and keyboard smoke; Firefox could not start its profile locally,
so the combined cross-browser command failed and Firefox remains unverified.
See [FINAL_AUDIT.md](../FINAL_AUDIT.md). The lifecycle scripts create demo issues
as they run, so expect the ticket numbers to climb.

Extended checks need a production frontend build pointing at the scratch API.
`features.mjs` additionally expects Mailpit HTTP on `localhost:18025`, with the
backend configured for its SMTP port, mail enabled and `PUBLIC_APP_URL` set to
`http://localhost:3000`. Its synthetic offline photo needs
`civictrack.media.verify-evidence=false` **only on the scratch backend**. Do not
disable media verification in production. No live SMTP or Cloudinary upload
credentials are required. Both extended scripts create unique test accounts.

All scripts exit nonzero on failed checks. The CI verification job runs the
original four against a fresh PostGIS service and gates Render deployment. It uses
`demo,seed`, which disables scheduled writers while the harness mutates its
fixtures. Browser checks cover routes and lifecycle actions; the backend suite
checks vote/quorum, split/merge, assignment guards and SSE behavior.

If a local corpus has no usable NEW Roads issues left, the lifecycle scripts
try CLOSED Roads locations and verify the resulting issue is actually NEW.
They fail clearly if another active cluster absorbs every attempted report;
reseed a scratch database in that case. They never reset a database themselves.
