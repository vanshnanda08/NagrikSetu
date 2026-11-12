"""Deterministic scenario plan; every spatial acceptance test uses actual PostGIS wards.

Used by refresh_thapar_dataset.py against its own restored database. Descriptions
are illustrative, never a claim that a real defect exists at the generated pin.
"""
from datetime import datetime, timedelta, timezone
import random
from psycopg.types.json import Jsonb

CATEGORY_COUNTS = dict(POTHOLE=8, ROAD_DAMAGE=5, SIGNAGE=3, STREETLIGHT=6,
                       GARBAGE_DUMP=6, ILLEGAL_DUMPING=4, WATER_LEAK=5,
                       DRAINAGE_BLOCK=5, OPEN_MANHOLE=4, STRAY_ANIMAL=3)
STATUS_COUNTS = dict(NEW=8, ACKNOWLEDGED=5, ASSIGNED=6, IN_PROGRESS=8,
                    PENDING_VERIFICATION=5, RESOLVED=8, REOPENED=3,
                    CLOSED=5, REJECTED=2)
VARIANTS = {
 'POTHOLE':['A localised pothole interrupts the illustrative cycling edge.','A damaged patch holds water in the illustrative road surface.','An uneven depression affects the illustrative crossing approach.'],
 'ROAD_DAMAGE':['The illustrative road edge has broken away beside the walking route.','Loose surfacing and a rough patch interrupt the illustrative approach.','An illustrative raised road seam needs levelling and patching.'],
 'SIGNAGE':['An illustrative direction panel is loose on its support.','A faded illustrative approach sign needs readable markings.','An illustrative sign support leans towards the walking route.'],
 'STREETLIGHT':['An illustrative streetlamp does not light the pedestrian approach.','An illustrative lamp flickers and leaves an unevenly lit route.','An illustrative lighting fixture has a damaged protective cover.'],
 'GARBAGE_DUMP':['An illustrative roadside bin overflows onto the collection corner.','Loose illustrative household waste needs collection from the verge.','The illustrative collection point needs clearing and sweeping.'],
 'ILLEGAL_DUMPING':['Illustrative construction debris obstructs a neighbourhood walking verge.','Illustrative bulky waste blocks part of an approach route.','An illustrative pile of discarded material needs removal from the roadside.'],
 'WATER_LEAK':['An illustrative supply joint leaks beside the kerb.','An illustrative valve area has a persistent surface-water trickle.','An illustrative pipe leak leaves standing water on the walking approach.'],
 'DRAINAGE_BLOCK':['Silt obstructs the illustrated roadside grate.','Leaves and litter block the illustrative drain inlet.','An illustrative drainage outlet needs cleaning to restore a flow path.'],
 'OPEN_MANHOLE':['An illustrative inspection cover is missing and needs a safety barrier.','An illustrative chamber cover is misaligned beside the pedestrian route.','An illustrative cracked chamber cover needs safe replacement.'],
 'STRAY_ANIMAL':['An illustrative injured animal needs a humane welfare assessment.','An illustrative animal-welfare concern affects a campus approach.','An illustrative neighbourhood animal needs assessment and appropriate referral.']}


