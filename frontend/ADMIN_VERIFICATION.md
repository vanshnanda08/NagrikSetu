# Administrator review — 7 November 2026

The live administrator session on localhost:3000 was inspected without saving
configuration, changing accounts or submitting civic-work actions. Writes used
an isolated frontend/API and real integration tests on a separate PostGIS test
database. No live complaint, reporter message, profile or password was changed
by the dry run. Temporary UI/API processes were stopped afterwards.

## Final administrator functions

| Workspace | Functions retained |
|---|---|
| Administration → Configuration | Edit existing complaint categories, deadlines, grouping/priority settings, user roles/scope/active status, department hierarchy/heads and ward names/officers. Search records; review all configuration-history pages. |
| Administration → Audit log | Filter status, escalation and moderation history by ticket, actor role, escalation level and dates; paginate and export matching CSV rows. The audit is read-only. |
| Complaints → Assignments | Citywide acknowledgement, assignment and contextual work details. Ready to close lists resolved complaints; All open also permits administrator early closure with a reason. |
| Complaints → Needs review | Confirm review, inspect groupings and use contextual recategorisation, ward reassignment, redaction, rejection and split/merge tools. |
| Complaints → Team performance | Select a department; inspect its metrics, crew, Trends and Backlog, including chart data tables and minimum-sample explanations. |
| Supporting screens | Public dashboard, issue list/map/full ticket, notifications, account profile/preferences and security/devices remain available. |

Admin navigation no longer offers the separate **My work** tab, **My reports** or
**Report a problem** shortcuts. Existing shared pages/API permissions remain for
other roles and compatibility. Old admin My work links render Assignments.
Closure uses an existing pane/filter rather than another screen.

## Administrator closure

- **Location:** Complaints → Assignments → Ready to close → Open work actions.
  Use All open for early closure. Full tickets also link to the same pane.
- **API:** `POST /api/v1/issues/{id}/close`, administrator only.
- **Precondition:** the complaint must be nonterminal. ADMIN may close open or
  pending work with a reason, as explicitly requested by the user. This ends work
  and pending verification without claiming a resolution or a verified repair.
  CLOSED and REJECTED cannot be closed again. Staff/supervisor access is unchanged.
- **Reason:** 20–2000 characters; whitespace cannot satisfy the minimum. A
  confirmation distinguishes early closure from a resolved repair and explains
  that later reports start a new complaint.
- **History:** the normal transition writer records ADMIN, actor ID, reason and
  closed time. Resolution time/outcome, original evidence and reports are retained.
  Early closure leaves resolution time unset; public/work/verification records
  explicitly say Closed before resolution. Dashboard/SLA/staff success counts
  exclude early closures, and city/scoped dashboards publish a separate count.
- **Notifications:** reporters and followers receive a dedicated CLOSED message
  including the reason, according to their preferences; quiet-period automatic
  closure does not generate this administrator notification.
- **Concurrency:** closure loads the row with a write lock. Repeating a completed
  closure returns a conflict without another CLOSED history entry.
- **Automatic closure:** the existing SYSTEM job retains its configured quiet
  period (seven days in production). Staff and supervisors cannot manually close.

The live Ready to close queue was empty during the check. No live states were
changed merely to demonstrate the button. Eligible states, success, cancellation,
validation and retry were exercised with isolated records; real state/role/evidence
rules were checked in the backend tests.

The sections below record the original resolved-closure review. The early-closure
follow-up and its fresh checks are recorded separately at the end.

## Changes and dry-run results

