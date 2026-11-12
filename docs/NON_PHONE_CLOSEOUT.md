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

Render's current deployment page was read directly: `6b94dda` was live and its
trigger was **Auto-Deploy**. The repository variable `RENDER_DEPLOY_MODE` is now
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
  offline confirmation/photo preservation, keyboard focus and **18 axe scans**
  across public/citizen/staff/supervisor/admin surfaces at 1280×600 and 390×844.
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
they are not uploaded, displayed or added to frontend variables.

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

The latest successful weekly backup preceded the Thapar refresh. The new manual
backup run `43234019700` reproduced the readiness race; no deployed data was
changed. A fresh private public-schema dump of the current database was then
restored successfully: **52 issues / 92 reports / 31 users / 4 wards / 10
categories / 7 departments / 11 Flyway migrations**. The actual backend also
started and validated that restored schema in a separate task-owned clone.
Only that clone's municipal password hashes were replaced for isolated testing;
deployed accounts/passwords were untouched.

The GitHub backup workflow now also decrypts its newly encrypted dump and compares
it byte-for-byte before uploading the encrypted artifact. Temporary plaintext
and the round-trip file are removed by the existing unconditional cleanup step.
The off-device result is recorded below after the corrected workflow runs.

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

Publication, final CI, deployed offline ticket and encrypted off-device backup
evidence will be appended here after execution. The existing 50-issue/90-report
sample dataset is preserved; any separately labelled QA ticket is counted apart
from those samples.
