# NagrikSetu frontend

The [10 November daily-use rehearsal](../docs/DAILY_USAGE_VERIFICATION.md)
exercises real photo uploads, role handoffs, two repair rounds, administrator
closure and signed-in offline recovery. It records 20 passing workflow checks,
30 layouts, the local staff-count correction and the deployed WebKit smoke limitation.

Latest follow-up: [release readiness](../docs/RELEASE_READINESS.md), 10 November.
Patiala map defaults, zoom preservation, Enter/Space marker activation and stable
selection are released. Password-recovery routes display a deferral
notice by default; `NEXT_PUBLIC_EMAIL_RECOVERY_ENABLED=true` is reserved for a
future release with verified mail delivery. Current code checks: 115 tests,
ESLint, TypeScript and production build passed, including the green application
CI run for `a728d35`. A real deployed photo/report submission passed with labelled
QA ticket CT-2026-000918, followed by desktop/mobile evidence rendering and photo
dialog checks. **Browser-only scope, agreed 10 November:** normal browser use is
supported; Chrome/PWA installation and standalone installed-app testing are no
longer completion requirements. Existing manifest/worker code is retained.

Next.js 16 (App Router), React 19, Tailwind v4.

**Status (2026-11-07).** The agreed frontend scope is implemented, including
public reporting, citizen verification, supervisor tools, administration,
profile, persistent drafts and offline submission. Email notifications and
email-based password recovery are deferred to a future update; their existing
screens/code and historical checks are retained, with no current requirement for
provider activation or live delivery/reset testing. In-app notifications and
password changes while signed in remain in scope. Account session controls are available at
`/me/settings?tab=security`, issue following, private clarification threads, an installable
web-app manifest and browser security headers. The NagrikSetu interface restores the committed blue/orange glass design in light mode only, with responsive layouts.

Latest code checks, recorded 7–8 November 2026: 115 tests across 16 files, ESLint,
TypeScript and the production build passed. See [quality verification](QUALITY_VERIFICATION.md)
for real photo evidence, offline recovery, keyboard/VoiceOver and responsive checks.
Chrome's install prompt now appears; native installation remains unverified after
the user's unsuccessful attempt. Physical-phone tests were unavailable. The full
role-by-role journey subsequently completed in the
[end-to-end audit](../docs/END_TO_END_TEST_REPORT.md). Its five confirmed defects
are addressed in [audit follow-up fixes](../docs/AUDIT_FIXES.md), including the
verification/profile wording. The follow-up frontend115 tests, lint, TypeScript
and production build passed; remaining browser/device cases are not inferred
to pass from these code checks.
The grouped-screen browser audit covers representative views in all five access
contexts at mobile, tablet and desktop sizes. See [Screens](SCREENS.md) for current
coverage, functionality, accessibility evidence and the limits of local testing.

## Running

Needs the backend on `:8080` and its CORS origin set to `http://localhost:3000`
— the port matters, because the backend allows exact origins and never `*`.

```bash
npm install
npm run dev      # http://localhost:3000
```

`.env.local` holds `API_BASE` (read on the server) and `NEXT_PUBLIC_API_BASE`
(read in the browser). Without browser Cloudinary configuration the composer uses a placeholder photo.
That is a local demo fallback, accepted only when the scratch backend disables
evidence verification; real submissions require matching browser/backend
Cloudinary configuration. See `.env.example`.

For real uploads, start the API with `CLOUDINARY_CLOUD_NAME` set to the same
value as the frontend's `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`. Spring does not read
`frontend/.env.local`; configuring the browser alone causes the API to return
“Photo storage is not configured.” Keep photo evidence verification enabled.

## Commands

| | |
|---|---|
| `npm run test` | 115 unit tests over validation, server rules, charts, uploads, auth boundaries and grouped navigation |
| `npm run lint` | includes the rule confining Leaflet to one module |
| `npm run build` | production build |

