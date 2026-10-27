# NagrikSetu

Municipal issue reporting with bounded incremental geo-clustering, SLA-driven
escalation, and public accountability.

Citizens report a civic problem with a photo in under twenty seconds. The
system merges spatially and categorically similar reports into a single
prioritised work item in real time, so twenty people reporting one pothole
produce one urgent ticket rather than twenty low-priority ones. Every issue
carries a deadline that escalates automatically when breached, and no
department can mark its own work resolved — citizens verify. A public
dashboard publishes the resulting numbers without a login.

## Project status

**Phases 0–9 implemented and deployed; production mail delivery is deferred.**
The application, evaluation, hardening, demo profile, and final write-up are
built and tested. CI, the live frontend/API, and encrypted backup recovery have
been verified. Cloudinary deletion remains deliberately disabled until its dry
run is reviewed; real transactional email delivery will be completed later.
See [the audit](FINAL_AUDIT.md) for security fixes, fresh verification and the
remaining operational/accessibility checks.

Outside the numbered phases, the frontend was reworked on 2026-10-11: it is now
branded **NagrikSetu**, has a glass-style theme in light and dark, fits a
desktop window without scrolling the page, and opens on the dashboard. It was
verified locally (see the end of this file).

| | |
|---|---|
| Frontend | https://civic-track-six.vercel.app (HTTP 200 verified 2026-10-27) |
| API | https://civictrack-api.onrender.com |
| API docs (Swagger) | https://civictrack-api.onrender.com/swagger-ui/index.html |
| Backend tests | **277 total: 275 passed, 2 opt-in evaluation tests skipped, 0 failures/errors**, against real PostGIS via Testcontainers |
| Frontend tests | **82** passing, plus lint, typecheck and production build |
| CI | GitHub Actions run #53 passed on commit `10481bf`; backend, frontend and API/browser gates completed before the Render deploy hook |
| Deployed corpus | 113 issues / 254 reports in the verified backup taken 2026-10-07; counts change with usage |

> The API runs on Render's free tier and sleeps after 15 minutes idle. The
> first request after a quiet spell takes up to about a minute; the application
> itself starts in ~3.5 s.

### Done

✅ done · 🟡 implemented, remote checks pending · ⏳ not started

| Phase | Deliverable | Status |
|---|---|---|
| 1 | Flyway schema, PostGIS wired, health check, `GeoFactory`, ward-containment canary | ✅ done |
| 2 | Clustering engine: candidate query, accuracy-weighted centroid, adaptive radius, extent cap, advisory lock, post-lock re-read, concurrency test; seed corpus with ground-truth labels | ✅ done |
| 3 | State machine and `TransitionPolicy`, status history, staff queue, SLA clock, escalation ladder, ShedLock sweep, priority ageing, JWT auth and RBAC | ✅ done |
| 4 | Public read API; Next.js frontend: report composer, map, issue detail, **cluster inspector**, staff queue and work view, public dashboard, auth with httpOnly refresh cookie | ✅ done |
| 5 | Deployment: Docker image with CDS, Supabase, Render, Vercel, GitHub Actions CI, keep-alive, backup with a tested restore, Swagger UI, Cloudinary photo upload and nightly orphan sweep | ✅ done; destructive orphan deletion remains opt-in |
| 6 | Citizen verification: quorum, one vote per citizen per fix, timeout sweep, auto-close, reopen on rejection, `/me/verify`, notification centre, resolved-without-verification rate per department | ✅ done |
| 7 | Supervisor tools (assignment board, review queue, split/merge with full recomputation and a permanent log, recategorise), full dashboard aggregates behind expandable headings, SSE live updates | ✅ done |
| 8 | Evaluation: labelled clustering quality, radius sweep, latency at 1k/10k/50k issues, extent-cap ablation, and live concurrency cohorts | ✅ done; reproducible scripts and CSV/PDF results are in `evaluation/` and `artifacts/evaluation/` |
| 9 | Rate limiting, anti-abuse screening, privacy redaction, demo scenario, remaining blueprint screens, and final report | ✅ done |
| Extended scope | Password reset, refresh-token rotation and reuse detection, opt-in email delivery, audited admin configuration, persistent drafts, and background offline submission | ✅ done |
| Production essentials | Authenticator MFA and recovery codes for municipal roles, active-session revocation, issue following, private clarification threads, installable PWA manifest, and security headers | ✅ done |
| UI | Frontend refresh (not a numbered phase): NagrikSetu branding and logo, glass theme with a navy / orange / sky palette, one-screen desktop layout for every page, root redirect to the dashboard, accessibility fixes | ✅ done, verified locally 2026-10-11 |

