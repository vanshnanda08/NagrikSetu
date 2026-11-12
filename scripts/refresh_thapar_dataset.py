#!/usr/bin/env python3
"""Build/validate in owned clones, then atomically import just synthetic demo rows.

Requires psycopg 3 in a private tool environment; no application dependencies are
changed. See docs/THAPAR_DATASET.md. Never runs the old general seed on production.
"""
import argparse, contextlib, datetime, gzip, hashlib, json, os, secrets, shlex, subprocess, sys, time, uuid
from pathlib import Path
import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb
from urllib.parse import urlsplit, parse_qs

ROOT=Path(__file__).resolve().parents[1]
TABLES=['users','issues','reports','issue_status_history','escalation_events','verifications',
        'moderation_actions','notifications','issue_followers','issue_messages','report_submissions']
DEPENDENTS=TABLES[3:-1]
SERIAL=set(DEPENDENTS)-{'issue_followers'}
LOCKED=['issues','reports']+DEPENDENTS+['report_submissions']

def private_values(path):
    values={}
    for line in path.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k,v=line.split('=',1);parts=shlex.split(v);values[k.removeprefix('export ').strip()]=parts[0] if parts else ''
    return values

def target_connection(env_file):
    values=private_values(env_file);u=urlsplit(values['DATABASE_URL'].removeprefix('jdbc:'));options=parse_qs(u.query)
    return psycopg.connect(host=u.hostname,port=u.port or 5432,dbname=u.path.lstrip('/'),user=values['DATABASE_USER'],password=values['DATABASE_PASSWORD'],sslmode=options.get('sslmode',['require'])[0],connect_timeout=25)

def validate_asset_catalogue(plan,manifest):
    groups={g['key']:g for g in plan['groups']}
    expected={r['photo']:(g['category'],False) for g in plan['groups'] for r in g['reports']}
    expected.update({e['photo']:(groups[e['group']]['category'],True) for e in plan['events'] if e['kind']=='PROOF'})
    if set(expected)!=set(manifest.get('assets',{})):raise RuntimeError('Review the asset catalogue for the exact planned observations and repairs')
    for key,(category,repair) in expected.items():
        asset=manifest['assets'][key]
        if asset.get('category')!=category or asset.get('repair')!=repair or asset.get('synthetic') is not True:raise RuntimeError('Asset catalogue belongs to different scenarios/seed; review rather than reuse a misleading illustration')
        if not asset['url'].startswith('https://res.cloudinary.com/'+manifest['cloud']+'/image/upload/') or not asset['publicId'].startswith('nagriksetu_thapar_demo_v2_'):raise RuntimeError('Only the owned synthetic evidence catalogue is accepted')


def source_fingerprint():
    digest=hashlib.sha256()
    for p in sorted([ROOT/'backend/pom.xml']+list((ROOT/'backend/src').rglob('*'))):
        if p.is_file():digest.update(str(p.relative_to(ROOT)).encode());digest.update(p.read_bytes())
    return digest.hexdigest()


