# Supervisor dry run — 7 November 2026

Reviewed the Roads supervisor on localhost:3000 against the real local API and
PostGIS. Write actions used a disposable frontend on 127.0.0.1:3003 and an
in-memory API on 8081. No real complaint, reporter message, account profile or
password was changed. Live logout/sign-in renewed only the reviewer's session.
The temporary UI/API were stopped afterwards. Administration is the next review.

## Fixes made

- Assignments previously requested at most 200 rows without a way to reach the
  rest. It now uses 50-row pages with one lookahead row, truthful ranges and
  Previous/Next controls. Page/filter changes reset bulk selection and errors,
  including browser-history navigation. Bulk acknowledgement acts only on the
  visible page's selected NEW complaints.
- Grouping review's growing `limit` stopped adding results at the server's
  100-row cap. It now requests 25-row pages with an offset and server total.
  Work-detail and full-ticket links preserve review paging. Empty stale pages
  provide a return to the first page.
- Cluster loading's retry previously refetched only the issue, leaving a failed
  report list unrecovered. Retry now refetches both.
- Absolute accessibility labels in long work lists/details could use `main` as
  their containing block and enlarge its scroll range. Positioning the existing
  internal scrollports keeps those labels contained. At 1280×600, main's client
  height and scroll height are both 516px, with the title still visible after
  keyboard scrolling and a phone-to-desktop resize. Content remains accessible
  through the existing internal panels; no overflow was hidden to get this fit.
- Selecting another complaint now remounts its detail scrollport. Previously a
  complaint selected after scrolling could open 710px down its details. The
  verified replacement starts at scrollTop 0.

Current light styling, routes, API contracts, authentication, role restrictions,
complaint transitions, citizen verification, geo-clustering and offline reporting
were preserved. Existing uncommitted work was retained. No backend production
code was edited during this review. No commit, push or deployment was made.

## Features exercised

| Area | Actual check |
|---|---|
| Live scope and queues | Roads supervisor: 4 To assign, 12 All open, 0 My work and 0 Needs review. Member picker offered the Roads head/crew and their workload hints. No live work action was submitted. |
| Ticket access | Live and isolated full details showed report context, evidence/fallbacks, map, grouping and activity. Back to work queue retained selection/filter; the isolated review round trip also retained offset 100. |
| Assignment paging | 225 isolated complaints, 220 eligible To assign. Reached 201–220, complaint 225, and disabled Next. Exactly 50 rows appeared on earlier pages. |
| Review paging | Reached 101–125 and 201–225 of 225. Final page contained 25 rows with Next disabled. Work-detail links retained `reviewOffset`. |
| Bulk acknowledgement | Injected one failure in a two-item submission: one succeeded, one retained its selection and server error. Retrying the failed item succeeded. |
| Assignment | Selected crew by keyboard. Injected assignment failure retained the selected crew and displayed the error; retry changed the isolated complaint to Assigned. |
| Grouping | Confirmation removed the isolated item from review. Split preview loaded; selecting every report prevented split. A valid split reset selection and exposed the new ticket. Duplicate lookup, merge preview and completion also worked. |
| Moderation | Assigned issues displayed the recategorisation restriction. An acknowledged fixture moved to Road Damage. Ward reassignment, redaction and rejection submitted their intended payloads and showed success. Rejection required 20 characters; redaction required 10. |
| Failure/empty states | Empty To assign offered its working all-open destination. Live personal/review queues showed their empty messages. Assignment, analytics and cluster-report 503 errors displayed server details; retry recovered. |
| Performance | Live Crew, Trends and Backlog retained Roads scope without a department selector. A 30-person fixture scrolled internally, and keyboard End reached member 30. Analytics failure with cached figures retained readable scrollable panels; retry recovered. |
| Profile/security | Isolated name/phone and email preference saves succeeded. Incorrect current password showed an error; valid change succeeded and cleared fields. Revoking other sessions retained the current device. No live credentials/preferences changed. |
| Notifications | 125 isolated notifications paged through 1–50, 51–100 and 101–125. Mark all read cleared the unread header badge. |
| Role/navigation | Desktop and phone menus omitted Report a problem for supervisors and exposed their existing account destinations. Direct Administration access was denied to the supervisor. |
| Logout | Real supervisor logout from the work area opened `/dashboard` with public navigation. Signing in restored supervisor controls; the browser was returned to Complaints. |
| Keyboard | Checkbox/radio selection, action submission, visible focus, and internal-panel End scrolling were exercised. Switching complaints restored the new detail summary without moving the desktop title. |

