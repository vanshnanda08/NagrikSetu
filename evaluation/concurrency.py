#!/usr/bin/env python3
"""Drive N simultaneous identical reports and emit CSV plus a vector PDF."""

import argparse
import concurrent.futures
import csv
import json
import time
import urllib.request
import uuid
from pathlib import Path

import matplotlib.pyplot as plt


def post(url, body):
    request = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8080/api/v1")
    parser.add_argument("--output", type=Path, default=Path("artifacts/evaluation"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    # Repeated runs against one scratch database must not collide with the
    # production duplicate guard's device history.
    run_id = uuid.uuid4().hex[:12]
    rows = []
    for index, count in enumerate((2, 5, 10, 20, 50)):
        lat, lng = 30.925 + index * 0.006, 75.82
        started = time.perf_counter()
        bodies = [{"categoryCode": "SIGNAGE", "lat": lat, "lng": lng, "accuracyM": 5,
                   "manualPin": False, "description": "Concurrency evaluation",
                   "photoUrl": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
                   "photoHash": f"{index * 1000 + item:016x}",
                   "deviceId": f"eval-{run_id}-{index}-{item}"}
                  for item in range(count)]
        with concurrent.futures.ThreadPoolExecutor(max_workers=count) as executor:
            results = list(executor.map(lambda body: post(args.api + "/reports", body), bodies))
        issue_count = len({result["issueId"] for result in results})
        rows.append({"simultaneous_reports": count, "issues_created_or_selected": issue_count,
                     "correct": issue_count == 1,
                     "elapsed_ms": round((time.perf_counter() - started) * 1000, 1)})

    with (args.output / "concurrency-correctness.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader(); writer.writerows(rows)
    fig, axis = plt.subplots(figsize=(4.8, 3.2))
    axis.plot([row["simultaneous_reports"] for row in rows],
              [row["issues_created_or_selected"] for row in rows], marker="o")
    axis.axhline(1, color="#e26a2c", linestyle="--", label="required")
    axis.set(xlabel="Simultaneous reports", ylabel="Distinct issue IDs", ylim=(0, max(2, max(row["issues_created_or_selected"] for row in rows) + 1)))
    axis.legend(); axis.grid(alpha=0.25); fig.tight_layout()
    fig.savefig(args.output / "concurrency-correctness.pdf")
    print(rows)


if __name__ == "__main__":
    main()
