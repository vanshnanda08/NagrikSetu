# Manuscript evidence and source audit

Prepared 2026-10-29. Repository HEAD at inspection:
`011ecb5c04192b1823065a2d4c248630c853add8`.
Paths below are relative to the repository root. Historic plans and milestone
reports were checked against source and current status rather than treated as
proof of implementation.

Superseded audit/status documents removed during the November documentation
cleanup remain cited below through immutable Git history links. These are
historical manuscript sources, not current implementation claims.

## Reading scope

The review inventoried frontend routes/components/auth/offline boundaries,
backend modules and integration tests, ten migrations, configuration,
dependency manifests, CI/deployment/backup files, evaluation programs and CSVs,
and repository documentation. Core sources were read directly. Historical
blueprints and month-one documents served as context rather than authority for
current features. No application code was edited for the paper.

## Claim-to-source map

| Manuscript topic | Primary implementation/evidence |
|---|---|
| Current completed scope and pending operations | [historical PROGRESS.md](https://github.com/vanshnanda08/NagrikSetu/blob/e0b4cedbfb5c2b475dc557532e19130e6549a913/docs/PROGRESS.md), [historical FINAL_AUDIT.md](https://github.com/vanshnanda08/NagrikSetu/blob/e0b4cedbfb5c2b475dc557532e19130e6549a913/FINAL_AUDIT.md), `docs/FINAL-PROJECT-REPORT.md` |
| Core architecture | `PROJECT_DOCUMENTATION.md` sections 2–7, `backend/pom.xml`, `frontend/package.json`, `frontend/README.md`, `backend/src/main/resources/application.yml` |
| Equations (1)--(3): weighting, adaptive radius, extent bound | `backend/src/main/java/com/civictrack/clustering/CentroidMath.java` |
| Three bands, nearest candidate, cap refusal, per-report decision evidence | `backend/src/main/java/com/civictrack/clustering/ClusteringService.java` |
| Grid lock, two-stage candidate read, LIMIT 5, adjacent-cell limitation, reporter counting | `backend/src/main/java/com/civictrack/issue/IssueRepository.java` |
| Clustering constants and normal timeouts | `backend/src/main/resources/application.yml` |
| Category-specific radii, multipliers, safety policy, prototype ward polygons | `backend/src/main/resources/db/migration/V2__reference_data.sql` |
| Strict ward containment | `backend/src/main/java/com/civictrack/ward/WardRepository.java`, `backend/src/test/java/com/civictrack/WardContainmentIT.java` |
| Schema, indexes, constraints | `backend/src/main/resources/db/migration/V1__baseline.sql` through `V10__security_following_and_messages.sql` |
| Nine states and STAFF prohibition; supervisor closure after guard | `backend/src/main/java/com/civictrack/issue/policy/TransitionPolicy.java`, `issue/policy/Guards.java` |
| Quorum, rejection-first ordering, timeout, round-specific vote uniqueness | `backend/src/main/java/com/civictrack/issue/policy/VerificationTally.java`, `verification/VerificationService.java`, `verification/VerificationQuorumService.java`, migration V5 |
| Eligibility and scope | `backend/src/main/java/com/civictrack/issue/IssueAccessGuard.java`, verification/API controllers |
| Priority equation | `backend/src/main/java/com/civictrack/issue/PriorityCalculator.java`, `Priority.java` |
| Pause credits and escalating deadline | `backend/src/main/java/com/civictrack/sla/SlaService.java`, `sla/SlaSweepService.java`, `sla/escalation/*` |
| Correction and exact geometry recomputation | `backend/src/main/java/com/civictrack/moderation/ModerationService.java`, `ClusterRecomputer.java`, `docs/DESIGN-DECISIONS.md` DD-063 |
| Media verification before locks | `backend/src/main/java/com/civictrack/report/api/ReportController.java`, `media/PhotoEvidenceService.java` |
| Scoped idempotency/payload checks | `backend/src/main/java/com/civictrack/report/ReportSubmissionService.java` |
| SSE after commit, coalescing, heartbeat, process-local fan-out | `backend/src/main/java/com/civictrack/stream/DashboardStream.java` |
| Dashboard metric semantics and small samples | `backend/src/main/java/com/civictrack/dashboard/*`, `docs/DESIGN-DECISIONS.md` DD-064 |
| Drafts and worker/foreground outbox | `frontend/src/lib/offlineStore.ts`, `frontend/src/components/OutboxSync.tsx`, `frontend/src/app/api/offline-report/route.ts`, `frontend/public/report-worker.js` |
| Token/cookie boundary and recovery | `frontend/src/lib/auth.tsx`, `frontend/src/app/api/auth/*/route.ts`, `backend/src/main/java/com/civictrack/user/auth/*` |
| MFA/session/following/message additions | `backend/src/main/java/com/civictrack/user/api/AccountSecurityController.java`, `issue/IssueEngagementService.java`, migration V10, [historical FINAL_AUDIT.md](https://github.com/vanshnanda08/NagrikSetu/blob/e0b4cedbfb5c2b475dc557532e19130e6549a913/FINAL_AUDIT.md) |
| Durable quotas vs local login buckets | `backend/src/main/java/com/civictrack/abuse/RateLimitService.java`, `report/ReportSubmissionService.java` |
| CI/backup operational support | `.github/workflows/ci.yml`, `.github/workflows/backup.yml`, `scripts/backup.sh`, `scripts/restore.sh` |
| Latest recorded test totals/browser checks | [historical PROGRESS.md](https://github.com/vanshnanda08/NagrikSetu/blob/e0b4cedbfb5c2b475dc557532e19130e6549a913/docs/PROGRESS.md), [historical FINAL_AUDIT.md](https://github.com/vanshnanda08/NagrikSetu/blob/e0b4cedbfb5c2b475dc557532e19130e6549a913/FINAL_AUDIT.md), `tools/README.md` (historical audit evidence, not newly rerun) |

## Retained quantitative evidence

| Evidence file | Meaning and boundary |
|---|---|
| `artifacts/evaluation/production-predictions.csv` | Per-observation truth/issue assignments for 24 Java/PostGIS variants; source for independent pair recount |
| `artifacts/evaluation/production-quality.csv` | Global and per-category pairwise counts/scores |
| `artifacts/evaluation/clustering-quality.csv` | Baseline category summary; 250 observations, 541 TP, 0 FP, 144 FN |
| `artifacts/evaluation/extent-cap-ablation.csv` | Four corpus/cap summaries; the no-cap implementation uses a checked nonbinding cap |
| `artifacts/evaluation/ingest-latency.csv` | Three saved HTTP aggregate rows, 500 requests each; not raw observations |
| `artifacts/evaluation/production-server-latency.csv` | Three direct-service Micrometer aggregate rows, 300 measurements after 50 warmups per scale |
| `artifacts/evaluation/concurrency-correctness.csv` | One cohort each at N=2,5,10,20,50; identical-coordinate scope |
| `backend/src/test/java/com/civictrack/seed/ProductionEvaluationIT.java` | Isolated real-service replay and ablation; linear corpus is 18 points 45 m apart; stress cap multiplier 1.0 vs default ROAD_DAMAGE multiplier 2.5 |
| `backend/src/test/java/com/civictrack/clustering/ProductionLatencyIT.java` | Timing reset/warmup/count implementation; direct service rather than HTTP |
| `backend/src/main/java/com/civictrack/seed/SeedDataGenerator.java` | Seed 42, synthetic defects, chronological ingest, declared accuracy 5--50 m, Gaussian perturbation |
| `evaluation/summarize_production.py` | Pair definitions and zero-denominator convention |
| `evaluation/latency.js`, `run_latency.sh`, `concurrency.py`, `prefill.sql` | Saved workload definitions; no complete contemporaneous environment manifest |

`paper/verify_evidence.py` independently recounts pairs from assignments and
asserts equality with all 24 global summary rows. Hashes and calculated results
are in `verification.json`. This is newly performed artifact verification,
not a new clustering, HTTP, or concurrency execution. Historical charts are
not copied blindly: the manuscript plots are regenerated from their CSVs.

### Findings that change interpretation

1. The extent value is a conservative upper bound, not an exact per-ingest
   maximum member distance. Its inflation can cause additional splits.
2. Candidate evaluation tries the nearest reread candidate only. It is not an
   exhaustive admissible-cluster search or a globally optimal assignment.
3. Two reports in distinct snapped cells can race while there are no existing
   candidate rows to lock. The concurrency cohorts do not exercise this case.
4. The common-radius sweep also changes the extent cap. It does not identify an
   isolated radius effect or justify choosing a radius on held-out data.
5. All eight STRAY_ANIMAL observations are singletons. Its displayed 1.0 scores
   follow a zero-denominator convention, so the paper shows its recall as an
   em dash and explains that no positive pairs were tested.
6. The synthetic seed's chronological ingest and replay's timestamp/ID order
   can order equal-time observations differently. Baseline and ablation are
   identified as separate variants rather than assumed perfectly paired runs.
7. A rejection that ties the current confirmations settles immediately; this
   is not a deferred majority referendum of every reporter.
8. Distinct-reporter count includes anonymous devices, but only authenticated
   citizen reporters can vote. Anonymous-only issues can resolve via silence.
9. SUPERVISOR may close a previously RESOLVED issue after the seven-day guard.
   Older architecture prose omits this later role policy; the paper follows code.
10. Service and HTTP quantiles measure different workloads/boundaries; they
    cannot be subtracted to estimate controller or network overhead.
11. HTTP aggregates have no complete hardware/configuration record and no
    evidence of characterized production photo-fetch latency. Values are
    reported as saved local prototype measurements, not production capacity.
12. Recorded test/browser totals are historical audit assertions. This task
    did not rerun the entire application audit, nor claim a new audit pass.

## Verified bibliography

All entries were checked on 2026-10-29. The DOI identifiers below resolve to
real publisher records. No DOI was invented for the DBSCAN paper.

| BibTeX key | Primary verification and bibliographic notes |
|---|---|
| `goodchild2007` | Springer: https://doi.org/10.1007/s10708-007-9111-y ; Michael F. Goodchild; GeoJournal 69, 211--221 (2007) |
| `offenhuber2015` | Oxford: https://academic.oup.com/cjres/article-abstract/8/1/93/302862 ; Dietmar Offenhuber; volume 8(1), 93--112 (2015); online publication was 2014, issue year used in bibliography |
| `ester1996` | Original AAAI PDF: https://cdn.aaai.org/KDD/1996/KDD96-037.pdf ; AAAI contents: https://ocs.aaai.org/Library/KDD/kdd96contents.php ; Ester, Kriegel, Sander, Xu; KDD 1996, 226--231 |
| `zhang1996` | ACM: https://doi.org/10.1145/235968.233324 ; Zhang, Ramakrishnan, Livny; SIGMOD Record 25(2), 103--114 (1996); journal-record DOI is used consistently rather than mixing it with proceedings DOI 10.1145/233269.233324 |
| `cao2006` | SIAM: https://epubs.siam.org/doi/10.1137/1.9781611972764.29 ; original author-hosted paper: https://www.cs.sfu.ca/~ester/papers/SDM2006.DenStream.final.pdf ; Cao, Ester, Qian, Zhou; SDM 2006, 328--339; the publisher's rendered author text includes an apparent “Estert” footnote artifact, so the actual author spelling follows the original paper |
| `open311` | Official specification: https://wiki.open311.org/GeoReport_v2/ |
| `postgis` | Official function documentation: https://postgis.net/docs/ST_DWithin.html |
| `pglocks` | Official versioned documentation: https://www.postgresql.org/docs/17/explicit-locking.html |
| `pgselect` | Official SELECT/locking caveats: https://www.postgresql.org/docs/17/sql-select.html |
| `totp` | RFC Editor: https://www.rfc-editor.org/rfc/rfc6238 ; M'Raihi, Machani, Pei, Rydell; RFC 6238, May 2011 |

Formatting provenance: IEEE Author Center,
https://conferences.ieeeauthorcenter.ieee.org/write-your-paper/authoring-tools-and-templates/ .
The compiler loads the unmodified official IEEEtran class and IEEEtran BibTeX
style from its TeX bundle. The author names/roll numbers/institution came from
the user's response, not from inferred commit identities.
