# NagrikSetu implementation assessment and cleanup

> Navigation update (2026-11-07): staff/supervisor work now shares `/work`, with role-based views and a queue/detail layout. Legacy frontend URLs below redirect to the corresponding view. Backend paths and this backend assessment remain unchanged. See [current screens](../frontend/SCREENS.md).

> Quality follow-up (2026-11-08): [fresh verification](../frontend/QUALITY_VERIFICATION.md)
> now covers real photo upload/server hashing, offline queue recovery, desktop
> keyboard/basic VoiceOver and responsive layouts. Native installation did not
> complete and physical-phone tests were unavailable. The later
> [end-to-end audit](END_TO_END_TEST_REPORT.md) completed the principal role
> journey. Its five confirmed defects are corrected and regression-tested in
> [audit follow-up fixes](AUDIT_FIXES.md); untested/device boundaries remain.
> Earlier “not freshly tested” statements below are historical.

Reviewed 2026-11-06. This assessment separates source inspection, fresh local
verification, and proposals. The lead coordinated bounded read-only reviews of
the backend, frontend, and evaluation/tooling; only the lead edited cleanup code.

## Overall assessment

The strongest contribution is a connected spatial complaint workflow: preserve
individual reports, group nearby evidence into work items, require a recorded
municipal response, and expose the result publicly. Real PostGIS tests and
reproducible clustering experiments make this a substantially stronger academic
project than a conventional complaint CRUD application. It is a credible
prototype, not evidence of municipal production readiness.

The main weakness is consistency between independently developed paths:
escalation ownership versus permission scope, deadline rearming versus ingest
rescoring, duplicated moderation forms, and documentation versus actual role
transitions. Reducing the number of editing paths is more useful than removing
working differentiators. A large menu alone is not evidence that functionality
is unused; no usage analytics were assumed.

## Architecture and dependencies

- **Frontend:** Next.js App Router / React / TypeScript. TanStack Query handles
  cached reads and invalidation; reporting/proof use React Hook Form and Zod.
  Leaflet is isolated behind a client-only map component. Browser photo
  compression/upload precedes JSON submission. IndexedDB holds drafts/outbox;
  the service worker retries explicitly queued submissions. Access tokens stay
  in memory; Next route handlers proxy refresh-cookie operations.
- **Backend:** Java / Spring Boot, feature packages, Spring Security JWT resource
  server and method guards, JPA plus spatial/native JDBC queries. Controllers
  delegate writes to transactional services. Flyway V1–V10 own the schema;
  Hibernate validates it. No migration was altered by this cleanup.
- **Data model:** categories route to departments; departments have a parent and
  head; wards have polygons and an officer. An issue belongs to a category,
  department and ward and aggregates many reports. A report retains its photo,
  location, accuracy, optional account/device identity and grouping decision.
  Issues retain assignment, centroid/extent, priority, SLA and verification round.
  Related tables preserve status history, votes (unique citizen/issue/round),
  escalation events (unique issue/level), moderation actions, configuration audit,
  notifications/mail outbox, followers/private messages, idempotent submissions,
  refresh families, password reset, MFA/recovery and scheduler locks.
- **Integrations:** Postgres/PostGIS; browser-direct Cloudinary upload plus server
  evidence verification; SMTP or Brevo mail delivery; SSE for dashboard updates.
  Render/Vercel deployment, GitHub Actions and encrypted backup/restore scripts
  are implemented. Live deployment state was not revalidated in this review.
- **Jobs:** SLA escalation and priority ageing, verification timeout and automatic
  closure, mail retries, and Cloudinary orphan cleanup. `seed` disables civic
  scheduled writers for reproducibility; `demo` compresses timings and bypasses
  mandatory privileged MFA. Orphan deletion remains dry-run by default.

Primary source: [backend feature packages](../backend/src/main/java/com/civictrack/),
[migrations](../backend/src/main/resources/db/migration/),
[security configuration](../backend/src/main/java/com/civictrack/config/SecurityConfig.java),
[frontend providers](../frontend/src/app/providers.tsx),
[query boundaries](../frontend/src/lib/queries.ts).

