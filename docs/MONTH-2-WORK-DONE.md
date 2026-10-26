# CivicTrack — month 2, first half: work done

> Current progress (2026-10-26): phases 0–9 and the accepted feature additions
> are implemented locally. See [PROGRESS.md](PROGRESS.md) for current evidence
> and [FINAL_AUDIT.md](../FINAL_AUDIT.md) for security fixes and pending production
> checks. Figures in this milestone report remain historical; the current audit
> records 273 backend tests passed (275 total, 2 intentional skips) and 82 frontend tests.

Phases 6 and 7 of the eight-week plan (weeks 5 and 6). Written to be checkable:
every claim below is a route you can open, a test you can run, or a commit you
can read.

| | |
|---|---|
| Commits | `3132867` Phase 6 · `a21e84f` Phase 7 (on `main`, pushed 2026-10-07) |
| Size | 90 files, +7,172 / −129 lines |
| Tests | Backend **224** (was 173) · Frontend **68** (was 63) — all passing |
| Migrations | `V5__verification_rounds.sql`, `V6__moderation.sql` |
| Design decisions | DD-059 to DD-065 in `DESIGN-DECISIONS.md` |

---

## Phase 6 — the verification loop (week 5)

The loop that makes the accountability claim real: a department cannot close
its own ticket. Staff claim a fix, and the citizens who reported the problem
decide whether it holds.

### What a citizen sees

| Route | What it does |
|---|---|
| `/me/verify/[id]` | Before photo beside the department's after photo, their note, and two equally weighted answers — *Fixed* and *Not fixed* (optional one-line reason). Below: the tally in plain words and the time after which silence counts as agreement. Returning after voting shows your answer, not an error. |
| `/me/notifications` | Newest first, unread rows marked, mark-one and mark-all read. Each row links to where the next step is. Unread count in the sidebar, polled once a minute. |
| `/me/reports` | Rows awaiting your answer are now marked and linked. |

### The rules (section 4.3)

```
required       = min(3, max(1, ceil(reporters / 2)))
rejections >= confirmations and >= 1   -> REOPENED, escalation +1 (capped at 4)
confirmations >= required              -> RESOLVED
72 h elapsed, nobody objected          -> RESOLVED (silence = consent)
7 days after RESOLVED                  -> CLOSED
```

A vote settles the issue the moment it decides it; a scheduled sweep settles
the ones nobody answers. Both take the issue's row lock and go through the
same code, so they cannot disagree.

### Gaps in the specification, closed

| Gap | Fix | Record |
|---|---|---|
| One vote per citizen **per issue** locked out everyone who judged the first fix, and kept counting their rejections against the second | One vote per citizen **per fix** — each resubmission opens a new round | DD-059 |
| A contested vote short of quorum (2 fixed, 1 not, 3 needed) could never settle | At the timeout, a majority decides | DD-060 |
| A staff member who reported a pothole could confirm their own department's fix | Only citizen accounts vote | DD-061 |

### [CHANGE 6] — measured, not hidden

An issue reported only anonymously has nobody who can vote, so it always
resolves through the timeout. That is not fixable without opening an abuse
vector, so it is **published**: the dashboard shows, per department, the share
of issues resolved without citizen verification, beside the reopen rate.

### A bug the tests caught

The vote loaded the issue without its row lock, despite the class's own
comment saying every path took it. `VerificationLoopIT.concurrentVotesSerialise`
(six simultaneous votes, five times) failed; the lock was added (DD-062).

---

## Phase 7 — moderation and the full dashboard (week 6)

### Supervisor moderation

Leader clustering assigns each report once and never revisits it. These tools
are the designed escape hatch for the cases it gets wrong.

| Route | What it does |
|---|---|
| `/supervisor/review` | Every issue the engine flagged, from all three causes, each explained in words, with a thumbnail of the cluster. Actions: confirm, split/merge, recategorise, reject (reason sent to reporters). Scoped to the supervisor's department or ward. |
| `/supervisor/issues/[id]/cluster` | Select reports by clicking pins, shift-dragging a box, or a checkbox list. **Split** the selection into a new issue, or **merge** a duplicate in by its ticket number. Both show the server's preview first. Includes the issue's moderation log. |

**Guarantees** (DD-063):

- **No report is ever deleted.** Reports move and keep their identity. A
  merged-away ticket stays, pointing to where its reports went, and its
  reporters are told in those words.
- **Exact recomputation.** Split and merge rebuild centroid, extent and counts
  from the member reports, using the same weighting as ingest.
- **Nothing buys time.** A merge keeps the higher escalation; a deadline never
  moves later; a split-off issue may start overdue.
- **Permanent log** of every action, keeping each moved report's original
  clustering decision for the week-7 evaluation.
