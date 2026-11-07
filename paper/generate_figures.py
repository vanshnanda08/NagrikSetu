#!/usr/bin/env python3
"""Rebuild original vector diagrams and plots from repository evidence."""
import csv
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / 'artifacts' / 'evaluation'
OUT = HERE / 'figures'
OUT.mkdir(exist_ok=True)
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 8,
                     'pdf.fonttype': 42, 'ps.fonttype': 42,
                     'axes.spines.top': False, 'axes.spines.right': False})
INK, BLUE, PALE, GRAY = '#20272d', '#17486b', '#eef4f7', '#f3f3f3'

def canvas(width, height, xmax, ymax):
    fig, ax = plt.subplots(figsize=(width, height))
    fig.subplots_adjust(left=.01, right=.99, top=.99, bottom=.01)
    ax.set(xlim=(0, xmax), ylim=(0, ymax)); ax.axis('off')
    return fig, ax

def box(ax, x, y, w, h, title, body='', size=8, fill=PALE):
    ax.add_patch(FancyBboxPatch((x,y),w,h,boxstyle='round,pad=0.02,rounding_size=0.07',
                               facecolor=fill, edgecolor=INK, linewidth=.8))
    if body:
        ax.text(x+w/2,y+h*.76,title,ha='center',va='center',fontsize=size,fontweight='bold',color=INK)
        ax.text(x+w/2,y+h*.35,body,ha='center',va='center',fontsize=size-0.4,color=INK,linespacing=1.45)
    else:
        ax.text(x+w/2,y+h/2,title,ha='center',va='center',fontsize=size,color=INK,linespacing=1.3)

def arrow(ax, points, label=None, label_at=None, size=7, dashed=False):
    for p,q in zip(points[:-2],points[1:-1]):
        ax.plot([p[0],q[0]],[p[1],q[1]],color=INK,lw=.8,ls='--' if dashed else '-')
    ax.add_patch(FancyArrowPatch(points[-2],points[-1],arrowstyle='-|>',
                                mutation_scale=8,linewidth=.8,color=INK,
                                linestyle='--' if dashed else '-'))
    if label:
        x,y=label_at if label_at else ((points[0][0]+points[-1][0])/2,(points[0][1]+points[-1][1])/2)
        ax.text(x,y,label,ha='center',va='center',fontsize=size,color=INK,
                bbox=dict(facecolor='white',edgecolor='none',pad=1.2),linespacing=1.3)

def save(fig,name):
    fig.savefig(OUT/name,format='pdf'); plt.close(fig)

# Full-width architecture: readable at native IEEE text width.
fig, ax = canvas(7.1, 2.85, 14.2, 5.7)
box(ax,.15,3.25,3.15,2.05,'Browser client','Next.js / React\nReports, queues, analytics\nIndexedDB + service worker',7.8)
box(ax,.15,.3,3.15,1.5,'Next.js route handlers','HttpOnly refresh cookie\nAuth / offline-report proxy',7.7)
box(ax,5.0,3.5,4.15,1.8,'Spring Boot API','Validation / media verification\nScoped authorization / REST / SSE',8.3)
box(ax,4.2,.3,5.7,1.8,'Transactional application modules','Submission + clustering + lifecycle\nVerification / moderation / notifications\nSLA and verification sweeps',8.1)
box(ax,11.25,.3,2.75,1.8,'PostgreSQL + PostGIS','Issues, reports, history\nSpatial indexes / locks',7.3)
box(ax,11.25,3.7,2.75,1.4,'Cloudinary','Hosted image evidence',8.1,GRAY)
arrow(ax,[(3.3,4.3),(5,4.3)],'REST / SSE',(4.15,4.55))
arrow(ax,[(1.7,3.25),(1.7,1.8)],'Auth / retry',(1.7,2.52))
arrow(ax,[(3.3,1.05),(3.7,1.05),(3.7,2.75),(5.5,2.75),(5.5,3.5)])
arrow(ax,[(7.05,3.5),(7.05,2.1)],'Open transaction',(8.05,2.8))
arrow(ax,[(9.9,1.2),(11.25,1.2)],'SQL',(10.58,1.45))
arrow(ax,[(9.15,4.4),(11.25,4.4)],'Verify photo',(10.2,4.65))
arrow(ax,[(2.45,5.3),(2.45,5.55),(12.65,5.55),(12.65,5.1)],'Direct upload',(8,5.55))
arrow(ax,[(8.95,2.1),(8.95,3.5)],'After-commit\nSSE invalidation',(10.6,2.8),dashed=True)
save(fig,'architecture.pdf')

# Compact lifecycle workflow: important permissions are in the caption/text.
fig, ax = canvas(3.45, 3.5, 7, 7.1)
rows=[(6.35,'NEW → ACKNOWLEDGED'),(5.25,'ASSIGNED → IN_PROGRESS'),
      (4.05,'PENDING_VERIFICATION'),(1.55,'RESOLVED'),(.35,'CLOSED')]