## Route and API map

All backend paths below have the prefix `/api/v1`.

| Audience / frontend destinations | Backend surface / authority |
|---|---|
| Public: `/` → `/dashboard`, `/dashboard/wards/[id]`, `/issues`, `/map`, `/issues/[id]`, `/issues/[id]/cluster` | GET `/dashboard/{summary,departments,metrics,breaching,wards/{id}}`, `/public/issues` (list, bbox, by-ref, detail, reports, history), `/categories`, `/wards`, `/stream/dashboard`; public DTOs omit account/device/hash identity |
| Reporting: `/report`, `/report/success/[ref]`, `/report/outbox` | Anonymous or authenticated POST `/reports`; token determines reporter identity, quotas and idempotency enforced before clustering; Next `/api/offline-report` proxies queued delivery |
| Accounts: `/login`, `/register`, `/forgot-password`, `/reset-password` | `/auth/{register,login,refresh,logout,forgot-password,reset-password}`; login/register are entry points into one shared dialog, not duplicate forms |
| Citizen: `/me/reports`, `/me/verify/[id]`, `/me/notifications`, `/me/profile`, `/me/security` | `/me/reports`, `/me/verifications` and detail; POST `/issues/{id}/verify` requires CITIZEN + original reporter; notification/read/preference/profile/password/MFA/session APIs |
| Staff: `/staff/queue`, `/staff/issues/[id]` | `/staff/queue`; `/issues/{id}` and acknowledge/start/submit-for-verification verbs; role, department/ward and assignee guards |
| Supervisor: `/supervisor/queue`, `/supervisor/review`, `/supervisor/issues/[id]`, `/supervisor/issues/[id]/cluster`, `/supervisor/analytics` | `/supervisor/queue`, department members, review, analytics; confirm, split/merge preview and commit, recategorise, ward options/reassign, description redaction and moderation history; assignment/rejection via issue verbs |
| Administrator: `/admin/audit`, `/admin/configuration` | `/admin/audit` and CSV; `/admin/configuration` reads/PUT existing categories/users/departments/wards and its audit; city scope, last-admin protection, hierarchy cycle checks |
| Engagement on public/work detail | `/issues/{id}/follow` GET/POST/DELETE; `/messages` GET/POST restricted to original signed-in reporters or scoped municipal roles |

Next `/api/auth/{login,register,refresh,logout}` handles same-origin cookie
boundaries. UI link visibility is convenience; server permissions remain the
security boundary. The removed `/styleguide` had no product navigation caller.
The removed manual `/issues/{id}/close` has no frontend or harness caller.

## Representative journeys

1. **Citizen:** choose category, compressed photo and GPS/manual pin → upload →
   durable/idempotent report submission → inspect returned public ticket. A
   second eligible nearby report joins the same issue without deleting either
   observation. Signed-in citizen reporters see their reports, receive in-app
   updates, inspect proof and vote once per fix. Anonymous reports remain valid
   but cannot vote. Following does not increase priority.
2. **Crew:** scoped work queue → acknowledge; wait for a supervisor to assign →
   assignee starts → proof photo plus explanatory note → pending verification.
   Crew cannot resolve or close their own work. The API and UI lifecycle
   harnesses exercise this sequence, not only route rendering.
3. **Supervisor:** assignment board routes acknowledged work to crew; review queue
   highlights uncertain groupings → confirm, inspect split/merge, or open the
   canonical moderation screen. Status-aware recategorisation, rejection, ward
   correction and text redaction preserve reports/history. Private crew analytics
   are separate from public department aggregates.
4. **Administrator:** city-wide audit/export and existing policy/access/org-chart
   edits with before/after audit. Configuration edits are not an account,
   department or ward provisioning workflow. Jobs settle votes, close resolved
   issues after the quiet period and escalate overdue work.