**Restart `npm run start` after `npm run build`.** A stale server serves old
chunks and the failure presents as an application bug (DD-027 records the
equivalent trap on the Maven side).

## Layout and theme

The current screen map and functionality are documented in [Screens](SCREENS.md).
The general public dashboard, browsing and reporting review is recorded in
[Public frontend verification](PUBLIC_VERIFICATION.md), including fixes, browser
checks, screenshots and the limits of intercepted submission/upload tests.
The anonymous complaint-number tracker appears only after authentication has
settled for a signed-out visitor. Signed-in users use My reports to follow their complaints.
Successful logout always replaces the current page with the public `/dashboard`,
for every role and both desktop/mobile sign-out controls.
See [Citizen verification](CITIZEN_VERIFICATION.md) for the current citizen dry run,
paging/retry fixes, responsive evidence dialogs, screenshots and remaining limits.
Ordinary citizen security settings show password and device management directly.
All roles now use password sign-in. Authenticator setup, recovery-code prompts
and mandatory enrollment notices are removed; password changes and session
revocation remain available.
Explore issues groups list/map views, Account settings groups profile/security,
Complaints (`/work`) combines staff queues, selected-complaint work actions and
supervisor assignment/review/performance views. Administration groups configuration/audit. Previous URLs redirect to the grouped views, preserving
saved links and query parameters. Verification, outbox and specialist tools remain
contextual flows rather than main-menu destinations.

The light appearance is adapted from GitHub default branch `main`, commit
`011ecb5c04192b1823065a2d4c248630c853add8`. See [restoration and verification](DESIGN_RESTORATION.md)
for the source comparison, retained features, completed checks and limitations.

- **`src/app/globals.css`** owns fixed light tokens, status colors and typography.
  Saved `theme` preferences are removed without touching drafts or account data.
  There is no system-theme detection, dark stylesheet, initializer or toggle.
- **`src/app/committed-light.css`** adapts the source's blue/peach background,
  navy/orange branding, frosted panels, pill navigation and rounded fields.
- **`src/app/viewport-layout.css`** owns the compact desktop layout: shorter
  chrome, three-panel complaint details, bounded media with full-size photo
  dialogs, side-by-side profile/configuration fields and tabbed security options.
  See [viewport verification](DENSITY_VERIFICATION.md) for screenshots and limits.
- **`src/app/civic-interface.css`** retains corrected navigation, accessible
  controls, tables, maps, dialogs and internal workspace scrolling.
- **`src/app/dashboard.css`** retains the statistics/detail split and the current
  anonymous complaint tracker. City overview uses a detail-view selector with
  internal scrolling for long results.
- Staff see **Department overview** at the same `/dashboard` route: personal work
  and department/ward-scoped operational totals, priority previews and a status
  breakdown. `/api/v1/staff/overview` derives scope from verified staff claims;
  full counts do not depend on queue pagination. Priority rows link into the
  existing work pane. Public/citizen city figures and supervisor-only performance
  analytics remain separate. See [staff verification](STAFF_OVERVIEW_VERIFICATION.md).
- The [staff dry run](STAFF_VERIFICATION.md) covers queue filters and pagination,
  work/proof controls, account settings, notifications, map access and logout.
  Work queues page through all results; repair upload failures retain the evidence
  and note, and missing staff department scope fails closed.
- At desktop sizes of at least 1280×600 the shell stays within the window;
  long panels scroll internally. Mobile and short viewports scroll naturally.
- `/` redirects to `/dashboard`. The brand opens `/work` for staff/supervisors
  and `/admin` for administrators. Legacy staff/supervisor links redirect to the
  same selected issue and queue. API paths, roles, status vocabulary and underlying
  civictrack identifiers remain unchanged.
- Supervisor account and mobile menus omit **Report a problem**, keeping their
  navigation focused on managing complaints. Citizen/public reporting is retained.
