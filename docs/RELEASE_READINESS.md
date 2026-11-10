# Release verification — 10 November 2026

Subsequent scope update: the user retired authenticator setup and requirements
for all roles. [Password-only verification](PASSWORD_AUTHENTICATION.md) records
386 backend passes/2 optional skips, 115 frontend passes, lint/types/build and
24 local Security layouts. `8b78d02` was pushed and deployed on Vercel, but its
CI WebKit smoke failed on cancelled background prefetch reads. The bounded
navigation-settling correction passed three deployed repetitions while retaining
runtime-error detection. New release CI and the complete live role handoff are
still pending; the earlier release results below retain their dated scope.

Subsequent [daily-use rehearsal](DAILY_USAGE_VERIFICATION.md): 20 workflow checks,
30 layouts, actual hosted photos and independent SQL verification passed against
disposable data. The full citizen-to-administrator closure and signed-in offline
delivery were exercised. A minor staff label correction and the new harness/report
are part of the publication follow-up; deployed WebKit rapid-navigation smoke has
an explicit limitation. Fresh deployed results will be recorded separately from
this local rehearsal.

## Final application release result

**Scope decision — 10 November:** the user will access the site in a normal
browser only. Chrome/PWA installation and standalone installed-app verification
are excluded from current completion requirements. The unsuccessful attempts
below remain historical evidence, not an open blocker. Existing manifest,
icons and service-worker reporting functionality are retained.