### Remaining operator checks

- Complete production transactional email delivery when that integration resumes.
- Review Cloudinary orphan-sweep dry-run output before enabling deletion.
- Complete physical-device/screen-reader and installed-PWA checks where required.
- Record the final demo using `docs/DEMO-RUNBOOK.md` if a submission video is required.

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
- **Recoverable accounts.** Refresh cookies rotate through reuse-detecting
  token families. One-use password-reset links expire after 30 minutes, and
  password/access changes revoke refresh sessions.
- **Protected municipal access.** Staff, supervisor and administrator roles
  require time-based authenticator MFA in production, with one-use recovery
  codes and replay protection. Every user can inspect and revoke refresh-token
  session families from the security screen.
- **Email without coupling civic work to SMTP.** Email updates are opt-in and
  use a transactional outbox with bounded retries. In-app notifications and
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
  word, never colour alone. Light and dark themes.
- **Audited administration.** An administrator screen manages category/SLA
  policy, account roles and scopes, department hierarchy and ward officers.
  It prevents the last administrator from being removed, rejects hierarchy
  cycles, revokes affected sessions, and records before/after values.
- **One-screen desktop layout.** On a window of 1280 x 600 or larger the page
  never scrolls: the header stays, tiles and maps take the available height,
  and only long content (the issue list, a timeline) scrolls inside its own
  panel. Smaller windows and phones use the normal flowing layout.
- **Installable and hardened web client.** A web-app manifest, responsive app
  icons and install prompt make the existing offline-capable frontend
  installable. Browser responses include HSTS, frame denial, MIME-sniffing,
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

```bash
docker compose up -d                     # PostGIS on 5432

cd backend && mvn spring-boot:run \
  -Dspring-boot.run.profiles=demo \
  -Dspring-boot.run.arguments="--civictrack.demo.staff-password=demo1234 \
                               --civictrack.media.verify-evidence=false \
                               --civictrack.cors.allowed-origins=http://localhost:3000"

cd frontend && npm install && npm run dev     # http://localhost:3000 (/ redirects to /dashboard)
```

Flyway applies the schema on first boot. Verify:

```bash
curl -s localhost:8080/actuator/health    # {"status":"UP", ...}
```

The `demo` profile is what enables login for the seeded staff accounts: they
ship from the migration **without** a password hash, deliberately, because a
migration is the wrong place to put credentials (V4). It also compresses SLAs to
about three minutes and runs the sweep every twenty seconds, so a breach and an
escalation happen while a slide is still on screen — which means nearly every
seeded issue reads as overdue. Run without the profile for realistic deadlines,
at the cost of not being able to log in.

Production requires MFA before a municipal account receives its role
authority. The `demo` profile deliberately disables that requirement only for
seeded browser automation and workshops; it does not change the production
default. MFA can still be enrolled and exercised at `/me/security` under the
normal profile.

`verify-evidence=false` is only for the local placeholder-photo demo. Production
must leave verification enabled and set the same Cloudinary cloud in
`CLOUDINARY_CLOUD_NAME` and `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`; the API then
downloads and hashes the actual uploaded pixels. To exercise email locally,
run Mailpit on ports 1025/8025 and set `MAIL_ENABLED=true`. Production mail also
needs `SMTP_HOST`, `SMTP_PORT`, optional SMTP credentials/TLS, `MAIL_FROM`, and
`PUBLIC_APP_URL`. With mail disabled, messages remain in the outbox and issue work
continues normally.

On hosting plans that block SMTP, set `MAIL_PROVIDER=brevo`, `MAIL_ENABLED=true`,
`BREVO_API_KEY`, `MAIL_FROM` (a verified Brevo sender), `MAIL_FROM_NAME`, and
`PUBLIC_APP_URL`. The Brevo integration uses HTTPS; the API key belongs only in
the backend environment and must never use a `NEXT_PUBLIC_` name. Leave
`SMTP_HEALTH_ENABLED=false` for HTTPS delivery; enable it only for SMTP.

Seeded logins, all with the password passed above:

| Role | Email |
|---|---|
| ADMIN | `commissioner@civictrack.example` |
| SUPERVISOR | `head.roads@civictrack.example` (and one per department, plus four ward officers) |
| STAFF | `crew.roads@civictrack.example`, `crew.water@`, `crew.sanitation@` |

There is no seeded citizen login — citizens in the corpus have no password.
Register in the app to exercise `/me/reports`. Reporting itself needs no
account at all.

## Testing

