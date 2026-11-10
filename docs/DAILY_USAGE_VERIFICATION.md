# Daily-use rehearsal — 10 November 2026

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
