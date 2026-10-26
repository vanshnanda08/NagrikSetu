#!/usr/bin/env python3
"""Reproduce phase-8 clustering quality, radius sweep, and cap ablation."""

import argparse
import csv
import math
import os
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import matplotlib.pyplot as plt
import psycopg


@dataclass
class Report:
    report_id: str
    issue_id: str
    defect_id: str
    category: str
    ward_id: str
    lat: float
    lng: float
    accuracy: float
    created_at: object
    configured_radius: float
    extent_multiplier: float
    low_conf_action: str


@dataclass
class Cluster:
    cluster_id: str
    ward_id: str
    sum_w: float
    sum_wx: float
    sum_wy: float
    extent: float = 0.0

    @property
    def lat(self):
        return self.sum_wy / self.sum_w

    @property
    def lng(self):
        return self.sum_wx / self.sum_w


def haversine(a_lat, a_lng, b_lat, b_lng):
    radius = 6_371_008.8
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = math.radians(b_lat - a_lat), math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(h))


def metrics(rows, predicted):
    tp = fp = fn = 0
    for left in range(len(rows)):
        for right in range(left + 1, len(rows)):
            same_truth = rows[left].defect_id == rows[right].defect_id
            same_prediction = predicted[rows[left].report_id] == predicted[rows[right].report_id]
            tp += int(same_truth and same_prediction)
            fp += int(not same_truth and same_prediction)
            fn += int(same_truth and not same_prediction)
    precision = tp / (tp + fp) if tp + fp else 1.0
    recall = tp / (tp + fn) if tp + fn else 1.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"precision": precision, "recall": recall, "f1": f1, "tp": tp, "fp": fp, "fn": fn}


def replay(rows, radius_override=None, cap_enabled=True):
    clusters = []
    predicted = {}
    for row in sorted(rows, key=lambda value: (value.created_at, value.report_id)):
        radius = float(radius_override if radius_override is not None else row.configured_radius)
        candidates = [(haversine(row.lat, row.lng, cluster.lat, cluster.lng), cluster)
                      for cluster in clusters if cluster.ward_id == row.ward_id]
        candidates = [(distance, cluster) for distance, cluster in candidates
                      if distance <= 1.5 * radius + 120]
        candidates.sort(key=lambda item: item[0])
        chosen = candidates[0] if candidates else None
        weight = 1.0 / max(row.accuracy, 3.0) ** 2
        merge = False
        projected = None
        if chosen:
            distance, cluster = chosen
            effective = radius + 0.5 * min(row.accuracy, 60.0) + 0.5 / math.sqrt(cluster.sum_w)
            merge = distance <= 1.5 * effective
            if distance > effective and row.low_conf_action == "SPLIT_FLAG":
                merge = False
            if merge:
                new_w = cluster.sum_w + weight
                new_lng = (cluster.sum_wx + weight * row.lng) / new_w
                new_lat = (cluster.sum_wy + weight * row.lat) / new_w
                shift = haversine(cluster.lat, cluster.lng, new_lat, new_lng)
                member_distance = haversine(row.lat, row.lng, new_lat, new_lng)
                projected = max(cluster.extent + shift, member_distance)
                if cap_enabled and projected > row.extent_multiplier * radius:
                    merge = False

        if not merge:
            cluster = Cluster(f"cluster-{len(clusters) + 1}", row.ward_id,
                              weight, weight * row.lng, weight * row.lat)
            clusters.append(cluster)
        else:
            cluster.sum_w += weight
            cluster.sum_wx += weight * row.lng
            cluster.sum_wy += weight * row.lat
            cluster.extent = projected
        predicted[row.report_id] = cluster.cluster_id
    return predicted


def linear_stress_corpus():
    """Six 90 m road defects arranged end-to-end as a locally mergeable chain."""
    rows = []
    sequence = 0
    origin_lat, origin_lng = 30.93, 75.82
    for defect in range(6):
        for observation in range(3):
            sequence += 1
            lat = origin_lat + ((defect * 3 + observation) * 45) / 111_111.0
            rows.append(Report(
                f"linear-report-{sequence}", "", f"linear-defect-{defect}",
                "ROAD_DAMAGE", "linear-ward", lat, origin_lng, 8.0, sequence,
                60.0, 1.0, "MERGE_FLAG"))
    return rows


