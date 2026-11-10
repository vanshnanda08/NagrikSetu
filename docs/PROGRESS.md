# NagrikSetu — current progress

Scope update, 10 November: [authenticator support is retired](PASSWORD_AUTHENTICATION.md)
for all roles. Passwords, role/department/ward restrictions and rotating/revocable
sessions remain. Final local checks: 386 backend passes/2 optional skips,
115 frontend passes, lint/types/build, 16 UI groups and 24 Security layouts.
The browser-smoke navigation correction passed three deployed repetitions and
still detects a genuine runtime error. Fresh release CI/live role handoff remains
to be recorded after publishing this update.

Daily-use rehearsal, 10 November: [20 workflow checks and 30 layouts passed](DAILY_USAGE_VERIFICATION.md)
against disposable data with real photo uploads, including citizen rejection,
repair resubmission, administrator closure and authenticated offline recovery.
Fresh backend 381 passes/2 skips; frontend 115 passes, lint/types/build passed.
The follow-up includes one staff count-label correction. Deployed WebKit rapid-navigation
errors are recorded separately from the passing ordinary-navigation diagnostic.

Verified release, 10 November: Patiala/V11 changes were pushed as `935a30f`,
the deploy-profile mail-off correction as `d684390`, and deterministic evidence
ordering as `a728d3500383e602fd064a284c2405a31851516f`. The final application
[CI run passed all four jobs](https://github.com/vanshnanda08/NagrikSetu/actions/runs/42686876733),
including backend, frontend, API/browser journeys and the Render deploy trigger.
Vercel's commit status is successful. Live health and Patiala ward reads passed;
the user-approved synthetic photo complaint **CT-2026-000918** returned 201,
with actual Cloudinary upload, loaded evidence, map tiles and photo dialog checks.
Full backend: 383 total, 381 passed, 2 optional skips; frontend: 115 passed,
lint, types and production build passed. Native Chrome installation attempts
were unsuccessful; the user subsequently chose **browser-only use** on
10 November. Installation/standalone-app checks are no longer required.
See [release readiness](RELEASE_READINESS.md); dated pre-release statements below
remain historical and are superseded by this result where explicitly checked.

Hosted recheck, 10 November: health returned 200 / UP after 152.5 seconds;
database-backed public reads and the Vercel CORS origin passed. An invalid-photo
probe confirmed active validation without creating a complaint. This supersedes
the availability blocker below, not the remaining genuine-photo, release and
device checks. The live wards remain in Ludhiana. See [release readiness](RELEASE_READINESS.md).

Latest local follow-up: [release readiness](RELEASE_READINESS.md), 8 November 2026.
The Patiala V11 migration, map interaction/accessibility corrections, explicit
email-recovery deferral and test scheduler isolation are verified locally.
Fresh backend result: 379 passed / 2 optional skips; frontend: 115 passed,
lint, TypeScript and production build passed. Current API probes time out;
production recovery/photo verification and native/physical-device checks remain
open. This working tree has not been committed, pushed or deployed.

Release record: 2026-10-27. Scope decision updated: 2026-11-07.
Email notifications and email-based password recovery are deferred to a future
update at the user's request. Provider activation and live delivery/reset testing
are excluded from current completion requirements; existing code is retained.
In-app notifications and signed-in password changes remain in scope.

The implementation and verification below describe the earlier deployed release.
Latest local workflow fixes and test counts are in [WORKFLOW_FIXES.md](WORKFLOW_FIXES.md).
Historical milestone reports retain their dated results.

Local follow-up, 7–8 November: [quality verification](../frontend/QUALITY_VERIFICATION.md)
records corrected short-message validation and verification wording, a real
photo upload/server hash check, durable outbox recovery, desktop keyboard and
user-confirmed VoiceOver announcements, and twelve responsive checks. Full code
checks passed: 332 backend tests (two optional evaluations skipped), 115 frontend
tests, lint, TypeScript and build. Chrome offered installation but native install
did not complete. Physical-phone tests were unavailable. The later
[end-to-end audit](END_TO_END_TEST_REPORT.md) completed the cross-role browser
journey and real service-outage recovery. All five confirmed defects were then
corrected in [audit follow-up fixes](AUDIT_FIXES.md), with
377 passing backend tests (2 optional skips), 115 frontend tests,
lint, TypeScript and build. No deployment followed these checks.

## Repository cleanup — 8 November 2026

Removed the unimported `CategoryPicker` component and its unused selectors/pop
animation. The active report form retains its existing labelled select and
validation. Moved 132 superseded dashboard, theme-comparison and report-sizing
screenshots out of the repository into a local recovery archive; retained current
end-to-end/quality evidence and historical result JSON. Original source briefs,
academic deliverables, tests, configuration/secrets, backups, dependencies and
active build output were preserved. The archive manifest records paths/hashes.
Validation in an isolated frontend copy passed: 115 tests, ESLint, TypeScript
and the production build. Source/archive hashes and existing dirty-file checks
passed; the running backend health remained UP. No backend files changed, so
backend tests were not rerun for this cleanup. No commit, push or deployment
was performed.

## Implemented scope

| Area | Current state |
|---|---|
| Phases 0–4 | Setup, PostGIS schema, clustering, lifecycle, priority, SLA escalation, authentication and public/staff frontend implemented |
| Phase 5 | Deployment, CI, live health checks and encrypted backup recovery verified; destructive media cleanup remains opt-in pending dry-run review |
| Phases 6–7 | Citizen verification, notifications, supervisor assignment/moderation, analytics and live dashboard implemented |
| Phases 8–9 | Evaluation artifacts, abuse controls, privacy redaction, remaining screens, final report and demo runbook implemented |
| Extended scope | Refresh-token rotation/reuse detection, audited admin configuration and background offline submission implemented |
| Future update | Email notifications and email-based password recovery deferred; existing reset/outbox code and prior tests retained |
| Security additions | Password sign-in, refresh-session listing/revocation and browser security headers; authenticator support retired on 10 November |
| Engagement additions | Issue following without priority inflation and private reporter/municipal clarification threads implemented |
| Installable web client | Manifest, app icons and install prompt implemented alongside existing offline submission support |
| Database | Flyway V1–V11; V11 preserves ward IDs and historical complaint evidence; the live API now returns the four Patiala/Thapar demo sectors |

All roles use password sign-in; no profile requires authenticator enrollment.
Legacy enrollment paths return 410 and compatibility status fields are false.
Applied migrations and historical enrollment columns remain intact.
Revoking refresh sessions prevents future refreshes; issued
access tokens retain their bounded lifetime of up to 15 minutes.

## Historical release verification — 27 October 2026

| Check | Result |
|---|---|
| Full backend `mvn test` | 277 total: **275 passed, 2 skipped, 0 failures, 0 errors**; real PostGIS through Testcontainers in CI run #54 |
| Skipped backend tests | Two opt-in evaluation tests; retained evaluation results are documented separately |
| Security regressions | MFA enrollment replacement/recovery regeneration and private-message MFA bypass reproduced then fixed; four security integration tests passed in the full suite |
| Frontend Vitest | **82 passed** across 12 test files |
| Frontend ESLint / TypeScript | Passed |
| Production build | `npm run build -- --webpack` passed; 31 static pages generated, plus dynamic routes |
| Diff whitespace check | Passed |
| Chrome responsive / axe | 70 authenticated layout checks across 320–1920px and light/dark; 14 page/theme axe scans with zero violations |
| WebKit / Firefox | Both engines passed 10 responsive checks plus keyboard dialog smoke; local macOS 27 Firefox uses an isolated-home workaround for the upstream profile-access defect |

The API contract, lifecycle transition and lifecycle UI harnesses passed. The
expanded five-role browser sweep passed **190 checks with zero failures**.
Interactive checks covered SMTP password reset, email preferences, cross-tab
rotation, draft persistence, offline delivery/idempotency, admin save, MFA
enrollment/recovery, session revocation, following and private clarification.
The generated-page count is not the total number of application routes.

The new [final audit](../FINAL_AUDIT.md) records the security/dependency fixes,
responsive/accessibility results, precise limitations and CONDITIONAL production
verdict. It supersedes earlier blanket completion claims, not the historical
evaluation evidence.

## Remaining operational work

Backup gate update: the user confirmed successful backup/temporary restore and
encrypted artifact upload on rerun, downloaded the artifact, and verified GPG
decryption with exit code 0. The earlier failed attempt below is historical.

Deployment follow-up on 2026-10-27: CI run #54 passed at commit `afe7ce4`; the
Render health endpoint returned `UP` and the Vercel dashboard returned HTTP 200.
The scheduled backup rerun passed restore verification and encrypted upload; the
downloaded artifact subsequently decrypted with GPG exit code 0.

- Follow up physical-phone browser checks. Native installation is out of scope
  by user decision on 10 November. Desktop keyboard,
  basic VoiceOver and API-outage recovery are recorded above; they do not certify
  full accessibility, cold offline navigation or closed-browser background sync.
- Complete the explicitly blocked/untested cases in the end-to-end report;
  its principal role-by-role journey and confirmed-defect fixes are complete.
- Review the final audit's dependency applicability, key-rotation and rate-limit
  operating conditions before production sign-off.
- Verify Cloudinary management credentials and inspect the orphan-cleanup dry run.
- Record the final demonstration if required for submission.

## Deferred future update

Email notifications and email-based password recovery will resume in a future
update. Their existing outbox/retry/recovery implementation and historical local
SMTP results remain; no claim of real provider delivery is made. This work is
not a blocker for the current milestone or demo.

Push notifications, passkeys, Open311/municipal ERP integration, multilingual
UI and native mobile apps are not part of the implemented additions. They are
possible future work, not prerequisites for the agreed project scope.

See [README](../README.md), [final report](FINAL-PROJECT-REPORT.md),
[design decisions](DESIGN-DECISIONS.md) and [demo runbook](DEMO-RUNBOOK.md).
