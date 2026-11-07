# Staff department overview — 7 November 2026

Staff now see **Department overview** at the existing `/dashboard` route.
The navigation, source light design and shared work screen remain in place.
No new standalone screen was added.

## Information shown

- Personal: open assignments, overdue work, ready-to-start and in-progress work.
  The open-assignment caption also reports personal citizen-verification work.
- Department: open complaints, overdue complaints, complaints needing crew
  assignment (New/Acknowledged) and fixes awaiting citizen verification.
- One detail panel: My priorities, Department priorities or Workload by status.
  Priority rows show the reference, priority band/score, status, deadline, category,
  ward, reporter count, age and available landmark. They open the existing work
  queue with the correct selected complaint and queue filter.
- The status table compares department totals with the caller’s assignments for
  all six open statuses. Supervisor crew-performance comparisons remain restricted.
- The actual department name and optional ward restriction appear under the title.
  Manual refresh and a one-minute refresh interval keep the view current.

The read-only `GET /api/v1/staff/overview` endpoint derives department, ward and
member scope exclusively from validated authentication claims. A staff account
without a department receives 403, rather than an unscoped city view. Query
parameters cannot widen the scope. Full aggregate counts are separate from the
six-row priority previews. Overdue totals use the existing running-clock states,
effective deadline and strict deadline comparison; pending verification is paused.
Resolved, closed, rejected and merged source complaints are excluded from totals.

The public/citizen city dashboard, supervisor analytics permissions, work actions,
verification, geo-clustering, reporting and offline behavior are retained. Existing
tracked backend changes match the pre-task patch byte for byte; the overview only
adds new backend classes and tests. This task did not transition live complaints.

## Browser review actually completed

Connected Chrome, local frontend `http://localhost:3000` and API on port 8080,
using the existing Roads Crew Member demo account and existing records.

| Viewport | Outer width/height overflow | Behavior |
|---|---|---|
| 1280 × 600 | None | All eight metrics and footer visible; long priorities scroll internally. |
| 1366 × 768 | None | All eight metrics and footer visible; long priorities scroll internally. |
| 1440 × 900 | None | All eight metrics and six-row department preview fit. |
| 1920 × 1080 | None | All eight metrics and six-row department preview fit. |
| 390 × 844 | No horizontal overflow | Natural page scrolling; stacked cards, accessible detail picker and mobile menu. |
| 768 × 1024 | No horizontal overflow | Natural page scrolling; two-column metrics and full detail panel. |

Reviewed screenshots at desktop and mobile sizes and inspected DOM geometry at
all six sizes. Every metric card stayed within its own bounds. The workload table
also fit the 390px layout without horizontal overflow. Keyboard Tab reached the
scrollable panel with a visible focus indicator; End scrolled it while the desktop
document remained at scroll position zero. The mobile menu opened with the new
department link and closed using Escape.

Checked all three detail selections, the updated-at label and manual refresh.
A personal priority opened the correct selected complaint, retained Assigned to me
and displayed its existing repair-proof form. No live repair submission was made.
The department-queue link selected All open and loaded all 12 complaints, matching
the department aggregate rather than the six-row preview.
Signing out returned to the public Complaint Dashboard with anonymous tracking
and city figures; department metrics were gone. Signed back in and left the staff
overview open. Other signed-in roles were not visually rerun during this pass.
Empty/scope-denied cases were tested at the API level; a complete frontend network
failure simulation was not performed.

## Automated verification actually completed

- `npm run lint`: passed.
- `npx tsc --noEmit`: passed after the final build.
- `npm test`: 88 tests across 13 files passed.
- `npm run build`: production build passed.
- `git diff --check`: passed.
- Backend: `mvn -q -Dtest=StaffOverviewIT,StaffQueueTabIT,WardAndDepartmentDashboardIT,DashboardBreachAgreementIT,IssueLifecycleApiIT,TransitionPolicyTest test`:
  all 63 tests passed together, including seven new overview integration tests against real
  PostGIS. These cover personal/department counts, paused clocks, exact deadlines,
  all six statuses, department/ward isolation, query-spoof resistance, role access,
  missing-department denial, empty results and counts above the queue page limit
  (205 open complaints with a six-row preview).
- The analytics class also passed its seven tests in a separate invocation. The
  new overview tests clean up their own users and records; the final combined run
  confirmed they do not affect existing analytics expectations. The full backend
  suite was not run.

Pre-task patch and source snapshot: `/tmp/nagriksetu-before-staff-overview/`.
Local command logs: `/tmp/nagriksetu-staff-{lint,types,unit,build}.log`,
`/tmp/nagriksetu-staff-focused-tests.log` and
`/tmp/nagriksetu-staff-analytics-regression.log`. The final combined backend log is
`/tmp/nagriksetu-staff-final-backend.log`.

## Screenshots and measurements

- [Personal work, 1440px](../artifacts/staff-overview/staff-overview-1440.jpg)
- [Department priorities, 1280px](../artifacts/staff-overview/staff-department-1280.jpg)
- [Department priorities, 1366px](../artifacts/staff-overview/staff-department-1366.jpg)
- [Department priorities, 1440px](../artifacts/staff-overview/staff-department-1440.jpg)
- [Department priorities, 1920px](../artifacts/staff-overview/staff-department-1920.jpg)
- [Mobile summary, 390px](../artifacts/staff-overview/staff-department-390.jpg)
- [Tablet, 768px](../artifacts/staff-overview/staff-department-768.jpg)
- [Workload, 1440px](../artifacts/staff-overview/staff-workload-1440.jpg)
- [Mobile workload and focus](../artifacts/staff-overview/staff-workload-mobile.jpg)
- [Geometry measurements](../artifacts/staff-overview/layout-checks.json)

No commit, push or deployment was performed.
