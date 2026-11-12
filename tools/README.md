# Verification harnesses

## Current non-phone failure and accessibility checks

`nonphone-closeout.mjs` requires `CLOSEOUT_SCRATCH=1`, loopback app/API URLs and
`CLOSEOUT_CONFIG` pointing to private JSON containing `app`, `api`, `password`
(scratch municipal bootstrap only), `citizenEmail`, `citizenPassword`,
`pendingIssue`, `staffIssue` and `evidenceUrl`. Optional `sessionDir` must be a
private directory outside Git; it stores mode-0600 test refresh cookies to avoid
repeated login throttles. `CLOSEOUT_OUTPUT` chooses the evidence directory.
`CLOSEOUT_ONLY` selects a check-name prefix for targeted reproduction.

```bash
CLOSEOUT_SCRATCH=1 CLOSEOUT_CONFIG=/private/path/browser-config.json \
  CLOSEOUT_OUTPUT=artifacts/nonphone-closeout node tools/nonphone-closeout.mjs
```

It uses real local role authentication/data and explicitly fulfilled browser
fixtures for success/409/503 bulk responses, SSE transport state and
400/429/success outbox responses. It also queues a real local offline form
without submitting it to a service, checks 18 desktop/mobile axe scans and
keyboard focus. It does not certify heard screen-reader speech or physical
phone behaviour. See [the closeout report](../docs/NON_PHONE_CLOSEOUT.md).

The closure-draft regression holds a real local assignment-queue GET until an
administrator has entered a reason, then releases the response and checks that
the draft survives layout changes and dialog cancellation at 1280px and 390px.
It never submits a closure. `CLOSEOUT_ONLY='Administrator closure'` selects it;
the existing `pendingIssue` fixture must be a nonterminal complaint.


## Thapar dataset deployed checks

`thapar-dataset-check.mjs` reviews the deployed Thapar v2 dataset without business
writes: all 50 references/90 reports, category filters/map, histories/tracking,
citizen eligibility/private messages, staff/supervisor scopes, saved moderation,
stateless split preview, dashboards and administrator audit CSV. Normal password
authentication/refresh/logout and preview POSTs are allowed; other writes are
blocked. Do not use the older mutating lifecycle harnesses on production.

Provide a mode-0600 JSON configuration outside Git containing the approved app/API
URLs, citizen/municipal test credentials and generated scenario IDs. The harness
also retains private browser session files alongside that configuration. Its
required fields are explicit in the script; no credentials are committed.

```bash
THAPAR_DATASET_CHECK_CONFIG=/private/path/live-check.json \
  THAPAR_DATASET_CHECK_OUTPUT=artifacts/thapar-review \
  node tools/thapar-dataset-check.mjs
# Set THAPAR_DATASET_LAYOUTS_ONLY=1 to repeat only the 30 layouts and logout.
```

The six sizes cover four desktop viewports plus 390px and 768px widths. Waits
include actual map markers, decoded evidence and queue data before screenshots.
[The dataset report](../docs/THAPAR_DATASET.md) records the exact executed checks,
backups, distributions, generation/atomic-refresh tooling and current limits.

## Existing application checks

Current authentication is password-only for every role; authenticator setup is
retired. Security fixtures and active audit steps now check password/session
controls and refusal of retired enrollment paths. Earlier dated MFA results below
are historical. See [password authentication](../docs/PASSWORD_AUTHENTICATION.md).
The Firefox/WebKit smoke waits for finite API/RSC reads before its next hard
navigation; the persistent event stream is excluded and page errors still fail.

The [10 November daily-use rehearsal](../docs/DAILY_USAGE_VERIFICATION.md) uses
`daily-journey.mjs` for real citizen photo reports, grouping, supervisor assignment,
staff clarification/proof, rejected and confirmed repairs, administrator closure,
CSV export, profile/notification/follow actions and warm offline delivery.
It requires a disposable migrated database, demo-profile seeded municipal
accounts, strict media verification, real public Cloudinary upload settings and
an independent production frontend. It refuses non-loopback service URLs.
Supply three labelled synthetic JPEGs named `photo-0.jpg`, `photo-1.jpg` and
`photo-2.jpg`. This harness **uploads media** and retains hosted QA assets.

```bash
# Set JOURNEY_PASSWORD to the scratch bootstrap password without recording it in Git.
JOURNEY_SCRATCH=1 JOURNEY_APP=http://localhost:3041 \
  JOURNEY_API=http://localhost:8088/api/v1 \
  JOURNEY_OUTPUT="$PWD/artifacts/daily-journey" \
  JOURNEY_PHOTOS="/path/to/labelled-qa-photos" \
  node tools/daily-journey.mjs
```