- `src/components/work/` holds the shared complaints shell, scoped queue and
  reusable work/proof panel. Supervisor panels reuse that shell and role-aware
  tabs. On mobile the selected detail replaces the list until Back to queue is used.
- Team performance uses `src/app/team-performance.css`: compact department totals
  beside Crew, Trends and Backlog tabs; long data stays in internal panels and
  phones show full crew records as cards. Shared scope charts retain the public
  ward view. See [performance sizing verification](TEAM_PERFORMANCE_VERIFICATION.md).
- Ticket numbers and **View ticket details** on the assignment board open the
  complete existing record, including report descriptions/photos, location and
  history. **Open work actions** retains assignment/progress controls. The full
  record returns to the same selected queue through a validated local link.
  See [ticket detail verification](TICKET_DETAILS_VERIFICATION.md).
- [Supervisor dry run](SUPERVISOR_VERIFICATION.md): paginated assignments and grouping
  review, bulk/individual failure recovery, contextual moderation, profile/security,
  notification and responsive-layout checks. Long work panels keep their own scroll
  position; selecting another complaint starts its details at the summary.

## Things that are load-bearing

**`src/lib/status.ts` is the only place a status gets a colour, a shape or a
word.** Nine statuses, eight colour tokens — ACKNOWLEDGED, ASSIGNED and
IN_PROGRESS share one colour deliberately, and the glyph and word are what
separate them. Every status surface must stay legible in greyscale; that is the
test of whether the encoding works, not an accessibility afterthought.

**`src/components/map/MapCanvasInner.tsx` is the only module that may import
Leaflet**, enforced by an ESLint rule rather than a comment. Leaflet touches
`window` at module scope, so importing it anywhere else breaks the server render
of whatever page transitively reaches it — and it keeps the report composer from
downloading a map it never shows.

**`src/lib/transitions.ts` mirrors the server's `TransitionPolicy`.** It decides
what to *render*, never what is permitted. It has been wrong before (DD-035);
`tools/table.mjs` and `tools/uiwalk.mjs` in the repository root check it against
the running server, which is the only thing that can.

**`src/lib/schemas.ts` holds reporting and proof validation rules**, naming the
server rules they mirror. The sign-in dialog currently uses browser/server
validation; its registration schema tests do not establish runtime form coverage.

**Never put a token in `localStorage` or `sessionStorage`.** The access token
lives in React state; the refresh token is in an httpOnly cookie set by the
route handlers under `src/app/api/auth/`.

## Focused cleanup

The review queue keeps grouping confirmation and links to the split/merge tool
and the canonical **Moderate issue** screen. Category changes and rejection remain
available there with status-aware controls. The unlinked production styleguide,
its standalone measurement script, unused starter SVGs, and unused `authedFetch`
helper were removed. The ineffective mobile-target category control was removed;
its existing database values are preserved. See [assessment and verification](../docs/PROJECT_ASSESSMENT.md).


Administrator review: [features, dry run and screenshots](ADMIN_VERIFICATION.md).
Administrators retain Configuration/Audit log and citywide complaint oversight.
`Assignments → Ready to close` lists resolved complaints; closure requires a public
20–2000-character reason and confirmation. Administrators may also close open
or pending complaints from All open. This ends work/verification, is visibly
labelled closed before resolution and is excluded from resolution/SLA figures.
Automatic closure retains its configured quiet period.
Admin-only navigation omits My work, My reports and Report a problem shortcuts.
Configuration now has record search, older history pages, clearer field labels,
pinned desktop save controls and a mobile/tablet editor with Back to records.


Online report submission now uses the shared authenticated request path with one
401 refresh/retry. The draft retains its original account and idempotency key;
a failed renewal or account mismatch leaves its photo/details available and
provides in-place sign-in. Anonymous submissions remain supported. Assignment
pickers request eligible members for the selected complaint, including its ward.
See [workflow verification](../docs/WORKFLOW_FIXES.md) for current tests and limits.
