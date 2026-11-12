# Non-phone completion review — 12 November 2026

This is the current completion checklist. Older dated audits retain their own
results; their unresolved lists are superseded only by the evidence mapped here.
Physical-phone testing is postponed. Email delivery/password recovery remain
deferred, authenticator support is retired, and native installation is excluded.

## Confirmed defects corrected

| Finding and trigger | Resulting behaviour |
|---|---|
| Restore self-test accepted the temporary PostgreSQL initialization server, which then shut down | Wait for the final TCP listener before restoring. The initial fresh GitHub backup attempt reproduced the race; a current-data local backup/restore passed after the correction. |
| A supervisor bulk acknowledgement partly succeeded while another officer acknowledged a selected row | The retry count/button uses only rows still NEW after refresh. A reproduced three-row success/409/503 case now retries only the remaining actionable row. |
| An offline submission immediately navigated to an uncached outbox route | Keep the loaded form and saved confirmation visible offline, navigate after reconnection, and disable repeat submission once queued. A probe reproduced Chrome's offline error page before the fix. The replacement test verifies the photo and details remain in IndexedDB and cannot be overwritten by a second submission. |
| Citizen verification link was too small to meet the target-size check | Give it a 44px minimum interaction height and sufficient separation. The original desktop/mobile axe findings were reproduced; the revised pages pass. |
| Orphan cleanup inferred ownership from missing database rows across an entire Cloudinary account | Require an explicitly reviewed application-owned public-ID prefix. Missing scope skips cleanup. Other applications and unscoped legacy uploads remain outside automatic deletion. |
| Cleanup counted dry-run candidates and failed deletion attempts as successful deletions | Report planned, successfully deleted and failed counts separately; bound attempts even when deletion fails. No real deletion was performed. |
| A green CI job labelled deployment silently skipped a missing hook | Use an explicit deployment policy. `external` reports that Render's Git integration manages deployment; `hook` fails when its secret is missing; invalid modes fail. A successful policy check is never described as rollout proof. |

## Deployment policy

Render's deployment page was read directly after release: `482e3be` was live
as deployment `dep-dbqt5hh7lnhs73a2m6tg`, triggered by **Auto-Deploy**. The
repository variable `RENDER_DEPLOY_MODE` is now
explicitly `external`, retaining that existing deployment method. CI validates
backend/frontend/browser gates and truthfully reports that it did not deploy.
Vercel retains its own Git integration. This is not a claim that host-managed
automatic deployment waits for CI.

For a future CI-gated setup, configure the existing Render deploy hook as
`RENDER_DEPLOY_HOOK_URL`, choose `RENDER_DEPLOY_MODE=hook`, and align Render's
automatic-deploy settings to avoid a second independent deployment. Do not put
the hook URL in source or logs. External, missing-hook and invalid-mode shell
checks passed. Workflow context usage follows the
[GitHub context reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts).

## Verification evidence

- Full isolated backend clean test/package: **392 total, 390 passed, 2 optional
  evaluation skips, zero failures/errors**. Three added database-backed cleanup
  cases cover ownership scope, live proof retention, dry-run accuracy and bounded
  failed deletions. No dependency or migration upgrade was made.
- Final isolated frontend ESLint, TypeScript, **115 tests** and production webpack
  build passed after the application fixes.
- `tools/nonphone-closeout.mjs` runs on owned loopback app/API URLs. It checks
  mixed bulk acknowledgement, unsupported SSE polling and reconnect events,
  permanent outbox failures, Retry-After timing, successful payload clearing,
  offline confirmation/photo preservation, keyboard focus and **19 axe scans**:
  18 public/citizen/staff/supervisor/admin page scans at 1280×600 and 390×844,
  plus the saved offline confirmation. All six check groups passed without
  application runtime errors or reported axe violations. Desktop outer-page
  and horizontal overflow checks passed; mobile pages retain natural scrolling.
  Transport/concurrent-status examples are explicitly browser fixtures; ordinary
  role sign-in and initial data use the real isolated API.