Keep `JOURNEY_STATE_DIR`, if used, in a private temporary directory: it contains
browser session cookies. `JOURNEY_RESUME=1` reuses recorded completed steps and
the original actors; it does not repeat the principal complaint/votes.
`JOURNEY_LAYOUTS_ONLY=1` completes outstanding loaded layout captures.
`JOURNEY_SUPPLEMENT=1` resumes newly added continuity checks on an existing run.
Do not reuse a partially completed *individual* write step without inspecting
the actual record first. A completed ordinary run refuses another submission.

The 8 November follow-up and exact boundaries are in
[release readiness](../docs/RELEASE_READINESS.md). `screen-consolidation.mjs` and
`public-audit.mjs` accept `SCREENS_APP` and `VERIFY_API` for isolated local ports;
the screen audit covers all six requested viewport sizes. The public audit
expects deferred email recovery by default. `TEST_EMAIL_RECOVERY=true` is only
for a deliberately enabled future recovery fixture; the historical Mailpit
feature harness is not a current email-delivery gate.

`release-followup.mjs` requires loopback app/API URLs and `VERIFY_SCRATCH=1`.
It creates disposable accounts, changes a QA password and may submit a report
to that scratch API. It checks map zoom/keyboard controls, draft discard,
storage failures, recovery notices, logout, installability and the cold-offline
boundary. Optional `VERIFY_EVIDENCE_URL` reuses an existing owned-cloud QA image
for real worker/API delivery and idempotency; no new media is uploaded. Without
that value, real worker/media delivery is explicitly recorded as not run.

```bash
SCREENS_APP=http://localhost:3040 VERIFY_API=http://localhost:8087/api/v1 \
  VERIFY_SCRATCH=1 node tools/release-followup.mjs
```