Application source: **`a728d3500383e602fd064a284c2405a31851516f`**, pushed to
`origin/main`. This includes Patiala/map release `935a30f`, mail deferral
`d684390` and the tied-timestamp evidence-order correction. The
[final CI run](https://github.com/vanshnanda08/NagrikSetu/actions/runs/42686876733)
completed successfully: full PostGIS backend suite, frontend lint/types/tests/build,
API contracts/browser journeys and the Render deployment trigger. Vercel's status
for this application commit is also successful. The deploy hook's result alone
is not proof of a completed backend rollout; live checks below verify the service
and Patiala data, without claiming a directly observed backend commit identifier.

| Final check | Observed result |
|---|---|
| Isolated full backend suite | **383 total: 381 passed, 2 optional evaluations skipped**, zero failures/errors |
| Deferred-mail regression with `MAIL_ENABLED=true` | All 3 focused deploy-profile tests passed; literal `enabled: false` wins over the retained variable binding |
| Frontend | **115 tests passed**; ESLint and TypeScript passed locally; production build and all frontend gates passed in final CI |
| Cross-engine/API CI | API contracts, role route journeys, Firefox and WebKit checks passed |
| Live API | Health 200 / UP; ward API returns all four Patiala/Thapar sectors |
| Real photo/report | Actual browser upload to Cloudinary returned 200; actual report API returned **201**; receipt, public reads and hosted photo returned successfully |
| Loaded evidence | Thumbnail loaded at 960×640; full photo dialog opened and closed with Escape; real map tiles loaded; loaded complaint inspected at 1280×768 and 390px width |
| Native installation | **Out of scope by user decision**; earlier attempts were unsuccessful, not a passing installation check |

### Retained, explicitly authorized QA record

Exactly one public QA complaint was created: **CT-2026-000918**, issue
`863c722d-2cd0-44cc-b4dc-08fd3c6c18f1`, Ward 1 — Thapar North West.
[Open its public detail](https://nagrik-setu-vn.vercel.app/issues/863c722d-2cd0-44cc-b4dc-08fd3c6c18f1).
The prepared image and description explicitly say **synthetic test, no civic
problem, no municipal action required**. The test used simulated coordinates
and a manual demo pin, not the user's actual location. It used the deployed UI,
normal compression/upload and strict server evidence verification, with no
response fixtures. No production account was created. The QA ticket/photo remain
as authorized evidence; no complaint history or media was deleted, and no further
test submission is required. There were zero observed application runtime errors
in this live journey. This verifies the photo flow, not every production role action.

Local evidence (ignored by Git): `artifacts/release-20261110-010413/`.
Raw request logs contain submission identifiers and are not published. Captures:

- [Live receipt](../artifacts/release-20261110-010413/live-qa-receipt-1280.png)
- [Loaded desktop detail](../artifacts/release-20261110-010413/live-qa-detail-loaded-1280.png)
- [Loaded mobile detail](../artifacts/release-20261110-010413/live-qa-detail-loaded-390.png)
- [Full evidence dialog](../artifacts/release-20261110-010413/live-qa-photo-dialog.png)

### Remaining limits

- Historical installation result (now out of scope): Chrome's exported diagnostics record
  `kCancelledDueToMainFrameNavigation` for two install attempts. Chromium can use
  this result for navigation or a hidden tab; it does not identify the cause of
  every user attempt. Manifest installability checks passed, but no successful
  OS installation or standalone installed-app use was observed. No browser flags,
  security settings or profile files were changed. Chrome's original full-screen
  layout was restored after the windowed retry.
- No physical phone was available for real camera/GPS/permission checks.
  Closed-browser background execution remains platform-dependent. Cold offline
  app-shell reload is unsupported by the current worker; warm offline reporting
  and later delivery have separate passing evidence below.
- Complete manual WCAG certification, newly repeated backup recovery and every
  untested case in the older audit are not implied by this release result.
  Destructive Cloudinary cleanup remains opt-in after dry-run review.
- Email delivery and email-based recovery remain intentionally deferred. The
  released `deploy` profile enforces mail off even with a retained
  `MAIL_ENABLED=true`; credentials/future mail code remain. Private Render
  environment values and the live mail worker were not directly inspected.
- Free-tier startup delay remains an operational limit: an earlier real cold
  start took 152.5 seconds. Retries/keep-alive improve recovery, not guaranteed uptime.

## Historical pre-release records

The records below describe the 8 November local snapshot and the earlier
10 November checks. Their unreleased/photo-pending/CI-pending statements are
superseded by the final result above only for the explicitly verified cases.

## Release follow-up — 10 November 2026

The reviewed Patiala/map release was committed and pushed as `935a30f` at the
user's request to finish the remaining work. CI/deployment verification is in
progress. The earlier uncommitted/pre-deployment statements below are dated
historical records. A follow-up deployment-profile correction keeps email
delivery off for this deferred-email release even if the retained Render
`MAIL_ENABLED` variable remains true; provider credentials and the future email
implementation are preserved. Restore the environment binding deliberately as
part of the future verified-mail release. The private Render environment
variable itself has not been changed by this correction.

Release CI then exposed an existing timestamp-tie bug in public report ordering:
`PublicApiIT.reportsCarryTheAuditTrail` could receive merged evidence before the
originating report when both had the same timestamp. Report reads and the queue's
first-landmark lookup now use creation time, originating-report preference for
ties, then UUID. The regression forces reversed UUIDs and also verifies creation
time still takes precedence. A fresh isolated full suite passed **383 total:
381 passed, 2 optional evaluations skipped**, zero failures/errors. CI must be
rerun on this fix; the earlier failed run is retained as historical evidence.

## Hosted recheck — 10 November 2026

The user supplied startup/runtime logs covering 8–9 November UTC. They show
successful database connections and application startup in 141.103, 145.903 and
153.401 seconds, with graceful shutdowns later and no ERROR entries. The shutdown
timing is consistent with the free service's idle spin-down; the logs alone do
not establish the cause of every shutdown.

A fresh extended health request on 10 November returned **HTTP 200 / UP after
152.5 seconds**. Subsequent category, ward and dashboard-summary reads all returned
200 in 3.29–6.48 seconds with the correct Vercel CORS origin. The previous short
timeout probes therefore did not establish a persistent backend failure.

A deliberately invalid photo URL with coordinates outside all demo wards was
rejected with 422, “Use a photo uploaded through this application.” This confirms
the photo-verification guard is active and its cloud setting is nonblank; it does
not independently establish that the configured cloud matches the browser or
that a genuine photo submission succeeds. No complaint was created. The user
separately confirmed the backend cloud name is `fjavyddc`.

The live ward API still returns the four Ludhiana demo names and the supplied
startups used schema V10; the local Patiala V11 update remains unreleased. Logs
show mail delivery enabled, so `MAIL_ENABLED=false` still needs operator review
to match the deferred email scope. Native/device checks, a genuine deployed photo
submission and release of local changes remain open. No commit/push/deployment or
production configuration change was made during this recheck.

This is a local verification record against `dbd7e0883d6a4843a066ee2b3ea285b69a7a1bdb`
plus the current uncommitted working tree. No commit, push or deployment was
performed. Existing application files, the ordinary localhost frontend and the
original database were preserved. Historical reports retain their original results;
this record supersedes only the individual cases explicitly checked here.

## Completed implementation

- Reviewed the pending Patiala/Thapar changes. V11 moves the four illustrative
  ward sectors without changing ward IDs, officer assignments, existing complaint
  GPS coordinates or evidence. The existing V10-to-V11 integration test exercises
  a real upgrade and checks preservation. These are demo sectors, not official
  municipal boundaries. Existing Ludhiana complaints remain at their real locations.
- Report maps start at zoom 15 and retain a chosen zoom after pointer or keyboard
  pin placement. Explicit zoom changes in other map callers still apply.
- Custom map markers activate with Enter and Space, including the same detail or
  popup action as a pointer click. The Leaflet import remains client-only.
- A selected map complaint remains open when opening its panel changes the map's
  bounding box. Closing the panel or changing its filters clears the selection.
  This prevents a disappearing/oscillating detail panel during resize/refetch.
- Password-recovery routes show that email recovery is deferred. They offer no
  unavailable form by default. Existing recovery logic is retained behind
  `NEXT_PUBLIC_EMAIL_RECOVERY_ENABLED=true` for a future verified-mail release.
  Signed-in password changes remain available.
- Fixed test isolation: `DeployProfileIT` enables the real production SLA cron,
  so it now closes its Spring context after the class. In the initial full run,
  its cached scheduler actually escalated seed fixtures at 20:15:00 IST, causing
  the reproducibility assertion to fail. Production scheduling/policy was not changed.
- The keep-alive workflow retries cold starts and fails when health or the
  database-backed request remains unavailable. It no longer reports a green run
  after an unavailable database-backed request. It was subsequently pushed in `935a30f`.
- Updated current deployment links, V11/service-area notes, frontend environment
  example and verification tools. No backend authorization, lifecycle, API contract,
  authentication, original-account ownership or media-verification protection was removed.

## Checks completed

Builds ran in a source-only temporary copy with independent `.next` and `target`
directories. Backend tests used disposable Testcontainers PostGIS. Browser checks
used a separate seeded PostGIS container on port 55446, API 8087 and frontend 3040.
Mail delivery was disabled in the scratch API. No production complaint/account
was created, edited or deleted.
Local Maven used Java 26.0.2.1 and the scratch server used Java 25.0.4; the
repository's JDK 21 CI has not run against this uncommitted snapshot.

| Check | Result |
|---|---|
| Full backend `mvn clean package` | 381 total: **379 passed, 2 optional evaluations skipped**, zero failures/errors |
| Frontend Vitest | **115 passed**, 16 files |
| Actual API/TypeScript contract harness | Passed with no missing/unexpected fields against the scratch API |
| ESLint and TypeScript | Both passed |
| Production frontend `npm run build -- --webpack` | Passed after the final map changes |
| Consolidated-screen Chromium audit | **116 layout checks, 21 interactions/redirect checks**; zero runtime errors or actionable axe findings; one spatial-marker exception with an equivalent accessible list |
| Public Chromium audit | **71 checks**, zero runtime errors or automated accessibility findings; actual reads and isolated browser write/upload fixtures |
| Firefox and WebKit | Each passed 10 route/width checks plus sign-in dialog Tab/Escape checks; this run preceded the final selection-retention change, which was checked in Chromium |
| Focused follow-up | Pointer/keyboard zoom preservation; Enter/Space markers; durable draft discard; deferred recovery notices; quota and unavailable IndexedDB errors; actual citizen password change and old-password refusal; logout to the public dashboard |
| Real worker/media delivery | A prepared local outbox job delivered through the actual service worker, Next proxy and API; the API fetched/decoded an existing owned-cloud QA photo with evidence verification enabled; replay retained the same ticket; stored photo/body cleared after sending |
| Chromium installability | No installability errors in an isolated regular Chrome profile; native OS installation was not completed |
| Cold offline reload | Actually checked with HTTP cache disabled: the app shell cannot reload offline because the worker deliberately has no asset cache. This is a confirmed limitation, not an offline-shell pass |
| Keep-alive workflow | Shell syntax passed; healthy local API exited 0; a controlled database-backed HTTP 503 exited 22 after retries |
| Whitespace check | `git diff --check` passed |

Responsive checks covered 1280×600, 1366×768, 1440×900, 1920×1080,
390×844 and 768×1024. Desktop checks asserted no outer-page or horizontal
overflow. Mobile uses natural page scrolling. Internal list/form scrolling,
role navigation, menus, keyboard dismissal and redirects were exercised.
Representative screenshots were visually inspected for public dashboard,
citizen reports/security, loaded staff work actions, supervisor performance
and administrator configuration. Screenshots are local evidence, not deployed screenshots.

The initial failing seed run and exploratory harness failures are retained;
they are not counted as passes. Three diagnostic repetitions and a full diagnostic
rerun passed before the scheduler cause was identified; the final full run passed
after the context-lifecycle correction. The first installability probe used an
incognito context and correctly reported `in-incognito`; the final probe used a
new regular profile. No user browser profile was modified.

## Hosted service: original 8 November blocker

The frontend at <https://nagrik-setu-vn.vercel.app/dashboard> returned HTTP 200.
The latest GitHub CI run for committed `dbd7e08` is green; it does not cover this
uncommitted tree. Render's previously loaded deployment details identify a
successful `dbd7e08` deployment and schema V10. They do not prove current availability.

Repeated current health, liveness, readiness, category, ward and summary probes
timed out. Render's environment page also failed to finish loading through the
available browser connection, so current private configuration could not be
verified or corrected. No root cause for this hosted outage is established.

Required operator follow-up, in order:

1. Open the Render service's current events and runtime logs. Confirm the service
   is running and the database is available; use the documented Supabase session
   pooler connection. Check whether public health opens from another connection.
   Do not rotate credentials or rewrite database history merely to diagnose a timeout.
2. Confirm backend `CLOUDINARY_CLOUD_NAME=fjavyddc` matches the deployed browser
   cloud and keep `VERIFY_PHOTO_EVIDENCE=true`. The earlier photo error specifically
   came from a missing backend cloud name. Existing startup logs also showed mail
   delivery enabled; verify `MAIL_ENABLED=false` to retain the agreed email deferral.
   No outbound email was triggered by this follow-up.
3. Once hosting is healthy, release the reviewed local changes through the normal
   authorized Git/CI/deployment process. Apply V11 normally through Flyway on boot;
   never edit V2 or use manual Flyway repair. The seed runner must not replace an
   existing complaint corpus. A schema rollback requires an intentional plan.
4. Confirm live health and database-backed reads, exact Vercel CORS origin,
   authenticated login and a deliberately identifiable test-photo submission.
   Record its ticket and result without publishing credentials. Production photo
   submission has **not** been verified by the local worker/media check.

## Remaining physical/platform boundaries

- Physical-phone browser camera/GPS/permission behavior remains unverified;
  the available device was a desktop/laptop.
- Native PWA installation was unsuccessful and subsequently excluded from
  scope by the user on 10 November. It is no longer an open completion check.
- Closed-browser background execution depends on the browser/OS and is not
  guaranteed. Warm-tab offline persistence/delivery passed; cold offline navigation
  requires future app-shell caching work if that becomes a requirement.
- Fresh automated axe and keyboard checks passed for the inspected screens.
  A complete manual screen-reader/WCAG certification was not performed.
- Other individually untested scenarios in the original end-to-end matrix
  remain open unless explicitly superseded above; this is not a blanket production sign-off.
- Email delivery and email-based recovery remain intentionally deferred, not
  current completion blockers. Cloudinary destructive cleanup remains opt-in
  after dry-run review; no media was deleted.

Local artifacts (ignored by Git):
`artifacts/release-check-20261108T201222/` contains command logs,
`screens-consolidation/results.json`, `public-audit/results.json`,
`release-followup/results.json`, screenshots, installability output,
keep-alive checks and public production-probe results. Reproducible tools remain
in `tools/`; the large screenshots/logs are not added to Git.

Representative captures:

- [Public dashboard](../artifacts/release-check-20261108T201222/screens-consolidation/guest-0-1280.png)
- [Citizen reports](../artifacts/release-check-20261108T201222/screens-consolidation/CITIZEN-0-1280.png)
- [Loaded staff work actions](../artifacts/release-check-20261108T201222/screens-consolidation/STAFF-1-1280.png)
- [Supervisor performance](../artifacts/release-check-20261108T201222/screens-consolidation/SUPERVISOR-2-1280.png)
- [Administration](../artifacts/release-check-20261108T201222/screens-consolidation/ADMIN-0-1280.png)
- [Citizen security on mobile](../artifacts/release-check-20261108T201222/screens-consolidation/CITIZEN-3-390.png)