- **Refused with a reason**: issues awaiting verification or already resolved
  can't be redrawn; merges need the same category and ward.

### The public dashboard, complete

| Figure | Definition |
|---|---|
| Median resolution time | Overall, by department, by ward. First report to resolution. |
| SLA compliance | Share of fixes **claimed** before the deadline (time waiting on citizens is not the department's lateness), with a 30-day chart. |
| Open backlog by age | Six buckets, under a day to over 30 days. |
| Reported against resolved | New issues vs resolved issues per day, 90 days. |
| Most-reported open issues | By distinct reporters. |
| Currently breaching | **Live** list, most overdue first. |
| Reopen rate, resolved without verification | Per department (from phase 6). |

Days are Ludhiana calendar days. A figure based on fewer than five resolved
issues is withheld, and the tile says how many more it needs. Definitions in
DD-064.

**Live updates** (DD-065): the overdue count and breaching list update
themselves over server-sent events. Events are sent only **after** a change
commits, coalesced to one per second, with a 25-second heartbeat so the
hosting proxy keeps the connection open. The page says "live" only while it is.

**Chart colours were validated, not chosen.** Two obvious pairings failed the
colour-blindness check — green against red measured ΔE 1.9 for deuteranopia
in dark mode, effectively one colour — so the charts pair the resolved green
with a tested gray. Every chart has a table view.

---

## Completing phase 7: the assignment board and a browser walk

Added after the two commits above, on 2026-10-07.

**Assignment board, `/supervisor/queue` (§3.16).** It was on the week-6 list
in the month-one report but missing from the phase 7 brief. Without it an
acknowledged issue could not move forward in the UI.

- The staff queue plus reporter names and the holder's name, from a
  supervisor-only endpoint; the crew's own queue carries no identity.
- Acknowledged rows expand to a picker of the issue's department, with each
  person's current workload, offering only people the transition guard accepts.
- Bulk acknowledge, one transition per issue, with each refusal reported on its
  row.
- Assigning and acknowledging go through the existing transition endpoints, so
  there is still exactly one way to change a status.
- **A finding from the walk:** the SLA ladder writes escalation owners into
  `assigned_to`, so on real data every escalated NEW issue had a "holder", and a
  "to assign" tab defined by an empty assignee showed nothing at all. "To
  assign" is now defined by status (NEW or ACKNOWLEDGED). The board says
  "escalated to Municipal Commissioner (level 4), no crew assigned" rather
  than calling an escalation an assignment. Pinned by a test.

**Browser walk.** Real Chrome, driven by Playwright, against the restored
backup: the dashboard signed out, in dark mode and at phone width; a citizen
receiving a notification, voting "not fixed", and then voting again on the
re-submitted fix (DD-059 rounds, end to end); a supervisor on the board, the
review queue, a split and a merge back by ticket reference; a crew member
seeing no supervisor screens. **30 of 30 checks pass.** It found and fixed:

| Found | Fix |
|---|---|
| Hydration error on every dashboard load: the live badge chose its first state from `typeof EventSource`, which differs between server and browser | Same first state on both |
| A 409 in the console after every merge: the merge preview refetched for an issue that no longer existed | Previews excluded from the post-action refresh |
| Board "to assign" tab empty on real data | Defined by status, as above |
| Trend chart end label clipped ("0 new issu…") | Wider right margin |
| Backlog axis labels overprinting at half width | Short axis labels; full words in tooltip and table |
| Twenty breaching rows pushing every chart several screens down | The 8 most overdue, with "show all" |

## How it was verified

| Check | Result |
|---|---|
| Backend suite (Testcontainers, real PostGIS) | 224 passed, 0 failed (fresh run, 2026-10-07) |
| Frontend unit tests, typecheck, lint, production build | 68 passed, all clean |
| Phase 6 commit on its own | 196 backend tests and full frontend checks green — each commit builds by itself |
| Mutation checks | Breaking the centroid weighting, and moving the stream listener inside the transaction, each made the tests fail |
| Migrations against real data | The 2026-09-09 backup restored into a throwaway database; V5 and V6 applied cleanly |
| Live run on that data | Vote, repeat vote and notification round trip; split then merge-back on a five-report issue restored a centroid equal to an independent SQL weighted mean (to 1e-9) and an exact extent; the event stream fired |

---

## On first deployment

Pushing `main` runs V5 and V6 against production. The first verification sweep
then settles the backlog at once. On the backup that meant **5** long-pending
issues resolved *without verification* and **18** resolved issues
auto-closed, so expect the dashboard figures to move.

---

## Completion delta after the phase-7 checkpoint

At the original 2026-10-07 checkpoint the items below were scheduled in the
phase 8 and 9 briefs. They were completed in the 2026-10-24 closeout.

| Item | Final status |
|---|---|
| Reassign ward, the moderation view (blueprint §3.19) | Complete |
| Ward detail page `/dashboard/wards/[id]` (§3.9), `/me/profile` (§3.13) | Complete |
| Clustering evaluation: precision/recall/F1, radius sweep, latency, extent-cap ablation | Complete |
| Rate limiting and anti-abuse; paper and demo runbook | Complete; video recording remains an operator action |

## Final closeout — phases 8 and 9 (2026-10-24)

Phase 8 is complete. The deterministic 250-report corpus now has a reproducible
pairwise precision/recall/F1 evaluator, per-category radius sweep, extent-cap
ablation on both seeded and linear stress corpora, live concurrency cohorts, and
live ingest latency at 1k/10k/50k existing issues. The baseline result is
precision 1.000, recall 0.790, F1 0.883. Every concurrency cohort through 50
requests produced one issue, and p50 remained 52.7–57.7 ms across all three
database sizes with no request failures. CSV and vector-PDF evidence is retained
under `artifacts/evaluation/`.

Phase 9 is complete in the repository. It adds report/login throttling, durable
duplicate checks, perceptual photo hashes, suspicious-content review flags,
proof-photo reuse detection, safe problem responses, public-description
redaction with retained evidence, a timed demo scenario, Prometheus export, and
the previously missing profile, audit, system, ward, reassignment, and department
analytics screens. The final report and recording runbook are in `docs/`.

The production-essential follow-up adds mandatory authenticator MFA for
municipal roles, recovery codes, refresh-session management, issue following,
private clarification threads, an installable manifest, and browser security
headers. Following is intentionally excluded from report counts and priority.

Final gates: 270 backend tests recorded against PostGIS 17: 268 passed,
2 opt-in evaluation tests skipped, zero failures/errors; 79 frontend tests passed; clean lint,
TypeScript, and Webpack production build. External deployment, backup-artifact,
Cloudinary deletion, and video-recording checks still require their operators'
credentials and accounts.

## Follow-up verification and dashboard refinement — 2026-10-07

- The dashboard shows eight headline metric tiles and presents seven collapsed
  section headings. Opening one reveals its charts/tables and closes the previous
  section. Native controls support keyboard use. Dashboard queries refresh every
  minute in addition to the SSE updates for overdue figures.
- Closed DD-046: seed runs now use stable IDs and a fixed reference clock. A
  250-report repeat-run test compares every report, issue, and label while changing
  the wall clock. Production identity generation remains random outside that scope.
- Photo cleanup now retains staff resolution proof as well as citizen photos.
- A weekly backup workflow is ready, with a restore test and encrypted artifacts.
  GitHub secrets and deployment activation still need an authenticated operator.
- A fresh production backup restored 113 issues and 254 reports successfully.
  The older backup also passed. No production data was changed.
- Latest remote CI on main passed; the live dashboard metrics endpoint returns 200.
  Render branch settings and Cloudinary management configuration were not accessible.
- Frontend production build passes using Webpack. The default Turbopack build is
  blocked by this environment's worker-port restriction.

Historical note: at this 2026-10-07 checkpoint evaluation and phase 9 were still
future work. The 2026-10-24 closeout above supersedes that status.

Browser follow-up: all seven disclosure headings passed initial-closed, exclusive
opening, Enter/Space keyboard interaction, and 360px layout checks. The local
production UI used read-only snapshots of live dashboard responses; there were
no browser JavaScript errors. The stream itself remains covered by backend tests.


## Phase 7 completion checks — 2026-10-07

This subsection records the phase-7 checkpoint; phase 8 and 9 work was added in
the later closeout recorded above.

- Backend: 224 tests passed against PostGIS, no failures or skips.
- Frontend: 68 tests, lint, typecheck and production Webpack build passed.
- Expanded API field-contract checks passed; an intentionally missing field
  correctly caused a nonzero exit.
- The browser lifecycle walkthrough now asserts the offered action at each
  status and handles the current sign-in dialog. Its fixture selection now
  verifies that a report actually created a NEW Roads issue rather than
  assuming a CLOSED donor location cannot match another active cluster.
- The route sweep passed 135 checks across anonymous and all four roles,
  including phase 6–7 routes, deliberate 404s and missing-photo fallbacks.
- Pinned Playwright dependencies and a disposable-database CI verification
  job were added locally. Render deployment depends on that job. No push or
  deployment was performed, so the new job has no remote execution result yet.
- Live frontend, API health and dashboard metrics returned successfully.
- The backup workflow is already active on GitHub but has no recorded runs.
  Backup secrets/recovery, Render branch and Cloudinary management settings
  still need authenticated access. Production configuration was not changed.