| Area | Actual result |
|---|---|
| Category settings | Exercised deadline, grouping radius, priority, reopening window, extent multiplier and uncertain-grouping values. Out-of-range deadline prevented a request. Injected save failure retained the 96-hour draft; retry succeeded with the correct nine-field payload. |
| User access | Searched 125 records. A staff role without scope returned its server refusal; adding department/ward succeeded. Isolated activation/deactivation was exercised. Real tests cover refresh-session revocation and protecting the last active administrator. |
| Departments/wards | Edited department name, parent and head; edited ward name/officer in memory. Current department is excluded as its own parent. Real tests cover hierarchy refusal, references and configuration audit writes. |
| Configuration history | 125 seeded history entries plus new edits paged to the final 31-entry page, with Older disabled. Previously only the newest 50 were accessible. Error states retain retry controls. |
| Save controls | Desktop list/fields scroll independently with Save visible. Selection/group changes are disabled while saving. Field labels/ranges now describe the settings rather than exposing raw column names. |
| Phone/tablet editor | Selecting a record opens its editor near the tap, with Back to records. Returning preserved the search and matching record. Long forms scroll naturally; users no longer traverse the full record list to reach the editor. |
| Closure | Missing/short reason disabled the action. Cancel and Escape retained the draft. An injected POST failure kept the confirmation/reason; retry closed the fixture, removed it from the eligible queue and produced the audit row. A second closure verified visible success feedback and scroll/focus restoration. |
| Closure paging | 100 resolved fixtures were available across two 50-row pages; complaint 225 was reachable and final Next was disabled. |
| Audit | 167 entries after two isolated closures paged through 151–167, with Next disabled. Kind, actor, ticket, date and escalation filters narrowed results; nonexistent ticket showed the empty state; Clear recovered. |
| CSV | A one-time 401 triggered exactly one session refresh and then a successful download. The actual downloaded CSV was parsed: one matching closure row, correct ticket and reason. CSV errors now throw inside the authentication retry wrapper. |
| Shared work actions | As admin, acknowledged and assigned an isolated complaint, started work and checked required-photo/20-character repair-note errors. No premature close control appeared. A private clarification was sent only to the in-memory fixture and appeared in its thread. |
| Shared moderation | Admin confirmation removed an item from review. Split selection/preview/completion, duplicate lookup/merge preview/completion, recategorisation, ward reassignment, redaction and rejection produced the intended fixture requests and feedback. Real geometry/permissions/evidence are covered by integration tests. |
| Analytics | Department switching showed a zero/empty/minimum-sample department and a populated 30-person team. Crew, Trends and Backlog remained usable. Keyboard chart navigation and the full 90-row daily table stayed inside the desktop pane. |
| Account | Isolated name/phone and email preference saves succeeded. Profile-name updates now refresh the shared header through the existing profile query. Security fields/rendering and isolated device revocation were checked. No password or authenticator was changed through the browser. |
| Notifications/logout | Mobile notifications paged through all 125 entries and Mark all read cleared the badge. Isolated admin logout opened `/dashboard` with public navigation. The live administrator session was retained. |

The in-memory server is a UI fixture, not an implementation of the production
clustering/security rules. Backend integration tests are the evidence for those
rules. The CSV browser-event listener timed out, but the download itself succeeded
and the actual file contents were independently verified.

## Layouts actually checked

| Size | Representative views |
|---|---|
| 1280×600 | Live configuration, isolated configuration/history, audit, eligible closure queue/dialog, work actions and analytics with long crew/chart tables. |
| 1366×768 | Live category configuration and save controls. |
| 1440×900 | Live audit filters, 50-row table and paging controls. |
| 1920×1080 | Live citywide Ready to close queue and role navigation. |
| 390×844 | Configuration editor/search return, audit filters/table, account security, notifications, navigation menu and closure confirmation. |
| 768×1024 | Configuration editor and navigation to complaint tools. |
| 1280×550 | Natural page scrolling on a short viewport. |

Measured desktop documents matched viewport dimensions. At 1280×600 the main
panel's client/scroll heights both measured 516px, Save ended at y=500, and the
long field region scrolled internally. Phone/tablet had no horizontal document
overflow. The phone audit table scrolls horizontally inside its own container.
The confirmation panel measured approximately 560px wide on desktop and 358px on
a 390px phone, with its buttons in view. This is representative testing, not every
screen at every size. See [live measurements](../artifacts/admin-review/layout-checks.json).

## Checks actually run

- `npm run lint` — passed.
- `npx tsc --noEmit` — passed after the final production build.
- `npm test` — **100 tests across 15 files passed**.
- `npm run build` — passed.
- Core backend group: `AdminClosureIT, AdminConfigurationIT, AuditLogIT,
  AssignmentBoardIT, ModerationIT, StaffQueuePagingIT, SecurityFeaturesIT,
  TransitionPolicyTest, IssueLifecycleApiIT, IssueEngagementIT,
  VerificationLoopIT, VerificationSweepIT, StaffOverviewIT` — **118 passed**.
- `WardAndDepartmentDashboardIT` — **7 passed** separately.
- `ProfileIT, RecoveryAndRotationIT, PasswordPolicyTest, AuthApiIT` — **21 passed**
  separately. Total: **146 targeted backend tests**, not the full backend suite.
- Backend groups ran with `mvn -q -f backend/pom.xml -Dtest=<group> test`.
- `node --check tools/admin-ui-fixtures.mjs` — passed.

## Screenshots

