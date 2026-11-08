// Isolated administrator UI dry run. Only public seed reads reach the real API; writes stay in memory.
// Run the frontend separately at http://127.0.0.1:3003 with both API bases pointing here.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
const port=8081, api='http://localhost:8080/api/v1', now=new Date().toISOString();
const read=async path=>{const r=await fetch(api+path);if(!r.ok)throw Error('Fixture seed read failed: '+r.status);return r.json();};
const [page,categories,wards]=await Promise.all([read('/public/issues?limit=1'),read('/categories'),read('/wards')]);
const base=page.items[0],category=categories.find(c=>c.code==='POTHOLE'),ward=wards[0];
const member=randomUUID(),other=randomUUID(),department=category.departmentId;
const scope=await read('/dashboard/wards/'+ward.id);
const session={accessToken:'isolated-admin-access',refreshToken:'isolated-admin-refresh',userId:member,fullName:'Administrator UI fixture',role:process.env.QA_ROLE||'ADMIN',mfaSetupRequired:false};
const profile={id:member,createdAt:now,email:'fixture-admin@example.test',fullName:session.fullName,phone:null,role:session.role,mutedNotificationTypes:[],mutableNotificationTypes:['CLOSED','RESOLVED','REOPENED','REJECTED','INFO_REQUESTED','CITIZEN_REPLIED']};
const states=['NEW','ACKNOWLEDGED','ASSIGNED','IN_PROGRESS','REOPENED','PENDING_VERIFICATION','ASSIGNED'];
let rows=Array.from({length:225},(_,i)=>({...base,id:randomUUID(),publicRef:`CT-2099-${String(i+1).padStart(6,'0')}`,categoryCode:'POTHOLE',categoryName:category.displayName,wardId:ward.id,wardName:ward.name,departmentId:department,departmentName:'Roads fixture department',status:i<7?states[i]:'NEW',resolvedAt:null,resolutionNote:null,resolutionPhotoUrl:null,resolvedWithoutVerification:false,priority:'HIGH',priorityScore:1000-i,assignedTo:[2,3,5].includes(i%7)?member:i%7===6?other:null,firstReportedAt:now,dueAt:now,effectiveDeadline:now,pausedSeconds:0,landmark:`Isolated test location ${i+1}`,escalationLevel:0}));
let password='fixture-pass-1234', emailEnabled=false,mfaEnabled=false,empty=false;
let sessions=[{familyId:randomUUID(),createdAt:now,lastUsedAt:now,expiresAt:now,current:true,revoked:false},{familyId:randomUUID(),createdAt:now,lastUsedAt:now,expiresAt:now,current:false,revoked:false}];
const notices=Array.from({length:125},(_,i)=>({id:i+1,issueId:rows[i].id,type:'CITIZEN_REPLIED',title:`QA citizen reply ${i+1}`,body:'An isolated administrator notification.',createdAt:now,readAt:null}));
const messages=new Map(),history=new Map(),failures=new Set(),captured=[],reportAttempts=[];
const reportMap=new Map(rows.map(r=>[r.id,[1,2].map(sequence=>({id:randomUUID(),sequence,lat:r.lat+sequence*0.00001,lng:r.lng,gpsAccuracyM:8,description:'Isolated citizen evidence for a damaged road surface.',photoUrl:null,landmark:'QA location',createdAt:now,clusterDecision:'MERGED',redacted:false}))]));
for(const r of rows)Object.assign(r,{mergedIntoId:null,needsReview:true,reviewReason:'LOW_CONF_MERGE',reportCount:2,distinctReporterCount:2});
const geometry=r=>({lat:r.lat,lng:r.lng,extentM:2,reportCount:r.reportCount,distinctReporters:r.distinctReporterCount,positionalUncertaintyM:8,firstReportedAt:now});
const result=r=>({issueId:r.id,publicRef:r.publicRef,relatedIssueId:null,relatedPublicRef:null});
const running=r=>!['PENDING_VERIFICATION','RESOLVED','CLOSED','REJECTED'].includes(r.status);
const active=()=>empty?[]:rows.filter(r=>!['RESOLVED','CLOSED','REJECTED'].includes(r.status));
const summary=()=>{const all=active(),mine=all.filter(r=>r.assignedTo===member),overdue=r=>running(r)&&Date.parse(r.effectiveDeadline)<Date.now();return {department:{id:department,name:'Roads fixture department'},ward:null,personal:{open:mine.length,overdue:mine.filter(overdue).length,readyToStart:mine.filter(r=>['ASSIGNED','REOPENED'].includes(r.status)).length,inProgress:mine.filter(r=>r.status==='IN_PROGRESS').length,awaitingVerification:mine.filter(r=>r.status==='PENDING_VERIFICATION').length},departmentWork:{open:all.length,overdue:all.filter(overdue).length,needsAssignment:all.filter(r=>['NEW','ACKNOWLEDGED'].includes(r.status)).length,awaitingVerification:all.filter(r=>r.status==='PENDING_VERIFICATION').length},stages:['NEW','REOPENED','ACKNOWLEDGED','ASSIGNED','IN_PROGRESS','PENDING_VERIFICATION'].map(status=>({status,total:all.filter(r=>r.status===status).length,mine:mine.filter(r=>r.status===status).length})),myPriorities:mine.slice(0,6),departmentPriorities:all.slice(0,6),previewLimit:6,generatedAt:new Date().toISOString()};};
const configuration={
 categories:categories.map(c=>({code:c.code,display_name:c.displayName,merge_radius_m:c.mergeRadiusM,default_sla_hours:c.defaultSlaHours,severity_weight:10,reopen_window_days:7,max_extent_multiplier:c.maxExtentMultiplier||2,low_conf_action:'MERGE_FLAG',department_id:c.departmentId,active:true})),
 users:[{id:member,full_name:session.fullName,email:'fixture-admin@example.test',role:'ADMIN',department_id:null,ward_id:null,active:true},{id:other,full_name:'QA crew member',email:'fixture-crew@example.test',role:'STAFF',department_id:department,ward_id:ward.id,active:true},...Array.from({length:123},(_,i)=>({id:randomUUID(),full_name:'QA resident '+(i+1),email:'qa-resident-'+i+'@example.test',role:'CITIZEN',department_id:null,ward_id:null,active:true}))],
 departments:[...new Set(categories.map(c=>c.departmentId).filter(Boolean))].map((id,i)=>({id,code:'QA_DEPT_'+i,name:id===department?'Roads fixture department':'QA department '+(i+1),parent_department_id:null,head_user_id:id===department?member:null})),
 wards:wards.map(w=>({id:w.id,ward_number:w.wardNumber,name:w.name,officer_user_id:member}))
};
const configurationAudit=Array.from({length:125},(_,i)=>({id:125-i,actor_id:member,resource:'categories',resource_id:'POTHOLE',before_value:'{"default_sla_hours":48}',after_value:'{"default_sla_hours":72}',created_at:new Date(Date.now()-i*3600000).toISOString()}));
const auditRows=Array.from({length:165},(_,i)=>({at:new Date(Date.now()-i*3600000).toISOString(),kind:['STATUS','ESCALATION','MODERATION'][i%3],issueId:rows[i].id,issueRef:rows[i].publicRef,category:category.displayName,action:['ACKNOWLEDGED','Level 2 escalation','CONFIRM'][i%3],fromStatus:i%3===0?'NEW':null,toStatus:i%3===0?'ACKNOWLEDGED':null,level:i%3===1?2:null,actorRole:['ADMIN','SYSTEM','SUPERVISOR'][i%3],actorId:member,actorName:i%3===0?session.fullName:null,note:'Isolated QA audit entry '+(i+1)}));
for(const r of rows.slice(125))Object.assign(r,{status:'RESOLVED',resolvedAt:now,resolutionNote:'Completed the repair and reviewed the verification outcome.',resolvedWithoutVerification:false});
const once=new Map();let refreshes=0;
const auditFiltered=params=>auditRows.filter(r=>(!params.get('kind')||r.kind===params.get('kind'))&&(!params.get('issueRef')||r.issueRef===params.get('issueRef').toUpperCase())&&(!params.get('actorRole')||r.actorRole===params.get('actorRole'))&&(!params.get('level')||r.level===Number(params.get('level')))&&(!params.get('from')||r.at.slice(0,10)>=params.get('from'))&&(!params.get('to')||r.at.slice(0,10)<=params.get('to')));
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:'+port),path=url.pathname.replace(/^\/api\/v1/,'');
 const cors={'access-control-allow-origin':'*','access-control-allow-headers':'Authorization, Content-Type, Idempotency-Key','access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS'};
 const send=(body,status=200)=>{res.writeHead(status,{...cors,'content-type':'application/json'});res.end(status===204?'':JSON.stringify(body));};
 if(req.method==='OPTIONS')return send(null,204);
 let raw='';for await(const chunk of req)raw+=chunk;let body={};try{body=raw?JSON.parse(raw):{};}catch{return send({detail:'Malformed fixture request'},400);}
 if(path==='/reports'&&req.method==='POST')reportAttempts.push({id:req.headers['idempotency-key'],token:req.headers.authorization||null,body});
 if(path==='/__qa/control'){if(req.method==='POST'){if(body.failOnce)once.set(body.failOnce,body.status||401);if(body.fail)failures.add(body.fail);if(body.recover)failures.delete(body.recover);if(typeof body.empty==='boolean')empty=body.empty;}return send({captured,reportAttempts,refreshes,failures:[...failures],empty,configurationAuditCount:configurationAudit.length,rows:rows.slice(0,7).map(r=>({id:r.id,publicRef:r.publicRef,status:r.status})),profile});}
 if(once.has(req.method+' '+path)){const code=once.get(req.method+' '+path);once.delete(req.method+' '+path);return send({status:code,detail:'QA one-time refusal'},code);}
 if(failures.has(req.method+' '+path))return send({status:503,detail:'QA temporary failure: '+path},503);
 if(req.method!=='GET'&&!path.startsWith('/auth/'))captured.push({method:req.method,path,body:path.includes('password')?{passwordRequest:true}:body});
 if(path==='/auth/login')return body.password===password?send(session):send({detail:'Invalid fixture credentials'},401);
 if(path==='/auth/refresh'){refreshes++;session.accessToken='isolated-access-'+refreshes;return send(session);}if(path==='/auth/logout')return send(null,204);
 if(path==='/categories')return send(categories);if(path==='/wards')return send(wards);
 if(path==='/supervisor/analytics'){const chosen=configuration.departments.find(d=>d.id===url.searchParams.get('departmentId'))||configuration.departments.find(d=>d.id===department),hasWork=chosen.id===department;const metrics=hasWork?scope.metrics:{...scope.metrics,openCount:0,overdueCount:0,resolvedCount:0,reportedLast30Days:0,resolvedLast30Days:0,medianResolutionHours:null,resolvedWithTime:0,slaResolved:0,slaOnTime:0,slaRate:null,fixesClaimed:0,reopened:0,reopenRate:null,resolvedWithoutVerification:0,unverifiedRate:null,backlogAge:scope.metrics.backlogAge.map(r=>({...r,open:0})),reportedVsResolved:scope.metrics.reportedVsResolved.map(r=>({...r,reported:0,resolved:0})),openByCategory:[]};return send({department:{id:chosen.id,name:chosen.name},metrics,staff:hasWork?Array.from({length:30},(_,i)=>({id:i?randomUUID():other,name:'QA crew member '+(i+1),fixesClaimed:12,resolved:10,reopened:2,reopenRate:0.1667,medianResolutionHours:24,openAssigned:5,overdueAssigned:2})):[],minimumSample:5,generatedAt:now});}
 if(path==='/supervisor/queue'){let list=url.searchParams.get('tab')==='ready_to_close'?(empty?[]:rows.filter(r=>r.status==='RESOLVED')):active();if(!['all','ready_to_close'].includes(url.searchParams.get('tab')))list=list.filter(r=>['NEW','ACKNOWLEDGED'].includes(r.status));const offset=Number(url.searchParams.get('offset'))||0,limit=Math.min(Number(url.searchParams.get('limit'))||100,200);return send(list.slice(offset,offset+limit).map(row=>({row,reporters:[{id:other,fullName:'QA resident'}],anonymousReporters:1,assigneeName:row.assignedTo?'QA crew member':null})));}
 if(path==='/supervisor/review'){const list=active().filter(r=>r.needsReview),offset=Number(url.searchParams.get('offset'))||0,limit=Math.min(Number(url.searchParams.get('limit'))||25,100);return send({items:list.slice(offset,offset+limit).map(r=>({...r,extentM:2,extentCapM:50,mergeRadiusM:20,points:reportMap.get(r.id).map(p=>({reportId:p.id,lat:p.lat,lng:p.lng,accuracyM:p.gpsAccuracyM,clusterDecision:p.clusterDecision}))})),total:list.length,offset,limit});}
 if(/^\/supervisor\/departments\/[^/]+\/members$/.test(path))return send([{id:other,fullName:'QA crew member',role:'STAFF',wardName:ward.name,openAssigned:2}]);
 const mod=path.match(/^\/supervisor\/issues\/([^/]+)\/(.+)$/);
 if(mod){const row=rows.find(r=>r.id===mod[1]);if(!row)return send({detail:'No fixture complaint'},404);const action=mod[2];
 if(action==='moderation')return send([]);
 if(action==='ward-options')return send(wards.slice(0,2).map(w=>({...w,distanceM:12,current:w.id===row.wardId,allowed:true})));
 if(action==='split/preview')return send({remaining:{...geometry(row),reportCount:1},created:{...geometry(row),reportCount:1}});
 if(action==='merge/preview')return send({...geometry(row),reportCount:4,distinctReporters:4});
 if(action==='confirm'){row.needsReview=false;return send(result(row));}
 if(action==='recategorise'){const c=categories.find(c=>c.code===body.categoryCode);Object.assign(row,{categoryCode:c.code,categoryName:c.displayName,departmentId:c.departmentId});return send(result(row));}
 if(action==='reassign-ward'){const w=wards.find(w=>w.id===body.wardId);Object.assign(row,{wardId:w.id,wardName:w.name});return send(result(row));}
 if(action.includes('/redact')){const report=reportMap.get(row.id).find(r=>r.id===action.split('/')[1]);report.description='[Description removed by a supervisor]';report.redacted=true;return send(null,204);}
 if(action==='split'){const created={...row,id:randomUUID(),publicRef:'CT-2099-000226',reportCount:body.reportIds.length};const moving=reportMap.get(row.id).filter(r=>body.reportIds.includes(r.id));reportMap.set(row.id,reportMap.get(row.id).filter(r=>!body.reportIds.includes(r.id)));reportMap.set(created.id,moving);row.reportCount-=moving.length;rows.push(created);return send({...result(row),relatedIssueId:created.id,relatedPublicRef:created.publicRef});}
 if(action==='merge'){const source=rows.find(r=>r.id===body.sourceIssueId);source.mergedIntoId=row.id;source.mergedIntoRef=row.publicRef;source.status='REJECTED';reportMap.set(row.id,[...reportMap.get(row.id),...reportMap.get(source.id)]);row.reportCount=reportMap.get(row.id).length;return send({...result(row),relatedIssueId:source.id});}
 }
 if(path.startsWith('/public/issues/by-ref/')){const row=rows.find(r=>r.publicRef===decodeURIComponent(path.split('/').at(-1)));return row?send(row):send({detail:'No such ticket'},404);}
 if(path==='/admin/configuration')return send(configuration);
 if(path==='/admin/configuration/audit'){const offset=Number(url.searchParams.get('offset'))||0;return send(configurationAudit.slice(offset,offset+50));}
 if(path.startsWith('/admin/configuration/')&&req.method==='PUT'){const [,group,key]=path.split('/').slice(2),id=decodeURIComponent(key||'');const list=configuration[group];const row=list?.find(r=>String(r.id??r.code)===id);if(!row)return send({detail:'No fixture record'},404);if(group==='users'&&['STAFF','SUPERVISOR'].includes(body.role)&&!body.departmentId&&!body.wardId)return send({status:409,detail:'Staff and supervisors need a department or ward scope.'},409);const before=JSON.stringify(row);for(const [key,value]of Object.entries(body))row[key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase())]=value;configurationAudit.unshift({id:1000+configurationAudit.length,actor_id:member,resource:group,resource_id:id,before_value:before,after_value:JSON.stringify(row),created_at:now});return send(null,204);}
 if(path==='/admin/audit'){const filtered=auditFiltered(url.searchParams),offset=Number(url.searchParams.get('offset'))||0,limit=Number(url.searchParams.get('limit'))||50;return send({items:filtered.slice(offset,offset+limit),total:filtered.length,offset,limit});}
 if(path==='/admin/audit.csv'){const filtered=auditFiltered(url.searchParams);const columns=['at','kind','issueRef','action','actorRole','note'];const csv=[columns.join(','),...filtered.map(row=>columns.map(key=>'"'+String(row[key]??'').replaceAll('"','""')+'"').join(','))].join('\r\n');res.writeHead(200,{...cors,'content-type':'text/csv','content-disposition':'attachment; filename="nagriksetu-audit-log.csv"'});return res.end(csv);}
 if(path==='/reports'&&req.method==='POST')return send({reportId:randomUUID(),issueId:rows[0].id,publicRef:rows[0].publicRef,clusterDecision:'NEW',reportCount:1,distinctReporterCount:1,distanceToClusterM:null,effectiveRadiusM:null,projectedExtentM:null,needsReview:false,status:'NEW',dueAt:now,priorityBand:'MEDIUM',wardName:ward.name,departmentName:'Roads fixture department',message:'Isolated report accepted.'},201);
 if(path==='/dashboard/departments')return send(configuration.departments.map(d=>({departmentId:d.id,departmentName:d.name})));
 if(path==='/staff/overview')return send(summary());
 if(path==='/staff/queue'){const tab=url.searchParams.get('tab'),limit=Number(url.searchParams.get('limit'))||50,offset=Number(url.searchParams.get('offset'))||0;let list=active();if(tab==='mine')list=list.filter(r=>r.assignedTo===member);if(tab==='unassigned')list=list.filter(r=>!r.assignedTo);return send(list.slice(offset,offset+limit));}
 if(path==='/me/profile'){if(req.method==='PUT')Object.assign(profile,body);return send(profile);}
 if(path==='/me/email-preferences'){if(req.method==='PUT')emailEnabled=body.enabled;return send({enabled:emailEnabled});}
 if(path==='/me/password'){if(body.currentPassword!==password)return send({detail:'The current password is incorrect.'},403);if(body.newPassword===password)return send({detail:'Choose a different password.'},400);password=body.newPassword;return send(null,204);}
 if(path==='/me/security')return send({mfaEnabled,mfaRequired:false,recoveryCodesRemaining:mfaEnabled?10:0});
 if(path==='/me/security/mfa/setup')return send({secret:'JBSWY3DPEHPK3PXP',provisioningUri:'otpauth://totp/Fixture?secret=JBSWY3DPEHPK3PXP'});
 if(path==='/me/security/mfa/enable'){mfaEnabled=true;return send({recoveryCodes:Array.from({length:10},(_,n)=>'fixture-code-'+n)});}
 if(path==='/me/security/sessions')return send(sessions);
 if(path==='/me/security/sessions/revoke-others'){sessions=sessions.filter(s=>s.current);return send({revoked:1});}
 if(path.startsWith('/me/security/sessions/')){sessions=sessions.filter(s=>s.familyId!==path.split('/').at(-1));return send({revoked:true});}
 if(path==='/me/notifications/unread-count')return send({unread:notices.filter(n=>!n.readAt).length});
 if(path==='/me/notifications/read'){for(const n of notices)if(!body.ids||body.ids.includes(n.id))n.readAt=now;return send({unread:notices.filter(n=>!n.readAt).length});}
 if(path==='/me/notifications'){const offset=Number(url.searchParams.get('offset'))||0,limit=Number(url.searchParams.get('limit'))||50;return send({items:notices.slice(offset,offset+limit),total:notices.length,unread:notices.filter(n=>!n.readAt).length,offset,limit});}
 if(path==='/me/reports')return send({items:[],total:0,limit:50,offset:0});if(path==='/me/verifications')return send([]);
 const match=path.match(/^\/(?:public\/)?issues\/([^/]+)(?:\/(.+))?$/);
 if(match){const row=rows.find(r=>r.id===match[1]);if(!row)return send({detail:'No such fixture complaint'},404);const verb=match[2];
  if(verb==='messages'){const list=messages.get(row.id)||[];if(req.method==='POST'){list.push({id:list.length+1,authorRole:'SUPERVISOR',kind:'REQUEST_INFO',body:body.body,createdAt:now});messages.set(row.id,list);return send(list.at(-1),201);}return send(list);}
  if(verb==='history')return send(history.get(row.id)||[]);
  if(verb==='reports')return send(reportMap.get(row.id)||[]);
  if(verb==='close'){if(['CLOSED','REJECTED'].includes(row.status))return send({status:409,detail:'This complaint is already terminal.'},409);const from=row.status;row.status='CLOSED';row.closedAt=now;const entry={fromStatus:from,toStatus:'CLOSED',actorRole:'ADMIN',createdAt:now,note:body.note};history.set(row.id,[...(history.get(row.id)||[]),entry]);auditRows.unshift({at:now,kind:'STATUS',issueId:row.id,issueRef:row.publicRef,category:row.categoryName,action:'CLOSED',fromStatus:from,toStatus:'CLOSED',level:null,actorRole:'ADMIN',actorName:session.fullName,note:body.note});return send(row);}
  if(verb==='assign'){row.status='ASSIGNED';row.assignedTo=body.assigneeId;return send(row);}
  if(verb==='reject'){row.status='REJECTED';return send(row);}
  if(['acknowledge','start','submit-for-verification'].includes(verb)){const from=row.status;if(verb==='submit-for-verification'&&(!body.proofPhotoUrl||body.note?.trim().length<20))return send({detail:'Photo and a 20-character repair note required.'},409);row.status=verb==='acknowledge'?'ACKNOWLEDGED':verb==='start'?'IN_PROGRESS':'PENDING_VERIFICATION';if(verb==='start')row.assignedTo=member;history.set(row.id,[...(history.get(row.id)||[]),{fromStatus:from,toStatus:row.status,actorRole:'STAFF',createdAt:now,note:body.note}]);return send(row);}
  return send(row);
 }
 if(path==='/public/issues/bbox')return send({items:active(),capped:false,cap:500});
 if(path==='/public/issues')return send({items:active().slice(0,25),total:active().length,offset:0,limit:25});
 return send({detail:'No fixture for '+path},404);
});
server.listen(port,'127.0.0.1',()=>console.log('Administrator fixture API ready on 127.0.0.1:'+port));
