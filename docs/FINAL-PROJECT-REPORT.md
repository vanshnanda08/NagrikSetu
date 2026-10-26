# NagrikSetu — Final Project Report

## Abstract

NagrikSetu is an end-to-end municipal complaint system that turns repeated
citizen observations into accountable civic work. Reports are grouped by
category and geography in real time, prioritised, assigned an SLA, escalated
when overdue, and resolved only after citizen verification. The implementation
combines a Spring Boot/PostGIS backend with a Next.js public and staff client.
Its main technical contribution is a bounded incremental clustering pipeline
that remains correct under concurrent submission and exposes every grouping
decision for public inspection and supervisor correction.

The completed system includes all planned phases: reporting, clustering,
lifecycle and escalation, public dashboards, deployment automation, citizen
verification, supervisor tools, quantitative evaluation, abuse controls, and
the remaining administrative screens. The 2026-10-26 backend run records 276 tests:
274 passed, 2 opt-in evaluations skipped, and zero failures/errors. All 82
frontend tests, lint, TypeScript, and the production build pass. See
[PROGRESS.md](PROGRESS.md) and [FINAL_AUDIT.md](../FINAL_AUDIT.md) for current
verification, security changes and the conditional production-readiness verdict.

## Problem and objectives

Conventional complaint portals create one ticket per submission. A widely
reported pothole therefore creates administrative duplication while an equally
serious but less visible defect remains low priority. NagrikSetu instead treats
reports as observations and issues as work items. It aims to:

1. merge observations that refer to the same physical defect without allowing
   clusters to drift along a road;
2. preserve traceability from every issue back to every report;
3. make deadlines, escalation, and resolution visible to citizens;
4. prevent the department doing the work from unilaterally declaring success;
5. remain usable without mandatory registration while containing obvious abuse.

## Implemented system

The backend stores coordinates as PostGIS geography-aware data and uses ward
containment, category-specific radii, GPS uncertainty, and an accuracy-weighted
centroid. Candidate selection is followed by an advisory transaction lock and
a post-lock reread, preventing parallel requests from creating duplicate
issues. A configurable extent cap bounds chain growth. Low-confidence decisions
are flagged for a supervisor, who can confirm, split, merge, recategorise, or
reassign while retaining a permanent audit log.

A declarative nine-state lifecycle controls who can acknowledge, assign, work,
reject, submit, verify, reopen, resolve, and close an issue. The SLA clock pauses
during verification. Scheduled, idempotent sweeps escalate overdue work and
settle verification windows. Citizens who reported an issue vote on a claimed
fix; silence after the configured window is published as an unverified closure
rather than hidden.

The Next.js client provides anonymous reporting, maps and cluster inspection,
ticket tracking, citizen notifications and verification, scoped staff work
queues, supervisor moderation and analytics, administrator audit/system views,
ward detail, department analytics, and profile management. Dashboard changes
arrive over a coalesced server-sent-event stream. Drafts and explicit offline
submissions persist on-device and retry through a credential-free background
outbox. Administrators manage existing category/SLA policy, account access,
department hierarchy and ward officers through validated, audited screens.
Users may opt into email updates, which are delivered from a transactional
outbox without coupling issue transitions to SMTP availability.
Citizens can also follow issues without changing priority, while signed-in
reporters and scoped municipal staff use a private clarification thread.
The client is installable through a web-app manifest and retains its existing
offline submission support.

## Security, privacy, and abuse resistance

Authentication uses short-lived JWT access tokens and server-held httpOnly
refresh cookies. Refresh tokens rotate through database-backed families with
reuse detection. Users can inspect and revoke active session families.
Municipal roles require TOTP authenticator MFA in production; encrypted secrets,
counter-based replay protection and one-use recovery codes protect enrolment
and recovery. Password-reset links are random, one-use and expire after 30
minutes; password and access changes revoke refresh sessions. Roles are
supplemented by department and ward guards. API
failures use RFC 7807 responses; unauthenticated and forbidden filter-chain
failures use the same safe format, and unexpected server errors do not expose
messages or stack traces.

Anonymous access is retained because mandatory registration would reduce and
bias civic participation. Layered controls instead limit repeat nearby reports
per device, daily reports per account, and login attempts. The browser verifies
image signatures and compresses uploads. The API accepts only this deployment's
HTTPS Cloudinary URLs, downloads a deterministic rendition, checks decoded
MIME and dimensions, and computes the authoritative 64-bit perceptual hash.
Reused report or proof photos, suspicious capture-time gaps, and profanity are
soft-flagged for review. Supervisors may redact a description from public
responses without deleting the original evidence; actor, reason, and time are
recorded permanently.