The retained statuses have distinct behavior:
`NEW → ACKNOWLEDGED → ASSIGNED → IN_PROGRESS → PENDING_VERIFICATION → RESOLVED → CLOSED`.
Rejection has a reason; negative citizen verdicts/eligible recurrence reopen work.
Keep persisted states and their historical meaning. Simplify explanatory labels
and entry points rather than rewriting the state machine.

## Feature decisions

“Keep” means the implementation has a defensible purpose; fresh test coverage is
specified separately below. It does not imply every integration was tested live.

| Feature | Decision | Benefit, implementation evidence, dependencies and removal consequence |
|---|---|---|
| Geographic clustering | **Keep / improve edge cases** | `ClusteringService`, `CentroidMath`, spatial repository queries and concurrency/query-plan tests implement accuracy-weighted centres, adaptive radius, extent cap and locked candidate reread. It reduces duplicate work and is the academic contribution. Category/proximity cannot prove semantic identity; results depend on arrival order. Removing loses differentiation and affects reports, priority, maps and evaluation. |
| Complaint lifecycle + proof/history | **Keep** | `TransitionPolicy` and `IssueStatusService` centralize role/guard checks, clock accounting, history and events. Staff submit proof rather than self-certify. Removing stages/history weakens accountability and changes persisted semantics. |
| SLA + escalation/priority ageing | **Improve, retain** | `SlaSweepService`, ladder resolvers, `EscalationService`, `PriorityRecomputer` implement clock pause, rearm, row locks/idempotency and ownership ladder. Valuable municipal accountability; permission/deadline inconsistencies below must be fixed. Removing would discard a main project claim and its strongest live demonstration. |
| Citizen verification | **Improve, retain** | `VerificationService`, per-round uniqueness and `VerificationTally` enforce eligible votes, quorum, rejection and timeout. Silence can resolve without any vote; anonymous devices count among reporters but cannot vote. Do not describe every resolution as citizen-confirmed. Removing restores municipal self-certification; retain unverified-rate disclosure. |
| Public issue list, map, detail and inspector | **Keep** | Filters/list pagination, spatial browsing, deadline/proof/history and recorded grouping decisions serve distinct questions. Public inspector is read-only; supervisor inspector edits group membership. Removing either inspector loses transparency or correction, respectively. |
| Public dashboard/ward reporting/SSE | **Keep; simplify demo emphasis** | `DashboardService`, public DTOs, charts/table alternatives, minimum samples, unverified/reopen metrics and SSE are connected. Department reporting matters more than showing every chart. Removing metrics would hide known verification weaknesses; do not remove on lack of analytics. |
| Assignment board versus work queue | **Keep** | Assignment board supports supervisor acknowledgement/crew selection; crew view enforces assignee-specific work. They overlap in records, not responsibility. Merge only in a future UX pass after preserving both workflows; no removal now. |
| Review queue inline recategorise/reject | **Simplify / merge — done** | Duplicate forms existed beside the full moderation screen; queue recategorisation ignored its stricter NEW/ACKNOWLEDGED condition. One `Moderate issue` link now reaches the existing status-aware controls. APIs, permissions and history remain; rare edits take one extra navigation. |
| Split/merge, ward/category correction, redaction | **Keep** | `ModerationService` previews/recomputes reports/geometry, preserves merged source references and logs corrections. Necessary escape hatch for imperfect geographic grouping. Removing makes grouping errors harder to correct; no data deletion justified. |
| Administrator closure | **Keep — requested and implemented** | The latest administrator workflow adds `POST /issues/{id}/close` only for ADMIN on nonterminal complaints, with a 20–2000-character public reason, confirmation, row locking and normal history/audit writes. The user subsequently authorised early closure: it ends work/pending verification without recording a resolution, retains evidence, notifies reporters/followers and is excluded from resolution/SLA figures. Automatic closure retains its quiet period; manual closure ends the remaining reopening path explicitly. This replaces the earlier removal decision. |
| Admin mobile-target control | **Remove ineffective control — done** | `mobileTarget` was mapped and editable but no clustering/service logic read it. Removed UI/GET-field/write-payload mutation support so operators are not offered an ineffective policy. Legacy DB column, values and historical audits stay; regression test verifies useful category saves preserve them. |
| Admin audit/configuration | **Keep / improve usability later** | Existing-data edits, last-admin and hierarchy checks, role-session revocation and audit/export are substantive. Raw policy/ID vocabulary and missing provisioning limit municipal usability. Removal loses safe operator maintenance. |
| Notifications, following, private clarification | **Keep as secondary** | Transactional notifications, follow/unfollow independent of report count, and reporter/scoped-staff private threads are connected. No evidence they are unused. Removing affects engagement and unresolved-information workflows. |
| Recovery, MFA and sessions | **Keep** | Shared dialog, refresh rotation/reuse detection, recovery, municipal MFA and session controls protect privileged access. Demo MFA exemption is not production behavior. Access tokens can survive revocation until expiry; do not promise universal immediate sign-out. Removing for demo simplicity weakens real access security. |
| Drafts/offline outbox/PWA | **Keep / qualify** | IndexedDB, account-bound queued submissions and server idempotency are connected. Worker retries submissions but does not cache the entire application for reliable offline reload. Removing could strand existing local drafts/jobs; installed-device behavior was not freshly tested. |
| Email and email-based password recovery | **Deferred to future update — user decision, 7 November** | SMTP/Brevo, recovery and transactional outbox code are retained. Provider activation and live delivery/reset-link checks are outside current completion requirements and the demo. In-app notifications and signed-in password changes remain in scope. |
| Abuse/photo checks/orphan cleanup | **Keep** | Quotas/idempotency/photo screening protect anonymous intake; photo verification runs before spatial transaction. Browser-first upload can orphan assets, so bounded dry-run cleanup is relevant. No destructive sweep enabled; real CDN/upload behavior not freshly tested. |
| Styleguide, starter assets, dead helpers | **Remove — done** | Unlinked production showcase used fictitious ticket IDs/inert controls; only abandoned `frontend/measure.mjs` targeted it. Five default SVGs had no callers. Removed these and unreferenced `authedFetch`, `Role.isHuman`, `IssueStatusService.now`, unused controller injection/imports. No runtime dependency was proven unused, so package dependencies stay. |
| Registration/login validation schemas | **Improve / merge proposal** | `registerSchema` is exercised only by schema tests; the live shared sign-in dialog uses browser/server validation. Tests do not prove the real registration form uses those rules. Keep the existing contract tests for now; connect or remove the duplicate schema and its tests together in a later focused change, rather than delete one shared base in isolation. |
| Academic evaluation + verification tooling | **Keep / improve gates** | Real Java/PostGIS predictions, deterministic seed, pairwise scores, chain stress case and latency/concurrency scripts are strong evidence. Python replay is a secondary equation check. Removing weakens reproducibility; do not rerun destructive prefill against real records. |