Run against a **local, seeded scratch database**, with the backend on `:8080`
using the `demo` profile and `civictrack.demo.staff-password=demo1234`, and the
frontend on `:3000` pointing to that backend. Lifecycle scripts mutate issues and
some role audits create a citizen account; they are not production monitoring tools.
The public audit and complaint-tracking scripts keep civic records read-only.

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
| `complaint-tracking.mjs` | Read-only anonymous dashboard lookup against a real public complaint, normalised numbers, inline results, repeat lookup, blank input, missing numbers, loading/service failures, retry, merged complaints, public history links, five viewport sizes and an axe scan. Requires at least one complaint in the local demo API; run `node tools/complaint-tracking.mjs` from the repository root. Failure and merge cases use browser fixtures. |
| `public-audit.mjs` | General public dashboard, list/map, report, ward/grouping/outbox and authentication entry layouts at six sizes; filters/paging, keyboard/mobile navigation, category retry, empty map, photo preparation, draft recovery, keyboard pin, intercepted submit/recovery, idempotent retry, receipt errors and durable offline saving. Uses production frontend port 3003 (`SCREENS_APP` override) and a read-only API bridge. Civic writes, uploads and recovery use fixtures; background wake is simulated. Evidence: `artifacts/public-audit/`; scope/limits: `frontend/PUBLIC_VERIFICATION.md`. |
| `citizen-api-dryrun.mjs` | Local API and frontend auth-proxy checks for citizen ownership/role guards, reports/notifications paging, profile/preferences, password/session revocation, retired-authenticator refusal and static offline assets. Creates one isolated QA account per run; never submits complaints or writes messages/votes. Result: `artifacts/citizen-review/api-results.json`. |
| `citizen-ui-fixtures.mjs` | In-memory loopback API on port 8081 with 125 reports/notifications, verification, messages, profile/security and controllable failures. It never forwards authenticated requests or writes to the real API. Setup, cookie isolation, ordinary-build restoration, browser results and limits: `frontend/CITIZEN_VERIFICATION.md`. |
| `screen-consolidation.mjs` | Current grouped screens across five access contexts, responsive layouts, role navigation, list/map filter retention, seven legacy redirects, settings form payload/validation fixtures, permissions, internal scrolling, keyboard menus and accessibility. Uses the production frontend on port 3003 (`SCREENS_APP` overrides it), a browser-only CORS bridge to the demo API, and a fresh citizen account. Civic records are read-only; password/profile/MFA writes are browser fixtures. |
| `unified-workspace.mjs` | Current shared staff/supervisor `/work` screen at six desktop/tablet/mobile sizes, role-specific views, queue/detail focus and filters, legacy work deep links, proof validation/upload and assignment/transition fixtures, queue refresh, administrator CSV export, axe scans and real-demo screenshots. Uses production frontend port 3003 (`SCREENS_APP` override) with a browser-only CORS bridge. Civic writes and uploads are fixtures. Evidence is in `artifacts/unified-workspace/`. Both grouped-screen harnesses use `qa-session.mjs` to honor existing login Retry-After responses; backend limits remain unchanged. |
| `viewport-layout.mjs` | Six-size complaint-detail sizing, no unnecessary evidence/location scrolling, photo dialog focus, activity-tab keyboard access, complete long history, evidence retry, compact public/municipal/account/admin layouts, visible password fields/action, security views and accessibility. Uses real local demo data with read-only browser fixtures for long/error content. Screenshots/results are in `artifacts/viewport-layout/`. |
| `sweep.mjs` | Runtime and unexpected HTTP errors on every product route, anonymous and as CITIZEN, STAFF, SUPERVISOR and ADMIN. Includes recovery, offline outbox, profile/security/email preference, notification, verification, assignment, review, split/merge and admin configuration screens. Deliberate 404s are narrowly allowed; missing Cloudinary photos must render their fallback. |
| `features.mjs` | Local SMTP password reset, email preferences, cross-tab rotation, durable drafts/outbox, idempotency, admin save and mobile layouts. |
| `audit.mjs` | MFA/recovery/session controls, redirect/origin defenses, following/private messages, failed-write feedback, 70 authenticated responsive checks, 14 axe scans and manifest assets. Uses the axe-core installed through the frontend lint dependency tree. |
| `restore-design-audit.mjs` | Compares the isolated `main@011ecb5` source frontend on port 3002 with the restored production frontend on port 3003 (override `RESTORED_APP` if needed). Checks five access contexts, desktop/mobile screenshots, matching light tokens, OS/saved-theme invariance, native fields before hydration, accessibility and scroll containment. Uses a browser-only CORS bridge for secondary local ports; civic records are read-only. |
| `theme-audit.mjs` | All current routes across five access contexts at 390×844, 768×1024, 1280×600, 1366×768, 1440×900 and 1920×1080; fixed-appearance comparison, keyboard/scroll containment, axe scans and screenshots. Creates isolated citizen accounts but does not mutate existing issue data. |
| `theme-states.mjs` | Focused loading/empty/error/validation/success states, narrow/short layouts, menu focus return, internal scrolling, split/merge section geometry, chart/keyboard interactions, map equivalents and fixture-only sensitive write previews. |
| `browsers.mjs` | Firefox and WebKit public routes at 320/1280px, exactly one visible main heading with the expected route title, keyboard dialog navigation, Escape and runtime errors; attempts both engines and exits nonzero if either fails. `BROWSERS_APP` optionally selects an isolated frontend; the default remains localhost:3000. |

Current committed-light restoration checks are recorded in
[design restoration](../frontend/DESIGN_RESTORATION.md).
The newer grouped-screen structure and its checks are recorded in
[Screens](../frontend/SCREENS.md). Earlier menu-specific theme harnesses describe
the previous navigation; use `screen-consolidation.mjs` for the current grouped
screen and navigation assertions.

The cross-engine smoke waits for one **visible** main heading and checks its
expected text. Raw `h1` selectors can match hidden streaming/hydration content
as well as the displayed page. Selecting `.first()` would hide a genuine
duplicate-title defect; two visible headings still fail this check. Secondary
frontend origins must have matching API/CORS configuration when running locally.

Fresh cleanup checks and their limitations are recorded in the
[2026-11-06 project assessment](../docs/PROJECT_ASSESSMENT.md).

Recorded on 2026-10-27: contract, transitions, UI walk and sweep passed; the sweep
completed 190 checks with zero failures. Features and the final Chrome audit
passed, including 70 layouts and 14 axe scans with no violations. Firefox and
WebKit each passed 10 route checks and keyboard smoke. On macOS 27 the harness
automatically gives Firefox an isolated temporary CoreFoundation home to avoid
the upstream Playwright/Firefox shared-profile access defect.
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
original four plus the cross-browser smoke against a fresh PostGIS service and
gates Render deployment. It uses
`demo,seed`, which disables scheduled writers while the harness mutates its
fixtures. Browser checks cover routes and lifecycle actions; the backend suite
checks vote/quorum, split/merge, assignment guards and SSE behavior.