The in-memory server exercises UI requests and feedback, not real geometry,
authorization or notification delivery. Real split/merge geometry, audit evidence,
reporter links, assignment guards, role/department/ward scope, engagement and
complaint transitions were covered by the backend tests below. Private clarification
controls rendered, but no real reporter message was sent.

## Layouts actually checked

| Viewport | Representative screens |
|---|---|
| 1280×600 | Live assignments/selected actions and full ticket; populated isolated review and 30-person crew. Headings and page controls fit; long panels scroll internally. |
| 1366×768 | Live department metrics and crew table. |
| 1440×900 | Live department metrics and Trends. |
| 1920×1080 | Live All open assignment board with 12 complaints. |
| 390×844 | Live work details; isolated review, crew cards and mobile menu. |
| 768×1024 | Live Backlog and isolated review. |

Measured desktop document dimensions matched their viewport dimensions. Phone
and tablet had no horizontal document overflow and used natural page scrolling.
This is a representative layout pass, not every route at every size. See
[layout measurements](../artifacts/supervisor-review/layout-checks.json).

## Checks run after implementation

- `npm run lint` — passed.
- `npx tsc --noEmit` — passed after the final production build.
- `npm test` — 94 tests across 14 files passed, including queue-return navigation.
- `npm run build` — passed.
- `mvn -q -Dtest=AssignmentBoardIT,ModerationIT,IssueLifecycleApiIT,TransitionPolicyTest,IssueEngagementIT,SecurityFeaturesIT,StaffQueuePagingIT test`
  — 66 tests passed, zero failures/errors.
- `mvn -q -Dtest=WardAndDepartmentDashboardIT test` — 7 tests passed separately,
  zero failures/errors. Total targeted backend checks: 73; not the full backend suite.
- `node --check tools/supervisor-ui-fixtures.mjs` — passed.

## Screenshots

- [Live assignments, 1280](../artifacts/supervisor-review/assignments-live-1280.jpg)
- [Live full ticket, 1280](../artifacts/supervisor-review/ticket-live-1280.jpg)
- [Live crew, 1366](../artifacts/supervisor-review/performance-live-1366.jpg)
- [Live Trends, 1440](../artifacts/supervisor-review/performance-trends-live-1440.jpg)
- [Live assignments, 1920](../artifacts/supervisor-review/assignments-all-live-1920.jpg)
- [Live work actions, 390](../artifacts/supervisor-review/assignment-actions-live-390.jpg)
- [Live Backlog, 768](../artifacts/supervisor-review/performance-backlog-live-768.jpg)
- [Populated isolated review, 1280](../artifacts/supervisor-review/grouping-review-1280.jpg)
- [Long isolated crew, 1280](../artifacts/supervisor-review/performance-long-roster-1280.jpg)
- [Isolated mobile menu](../artifacts/supervisor-review/supervisor-mobile-menu-390.jpg)

## Remaining boundaries

Real Cloudinary upload, email delivery, password recovery delivery, physical
camera/GPS, screen readers, installed-PWA behavior and a live authenticator were
not re-tested in this pass. Browser file attachment was already blocked by the
extension in the earlier staff review; that limitation remains recorded there.
The 30-person roster and write flows used fixtures. The real Roads roster has one
crew member. Administrator configuration/audit/export still need their own review.
