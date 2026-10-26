# NagrikSetu — current progress

Updated 2026-10-26. The agreed application scope is implemented in the local
repository. Production deployment and live-service verification remain open.
This record supersedes older progress counts and original scope exclusions;
historical milestone reports retain their original dated results.

## Implemented scope

| Area | Current state |
|---|---|
| Phases 0–4 | Setup, PostGIS schema, clustering, lifecycle, priority, SLA escalation, authentication and public/staff frontend implemented |
| Phase 5 | Deployment configuration, CI, health checks, backup/restore tooling and media cleanup implemented; latest remote activation unverified |
| Phases 6–7 | Citizen verification, notifications, supervisor assignment/moderation, analytics and live dashboard implemented |
| Phases 8–9 | Evaluation artifacts, abuse controls, privacy redaction, remaining screens, final report and demo runbook implemented |
| Previously excluded features | Password reset, refresh-token rotation/reuse detection, opt-in email outbox, audited admin configuration and background offline submission implemented |
| Security additions | TOTP MFA, recovery codes, refresh-session listing/revocation and browser security headers implemented |
| Engagement additions | Issue following without priority inflation and private reporter/municipal clarification threads implemented |
| Installable web client | Manifest, app icons and install prompt implemented alongside existing offline submission support |
| Database | Flyway migrations V1–V10; V10 adds MFA, session metadata, followers and messages |

MFA role enforcement defaults to enabled for staff, supervisors and
administrators. The explicit demo profile bypasses mandatory enrolment for
seeded automation. Revoking refresh sessions prevents future refreshes; issued
access tokens retain their bounded lifetime of up to 15 minutes.

## Latest recorded verification

| Check | Result |
|---|---|
| Full backend `mvn test` | 276 total: **274 passed, 2 skipped, 0 failures, 0 errors**; real PostGIS through Testcontainers |
| Skipped backend tests | Two opt-in evaluation tests; retained evaluation results are documented separately |
| Security regressions | MFA enrollment replacement/recovery regeneration and private-message MFA bypass reproduced then fixed; four security integration tests passed in the full suite |
| Frontend Vitest | **82 passed** across 12 test files |
| Frontend ESLint / TypeScript | Passed |
| Production build | `npm run build -- --webpack` passed; 31 static pages generated, plus dynamic routes |
| Diff whitespace check | Passed |
| Chrome responsive / axe | 70 authenticated layout checks across 320–1920px and light/dark; 14 page/theme axe scans with zero violations |
| WebKit / Firefox | WebKit: 10 responsive checks plus keyboard dialog smoke passed. Firefox: browser launch blocked by local profile error, not verified |

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

## Remaining work before production sign-off

Backup gate update: the user confirmed successful backup/temporary restore and
encrypted artifact upload on rerun, downloaded the artifact, and verified GPG
decryption with exit code 0. The earlier failed attempt below is historical.

Deployment follow-up on 2026-10-26: public frontend responds, but current audit
changes remain uncommitted and the latest successful remote CI covers the older
2026-10-11 commit. The latest scheduled backup failed before encrypted artifact
upload and produced no artifacts; authenticated logs are needed to diagnose it.
See [follow-up evidence](../FINAL_AUDIT.md#follow-up-step-1--deployment-checks-2026-10-26).

- Complete physical-device/screen-reader and actual PWA installation checks;
  automated browser coverage does not certify full accessibility or OS-level sync.
- Review the final audit's dependency applicability, key-rotation and rate-limit
  operating conditions before production sign-off.
- Deploy the current changes and verify Render/Vercel health and user flows;
  the live applications are not confirmed to match the local repository.
- Configure and verify production mail, Cloudinary and authentication secrets.
- Confirm a scheduled encrypted backup artifact can be downloaded and restored.
- Review Cloudinary orphan-cleanup dry-run results before enabling deletion.
- Record the final demonstration if required for submission.

Push notifications, passkeys, Open311/municipal ERP integration, multilingual
UI and native mobile apps are not part of the implemented additions. They are
possible future work, not prerequisites for the agreed project scope.

See [README](../README.md), [final report](FINAL-PROJECT-REPORT.md),
[design decisions](DESIGN-DECISIONS.md) and [demo runbook](DEMO-RUNBOOK.md).
