#!/usr/bin/env python3
import csv
from pathlib import Path
import matplotlib.pyplot as plt

root = Path("artifacts/evaluation")
parts = sorted(root.glob("latency-*.csv"), key=lambda path: int(path.stem.split("-")[-1]))
rows = []
for part in parts:
    with part.open(newline="") as handle:
        rows.extend(csv.DictReader(handle))
if not rows:
    raise SystemExit("No latency-<scale>.csv results found")

with (root / "ingest-latency.csv").open("w", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)

scales = [int(row["scale"]) for row in rows]
fig, axis = plt.subplots(figsize=(4.8, 3.2))
for key, label in (("p50_ms", "p50"), ("p95_ms", "p95"), ("p99_ms", "p99")):
    axis.plot(scales, [float(row[key]) for row in rows], marker="o", label=label)
axis.set_xscale("log")
axis.set(xlabel="Existing issues", ylabel="End-to-end ingest latency (ms)")
axis.grid(alpha=0.25); axis.legend(); fig.tight_layout()
fig.savefig(root / "ingest-latency.pdf")
