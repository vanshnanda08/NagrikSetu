# NagrikSetu — implementation and production-readiness audit

Audit date: 2026-10-26; closeout updated 2026-10-27. This is a source/build/test
and public-health audit, not a claim that every possible interaction has been
exhaustively tested.
Existing uncommitted work was preserved. No production data or infrastructure was
changed. Browser writes used a dedicated scratch PostGIS database and local Mailpit.

## Current closeout status

Commit `10481bf` passed GitHub Actions run #53 and triggered the deployment gate.
On 2026-10-27 the Render health endpoint returned `UP` and the Vercel dashboard
returned HTTP 200. The scheduled encrypted-backup rerun passed dump restoration
and artifact upload; the downloaded artifact decrypted locally with GPG exit code
0. Firefox and WebKit now both pass the cross-browser smoke suite, with an isolated
temporary home used to avoid an upstream macOS 27 Firefox profile-access defect.
Production transactional email delivery is explicitly deferred at the user's
request; the implemented outbox/retry code and local SMTP path remain tested.

## 1. Project overview

- Java 21 / Spring Boot 3.5.16 REST API, PostgreSQL 17 with PostGIS, Hibernate,
  Flyway migrations V1–V10, JWT access tokens and rotating refresh-token families.
- Next.js 16.4.3 App Router / React 19 / TypeScript / Tailwind 4 frontend;
  TanStack Query, Leaflet and a same-origin authentication cookie gateway.
- Citizen photo reports, geographic clustering, public issue/map/dashboard views,
  staff lifecycle and SLA escalation, citizen verification, supervisor moderation
  and assignment, administration and audit history.
- Extended functionality includes password reset, opt-in email notifications,
  MFA/recovery codes, session revocation, following, private clarification,
  persistent drafts and offline worker delivery, and an installable manifest.
- External production dependencies: Cloudinary, transactional email, hosted database and
  Render/Vercel deployment. GitHub Actions provides test/build/deploy gates.

The repository structure, routes, migrations, configuration, test harnesses and
deployment scripts were inventoried. Source review concentrated on authorization,
session transitions, report ingestion/media, engagement, notification delivery,
admin configuration and client error handling. Automated route coverage is not
equivalent to manually exercising every control or reading every source line.

## 2. Problems identified and fixes

| Severity | Finding / impact | Resolution |
|---|---|---|
| Critical (dependency advisory) | Installed Next.js release had a known critical image-optimizer advisory among other advisories. Exploitability of the hosted configuration was not established. | Updated Next.js and eslint-config-next to 16.4.3; patched compatible transitive dependencies. Frontend audit now reports zero known vulnerabilities. |
| High | An enabled authenticator could be replaced using the password-only setup path, undermining MFA; enable could regenerate recovery material. | Reject setup/enable for already-enabled factors, throttle setup attempts, revoke pre-enrollment refresh sessions. Regression reproduced before fixing. |
| High | Private-message endpoints checked authentication while service logic read raw role claims, bypassing mandatory municipal MFA. | Require authorized roles at the controller boundary; unverified roles cannot read or post. Regression reproduced before fixing. |
| High | Authority conversion relied on a token's historical MFA-policy claim. | Apply current server MFA policy to every authorization conversion. Demo exemption remains explicit. |
| High | Unvalidated post-login `next` could send an unsafe URL to the router. | Allow only local absolute paths; reject scheme URLs, protocol-relative URLs, backslashes and control characters. |
| High (dependency advisories) | Runtime dependency scan matched Jackson, Tomcat, PostgreSQL JDBC, Log4j and Commons Lang advisories. | Compatible maintenance updates, followed by complete backend tests. Two separately assessed Spring MVC findings remain below. |
| Medium | Auth cookie write endpoints lacked an explicit origin check. | Reject cross-origin/same-site browser writes before reading or setting cookies. |
| Medium | Revocation and rotation could race; expired session families remained visible. | Serialize revocation with the user-row lock used by rotation; exclude expired families. |
| Medium | Private query data could remain cached when switching accounts. | Clear query cache on account transitions; include user identity in the staff-detail cache key. |
| Medium | Registration allowed missing email although sign-in required it; BCrypt's byte ceiling was not enforced consistently. | Require email; validate 10-character minimum / 72 UTF-8-byte maximum for new passwords across register/change/reset; bound login inputs. |
| Medium | Registration was not throttled. | Independent peer bucket: 20 attempts/hour, with regression coverage. Production proxy limitations are noted below. |
| Medium | Follow/session mutations could fail without useful feedback; recovery-code entry used a numeric mobile keyboard. | Visible error/success feedback, retry where appropriate, and text-capable MFA entry. |
| Medium | Notification timestamps reused the issue modification time, stale for clarification messages. | Use the injected current clock when creating notifications. |
| Medium | Issue status plus overdue badge overflowed the 320px viewport. | Allow the status group to wrap within available width. |
| Medium | Horizontally scrolling report photos were not keyboard-focusable. | Add a named, focusable photo region. |
| Low | Long clarification references and metadata could overflow narrow layouts. | Wrap message words and metadata rows. |
| Low | Auth gateway transport failures could yield unhelpful errors. | Bounded upstream timeout and explicit temporary-unavailability responses. |
| Low | Progress counts and production mail URL variable documentation were stale. | Refresh current documentation; keep dated historical results distinguishable. |

