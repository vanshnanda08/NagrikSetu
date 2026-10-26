#!/usr/bin/env python3
"""Summarize actual Java/PostGIS assignments, not a Python clustering replay."""
import csv
from collections import defaultdict
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

root = Path(__file__).resolve().parents[1] / "artifacts" / "evaluation"
groups = defaultdict(list)
with (root / "production-predictions.csv").open() as handle:
    for row in csv.DictReader(handle):
        groups[(row["variant"], row["corpus"], "ALL", row["radius_m"], row["cap"])].append(row)
        groups[(row["variant"], row["corpus"], row["category"], row["radius_m"], row["cap"])].append(row)

summary = []
with (root / "production-quality.csv").open("w", newline="") as handle:
    writer = csv.writer(handle)
    writer.writerow(["variant", "corpus", "category", "radius_m", "cap", "reports", "precision", "recall", "f1", "tp", "fp", "fn"])
    for key, rows in groups.items():
        tp = fp = fn = 0
        for i, left in enumerate(rows):
            for right in rows[i + 1:]:
                truth = left["truth"] == right["truth"]
                predicted = left["predicted"] == right["predicted"]
                tp += truth and predicted
                fp += not truth and predicted
                fn += truth and not predicted
        precision = tp / (tp + fp) if tp + fp else 1.0
        recall = tp / (tp + fn) if tp + fn else 1.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        result = [*key, len(rows), precision, recall, f1, tp, fp, fn]
        summary.append(result)
        writer.writerow(result)

def finish(path):
    plt.tight_layout()
    plt.savefig(root / path, format="pdf", bbox_inches="tight")
    plt.close()

baseline = [row for row in summary if row[0] == "baseline" and row[2] != "ALL"]
baseline.sort(key=lambda row: row[2])
fig, axis = plt.subplots(figsize=(7.1, 3.5))
x = range(len(baseline)); width = .25
axis.bar([i-width for i in x], [r[6] for r in baseline], width, label="Precision")
axis.bar(x, [r[7] for r in baseline], width, label="Recall")
axis.bar([i+width for i in x], [r[8] for r in baseline], width, label="F1")
axis.set(ylim=(0,1.05), ylabel="Pairwise score", title="Production clustering quality by category")
axis.set_xticks(list(x), [r[2].replace("_", " ").title() for r in baseline], rotation=25, ha="right")
axis.legend(ncol=3, frameon=False)
finish("clustering-quality.pdf")

radius = [row for row in summary if row[0].startswith("radius-") and row[2] != "ALL"]
fig, axis = plt.subplots(figsize=(7.1, 3.5))
for category in sorted({row[2] for row in radius}):
    rows = sorted((row for row in radius if row[2] == category), key=lambda row: int(row[3]))
    axis.plot([int(row[3]) for row in rows], [row[8] for row in rows], marker="o", markersize=2.5,
              label=category.replace("_", " ").title())
axis.set(xlabel="Base merge radius (m)", ylabel="Pairwise F1", ylim=(0,1.05),
         title="Production radius sweep")
axis.legend(ncol=2, fontsize=7, frameon=False)
finish("radius-sweep.pdf")

cap = [row for row in summary if row[2] == "ALL" and (row[0].startswith("seed-cap-") or row[0].startswith("linear-cap-"))]
cap.sort(key=lambda row: (row[1], row[4]))
fig, axis = plt.subplots(figsize=(7.1, 3.5))
labels = [f"{row[1]}\n{row[4]}" for row in cap]
bars = axis.bar(range(len(cap)), [row[8] for row in cap], color=["#0b3b5e", "#e07a24", "#0b3b5e", "#e07a24"])
axis.set(ylim=(0,1.10), ylabel="Pairwise F1", title="Production extent-cap ablation")
axis.set_xticks(range(len(cap)), labels)
axis.bar_label(bars, fmt="%.3f", padding=3)
finish("extent-cap-ablation.pdf")

with (root / "production-server-latency.csv").open() as handle:
    latency = list(csv.DictReader(handle))
fig, axis = plt.subplots(figsize=(7.1, 3.5))
for field, label in (("p50_ms", "p50"), ("p95_ms", "p95"), ("p99_ms", "p99")):
    axis.plot([int(row["scale"]) for row in latency], [float(row[field]) for row in latency], marker="o", label=label)
axis.set(xlabel="Existing open issues", ylabel="Milliseconds", title="Micrometer direct-service ingest latency")
axis.set_xscale("log"); axis.set_xticks([1000,10000,50000], ["1k","10k","50k"])
axis.legend(frameon=False)
finish("ingest-latency.pdf")

print("Wrote production CSV summary and four Java/PostGIS evaluation plots.")