```bash
cd backend  && mvn clean test    # 277 total: 275 passed, 2 opt-in evaluations skipped
cd frontend && npm run test      # 82 unit tests
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

The clustering and stream mutation checks are recorded in the month-two report.
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

Backend on Render (Docker, free tier), database on Supabase, frontend on
Vercel. GitHub Actions runs the full backend suite and the frontend lint,
typecheck, tests and build on every push; a push to `main` that passes both
runs the API/browser verification job against a fresh PostGIS database, then
triggers the Render deploy hook if that also passes. Vercel deploys the frontend
from its own Git integration. A scheduled keep-alive workflow pings the API every ten
minutes.

The deployed corpus is the seeded 250 reports across ~110 issues. It was 2,000
reports and ~800 issues originally; the smaller corpus is deliberate — 800
issues buried the handful that actually illustrate a breach, an escalation and
a merge.

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
credentials and a reviewed dry-run establish that deletion is appropriate. Seeded demo reports deliberately point at
Cloudinary's public sample image.

## Security notes

`JWT_SECRET` **must** be set in any real deployment. The development default in
`application.yml` is public knowledge, and anybody holding the signing key can
mint an ADMIN token. The application refuses to start on a key shorter than 32
bytes.

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
The scheduled workflow completed successfully on 2026-10-24: it created a dump,
restored it into a temporary database, uploaded only the encrypted artifact, and
the downloaded artifact was decrypted locally with GPG exit code 0.

For a local backup, use `backend/.env.seed` or the `DATABASE_*` environment
variables, then run `./scripts/backup.sh` and
`./scripts/restore.sh --self-test <dump.gz>`. Backups use restricted permissions,
TLS, a connection timeout and an atomic final rename. Interrupted dumps are removed.
The latest production backup and the older stored backup both restored successfully
on 2026-10-07. Never commit a dump or a passphrase.

To recover an encrypted workflow artifact:

```bash
gpg --output restored.dump.gz --decrypt civictrack-<timestamp>.dump.gz.gpg
./scripts/restore.sh --self-test restored.dump.gz
```

Cloudinary cleanup needs `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and
`CLOUDINARY_API_SECRET` in the backend deployment. Inspect its dry-run log before
setting `CLOUDINARY_DRY_RUN=false`. Those management credentials are not configured
in the available local environment, so production deletion remains unverified.

Verification on 2026-10-27: backend tests, frontend tests, typecheck and lint pass.
The production frontend builds with `npm run build -- --webpack`; this environment
rejects the local worker port used by Turbopack. The normal build command is unchanged.

Deployment follow-up on 2026-10-27: CI run #53 passed at `10481bf`, the Render
health endpoint returned `UP`, and the Vercel dashboard returned HTTP 200.
Firefox and WebKit each passed the 10-route responsive/keyboard smoke suite;
Firefox uses an isolated temporary home on macOS 27 to avoid an upstream
Playwright/Firefox profile-access defect. Production email delivery is deferred.


Phase 7 verification follow-up (2026-10-07): all 224 backend tests and 68
frontend tests pass, along with lint, typecheck and the Webpack production
build. Expanded API field-contract checks and the lifecycle browser walk pass;
135 route checks pass across anonymous, citizen, staff, supervisor and admin
sessions. The harnesses now fail on mismatches and unexpected HTTP/runtime
errors, and CI includes them before the Render deploy hook. These CI changes
were pushed on 2026-10-11; the resulting GitHub Actions runs have not been checked
from this environment.

Frontend refresh verification (2026-10-11), against a local scratch database: 68
frontend tests, lint, typecheck and the Webpack production build pass; the API
contract check, the transition table, the lifecycle UI walk and the route sweep
(0 failing route checks) pass. All 17 pages were measured at 1280x600, 1366x700,
1440x790 and 1920x1080 in light and dark: the window never scrolls and there are
no runtime errors. An axe accessibility scan reports no issues on the pages it
covered, apart from the map markers, whose touch targets are under 24px (an
existing Leaflet marker limitation). On windows of 1280px or wider, controls are
40px high rather than 48px.

Final closeout verification (2026-10-24): 270 backend tests recorded against
PostGIS 17: 268 passed, 2 opt-in evaluations skipped, 0 failures/errors.
All 79 frontend tests, lint, TypeScript, and the Webpack production
build pass. Phase-8 clustering, concurrency, cap-ablation, and latency artifacts
were regenerated from disposable databases. This verification includes MFA,
session revocation, issue following and private clarification-thread coverage.
The final project report and demo runbook are in `docs/`.

See [the current progress record](docs/PROGRESS.md) for the completed scope,
verification boundaries, migration state and outstanding operator checks.
