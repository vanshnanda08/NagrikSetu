# NagrikSetu

Municipal issue reporting with bounded incremental geo-clustering, SLA-driven
escalation and public accountability. Citizens submit a photo and location;
related reports become one work item, municipal teams record repairs, and
eligible citizens verify the outcome. Public dashboards expose progress.

## Documentation

- [Complete project guide](PROJECT_DOCUMENTATION.md): architecture, features,
  database, setup and configuration.
- [Screen map](frontend/SCREENS.md) and [frontend setup](frontend/README.md).
- [Current completion and operational checks](docs/NON_PHONE_CLOSEOUT.md):
  deployed revision, test results, encrypted backup, media review and limitations.
- [Verified daily-use journey](docs/DAILY_USAGE_VERIFICATION.md): citizen reporting,
  supervisor assignment, staff repair, verification and administrator closure.
- [Thapar sample dataset](docs/THAPAR_DATASET.md): 50 synthetic issues containing
  90 reports, generation, scoped refresh, evidence and backup procedures.
- [Verification tools](tools/README.md), [evaluation](evaluation/README.md),
  [design decisions](docs/DESIGN-DECISIONS.md), [demo runbook](docs/DEMO-RUNBOOK.md)
  and [final project report](docs/FINAL-PROJECT-REPORT.md).
- [Academic manuscript](paper/README.md), including its evidence and licensing.

## Current interface

The application uses one light theme, with internal desktop panels and natural
mobile scrolling. Public/citizen destinations are Dashboard, Explore issues
(List/Map), Report a problem and My reports; notifications and account settings
are utility controls.

Staff and supervisors share **Complaints** (`/work`). Staff get scoped queues,
progress actions and repair proof; their `/dashboard` shows Department overview.
Supervisors get assignments, grouping review, team performance and contextual
moderation/split–merge tools. Administrators get complaint oversight and
**Administration** (`/admin`) with configuration, audit logs and CSV export.
Administrator closure requires a public reason and confirmation; early closure
is explicitly disclosed and excluded from successful-repair/SLA figures.

All roles use password sign-in, with password changes and device/session
management. Authenticator setup is retired. Signed-in citizens track through
My reports; anonymous tracking is shown only when signed out. Logout returns
every role to the general dashboard. Existing deep links retain compatible
redirects and role restrictions.

## Project status

**Verified for academic/demo browser use — 13 November 2026.** The acceptance
release rejects missing/public-default/undersized deploy signing keys and keeps
administrator closure drafts through queue loading, refresh and cancellation.
Switching complaints does not transfer the reason into another ticket.

| Verified deployment snapshot | Revision |
|---|---|
| Render application | `0e32539162a33d354924e3b560e18f2688a76208` |
| Vercel documentation-only follow-up | `4b2a04c1e17a9aa56cab0da795aaeb7163ed2005` |

