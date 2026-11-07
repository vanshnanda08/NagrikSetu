#!/usr/bin/env python3
"""Independently recount saved pair assignments without changing app data."""
import csv
import hashlib
import json
from collections import defaultdict
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT/'artifacts/evaluation'
groups = defaultdict(list)
with (SOURCE/'production-predictions.csv').open() as f:
    for row in csv.DictReader(f):
        groups[(row['variant'],row['corpus'])].append(row)
out={}
for (variant,corpus),rows in groups.items():
    tp=fp=fn=0
    for a,b in combinations(rows,2):
        same_truth=a['truth']==b['truth']
        same_issue=a['predicted']==b['predicted']
        tp+=same_truth and same_issue
        fp+=not same_truth and same_issue
        fn+=same_truth and not same_issue
    precision=tp/(tp+fp) if tp+fp else 1.
    recall=tp/(tp+fn) if tp+fn else 1.
    f1=2*precision*recall/(precision+recall) if precision+recall else 0.
    out[variant]={'corpus':corpus,'reports':len(rows),'tp':tp,'fp':fp,'fn':fn,
                  'precision':precision,'recall':recall,'f1':f1}
with (SOURCE/'production-quality.csv').open() as f:
    for row in csv.DictReader(f):
        if row['category']!='ALL': continue
        calc=out[row['variant']]
        for k in ['tp','fp','fn','reports']: assert calc[k]==int(row[k]),(row['variant'],k)
        for k in ['precision','recall','f1']: assert abs(calc[k]-float(row[k]))<1e-12,(row['variant'],k)
assert (out['baseline']['reports'],out['baseline']['tp'],out['baseline']['fp'],out['baseline']['fn'])==(250,541,0,144)
with (SOURCE/'concurrency-correctness.csv').open() as f:
    concurrency=list(csv.DictReader(f))
assert [int(r['simultaneous_reports']) for r in concurrency]==[2,5,10,20,50]
assert all(int(r['issues_created_or_selected'])==1 for r in concurrency)
with (SOURCE/'ingest-latency.csv').open() as f: http=list(csv.DictReader(f))
assert all(int(r['requests'])==500 and float(r['failure_rate'])==0 for r in http)
with (SOURCE/'production-server-latency.csv').open() as f: service=list(csv.DictReader(f))
assert all(int(r['requests'])==300 for r in service)
files=['production-predictions.csv','production-quality.csv','clustering-quality.csv',
       'extent-cap-ablation.csv','ingest-latency.csv','production-server-latency.csv',
       'concurrency-correctness.csv']
report={'kind':'Independent recount of retained artifacts; no new benchmark run',
        'pairwise':out,'http_latency':http,'direct_service_latency':service,
        'concurrency':concurrency,
        'sha256':{name:hashlib.sha256((SOURCE/name).read_bytes()).hexdigest() for name in files}}
dest=Path(__file__).resolve().parent/'evidence'/'verification.json'
dest.parent.mkdir(exist_ok=True)
dest.write_text(json.dumps(report,indent=2)+'\n')
print(f'PASS: {len(out)} variants independently recounted; all saved global summaries agree.')
print('PASS: HTTP/service sample sizes and five concurrency cohorts match manuscript.')