If a local corpus has no usable NEW Roads issues left, the lifecycle scripts
try CLOSED Roads locations and verify the resulting issue is actually NEW.
They fail clearly if another active cluster absorbs every attempted report;
reseed a scratch database in that case. They never reset a database themselves.

## Staff UI fixtures

`node tools/staff-ui-fixtures.mjs` starts a temporary API on `127.0.0.1:8081`.
It reads only public categories, wards and one public complaint from the local
API on port 8080. All authenticated responses and writes are in memory: 125
complaints, 125 notifications, profile/security, work transitions and clarification.
It never forwards authenticated calls, sends mail, or writes civic records.

Use an isolated frontend copy and browser session with `API_BASE` and
`NEXT_PUBLIC_API_BASE` set to `http://127.0.0.1:8081/api/v1`. Do not point the
ordinary frontend at this fixture or reuse its login cookie with the real app.
The disposable login is `fixture-staff@example.test` / `fixture-pass-1234`.
`POST /api/v1/__qa/control` accepts `fail`, `recover` (method plus API path), and
`empty` to exercise failures and empty queues. GET returns sanitized captured
writes and the current fixture IDs. Restarting the process resets all fixtures.
This fixture exercises UI behavior; real lifecycle and access rules are checked
by backend integration tests. See [the staff dry run](../frontend/STAFF_VERIFICATION.md).


## Supervisor UI fixtures

`node tools/supervisor-ui-fixtures.mjs` uses the same disposable port and isolation
rules as the staff fixture above. Stop the other fixture first. Public categories,
wards, one complaint and ward metrics are read from localhost:8080; authenticated
responses and all writes remain in memory. It supplies 225 complaints/grouping
reviews, 125 notifications and a 30-person synthetic team for layout stress checks.
The fixture refresh endpoint supplies a supervisor session; its disposable login
is `fixture-supervisor@example.test` / `fixture-pass-1234`.

Use a separate frontend copy at `http://127.0.0.1:3003` with both API bases set to
`http://127.0.0.1:8081/api/v1`, isolated from the normal localhost cookies. Failure
and empty-state controls are the same as the staff fixture. No authenticated
request, mail or civic-record mutation is forwarded to the real backend.
The fixture does not replace real lifecycle/geometry/permission integration tests.
See [the supervisor dry run](../frontend/SUPERVISOR_VERIFICATION.md).


## Administrator UI fixtures

`node tools/admin-ui-fixtures.mjs` provides a disposable API at `127.0.0.1:8081`.
Stop any staff/supervisor fixture first. It reads only public sample data from the
normal local API. Configuration records/history, users, 225 complaints (100
resolved), 165 audit rows, 125 notifications and a 30-person team are synthetic.
All authenticated responses and mutations stay in memory; no civic record,
profile, password, reporter message or mail is forwarded to the real API.

Use an isolated frontend copy at `http://127.0.0.1:3003` with both API bases set to
`http://127.0.0.1:8081/api/v1`; do not repoint the ordinary localhost frontend.
The initial fixture refresh supplies an admin session. Login, if needed, is
`fixture-admin@example.test` / `fixture-pass-1234`. The staff fixture's fail,
recover and empty controls also apply. `failOnce` plus `status` can exercise one
401 CSV response and session recovery. GET `/api/v1/__qa/control` exposes sanitized
captured operations and refresh count. Restarting resets the fixtures.

The fixture tests UI requests/feedback. Real permissions, geometry, lifecycle,
configuration constraints, evidence/history and CSV escaping are checked by the
backend integration tests. See [the administrator review](../frontend/ADMIN_VERIFICATION.md).


Administrator fixture closure supports every nonterminal state for isolated UI
checks. Open fixtures start without resolution timestamps or proof. The action
keeps the original from-state in history and audit; it does not fabricate a repair.
Real role, metrics, notification and verification behavior is covered by
`AdminClosureIT` on a separate PostGIS database.


`admin-ui-fixtures.mjs` also supports `QA_ROLE=CITIZEN` for isolated report-expiry
checks. `POST /__qa/control` can refuse one reports or refresh request; refreshes
return a new fixture token. `reportAttempts` records fixture headers/body/key to
check identity-preserving retries. Never point this mock at production; it is not
role-authorization evidence. A temporary UI-only prepared-draft route was used
for browser checks of an already-uploaded image, without changing the real app.
