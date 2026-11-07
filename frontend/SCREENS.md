# Final screen structure

The interface has seven citizen-facing screen types and role-specific municipal
workspaces. List/map, profile/security, supervisor tools and administration no
longer compete as separate main-menu destinations. The existing committed
light theme is retained.

## Citizen and public screens

| Screen | Route / views | Functionality |
|---|---|---|
| Dashboard | `/dashboard` | Public city statistics, deadlines, department/ward context and charts. Anonymous complaint-number tracking appears only when signed out; signed-in citizens use My reports. |
| Explore issues | `/issues`, `?view=map` | List and map views of civic issues; URL-backed status/category filters, list ward/sort/pagination, map position and marker details. Switching views retains the URL state. |
| Report a problem | `/report` | Photo, category, description, location, draft restoration and anonymous/authenticated submission; offline outbox is linked from this flow. |
| My reports | `/me/reports` | Paginated signed-in submissions, grouping outcomes, current progress and links to eligible fix verification. |
| Complaint details | `/issues/[id]` | Compact summary plus Evidence & fix, Location & grouping, and History/Updates panels. Report descriptions, landmarks and submission times accompany the photos. Photos open in full-size dialogs. Work queues provide explicit View ticket details links; contextual Back to work queue restores the filter, page and selected ticket. Status, deadlines, proof, all timeline entries, following and eligible clarification remain accessible. |
| Notifications | `/me/notifications` | Paginated in-app updates, unread state, mark-read actions/retry and links to the relevant complaint/verification. Available through the header bell. |
| Account settings | `/me/settings`, `?tab=security` | Profile & preferences: contact details, event preferences and email preferences. Citizen security: password changes and signed-in devices directly, with app-install information. Municipal accounts retain Authenticator / Devices & app tabs. Citizens with an already-enabled factor retain its status and existing sign-in protection; new citizen enrollment is not offered. Available through the account menu. |

Citizen primary navigation is **Dashboard · Explore issues · Report a problem ·
My reports**. Guests see the first three. Notifications and account settings are
utility controls. Municipal account menus retain personal report access. The
reporting shortcut remains in staff menus; administrator and supervisor account and
mobile menus omit **Report a problem**.
Signing out from any screen returns every role to the public Dashboard.

## Two municipal workspaces

| Workspace | Route / role views | Functionality |
|---|---|---|
| Complaints | `/work` — Staff | My work combines the scoped queue and selected complaint's work form. Queue filters retain assigned-to-me, unassigned and all-open work. Status, priority, category, ward, landmark, reporter count and deadline remain visible in queue entries. The right pane retains permitted acknowledgement/start/proof actions and private clarification. |
| Department overview | `/dashboard` — Staff | The existing overview destination now shows the signed-in staff member’s department and optional ward scope. Eight cards separate personal open/overdue/ready/in-progress work from department open/overdue/assignment/verification totals. My priorities, Department priorities and Workload by status share one detail panel, with direct links into the existing complaint work screen. |
| Complaints | `/work?view=assignments` — Supervisor / Admin | Assignments combines bulk acknowledgement, the assignment queue and selected complaint details. The existing department-member picker, workload hints, assignment note and Assign action now live in the detail pane. Work actions refresh both the detail and queue. Administrators also get a Ready to close filter for resolved complaints, with a reasoned, confirmed closure action in this same pane. Administrators can also close open/pending work with a reason; early closure is explicitly disclosed and never counts as a successful repair. |
| Complaints | `/work?view=review` — Supervisor / Admin | Needs review keeps grouping reasons, maps, confirmation, selected work details and links to contextual moderation/split–merge. |
| Complaints | `/work?view=performance` — Supervisor / Admin | Team performance keeps eight compact department metrics on the left and Crew / Trends / Backlog views on the right. Crew tables and chart data scroll internally; phones use crew cards with every field. Department scope, refresh, minimum-sample explanations and the administrator’s department selector remain available. |
| Administration | `/admin`, `?view=audit` — Admin | Configuration and Audit log tabs retain category/SLA/access/department/ward editing, configuration history, audit filters, pagination and CSV export. |