## 3. Changed files/components in this audit

Paths below are relative to the repository; they describe this audit's changes,
not ownership of every pre-existing worktree difference.

- Backend security: `backend/src/main/java/com/civictrack/user/auth/{TotpService,TokenSupport,PasswordPolicy,AuthService}.java`,
  `config/SecurityConfig.java`, `abuse/RateLimitService.java`,
  `user/api/{AuthController,AccountSecurityController}.java`,
  `user/dto/{RegisterRequest,LoginRequest}.java`, `user/ProfileService.java`,
  `user/auth/PasswordRecoveryService.java` and `issue/api/IssueEngagementController.java`.
- Notification timestamp: `backend/src/main/java/com/civictrack/notification/NotificationService.java`.
- Backend dependencies: `backend/pom.xml` — Jackson BOM 2.21.7, Tomcat 10.1.61,
  PostgreSQL JDBC 42.7.12, Log4j 2.25.5, Commons Lang 3.18.0.
- Backend regression tests: `SecurityFeaturesIT`, `PasswordPolicyTest`, `RateLimitServiceTest`.
- Frontend auth: four `frontend/src/app/api/auth/*/route.ts` handlers;
  `frontend/src/lib/{sameOrigin,safeRedirect}.ts` and their tests;
  `auth.tsx`, `authCookie.ts`, `schemas.ts`, `signInDialog.tsx`, `components/SignInDialog.tsx`.
- Frontend UX: `components/{IssueEngagement,StatusRule}.tsx`,
  `app/me/security/page.tsx`, `app/staff/issues/[id]/page.tsx`,
  `app/issues/[id]/page.tsx`.
- Dependency manifest/lock: `frontend/package.json`, `frontend/package-lock.json`.
- Browser verification: `tools/audit.mjs`, `tools/browsers.mjs`, `tools/sweep.mjs`, `tools/package.json`,
  `tools/README.md`; existing `features.mjs` was executed.
- Documentation: this report, current progress/readmes/runbook/final report;
  `.gitignore` now allows the current progress document to be versioned.

## 4. Verification results

All results below were executed during this audit. The final markup fixes were
rebuilt and rechecked with the authenticated responsive/accessibility harness;
the 190-route sweep preceded those markup-only fixes.