- The broader earlier six-size layouts and live citizen→supervisor→staff→citizen
  verification→administrator closure remain recorded in
  [daily-use verification](DAILY_USAGE_VERIFICATION.md) and
  [the dataset report](THAPAR_DATASET.md). They are not counted as fresh runs here.
- Shell/Python/JavaScript syntax and whitespace checks were run. Local evidence,
  failed exploratory probes, screenshots and final results are retained in
  `artifacts/nonphone-closeout-20261112/`, excluded from Git.

### Cloudinary review

`scripts/review_cloudinary_media.py` made authenticated **GET-only** inventory
requests and read current production photo references in a read-only database
transaction. For the owned prefix `nagriksetu_thapar_demo_v2_`: **109 scanned,
109 protected, zero candidates, zero missing catalogue assets, zero deleted**.
The key/secret stay in the ignored mode-0600 file `backups/media-review.env`;
they are not published, displayed or added to frontend variables or Git.

Keep `CLOUDINARY_DRY_RUN=true`. `CLOUDINARY_CLEANUP_PREFIX` must be a reviewed
application-owned prefix of at least six characters. No prefix means no sweep.
Older randomly named uploads are deliberately retained for manual review;
absence from current report/proof rows is insufficient evidence of ownership
or permission to delete. Historical repair images and other applications' assets
must not be removed merely to empty the account.

```bash
# Use a private Python environment with psycopg 3; no application dependency change.
"$review_python" scripts/review_cloudinary_media.py \
  --output artifacts/media-review/review.json
```

### Backup and restore

The initial manual backup run `43234019700` reproduced the readiness race; no
deployed data was changed. A fresh private public-schema dump was then
restored successfully: **52 issues / 92 reports / 31 users / 4 wards / 10
categories / 7 departments / 11 Flyway migrations**. The actual backend also
started and validated that restored schema in a separate task-owned clone.
Only that clone's municipal password hashes were replaced for isolated testing;
deployed accounts/passwords were untouched.

The GitHub backup workflow now also decrypts its newly encrypted dump and compares
it byte-for-byte before uploading the encrypted artifact. Temporary plaintext
and the round-trip file are removed by the existing unconditional cleanup step.
The corrected off-device backup and its restore passed; the final result is
recorded below.

## Previous audit items reconciled

| Earlier item | Current disposition |
|---|---|
| Five D01–D05 audit defects | Fixed and regression-tested in `AUDIT_FIXES.md`; not new pending defects. |
| Main cross-role complaint/repair/rejection/closure journey | Completed on the deployed site; CT-2026-000919 remains authorized evidence. |
| Marker keyboard activation and draft discard | Completed in the 8 November release-followup browser checks. |
| Storage quota/unavailable IndexedDB and sent-payload clearing | Completed in release-followup checks; permanent failures/Retry-After receive the focused checks above. |
| Signed-in password change in browser | Completed in release-followup; authenticator testing is retired rather than passed. |
| Browser merged-reference destination | Completed in the deployed Thapar dataset review. |
| Physical phone and full spoken screen-reader traversal | Phone postponed. The user could not perform the requested speech check; automated semantics/contrast/target-size and keyboard checks are not substituted for heard speech. |
| Cold offline app-shell reopening/closed-browser delivery | Existing platform limitation, not a current promised feature. Loaded-tab offline reporting is supported; no application asset cache or OS background-execution guarantee was introduced. |
| Native installation and email/reset delivery | Excluded/deferred by user decision; no provider or installation claim was added. |

Tests cannot establish the absence of every possible defect. No universal WCAG
certification, municipal field validation, production-capacity guarantee, live
last-admin lockout attempt or multi-day wall-clock verification wait is claimed.
Those hazardous/time-dependent rules retain their isolated integration/controlled
clock coverage. No new feature backlog is inferred from optional research or
future large-scale deployment work.

