# Citizen review — 7 November 2026

**Scope update — 7 November 2026:** email notifications and email-based password
recovery are deferred to a future update. Provider setup and live delivery/reset
checks are excluded from current completion requirements. Existing code and the
historical verification results below are retained. In-app notifications and
signed-in password changes remain in scope.

The citizen frontend was reviewed against the running localhost application and
an isolated UI fixture service. The existing light appearance and shared public
screens remain. The original dry run left the real citizen account signed in on
the Dashboard; the subsequent security simplification is recorded below.

## Logout destination follow-up

Successful sign-out now clears the current auth/query state and replaces the
current page with the public `/dashboard`, independent of role or the page being
viewed. The existing failure handling and backend session revocation are retained.

Five live Chrome checks passed: staff complaint details, staff My work,
supervisor Needs review, administrator Audit log and citizen Security using the
mobile menu. Every case reached the exact public Dashboard URL with Sign in and
the anonymous complaint tracker visible. Device-specific revoke buttons were
not used. Lint, TypeScript, all 88 frontend tests and the production build passed.
Evidence is in `artifacts/logout-navigation/results.json` and
`public-dashboard-after-logout.jpg`. The public dashboard was left open.

## Subsequent citizen security simplification

Ordinary citizen accounts now see password changes and signed-in devices directly,
without authenticator enrollment or an unnecessary tab switch. App-install
information remains available. Municipal accounts retain their authenticator
interface. A citizen with MFA already enabled retains its status and existing
sign-in protection; no enrolled factor was disabled and backend endpoints remain
unchanged.

The updated citizen page passed six viewport checks at the same sizes listed
below. Password/device controls were visible, enrollment controls were absent,
and desktop/mobile scrolling remained correct. Fresh lint, TypeScript, all 88
frontend tests and the ordinary production build passed. This small UI change
did not rerun the earlier backend/API suite. Evidence: `security-simplified-results.json`,
`security-simplified-1280.jpg` and `security-simplified-390.jpg` under
`artifacts/citizen-review/`. The citizen security page was left open for review.

## Fixes

- **My reports:** previous/next paging reaches submissions beyond the first 50.
  Counts show the visible range, pages reset the internal list position, and
  an empty later page provides a return to the latest reports. Failed requests
  for fixes awaiting confirmation now show an explicit retry.
- **Notifications:** newer/older pages use the API's offset. The old expanding
  limit stopped progressing at the server's 100-entry cap. Mark-read failures
  now show the server message and retry the failed action. Long lists retain
  internal scrolling and accessible pagination.
- **Account settings:** citizens no longer see the municipal-only "A citizen
  answered a question" preference. Existing saved preferences are preserved.
  Security and email-preference loading failures now have retry controls.
- **Clarifications:** failed message loading now offers retry.
- **Verification:** before/after photographs use the shared full-size evidence
  dialog, with uncropped previews, keyboard dismissal and focus return. Voting
  eligibility, two-step choices, payloads and tally rules are unchanged.
- **Copy and layout:** session/notification ages no longer say "Reported";
  merged-report copy handles one person. The signed-in dashboard uses its freed
  tracker space for a larger chart while keeping the chart/table control visible.

## Checks actually completed

| Check | Result |
|---|---|
| Live citizen layouts | **66 checks**: 11 screens/views at six sizes |
| Final signed-in dashboard sizing | **6 additional checks**, after adapting chart height |
| Populated UI fixtures and interactions | **53 checks** recorded in `fixture-results.json` |
| `node tools/citizen-api-dryrun.mjs` | **20 groups passed**, using isolated QA accounts |
| Targeted backend tests | **53 passed**, 0 failures/errors/skips, in separate Testcontainers PostGIS |
| `npm test` | **88 passed** across 13 frontend files |
| `npm run lint` | Passed without warnings |
| `npx tsc --noEmit` | Passed |
| `npm run build` | Passed with the ordinary application environment restored |
| Live CDN evidence probe | API downloaded/verified an existing photo; deliberately invalid accuracy then rejected the request before complaint creation |
| `git diff --check` | Passed |