def prepare_workspace(args):
    import tempfile, shutil
    from thapar_dataset_plan import build
    state_file=args.state.resolve();out=state_file.parent
    if state_file.exists():raise RuntimeError('Workspace already exists; use its build/repeat commands')
    out.mkdir(parents=True,exist_ok=True);out.chmod(0o700)
    private=Path(tempfile.mkdtemp(prefix='nagriksetu-thapar-dataset-'));private.chmod(0o700)
    backup=args.backup.resolve() if args.backup else None
    if backup is None:
        directory=ROOT/'backups'/('thapar-dataset-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'))
        directory.mkdir(parents=True,mode=0o700);env=os.environ.copy();env.update({k:v for k,v in private_values(args.env_file).items() if k in ('DATABASE_URL','DATABASE_USER','DATABASE_PASSWORD')})
        with open(out/'backup.log','w') as log:subprocess.run(['bash',str(ROOT/'scripts/backup.sh'),str(directory)],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
        backup=next(directory.glob('*.dump.gz'))
    with gzip.open(backup,'rb') as f:archive=f.read()
    if archive[:5]!=b'PGDMP':raise RuntimeError('A PostgreSQL custom-format backup is required')
    name='nagriksetu-thapar-realistic-'+private.name.rsplit('-',1)[-1]
    password=secrets.token_urlsafe(24);env=os.environ.copy();env['POSTGRES_PASSWORD']=password
    container=subprocess.check_output(['docker','run','-d','--name',name,'-p','127.0.0.1::5432','-e','POSTGRES_USER=dataset','-e','POSTGRES_DB=source','-e','POSTGRES_PASSWORD','postgis/postgis:17-3.4'],env=env,text=True).strip()
    port=int(subprocess.check_output(['docker','port',name,'5432/tcp'],text=True).strip().rsplit(':',1)[-1])
    state={'private_dir':str(private),'artifact':str(out),'backup':str(backup),'container':name,'container_id':container,'db_port':port}
    state_file.write_text(json.dumps(state,indent=2));(private/'database.json').write_text(json.dumps({'user':'dataset','password':password,'port':port}));(private/'database.json').chmod(0o600)
    for _ in range(90):
        try:c=psycopg.connect(host='127.0.0.1',port=port,dbname='source',user='dataset',password=password,autocommit=True);break
        except psycopg.OperationalError:time.sleep(1)
    else:raise RuntimeError('Owned PostGIS did not start; see workspace state for safe cleanup')
    for extension in ['postgis','pgcrypto','btree_gist']:c.execute(sql.SQL('CREATE EXTENSION IF NOT EXISTS {}').format(sql.Identifier(extension)))
    c.close()
    listing=subprocess.run(['docker','exec','-i',name,'pg_restore','--list'],input=archive,capture_output=True,check=True).stdout.decode()
    listing='\n'.join(x for x in listing.splitlines() if ' SCHEMA - public ' not in x)+'\n'
    subprocess.run(['docker','exec','-i',name,'sh','-c','cat > /tmp/restore.list'],input=listing.encode(),check=True)
    restored=subprocess.run(['docker','exec','-i',name,'pg_restore','-U','dataset','-d','source','--no-owner','--no-acl','--exit-on-error','--use-list=/tmp/restore.list'],input=archive,capture_output=True)
    (out/'restore.log').write_bytes(restored.stdout+restored.stderr)
    if restored.returncode:raise RuntimeError('Backup restore failed; production has not been changed')
    anchor=datetime.datetime.fromisoformat(args.anchor.replace('Z','+00:00')) if args.anchor else datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
    if anchor.tzinfo is None or anchor>datetime.datetime.now(datetime.timezone.utc):raise RuntimeError('Use an explicit UTC reference time at or before now')
    job=Refresh(state_file)
    with job.connect('source') as c:plan=build(c,anchor,args.seed);c.rollback()
    (out/'plan.json').write_text(json.dumps(plan,indent=2));state.update(anchor=plan['anchor'],seed=args.seed,backupRestored=True,build_jar=str(private/'backend-build/target/civictrack-backend-0.1.0-SNAPSHOT.jar'))
    values=private_values(ROOT/'frontend/.env.local') if (ROOT/'frontend/.env.local').exists() else os.environ
    cloud=values.get('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME');preset=values.get('NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET')
    if not cloud or not preset:raise RuntimeError('Configure the actual application photo cloud/preset; placeholders are never used')
    credentials=ROOT/'backups/thapar-demo-v2-citizens.json'
    credential_data=json.loads(credentials.read_text()) if credentials.exists() else {'password':secrets.token_urlsafe(26)}
    config={'cloud':cloud,'preset':preset,'citizen_password':credential_data['password']}
    (private/'generation-private.json').write_text(json.dumps(config));(private/'generation-private.json').chmod(0o600);state_file.write_text(json.dumps(state,indent=2))
    manifest_path=ROOT/'scripts/data/thapar-demo-v2-assets.json';manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    keys={r['photo'] for g in plan['groups'] for r in g['reports']}|{e['photo'] for e in plan['events'] if e['kind']=='PROOF'}
    if manifest.get('cloud')!=cloud or not keys.issubset(manifest.get('assets',{})):
        from prepare_thapar_assets import prepare
        prepare(out/'plan.json',private/'generation-private.json',out/'images',manifest_path)
    validate_asset_catalogue(plan,json.loads(manifest_path.read_text()))
    print('Backed-up source restored; deterministic plan prepared in an owned workspace')


class Refresh:
    def __init__(self,state_file):
        self.state_file=Path(state_file).resolve();self.state=json.loads(self.state_file.read_text());self.out=Path(self.state['artifact']);self.private=Path(self.state['private_dir']);self.db=json.loads((self.private/'database.json').read_text());self.original_state=json.loads(json.dumps(self.state))
    def save(self):
        import fcntl
        with open(str(self.state_file)+'.lock','a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            latest=json.loads(self.state_file.read_text())
            for key,value in self.state.items():
                if self.original_state.get(key)!=value:latest[key]=value
            temporary=self.state_file.with_suffix('.tmp');temporary.write_text(json.dumps(latest,indent=2));temporary.replace(self.state_file)
            self.state=latest;self.original_state=json.loads(json.dumps(latest))

    def connect(self,database):return psycopg.connect(host='127.0.0.1',port=self.db['port'],user=self.db['user'],password=self.db['password'],dbname=database,connect_timeout=15)
    def clone(self,database,retire=True):
        assert database in ('thapar_candidate','thapar_repeat','thapar_applycheck')
        with self.connect('postgres') as c:
            c.autocommit=True
            exists=c.execute('SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=%s)',(database,)).fetchone()[0]
            if exists:
                busy=c.execute('SELECT count(*) FROM pg_stat_activity WHERE datname=%s',(database,)).fetchone()[0]
                if busy:raise RuntimeError('Owned clone has active clients; do not interrupt them')
                c.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(database)))
            c.execute(sql.SQL('CREATE DATABASE {} TEMPLATE source').format(sql.Identifier(database)))
        if retire:
            with self.connect(database) as c:self.retire(c)
    def identify(self,c):
        old=[];report_ids=[]
        for n in range(40):
            iid=uuid.UUID(hashlib.md5(('nagriksetu-thapar-demo-v1-issue-'+str(n)).encode()).hexdigest());rid=uuid.UUID(hashlib.md5(('nagriksetu-thapar-demo-v1-report-'+str(n)).encode()).hexdigest())
            rows=c.execute('SELECT i.public_ref,r.id,r.device_id,r.description FROM issues i LEFT JOIN reports r ON r.issue_id=i.id WHERE i.id=%s',(iid,)).fetchall()
            if rows:
                expected='CT-2026-T'+str(n+1).zfill(5)
                if len(rows)!=1 or rows[0][0]!=expected or rows[0][1]!=rid or rows[0][2]!='thapar-demo-v1-'+str(n+1).zfill(3) or not rows[0][3].startswith('[SAMPLE DATA]'):raise RuntimeError('Legacy sample has changed identity or contains non-demo reports; manual review required')
                old.append(iid);report_ids.append(rid)
        current=c.execute("SELECT DISTINCT i.id FROM issues i JOIN reports r ON r.issue_id=i.id WHERE r.device_id LIKE 'thapar-demo-v2-r%' AND r.description LIKE '[THAPAR DEMO V2] %'").fetchall();new_ids={r[0] for r in current}
        if new_ids:
            redirects=c.execute("SELECT id FROM issues WHERE merged_into_id=ANY(%s) AND public_ref ~ '^CT-[0-9]{4}-D[0-9]{6}$' AND rejected_reason LIKE '%%[THAPAR DEMO V2]%%'",(list(new_ids),)).fetchall();new_ids.update(r[0] for r in redirects)
            rows=c.execute('SELECT id,issue_id,device_id,description FROM reports WHERE issue_id=ANY(%s)',(list(new_ids),)).fetchall()
            for rid,iid,device,description in rows:
                if not device or not device.startswith('thapar-demo-v2-r') or not description.startswith('[THAPAR DEMO V2] '):raise RuntimeError('Current sample cluster contains preserved evidence; manual review required')
                report_ids.append(rid)
            old.extend(sorted(new_ids))
        return old,report_ids
    def retire(self,c):
        old,reports=self.identify(c)
        c.execute('CREATE TEMP TABLE demo_refresh_old(id uuid PRIMARY KEY) ON COMMIT DROP');c.execute('CREATE TEMP TABLE demo_refresh_reports(id uuid PRIMARY KEY) ON COMMIT DROP')
        if old:c.cursor().executemany('INSERT INTO demo_refresh_old VALUES(%s)',[(x,) for x in old])
        if reports:c.cursor().executemany('INSERT INTO demo_refresh_reports VALUES(%s)',[(x,) for x in reports])
        c.execute("SELECT set_config('nagriksetu.demo_refresh_authorized','thapar-demo-v2',true)")
        c.execute((ROOT/'scripts/refresh-thapar-demo.sql').read_text())
        return old,reports
    def package(self):
        import shutil
        fingerprint=source_fingerprint()
        jar=Path(self.state.get('build_jar',self.private/'backend-build/target/civictrack-backend-0.1.0-SNAPSHOT.jar'))
        if jar.exists() and self.state.get('buildSourceHash')==fingerprint:return
        for key in ['thapar_candidate_pid','thapar_repeat_pid']:
            pid=self.state.get(key)
            if pid:
                command=subprocess.run(['ps','-p',str(pid),'-o','command='],capture_output=True,text=True).stdout
                if str(self.private) in command:raise RuntimeError('Owned builder still running; wait before rebuilding its jar')
        directory=self.private/'backend-build'
        if directory.exists():shutil.rmtree(directory)
        shutil.copytree(ROOT/'backend',directory,ignore=shutil.ignore_patterns('target','.env.seed','.env','node_modules'))
        with open(self.out/'isolated-package.log','w') as log:subprocess.run(['mvn','-B','--no-transfer-progress','-DskipTests','clean','package'],cwd=directory,stdout=log,stderr=subprocess.STDOUT,check=True)
        self.state.update(build_dir=str(directory),build_jar=str(jar),buildSourceHash=fingerprint);self.save()

    def test(self):
        import shutil,xml.etree.ElementTree as ET
        directory=self.private/('backend-tests-'+str(time.time_ns()));shutil.copytree(ROOT/'backend',directory,ignore=shutil.ignore_patterns('target','.env.seed','.env','node_modules'))
        with open(self.out/'backend-tests-final.log','w') as log:subprocess.run(['mvn','-B','--no-transfer-progress','clean','test'],cwd=directory,stdout=log,stderr=subprocess.STDOUT,check=True)
        result={k:0 for k in ['tests','failures','errors','skipped']}
        for p in (directory/'target/surefire-reports').glob('TEST-*.xml'):
            suite=ET.parse(p).getroot()
            for k in result:result[k]+=int(suite.attrib.get(k,'0'))
        if not result['tests'] or result['failures'] or result['errors']:raise RuntimeError('Backend tests did not pass')
        result['sourceHash']=source_fingerprint();(self.out/'backend-tests-final.json').write_text(json.dumps(result,indent=2));self.state['final_tests_dir']=str(directory);self.save();print(json.dumps(result,indent=2))

    def build(self,database):
        validate_asset_catalogue(json.loads((self.out/'plan.json').read_text()),json.loads((ROOT/'scripts/data/thapar-demo-v2-assets.json').read_text()))
        self.package()
        result_path=self.out/(database+'-generated.json')
        if result_path.exists():result_path.rename(result_path.with_name(database+'-generated-prior-'+str(time.time_ns())+'.json'))
        self.clone(database)
        private=json.loads((self.private/'generation-private.json').read_text());env=os.environ.copy()
        env.update(DATABASE_URL=f"jdbc:postgresql://127.0.0.1:{self.db['port']}/{database}",DATABASE_USER=self.db['user'],DATABASE_PASSWORD=self.db['password'],JWT_SECRET=secrets.token_urlsafe(48),DATASET_BUILD_AUTHORIZED='isolated-thapar-v2',CLOUDINARY_CLOUD_NAME=private['cloud'],MAIL_ENABLED='false')
        jar=Path(self.state['build_jar']);result=self.out/(database+'-generated.json')
        args=['java','-jar',str(jar),'--spring.profiles.active=thapar-dataset','--server.port=0','--civictrack.dataset.plan='+str(self.out/'plan.json'),'--civictrack.dataset.assets='+str(ROOT/'scripts/data/thapar-demo-v2-assets.json'),'--civictrack.dataset.private-config='+str(self.private/'generation-private.json'),'--civictrack.dataset.result='+str(result)]
        # The runner exits once the generation result appears; never terminate an unrelated JVM.
        log=open(self.out/(database+'-build.log'),'w');p=subprocess.Popen(args,cwd=jar.parent,env=env,stdout=log,stderr=subprocess.STDOUT)
        self.state[database+'_pid']=p.pid;self.save()
        for _ in range(900):
            if result.exists():
                p.terminate();p.wait(timeout=30);break
            if p.poll() is not None:raise RuntimeError('Dataset builder exited without a validated result; see local build log')
            time.sleep(1)
        else:p.terminate();raise RuntimeError('Dataset generation timed out')
        return json.loads(result.read_text())
    def payload(self,database):
        result=json.loads((self.out/(database+'-generated.json')).read_text());ids=list(result['issueIds'].values());reports=list(result['reportIds'].values());users=list(result['reporterIds'].values());directory=self.private/'payload';directory.mkdir(exist_ok=True,mode=0o700);meta={'issueIds':ids,'reportIds':reports,'reporterIds':users,'tables':{},'planSha256':hashlib.sha256((self.out/'plan.json').read_bytes()).hexdigest(),'assetsSha256':hashlib.sha256((ROOT/'scripts/data/thapar-demo-v2-assets.json').read_bytes()).hexdigest()}
        with self.connect(database) as c:
            for table in TABLES:
                if table=='users':where=sql.SQL('id=ANY({}::uuid[])').format(sql.Literal(users))
                elif table=='issues':where=sql.SQL('id=ANY({}::uuid[])').format(sql.Literal(ids))
                elif table=='report_submissions':where=sql.SQL("result->>'reportId'=ANY({})").format(sql.Literal(reports))
                else:where=sql.SQL('issue_id=ANY({}::uuid[])').format(sql.Literal(ids))
                columns=[x[0] for x in c.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position",(table,))]
                query=sql.SQL('COPY (SELECT * FROM {} WHERE {}) TO STDOUT WITH (FORMAT BINARY)').format(sql.Identifier(table),where)
                target=directory/(table+'.copy')
                with c.cursor().copy(query) as cp,open(target,'wb') as f:
                    for chunk in cp:f.write(chunk)
                target.chmod(0o600);meta['tables'][table]={'columns':columns,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
        with self.connect('source') as reference:meta['reference']=reference_fingerprint(reference)
        (directory/'manifest.json').write_text(json.dumps(meta,indent=2));(directory/'manifest.json').chmod(0o600);self.state['payload']=str(directory);self.save();return meta
    def stage(self,c):
        directory=Path(self.state['payload']);meta=json.loads((directory/'manifest.json').read_text())
        if meta['planSha256']!=hashlib.sha256((self.out/'plan.json').read_bytes()).hexdigest() or meta['assetsSha256']!=hashlib.sha256((ROOT/'scripts/data/thapar-demo-v2-assets.json').read_bytes()).hexdigest():raise RuntimeError('Plan or evidence manifest changed after export')
        for table,info in meta['tables'].items():
            assert table in TABLES;data=(directory/(table+'.copy')).read_bytes();assert hashlib.sha256(data).hexdigest()==info['sha256']
            c.execute(sql.SQL('CREATE TEMP TABLE {} (LIKE public.{}) ON COMMIT DROP').format(sql.Identifier('new_'+table),sql.Identifier(table)))
            with c.cursor().copy(sql.SQL('COPY {} FROM STDIN WITH (FORMAT BINARY)').format(sql.Identifier('new_'+table))) as cp:cp.write(data)
        return meta
    def fingerprints(self,c,excluded,new_users):
        result={}
        for (table,) in c.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"):
            where=sql.SQL('true')
            if table=='issues':where=sql.SQL('NOT(id=ANY({}))').format(sql.Literal(excluded))
            elif table=='reports' or table in DEPENDENTS:where=sql.SQL('issue_id IS NULL OR NOT(issue_id=ANY({}))').format(sql.Literal(excluded))
            elif table=='report_submissions':where=sql.SQL("NOT(COALESCE(result->>'issueId','')=ANY({}))").format(sql.Literal([str(x) for x in excluded]))
            elif table=='users':where=sql.SQL('NOT(id=ANY({}))').format(sql.Literal(new_users))
            if table=='moderation_actions':where=sql.SQL('NOT(issue_id=ANY({})) AND (related_issue_id IS NULL OR NOT(related_issue_id=ANY({})))').format(sql.Literal(excluded),sql.Literal(excluded))
            query=sql.SQL("SELECT count(*),md5(COALESCE(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) FROM {} t WHERE {}").format(sql.Identifier(table),where)
            result[table]=c.execute(query).fetchone()
        return result
    def replace(self,c,production=False):
        c.execute("SET LOCAL lock_timeout='10s'");c.execute("SET LOCAL statement_timeout='60s'")
        c.execute("SELECT pg_advisory_xact_lock(hashtextextended('nagriksetu-thapar-demo-refresh-v2',0))")
        c.execute(sql.SQL('LOCK TABLE {} IN SHARE ROW EXCLUSIVE MODE').format(sql.SQL(',').join(map(sql.Identifier,LOCKED))))
        c.execute('LOCK TABLE categories,wards,departments IN SHARE MODE')
        c.execute("SELECT id FROM users WHERE role<>'CITIZEN' FOR SHARE")
        c.execute("SET LOCAL TIME ZONE 'UTC'")
        meta=self.stage(c)
        if reference_fingerprint(c)!=meta['reference']:raise RuntimeError('Reference configuration or municipal scope changed since backup; rebuild from a fresh backup')
        if c.execute("SELECT count(*) FROM users u JOIN new_users n ON n.id=u.id WHERE u.email IS DISTINCT FROM n.email OR u.role<>'CITIZEN' OR NOT u.active").fetchone()[0]:raise RuntimeError('A reserved synthetic reporter changed; preserve it and review manually')
        old,_=self.identify(c);new_ids=[uuid.UUID(x) for x in meta['issueIds']];excluded=sorted(set(old+new_ids))
        collisions=c.execute('SELECT id FROM issues WHERE id=ANY(%s) AND NOT(id=ANY(%s))',(new_ids,old)).fetchall()
        if collisions:raise RuntimeError('Payload identifiers collide with preserved complaints')
        new_users=[x[0] for x in c.execute('SELECT id FROM new_users WHERE NOT EXISTS(SELECT 1 FROM users WHERE users.id=new_users.id)')]
        before=self.fingerprints(c,excluded,new_users)
        old_ids,old_reports=self.retire(c)
        # Existing accounts, including prior synthetic reporters, are never updated.
        for table in TABLES:
            columns=meta['tables'][table]['columns'];columns=[x for x in columns if not(table in SERIAL and x=='id')]
            names=sql.SQL(',').join(map(sql.Identifier,columns));tail=sql.SQL(' ON CONFLICT(id) DO NOTHING') if table=='users' else sql.SQL('')
            c.execute(sql.SQL('INSERT INTO public.{} ({}) SELECT {} FROM {}{}').format(sql.Identifier(table),names,names,sql.Identifier('new_'+table),tail))
        stats=verify(c,new_ids)
        after=self.fingerprints(c,excluded,new_users)
        if before!=after:raise RuntimeError('A preserved record changed during the refresh; transaction rolled back')
        return {'removedIssues':len(old_ids),'removedReports':len(old_reports),'addedIssues':len(new_ids),'addedReports':len(meta['reportIds']),'addedSyntheticCitizens':len(new_users),'preservedFingerprints':after,'statistics':stats,'production':production}


def reference_fingerprint(c):
    result={}
    for table in ['categories','wards','departments']:
        result[table]=c.execute(sql.SQL("SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id::text)) FROM {} t").format(sql.Identifier(table)) if table!='categories' else sql.SQL("SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY code)) FROM categories t")).fetchone()[0]
    result['municipalScopes']=c.execute("SELECT md5(string_agg(jsonb_build_object('id',id,'role',role,'department',department_id,'ward',ward_id,'active',active)::text,'' ORDER BY id)) FROM users WHERE role<>'CITIZEN'").fetchone()[0]
    return result


def verify(c,ids):
    ids=[uuid.UUID(str(x)) for x in ids]
    states=dict(c.execute('SELECT status,count(*) FROM issues WHERE id=ANY(%s) GROUP BY status',(ids,)))
    from thapar_dataset_plan import STATUS_COUNTS
    if states!=STATUS_COUNTS:raise RuntimeError('Unexpected workflow distribution: '+str(states))
    reports=c.execute('SELECT count(*) FROM reports WHERE issue_id=ANY(%s)',(ids,)).fetchone()[0]
    if len(ids)!=50 or reports!=90:raise RuntimeError('Issue/report target failed')
    tests={
      'outside_configured_ward':('SELECT count(*) FROM reports r JOIN issues i ON i.id=r.issue_id JOIN wards w ON w.id=i.ward_id WHERE i.id=ANY(%s) AND NOT ST_Covers(w.boundary,r.location)',(ids,)),
      'outside_thapar_radius':('SELECT count(*) FROM reports WHERE issue_id=ANY(%s) AND NOT ST_DWithin(location::geography,ST_SetSRID(ST_MakePoint(76.365,30.355833),4326)::geography,3100)',(ids,)),
      'report_count_mismatch':('SELECT count(*) FROM issues i WHERE i.id=ANY(%s) AND i.report_count<>(SELECT count(*) FROM reports r WHERE r.issue_id=i.id)',(ids,)),
      'distinct_reporter_mismatch':('SELECT count(*) FROM issues i WHERE i.id=ANY(%s) AND i.distinct_reporter_count<>(SELECT count(DISTINCT COALESCE(reporter_id::text,device_id)) FROM reports r WHERE r.issue_id=i.id)',(ids,)),
      'missing_verified_photo_hash':("SELECT count(*) FROM reports WHERE issue_id=ANY(%s) AND (photo_hash IS NULL OR photo_url LIKE '%%/demo/%%')",(ids,)),
      'ineligible_vote':('SELECT count(*) FROM verifications v WHERE v.issue_id=ANY(%s) AND NOT EXISTS(SELECT 1 FROM reports r WHERE r.issue_id=v.issue_id AND r.reporter_id=v.citizen_id)',(ids,)),
      'missing_repair_evidence':("SELECT count(*) FROM issues WHERE id=ANY(%s) AND status IN ('PENDING_VERIFICATION','RESOLVED','REOPENED') AND (resolution_photo_hash IS NULL OR resolution_photo_url IS NULL)",(ids,)),
      'unpaused_verification':("SELECT count(*) FROM issues WHERE id=ANY(%s) AND status='PENDING_VERIFICATION' AND clock_paused_at IS NULL",(ids,)),
      'incorrect_history_tail':('SELECT count(*) FROM issues i WHERE i.id=ANY(%s) AND i.status IS DISTINCT FROM (SELECT to_status FROM issue_status_history h WHERE h.issue_id=i.id ORDER BY created_at DESC,id DESC LIMIT 1)',(ids,)),
      'future_report':('SELECT count(*) FROM reports WHERE issue_id=ANY(%s) AND created_at>now()', (ids,)),
      'future_history':('SELECT count(*) FROM issue_status_history WHERE issue_id=ANY(%s) AND created_at>now()', (ids,)),
      'negative_resolution_time':('SELECT count(*) FROM issues WHERE id=ANY(%s) AND resolved_at<first_reported_at',(ids,)),
      'invalid_repair_clock':('SELECT count(*) FROM issues WHERE id=ANY(%s) AND resolved_at IS NOT NULL AND resolved_at<clock_paused_at',(ids,)),
      'missing_synthetic_label':("SELECT count(*) FROM reports WHERE issue_id=ANY(%s) AND description NOT LIKE '[THAPAR DEMO V2] %%'",(ids,)),
    }
    tests.update({
      'centroid_outside_ward':('SELECT count(*) FROM issues i JOIN wards w ON w.id=i.ward_id WHERE i.id=ANY(%s) AND NOT ST_Covers(w.boundary,i.centroid)',(ids,)),
      'category_department_mismatch':('SELECT count(*) FROM issues i JOIN categories c ON c.code=i.category_code WHERE i.id=ANY(%s) AND i.department_id IS DISTINCT FROM c.department_id',(ids,)),
      'report_category_mismatch':('SELECT count(*) FROM reports r JOIN issues i ON i.id=r.issue_id WHERE i.id=ANY(%s) AND i.category_code<>r.category_code',(ids,)),
      'extent_cap_exceeded':('SELECT count(*) FROM issues i JOIN categories c ON c.code=i.category_code WHERE i.id=ANY(%s) AND i.max_member_dist_m>c.merge_radius_m*c.max_extent_multiplier+0.01',(ids,)),
      'understated_extent':('SELECT count(*) FROM issues i WHERE i.id=ANY(%s) AND EXISTS(SELECT 1 FROM reports r WHERE r.issue_id=i.id AND ST_Distance(r.location::geography,i.centroid::geography)>i.max_member_dist_m+0.01)',(ids,)),
      'incorrect_weights':('SELECT count(*) FROM issues i WHERE i.id=ANY(%s) AND i.report_count>0 AND abs(i.sum_w-(SELECT sum(1.0/power(greatest(gps_accuracy_m,3),2)) FROM reports r WHERE r.issue_id=i.id))>0.00000001',(ids,)),
      'invalid_history_chain':('SELECT count(*) FROM (SELECT from_status,lag(to_status) OVER(PARTITION BY issue_id ORDER BY created_at,id) previous FROM issue_status_history WHERE issue_id=ANY(%s)) h WHERE from_status IS DISTINCT FROM previous',(ids,)),
      'vote_before_claim':("SELECT count(*) FROM verifications v WHERE v.issue_id=ANY(%s) AND v.created_at<(SELECT min(created_at) FROM issue_status_history h WHERE h.issue_id=v.issue_id AND h.to_status='PENDING_VERIFICATION')",(ids,)),
      'missing_assignee':("SELECT count(*) FROM issues WHERE id=ANY(%s) AND status IN ('ASSIGNED','IN_PROGRESS','PENDING_VERIFICATION','REOPENED') AND assigned_to IS NULL",(ids,)),
    })
    observed={name:c.execute(q,args).fetchone()[0] for name,(q,args) in tests.items()}
    if any(observed.values()):raise RuntimeError('Dataset invariant failed: '+str(observed))
    categories=dict(c.execute('SELECT category_code,count(*) FROM issues WHERE id=ANY(%s) GROUP BY category_code',(ids,)))
    if len(categories)!=10 or min(categories.values())<3:raise RuntimeError('Active category coverage failed')
    multiplicity=dict(c.execute('SELECT report_count,count(*) FROM issues WHERE id=ANY(%s) GROUP BY report_count',(ids,)))
    if multiplicity!={0:1,1:28,2:11,4:10}:raise RuntimeError('Unexpected grouping distribution: '+str(multiplicity))
    decisions=dict(c.execute('SELECT cluster_decision,count(*) FROM reports WHERE issue_id=ANY(%s) GROUP BY cluster_decision',(ids,)))
    # Moderation changes membership decisions to MANUAL and retains the original
    # decision in its immutable moved-report audit, rather than on the report.
    moved={}
    for (detail,) in c.execute('SELECT detail FROM moderation_actions WHERE issue_id=ANY(%s) ORDER BY created_at,id',(ids,)):
        for row in detail.get('moved',[]):moved.setdefault(row['reportId'],row['originalDecision'])
    originals={}
    for rid,decision in c.execute('SELECT id,cluster_decision FROM reports WHERE issue_id=ANY(%s)',(ids,)):
        original=moved[str(rid)] if decision=='MANUAL' else decision
        originals[original]=originals.get(original,0)+1
    for expected in ['MERGED','MERGED_LOW_CONF','SPLIT_LOW_CONF','SPLIT_EXTENT_CAPPED']:
        if originals.get(expected,0)<1:raise RuntimeError('Missing clustering example in report/moderation audit '+expected)
    moderation=dict(c.execute('SELECT action,count(*) FROM moderation_actions WHERE issue_id=ANY(%s) GROUP BY action',(ids,)))
    if not {'SPLIT','MERGE','CONFIRM'}.issubset(moderation):raise RuntimeError('Missing moderation examples')
    range_row=c.execute('SELECT min(created_at),max(created_at),min(ST_Distance(location::geography,ST_SetSRID(ST_MakePoint(76.365,30.355833),4326)::geography)),max(ST_Distance(location::geography,ST_SetSRID(ST_MakePoint(76.365,30.355833),4326)::geography)) FROM reports WHERE issue_id=ANY(%s)',(ids,)).fetchone()
    return {'issues':len(ids),'reports':reports,'statuses':states,'categories':categories,'reportMultiplicity':multiplicity,'clusteringDecisions':decisions,'originalClusteringDecisions':originals,'moderation':moderation,'invariants':observed,'activityRange':[str(range_row[0]),str(range_row[1])],'distanceMetres':list(range_row[2:]),'wards':dict(c.execute('SELECT w.name,count(*) FROM issues i JOIN wards w ON w.id=i.ward_id WHERE i.id=ANY(%s) GROUP BY w.name',(ids,))),'escalationEvents':c.execute('SELECT count(*) FROM escalation_events WHERE issue_id=ANY(%s)',(ids,)).fetchone()[0],'verificationVotes':c.execute('SELECT count(*) FROM verifications WHERE issue_id=ANY(%s)',(ids,)).fetchone()[0],'privateMessages':c.execute('SELECT count(*) FROM issue_messages WHERE issue_id=ANY(%s)',(ids,)).fetchone()[0],
            'followers':c.execute('SELECT count(*) FROM issue_followers WHERE issue_id=ANY(%s)',(ids,)).fetchone()[0],
            'notifications':c.execute('SELECT count(*) FROM notifications WHERE issue_id=ANY(%s)',(ids,)).fetchone()[0],
            'onTimeRepairs':c.execute("SELECT count(*) FROM issues WHERE id=ANY(%s) AND resolved_at IS NOT NULL AND COALESCE(clock_paused_at,resolved_at)<=due_at+make_interval(secs=>paused_seconds)",(ids,)).fetchone()[0],
            'lateRepairs':c.execute("SELECT count(*) FROM issues WHERE id=ANY(%s) AND resolved_at IS NOT NULL AND COALESCE(clock_paused_at,resolved_at)>due_at+make_interval(secs=>paused_seconds)",(ids,)).fetchone()[0],
            'administrativeClosures':c.execute("SELECT count(*) FROM issues WHERE id=ANY(%s) AND status='CLOSED' AND resolved_at IS NULL",(ids,)).fetchone()[0],
            'resolvedWithoutVerification':c.execute('SELECT count(*) FROM issues WHERE id=ANY(%s) AND resolved_without_verification',(ids,)).fetchone()[0]}



def scoped_semantics(job,database):
    result=json.loads((job.out/(database+'-generated.json')).read_text());ids=[uuid.UUID(x) for x in result['issueIds'].values()];users=[uuid.UUID(x) for x in result['reporterIds'].values()];report_ids=list(result['reportIds'].values());fingerprints={}
    with job.connect(database) as c:
        for table in TABLES:
            where=sql.SQL('id=ANY({})').format(sql.Literal(users if table=='users' else ids)) if table in ('users','issues') else sql.SQL("result->>'reportId'=ANY({})").format(sql.Literal(report_ids)) if table=='report_submissions' else sql.SQL('issue_id=ANY({})').format(sql.Literal(ids))
            omit=['password_hash'] if table=='users' else ['id'] if table in SERIAL else []
            query=sql.SQL("SELECT count(*),md5(COALESCE(string_agg(v::text,'' ORDER BY v::text),'')) FROM (SELECT to_jsonb(t)-{}::text[] v FROM {} t WHERE {}) x").format(sql.Literal(omit),sql.Identifier(table),where)
            fingerprints[table]=list(c.execute(query).fetchone())
    return fingerprints


def compare_builds(job):
    first=scoped_semantics(job,'thapar_candidate');second=scoped_semantics(job,'thapar_repeat')
    if first!=second:raise RuntimeError('Reproduction differed in '+str([k for k in first if first[k]!=second[k]]))
    return {'passed':True,'sourceHash':source_fingerprint(),'planSha256':hashlib.sha256((job.out/'plan.json').read_bytes()).hexdigest(),'tables':first,'notes':'Stable issue/report/reporter identities and business content; generated BCrypt salts and new serial audit IDs are excluded.'}


def rehearse(job):
    job.clone('thapar_applycheck',retire=False)
    with job.connect('thapar_applycheck') as c:before=job.fingerprints(c,[],[])
    # Simulate an unrelated citizen adding evidence to a sample: refuse retirement.
    with job.connect('thapar_applycheck') as c:
        old,_=job.identify(c);destination=c.execute("SELECT id FROM issues WHERE id=ANY(%s) AND category_code='POTHOLE' LIMIT 1",(old,)).fetchone()[0]
        columns=[x[0] for x in c.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='reports' ORDER BY ordinal_position")]
        expressions=[sql.Literal(uuid.uuid4()) if x=='id' else sql.Literal(destination) if x=='issue_id' else sql.Literal('preserved-citizen-evidence') if x=='device_id' else sql.Literal('Preserved citizen observation - guard fixture') if x=='description' else sql.Identifier(x) for x in columns]
        c.execute(sql.SQL("INSERT INTO reports ({}) SELECT {} FROM reports WHERE category_code='POTHOLE' AND issue_id<>%s LIMIT 1").format(sql.SQL(',').join(map(sql.Identifier,columns)),sql.SQL(',').join(expressions)),(destination,))
        try:job.replace(c)
        except RuntimeError as e:
            if 'contains non-demo reports' not in str(e):raise
        else:raise RuntimeError('Mixed real/demo evidence was not protected')
        c.rollback()
    # Force a failure after the complete replacement: every ordinary row rolls back.
    try:
        with job.connect('thapar_applycheck') as c:
            job.replace(c);raise RuntimeError('INTENTIONAL_REFRESH_ROLLBACK_TEST')
    except RuntimeError as e:
        if str(e)!='INTENTIONAL_REFRESH_ROLLBACK_TEST':raise
    with job.connect('thapar_applycheck') as c:after=job.fingerprints(c,[],[])
    if before!=after:raise RuntimeError('Failed refresh did not roll back all records')
    with job.connect('thapar_applycheck') as c:first=job.replace(c)
    with job.connect('thapar_applycheck') as c:second=job.replace(c)
    if first['statistics']!=second['statistics']:raise RuntimeError('Repeated replacement changed dataset counts')
    return {'mixedEvidenceProtected':True,'forcedFailureRolledBack':True,'first':first,'repeat':second}


def confirm_live_target(c,api):
    import urllib.request
    if not api.startswith('https://'):raise RuntimeError('Deployed API must use HTTPS')
    live=None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(api+'/wards',timeout=45) as response:live=json.load(response)
            break
        except Exception:
            if attempt==2:raise RuntimeError('Could not verify the live API before database replacement') from None
            time.sleep(3)
    records=live if isinstance(live,list) else live.get('items',[])
    ids={str(x[0]) for x in c.execute('SELECT id FROM wards')}
    if {x['id'] for x in records}!=ids:raise RuntimeError('Private database connection does not match the deployed API wards')
    preserved=c.execute("SELECT i.id,i.public_ref,i.status FROM issues i WHERE i.public_ref !~ '^CT-[0-9]{4}-[TD]' ORDER BY CASE WHEN status='CLOSED' THEN 0 ELSE 1 END,i.id LIMIT 1").fetchone()
    if preserved:
        with urllib.request.urlopen(api+'/public/issues/'+str(preserved[0]),timeout=45) as response:detail=json.load(response)
        if detail['publicRef']!=preserved[1] or detail['status']!=preserved[2]:raise RuntimeError('Preserved complaint does not match the live API')
    return {'wardIdentityMatched':True,'preservedComplaintMatched':bool(preserved)}


def fresh_backup(job,env_file):
    directory=ROOT/'backups'/('thapar-dataset-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')+'-preapply');directory.mkdir(parents=True,mode=0o700)
    env=os.environ.copy();env.update({k:v for k,v in private_values(env_file).items() if k in ('DATABASE_URL','DATABASE_USER','DATABASE_PASSWORD')})
    with open(job.out/'preapply-backup.log','w') as log:subprocess.run(['bash',str(ROOT/'scripts/backup.sh'),str(directory)],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
    backup=next(directory.glob('*.dump.gz'))
    with gzip.open(backup,'rb') as f:data=f.read()
    if data[:5]!=b'PGDMP':raise RuntimeError('Pre-apply backup is invalid')
    listing=subprocess.run(['docker','run','--rm','-i','postgres:17-alpine','pg_restore','--list'],input=data,capture_output=True)
    if listing.returncode or b'TABLE DATA public issues' not in listing.stdout:raise RuntimeError('Pre-apply archive is not readable')
    job.state.update(preapplyBackup=str(backup),preapplyBackupSHA256=hashlib.sha256(backup.read_bytes()).hexdigest());job.save()
    return backup


def cleanup_owned(job):
    actual=subprocess.run(['docker','inspect','--format','{{.Id}}',job.state['container']],capture_output=True,text=True)
    if actual.returncode==0:
        if actual.stdout.strip()!=job.state['container_id'] or not job.state['container'].startswith('nagriksetu-thapar-realistic-'):raise RuntimeError('Container ownership mismatch; left untouched')
        subprocess.run(['docker','rm','-f','-v',job.state['container_id']],check=True,capture_output=True)
    job.state['containerRemoved']=True;job.save();print('Removed only the recorded task-owned database container; backups and evidence retained')


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--state',type=Path,required=True);parser.add_argument('--env-file',type=Path,default=ROOT/'backend/.env.seed');parser.add_argument('command',choices=['prepare','test','build','repeat','compare','export','rehearse','apply','verify','cleanup']);parser.add_argument('--apply-deployed',action='store_true');parser.add_argument('--backup',type=Path);parser.add_argument('--anchor');parser.add_argument('--seed',type=int,default=731109);parser.add_argument('--api',default='https://civictrack-api.onrender.com/api/v1');a=parser.parse_args()
    if a.command=='prepare':prepare_workspace(a);return
    job=Refresh(a.state)
    if a.command=='test':job.test();return
    if a.command=='cleanup':cleanup_owned(job);return
    if a.command in ['build','repeat']:
        database='thapar_candidate' if a.command=='build' else 'thapar_repeat';result=job.build(database)
        with job.connect(database) as c:stats=verify(c,list(result['issueIds'].values()))
        (job.out/(database+'-verification.json')).write_text(json.dumps(stats,default=str,indent=2));print(json.dumps(stats,default=str,indent=2))
    elif a.command=='compare':
        result=compare_builds(job);(job.out/'reproducibility.json').write_text(json.dumps(result,indent=2));print('Same-seed regeneration reproduced all demo business data; BCrypt salts are intentionally independent')
    elif a.command=='export':job.payload('thapar_candidate');print('Exported only demo records to the private payload directory')
    elif a.command=='rehearse':
        result=rehearse(job);(job.out/'replacement-rehearsal.json').write_text(json.dumps(result,default=str,indent=2));print('Mixed-evidence refusal, forced rollback and repeat replacement passed in the owned clone')
    elif a.command=='apply':
        if not a.apply_deployed:raise RuntimeError('The deployed apply requires explicit --apply-deployed')
        if not Path(job.state['backup']).is_file() or not job.state.get('backupRestored') or not (job.out/'replacement-rehearsal.json').exists():raise RuntimeError('A tested backup and passing isolated replacement rehearsal are required')
        reproduction=json.loads((job.out/'reproducibility.json').read_text());tests=json.loads((job.out/'backend-tests-final.json').read_text())
        if not reproduction['passed'] or reproduction['sourceHash']!=source_fingerprint() or tests['sourceHash']!=source_fingerprint() or tests['failures'] or tests['errors']:raise RuntimeError('Run reproducibility and backend checks on the final source before applying')
        if reproduction['planSha256']!=hashlib.sha256((job.out/'plan.json').read_bytes()).hexdigest():raise RuntimeError('The plan changed after reproducibility validation')
        with target_connection(a.env_file) as c:identity=confirm_live_target(c,a.api)
        fresh_backup(job,a.env_file)
        with target_connection(a.env_file) as c:
            c.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');result=job.replace(c,production=True)
        result['targetIdentity']=identity;result['preapplyBackup']=job.state['preapplyBackup']
        (job.out/'deployed-replacement.json').write_text(json.dumps(result,default=str,indent=2))
        credentials=ROOT/'backups/thapar-demo-v2-citizens.json'
        if not credentials.exists():
            private=json.loads((job.private/'generation-private.json').read_text());fd=os.open(credentials,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,'w') as secure:secure.write(json.dumps({'role':'CITIZEN','synthetic':True,'password':private['citizen_password'],'emails':['thapar.demo.v2.reporter%02d@example.test'%(i+1) for i in range(12)]},indent=2))
        print('Committed one atomic deployed demo replacement; unrelated rows fingerprint-identical')
    else:
        result=json.loads((job.out/'thapar_candidate-generated.json').read_text())
        with target_connection(a.env_file) as c:c.execute('SET TRANSACTION READ ONLY');stats=verify(c,list(result['issueIds'].values()))
        (job.out/'deployed-verification.json').write_text(json.dumps(stats,default=str,indent=2));print(json.dumps(stats,default=str,indent=2))
if __name__=='__main__':main()