## Cleanup applied and preservation

- Consolidated review category/rejection editing into existing moderation.
- Removed manual-close controller/service method and human close policy actors.
  Retained guarded automatic closure, its tests, status/history and jobs.
- Removed redundant vote-tally queries/config dependencies from human lifecycle
  context construction; human verbs do not consume verification/closure guards.
- Removed ineffective mobile-target admin control/API field without changing data.
- Removed production styleguide, its disconnected measurement script, five
  unreferenced Next starter SVGs, unused auth/helper methods and injection/imports.
- Corrected settled/closed work-view copy: timeout is not citizen confirmation;
  closed tickets have no administrator-reopen action. Updated stale upload and
  supervisor-close comments, frontend photo setup/validation claims, the unmeasured twenty-second reporting claim, and demo
  role order. The demo now starts with a signed-in reporting citizen and uses a
  supervisor for assignment before crew work, a separate device for the second
  nearby report, and an escalation segment aligned to the actual demo timer.

Reference searches covered product navigation, imports, APIs, scheduled jobs,
configuration, tests, harnesses, CI and documentation. Historical decision records
were retained as history. No applied migrations, complaints, reports, historical
records, credentials, backups, existing IndexedDB drafts/outbox, or evaluation
artifacts were deleted. Dormant `users.reputation`, stored mobile-target values
and historical escalation reason values remain. No dependency was removed merely
because it was transitive or apparently elaborate.

