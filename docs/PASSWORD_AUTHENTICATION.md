# Password authentication — 10 November 2026

At the user's request, authenticator enrollment, one-time/recovery-code sign-in
and mandatory municipal MFA are retired for every role. The citizen → municipal
handoff remains part of the ongoing deployed dry run; this document records the
implementation and local verification, not a completed production rollout.

## Behavior

- Every role signs in with its existing account password. No existing password
  was reset or account permission expanded beyond its assigned role/scope.
- Security shows password changes and signed-in devices. Login code fields,
  enrollment/recovery controls and setup-required banners are removed.
- Role/department/ward guards, BCrypt verification, JWT signature/type/expiry
  checks, login throttling, secure refresh cookies, token rotation/reuse detection
  and device/session revocation remain.
- Existing accounts with legacy enrollment data also use password sign-in.
  `TotpService` and its exception handler are removed; old MFA configuration
  cannot reactivate enforcement.
- Applied migrations and historical enrollment columns/tables are preserved.
  They are inert, not deleted or used to authenticate. Cached clients receive
  compatibility status fields `false`/`0` and `mfaSetupRequired=false`; old login
  `mfaCode` input is ignored. Retired setup/enable endpoints return **410 Gone**
  and cannot generate credentials. The current frontend never calls them.
- The actual Security UI, role fixtures, local verification tools, setup guide
  and screen map now describe password authentication. Dated historical MFA
  test reports retain their original results and are superseded for current scope.

## Checks actually completed

Tests/builds ran in isolated source copies and disposable PostGIS databases;
ordinary localhost services and production accounts were not modified by them.

| Check | Observed result |
|---|---|
| Final-source full backend `mvn clean test` | **388 total: 386 passed, 2 optional evaluation skips**, no failures/errors |
| Security integration regression | Nine cases passed, including all four role workspaces, non-admin denial, legacy enrolled accounts, disabled enrollment, old-client payload compatibility, refresh role changes and session revocation |
| Legacy enforcement setting | Regression class and scratch API explicitly set the former requirement property true; it does not restore enrollment or restrict municipal roles |
| Frontend Vitest | **115 passed**, 16 files |
| ESLint, TypeScript, production webpack build | Passed |
| Actual password-only UI | **16 groups passed** across citizen/staff/supervisor/admin; allowed workspace reads, non-admin denial, actual other-device revocation, retired endpoint refusal and logout |
| Security layouts | **24 passed**: four roles at 1280×600, 1366×768, 1440×900, 1920×1080, 390×844 and 768×1024; no horizontal overflow, no desktop outer scrolling, all password fields/action visible at 1280×600 |
| Local Firefox and WebKit | Each passed 10 route/width checks and dialog keyboard/Escape |
| Diff whitespace and changed JavaScript syntax | Passed |

The initial test compilation caught an obsolete MFA argument in the shared token
fixture; it was corrected before the final clean full suite. The earlier failure
is retained and is not counted as a pass. The 24 layouts include an inspected
desktop administrator screen and mobile staff screen.

## Browser smoke follow-up

The first published follow-up, `8b78d02`, passed backend/frontend CI and all role
route checks, then failed the WebKit smoke on background RSC reads cancelled by
the harness's fixed-delay hard navigation. The harness now waits for finite
API/RSC reads and a brief quiet period before replacing each document, excluding
the deliberately persistent dashboard event stream. No page errors are filtered.

The revised harness passed **three deployed-site repetitions** in both Firefox
and WebKit. A separate loopback fixture deliberately threw a JavaScript error;
both engines still failed as expected. This verifies the smoke's sensitivity,
not a promise that arbitrary rapid reloads or every Safari scenario are certified.
The new commit's GitHub CI and full deployed complaint journey still need their
own results recorded after publication.

Local evidence, ignored by Git: `artifacts/password-auth-20261110/` contains final
suite counts/logs, build results, 24 captures and `ui-results.json`.
`artifacts/deployed-journey-20261110/` contains repeated browser logs and the
runtime-error control. Credentials and private browser state are not published.

- [Administrator Security, desktop](../artifacts/password-auth-20261110/ADMIN-security-1280.png)
- [Staff Security, mobile](../artifacts/password-auth-20261110/STAFF-security-390.png)