## Release and deployed smoke

Application fixes are published at
[`482e3be01d39fd8f8f21f4e7645e79ebdf027115`](https://github.com/vanshnanda08/NagrikSetu/commit/482e3be01d39fd8f8f21f4e7645e79ebdf027115).
[CI run 43241803715](https://github.com/vanshnanda08/NagrikSetu/actions/runs/43241803715)
passed every job: backend (390 passed, two optional skips), frontend (115 tests,
lint, types and production build), API/transition/action/all-role route checks,
and Firefox/WebKit responsive and keyboard checks (10 routes per engine).
Vercel's status succeeded. Render's exact live revision was observed directly,
separately from the deployment-policy job.

### Real deployed offline delivery

One clearly labelled **SYNTHETIC NON-PHONE QA OFFLINE-20261112** complaint was
submitted with the existing synthetic registered citizen account through the
deployed desktop browser. No new citizen or municipal permissions were created.

- Saved the actual JPEG, location and description while offline; the loaded
  confirmation remained usable and repeat submission was disabled.
- Reconnected: the real worker uploaded the image to Cloudinary (HTTP 200) and
  created **CT-2026-000920** through the account-bound proxy (HTTP 201).
- Replayed the same idempotency key/body: HTTP 201 returned the same reference.
  Independent read-only SQL found exactly **one report**, the correct registered
  owner and a server-verified photo hash. Local sent photo/location payloads
  were cleared.
- Reloaded the sent receipt twice with authentication settled, opened the
  success and complaint screens, verified the evidence image loaded, and signed
  out to the general dashboard. The completed run recorded no application
  runtime errors. Interrupted exploratory attempts and corrected test selectors
  remain in local evidence; the same persistent job was resumed throughout.

The ticket is NEW, explicitly says **no municipal action required**, and is a
separate QA record rather than a real civic complaint. Its issue ID is
`dcea29d4-2237-4a71-bdda-b66a23c806e3`.
[Open the QA complaint](https://nagrik-setu-vn.vercel.app/issues/dcea29d4-2237-4a71-bdda-b66a23c806e3).
The Thapar dataset remains **50 sample issues / 90 sample reports**; totals
including three separate QA records are **53 issues / 93 reports / 31 users**.
This check did not repeat the already recorded municipal handoff/closure of
CT-2026-000919 or alter sample histories.

The older daily-journey harness now expects the saved confirmation while offline
and waits for outbox navigation after reconnection. Its JavaScript syntax check
passed; its entire multi-role journey was not rerun for that assertion-only
update. The new expected behaviour was exercised locally and on the deployed
site as described above.

### Verified encrypted off-device backup

[Backup run 43256071746](https://github.com/vanshnanda08/NagrikSetu/actions/runs/43256071746)
passed using application commit `482e3be`. It created a current dump, restored
into a disposable PostGIS database, encrypted it, decrypted the encrypted output,
compared it byte-for-byte, uploaded only the encrypted artifact and successfully
removed runner plaintext. Restored counts: **53 issues, 93 reports, 31 users,
four wards, 10 categories, seven departments and 11 migrations**.

- Artifact: `database-backup-43256071746`, ID `13960679493`, 56-day retention;
  expires **7 January 2027 at 16:13 UTC**. Download/archive digest was verified
  against GitHub's SHA-256 metadata.
- Private local encrypted copy:
  `backups/current-closeout-20261112/civictrack-2026-11-12-161221.dump.gz.gpg`
  (84,941 bytes, mode 0600; ignored by Git).
- Encrypted file SHA-256:
  `38765bd2e13f2d69a0d90f664043354cb34ebdbe447696ddf530b2150baab512`.

The backup passphrase remains in existing GitHub secrets; it was not retrieved
or published. Downloaded backup evidence is in `backup-final.json` and
`backup-final.log` inside the ignored closeout artifact directory. The successful
fresh backup replaces the older pre-refresh snapshot as the latest verified
off-device copy; artifact retention is finite, not permanent archival storage.

## Remaining boundaries

No confirmed defect from this closeout remains unresolved. Physical-phone
camera/GPS/permission/offline testing is postponed. The requested manual spoken
screen-reader review could not be performed and remains unverified. Native
installation is excluded, and email delivery/password recovery are deferred.
Loaded-tab offline delivery passed; cold offline reopening and delivery while
the browser is closed remain outside the supported guarantee.

## Acceptance audit fixes — local verification

The later independent audit's A01 and A02 findings are corrected in the current
working tree. The published application baseline and original audit observations
above retain their dated scope. No commit, push, deployment, live credential
change or production data write was performed during this fix pass.

- **Deploy signing key:** `DeploySigningKeyGuard` refuses absent/blank, known
  development/test/seed and undersized keys whenever `deploy` is active,
  including mixed profiles. Ordinary local development retains its fallback.
  Deployment-profile integration tests use a generated private fixture key.
- **Closure draft:** Assignments keeps one issue-keyed work pane while the
  queue loads, becomes empty or refreshes. Loading the queue no longer replaces
  the administrator form. Selecting a different complaint still changes its
  work context deliberately.
- **Regressions:** 11 new real-configuration startup cases passed. Packaged
  Java 21 starts with a generated key and exits with failure before readiness
  for missing, public-default and short keys. A default-key-signed role change
  gets 401; a genuine citizen remains forbidden from administrator audit reads.
- **Browser:** the regression holds a real local queue response until a reason
  is entered, then verifies preservation after arrival and cancellation at
  1280×600 and 390×844. All seven focused browser groups and 19 axe scans passed,
  along with Firefox/WebKit's ten responsive route checks per engine.
- **Complete local journey:** eight UI groups completed registration/reporting,
  assignment, private clarification, failed repair/reopening, a second repair,
  citizen confirmation, administrator cancel/confirm closure, CSV export,
  settled reload and logout. The original ticket was resumed for the final
  reload after an initial test interrupted authentication renewal; one closure
  was retained, without another complaint submission. Photo upload responses
  were explicit browser fixtures and evidence verification was disabled only
  in the disposable API. This is not a new real Cloudinary delivery claim.
- **Code gates:** 403 backend tests total, **401 passed / two optional skips**,
  zero failures/errors; **115 frontend tests**, lint, TypeScript and production
  webpack build passed. No dependency or migration upgrade was made.

Machine-readable evidence is retained locally under
`artifacts/acceptance-fixes-20261112/verification.json`, with startup logs,
browser results and screenshots. Temporary services used only the dedicated
`ns-fixes-20261112` profile and ports 8096/3056/55436. Earlier failed diagnostic
attempts remain distinct from the final passing results.

The audit's lower-priority dependency/tooling recommendations remain separate
from these two fixes. Physical-phone and full spoken screen-reader checks are
still unverified; email recovery remains deferred and native installation
excluded. A deployed fix must be verified separately after an authorized release.

## Controlled acceptance release — 13 November 2026

The release contains only the deploy signing-key guard, administrator closure
draft preservation, their regressions and these related notes. Unrelated pending
documentation cleanup is excluded. Source hashes match the retained local
verification above.

Before publication, authenticated hosting settings confirmed Render uses the
`deploy` profile and a private signing key of sufficient length, distinct from
known development/test/seed defaults. The value was not recorded or changed.
Both hosts track `main`: Render uses its existing On Commit Git deployment;
Vercel uses its Next.js integration rooted at `frontend`. No deployment policy
or credential was changed. CI, rollout and live checks are separate outstanding
observations until recorded below. The previous observed live backend revision
is `482e3be01d39fd8f8f21f4e7645e79ebdf027115`.

Release publication, exact deployed revisions, focused live checks and strict
real-photo integration are pending; this entry does not assert completion.
