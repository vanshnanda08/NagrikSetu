# Follow-up fixes for the end-to-end audit

Verified **8 November 2026 (Asia/Kolkata)** against the current local working tree;
Git baseline `74c76ec155a2ad8b354ae35b27540c8e58030b9d`. Existing uncommitted work was preserved.
These changes address the five confirmed categories in
[the original end-to-end audit](https://github.com/vanshnanda08/NagrikSetu/blob/e0b4cedbfb5c2b475dc557532e19130e6549a913/docs/END_TO_END_TEST_REPORT.md). That report's failures
remain historical evidence; its browser/device limitations are not converted
into passes by these fixes. No commit, push or deployment was performed.

## Implemented corrections

| Audit finding | Change | Fresh regression evidence |
|---|---|---|
| D01: CSV formula prefixes hidden by whitespace | Every exported untrusted field detects `=`, `+`, `-` or `@` after Unicode whitespace, control or format characters, then prefixes the original cell with an apostrophe. Stored notes stay exact; CSV quoting still applies. | Actual controller acknowledgement with tab-prefixed formula text, independent stored-note read and exported CSV assertion; space/tab/CR/LF/NBSP/em-space/BOM variants and ordinary text. Spreadsheet execution was not attempted. |
| D02: tied audit rows skipped or duplicated | The union retains each source event's primary key as an internal sorting field. Page and export share a complete order: time descending, kind, issue ID, event ID descending. Public DTOs and API contracts are unchanged. | 254 tied prepared events spanning status, moderation and escalation, traversed through actual controller pages exactly once and compared with export order. Stable-dataset coverage; this does not promise snapshot pagination while new events are inserted. |
| D03: concurrent updates return HTTP 500 | Spring/JPA optimistic-lock conflicts return HTTP 409 with stable `concurrent-update` problem type and instructions to reload and review the latest complaint. Writes are not automatically replayed. | Actual competing PostGIS transactions through MockMvc controllers for acknowledgement, different assignee choices and repair proof. One success/one 409; winning state/history only; one verification round and notification. No mocked exception or timing-only race. |
| D04: visually blank configuration names | All four existing-record configuration editors share Unicode-aware name normalization and visible-character validation. Space/BOM edges are trimmed; whitespace/control/format-only names return readable HTTP 400 without changing records, audit or refresh sessions. Existing length and role/reference rules remain. | 40 new API/database cases across category, user, department and ward labels: 32 blank variants, four valid Unicode names and four length limits; six existing configuration tests also passed. |
| D05: misleading verification explanations | Verification tally, profile preferences and refused mandatory-mute response distinguish citizen confirmation, timeout resolution and later quiet-period closure. The quorum, timeout, negative-vote and closure rules are unchanged. | Profile regression asserts truthful refusal wording and preserved name/phone/preferences after refusal; existing full verification/timeout suite remains passing. Frontend type/lint/test/build checks cover the edited code; no new live browser or device review was performed in this follow-up. |

## Validation actually completed

All builds ran from source-only copies with their own `target`/`.next` output.
Backend integration tests used a disposable Testcontainers PostGIS database.
The user's ordinary frontend/backend processes, database and active build directories
were not used for regression writes or overwritten.

| Check | Command in isolated copy | Result |
|---|---|---|
| Full backend | `mvn -q -f <snapshot>/backend/pom.xml test` | Exit 0; **377 passed, 2 optional evaluation tests skipped**, 0 failures/0 errors, 59 suites |
| Frontend | `npm test` | Exit 0; **115 passed / 16 files** |
| ESLint | `npm run lint` | Exit 0 |
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit` | Exit 0 |
| Production build | `npm run build -- --webpack` | Exit 0 |
| Working tree | `git diff --check` | Exit 0; pre-existing work retained |

The full backend suite includes `AuditLogIT` (8),
`AdminConfigurationNameValidationIT` (40), `AdminConfigurationIT` (6),
`IssueConcurrentActionIT` (3), `ProfileIT` (5), and the existing verification,
scope, authentication, moderation, SLA, offline/API and closure regressions.
Focused tests are subsets, not extra tests to add to the full-suite total.
Test media remains synthetic in controller fixtures; the earlier audit's genuine
Cloudinary uploads are separate evidence and were not repeated here.

The concurrency test's initial setup used a row lock that also blocked history
foreign-key checks. Its barrier was corrected to `FOR NO KEY UPDATE`, allowing
both real versioned updates to reach the intended gate before release. The first
combined run then found two test-setup interactions: a 10-second barrier expired
on slow emulated PostGIS before the updates arrived (the eventual actual responses
were 200/409), and a new refusal test retained a constant phone also used by an
existing test. The barrier is now bounded at 45 seconds with diagnostics, and the
profile fixture uses a per-citizen phone. No production uniqueness, authorization
or locking protections were relaxed. The complete suite was rerun afterward.
Initial results are retained separately, not counted as passes.

Local machine-readable results and logs (the `artifacts/` directory is excluded
from Git):

- [Backend summary](../artifacts/audit-fixes-20261108T084837Z/backend-checks.json)
- [Initial combined run and setup corrections](../artifacts/audit-fixes-20261108T084837Z/backend-checks-initial.json)
- [Frontend commands and exits](../artifacts/audit-fixes-20261108T084837Z/frontend-checks.json)
- [Backend log](../artifacts/audit-fixes-20261108T084837Z/backend-tests.log)
- [Frontend build log](../artifacts/audit-fixes-20261108T084837Z/frontend-build.log)
- [Preservation and service checks](../artifacts/audit-fixes-20261108T084837Z/final-verification.json)

## Remaining boundaries

All five confirmed audit defect categories are implemented and regression-tested.
The original audit's two blocked browser checks, physical camera/GPS and phone
tests, native installation, full screen-reader/axe follow-up, cold offline/closed
browser behavior, and other individually untested edge cases remain as recorded
in its coverage matrix. No new browser passes or production-readiness claim are
inferred from unit/controller tests or the build.

Email delivery, SMTP/Brevo and email-based password recovery remain
**Deferred — future work**. No provider, real reset or outbound email was activated.
No new cloud assets or database migrations were introduced. Existing synthetic
Cloudinary assets from the earlier audit retain their documented cleanup boundary.

The original localhost services remain running with their prior process state;
they were not restarted as part of this code-only follow-up. Restart the backend
normally when you want to exercise the new backend code in that existing session.