for y,title in rows: box(ax,1.35,y,4.2,.65,title,size=8)
arrow(ax,[(3.45,6.35),(3.45,5.9)],'Supervisor assigns',(3.45,6.12),6.8)
arrow(ax,[(3.45,5.25),(3.45,4.7)],'Proof photo + repair note',(3.45,4.98),6.8)
box(ax,1.35,2.8,4.2,.65,'Citizen votes / 72 h timeout',size=8,fill=GRAY)
arrow(ax,[(3.45,4.05),(3.45,3.45)],'SLA clock paused',(3.45,3.74),6.8)
arrow(ax,[(3.45,2.8),(3.45,2.2)],'Confirmation / timeout policy',(3.45,2.5),6.6)
arrow(ax,[(3.45,1.55),(3.45,1)],'7 days without recurrence',(3.45,1.27),6.7)
arrow(ax,[(1.35,3.12),(.5,3.12),(.5,5.57),(1.35,5.57)])
ax.text(.48,4.2,'REOPENED\n(rejection)',ha='center',va='center',fontsize=6.7,rotation=90,
        bbox=dict(facecolor='white',edgecolor='none',pad=1))
arrow(ax,[(5.55,1.87),(6.5,1.87),(6.5,5.57),(5.55,5.57)])
ax.text(6.48,3.75,'Recurrence in category window',ha='center',va='center',fontsize=6.7,rotation=90,
        bbox=dict(facecolor='white',edgecolor='none',pad=1))
save(fig,'workflow.pdf')

# Schema with core FK paths; avoid false implication that a verification is a report.
fig, ax = canvas(3.45, 3.3, 7, 6.65)
box(ax,.15,5.45,2.6,.95,'departments','id / parent_id',7.8)
box(ax,4.25,5.45,2.6,.95,'categories','code / radius / SLA',7.8)
box(ax,.15,3.6,2.6,.95,'wards','id / boundary',7.8)
box(ax,4.25,3.4,2.6,1.3,'issues','id / public_ref / status\ncentroid / sums\ndeadline / round',7.3)
box(ax,.15,1.7,2.6,.95,'users','id / role / scope',7.8)
box(ax,4.25,1.7,2.6,.95,'reports','id / issue_id / location',7.8)
box(ax,.15,.05,2.6,.95,'verifications','issue / round / citizen',7.8)
box(ax,4.25,.05,2.6,.95,'history / moderation','issue / actor / reason',7.0)
arrow(ax,[(2.75,5.93),(4.25,5.93)],'1:N',(3.5,6.1))
arrow(ax,[(5.55,5.45),(5.55,4.7)],'1:N',(5.85,5.1))
arrow(ax,[(2.75,4.08),(4.25,4.08)],'1:N',(3.5,4.3))
arrow(ax,[(5.55,3.4),(5.55,2.65)],'1:N',(5.85,3.03))
arrow(ax,[(2.75,2.17),(4.25,2.17)],'1:N',(3.5,2.4))
arrow(ax,[(1.45,1.7),(1.45,1)],'1:N',(1.75,1.36))
arrow(ax,[(4.25,3.65),(3.3,3.65),(3.3,.53),(2.75,.53)])
ax.text(3.32,1.5,'1:N',ha='center',fontsize=7,bbox=dict(facecolor='white',edgecolor='none',pad=1))
arrow(ax,[(6.85,3.9),(6.98,3.9),(6.98,.53),(6.85,.53)])
ax.text(6.85,1.2,'1:N',ha='center',fontsize=6.8,bbox=dict(facecolor='white',edgecolor='none',pad=1))
save(fig,'schema.pdf')

with (DATA/'production-quality.csv').open() as f:
    sweep=[r for r in csv.DictReader(f) if r['variant'].startswith('radius-') and r['category']=='ALL']
sweep.sort(key=lambda r:int(r['radius_m']))
with (DATA/'production-server-latency.csv').open() as f: latency=list(csv.DictReader(f))
fig, axes = plt.subplots(1,2,figsize=(7.1,2.5))
for field,label,style in [('precision','Precision','--'),('recall','Recall',':'),('f1','F1','-')]:
    axes[0].plot([int(r['radius_m']) for r in sweep],[float(r[field]) for r in sweep],
                 style,label=label,lw=1.2,marker='o' if field=='f1' else None,markersize=2)
axes[0].set(xlabel='Common category radius (m)',ylabel='Pairwise score',ylim=(0,1.06),xlim=(8,102))
axes[0].set_title('(a) Radius sensitivity',fontsize=8.5)
axes[0].legend(fontsize=6.8,frameon=False,loc='lower right')
for field,label,style,marker in [('p50_ms','p50','-','o'),('p95_ms','p95','--','s'),('p99_ms','p99',':','^')]:
    axes[1].plot([int(r['scale']) for r in latency],[float(r[field]) for r in latency],
                 style,label=label,lw=1.2,marker=marker,markersize=3)
axes[1].set(xscale='log',xlabel='Existing open issues',ylabel='Direct-service latency (ms)',ylim=(0,30))
axes[1].set_xticks([1000,10000,50000],['1k','10k','50k'])
axes[1].set_title('(b) Service timing boundary',fontsize=8.5)
axes[1].legend(fontsize=6.8,frameon=False,loc='upper left')
for ax in axes: ax.grid(alpha=.2); ax.tick_params(labelsize=7)
fig.tight_layout(w_pad=1.6)
save(fig,'results.pdf')
print('Generated four original vector figures from code and retained CSV evidence.')