- [Live configuration, 1280](../artifacts/admin-review/configuration-live-1280.jpg)
- [Live configuration, 1366](../artifacts/admin-review/configuration-live-1366.jpg)
- [Live audit log, 1440](../artifacts/admin-review/audit-live-1440.jpg)
- [Live closure queue, 1920](../artifacts/admin-review/closure-queue-live-1920.jpg)
- [Configuration history, isolated](../artifacts/admin-review/configuration-history-isolated-1280.jpg)
- [Mobile editor, isolated](../artifacts/admin-review/configuration-isolated-390.jpg)
- [Tablet editor, isolated](../artifacts/admin-review/configuration-isolated-768.jpg)
- [Mobile audit, isolated](../artifacts/admin-review/audit-isolated-390.jpg)
- [Desktop closure confirmation, test data](../artifacts/admin-review/closure-confirmation-isolated-1280.jpg)
- [Phone closure confirmation, test data](../artifacts/admin-review/closure-confirmation-isolated-390.jpg)
- [Simplified mobile menu](../artifacts/admin-review/menu-isolated-390.jpg)
- [Verified filtered CSV, test data](../artifacts/admin-review/filtered-audit.csv)

## Boundaries

Real Cloudinary upload, SMTP/password-recovery delivery, physical camera/GPS,
installed-PWA behavior, live authenticator and screen-reader testing were not
performed in this pass. Password/recovery/session behavior was exercised by real
backend tests; browser credentials were not changed. There were no eligible
resolved complaints in the live queue. No migrations, API identifiers, complaint
records or audit evidence were removed. No commit, push or deployment was made.


## Early-closure follow-up — 7 November 2026

The user explicitly approved early closure with a reason. The action is available
on every nonterminal complaint for ADMIN only. It does not simulate a successful
repair: no resolution timestamp is created, and public/work/verification records
say **Closed before resolution**. Existing proof, reports and votes remain. The
normal repair/verification path, role scopes, offline reporting and automatic
quiet-period closure remain available.

Fresh verification completed after that change:

- **163 backend tests / 22 suites passed**: administrator closure, policy and
  lifecycle, configuration, audit, assignments, moderation, queue paging,
  security/auth/profile/recovery, engagement, verification/sweep, staff overview,
  city/scoped metrics and dashboard stream/breach consistency. This includes all
  six unresolved source states, terminal refusal, role restrictions, reason
  validation/trimming, repeat closure, preserved proof, reporter/follower
  deduplication and CLOSED preferences, stopped verification, separate early
  closure counts and exclusion from resolution/SLA/staff success figures.
- Final backend checks used a clean temporary copy of the same source because
  the editor overwrote generated test classes in the shared build folder
  (`NoClassDefFoundError: Fixtures`). A file-by-file SHA-256 comparison found no
  backend source differences. Earlier shared-checkout runs passed before that
  generated-class interference. See [test records](../artifacts/early-closure/backend-checks.json).
- `npm run lint`, `npm test` (**100 tests / 15 files**), `npm run build` and
  `npx tsc --noEmit` all passed after the final frontend changes. `git diff --check`
  passed.
- Isolated browser exercises: short reason disables the action; cancellation
  sends no closure; a 503 leaves the reason/dialog intact; retry succeeds,
  removes the ticket from open work and shows a focused success message. The
  public ticket retains photos/report details and displays the early-closure
  disclosure plus the administrator's reason in history. Audit filtering and a
  real CSV download were checked; the downloaded file contains the reason.
- Keyboard activation, focus, cancellation and the 2,000-character reason were
  exercised. Long reasons now scroll in their own focusable region while Cancel
  and Confirm stay visible; on a 390×844 phone the panel measured 717px high,
  reason viewport 464px, with both buttons ending at y≈757.
- Closed-ticket dimensions were measured at **1280×600, 1366×768, 1440×900,
  1920×1080, 390×844 and 768×1024**. All four desktop documents matched the viewport;
  at 1280×600 main client/scroll heights both measured 516px. Phone/tablet used
  natural vertical scrolling without horizontal document overflow. Desktop
  closure/full-ticket and phone confirmation screenshots were visually inspected.
  The live administrator pane was also checked at its normal 1470×835 viewport.
  [Measurements](../artifacts/early-closure/layout-checks.json).

The live localhost frontend and API were kept running. Civic changes used the
isolated fixture/test database; no live complaint, configuration, profile,
password or reporter message was changed. Backend tests check the real database
and transition rules; fixture UI responses are not evidence of email delivery.
The previously documented full administrator dry run remains above. This follow-up
is focused on early closure and its effects; it is not a production review or a
repeat of every civic role's complete browser workflow.

Screenshots:

- [Live administrator closure action](../artifacts/early-closure/live-admin-closure.jpg)
- [Desktop confirmation](../artifacts/early-closure/confirmation-1280x600.jpg)
- [Phone confirmation](../artifacts/early-closure/confirmation-mobile.jpg)
- [Public closed-ticket disclosure and history](../artifacts/early-closure/closed-public-1280x600.jpg)
- [Audit with the early-closure reason](../artifacts/early-closure/early-closure-audit.jpg)
- [Isolated downloaded CSV](../artifacts/early-closure/audit-export.csv)