Both revisions contain identical application code. [Application CI is green](https://github.com/vanshnanda08/NagrikSetu/actions/runs/43307995444).
The 12 November local acceptance checks recorded **401 backend passes / two
optional skips, 115 frontend passes**, lint/types/production build, Firefox/WebKit
checks and 19 axe scans. The 13 November deployed closeout passed **18 municipal
checks and six desktop/mobile layouts**, including scopes, permission denials,
refresh/logout and closure-draft isolation. Strict real Cloudinary integration
and the complete closure workflow passed in a disposable local database. The
current closeout changed no production complaints. [Dated verification and real
versus mocked boundaries](docs/NON_PHONE_CLOSEOUT.md) remain explicit.

The synthetic Thapar/Patiala dataset has **50 issue records / 90 reports**.
The 12 November backup snapshot included three separate QA records, for totals
of **53 issues / 93 reports / 31 users**. These are dated counts, not live totals.

| Service | Address |
|---|---|
| Live demo | https://nagrik-setu-vn.vercel.app/dashboard |
| Repository | https://github.com/vanshnanda08/NagrikSetu |
| API | https://civictrack-api.onrender.com |
| API documentation | https://civictrack-api.onrender.com/swagger-ui/index.html |

Physical-phone and full spoken screen-reader testing remain unverified. Email
delivery/password recovery is deferred; native installation is excluded. These
boundaries do not prevent completion of the agreed academic/demo browser scope.
Loaded-tab offline delivery is supported; cold offline reopening and delivery
while the browser is closed are not guaranteed. Media deletion stays dry-run
and scoped. This is not a municipal production-readiness or bug-free claim.

For the practical handover, existing synthetic tickets and maintenance duties,
use the [demo and handover runbook](docs/DEMO-RUNBOOK.md). Historical documents
removed by cleanup are indexed in the [project guide](PROJECT_DOCUMENTATION.md#historical-evidence-index).

## Features

- **Geo-clustering.** Reports in the same category merge into one issue under
  an adaptive radius `R_cat + ½·accuracy + ½·σ`, where σ = `1/√Σw` is the
  cluster's positional uncertainty. Well-evidenced clusters tighten
  automatically. A per-category extent cap stops clusters drifting along linear
  defects, and ambiguous matches merge or split according to the category
  (an open manhole never hides behind another).
- **Concurrency-safe.** A transaction-scoped advisory lock on
  (category, ~200 m cell) plus a two-phase candidate lookup: twenty simultaneous
  reports of one defect produce exactly one issue.
- **Accountable lifecycle.** Nine statuses. No staff-reachable transition leads
  to `RESOLVED` or `CLOSED`; staff submit for citizen verification and stop.
- **Priority.** Category severity + `12·log2(1 + distinct reporters)` + age
  (excluding paused time) + escalation level + reopen count.
- **SLA and escalation.** Deadlines from category hours scaled by priority; the
  clock pauses during verification; breaches escalate department head → parent
  department head → ward officer → administrator, idempotent under concurrent
  sweeps.
- **Anonymous reporting.** No account needed to report; a signed-in reporter's
  identity is taken from the verified token, never from the request body.
- **Account sessions and password management.** Refresh cookies rotate through
  reuse-detecting token families, and password/access changes revoke refresh
  sessions. Email-based password recovery is deferred; its existing one-use
  reset-link implementation is retained for the future update.
- **Municipal access.** Staff, supervisors and administrators sign in with their
  account password. Role, department and ward guards still restrict their actions.
  Every user can inspect and revoke refresh-token sessions from the Security screen.
  Authenticator enrollment, codes and requirements were removed by user decision.
- **Email delivery — future update.** The retained email implementation is opt-in and
  uses a transactional outbox with bounded retries. In-app notifications and
  issue transitions still succeed when the mail service is down.
- **Persistent offline reporting.** Draft text, coordinates and compressed
  photos survive reloads in IndexedDB. Explicitly submitted offline reports
  enter a visible service-worker outbox, remain bound to the original account,
  and use server-side idempotency keys during background retry.
- **Layered abuse controls.** Durable and in-memory report throttles, login
  throttling, perceptual photo hashes, capture-time/profanity review flags, and
  proof-photo reuse checks reduce spam without blocking anonymous civic access.
  Supervisors can redact public descriptions while retaining the original and
  an immutable audit record.
- **Citizen verification.** A claimed fix is put to the people who reported it:
  enough "fixed" votes resolve it, a rejection reopens and escalates it, and
  silence resolves it after 72 hours. Issues no citizen could verify are
  counted and published per department rather than hidden.
- **Issue following and clarification.** Citizens may follow a public issue
  without affecting its priority and receive lifecycle notifications. The
  original signed-in reporters can privately answer scoped municipal requests
  for more information; neither side exposes the thread publicly.
- **Supervisor moderation.** A review queue of every grouping the engine was
  unsure of; split and merge with a server-computed preview, full
  recomputation, and a permanent log. No report is ever deleted, and a merged
  ticket still resolves and says where its reports went. An assignment board
  hands acknowledged work to crew.
- **Live public dashboard.** Median resolution time, SLA compliance, backlog
  age, reported against resolved, reopen and unverified rates per department,
  and a breaching list that updates itself over server-sent events. Chart
  colours checked for colour-blind separation, every chart with a table view.
- **Accessible status display.** Every status is encoded by colour, shape and
  word, never colour alone, in the fixed light theme.
- **Audited administration.** An administrator screen manages category/SLA
  policy, account roles and scopes, department hierarchy and ward officers.
  It prevents the last administrator from being removed, rejects hierarchy
  cycles, revokes affected sessions, and records before/after values.
- **One-screen desktop layout.** Core desktop screens target a viewport of 1280 x 600 or larger:
  the header stays, tiles and maps take the available height,
  and only long content (the issue list, a timeline) scrolls inside its own
  panel. Smaller windows and phones use the normal flowing layout.
- **Hardened browser client.** Manifest/icons and offline reporting remain in
  source; native installation is excluded from the agreed scope. Browser
  responses include HSTS, frame denial, MIME-sniffing,
  referrer, permissions and opener-isolation headers.

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Java 21, Spring Boot 3.5, Spring Data JPA, Hibernate Spatial, Spring Security OAuth2 Resource Server (JWT), Flyway, ShedLock, springdoc-openapi |
| Database | PostgreSQL + PostGIS (Supabase in production) |
| Frontend | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, TanStack Query, React Hook Form + Zod, Leaflet |
| Testing | JUnit 5, Testcontainers (`postgis/postgis`), Vitest, Playwright harnesses in `tools/` |
| Infrastructure | Docker, Render, Vercel, Cloudinary, GitHub Actions |

## Repository layout

```
backend/     Spring Boot 3.5 on Java 21
frontend/    Next.js 16 App Router, Tailwind v4
tools/       Harnesses that check the running server (contract, transitions, UI, runtime errors)
scripts/     Database backup, restore and remote seeding
```

The product is called **NagrikSetu**. The name `civictrack` is kept on purpose
in the Java package, Spring config keys, cookie and storage keys, the Render API
hostname and the seeded `@civictrack.example` accounts: they are shared between
the backend, the deployment and the browser, and renaming them would break
logins and the API contract.

The backend is packaged **by feature, not by layer**:
`com.civictrack.{report, clustering, issue, sla, verification, user, department,
ward, category, dashboard, publicapi, me, media, seed, config, common}`. Related
code lives together, so the clustering engine is one directory rather than a
service, a repository and a DTO scattered across three.

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| JDK | 21 | `brew install openjdk@21` |
| Maven | 3.9+ | `brew install maven` |
| Node.js | 22 | `brew install node@22` |
| Container runtime | any Docker-compatible | `brew install colima docker docker-compose` |

There is no substitute for the container runtime: the integration tests run
against a real `postgis/postgis:17-3.4`, and H2 has no PostGIS. That tag
tracks the deployed database's Postgres major (Supabase, PostgreSQL 17);
PostGIS is one minor ahead because no `17-3.3` image is published. See
`IntegrationTestBase` for why that gap is acceptable and what it does not cover.

If you use Colima rather than Docker Desktop, start it once per boot and link
the compose plugin once, ever:

```bash
colima start --cpu 2 --memory 4 --disk 20
mkdir -p ~/.docker/cli-plugins
ln -sfn /opt/homebrew/opt/docker-compose/bin/docker-compose ~/.docker/cli-plugins/docker-compose
```

Colima puts its Docker socket under `~/.colima` instead of
`/var/run/docker.sock`, which Testcontainers cannot find on its own. A Maven
profile in `backend/pom.xml` detects that socket and sets `DOCKER_HOST` for the
test JVM automatically — nothing to export, and it stays inert on CI and on
Docker Desktop.

## Running it locally

Run each terminal from the repository root. See the
[full setup/environment reference](PROJECT_DOCUMENTATION.md#13-setup-and-installation)
and [frontend setup](frontend/README.md).

```bash
# Terminal 1: local database only; preserve the existing volume.
docker compose up -d db
```

Supply your own local-only `CIVICTRACK_DEMO_STAFFPASSWORD` privately in the backend
terminal, then start the workshop profile (compressed deadlines):

```bash
# Terminal 2
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=demo \
  -Dspring-boot.run.arguments="--civictrack.cors.allowed-origins=http://localhost:3000"
```

```bash
# Terminal 3: create frontend/.env.local from frontend/.env.example if absent,
# then set API_BASE and NEXT_PUBLIC_API_BASE to http://localhost:8080/api/v1.
cd frontend
npm ci
npm run dev
```

Open http://localhost:3000/dashboard. API readiness is at
http://localhost:8080/actuator/health/readiness. Flyway owns schema creation and
reference accounts; bootstrap sets only missing municipal password hashes.
Existing passwords are not reset. Obtain authorized credentials privately;
self-registration creates citizens only.

Real reporting/repair demonstrations require `CLOUDINARY_CLOUD_NAME` in the
backend and matching `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` plus
`NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` in the frontend. Keep
`VERIFY_PHOTO_EVIDENCE=true`. Spring does not load frontend environment files.
An explicit `VERIFY_PHOTO_EVIDENCE=false` override is only for isolated synthetic
placeholder fixtures; it does not establish real-upload verification and does
not make a placeholder acceptable to the repair-proof UI.

For realistic local timing with municipal bootstrap, use `deploy` instead of
`demo` and supply a private `JWT_SECRET` of at least 32 bytes, distinct from all
public fixture defaults. Keep production `demo`/`seed` profiles off. Email stays
disabled in `deploy`; password changes and session controls remain available.
Corpus generation is optional and belongs in a new disposable database; it is
not a prerequisite for opening the app. Use the runbook for either a read-only
hosted demonstration or an isolated writable rehearsal.

## Testing

```bash
cd backend  && mvn clean test    # 12 November acceptance: 401 passed, 2 optional skips
cd frontend && npm run test      # 115 unit tests
cd frontend && npm run lint      # includes the Leaflet import boundary rule
```

Surefire is configured to run `*IT` alongside `*Test`, so `mvn test` really
does run everything. In this project the integration tests *are* the important
tests — spatial behaviour cannot be verified any other way — and a green build
that quietly skipped them would be worse than no build at all.

**Always `mvn clean test`, never incremental.** A stale `target/` once produced
two false diagnoses of a working query. Likewise, restart `next start` after
`npm run build` — a stale server serves old chunks and the failure looks like an
application bug.

Historical clustering and stream mutation checks are indexed in the project guide's [historical evidence index](PROJECT_DOCUMENTATION.md#historical-evidence-index).
The seed regression compares the complete report and issue records and label files
across two runs with different wall-clock dates.

`tools/` holds four harnesses that check what unit tests structurally cannot,
because they need the running server: the API contract against the declared
TypeScript types, the transition table, the action rendered at each lifecycle
state, and a runtime-error sweep of every route. See `tools/README.md`; each one
exists because it caught a bug a passing suite had endorsed.

## Configuration that is not optional

Four settings are load-bearing. Each is a defect if changed, and two of them
present as bugs somewhere else entirely.

| Setting | Where | Why |
|---|---|---|
| `spring.jpa.open-in-view=false` | `application.yml` | Defaults to **true**, holding a DB connection for the whole request. With Hikari at 8, the concurrency test exhausts the pool and it presents as a phantom locking bug in the clustering engine |
| `ddl-auto: validate` | `application.yml` | Flyway owns the schema. Hibernate cannot generate a composite `btree_gist` index over a cast expression |
| `-XX:MaxRAMPercentage=75` | `Dockerfile` | Default JVM heap sizing in a 512 MB container causes intermittent OOM kills |
| A session-stable connection on port 5432, never a transaction pooler | `docker-compose.yml`, deploy env | `pg_advisory_xact_lock` and `FOR UPDATE` need a stable session; Hibernate's server-side prepared statements are incompatible with transaction pooling. Hikari is already the pool |

## Standing rules

1. **Every tunable number lives in the `categories` table, not in code.**
   Merge radii, SLA hours, severity weights, extent multipliers, reopen
   windows, band policies.
2. **Every distance uses `ST_Distance(...::geography)`.** Never planar, never
   computed in Java.
3. **Exactly one class constructs a JTS `Point` from lat/lng: `GeoFactory`.**
   Everything else calls it. This is what prevents the lat/lng swap.
4. **Tests are written alongside features, not after.**
5. **Status changes go through exactly one method**, `IssueStatusService.transition`.
6. **Time comes from an injected `java.time.Clock`**, never `Instant.now()`, so
   SLA and escalation behaviour is testable without sleeping.

## Deployment

Render builds `backend/Dockerfile` from `main`, using root `backend`, profile
`deploy` and existing **On Commit** auto-deployment. Vercel independently builds
root `frontend` from `main`; Supabase provides PostgreSQL/PostGIS and Cloudinary
stores evidence. CI tests backend, frontend and API/browser journeys, then its
`RENDER_DEPLOY_MODE=external` policy job reports that deployment is host-managed.
It does not call a Render hook or prove rollout completion. Hosts can deploy
before CI finishes; synchronized CI-gated deployment is not configured.

Documentation-only commits use the established `[skip ci] [skip render]`
conventions when appropriate. These skip that commit's CI/backend rollout;
they do not change workflow or hosting policy. Vercel may still publish a
documentation-only revision with identical application code. The table above is
the **verified 13 November snapshot**, not a permanently current hosting SHA.
Later documentation publication is not a new application release.

The current illustrative service area and synthetic data are around Thapar
Institute/Patiala. V11 preserves the ward IDs while moving the four demo sectors;
they are not official municipal ward boundaries. The old 250-report evaluation
corpus and its earlier Ludhiana locations are historical, not the current hosted
demo. The [Thapar record](docs/THAPAR_DATASET.md) separates its 50 issue records
from 90 reports and documents scoped, atomic refresh and preservation checks.
Do not reseed a populated hosted database for a presentation.

A keep-alive workflow pings the API every ten minutes; free-tier cold starts and
scheduler delays remain possible. Hosting configuration and secrets are managed
by the owner; no real values belong in this repository.

Two things about that stack that are not obvious and have both bitten once:

**Connect through Supabase's SESSION POOLER, not the direct endpoint.** The
direct host `db.<ref>.supabase.co` is IPv6-only and Render's free tier has no
IPv6 route, so it fails with "Network is unreachable". Use
`aws-0-<region>.pooler.supabase.com:5432` with user `postgres.<project-ref>`.
Not port 6543 — that is transaction mode and breaks Hibernate's prepared
statements. The port is not the tell; the hostname is.

**Cold start.** The Docker image trains a Class Data Sharing archive at build
time and asserts it loads with `-Xshare:on`, bringing application startup from
20–40 s to ~3.5 s. The remaining delay after idle is Render starting the
container.

Photos are compressed in the browser and uploaded straight to Cloudinary with
an unsigned, size- and format-restricted preset. The nightly cleanup protects
both report photos and resolution proof; it defaults to dry-run until deployed
credentials and a reviewed dry-run establish that deletion is appropriate. The
current Thapar samples use labelled synthetic hosted illustrations; the older
evaluation seed's public sample images are historical fixture evidence.

## Security notes

`JWT_SECRET` **must** be set in any real deployment. The development default in
`application.yml` is public knowledge, and anybody holding the signing key can
mint an ADMIN token. The application refuses to start on a key shorter than 32
bytes. With the `deploy` profile active, startup also rejects missing, blank,
and known development/test/seed keys, even when other profiles are combined
with `deploy`. Supply a private generated key through `JWT_SECRET`; do not copy
a fixture value from source or rotate an existing deployment's key casually.

The refresh token never reaches JavaScript: Next.js route handlers keep it in
an httpOnly cookie and exchange it server-side. The access token lives only in
memory.

## Reproducible evaluation data

Use a **fresh scratch database**, never the deployed database. The `seed` profile
uses `civictrack.seed.random-seed=42` and
`civictrack.seed.reference-time=2026-10-01T00:00:00Z` by default. Corpus size is
configurable. With the same reference data and settings, repeated runs produce
identical report/issue IDs, ticket references, clustering results and labels.
The regression test verifies this for 250 reports even when the wall clock changes.

Stable IDs and the fixed clock apply only on the seed runner's thread and are
removed when it finishes or throws. Ordinary API requests retain random UUIDs and
the current clock. Scheduled data writers are disabled in the seed profile.
A populated database is skipped; the legacy `force` option now fails instead of
appending duplicate deterministic IDs. Use a new scratch database for each run.
Seed tickets use `CT-2026-S000001` to avoid the ordinary ticket sequence.

```bash
cd backend
mvn -Dtest=SeedReproducibilityIT,GenerationScopeTest test
# Set datasource credentials to a fresh scratch database, then:
mvn spring-boot:run -Dspring-boot.run.profiles=seed \
  -Dspring-boot.run.arguments="--civictrack.seed.corpus-size=250"
```

The completed phase-8 harness is documented in `evaluation/README.md`. On the
250-report labelled corpus the production grouping achieved pairwise precision
1.000, recall 0.790, and F1 0.883. The cap deliberately trades some recall on
the random seed corpus, but on the synthetic linear-defect stress corpus it
raised F1 from 0.558 to 1.000 by preventing chain merges. Live cohorts of 2,
5, 10, 20, and 50 simultaneous reports each produced one issue. With 500
requests per scale, ingest p50 was 56.0 ms at 1k, 52.7 ms at 10k, and 57.7 ms
at 50k existing issues, with no failed requests. CSV source tables and vector
PDF plots are retained in `artifacts/evaluation/`; results are local-machine
measurements, not production capacity claims.

## Backup and cleanup operations

`.github/workflows/backup.yml` schedules a backup every Sunday at 02:00 IST.
It restores the dump into a disposable PostGIS database, fails on restore errors,
encrypts it with GPG, and retains only the encrypted artifact for 56 days.
Configure these GitHub Actions secrets before running the workflow:
`BACKUP_DATABASE_URL`, `BACKUP_DATABASE_USER`, `BACKUP_DATABASE_PASSWORD`, and
`BACKUP_PASSPHRASE` (a strong passphrase also kept in your password manager).
The latest verified run, 12 November 2026, restored **53 issues / 93 reports /
31 users**, verified encryption by decrypting and comparing the output, and
uploaded an encrypted artifact. Exact backup locations, checksums and retention
are in the [completion record](docs/NON_PHONE_CLOSEOUT.md).

For a local backup, use `backend/.env.seed` or the `DATABASE_*` environment
variables, then run `./scripts/backup.sh` and
`./scripts/restore.sh --self-test <dump.gz>`. Backups use restricted permissions,
TLS, a connection timeout and an atomic final rename. Interrupted dumps are removed.
Never commit a dump or a passphrase.

To recover an encrypted workflow artifact:

```bash
gpg --output restored.dump.gz --decrypt civictrack-<timestamp>.dump.gz.gpg
./scripts/restore.sh --self-test restored.dump.gz
```

Cloudinary cleanup needs `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and
`CLOUDINARY_API_SECRET` in the backend deployment. Set a reviewed application-owned `CLOUDINARY_CLEANUP_PREFIX`; an empty prefix
skips the sweep. Keep `CLOUDINARY_DRY_RUN=true` until a scoped retention review
authorizes deletion. The latest GET-only review found 109 protected assets and
zero deletion candidates; no real deletion was performed. See the
[completion record](docs/NON_PHONE_CLOSEOUT.md) for evidence.

## License

This project is licensed under the MIT License. See the LICENSE file for details.

The MIT License applies to original project code and documentation. Third-party
components retain their own licenses, including `paper/IEEEtran.cls` and
`paper/IEEEtran.bst`, which remain under the LaTeX Project Public License (LPPL).
See [paper/THIRD_PARTY.md](paper/THIRD_PARTY.md) for their notices.