Viewport sizes: **1280×600, 1366×768, 1440×900, 1920×1080, 390×844,
768×1024**. Live screens covered Dashboard, My reports, Notifications,
Profile & preferences, Security, Report a problem, Explore list/map, complaint
details, verification and the outbox. There was no horizontal page overflow or
outer desktop scrolling at the specified desktop sizes. Mobile uses natural
scrolling; long desktop lists/forms remain in internal panels.

The UI dry run checked 125 reports and notifications, final-page disabled
controls, notification failure/retry and badge refresh, eligible verification,
both verdicts, failed-vote preservation, recorded answers, follow/unfollow,
clarification replies/thread refresh, photo dialogs, profile-save failures and
retry, security/email/verification-list loading retries, citizen-only preferences,
required report fields, keyboard pin placement, photo compression, restored
photo/text drafts, failed authenticated submission and retry to the receipt.
Keyboard menu and tab navigation and control names were also inspected.

The API dry run checked registration/refresh/logout, role/ownership guards,
profile/contact/preferences, mandatory verification preferences, email-preference
save/restore, notifications/read counts, report paging, verification ineligibility,
private-message protection, devices, individual/other-device revocation, password
change/session invalidation, real TOTP enrollment, MFA login and recovery login.
It creates QA accounts but never submits civic complaints or casts votes.

Backend command, run from `backend`:

```sh
mvn -Dtest=MyReportsIT,ProfileIT,AuthApiIT,SecurityFeaturesIT,IssueEngagementIT,VerificationLoopIT,VerificationSweepIT,VerificationTallyTest,ReportSubmissionIT,ReportIngestApiIT test
```

## Evidence and limits

Evidence is local and gitignored under `artifacts/citizen-review/`:

- `live-layout-results.json`, `final-dashboard-results.json`, `fixture-results.json`
- `api-results.json`, `photo-verification-probe.json`
- `dashboard-final-1280.jpg`, `dashboard-final-390.jpg`
- `me-reports-1280.jpg`, `profile-1280.jpg`, `profile-390.jpg`, `security-1280.jpg`
- `fixture-reports-1280.jpg`, `notification-retry-1280.jpg`
- `verification-full-photo-1280.jpg`, `fixture-receipt-1280.jpg`

Chrome extension file input remained blocked even after file access was reported
enabled. A photo subsequently present in the browser form allowed the compression,
draft and submission tests to complete; scripted `setFiles` itself is **not** a
passed check. The test frontend used placeholder hosting, so it did not upload
that photo to Cloudinary. The separate live CDN probe exercised server evidence
verification without creating a complaint.

This was a Chrome review, with native accessibility/keyboard inspection. It did
not rerun Firefox/WebKit, a fresh axe scan, a screen reader, physical devices,
installed PWA behavior, network-offline background delivery, live email delivery
or triggered SSE event updates. Chrome recorded extension message-channel errors
during the file/extension interaction; these are retained as a tooling limitation,
not reported as an entirely clean console.

The real account's password, MFA and notification preferences were not changed.
Real UI profile save used unchanged values; security mutations used isolated QA
accounts. Civic writes in the browser used an in-memory fixture API on port 8081;
actual lifecycle tests used a separate test database. The backend working-tree
diff matches its pre-review snapshot. No civic complaints were submitted, private
messages posted, votes cast or issues transitioned by the live audit. Existing
application background jobs continued normally.

The fixture frontend/API were stopped, the normal production build was restored,
and localhost:3000 / localhost:8080 were retained. No commit, push or deployment.

## Reproducing isolated UI fixtures

`tools/citizen-ui-fixtures.mjs` serves synthetic citizen data on loopback port 8081;
it only reads public reference/dashboard data from the real API at startup. Use a
separate browser profile when reproducing, since localhost auth cookies are shared
between ports. In this review the agent signed out before fixture testing and
restored the real citizen login afterward.

Build a temporary production frontend with `NEXT_PUBLIC_API_BASE` and `API_BASE`
set to `http://127.0.0.1:8081/api/v1`, and empty public Cloudinary cloud/preset
variables. Run it on port 3003 with the same `API_BASE`, and access it through
`http://localhost:3003`. The fixture login is `fixture-citizen@example.test` with
any nonempty password. This is a disposable local UI fixture, not an application
account or deployable service. Stop it and run an ordinary `npm run build` to
restore the normal production output after testing.
