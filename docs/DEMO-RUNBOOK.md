# NagrikSetu demonstration and handover

**Verified for academic/demo browser use — 13 November 2026.**
[Live demo](https://nagrik-setu-vn.vercel.app/dashboard) ·
[Repository](https://github.com/vanshnanda08/NagrikSetu) ·
[Current verification record](NON_PHONE_CLOSEOUT.md).

This is the practical handover, not a new test report. Reuse the recorded release
verification; do not create production complaints or change permissions merely
for a presentation. Credentials belong in the owner's private credential store,
never in the recording, this document or terminal output.

## What is being handed over

Citizens submit photo/location reports, which bounded geographic clustering
turns into issues. Supervisors acknowledge, assign and review grouping; scoped
staff record work and repair evidence. Eligible citizen reporters verify repairs,
with rejection/reopening and disclosed timeout outcomes. Administrators manage
existing configuration, audit/export and reasoned closure. Public dashboards,
tracking, issue histories, following, private clarification, password/session
controls and loaded-tab offline reporting complete the browser workflow.

The backend is Java 21/Spring Boot with PostgreSQL/PostGIS and Flyway; the
frontend is Next.js 16/React 19/TypeScript. Cloudinary hosts evidence. The
[project guide](../PROJECT_DOCUMENTATION.md) explains architecture and data;
the [screen map](../frontend/SCREENS.md) explains routes and role-specific views.

## Run locally

Use separate terminals from the repository root. Start the database with
`docker compose up -d db`. Supply a local-only `CIVICTRACK_DEMO_STAFFPASSWORD`
privately, then run `mvn spring-boot:run -Dspring-boot.run.profiles=demo` inside
`backend/`. Set `CORS_ALLOWED_ORIGINS=http://localhost:3000` in that backend
terminal. The workshop profile compresses deadlines; it is not the hosted timing.

Create `frontend/.env.local` from `.env.example` if it does not already exist,
set `API_BASE` and `NEXT_PUBLIC_API_BASE` to `http://localhost:8080/api/v1`, then
run `npm ci` and `npm run dev` inside `frontend/`. Open
http://localhost:3000/dashboard. Ordinary restarts preserve the database volume.
Do not reset it or run seed generation against an existing shared database.

For an actual photo/repair rehearsal, configure backend `CLOUDINARY_CLOUD_NAME`
and frontend `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` plus
`NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`; leave `VERIFY_PHOTO_EVIDENCE=true`.
Configure only a reviewed upload preset. API admin credentials are not browser
upload credentials. For realistic local timing with municipal bootstrap, use
`deploy` and a private `JWT_SECRET` of at least 32 bytes, distinct from public
fixture defaults. [Detailed setup and environment names](../PROJECT_DOCUMENTATION.md#13-setup-and-installation)
cover profiles, database settings and templates. No credential values are needed
in the handover.

## Hosted deployment snapshot

| Service | Verified revision / arrangement |
|---|---|
| Render | `0e32539162a33d354924e3b560e18f2688a76208`; root `backend`, Docker, `deploy`, `main`, On Commit auto-deploy |
| Vercel | `4b2a04c1e17a9aa56cab0da795aaeb7163ed2005`; root `frontend`, independent Git deployment from `main` |
| Database/media | Supabase PostgreSQL/PostGIS; Cloudinary evidence |

These are the verified **13 November baseline**, not permanent live SHA values.
The frontend snapshot adds documentation only; its application tree matches the
Render revision. CI's `external` deployment-policy job reports host management;
it does not call a Render hook or prove rollout. Hosts can publish before CI
finishes. Documentation-only `[skip ci] [skip render]` commits do not deliberately
redeploy the backend; Vercel can publish another docs-only revision. No hosting
setting needs changing for this handover.

## Existing synthetic demonstration records

Prefer a read-only tour of these labelled records. References and scenarios come
from the 11 November generated/imported corpus and retained role checks, not a
new production query. Scheduled lifecycle processing can advance current status;
inspect the existing history instead of changing data to restore a staged state.

| Record | Useful demonstration |
|---|---|
| [CT-2026-000919](https://nagrik-setu-vn.vercel.app/issues/d30419d1-9755-45a7-bb85-a1e58f7a7727) | Previously authorized complete live citizen → assignment → repair → rejection/reopening → confirmation → administrator closure, recorded 11 November |
| [CT-2026-D000002](https://nagrik-setu-vn.vercel.app/issues/f0ba79cf-f688-30a0-81db-261c6f42a18b) | Synthetic confirmed repair followed by administrator closure |
| [CT-2026-D000003](https://nagrik-setu-vn.vercel.app/issues/60343d3f-f4db-37b3-85d4-9f6106ef9439) | Administrative early closure; explain why it is not a successful repair |
| [CT-2026-D000007](https://nagrik-setu-vn.vercel.app/issues/1029d368-29c2-338f-9534-5741f3ed3806) | Reopened pothole and department-scoped work context; used in read-only acceptance checks |
| [CT-2026-D000016](https://nagrik-setu-vn.vercel.app/issues/cf27a652-1ca1-3e8a-b6e9-d9c11a047bee) | Retained merged-away reference, redirect and grouping audit |
| [CT-2026-D000049](https://nagrik-setu-vn.vercel.app/issues/ffcf313e-2131-3170-b9e1-964e5c099fc4) / [D000050](https://nagrik-setu-vn.vercel.app/issues/58a89e52-8a4d-3906-945b-9830f0a716ee) | Extent-cap pair: nearby reports do not always belong in one issue |

The [dataset record](THAPAR_DATASET.md) explains **50 issue records / 90 reports**,
including the retained merge redirect, ten categories, actual service-ward checks,
labelled synthetic evidence and scoped refresh/backup procedure. These are
illustrative Patiala/Thapar locations, not assertions about real street defects.

## Read-only presentation — 6–8 minutes

1. Show the public dashboard, issue list/map, ward/department context and
   complaint-number tracking. Explain the difference between a report and issue.
2. Open a synthetic ticket and its cluster inspector: member observations,
   accuracy, centroid, grouping decision and any review flag. Use the extent pair
   and merge redirect above to explain limits and moderation history.
3. Sign in with an authorized existing supervisor account, show Complaints →
   Assignments/Needs review/Team performance, and explain scope and crew routing.
   Do not acknowledge, assign or commit moderation changes on the hosted demo.
4. Show the matching staff queue, Department overview and existing work/proof
   panels. Staff submit evidence for verification; they cannot certify or close
   their own repair.
5. Use CT-2026-000919's history to narrate the complete role handoff, rejected
   repair, second proof and citizen confirmation. For citizen notifications and
   private messages, use only an authorized participating synthetic account;
   following or merely viewing a ticket does not grant verification eligibility.
6. Show administrator audit/filter/CSV and existing closure history. Ready to
   close may be empty. Explain the required reason and confirmation, and the
   separate meaning of early closure; cancel any preview dialog.
7. Close on the dated verification record, agreed limits and repository. Keep
   credentials, tokens, private messages and database contents out of a recording.

## Optional writable rehearsal — disposable local database only

1. Use a new isolated database with Flyway reference data, your own local
   municipal bootstrap password and a registered synthetic citizen. No live DB
   credentials, production reseeding or role edits are required.
2. Citizen: upload clearly labelled synthetic evidence, choose a valid category
   and manual demo pin, submit once and keep the ticket/reference.
3. Matching supervisor: acknowledge and assign to eligible departmental staff.
4. Assigned staff: start work, optionally request private clarification, upload
   real hosted repair proof and a note of at least 20 characters; submit for
   citizen verification.
5. Original eligible citizen: reject once to show reopening if desired, then
   after a second repair confirm it. A citizen must have reported that issue;
   anonymous observers and unrelated accounts cannot cast verification votes.
6. Administrator: after resolution, enter a public closure reason of at least
   20 characters, cancel once, confirm deliberately, then inspect history/audit.
   The automatic SYSTEM quiet-period closure is separate; do not alter clocks
   or production policy to make it happen during the presentation.
7. Optional supporting local flows: recover a draft, queue once offline and
   reconnect with the loaded tab, inspect following/private clarification and
   session controls. Preserve one submission key on retry. State that this is
   not a physical-phone or closed-browser delivery test.

The original seed/demo timed escalation storyboard remains in the archived
[month-two report](https://github.com/vanshnanda08/NagrikSetu/blob/e0b4cedbfb5c2b475dc557532e19130e6549a913/docs/MONTH-2-WORK-DONE.md).
It is optional isolated workshop material, not a reason to change hosted data.

## Maintenance responsibilities

- **Host owner:** keep Render/Vercel configuration private, retain `deploy` and
  a valid private signing key, match API/CORS/Cloudinary settings, and inspect
  CI, rollout and readiness independently. Free-tier sleep and scheduler delay
  remain possible. Do not rotate keys or reset accounts casually.
- **Database operator:** preserve applied Flyway migrations in
  `backend/src/main/resources/db/migration/`; use new migrations for future
  changes. Monitor `.github/workflows/backup.yml`, its encrypted artifact expiry
  (56 days), and access to the private decryption passphrase.
- **Recovery operator:** use `scripts/backup.sh`, then decrypt an authorized
  encrypted artifact privately and run `scripts/restore.sh --self-test <dump.gz>`
  against its disposable target. Actual target-restore syntax/extension setup
  is documented in `scripts/restore.sh`; select a separate target and verify
  restored counts/health before any deliberate cutover. Never overwrite a live
  database merely to rehearse. DB backups do not include browser drafts or the
  whole Cloudinary library. Exact dated restore evidence is in the closeout.
- **Media owner:** keep `CLOUDINARY_DRY_RUN=true`; an empty
  `CLOUDINARY_CLEANUP_PREFIX` skips sweeping. Any deletion needs a reviewed
  application-owned scope and retention decision. Do not delete existing media
  as part of this handover.
- **Maintainer:** configuration is in `application*.yml`, frontend `.env.example`
  and private host environments; tests are in `backend/src/test/`, frontend
  `src/**/*.test.*` and `tools/`. Use JDK 21, Node 22, Maven/npm lockfiles and a
  Docker-compatible runtime. After future code edits, run the affected existing
  checks; restart a built Next server after rebuilding. This docs-only handover
  reuses the already passing application verification.

## Agreed limits

Physical-phone and full spoken screen-reader testing remain **unverified**.
Email delivery/password recovery is **deferred**; native installation is
**excluded**. Retained mail/recovery code is not active delivery evidence.
Loaded-tab offline reporting is supported; cold offline opening and delivery
while the browser is closed are not guaranteed. Synthetic evaluation and browser
checks do not establish municipal field suitability, production capacity,
universal accessibility compliance or the absence of all defects. These
boundaries do not prevent completion of the agreed academic/demo browser scope.
