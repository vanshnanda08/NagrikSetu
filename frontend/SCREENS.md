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
| Account settings | `/me/settings`, `?tab=security` | Profile & preferences: contact details, event preferences and email preferences. Security for every role: password changes and signed-in devices directly, with optional app information. Authenticator setup, code prompts and mandatory enrollment are retired. Available through the account menu. |

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
Team performance retains accessible chart views, responsive crew records and
supervisor/administrator department restrictions. Full ticket records remain
distinct from work controls. Assignment ticket numbers and View ticket
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
- Password recovery/reset: retained entry routes show an unavailable notice;
  email delivery and recovery remain deferred.

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
verification, clustering and offline data remain. These routes preserve existing civic records and role restrictions. Staff overview
uses a read-only scoped endpoint.

Long content scrolls internally on desktop. The public list has a compact heading
and visible pagination; mobile uses natural scrolling and the existing menu.
Map position updates use Next.js-supported browser history replacement so they
do not race with switching back to the list.

## Desktop sizing

The viewport sizing pass keeps essential complaint information visible together
and reduces oversized maps/media, repeated headings and vertical gaps across core
screens. Long timelines, optional views and large forms remain accessible through
internal panels and keyboard-operable tabs. Mobile retains natural scrolling.
Current checks and their boundaries are recorded in the
[completion record](../docs/NON_PHONE_CLOSEOUT.md).

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

## Verification

The [current completion record](../docs/NON_PHONE_CLOSEOUT.md) contains the latest
CI, focused failure/accessibility and deployed offline results.
[Daily-use verification](../docs/DAILY_USAGE_VERIFICATION.md) records the actual
citizen-to-administrator lifecycle and dated responsive checks. Individual
historical screen reviews were removed to avoid competing status lists; committed
versions remain in Git history. These references do not claim physical-phone or
full spoken screen-reader coverage.

Supervisor assignments use 50-row pages with a lookahead; grouping review uses
25-row pages with the server total. Page/filter changes clear bulk selection.
Full ticket links retain the selected queue and page. Long work regions scroll
independently; selecting another complaint starts at its summary.

Administration keeps record search, history paging, CSV refresh/retry and a
mobile/tablet editor. Closure stays inside Assignments; it adds no separate
screen. Personal reporting shortcuts are absent from the administrator menu.
