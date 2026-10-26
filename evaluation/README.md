# Reproducible evaluation

All outputs go to `artifacts/evaluation/`. PDFs are written by Matplotlib as
vector graphics and sized for a two-column paper.

## Clustering quality, radius sweep, and extent-cap ablation

Use a freshly seeded database whose report IDs match
`backend/ground_truth_labels.csv`:

```bash
python3 -m venv .venv-evaluation
.venv-evaluation/bin/pip install -r evaluation/requirements.txt
.venv-evaluation/bin/python evaluation/evaluate_clustering.py --dsn "$DATABASE_URL"
```

The retained final measurements use the actual Java service and PostGIS queries
for the baseline, radius sweep, and extent-cap ablation. Run them in an isolated
Testcontainers database, then summarize their recorded assignments:

```bash
cd backend
mvn test -Dtest=ProductionEvaluationIT -Dcivictrack.evaluate=true
cd ..
python3 evaluation/summarize_production.py
```

`production-predictions.csv` is the auditable assignment record and
`production-quality.csv` contains pairwise precision/recall/F1. Singleton
defects therefore do not inflate a classification accuracy score. The older
Python replay remains useful as an independent equation-level cross-check, not
as the source of the final production-pipeline claim.

Measured on the 250-report seed corpus: precision 1.000, recall 0.790, and F1
0.883. With the cap disabled, seeded F1 rose to 0.931; on the linear chain
stress corpus it instead fell from 1.000 to 0.558. The paired corpora expose
both the cap's recall cost and the chain-merge failure it prevents.

## Concurrency correctness

Start the API against a disposable, empty database, then run:

```bash
.venv-evaluation/bin/python evaluation/concurrency.py
```

It submits N identical reports simultaneously for N = 2, 5, 10, 20, 50 and
records the number of distinct issue IDs returned. The expected value is one
at every N. The completed run produced one issue in all five cohorts.

## Latency versus scale

Install `k6`, `psql`, `curl`, and `jq`; start the API against a disposable
database; then run:

```bash
EVALUATION_ALLOW_RESET=yes \
DATABASE_URL=postgresql://... \
ADMIN_EMAIL=... ADMIN_PASSWORD=... \
./evaluation/run_latency.sh
```

The explicit reset acknowledgement is intentional: the prefill truncates
application data before inserting 1k, 10k, and 50k spatially distributed open
issues. k6 reports end-to-end p50/p95/p99, while each run also saves the
Micrometer Prometheus series for the server-side ingest timer. If latency is
not near-flat, run `EXPLAIN (ANALYZE, BUFFERS)` on the candidate query at 50k
before presenting the result.

For reproducible server-only timings from a fresh Micrometer timer at each
scale, run `ProductionLatencyIT` with the same opt-in property. Its 300 measured
ingests follow 50 warmups and are retained in
`production-server-latency.csv`. These local, direct-service measurements test
query scaling; they are not end-to-end or production-capacity claims. The k6
runner above separately measures HTTP latency when its external tools are
available.