| Executed check | Result |
|---|---|
| Complete backend `mvn test` after dependency/security and HTTPS-mail changes | **277 total: 275 passed, 2 skipped, 0 failures, 0 errors**; real PostGIS through Testcontainers in CI run #53 |
| Backend packaging | `mvn -DskipTests package` passed; packaged server started and health returned UP |
| Frontend Vitest | **82 tests passed across 12 files** |
| Frontend ESLint / TypeScript | Passed |
| Webpack production build | Passed; 31 static pages generated, plus dynamic routes |
| API contract harness | Passed; required/unexpected field checks, not a full schema proof |
| Lifecycle transition harness | Passed through NEW → ACKNOWLEDGED → ASSIGNED → IN_PROGRESS → PENDING_VERIFICATION |
| Lifecycle browser UI walk | Passed |
| Five-role route sweep | **190 checks, zero failures**, including security/configuration/recovery routes and deliberate missing-resource routes |
| Feature browser harness | Passed SMTP password reset, old-password rejection/new login, email preference persistence, cross-tab refresh, draft recovery, offline delivery/idempotency, admin configuration save, 375px layout checks |
| Security/engagement browser journeys | Passed MFA enrollment/recovery/single-use rejection, session revocation, unsafe redirect fallback, following, private two-way messages and simulated failed-write feedback |
| Final Chrome responsive/accessibility audit | **70 authenticated route/theme/width checks passed** (7 routes × 2 themes × 320/375/768/1280/1920px); **14 axe scans, zero violations** using WCAG 2 A/AA, 2.1 AA and 2.2 AA tags; manifest/icon requests passed; no page runtime errors |
| WebKit browser smoke | **10 responsive route checks passed** at 320/1280px; sign-in dialog keyboard order/Escape and runtime-error checks passed |
| Firefox browser smoke | **10 responsive route checks passed** at 320/1280px; dialog keyboard/Escape and runtime-error checks passed. The harness isolates Firefox's home on macOS 27 to work around the confirmed upstream profile-access defect |
| Frontend/tools dependency audit | Zero known vulnerabilities reported by npm audit |
| Backend OSV runtime scan | 116 runtime artifacts checked; only Spring MVC 6.2.19 matched remaining advisories |
| Whitespace check | `git diff --check` passed |

Two security regression tests initially failed and passed after the fixes. The
first responsive audit failed on the 320px issue list; the subsequent run passed
70 layout checks but found the photo-strip keyboard accessibility issue. These
failures were treated as defects, not silently excluded from the harness.
The final Chrome run passed after both fixes, with session restoration explicitly
awaited before each protected-page check. A repeated-run message fixture also
needed unique text to avoid Playwright's ambiguous-selector failure; no product
change was needed for that test-harness issue.

The two skipped backend tests are opt-in evaluation workloads. Historical
clustering/latency evaluation artifacts were not regenerated for this audit.
Local logs live under `/tmp/nagrik-audit-*.log`; screenshots are under
`artifacts/audit/` and `artifacts/browser/` (ignored, regenerable local evidence).
The final feature harness was rerun successfully after the last frontend build.
Audit application processes and dedicated scratch containers were stopped after
verification; scratch containers were retained, not deleted. The initially
stopped Colima runtime was returned to its stopped state.

## 5. Security assessment and operating conditions

Passwords are hashed; refresh credentials stay in HttpOnly cookies; access
tokens remain in browser memory. Role/department/ward and reporter checks are
server-side. Mandatory municipal MFA was tested under normal test configuration;
the browser corpus explicitly uses the demo exception. Production must not use
`demo` or `seed` profiles or demo credentials.

The remaining Spring MVC scanner matches are:

- [CVE-2026-47890: SSE view-fragment injection](https://spring.io/security/cve-2026-47890/).
  The application emits constant dashboard event strings, not user-controlled
  SSE view fragments. Assessed as not applicable to the current implementation.
- [CVE-2026-47884: XSLT view issue](https://spring.io/security/cve-2026-47884/).
  The API does not configure or render `XsltView`. Assessed as not applicable.

Spring's 6.2 maintenance fixes require its commercial distribution; moving to
the OSS 7.x framework requires a planned Boot migration. Do not force incompatible
major dependency overrides. Reassess these findings if view rendering is added.
The Next.js update addresses, among others, the
[image optimizer advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw).
Scanner results are point-in-time evidence, not a guarantee of vulnerability absence.

- Revocation blocks subsequent refresh, not already-issued access tokens (up to
  15 minutes). UI now states that limitation.
- MFA secret encryption currently derives from the configured JWT secret.
  Preserve that key securely with backups; changing it needs a deliberate
  re-encryption/re-enrollment plan. Independent versioned encryption keys and a
  lost-all-factors recovery procedure remain operational hardening work.
- Login/registration/setup buckets are process-local. The backend deliberately
  does not trust arbitrary forwarded IP headers; BFF traffic shares a peer bucket.
  Validate capacity and add trusted edge/distributed throttling before scaling.
- Scoped filename/content secret checks found no obvious committed private key;
  a full git-history credential scan was not performed.
- No destructive migration, production mail, Cloudinary upload/delete or remote
  deployment was performed. Production upload verification must remain enabled.

## 6. UI, accessibility and performance

The existing light/dark visual identity was preserved. Changes address narrow
status wrapping, long clarification content, keyboard photo scrolling, usable
recovery-code entry and actionable feedback. Private queries are isolated by
account; municipal message requests are not sent before required MFA setup.

Local warm sequential read sample (20 requests each, seeded scratch database,
no claim about production load): public issues p50 **14.1ms**, p95 **53.3ms**;
dashboard summary p50 **13.5ms**, p95 **28.6ms**. No architectural or database
optimization was justified by this small sample. It is not a load test, a browser
Web Vitals measurement or a replacement for the historical 10k/50k benchmarks.

## 7. Remaining operational work

1. Production transactional email delivery is deferred. Before enabling it,
   verify the provider account/sender, real reset links, retries and monitoring
   under the non-demo profile. Do not expose the provider key to the frontend.
2. Review the Cloudinary orphan-cleanup dry run before authorizing deletion.
   Production evidence verification must remain enabled.
3. Complete physical-device keyboard/screen-reader, installed-PWA and
   closed-browser background-sync checks where formal sign-off requires them.
   OS-level background execution remains browser-dependent and is not guaranteed.
4. Validate shared-peer throttling and expected production load before scaling.
   Clarification threads and session history need pagination or retention
   planning for very large installations.
5. Preserve JWT/MFA and backup keys securely, rehearse rollback across migrations,
   keep the Spring advisory assessment current, and plan supported-framework
   upgrades plus a full credential-history/configuration scan.

## 8. Production-readiness verdict

### Historical follow-up step 1 — deployment checks (2026-10-26)

Read-only public checks found:

- Remote `main` and local HEAD are `b3c627a32e58aa72183443a98e2ea9b9c05a56cd`.
  The audited fixes remain uncommitted locally; CI cannot verify this working
  tree and the deployed application is not verified to contain these changes.
- The latest [CI run](https://github.com/vanshnanda08/complaint-system/actions/runs/38157641082)
  passed on 2026-10-11 for that older commit. It does not validate the audit fixes.
- The public frontend returned HTTP 200 at `/dashboard`. HSTS was present;
  `X-Content-Type-Options` and `X-Frame-Options` were absent from that response,
  unlike the current local Next configuration.
- Two API health requests each timed out after 45 seconds; API availability was
  not established. These timeouts alone do not establish the cause.
- The latest [scheduled backup run](https://github.com/vanshnanda08/complaint-system/actions/runs/40139271904)
  failed on 2026-10-24 at **Back up and verify restoration**. Encrypted artifact
  upload was skipped and the run lists **zero artifacts**. The failure cause is
  not yet known: the job-log endpoint returned HTTP 403 without authentication.

Next gate: obtain the failed backup step's redacted logs and authenticated
deployment configuration access. Do not paste passwords, JWT keys, SMTP secrets
or backup passphrases into chat. Review and explicitly authorize any commit/push
or deployment: pushing `main` can automatically trigger both hosted deployments.
No commit, push, deployment, backup dispatch or hosted configuration change was
performed during this follow-up.

### Verdict

Backup follow-up: the user supplied a successful rerun screenshot for attempt 2
of run 40139271904, including restore verification and encrypted artifact upload.
The user downloaded the artifact and verified decryption locally with GPG exit
code 0. This resolves the missing-secret/backup-artifact gate above; application
startup against a restored current-release database remains a separate check.
The user subsequently authorized committing and pushing the audited changes to
`main`, including the configured automatic deployment triggers.

**Current verdict (2026-10-27): complete within the agreed application scope.**
The full CI pipeline passed on `10481bf`, both public services are healthy, backup
creation/restoration/encryption recovery is verified, and Chrome, Firefox and
WebKit checks pass. Live transactional email delivery is the one expressly
deferred integration. The remaining items in section 7 are operating controls
or physical-device validation, not unfinished core features.

Production follow-up found that the Render service uses the Free plan, which
blocks common outbound SMTP ports. The user verified an individual sender in
Brevo. A server-side Brevo HTTPS delivery provider and regression test were
added locally; it remains disabled until the API key and sender environment
variables are configured and this follow-up change is deployed.

**CONDITIONAL.** Confirmed security and functional defects were repaired and
local backend/frontend/build/browser gates were exercised. Production deployment,
real service credentials, backup restoration, cross-device accessibility and
operational-scale checks are not demonstrated by local passing tests. This
report does not authorize production deployment or certify complete WCAG conformance.
