// Isolated UI data at 127.0.0.1:8081. Never forwards authenticated requests or writes.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
const API='http://localhost:8080/api/v1',port=8081,now=new Date().toISOString();
const read=async path=>{const r=await fetch(API+path);if(!r.ok)throw Error('Public fixture source: '+r.status);return r.json();};
const [publicIssues,categories,wards]=await Promise.all([read('/public/issues?limit=1'),read('/categories'),read('/wards')]);
const issue={...publicIssues.items[0],id:randomUUID(),publicRef:'CT-2099-999901',status:'PENDING_VERIFICATION',resolutionNote:'QA fixture repair proof; no civic record is changed.',resolutionPhotoUrl:'https://res.cloudinary.com/demo/image/upload/sample.jpg'};
const session={accessToken:'fixture-access',refreshToken:'fixture-refresh',userId:randomUUID(),fullName:'Citizen UI fixture',role:'CITIZEN'};
const profile={userId:session.userId,email:'fixture-citizen@example.test',fullName:session.fullName,phone:null,role:'CITIZEN',departmentName:null,wardName:null,mutedNotificationTypes:[],mutableNotificationTypes:['RESOLVED','REOPENED','REJECTED','INFO_REQUESTED','CITIZEN_REPLIED']};
const reports=Array.from({length:125},(_,n)=>({reportId:randomUUID(),reportedAt:now,description:'QA report '+(n+1),landmark:'QA location '+(n+1),photoUrl:issue.resolutionPhotoUrl,merged:n%2===0,issue:{...issue,publicRef:'CT-2099-'+String(n+1).padStart(6,'0')}}));
const notifications=Array.from({length:125},(_,n)=>({id:n+1,issueId:issue.id,type:n===0?'VERIFY_REQUESTED':'RESOLVED',title:'QA notification '+(n+1),body:'An isolated frontend fixture update.',createdAt:now,readAt:null}));
const baseView={issue,beforePhotoUrl:issue.resolutionPhotoUrl,submittedAt:now,silenceDeadline:new Date(Date.now()+3600000).toISOString(),round:1,eligible:true,ineligibleReason:null,myVerdict:null,myReason:null,confirmations:0,rejections:0,required:2};
let following=false,emailEnabled=false,messages=[{id:1,authorRole:'STAFF',kind:'REQUEST_INFO',body:'QA: which side of the street is affected?',createdAt:now}],votes=null;
let sessions=[{familyId:randomUUID(),createdAt:now,lastUsedAt:now,expiresAt:now,revoked:false,current:true},{familyId:randomUUID(),createdAt:now,lastUsedAt:now,expiresAt:now,revoked:false,current:false}];
const failures=new Set(),captured=[];
const dashboard=new Map(await Promise.all(['/dashboard/summary','/dashboard/metrics','/dashboard/departments','/dashboard/breaching'].map(async path=>[path,await read(path)])));
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:'+port),path=url.pathname.replace(/^\/api\/v1/,'');
 const cors={'access-control-allow-origin':'*','access-control-allow-headers':'Authorization, Content-Type, Idempotency-Key','access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS'};
 const send=(body,status=200)=>{res.writeHead(status,{...cors,'content-type':'application/json'});res.end(status===204?'':JSON.stringify(body));};
 if(req.method==='OPTIONS')return send(null,204);
 let raw='';for await(const chunk of req)raw+=chunk;let body={};try{body=raw?JSON.parse(raw):{};}catch{return send({detail:'Malformed fixture request'},400);}
 if(path==='/__qa/control'){if(req.method==='POST'){if(body.fail)failures.add(body.fail);if(body.recover)failures.delete(body.recover);if(body.resetVote)votes=null;}return send({captured,failures:[...failures],following,messages:messages.length,votes,profile});}
 if(failures.has(req.method+' '+path))return send({status:503,detail:'QA temporary failure: '+path},503);
 if(req.method!=='GET'&&!path.startsWith('/auth/'))captured.push({method:req.method,path,body:path.includes('password')?{fixturePasswordRequest:true}:body});
 if(path==='/auth/login'||path==='/auth/refresh'||path==='/auth/register')return send(session,path==='/auth/register'?201:200);
 if(path==='/auth/logout')return send(null,204);
 if(path==='/me/profile'){if(req.method==='PUT')Object.assign(profile,body);return send(profile);}
 if(path==='/me/email-preferences'){if(req.method==='PUT')emailEnabled=body.enabled;return send({enabled:emailEnabled});}
 if(path==='/me/password')return send(null,204);
 if(path==='/me/security')return send({mfaEnabled:false,mfaRequired:false,recoveryCodesRemaining:0});
 if(path.startsWith('/me/security/mfa/'))return send({detail:'Authenticator support has been removed.'},410);
 if(path==='/me/security/sessions')return send(sessions);
 if(path==='/me/security/sessions/revoke-others'){sessions=sessions.filter(s=>s.current);return send({revoked:1});}
 if(path.startsWith('/me/security/sessions/')){sessions=sessions.filter(s=>s.familyId!==path.split('/').at(-1));return send({revoked:true});}
 if(path==='/me/reports'){const offset=Number(url.searchParams.get('offset'))||0,limit=Number(url.searchParams.get('limit'))||50;return send({items:reports.slice(offset,offset+limit),total:reports.length,offset,limit});}
 if(path==='/me/verifications')return send([{issue,silenceDeadline:baseView.silenceDeadline}]);
 if(path.startsWith('/me/verifications/'))return send({...baseView,myVerdict:votes?.verdict??null,confirmations:votes?.confirmations??0,rejections:votes?.rejections??0});
 if(path==='/me/notifications/unread-count')return send({unread:notifications.filter(n=>!n.readAt).length});
 if(path==='/me/notifications/read'){for(const n of notifications)if(!body.ids||body.ids.includes(n.id))n.readAt=now;return send({unread:notifications.filter(n=>!n.readAt).length});}
 if(path==='/me/notifications'){const offset=Number(url.searchParams.get('offset'))||0,limit=Number(url.searchParams.get('limit'))||50;return send({items:notifications.slice(offset,offset+limit),total:notifications.length,unread:notifications.filter(n=>!n.readAt).length,offset,limit});}
 if(path.endsWith('/follow')){if(req.method!=='GET')following=req.method==='POST';return send({following});}
 if(path.endsWith('/messages')){if(req.method==='POST'){const message={id:messages.length+1,authorRole:'CITIZEN',kind:'CITIZEN_REPLY',body:body.body,createdAt:now};messages.push(message);return send(message,201);}return send(messages);}
 if(path.endsWith('/verify')){votes={verdict:body.verdict,status:'PENDING_VERIFICATION',outcome:'STILL_OPEN',confirmations:body.verdict==='FIXED'?1:0,rejections:body.verdict==='NOT_FIXED'?1:0,required:2};return send(votes);}
 if(path==='/reports')return send({reportId:randomUUID(),issueId:issue.id,publicRef:issue.publicRef,clusterDecision:'MERGED',reportCount:2,distinctReporterCount:2,distanceToClusterM:5,effectiveRadiusM:25,projectedExtentM:8,needsReview:false,status:issue.status,dueAt:issue.effectiveDeadline,priorityBand:issue.priority,wardName:issue.wardName,departmentName:issue.departmentName,message:'Isolated QA submission'},201);
 if(path==='/categories')return send(categories);if(path==='/wards')return send(wards);
 if(path.endsWith('/history'))return send([{fromStatus:'IN_PROGRESS',toStatus:'PENDING_VERIFICATION',actorRole:'STAFF',createdAt:now,note:'QA repair proof submitted'}]);
 if(path.endsWith('/reports'))return send([{id:randomUUID(),sequence:1,photoUrl:issue.resolutionPhotoUrl,description:'QA report',lat:issue.lat,lng:issue.lng,gpsAccuracyM:10,manualPin:false,clusterDecision:'NEW_ISSUE',clusterDistanceM:null,effectiveRadiusM:null,projectedExtentM:null,createdAt:now,landmark:'QA location'}]);
 if(path==='/public/issues/bbox')return send({items:[issue],capped:false,cap:500});
 if(path==='/public/issues')return send({items:[issue],total:1,limit:25,offset:0});
 if(path.startsWith('/public/issues/'))return send(issue);
 if(dashboard.has(path))return send(dashboard.get(path));
 if(path.includes('/stream/'))return send({detail:'No live SSE in fixture mode'},503);
 return send({detail:'No fixture for '+path},404);
});
server.listen(port,'127.0.0.1',()=>console.log('Citizen fixture API ready on 127.0.0.1:'+port));
