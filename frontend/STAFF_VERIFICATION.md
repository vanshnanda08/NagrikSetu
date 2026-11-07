# Staff dry run — 7 November 2026

Scope: the signed-in staff interface and supporting screens reachable by staff.
The review used connected Chrome and the real local frontend/API, plus an isolated
copy of the same frontend with in-memory API fixtures for write actions. Existing
complaints, account details and reporter notifications were not changed by dry-run
actions. Actual logout/login was checked with the existing demo staff account.

## Issues found and fixed

1. **Queues stopped at 100 complaints.** My work now uses 50-row pages and requests
   one extra row to determine whether Next exists. Filters reset to the first page;
   opening/closing a complaint retains `queueOffset`. Empty pages can return to the
   first page. Counts distinguish a page range from a known total.
2. **Tied queue rows lacked a stable page order.** The queue query now orders by
   priority, deadline, then issue ID. An integration test walks 125 equal-priority,
   equal-deadline complaints and proves there are no omissions or duplicates.
3. **Upload/transport failures could be silent and leave progress visible.** Repair
   uploads now clear progress in `finally`, show an actionable error and retain the
   photo and note for retry. Server ProblemDetail refusals are kept verbatim. Missing
   storage and placeholder photos cannot masquerade as repair evidence. Proof-note
   help/error text is associated with the field, with an invalid state when needed.
4. **Staff without a department could receive an unscoped queue.** These requests
   now return 403. A supervisor with neither scope is also denied. Ward officers
   retain their ward queue across departments, and administrators retain city scope.

The API contract, authentication mechanism, permitted lifecycle transitions,
citizen verification rules, geo-clustering and offline reporting remain intact.
Pre-existing uncommitted work was preserved. No commit, push or deployment was made.

## Features exercised

| Feature | Evidence / result |
|---|---|
| Staff sign-in and session refresh | Real demo account signed in; refresh after navigation/reload restored staff controls. |
| Department overview | Actual department name, eight cards, My/Department priorities and status table; real queue totals agree. Isolated start-work updated ready/in-progress totals. |
| Overview error/empty states | Injected 503 displayed the server message and retry recovered; zero-work scope showed real zeros and its empty message. |
| Queue filters | Live Assigned to me (2), Unassigned (0) and All open (12). Empty filter supplied the working all-open link. |
| Queue pagination | Isolated All open reached 1–50, 51–100 and 101–125. Last page had 25 rows and no Next link; complaint 125 opened, and Back retained page 3. Filter changes reset paging. |
| Acknowledge | Isolated New complaint became Acknowledged; supervisor-assignment guidance replaced the action. |
| Start work | Isolated assigned complaint became In progress and showed the proof form. |
| Proof validation | Empty submission showed both required-photo and 20-character-note errors. No Resolve/Close/Assign/moderation control was offered to staff. |
| Repair upload recovery | Four frontend tests cover failure/progress cleanup/retry, missing configuration, placeholder rejection and preserving API errors. Physical browser file attachment was blocked; see limitations. |
| Lifecycle and authorization | Real PostGIS integration tests cover acknowledgement→assignment→start→proof, history, assignee restrictions, invalid transitions, missing proof, role/department/ward scope and denial of manual resolution/closure. |
| Clarification | A QA-only message appeared in the isolated thread and the field cleared; no real reporter was messaged. Real API privacy/notification rules were covered by integration tests. |
| Notifications | Real five-entry staff feed loaded. Isolated 125-entry feed reached 101–125; mark-all-read error/retry recovered and the badge cleared. |
| Profile/preferences | Isolated name, phone and citizen-reply preference saved and survived reload. Email preference saved through keyboard interaction after scrolling into view. Real staff fields/preferences loaded without errors. |
| Password/security | Short/mismatched passwords disabled submission; wrong current password showed an error; valid isolated change succeeded and cleared fields. Another isolated session could be revoked. Existing authenticator setup/confirmation UI produced fixture recovery feedback; real MFA/session policy ran in integration tests. |
| Public complaint details | Evidence dialog opened/closed. Status, deadline, location map, grouping context and timeline loaded for the staff-selected complaint. |
| Explore list/map | Status/category filters survived list/map switches. Zoom and filter reset worked. An empty filtered map explained its area/filter scope. Markers rendered after clearing filters; the accessible issue list selected the correct record where pins overlap. |
| Municipal role guards | Staff opening Team performance saw the supervisor/admin guard and a working return to My work. Backend role checks prohibit supervisor analytics and unrelated departments. |
| Supporting report screens | Staff’s Your reports and Report a problem screens loaded without frontend alerts at desktop/mobile widths. No real report submission was attempted in this staff pass. |
| Logout | Signing out from Report a problem returned to the public Complaint Dashboard and anonymous tracker. Staff metrics/controls disappeared. Signed back in and returned to Department overview. |