Concurrent frontend design changes appeared during the review (theme/styles,
components and route classes) and were preserved. They are not cleanup authored
by this review. Frontend production verification used an isolated source snapshot
so the existing development server/build directory was not replaced. Scratch
services were stopped after verification; their database was not deleted.

## Fresh verification

The pre-existing application on 3000/8080 and its database were left running.
Mutating verification used a separate PostGIS container/database on 55432, API on
8081 and isolated production frontend on 3001. Testcontainers used its own fresh
PostGIS. Synthetic proof URLs were accepted only on the scratch backend with
media verification disabled; these checks establish orchestration, not real
Cloudinary evidence validation. Existing harnesses were copied to `/tmp` with
only the local ports substituted; repository harness scripts were not modified.

- Baseline backend: **277 run, 275 passed, 2 intentional evaluation skips**.
- After cleanup: `mvn -B --no-transfer-progress clean test` — **282 run, 280
  passed, 2 intentional skips, zero failures/errors**. Includes role table,
  removed endpoint for all human roles, dormant-value preservation, automatic
  closure timing/idempotency, clustering/concurrency, verification/quorum,
  moderation and dashboard/security suites.
- Frontend: **82 tests passed**, TypeScript passed; lint exited successfully.
  Final lint was clean on the latest shared source snapshot. Isolated
  Both isolated `next build --webpack` and the default `npm run build`
  (Turbopack, 30 prerendered pages) passed; the latter used a fresh snapshot of
  the latest shared source with local dependencies hard-linked for isolation.
- API contract: no field mismatches. Lifecycle HTTP sequence reached
  ACKNOWLEDGED → ASSIGNED → IN_PROGRESS → PENDING_VERIFICATION.
- Browser lifecycle walk: actual crew action availability and successful
  transitions matched each of those states.
- Manual running-app inspection: public dashboard rendered real scratch
  aggregates; supervisor Manage navigation led to Review queue; `Moderate issue`
  reached status-aware moderation; submitting a reason rejected the scratch
  issue and displayed success/settled state. Administrator category save
  succeeded and displayed a persisted configuration audit entry; ineffective
  mobile-target control was absent.
- Targeted API journey: nearby reports from separate devices joined one issue;
  citizen and cross-department acknowledge requests and crew assignment were
  denied. Supervisor assignment → crew start/proof → original reporting citizen's
  FIXED vote resolved the issue; public history contained settlement. Manual
  close returned 404 for citizen, crew, supervisor and administrator.
- Targeted bug probes used explicit scratch database fixtures representing a
  rearmed escalation and parent-head assignment. A new report joined the same
  issue and replaced its future deadline with its old original deadline. The
  assigned parent department head's private detail request returned **403**.
  These reproduce the integration gaps; they do not establish a full unattended
  scheduled escalation journey.

The initial five-role route sweep stopped at supervisor sign-in after repeated
independent audit logins consumed the normal five-attempt throttle. Only the
scratch API was restarted; limits were not weakened. The complete rerun passed
**190 route/role checks, zero failures**, across anonymous, CITIZEN, STAFF,
SUPERVISOR and ADMIN contexts, including expected denied/missing-page cases.
Static destination inspection found **38 direct hrefs across 28 page routes,
zero unresolved destinations**; removed `/styleguide` returned 404 and has no
remaining product navigation caller. Routes loading alone do not establish the
correctness of their writes.

No fresh production mail/CDN/upload, installed-PWA, physical-device/screen-reader,
remote backup restore, deployment scheduling or performance-capacity claim is
made. Local test JDK was 26; the Maven source target and CI are Java 21.

## Assessment proposals and current status