The municipal primary navigation has one **Complaints** destination. Supervisors get **My work · Assignments · Needs review · Team performance**;
administrators get **Assignments · Needs review · Team performance**, including
closure inside Assignments. Staff get My work. Administration remains a separate
administrator destination. The brand opens `/work` for staff/supervisors and
`/admin` for administrators. The shared work route opens My work for staff and
Assignments for supervisors/admins unless a permitted view is specified.
Staff navigation calls the existing dashboard destination **Department overview**;
public visitors, citizens, supervisors and administrators retain the city dashboard.
This is a role-specific view of an existing screen, not another route or workspace.
Staff figures come from the read-only `/api/v1/staff/overview` endpoint, scoped
exclusively by authenticated department/ward claims. Full totals are independent
of the six-row priority previews. Citizen verification pauses the SLA clock.
Supervisor crew-performance data remains restricted.
My work queues now page through every result in batches of 50, with a lookahead
row to decide whether Next is available. The `queueOffset` URL parameter survives
opening/closing a complaint; changing queue filters returns to the first page.
Priority/deadline ties use a stable issue-ID ordering. Missing department scope
is denied for staff; ward officers retain their cross-department ward queue.
Repair-photo failures clear progress, show an actionable error and retain the
photo/note for retry. A demo photo placeholder cannot be submitted as repair proof.
See the [staff dry-run report](STAFF_VERIFICATION.md) for checks and limitations.
The [Team performance sizing review](TEAM_PERFORMANCE_VERIFICATION.md) records
the compact metrics/detail layout, accessible chart views, responsive crew records
and retained supervisor/administrator department restrictions.
The [ticket details access fix](TICKET_DETAILS_VERIFICATION.md) distinguishes full
ticket records from work controls. Assignment ticket numbers and View ticket
details open the existing full-record screen; Open work actions opens the pane
with assignment/progress controls. No additional screen was introduced.

On desktop the queue and work form sit alongside one another and scroll
independently. A selected deep link scrolls the queue to that complaint. Selecting
an item focuses the detail; Back to queue retains the queue filter and restores
focus. On mobile/tablet, a selected complaint replaces the list until Back to
queue is used, with natural page scrolling and all fields still available.

Moderation (`/supervisor/issues/[id]`) and split/merge
(`/supervisor/issues/[id]/cluster`) remain contextual tools with a return link to
Complaints. They share the same active primary navigation. Private engagement is
available directly in the work pane as well as through the public detail view.
Server guards remain the authority for roles, department/ward scope, assignments
and lifecycle rules. A staff member opening a supervisor view URL sees a guard
message and can return to My work; supervisor panels are not mounted.

## Supporting flows

These remain reachable from a relevant parent rather than occupying the main menu:

- Fix verification `/me/verify/[id]`: My reports and verification notifications.
  Before/after evidence opens in full-size photo dialogs.
- Offline outbox `/report/outbox`: Report a problem and the existing offline feedback.
- Submission confirmation `/report/success/[ref]`: after successful submission or a sent outbox entry.
- Ward details `/dashboard/wards/[id]`: Dashboard ward summaries.
- Grouping explanation `/issues/[id]/cluster`: complaint details.
- Sign-in/registration: the existing shared dialog and deep-link entry routes.
- Password recovery/reset: the existing account recovery flow.

## Compatibility and preservation

Previous standalone URLs redirect to their grouped screen:

| Previous URL | Current destination |
|---|---|
| `/map` | `/issues?view=map` |
| `/me/profile` | `/me/settings` |
| `/me/security` | `/me/settings?tab=security` |
| `/supervisor/review` | `/work?view=review` |
| `/supervisor/analytics` | `/work?view=performance` |
| `/admin/configuration` | `/admin` |
| `/admin/audit` | `/admin?view=audit` |
| `/staff/queue` | `/work?view=mine` (queue filter retained) |
| `/staff/issues/[id]` | `/work?view=mine&issue=[id]` |
| `/supervisor/queue` | `/work?view=assignments` (queue filter retained) |

Redirects retain query parameters and use temporary 307 responses. Old
`/supervisor/queue?view=review` and `?view=analytics` links reach the corresponding
review/performance view directly. Current page
bodies were moved into components, with duplicate page implementations removed.
All current fields, actions, API contracts, authentication, lifecycle rules,
verification, clustering and offline data remain. The original screen-consolidation
pass changed no backend code and removed or transitioned no civic records. The
subsequent staff overview adds a read-only scoped endpoint. Pre-edit frontend files and
the working-tree diff are retained under
`/tmp/nagriksetu-before-screen-consolidation/`. The shared-workspace pass also
retains its pre-edit frontend/tools archive and tracked diff under
`/tmp/nagriksetu-before-unified-workspace/`.

Long content scrolls internally on desktop. The public list has a compact heading
and visible pagination; mobile uses natural scrolling and the existing menu.
Map position updates use Next.js-supported browser history replacement so they
do not race with switching back to the list.

## Desktop sizing

The viewport sizing pass keeps essential complaint information visible together
and reduces oversized maps/media, repeated headings and vertical gaps across core
screens. Long timelines, optional views and large forms remain accessible through
internal panels and keyboard-operable tabs. Mobile retains natural scrolling.
See [current sizing verification and screenshots](DENSITY_VERIFICATION.md).
The subsequent [citizen review](CITIZEN_VERIFICATION.md) records pagination,
feedback, evidence-dialog fixes and the current dry-run results and limitations.