## Evaluation method

All evaluation uses disposable PostGIS databases and scripts in `evaluation/`.
The clustering corpus contains 250 deterministic observations with stable
ground-truth defect labels. Quality is measured pairwise: a true positive is a
pair belonging to the same defect and the same produced issue. This avoids
letting singleton defects inflate an ordinary accuracy score.

The radius experiment replays chronological observations through the actual
Java clustering service and PostGIS queries for every category at base radii
from 10 m to 100 m. The extent-cap experiment uses the same production path to
compare enabled and nonbinding variants on both the labelled corpus and a
deliberately linear chain of six road defects. Python summarizes the retained
assignments. The concurrency experiment posts identical observations
through the live HTTP API in cohorts of 2, 5, 10, 20, and 50. The latency
experiment performs 500 live ingests at each of 1k, 10k, and 50k pre-existing
issues, using the production spatial query and indexes.

## Results

| Experiment | Result |
|---|---|
| Labelled clustering | precision 1.000, recall 0.790, F1 0.883 (541 TP, 0 FP, 144 FN) |
| Extent cap, labelled corpus | enabled F1 0.883; disabled F1 0.931 |
| Extent cap, linear stress corpus | enabled F1 1.000; disabled F1 0.558 |
| Concurrent submissions | one distinct issue at N = 2, 5, 10, 20, and 50 |
| 1k existing issues | p50 56.0 ms, p95 126.5 ms, p99 492.3 ms, 0 failures |
| 10k existing issues | p50 52.7 ms, p95 79.8 ms, p99 144.3 ms, 0 failures |
| 50k existing issues | p50 57.7 ms, p95 81.1 ms, p99 167.6 ms, 0 failures |

The retained Micrometer timer, reset after 50 warmups at each scale, recorded
direct-service p50 values of 3.41 ms, 4.33 ms and 8.00 ms at 1k, 10k and 50k
issues (300 measured ingests each). Those measurements isolate clustering and
database work; the table above is the separate end-to-end HTTP measurement.

The baseline made no false-positive pair merges in the labelled corpus; its
errors were conservative splits. Removing the extent cap improved recall on
that randomly distributed corpus, but failed badly on the precise geometry the
cap is intended to protect: locally mergeable observations arranged along a
road. This is an explicit safety/recall tradeoff, not a universal improvement.
Median latency remained effectively flat through 50k existing issues. The 1k
p99 is treated as a cold-start/outlier observation rather than evidence that a
smaller database is slower.

Source tables and vector plots are in `artifacts/evaluation/`.

## Verification and reproducibility

- Backend: 276 JUnit tests recorded: 274 passed, 2 intentionally skipped,
  zero failures/errors. Coverage includes real PostGIS migrations, clustering,
  concurrency, lifecycle, MFA/session security, issue engagement, moderation,
  dashboards, and scheduled jobs.
- Frontend: 82 Vitest tests, ESLint, TypeScript, and Next.js Webpack production
  build.
- Browser: 190 five-role route checks passed; API/lifecycle, account-security,
  engagement, local SMTP recovery, offline delivery and admin-save checks passed.
  Exact scope and remaining device/accessibility checks are in the final audit.
- Evaluation: deterministic seed and labels, production Java/PostGIS sweep
  assignments, fresh per-scale Micrometer snapshots, the k6 HTTP harness,
  explicit acknowledgement before destructive prefill, and retained outputs.
- Operations: container build, health probes, CI workflows, tested backup and
  restore scripts, and dry-run-first media cleanup.

## Limitations and future work

The benchmark is a controlled local measurement, not a production capacity
claim. The in-memory fast rate limiter is intentionally backed by durable report
history for core report limits, but a multi-instance deployment should replace
local buckets with a shared store. Perceptual hashing is a screening signal and
must not be treated as proof of fraud. GPS and category labels remain noisy, so
the supervisor queue is part of the design rather than an exception path.

SMTP, Cloudinary, the live deployment, scheduled backup artifact, Cloudinary
deletion, and final recorded demonstration require external accounts and
credentials. Their code paths and runbook are complete; local SMTP delivery was
verified against Mailpit, while production activation remains an operator
responsibility.

## Conclusion

NagrikSetu demonstrates that municipal reporting can reduce duplicate work
without sacrificing citizen-visible evidence. Concurrency-safe bounded
clustering, explicit moderation, public SLA accountability, and independent
verification form one coherent system. The measured result is conservative on
ambiguous grouping, robust against linear chain merges, stable through 50k
issues in the local benchmark, and fully covered by automated quality gates.