## Layout review

The loaded staff work queue and selected proof form were measured and captured at
1280×600, 1366×768, 1440×900, 1920×1080, 390×844 and 768×1024. Desktop document
dimensions equalled the viewport: no outer scrolling or horizontal overflow.
Queue and work-form panels scroll internally. Mobile/tablet selection displays
the detail with Back to queue and natural document scrolling.

Department overview, notifications, profile, security, Your reports and Report a
problem were additionally checked at 1280×600 and 390×844. Each had no horizontal
overflow or visible error alert; desktop stayed inside the viewport. Overview
cards remain visible together; long lists/preferences/forms scroll internally.
Screenshots were visually inspected for the work screen, pagination, profile,
security and notifications. The existing light theme and readable control sizes
were retained. The fixture pagination footer stayed visible at 1280×600.

Keyboard checks covered scroll-panel focus/End, invalid proof fields, the email
checkbox and the accessible map issue list. Hardware camera and mobile virtual
keyboard behavior were not tested.

## Checks actually run

- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm test`: **92 tests, 14 files passed** (four new upload-recovery tests).
- `npm run build`: production build passed.
- `git diff --check` and `node --check tools/staff-ui-fixtures.mjs`: passed.
- `mvn -q -Dtest=StaffQueuePagingIT,StaffOverviewIT,StaffQueueTabIT,DashboardBreachAgreementIT,IssueLifecycleApiIT,TransitionPolicyTest,IssueEngagementIT,ProfileIT,SecurityFeaturesIT,AuthApiIT,PhotoEvidenceServiceTest test`:
  **81 tests passed** against real PostGIS / existing unit tests, including three
  new queue paging/access integration tests.
- `mvn -q -Dtest=WardAndDepartmentDashboardIT test`: **7 tests passed** separately.
  Total: **88 focused backend checks passed**; the full backend suite was not run.

The real API was restarted with its existing Cloudinary setting retained so the
queue scope/order changes are active locally. The ordinary frontend remains on
port 3000, API on 8080. The temporary UI/API on 3003/8081 were stopped afterward.

## Isolation and limitations

`tools/staff-ui-fixtures.mjs` only seeds from public read endpoints and never
forwards authenticated calls or writes. Browser write tests ran in a disposable
frontend copy under `/tmp/nagriksetu-staff-ui/`, at `127.0.0.1:3003`, with fixture
API on 8081. A test-copy-only origin adapter handled Next’s localhost normalization
for this isolated host; the real application’s origin guard was unchanged and its
actual sign-in/logout were tested separately. Mock transitions demonstrate UI
behavior; real authorization/lifecycle rules are verified by the integration tests.

The Chrome extension refused `fileChooser.setFiles` with its “Allow access to file
URLs” error. A real Cloudinary repair upload through this browser was therefore
**not completed**. Progress cleanup/retry/placeholder refusal were tested at the
frontend helper level and proof acceptance/refusal through backend integration
tests. External email delivery, hardware camera/GPS and physical mobile devices
were not tested. This pass did not repeat the complete citizen/offline or
supervisor/administrator review.

## Artifacts

- [Staff work, desktop](../artifacts/staff-dryrun/staff-work-1280.jpg)
- [Staff work, mobile](../artifacts/staff-dryrun/staff-work-390.jpg)
- [125-complaint paging fixture](../artifacts/staff-dryrun/fixture-queue-paging-1280.jpg)
- [Empty overview fixture](../artifacts/staff-dryrun/fixture-empty-1280.jpg)
- [Profile, desktop](../artifacts/staff-dryrun/staff-profile-1280.jpg)
- [Notifications, desktop](../artifacts/staff-dryrun/staff-notifications-1280.jpg)
- [Security, mobile](../artifacts/staff-dryrun/staff-security-390.jpg)
- [Geometry measurements](../artifacts/staff-dryrun/layout-checks.json)
- [Sanitized isolated action capture](../artifacts/staff-dryrun/isolated-actions.json)

Pre-review source snapshot: `/tmp/nagriksetu-before-staff-dryrun/`.
Command logs: `/tmp/nagriksetu-staff-dryrun-{backend,analytics,lint,unit,types,build}.log`.
