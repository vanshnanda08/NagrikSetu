# Workflow fixes — 7 November 2026

Completed the three requested items: escalation deadline/owner consistency,
queue/assignment scope, and report submission after session expiry. These are
local working-tree changes. Existing uncommitted work was preserved; no commit,
push, deployment, applied migration or civic-data rewrite was performed.

## Behavior

### Escalation deadlines and owners

- `SlaService.applyPriority` preserves an existing escalation deadline while
  updating priority. New reports, category changes and split recomputation cannot
  pull a rearmed deadline back to first-report time. Scheduled priority updates
  follow the same rule, including an escalation level inherited through grouping.
- The ladder still rearms after an actual breach. Rescoring neither extends a
  grant nor creates a new one. Non-escalated priority upgrades still tighten SLA.
- `IssueScope` is shared by private reads and transition guards. Supervisors have
  their department OR ward; staff have their department AND optional ward.
  A valid municipal account explicitly holding a complaint after actual escalation
  also gets access to that complaint. This grants no general parent-department
  access; moving ownership removes the extra grant. Role restrictions remain.
- Legacy inactive, citizen or unscoped escalation references are treated as
  unstaffed rungs, retaining the existing warning/event and previous-holder rules.
  Staff personal overview/preview includes extra escalation assignments, while
  department counts and department previews retain their geographic/service scope.

### Queues and assignment

- Work queues and review rows/counts use the same scope before ordering/pagination.
  Empty scopes and spoofed request parameters cannot turn into citywide access.
- Manual assignment requires an existing active STAFF or SUPERVISOR in the owning
  department. Ward-restricted staff must match the complaint ward. A department
  supervisor may cover its other wards. Citizens, inactive/missing users,
  administrators offered as crew, and wrong department/ward candidates are refused.
- The existing members endpoint accepts optional `issueId`, checks the caller's
  access to that complaint and filters candidates for its ward. The frontend uses
  this contextual lookup and caches by complaint. Department-only lookups retain
  their existing restrictions for compatibility.
- Assign is disabled while candidates reload or the selection is no longer in
  the eligible list. Failed member loading can be retried without losing notes.
- Administrator configuration now requires a department on STAFF accounts;
  supervisors may have a department or ward. Existing records were not rewritten.

### Expired-session reporting

- The report form waits for initial authentication to settle before submission.
  Signed-in submission uses `authed`, with exactly one retry after a 401.
- The original account, request body, already-uploaded photo URL and
  `Idempotency-Key` stay the same across renewal and retry. A changed account
  returns a visible conflict; a failed renewal preserves the draft and offers
  in-place sign-in. There is no fallback to anonymous delivery for a signed-in draft.
- Anonymous reports remain anonymous. Offline queued reports retain the same
  original owner, and the existing worker/server owner checks remain in place.
  No access/refresh tokens were added to persistent browser storage.

## Verification actually completed

- Full backend suite: **325 tests discovered; 323 passed, 2 opt-in production
  evaluation tests skipped; 0 failures/errors**. The new `WorkflowScopeIT` has
  10 checks; `SlaRearmRegressionIT` has 4. Existing lifecycle, closure, moderation,
  clustering/concurrency, auth/security, dashboard, reporting/idempotency,
  verification and scheduler tests were included.
- Tests ran with real PostGIS through Testcontainers in a clean temporary copy
  (`mvn -q -f /tmp/nagriksetu-workflow-backend/pom.xml test`), avoiding the editor's
  previously observed generated-class interference. Source comparison is recorded
  with the reports in [backend checks](../artifacts/workflow-fixes/backend-checks.json).
- The first full run exposed a pre-existing test assumption that Roads had exactly
  three staff accounts. The analytics test now checks the actual fixture identities
  and their performance, so other test-created accounts cannot invalidate its
  fixed headcount assumption. The full rerun passed.
- Frontend: `npm test` — **115 tests / 16 files passed**; `npm run lint`,
  `npm run build` and `npx tsc --noEmit` passed. Auth/report tests cover renewed
  tokens, missing/changed sessions, failed/second renewal, anonymous reporting,
  transport failures and 400/403/409/429/503 responses.
- Browser: a CITIZEN fixture's first report request returned 401; refresh succeeded
  and its retry reached the receipt. The captured body/key were identical, with
  a renewed token. A second report received 401 and its refresh was refused:
  photo, description and key remained. In-place sign-in followed by Retry reached
  the receipt with the same body/key. Every captured attempt was authenticated.
  [Retry measurements](../artifacts/workflow-fixes/report-retry-checks.json).
- The isolated browser fixture supplied an already-uploaded image and saved draft
  through a temporary UI route. No live civic complaint or real photo was uploaded.
  Fixture API behavior is not evidence of real role enforcement; the backend tests
  cover that separately.
- Expired-session UI at **1280×600**: document 1280×600, main client/scroll heights
  both 512px; long fields scroll internally and Retry/sign-in remain visible.
  At **390×844** there was no horizontal overflow and the page scrolled naturally.
  [Layout measurements](../artifacts/workflow-fixes/layout-checks.json).
- The local frontend and rebuilt API remain running. API health returned HTTP 200.
  Browser civic writes used isolated fixtures; backend tests used their own DB.
  Real photo uploads and physical-device checks remain separate follow-ups.
  Email notifications and email-based password recovery are deferred to a future
  update by user decision; provider setup and live delivery/reset checks are not
  requirements for the current milestone. Existing code and past tests remain.

Screenshots: [expired-session desktop](../artifacts/workflow-fixes/expired-session-1280x600.jpg),
[phone](../artifacts/workflow-fixes/expired-session-mobile.jpg),
[renewed receipt](../artifacts/workflow-fixes/renewed-session-success.jpg), and
[sign-in/retry receipt](../artifacts/workflow-fixes/signed-back-in-retry-success.jpg).