def load_rows(connection, labels_path):
    with labels_path.open(newline="") as handle:
        labels = {row["report_id"]: row["defect_id"] for row in csv.DictReader(handle)}
    query = """
        SELECT r.id::text, r.issue_id::text, r.category_code, i.ward_id::text,
               ST_Y(r.location), ST_X(r.location), r.gps_accuracy_m, r.created_at,
               c.merge_radius_m, c.max_extent_multiplier, c.low_conf_action
        FROM reports r
        JOIN issues i ON i.id = r.issue_id
        JOIN categories c ON c.code = r.category_code
        ORDER BY r.created_at, r.id
    """
    with connection.cursor() as cursor:
        cursor.execute(query)
        records = cursor.fetchall()
    missing = [record[0] for record in records if record[0] not in labels]
    if missing:
        raise SystemExit(f"{len(missing)} database reports have no ground-truth label; use a fresh seed database")
    return [Report(record[0], record[1], labels[record[0]], record[2], record[3],
                   float(record[4]), float(record[5]), float(record[6]), record[7],
                   float(record[8]), float(record[9]), record[10]) for record in records]


def write_csv(path, rows):
    if not rows:
        return
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def save_quality_plot(rows, path):
    labels = [row["category"] for row in rows]
    x = range(len(rows))
    width = 0.25
    fig, axis = plt.subplots(figsize=(7.1, 3.5))
    axis.bar([i - width for i in x], [row["precision"] for row in rows], width, label="Precision")
    axis.bar(x, [row["recall"] for row in rows], width, label="Recall")
    axis.bar([i + width for i in x], [row["f1"] for row in rows], width, label="F1")
    axis.set_ylim(0, 1.05)
    axis.set_ylabel("Pairwise score")
    axis.set_xticks(list(x), labels, rotation=55, ha="right")
    axis.legend(ncol=3)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def save_sweep_plot(rows, path):
    fig, axis = plt.subplots(figsize=(7.1, 3.5))
    by_category = defaultdict(list)
    for row in rows:
        by_category[row["category"]].append(row)
    for category, values in sorted(by_category.items()):
        axis.plot([row["radius_m"] for row in values], [row["f1"] for row in values],
                  linewidth=1.1, label=category.replace("_", " ").title())
    axis.set(xlabel="Base merge radius (m)", ylabel="Pairwise F1", ylim=(0, 1.05))
    axis.legend(ncol=2, fontsize=6)
    axis.grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def save_ablation_plot(rows, path):
    fig, axis = plt.subplots(figsize=(5.6, 3.2))
    labels = [f'{row["corpus"]}\n{row["cap"]}' for row in rows]
    axis.bar(labels, [row["f1"] for row in rows], color=["#1677a6", "#e26a2c"] * 2)
    axis.set(ylabel="Pairwise F1", ylim=(0, 1.05), title="Extent-cap ablation")
    for index, row in enumerate(rows):
        axis.text(index, row["f1"] + 0.02, f'{row["f1"]:.3f}', ha="center", fontsize=8)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dsn", default=os.getenv("DATABASE_URL", "postgresql://civictrack:civictrack@localhost:5432/civictrack"))
    parser.add_argument("--labels", type=Path, default=Path("backend/ground_truth_labels.csv"))
    parser.add_argument("--output", type=Path, default=Path("artifacts/evaluation"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    dsn = args.dsn.removeprefix("jdbc:")
    with psycopg.connect(dsn) as connection:
        reports = load_rows(connection, args.labels)

    actual = {row.report_id: row.issue_id for row in reports}
    groups = {"ALL": reports}
    groups.update({category: [row for row in reports if row.category == category]
                   for category in sorted({row.category for row in reports})})
    quality = []
    for category, rows in groups.items():
        quality.append({"category": category, "reports": len(rows), **metrics(rows, actual)})
    write_csv(args.output / "clustering-quality.csv", quality)
    save_quality_plot(quality, args.output / "clustering-quality.pdf")

    sweep = []
    for category, rows in groups.items():
        if category == "ALL":
            continue
        for radius in range(10, 101, 5):
            sweep.append({"category": category, "radius_m": radius,
                          **metrics(rows, replay(rows, radius_override=radius))})
    write_csv(args.output / "radius-sweep.csv", sweep)
    save_sweep_plot(sweep, args.output / "radius-sweep.pdf")

    ablation = []
    for corpus, corpus_rows in (("seeded", reports), ("linear-stress", linear_stress_corpus())):
        for enabled in (True, False):
            ablation.append({"corpus": corpus, "cap": "enabled" if enabled else "disabled",
                             **metrics(corpus_rows, replay(corpus_rows, cap_enabled=enabled))})
    write_csv(args.output / "extent-cap-ablation.csv", ablation)
    save_ablation_plot(ablation, args.output / "extent-cap-ablation.pdf")
    print(f"Wrote {len(quality)} quality rows, {len(sweep)} sweep rows, and the cap ablation to {args.output}")


if __name__ == "__main__":
    main()
