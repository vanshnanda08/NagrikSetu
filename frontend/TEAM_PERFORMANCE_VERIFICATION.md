# Team performance sizing — 7 November 2026

The existing `/work?view=performance` screen now uses compact department metrics
beside a detail panel. It retains the current light theme, routes, all analytics
fields and role restrictions. No backend files were changed in this pass; the
pre-existing backend diff matches the task-start snapshot byte for byte.

## Changes

- Eight metrics in a two-column, four-row desktop summary: overdue/open work,
  resolved totals, reports in 30 days, median resolution, SLA compliance, reopen
  rate and unverified resolutions. Captions and minimum-sample messages remain.
- Crew, Trends and Backlog tabs replace the long vertical stack. Named panels
  support keyboard navigation and internal scrolling. Inactive charts mount when
  selected so their available width is measured correctly.
- Crew records retain name, fixes claimed, resolved, reopened count/rate, median
  time, open assignments and overdue assignments. Tables have compact readable
  cells and sticky headers; below 640px the same fields become crew cards.
- Charts retain all 90 days, six backlog buckets, keyboard values and full data
  tables. Short desktop windows use a 160px plot; other sizes use 220px. Axes stay
  visible at 1280×600; optional table data scrolls inside the detail view.
- Department scope and privacy label remain visible. Refresh and a one-minute
  refresh interval update the existing authenticated analytics query. The admin
  selector is retained; department-loading/error/empty states now have feedback.
- Expanded methodology explains attribution, sample size, resolution time,
  compliance, paused verification clocks and unverified resolutions. Desktop
  definitions open above the footer without increasing the page height.
- Fixed the shared emphasized metric style: white text now has the intended dark
  background rather than being washed out by the generic glass rule. The public
  ward and existing dashboard use the same readable treatment.

## Browser checks actually completed

Connected Chrome with local frontend on port 3000 and real API on 8080.
The supervisor’s Roads and Infrastructure page was checked at **1280×600,
1366×768, 1440×900, 1920×1080, 390×844 and 768×1024**, in all three detail views.

- Desktop document width/height equalled the viewport at all four sizes, with
  all eight metrics visible and no card content overflow. The complete live crew
  row fit at 1280×600. Chart axes also fit inside the available detail panel.
- At 390px/768px there was no horizontal document overflow. The page scrolls
  naturally. All six per-person figures and the crew name were visible in the
  phone card layout. The tablet retains its table.
- Crew/Trends/Backlog selection and arrow-key tab navigation worked. The trend
  chart responded to keyboard arrows with a date/value tooltip. Its expanded
  table contained all 90 daily rows and stayed within internal scrolling.
- The metric definitions disclosure fit inside the desktop viewport and exposed
  all explanations. Manual refresh completed and updated the generated-at label.
- As administrator, changing to Civic Services Zone showed zero counts,
  minimum-sample messages and the empty crew state. Changing back to Roads and
  Infrastructure restored the corresponding crew and charts. The selector also
  fit at 390px without document overflow.
- Restored the supervisor session and confirmed its department selector was
  absent, with Roads and Infrastructure scope retained. Server scope restrictions
  remain unchanged.
- Checked the public Ward 1 page after extracting the shared chart helper: both
  original charts remained, and the overdue metric had a readable dark background.

The live Roads roster has one crew member. A very large roster and transport
failure simulation were not exercised in this sizing pass; long-table scrolling
and existing error/retry controls remain implemented. This was not a complete
supervisor workflow or administrator configuration/audit review.

## Checks actually run

- `npm run lint`: passed.
- `npx tsc --noEmit`: passed after the final production build.
- `npm test`: **92 tests across 14 files passed**.
- `npm run build`: production build passed.
- `mvn -q -Dtest=WardAndDepartmentDashboardIT test`: **7 checks passed** for existing
  department/ward figures, permissions and minimum-sample behavior.
- `git diff --check`: passed.

No new dependencies, business rules, API contracts, authentication changes or
civic record writes were introduced. No commit, push or deployment was performed.
The final supervisor page was left open at its native window size.

## Artifacts

- [Before, 1280px](../artifacts/team-performance/before-1280.jpg)
- [Crew, 1280px](../artifacts/team-performance/crew-1280.jpg)
- [Trends, 1280px](../artifacts/team-performance/trends-1280.jpg)
- [Final desktop, 1440px](../artifacts/team-performance/final-1440.jpg)
- [Phone summary](../artifacts/team-performance/mobile-summary-390.jpg)
- [Phone crew records](../artifacts/team-performance/crew-390.jpg)
- [Tablet](../artifacts/team-performance/crew-768.jpg)
- [Administrator empty department](../artifacts/team-performance/admin-empty-1280.jpg)
- [Administrator mobile selector](../artifacts/team-performance/admin-mobile-390.jpg)
- [Layout measurements](../artifacts/team-performance/layout-checks.json)

Task-start snapshot: `/tmp/nagriksetu-before-team-performance/`.
Command logs: `/tmp/nagriksetu-performance-{lint,types,unit,build,backend}.log`.