1. **Completed locally, 7 November — SLA rearm preservation and owner permissions.** The original finding below is superseded by [workflow fixes](WORKFLOW_FIXES.md). Ingest and
   moderation `rescore` call `SlaService.applyPriority`, which can replace a newly
   rearmed deadline with `firstReportedAt + allowance`; the scheduled
   `PriorityRecomputer` deliberately preserves it after escalation. Separately,
   level-two parent department heads can be assigned work outside the
   department/ward scope allowed by `IssueAccessGuard` and `Guards.SAME_DEPARTMENT`.
   Both gaps were reproduced with the scratch fixtures described above. Retain
   escalation, add focused regression coverage, agree consistent ownership
   semantics and fix all writers. Removing the ladder would discard valuable
   accountability instead of repairing its integration.
2. **Completed locally, 7 November — queue scope and assignment validity.** The original finding below is superseded by [workflow fixes](WORKFLOW_FIXES.md). Supervisor guards allow
   department OR ward while queue predicates intersect them. Direct assignment
   guards check department equality but do not establish active municipal role as
   strictly as the UI picker. Test dual-scope and disabled/citizen-assignee cases.
3. **Completed locally, 7 November — list/auth workflow reliability.** Pagination was added during the role reviews; expired-session report submission is now covered by [workflow fixes](WORKFLOW_FIXES.md). The following describes the earlier finding. My reports stops at 50, crew queue
   at 100 and assignment board at 200 without full pagination. Report submission
   uses the current raw access token instead of the refresh wrapper. Paginate or
   disclose limits, and preserve identity on expired-session submission. These
   are source findings; fresh token-expiry/large-corpus repro was not performed.
4. **Make verification claims truthful throughout.** Keep explicit distinction
   between fixed votes, timeout/partial participation and unverified resolution;
   decide whether anonymous identities should influence quorum. No new citizen
   identity scheme or stored-data rewrite is proposed in this cleanup.
5. **Improve operator language and onboarding, without expanding scope now.**
   Configuration edits existing records only. Replace technical field labels with
   policy explanations in a later pass and document account/org setup. Keep
   private analytics/security/engagement as secondary tools rather than expanding
   the core demo. No working capability is proposed for deletion without further
   usage/workflow evidence.
6. **Tighten academic evidence provenance.** Java summarizer, Python replay and
   HTTP latency plotter can overwrite the same PDF names; separate their outputs.
   Make `concurrency.py` exit nonzero on incorrect grouping and give k6's HTTP 201
   checks a threshold. Mark category results with zero positive pairs as
   uninformative rather than presenting F1=1 as demonstrated grouping accuracy.
   Existing retained aggregate scores (precision 1.000 / recall 0.790 / F1 0.883)
   agree with raw artifacts; they were inspected, not freshly rebenchmarked.
7. **Finish operational checks before municipal claims.** Verify
   photo integration, accessible physical-device/installed-PWA behavior, privacy
   of publicly exposed photos/locations, restore and unattended jobs. Retain
   dry-run deletion until reviewed. Any schema/data deletion stays a separate
   migration proposal with retention review; none is needed for this cleanup.
   Email delivery and email-based password recovery are explicitly deferred to a
   future update; exclude their activation/live checks from this current list.

The focused product/demo remains: citizen report and public tracking → explained
clustering → supervisor assignment → crew proof → original citizen verification
→ public accountability, plus one escalation and one grouping correction. Recovery,
MFA, offline delivery and configuration are supporting checks. The revised
[demo runbook](DEMO-RUNBOOK.md) follows the actual role and eligibility rules.


### Administrator workflow update — 7 November 2026

The earlier unused manual-close cleanup is superseded by the explicitly requested,
administrator closure action, including explicitly requested early closure with a reason. No generic status editor or staff/supervisor
closure permission was added. Admin navigation removes personal-report shortcuts
and the separate My work tab while keeping citywide assignments, review and
performance. Configuration history, CSV export and account security remain.
See [the administrator review](../frontend/ADMIN_VERIFICATION.md) for current checks
and screenshots; earlier dated cleanup/test results above remain historical.