def build(conn, anchor, seed=731109):
    rng = random.Random(seed)
    cats = {r[0]: dict(radius=r[1], sla=r[2], cap=float(r[3]), low=r[4]) for r in conn.execute(
        'SELECT code,merge_radius_m,default_sla_hours,max_extent_multiplier,low_conf_action FROM categories WHERE active ORDER BY code')}
    if set(cats) != set(CATEGORY_COUNTS):
        raise ValueError('Review the plan for the actual active category set before generating')
    conn.execute('CREATE TEMP TABLE dataset_plan_roots(k text,category text,p geometry(Point,4326))')
    special = [('cap-parent','POTHOLE',1,'NEW'), ('cap-child','POTHOLE',1,'NEW'),
               ('merge-target','OPEN_MANHOLE',1,'IN_PROGRESS'), ('merge-source','OPEN_MANHOLE',1,'REJECTED'),
               ('split-original','ROAD_DAMAGE',2,'ACKNOWLEDGED'),
               ('review-low','STREETLIGHT',2,'ACKNOWLEDGED'),
               ('confirmed-low','DRAINAGE_BLOCK',2,'IN_PROGRESS')]
    remaining_categories = dict(CATEGORY_COUNTS)
    sizes = [1]*28 + [2]*11 + [4]*10
    states = dict(STATUS_COUNTS); states['NEW'] -= 1  # split-created ticket
    groups=[]
    for key,category,size,status in special:
        groups.append(dict(key=key,category=category,size=size,status=status,kind=key))
        remaining_categories[category]-=1; sizes.remove(size); states[status]-=1
    labels=[c for c,n in remaining_categories.items() for _ in range(n)]
    statuses=[x for x,n in states.items() for _ in range(n)]
    rng.shuffle(labels);rng.shuffle(sizes);rng.shuffle(statuses)
    for i,(category,size,status) in enumerate(zip(labels,sizes,statuses)):
        groups.append(dict(key='problem-%02d'%(i+1),category=category,size=size,status=status,kind='ordinary'))
    assert len(groups)==49 and sum(g['size'] for g in groups)==90
    bykey={g['key']:g for g in groups}
    def point(lat,lng,distance,bearing):
        return conn.execute('SELECT ST_Y(p::geometry),ST_X(p::geometry) FROM (SELECT ST_Project(ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography,%s,%s) p) x',(lng,lat,distance,bearing)).fetchone()
    def ward(lat,lng):
        rows=conn.execute('SELECT id FROM wards WHERE ST_Covers(boundary,ST_SetSRID(ST_MakePoint(%s,%s),4326))',(lng,lat)).fetchall()
        return str(rows[0][0]) if len(rows)==1 else None
    def acceptable(g,lat,lng,ignore=None):
        radius=cats[g['category']]['radius'];minimum=max(230,3.5*radius+100)
        return ward(lat,lng) and not conn.execute('SELECT EXISTS(SELECT 1 FROM dataset_plan_roots WHERE category=%s AND k<>%s AND ST_DWithin(p::geography,ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography,%s))',(g['category'],ignore or '',lng,lat,minimum)).fetchone()[0] and not conn.execute("SELECT EXISTS(SELECT 1 FROM issues i WHERE category_code=%s AND NOT EXISTS(SELECT 1 FROM reports r WHERE r.issue_id=i.id AND r.device_id LIKE ANY(%s) AND (r.description LIKE %s OR r.description LIKE %s)) AND NOT(i.merged_into_id IS NOT NULL AND i.rejected_reason LIKE %s) AND ST_DWithin(centroid::geography,ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography,%s))",(g['category'],['thapar-demo-v1-%','thapar-demo-v2-r%'],'[SAMPLE DATA]%','[THAPAR DEMO V2] %','%[THAPAR DEMO V2]%',lng,lat,minimum)).fetchone()[0]
    for g in groups:
        if g['key'] in ('cap-child','merge-source'):
            parent=bykey['cap-parent' if g['key']=='cap-child' else 'merge-target']
            if g['key']=='cap-child':
                radius=cats[g['category']]['radius'];cap=radius*cats[g['category']]['cap']
                fraction=(1/3**2)/(1/3**2+1/50**2);minimum=cap/fraction;effective=radius+1.5+25
                if minimum>=effective:raise ValueError('Configured radius/extent needs a reviewed multi-report cap scenario')
                distance=minimum+(effective-minimum)*.55
            else:distance=(cats[g['category']]['radius']+8)*1.25
            for _ in range(300):
                lat,lng=point(parent['lat'],parent['lng'],distance,rng.uniform(0,6.28318530718))
                if acceptable(g,lat,lng,parent['key']) and ward(lat,lng)==parent['wardId']:break
            else:raise ValueError('No valid related scenario point')
        else:
            for _ in range(10000):
                if rng.random()<.34:
                    # Small irregular concentrations around three illustrative campus approaches.
                    direction,dist=rng.choice([(0.6,680),(2.1,900),(4.25,1100)])
                    la,ln=point(30.355833,76.365,dist,direction)
                    lat,lng=point(la,ln,min(650,abs(rng.gauss(0,240))),rng.uniform(0,6.28318530718))
                else:lat,lng=point(30.355833,76.365,2900*rng.random()**.5,rng.uniform(0,6.28318530718))
                if acceptable(g,lat,lng):break
            else:raise ValueError('Could not place an independent complaint')
        g.update(lat=lat,lng=lng,wardId=ward(lat,lng))
        conn.execute('INSERT INTO dataset_plan_roots VALUES(%s,%s,ST_SetSRID(ST_MakePoint(%s,%s),4326))',(g['key'],g['category'],lng,lat))
    events=[]; report_index=0; closed_index=0;resolved_index=0
    def stamp(t):return t.astimezone(timezone.utc).isoformat().replace('+00:00','Z')
    def event(t,kind,g,**kw):events.append(dict(at=stamp(t),kind=kind,group=g['key'],**kw))
    for g in groups:
        status=g['status'];age=rng.uniform(.4,18)
        if status=='NEW':age=rng.choice([.06,.18,.45,2.3,19.7,43.2])+rng.uniform(0,.15)
        if status=='ACKNOWLEDGED':age=rng.uniform(1.1,22)
        if status in ('ASSIGNED','IN_PROGRESS'):age=rng.uniform(1.2,38)
        if status=='PENDING_VERIFICATION':age=rng.uniform(3,42)
        if status=='REOPENED':age=rng.uniform(7,48)
        if status=='RESOLVED':age=rng.uniform(8,65)
        if status in ('CLOSED','REJECTED'):age=rng.uniform(22,86)
        g['first']=anchor-timedelta(days=age)
    # Precisely related intake times are scenarios, not regular spatial offsets.
    bykey['cap-parent']['first']=anchor-timedelta(hours=4.8)
    bykey['cap-child']['first']=bykey['cap-parent']['first']+timedelta(minutes=17)
    bykey['merge-source']['first']=bykey['merge-target']['first']+timedelta(minutes=13)
    bykey['split-original']['first']=anchor-timedelta(hours=11.3)
    bykey['review-low']['first']=anchor-timedelta(days=2.4)
    bykey['confirmed-low']['first']=anchor-timedelta(days=8.7)
    # At least one genuine 90-day historical example; all remain synthetic.
    next(g for g in groups if g['status']=='CLOSED')['first']=anchor-timedelta(days=89.25)
    fast=[g for g in groups if g['status']=='RESOLVED'][1:]
    for g in [x for x in fast if cats[x['category']]['sla']>=48][:2]:
        g['fast']=True;g['first']=anchor-timedelta(days=rng.uniform(1.2,2.5))
    for g in groups:
        cat=g['category'];status=g['status'];first=g['first'];g['reports']=[]
        region=('north' if g['lat']>=30.355833 else 'south')+('-west' if g['lng']<76.365 else '-east')
        g['detail']=random.Random(str(seed)+':'+g['key']+':text').choice(VARIANTS[cat])
        g['neighbourhood']='Illustrative '+region+' Patiala streets near Thapar Institute'
        if status=='RESOLVED':resolved_index+=1;g['settlement']='timeout' if resolved_index==1 else 'confirmed'
        elif status=='CLOSED':closed_index+=1;g['settlement']='auto' if closed_index<=2 else 'confirmed-admin' if closed_index==3 else 'administrative'
        else:g['settlement']='none'
        for j in range(g['size']):
            report_index+=1;lat,lng=g['lat'],g['lng'];accuracy=rng.uniform(5,18);manual=rng.random()<.17
            if j:
                for _ in range(100):
                    distance=min(13,abs(rng.gauss(0,6)));bearing=rng.uniform(0,6.28318530718)
                    if g['kind'] in ('review-low','confirmed-low'):distance=cats[cat]['radius']+17;accuracy=8;manual=False
                    lat,lng=point(g['lat'],g['lng'],distance,bearing)
                    if ward(lat,lng)==g['wardId']:break
                else:raise ValueError('Report jitter crossed ward')
            if g['kind'] in ('review-low','confirmed-low','merge-target','merge-source'):accuracy=8;manual=False
            if g['kind']=='cap-parent':accuracy=50;manual=False
            if g['kind']=='cap-child':accuracy=3;manual=False
            if manual:accuracy=10
            reporter=(report_index+j)%12
            if (j>0 and rng.random()<.30) or (j==0 and status in ('NEW','ACKNOWLEDGED','ASSIGNED','REJECTED') and rng.random()<.4) or g['settlement']=='timeout':reporter=None
            if g['size']==4 and j<2 and g['settlement']!='timeout' and status in ('PENDING_VERIFICATION','RESOLVED','REOPENED','CLOSED'):reporter=(report_index+j)%12
            time=first+timedelta(minutes=0 if j==0 else j*rng.uniform(7,19))
            row=dict(index=report_index,photo='report-%03d'%report_index,lat=lat,lng=lng,accuracy=accuracy,manual=manual,reporter=reporter,at=stamp(time))
            row['narrative']=random.Random(str(seed)+':report:'+str(report_index)).choice(['This synthetic observation describes the localised condition at the illustrative pin.','This diagram illustrates the affected approach from a second viewing direction.','This synthetic observation records the same nearby concern, without claiming a real incident.','The illustrative concern affects the verge beside the sample walking route.'])
            g['reports'].append(row);event(time,'INGEST',g,report=row)
        last=max(datetime.fromisoformat(x['at'].replace('Z','+00:00')) for x in g['reports'])
        g['last']=last
        if g['kind']=='merge-source':continue
        if g['kind']=='split-original':event(last+timedelta(minutes=65),'SPLIT',g,createdGroup='split-created',reportIndex=g['reports'][-1]['index'])
        if g['kind']=='merge-target':event(bykey['merge-source']['first']+timedelta(hours=1.4),'MERGE',g,sourceGroup='merge-source')
        if g['kind']=='confirmed-low':event(last+timedelta(minutes=80),'CONFIRM',g)
        if rng.random()<.30:event(last+timedelta(minutes=10),'FOLLOW',g,reporter=((g['reports'][0]['reporter'] or 0)+5)%12)
        if status=='NEW':
            g['escalate']=(anchor-first).total_seconds()>cats[cat]['sla']*3600*3.5
            continue
        if status=='REJECTED':event(last+timedelta(hours=3.4),'REJECT',g);continue
        phase=anchor-timedelta(hours=rng.uniform(4,18))
        if status=='ACKNOWLEDGED' and g['kind']=='split-original':phase=last+timedelta(hours=2)
        if status=='PENDING_VERIFICATION':phase=anchor-timedelta(hours=rng.uniform(18,32))
        if status=='REOPENED':phase=anchor-timedelta(days=rng.uniform(1.4,2.6))
        if status=='RESOLVED':phase=anchor-timedelta(days=rng.uniform(3.9,5.8) if g['settlement']=='timeout' else rng.uniform(.8,5.9))
        if status=='CLOSED':phase=first+timedelta(hours=rng.uniform(8,72))
        if g.get('fast'):phase=first+timedelta(hours=1.25)
        phase=max(phase,last+timedelta(hours=2));g['phase']=phase
        # Old backlog escalates through the real ladder before the crew receives it.
        g['escalate']= (phase-first).total_seconds()>cats[cat]['sla']*3600*3.5 and g['kind']!='merge-source'
        event(phase,'ACK',g)
        if status=='ACKNOWLEDGED':continue
        event(phase+timedelta(minutes=15),'ASSIGN',g)
        if status=='ASSIGNED':continue
        if g['settlement']=='administrative':event(phase+timedelta(hours=4),'ADMIN_CLOSE',g);continue
        event(phase+timedelta(minutes=40),'START',g)
        if status=='IN_PROGRESS':
            if g['reports'][0]['reporter'] is not None:
                event(phase+timedelta(hours=1),'QUESTION',g);event(phase+timedelta(hours=2),'REPLY',g,reporter=g['reports'][0]['reporter'])
            continue
        proof_at=phase+timedelta(hours=3.1);event(proof_at,'PROOF',g,photo='proof-'+g['key'])
        if status=='PENDING_VERIFICATION':continue
        if status=='REOPENED':event(proof_at+timedelta(hours=4.6),'NOT_FIXED',g);continue
        settled=proof_at+timedelta(hours=72.15 if g['settlement']=='timeout' else 2.4)
        if g['settlement']=='timeout':event(settled,'TIMEOUT',g)
        else:event(settled,'FIXED',g)
        if status=='CLOSED':event(settled+timedelta(days=7.01 if g['settlement']=='auto' else .3),'AUTO_CLOSE' if g['settlement']=='auto' else 'ADMIN_CLOSE',g)
    # A pending four-report issue has one legitimate vote, short of its quorum.
    partial=next((g for g in groups if g['status']=='PENDING_VERIFICATION' and g['size']==4),None)
    if partial:
        proof=next(e for e in events if e['group']==partial['key'] and e['kind']=='PROOF');event(datetime.fromisoformat(proof['at'].replace('Z','+00:00'))+timedelta(hours=1),'PARTIAL_FIXED',partial)
    # Keep all events at/before the reference time; abort rather than falsify status.
    assert all(datetime.fromisoformat(e['at'].replace('Z','+00:00'))<=anchor for e in events)
    for g in groups:
        for k in ['first','last','phase']:
            if k in g:g[k]=stamp(g[k])
    events.sort(key=lambda e:(e['at'],0 if e['kind']=='INGEST' else 1,e['group'],e['kind']))
    return dict(version='thapar-demo-v2',seed=seed,anchor=stamp(anchor),groups=groups,events=events,
                targetIssues=50,targetReports=90,statusTargets=STATUS_COUNTS,
                categoryTargets={**CATEGORY_COUNTS,'ROAD_DAMAGE':6},
                note='Synthetic demonstration only; illustrative locations and evidence, no municipal action required.')