## Screenshots

Screenshots use the existing local demo data. They are captured before fixture
writes are installed in the verification browser.

- [Staff queue and detail](../artifacts/unified-workspace/staff-queue-detail-1440.png)
- [Supervisor assignments](../artifacts/unified-workspace/supervisor-assignments-1440.png)
- [Supervisor grouping review](../artifacts/unified-workspace/supervisor-review-1440.png)
- [Supervisor team performance](../artifacts/unified-workspace/supervisor-performance-1440.png)
- [Administrator configuration](../artifacts/unified-workspace/admin-configuration-1440.png)
- [Administrator audit](../artifacts/unified-workspace/admin-audit-1440.png)
- [Mobile complaint work](../artifacts/unified-workspace/staff-queue-detail-390.png)

Screenshots and machine-readable measurements are local and gitignored under
`artifacts/unified-workspace/`. The wider public/citizen/role audit retains its
evidence under `artifacts/screens-consolidation/`.

## Verification completed (2026-11-07)

- `npm run build`, `npm run lint`, `npx tsc --noEmit`, and all **88 unit tests
  in 13 files** passed. Navigation tests cover citizen tasks, shared role homes,
  restricted supervisor tabs, contextual navigation, list/map state and queue
  selection/filter retention.
- `node tools/unified-workspace.mjs`: **43 layout/screenshot checks** and **24
  interaction checks** passed. The shared staff/supervisor views and administrator
  configuration/audit were checked at **1280×600, 1366×768, 1440×900,
  1920×1080, 390×844 and 768×1024**. Zero application runtime errors or
  accessibility findings were recorded in this workspace audit.
- The focused audit checks desktop queue/detail visibility, mobile list/detail
  switching and focus return, staff denial of supervisor views, proof validation,
  upload/payload and failed-transition fixtures, department assignee selection,
  assignment payload, detail-action refresh of the visible assignment queue,
  old work deep links and actual administrator CSV download.
- `node tools/screen-consolidation.mjs`: **78 page/layout checks** and **21
  interaction/redirect checks** passed across public, citizen, staff, supervisor
  and administrator contexts. This covers shared navigation, all earlier grouped
  screens, legacy redirects, settings validation/MFA fixtures and internal scroll.
  No runtime errors or actionable accessibility findings. Two spatial-marker
  target-size scans are recorded as equivalent-control exceptions only when the
  selector or element markup identifies a map marker and the corresponding
  same-page list controls measure at least 44×44 pixels; list selection is also
  tested. Other findings are not exempted.
- `node tools/complaint-tracking.mjs` passed anonymous real lookup, normalization,
  repeat/blank lookup, loading/404/failure/retry, merged-complaint history, five
  viewport sizes and accessibility.
- Manual screenshot review covered staff queue/detail and mobile, supervisor
  assignment/review/performance, and administrator configuration/audit. A separate
  [assignment-form screenshot](../artifacts/unified-workspace/supervisor-assignment-form-1440.png)
  shows the real department picker after scrolling the detail pane; no assignment
  was submitted during capture.
- Existing API/auth/domain files and the backend working-tree diff match the
  pre-edit snapshot. The original proof form validation/upload/transition block
  is unchanged apart from also invalidating the visible supervisor queue after
  a successful work action. `git diff --check` passed for edited frontend/tools/docs.

Browser verification used Chrome and a temporary production server on port 3003
with the existing local demo API. The secondary-port CORS bridge is browser-only;
backend CORS, authentication and rate limits were not changed. The harnesses honor
login Retry-After responses. Screenshots use real demo data; sensitive write and
upload checks use browser fixtures, so no complaint records were transitioned.

This pass did not rerun Firefox/WebKit, physical-device, screen-reader, installed
PWA, real upload/mail delivery or backend tests. Nothing was committed, pushed
or deployed. The ordinary development app remains on localhost:3000.

Supervisor assignments use 50-row pages with a lookahead; grouping review uses
25-row pages with the server total. Page/filter changes clear bulk selection.
Full ticket links retain the selected queue and page. Long work regions scroll
independently, and a different selected complaint starts at the top of its details.
See [the supervisor dry run](SUPERVISOR_VERIFICATION.md) for verification boundaries.


Administrator review keeps existing records and API workflows, with no additional
screen for closure. Personal reporting shortcuts are absent from the admin menu.
Configuration search, full history paging, CSV refresh/retry, mobile/tablet record
selection and administrator closure are recorded in [ADMIN_VERIFICATION.md](ADMIN_VERIFICATION.md).
