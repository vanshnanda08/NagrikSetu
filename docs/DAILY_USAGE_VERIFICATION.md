# Daily-use rehearsal — 10 November 2026

## Deployed browser follow-up — 11 November 2026

**Passed: 16 live workflow groups and 30 layout checks**, with zero observed
application runtime errors. Application source **`6846b1b6bbb334db3eeec3dc2a40e7ea6a96ec39`**
is pushed; [all four CI jobs passed](https://github.com/vanshnanda08/NagrikSetu/actions/runs/42888337244) and Vercel reports success.
Authenticator removal is in `9ea7852`; the following commit fixes browser-smoke
prefetch cancellation without suppressing page errors. Password-only behavior
was verified on the live backend; its internal commit identifier was not exposed.

One new QA citizen was registered through the deployed UI. Exactly one new
clearly labelled synthetic complaint was submitted for this role-handoff run:
**[CT-2026-000919](https://nagrik-setu-vn.vercel.app/issues/d30419d1-9755-45a7-bb85-a1e58f7a7727)**, issue
`d30419d1-9755-45a7-bb85-a1e58f7a7727`. It remains as authorized QA evidence,
marked **no municipal action required**. Earlier QA ticket CT-2026-000918 was
not changed. All actions used normal sign-in/refresh, real role permissions,
actual browser controls and unmocked deployed services. No production SQL,
account-role edits or lifecycle bypasses were used.

| Live daily action | Observed result |
|---|---|
| All four roles sign in and read their allowed workspace | Password-only access; no setup restriction |
| Citizen chooses photo, category, description and manual demo pin | Real Cloudinary upload 200; report 201; new-issue receipt |
| Citizen opens My reports and original evidence | Exactly one owned report; hosted original returns 200 |
| Supervisor acknowledges and assigns Roads crew | NEW → ACKNOWLEDGED → ASSIGNED |
| Assigned staff starts and requests clarification | IN_PROGRESS; citizen receives notification |
| Citizen replies privately | Staff sees reply; public page does not expose it |
| Staff tries empty repair proof, then submits evidence | Validation prevents empty submission; real proof upload 200 |
| Citizen rejects first repair | REOPENED; no false confirmation or closure |
| Staff restarts and submits corrected proof | New verification round; third real photo upload 200 |
| Citizen confirms corrected repair | RESOLVED; resolvedWithoutVerification is false |
| Administrator cancels, then confirms closure with reason | Cancellation preserves resolution; confirmation closes once |
| Administrator filters this ticket and exports CSV | Actual export includes the recorded closure reason |
| Citizen/public reload; public history rechecked independently | CLOSED persists; nine expected transitions, one closure |
| Citizen tries assignment/closure; staff tries closure | All three requests return 403 |
| All four roles sign out | Normal public dashboard opens |

Public detail, citizen reports, staff work, supervisor assignments and the
**ticket-filtered** administrator audit were checked at **1280×600, 1366×768,
1440×900, 1920×1080, 390×844 and 768×1024**. All 30 document-size assertions passed:
no horizontal overflow and no desktop outer scrolling; long content remains in
internal panels and mobile uses natural scrolling. Public captures waited for
actual photos and map tiles. Public desktop, staff desktop and supervisor mobile
captures were visually inspected. Password-only Security was additionally checked
on all four deployed roles; citizen desktop/mobile layouts, actual revocation of
old QA sessions and logout passed.

Fresh local code gates: **386 backend tests passed, 2 optional evaluations skipped;
115 frontend tests passed**, plus ESLint, TypeScript and production build. The
latest CI also passed backend, frontend, API/role/browser journeys and the Render
hook. Firefox and WebKit each passed 10 responsive public-route checks plus login
dialog keyboard/Escape. A deliberate JavaScript-error fixture still fails both
engines as expected. Earlier quiet-period WebKit attempts failed Linux CI and
are retained as historical failures; the document-retention follow-up passed.

The repeated QA sign-ins reached the normal five-attempt/15-minute account limit.
The test respected Retry-After and resumed with saved sessions; no limit was
relaxed. An initial submission encountered a network failure and displayed a
queued outbox job before any receipt was created. The final persistent-browser
attempt completed the full journey. This deployed run does **not** certify
production offline replay; authenticated warm-browser offline delivery was
verified in the disposable rehearsal below. Physical phone camera/GPS and a full
manual accessibility certification remain unverified. Email delivery/recovery
remain deferred; native installation is excluded by the user's browser-only scope.

Evidence is retained locally, ignored by Git, in
`artifacts/deployed-journey-20261110/`: `live-journey-results.json`,
`public-final-verification.json`, `live-qa-audit.csv`, browser logs and captures.
No passwords, tokens or private browser profiles are published.

- [Public closed complaint, desktop](../artifacts/deployed-journey-20261110/live-public-detail-1280x600.png)
- [Public closed complaint, mobile](../artifacts/deployed-journey-20261110/live-public-detail-390x844.png)
- [Citizen reports, mobile](../artifacts/deployed-journey-20261110/live-citizen-reports-390x844.png)
- [Staff complaint workspace, desktop](../artifacts/deployed-journey-20261110/live-staff-work-1280x600.png)
- [Supervisor complaint workspace, mobile](../artifacts/deployed-journey-20261110/live-supervisor-work-390x844.png)
- [Administrator filtered audit, desktop](../artifacts/deployed-journey-20261110/live-admin-audit-1280x600.png)

The following sections describe the earlier disposable-data rehearsal.

## Result and scope

The citizen → supervisor → staff → citizen verification → administrator closure
journey passed. **20 workflow/continuity checks and 30 responsive layout checks
passed**, with zero application runtime errors in that local journey. Independent
database reads agreed with the screens and API responses.

Pre-publication baseline: `4c25b0449fb1f85f4eebef43e38d3f9f95ae648c`
(application source `ac904be945fa35b5ce2eecdfe48a86c46cc7a721`), including the existing
uncommitted browser-only documentation decision. The only application correction
is **“1 complaints” → “1 complaint”** in the staff queue. No API, authentication,
permission, clustering or lifecycle rule changed. Added reusable browser harness:
`tools/daily-journey.mjs`. This record describes the local rehearsal; subsequent
publication and deployed verification are recorded separately in release readiness.

Authenticated writes used a **disposable local database**, an independent
production frontend build and separate browser contexts for each actor:
API `:8088`, frontend `:3041`, PostGIS `:55447`. Citizens registered/signed in
through the real UI. Municipal accounts used the local demo profile's documented
MFA exception; this does not certify deployed municipal login/MFA. Production
verification/closure durations were retained, with scheduled writers disabled.
Closure used the real administrator action after citizen confirmation; the normal
seven-day automatic-closure wait was not performed.

Clearly labelled synthetic QA images were actually compressed, uploaded to the
configured Cloudinary cloud and verified by the backend. GPS was simulated and
manual pins placed in the demo wards. Hosted QA uploads remain; no media was
deleted. Existing production complaints and ordinary local services/database
were not mutated. Deployed-site browser checks were read-only.

After evidence capture, the owned test processes, disposable database, snapshot
and private browser session files were removed. The original frontend on `:3000`
and `civictrack-db` were verified preserved; see local `cleanup.json`.

## Principal complaint

**Local CT-2026-000001**, issue `039cbbae-d15f-45a0-88c0-ffd9dcb65873`.
This is a disposable-database reference, not the same-numbered production ticket.

| Daily action | Observed result |
|---|---|
| Citizen registers/signs in and reloads | Session restored; anonymous tracking card absent |
| Citizen chooses category, photo, description and pin | Real upload, report HTTP 201 and receipt navigation |
| My reports and evidence | Own report reachable; hosted photo HTTP 200 |
| Second citizen reports the same defect | Same issue; both reports and distinct reporters retained |
| Supervisor acknowledges and assigns Roads crew | ACKNOWLEDGED → ASSIGNED through the real UI |
| Assigned staff starts and requests information | IN_PROGRESS; citizen notification and private question |
| Citizen replies | Staff sees reply; public page does not expose it |
| Staff submits empty repair form | Required photo/note errors; no status change |
| Staff uploads first repair proof | PENDING_VERIFICATION with real hosted proof |
| Citizen chooses Not fixed | REOPENED, not closed or counted as confirmed |
| Staff restarts and supplies corrected proof | New PENDING_VERIFICATION round |
| Citizen chooses Fixed | RESOLVED; `resolved_without_verification=false` |
| Admin cancels closure, then confirms with a reason | Cancel leaves RESOLVED; confirmation closes exactly once |
| Admin filters audit and downloads CSV | Actual CSV contains closure reason |
| Citizen, staff and public reload | Closed state persists; clarification remains private |
| Citizen tries assignment/closure; staff tries closure | All three unauthorized API actions return 403 |
| Each signed-in role signs out | General public dashboard opens |

Independent SQL verified two reports with server-verified photo hashes, two
reporters, NOT_FIXED in round 1, FIXED in round 2, one reopening, nine expected
transitions, one administrator closure and two CLOSED notifications. Both
resolution and closure timestamps were retained.

## Other daily tasks

Follow/unfollow preserved report count and priority. Mark all notifications read
worked. Profile name saved and survived reload.

A report composed in a warm, signed-in browser while offline remained in the
outbox. After reconnect and Retry now, it became Sent and survived reload.
**Local CT-2026-000003** had exactly one report owned by the original citizen,
verified independently in SQL. Final rebuilt-UI smoke also acknowledged and
assigned this delivered complaint; staff saw **1 complaint** and Start work.

A preceding same-location attempt correctly hit the actual same-device nearby
report cooldown. The outbox retained it and displayed the server's explanation.
The successful test used another defect pin; abuse protection was not disabled.

## Frontend and fresh checks

Public detail, citizen reports, staff work, supervisor assignments and admin audit
were checked at **1280×600, 1366×768, 1440×900, 1920×1080, 390×844 and 768×1024**.
All 30 dimension checks passed: no horizontal document overflow, no desktop outer
scrolling, natural mobile scrolling and internal panels for long content. Final
public captures waited for thumbnails and actual map tiles. Representative
desktop/mobile captures were visually inspected.

| Gate actually run | Result |
|---|---|
| Isolated backend `mvn clean test` | **383 total: 381 passed, 2 optional evaluation skips**, no failures/errors |
| Frontend tests after correction | **115 passed**, 16 files |
| ESLint and TypeScript after correction | Passed |
| Production webpack build after correction | Passed |
| Final rebuilt-UI smoke | Supervisor assignment and corrected singular staff count passed |
| Local Firefox and WebKit | Each passed 10 responsive route checks plus dialog keyboard/Escape; zero runtime errors |
| Deployed Firefox | Passed on both runs |
| Deployed WebKit rapid-navigation smoke | **Failed twice** with background `?_rsc=... due to access control checks` errors |
| Deployed WebKit ordinary-navigation diagnostic | Eight route/UI navigation steps passed; zero page errors; only cancelled dashboard-stream requests |
| Harness syntax and diff whitespace | Passed |

The deployed WebKit rapid-navigation result remains an explicit limitation.
The error did not reproduce during the slower diagnostic's normal Explore issues
→ ticket detail → Report a problem clicks. Its cause is not established; no
blanket Safari/WebKit sign-off or speculative application workaround is claimed.

## Test corrections and remaining boundaries

Exploratory failures remain in the ignored artifact directory and are not counted
as passes. Harness corrections: registration wait, explicit manual pin after GPS
success, opening Updates & questions before replying, recognizing restored login,
and waiting for thumbnails rather than lazy images inside closed dialogs.

One forced full-page navigation interrupted session renewal; a subsequent test
report was submitted as a guest and is **not** the signed-in offline pass. The
final test asserted the signed-in UI, used the normal in-app link and verified
ownership in SQL. The separate duplicate-location cooldown refusal is expected
protection, not a delivery pass. Principal complaint writes/votes were not repeated
when resuming the harness after locator corrections.

Physical-phone camera/GPS/permissions were unavailable. Cold offline app-shell
reopening and closed-browser delivery are not guaranteed. Full manual WCAG
certification was not performed. Email delivery/recovery remains deferred; native
installation is excluded by the user's browser-only decision.

## Evidence

`artifacts/daily-journey-20261110/` contains results, independent SQL checks,
build/test logs, browser diagnostics, audit CSV and screenshots. It is ignored by
Git. Credentials and browser session state are excluded from published evidence.

- [Citizen preparing report](../artifacts/daily-journey-20261110/citizen-prepared.png)
- [Supervisor assignment](../artifacts/daily-journey-20261110/supervisor-assigned.png)
- [Corrected staff count/action](../artifacts/daily-journey-20261110/staff-count-corrected-1280.png)
- [Citizen confirmed repair](../artifacts/daily-journey-20261110/citizen-confirmed.png)
- [Administrator closure](../artifacts/daily-journey-20261110/administrator-closed.png)
- [Loaded desktop detail](../artifacts/daily-journey-20261110/public-detail-1280x600.png)
- [Loaded mobile detail](../artifacts/daily-journey-20261110/public-detail-390x844.png)
- [Offline report sent](../artifacts/daily-journey-20261110/citizen-offline-sent.png)
