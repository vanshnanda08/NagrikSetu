// Isolated staff UI dry run. Only public seed reads reach the real API; writes stay in memory.
// Run the frontend separately at http://127.0.0.1:3003 with both API bases pointing here.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
const port=8081, api='http://localhost:8080/api/v1', now=new Date().toISOString();
const read=async path=>{const r=await fetch(api+path);if(!r.ok)throw Error('Fixture seed read failed: '+r.status);return r.json();};
const [page,categories,wards]=await Promise.all([read('/public/issues?limit=1'),read('/categories'),read('/wards')]);
const base=page.items[0],category=categories.find(c=>c.code==='POTHOLE'),ward=wards[0];
const member=randomUUID(),other=randomUUID(),department=category.departmentId;
const session={accessToken:'isolated-staff-access',refreshToken:'isolated-staff-refresh',userId:member,fullName:'Staff UI fixture',role:'STAFF'};
const profile={userId:member,email:'fixture-staff@example.test',fullName:session.fullName,phone:null,role:'STAFF',mutedNotificationTypes:[],mutableNotificationTypes:['RESOLVED','REOPENED','REJECTED','INFO_REQUESTED','CITIZEN_REPLIED']};
const states=['NEW','ACKNOWLEDGED','ASSIGNED','IN_PROGRESS','REOPENED','PENDING_VERIFICATION','ASSIGNED'];
let rows=Array.from({length:125},(_,i)=>({...base,id:randomUUID(),publicRef:`CT-2099-${String(i+1).padStart(6,'0')}`,categoryCode:'POTHOLE',categoryName:category.displayName,wardId:ward.id,wardName:ward.name,departmentId:department,departmentName:'Roads fixture department',status:states[i%7],priority:'HIGH',priorityScore:1000-i,assignedTo:[2,3,5].includes(i%7)?member:i%7===6?other:null,firstReportedAt:now,dueAt:now,effectiveDeadline:now,pausedSeconds:0,landmark:`Isolated test location ${i+1}`,escalationLevel:0}));
let password='fixture-pass-1234', emailEnabled=false,empty=false;
let sessions=[{familyId:randomUUID(),createdAt:now,lastUsedAt:now,expiresAt:now,current:true,revoked:false},{familyId:randomUUID(),createdAt:now,lastUsedAt:now,expiresAt:now,current:false,revoked:false}];
const notices=Array.from({length:125},(_,i)=>({id:i+1,issueId:rows[i].id,type:'CITIZEN_REPLIED',title:`QA citizen reply ${i+1}`,body:'An isolated staff notification.',createdAt:now,readAt:null}));
const messages=new Map(),history=new Map(),failures=new Set(),captured=[];
const running=r=>!['PENDING_VERIFICATION','RESOLVED','CLOSED','REJECTED'].includes(r.status);
const active=()=>empty?[]:rows.filter(r=>!['RESOLVED','CLOSED','REJECTED'].includes(r.status));
const summary=()=>{const all=active(),mine=all.filter(r=>r.assignedTo===member),overdue=r=>running(r)&&Date.parse(r.effectiveDeadline)<Date.now();return {department:{id:department,name:'Roads fixture department'},ward:null,personal:{open:mine.length,overdue:mine.filter(overdue).length,readyToStart:mine.filter(r=>['ASSIGNED','REOPENED'].includes(r.status)).length,inProgress:mine.filter(r=>r.status==='IN_PROGRESS').length,awaitingVerification:mine.filter(r=>r.status==='PENDING_VERIFICATION').length},departmentWork:{open:all.length,overdue:all.filter(overdue).length,needsAssignment:all.filter(r=>['NEW','ACKNOWLEDGED'].includes(r.status)).length,awaitingVerification:all.filter(r=>r.status==='PENDING_VERIFICATION').length},stages:['NEW','REOPENED','ACKNOWLEDGED','ASSIGNED','IN_PROGRESS','PENDING_VERIFICATION'].map(status=>({status,total:all.filter(r=>r.status===status).length,mine:mine.filter(r=>r.status===status).length})),myPriorities:mine.slice(0,6),departmentPriorities:all.slice(0,6),previewLimit:6,generatedAt:new Date().toISOString()};};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:'+port),path=url.pathname.replace(/^\/api\/v1/,'');
 const cors={'access-control-allow-origin':'*','access-control-allow-headers':'Authorization, Content-Type, Idempotency-Key','access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS'};
 const send=(body,status=200)=>{res.writeHead(status,{...cors,'content-type':'application/json'});res.end(status===204?'':JSON.stringify(body));};
 if(req.method==='OPTIONS')return send(null,204);
 let raw='';for await(const chunk of req)raw+=chunk;let body={};try{body=raw?JSON.parse(raw):{};}catch{return send({detail:'Malformed fixture request'},400);}
 if(path==='/__qa/control'){if(req.method==='POST'){if(body.fail)failures.add(body.fail);if(body.recover)failures.delete(body.recover);if(typeof body.empty==='boolean')empty=body.empty;}return send({captured,failures:[...failures],empty,rows:rows.slice(0,7).map(r=>({id:r.id,publicRef:r.publicRef,status:r.status})),profile});}
 if(failures.has(req.method+' '+path))return send({status:503,detail:'QA temporary failure: '+path},503);
 if(req.method!=='GET'&&!path.startsWith('/auth/'))captured.push({method:req.method,path,body:path.includes('password')?{passwordRequest:true}:body});
 if(path==='/auth/login')return body.password===password?send(session):send({detail:'Invalid fixture credentials'},401);
 if(path==='/auth/refresh')return send(session);if(path==='/auth/logout')return send(null,204);
 if(path==='/categories')return send(categories);if(path==='/wards')return send(wards);
 if(path==='/staff/overview')return send(summary());
 if(path==='/staff/queue'){const tab=url.searchParams.get('tab'),limit=Number(url.searchParams.get('limit'))||50,offset=Number(url.searchParams.get('offset'))||0;let list=active();if(tab==='mine')list=list.filter(r=>r.assignedTo===member);if(tab==='unassigned')list=list.filter(r=>!r.assignedTo);return send(list.slice(offset,offset+limit));}
 if(path==='/me/profile'){if(req.method==='PUT')Object.assign(profile,body);return send(profile);}
 if(path==='/me/email-preferences'){if(req.method==='PUT')emailEnabled=body.enabled;return send({enabled:emailEnabled});}
 if(path==='/me/password'){if(body.currentPassword!==password)return send({detail:'The current password is incorrect.'},403);if(body.newPassword===password)return send({detail:'Choose a different password.'},400);password=body.newPassword;return send(null,204);}
 if(path==='/me/security')return send({mfaEnabled:false,mfaRequired:false,recoveryCodesRemaining:0});
 if(path.startsWith('/me/security/mfa/'))return send({detail:'Authenticator support has been removed.'},410);
 if(path==='/me/security/sessions')return send(sessions);
 if(path==='/me/security/sessions/revoke-others'){sessions=sessions.filter(s=>s.current);return send({revoked:1});}
 if(path.startsWith('/me/security/sessions/')){sessions=sessions.filter(s=>s.familyId!==path.split('/').at(-1));return send({revoked:true});}
 if(path==='/me/notifications/unread-count')return send({unread:notices.filter(n=>!n.readAt).length});
 if(path==='/me/notifications/read'){for(const n of notices)if(!body.ids||body.ids.includes(n.id))n.readAt=now;return send({unread:notices.filter(n=>!n.readAt).length});}
 if(path==='/me/notifications'){const offset=Number(url.searchParams.get('offset'))||0,limit=Number(url.searchParams.get('limit'))||50;return send({items:notices.slice(offset,offset+limit),total:notices.length,unread:notices.filter(n=>!n.readAt).length,offset,limit});}
 if(path==='/me/reports')return send({items:[],total:0,limit:50,offset:0});if(path==='/me/verifications')return send([]);
 const match=path.match(/^\/(?:public\/)?issues\/([^/]+)(?:\/(.+))?$/);
 if(match){const row=rows.find(r=>r.id===match[1]);if(!row)return send({detail:'No such fixture complaint'},404);const verb=match[2];
  if(verb==='messages'){const list=messages.get(row.id)||[];if(req.method==='POST'){list.push({id:list.length+1,authorRole:'STAFF',kind:'REQUEST_INFO',body:body.body,createdAt:now});messages.set(row.id,list);return send(list.at(-1),201);}return send(list);}
  if(verb==='history')return send(history.get(row.id)||[]);
  if(verb==='reports')return send([]);
  if(['acknowledge','start','submit-for-verification'].includes(verb)){const from=row.status;if(verb==='submit-for-verification'&&(!body.proofPhotoUrl||body.note?.trim().length<20))return send({detail:'Photo and a 20-character repair note required.'},409);row.status=verb==='acknowledge'?'ACKNOWLEDGED':verb==='start'?'IN_PROGRESS':'PENDING_VERIFICATION';if(verb==='start')row.assignedTo=member;history.set(row.id,[...(history.get(row.id)||[]),{fromStatus:from,toStatus:row.status,actorRole:'STAFF',createdAt:now,note:body.note}]);return send(row);}
  return send(row);
 }
 if(path==='/public/issues/bbox')return send({items:active(),capped:false,cap:500});
 if(path==='/public/issues')return send({items:active().slice(0,25),total:active().length,offset:0,limit:25});
 return send({detail:'No fixture for '+path},404);
});
server.listen(port,'127.0.0.1',()=>console.log('Staff fixture API ready on 127.0.0.1:'+port));
