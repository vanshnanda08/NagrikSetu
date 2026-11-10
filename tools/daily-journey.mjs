// Human-style UI workflow against disposable local data. No production writes.
import { chromium, expect as baseExpect } from 'playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

const APP=process.env.JOURNEY_APP??'http://localhost:3041';
const API=process.env.JOURNEY_API??'http://localhost:8088/api/v1';
for(const value of [APP,API]) assert.ok(['localhost','127.0.0.1'].includes(new URL(value).hostname),'Loopback service URLs required');
assert.equal(process.env.JOURNEY_SCRATCH,'1','Use only a disposable database');
assert.ok(process.env.JOURNEY_PASSWORD,'Provide the local bootstrap password');
const password=process.env.JOURNEY_PASSWORD;
const expect=baseExpect.configure({timeout:25000});
const output=resolve(process.env.JOURNEY_OUTPUT??'../artifacts/daily-journey');
const photos=resolve(process.env.JOURNEY_PHOTOS??output);
const stateDir=process.env.JOURNEY_STATE_DIR;
if(stateDir)await mkdir(stateDir,{recursive:true,mode:0o700});
await mkdir(output,{recursive:true});
const layoutsOnly=process.env.JOURNEY_LAYOUTS_ONLY==='1';
const supplement=process.env.JOURNEY_SUPPLEMENT==='1';
if(!layoutsOnly&&!supplement)assert.equal(await readFile(join(output,'completed.json'),'utf8').then(()=>true,()=>false),false,'Completed run already exists; inspect it instead of uploading again');
const result=process.env.JOURNEY_RESUME==='1'||layoutsOnly||supplement?JSON.parse(await readFile(join(output,'results.json'),'utf8')):{startedAt:new Date().toISOString(),environment:{app:APP,api:API,media:'Real Cloudinary uploads and strict server verification; synthetic images',data:'Disposable local database',municipalAuth:'Seeded accounts with normal password authentication and unchanged role/scope guards'},checks:[],http:[],errors:[],layouts:[],actors:{}};
delete result.failure;
const browser=await chromium.launch({channel:'chrome'});
const contexts=[];
const actors=[];
const sessions={};
let activePage;
const check=async(name,action)=>{if(result.checks.includes(name)){console.log('RESUME '+name);return;}await action();result.checks.push(name);console.log('PASS '+name);await save();};
const save=()=>writeFile(join(output,'results.json'),JSON.stringify(result,null,2).replaceAll(password,'[redacted]'));
async function actor(role){
  const stored=stateDir&&join(stateDir,role+'.json');
  const context=await browser.newContext({viewport:{width:1280,height:600},permissions:['geolocation'],geolocation:{latitude:30.386,longitude:76.326,accuracy:8},acceptDownloads:true,...(stored&&existsSync(stored)?{storageState:stored}:{})});contexts.push(context);
  const page=await context.newPage();page.setDefaultTimeout(25000);page.setDefaultNavigationTimeout(45000);
  page.on('pageerror',e=>result.errors.push({role,message:e.message}));
  page.on('response',async response=>{
    const request=response.request(),url=new URL(response.url());
    if(url.origin===new URL(API).origin||url.pathname.startsWith('/api/auth/')){
      result.http.push({role,method:request.method(),path:url.pathname,status:response.status()});
      if(url.pathname==='/api/auth/login'||url.pathname==='/api/auth/register'||url.pathname==='/api/auth/refresh'){
        if(response.ok())try{sessions[role]=await response.json();}catch{}
      }
    }
    if(url.hostname==='api.cloudinary.com'&&request.method()==='POST')result.http.push({role,method:'POST',path:'Cloudinary image upload',status:response.status()});
  });
  const a={context,page,role};actors.push(a);return a;
}
async function screenshot(a,name){activePage=a.page;await a.page.screenshot({path:join(output,name+'.png'),fullPage:false});}
async function register(a,email,name){
  activePage=a.page;await a.page.goto(APP+'/register');const d=a.page.getByRole('dialog',{name:'Create an account'});
  await d.getByLabel('Your name',{exact:true}).fill(name);await d.getByLabel('Email',{exact:true}).fill(email);await d.getByLabel('Password',{exact:true}).fill(password);
  await d.getByRole('button',{name:'Create account',exact:true}).click();await expect(d).not.toBeVisible();await expect(a.page.getByRole('button',{name:'Your account',exact:true})).toBeVisible();
  result.actors[a.role]=email;
}
async function login(a,email){
  activePage=a.page;await a.page.goto(APP+'/dashboard');
  await expect.poll(async()=>await a.page.getByRole('button',{name:'Your account',exact:true}).isVisible()||await a.page.getByRole('button',{name:'Sign in',exact:true}).isVisible()).toBe(true);
  if(await a.page.getByRole('button',{name:'Your account',exact:true}).isVisible()){result.actors[a.role]=email;return;}
  await a.page.getByRole('button',{name:'Sign in',exact:true}).click();const d=a.page.getByRole('dialog',{name:'Sign in',exact:true});
  await d.getByLabel('Email',{exact:true}).fill(email);await d.getByLabel('Password',{exact:true}).fill(password);await d.getByRole('button',{name:'Sign in',exact:true}).click();await expect(d).not.toBeVisible();await expect(a.page.getByRole('button',{name:'Your account',exact:true})).toBeVisible();
  result.actors[a.role]=email;
}
async function api(a,path,method='GET',body){
  assert.ok(sessions[a.role]?.accessToken,'A real UI login/refresh is required');
  const response=await a.context.request.fetch(API+path,{method,headers:{Authorization:'Bearer '+sessions[a.role].accessToken},...(body===undefined?{}:{data:body})});
  return response;
}
async function publicIssue(id){const r=await fetch(API+'/public/issues/'+id);assert.equal(r.status,200);return r.json();}
async function status(id,value){await expect.poll(async()=>(await publicIssue(id)).status).toBe(value);}
async function submit(a,photo,description){
  activePage=a.page;await a.page.goto(APP+'/report');await a.page.getByRole('combobox',{name:/^What is the problem/}).selectOption('POTHOLE');
  await a.page.locator('#photo').setInputFiles(join(photos,photo));await a.page.getByRole('button',{name:'Take a different photo',exact:true}).waitFor();
  await a.page.getByLabel('Description (optional)',{exact:true}).fill(description);await a.page.getByLabel('Landmark (optional)',{exact:false}).fill('Synthetic daily journey — no municipal action required');
  const manual=a.page.getByRole('button',{name:'Place the pin myself instead',exact:true});
  if(await manual.isVisible())await manual.click();
  const map=a.page.locator('.report-map .leaflet-container');await map.waitFor();await map.click({position:{x:240,y:150}});
  await screenshot(a,a.role+'-prepared');
  const posted=a.page.waitForResponse(r=>r.url()===API+'/reports'&&r.request().method()==='POST');
  await a.page.getByRole('button',{name:/^Send report/}).click();const response=await posted;assert.equal(response.status(),201,await response.text());const receipt=await response.json();
  await a.page.waitForURL('**/report/success/'+receipt.publicRef);await expect(a.page.getByText(receipt.publicRef,{exact:true}).first()).toBeVisible();await screenshot(a,a.role+'-receipt');return receipt;
}
async function work(a,id,view='mine'){
  activePage=a.page;await a.page.goto(APP+`/work?view=${view}&tab=all&issue=${id}`);const panel=a.page.getByRole('region',{name:'Selected complaint',exact:true});await panel.getByRole('heading',{name:'Pothole',exact:true}).waitFor();return panel;
}
async function proof(a,id,photo,note){
  const panel=await work(a,id);await panel.locator('#photo').setInputFiles(join(photos,photo));await panel.getByRole('button',{name:'Take a different photo',exact:true}).waitFor();await panel.getByLabel('What was done', {exact:false}).fill(note);
  await panel.getByRole('button',{name:'Submit for citizen verification',exact:true}).click();await status(id,'PENDING_VERIFICATION');await screenshot(a,photo.replace('.jpg','')+'-submitted');
}
async function vote(a,id,fixed){
  activePage=a.page;await a.page.goto(APP+'/me/verify/'+id);await a.page.getByRole('button',{name:fixed?'Fixed':'Not fixed',exact:true}).click();
  if(!fixed)await a.page.getByLabel('What is still wrong? (optional)',{exact:true}).fill('Synthetic check: repair remains uneven; please repair the edge.');
  await a.page.getByRole('button',{name:fixed?'Send: fixed':'Send: not fixed',exact:true}).click();await status(id,fixed?'RESOLVED':'REOPENED');await screenshot(a,fixed?'citizen-confirmed':'citizen-reopened');
}
async function layout(a,path,label){
  for(const [width,height] of [[1280,600],[1366,768],[1440,900],[1920,1080],[390,844],[768,1024]]){
    activePage=a.page;await a.page.setViewportSize({width,height});await a.page.goto(APP+path);await a.page.locator('main h1:visible').waitFor();await expect(a.page.getByText('Loading…',{exact:true})).toHaveCount(0);
    // Wait for the relevant real record instead of photographing skeletons.
    if(path.includes('issue='))await a.page.getByRole('region',{name:'Selected complaint',exact:true}).getByRole('heading',{name:'Pothole',exact:true}).waitFor();
    if(path.startsWith('/issues/')){
      await a.page.locator('.issue-photo-strip .evidence-photo-open img').first().waitFor();
      await expect.poll(()=>a.page.locator('.issue-photo-strip .evidence-photo-open img').evaluateAll(images=>images.length>0&&images.every(image=>image.complete&&image.naturalWidth>0)),{timeout:45000}).toBe(true);
      await a.page.locator('.leaflet-container .leaflet-tile-loaded').first().waitFor({timeout:45000});
    }
    const dimensions=await a.page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
    assert.ok(dimensions.scrollWidth<=width+1,`${label}: horizontal overflow at ${width}`);
    if(width>=1280)assert.ok(dimensions.scrollHeight<=height+1,`${label}: outer-page overflow at ${width}x${height}`);
    result.layouts=result.layouts.filter(item=>item.label!==label||item.width!==width||item.height!==height);
    result.layouts.push({label,...dimensions});await screenshot(a,`${label}-${width}x${height}`);
  }
  await a.page.setViewportSize({width:1280,height:600});
}

try{
  const citizen=await actor('citizen'),neighbor=await actor('neighbor'),supervisor=await actor('supervisor'),staff=await actor('staff'),admin=await actor('admin'),guest=await actor('public');
  if(process.env.JOURNEY_RESUME==='1'||supplement)for(const a of actors){if(result.actors?.[a.role])await login(a,result.actors[a.role]);}
  if(layoutsOnly){
    const id=result.issue.id;
    for(const [a,path,label] of [[citizen,'/me/reports','citizen-reports'],[staff,`/work?view=mine&issue=${id}`,'staff-work'],[supervisor,`/work?view=assignments&tab=all&issue=${id}`,'supervisor-work'],[admin,'/admin?view=audit','admin-audit'],[guest,'/issues/'+id,'public-detail']]){
      if(result.layouts.filter(item=>item.label===label).length===6)continue;
      if(result.actors?.[a.role])await login(a,result.actors[a.role]);await layout(a,path,label);
    }
    result.loadedLayoutRerun=true;console.log('PASS 30 layout captures; public evidence and map tiles loaded');
  }else{
  const tag=Date.now();
  await check('Citizen registers through UI and remains signed in after reload',async()=>{
    await register(citizen,`daily-${tag}@example.test`,'Daily QA Citizen');await citizen.page.reload();await expect(citizen.page.getByRole('button',{name:'Your account',exact:true})).toBeVisible();await expect(citizen.page.getByRole('heading',{name:'Track your complaint',exact:true})).toHaveCount(0);
  });
  let receipt=result.issue,id=receipt?.id;
  await check('Logged-in citizen uploads a real photo and submits one complaint',async()=>{receipt=await submit(citizen,'photo-0.jpg','SYNTHETIC LOCAL QA: reported road defect for daily workflow testing. No municipal action required.');id=receipt.issueId;assert.ok(id);result.issue={id,publicRef:receipt.publicRef};});
  await check('Receipt appears in My reports, with original evidence and persisted identity',async()=>{
    await citizen.page.goto(APP+'/me/reports');await expect(citizen.page.getByText(receipt.publicRef,{exact:true}).first()).toBeVisible();const own=await (await api(citizen,'/me/reports')).json();assert.equal(own.total,1);
    const reports=await (await fetch(API+'/public/issues/'+id+'/reports')).json();assert.equal(reports.length,1);assert.equal((await fetch(reports[0].photoUrl)).status,200);
  });
  await check('Second citizen reports the same location; reports group without losing evidence',async()=>{
    await register(neighbor,`neighbor-${tag}@example.test`,'Neighbor QA Citizen');const merged=await submit(neighbor,'photo-0.jpg','SYNTHETIC LOCAL QA: neighbor observed the same road defect.');assert.equal(merged.issueId,id);assert.equal((await publicIssue(id)).reportCount,2);
  });
  await check('Supervisor signs in, sees the complaint, acknowledges it and assigns Roads crew',async()=>{
    await login(supervisor,'head.roads@civictrack.example');const panel=await work(supervisor,id,'assignments');await panel.getByLabel('Note (optional)',{exact:true}).fill('Daily QA: inspected report and accepted departmental responsibility.');await panel.getByRole('button',{name:'Acknowledge',exact:true}).click();await status(id,'ACKNOWLEDGED');
    await panel.getByRole('radio',{name:/Roads Crew Member/}).check();await panel.getByLabel('Note (optional)',{exact:true}).fill('Daily QA: assign to the roads crew for repair.');await panel.getByRole('button',{name:'Assign',exact:true}).click();await status(id,'ASSIGNED');await screenshot(supervisor,'supervisor-assigned');
  });
  await check('Assigned staff starts work and requests private clarification',async()=>{
    await login(staff,'crew.roads@civictrack.example');const panel=await work(staff,id);await panel.getByLabel('Note (optional)',{exact:true}).fill('Daily QA: crew on site; starting safe repair.');await panel.getByRole('button',{name:'Start work',exact:true}).click();await status(id,'IN_PROGRESS');
    await panel.getByLabel('Request information from reporters',{exact:true}).fill('Daily QA private question: is the damaged edge beside the crossing?');await panel.getByRole('button',{name:'Send message',exact:true}).click();await expect(panel.getByText('Daily QA private question: is the damaged edge beside the crossing?',{exact:true})).toBeVisible();await screenshot(staff,'staff-working');
  });
  await check('Citizen receives clarification notification, replies, and staff sees the answer',async()=>{
    activePage=citizen.page;await citizen.page.goto(APP+'/me/notifications');await expect(citizen.page.getByText(/information|question/i).first()).toBeVisible();await citizen.page.goto(APP+'/issues/'+id);await citizen.page.getByRole('tab',{name:'Updates & questions',exact:true}).click();await citizen.page.getByLabel('Reply to the department',{exact:true}).fill('Daily QA private answer: yes, beside the crossing.');await citizen.page.getByRole('button',{name:'Send message',exact:true}).click();await expect(citizen.page.getByText('Daily QA private answer: yes, beside the crossing.',{exact:true})).toBeVisible();
    await work(staff,id);await expect(staff.page.getByText('Daily QA private answer: yes, beside the crossing.',{exact:true})).toBeVisible();
    await guest.page.goto(APP+'/issues/'+id);await expect(guest.page.getByRole('heading',{name:'Pothole',exact:true})).toBeVisible();await expect(guest.page.getByText(/Daily QA private/)).toHaveCount(0);
  });
  await check('Repair proof validates missing fields, then uploads and requests citizen verification',async()=>{
    const panel=staff.page.getByRole('region',{name:'Selected complaint',exact:true});await panel.getByRole('button',{name:'Submit for citizen verification',exact:true}).click();await expect(panel.getByRole('alert').first()).toBeVisible();assert.equal((await publicIssue(id)).status,'IN_PROGRESS');await proof(staff,id,'photo-1.jpg','Daily QA first repair: filled the defect but an edge remains uneven.');
  });
  await check('Citizen rejects the first repair; complaint reopens rather than closes',async()=>{await vote(citizen,id,false);});
  await check('Staff restarts reopened work and uploads corrected repair proof',async()=>{
    const panel=await work(staff,id);await panel.getByRole('button',{name:'Start work',exact:true}).click();await status(id,'IN_PROGRESS');await proof(staff,id,'photo-2.jpg','Daily QA corrected repair: leveled the patch and compacted all edges.');
  });
  await check('Eligible citizen confirms the second repair; complaint becomes resolved',async()=>{await vote(citizen,id,true);const detail=await publicIssue(id);assert.equal(detail.resolvedWithoutVerification,false);});
  await check('Administrator reviews resolved complaint, cancels once, then closes with an audited reason',async()=>{
    await login(admin,'commissioner@civictrack.example');const panel=await work(admin,id,'assignments');await expect(panel.getByRole('button',{name:'Close complaint',exact:true})).toBeDisabled();await panel.getByLabel('Closure reason (at least 20 characters)',{exact:true}).fill('Daily QA: repair confirmed by the original reporter; reviewed evidence and closing.');await panel.getByRole('button',{name:'Close complaint',exact:true}).click();let d=admin.page.getByRole('dialog',{name:'Close '+receipt.publicRef+'?',exact:true});await d.getByRole('button',{name:'Cancel',exact:true}).click();await status(id,'RESOLVED');await panel.getByRole('button',{name:'Close complaint',exact:true}).click();d=admin.page.getByRole('dialog',{name:'Close '+receipt.publicRef+'?',exact:true});await d.getByRole('button',{name:'Confirm closure',exact:true}).click();await status(id,'CLOSED');await screenshot(admin,'administrator-closed');
  });
  await check('Administrator filters the audit and exports real CSV with the closure reason',async()=>{
    await admin.page.goto(APP+'/admin?view=audit');await admin.page.getByLabel('Ticket',{exact:true}).fill(receipt.publicRef);await admin.page.getByRole('button',{name:'Apply',exact:true}).click();await expect(admin.page.getByText('Daily QA: repair confirmed by the original reporter; reviewed evidence and closing.',{exact:true})).toBeVisible();
    const downloaded=admin.page.waitForEvent('download');await admin.page.getByRole('button',{name:'Export CSV',exact:true}).click();const download=await downloaded;await download.saveAs(join(output,'audit.csv'));assert.match(await readFile(join(output,'audit.csv'),'utf8'),/reviewed evidence and closing/);
  });
  await check('Closed state persists across citizen, staff and public reloads; private messages stay private',async()=>{
    for(const a of [citizen,staff,guest]){await a.page.goto(APP+'/issues/'+id);await expect(a.page.getByText('Closed',{exact:true}).first()).toBeVisible();}
    await expect(guest.page.getByText(/Daily QA private/)).toHaveCount(0);const history=await (await fetch(API+'/public/issues/'+id+'/history')).json();result.history=history;assert.equal(history.filter(x=>x.toStatus==='CLOSED').length,1);
  });
  await check('Daily role permissions reject citizen assignment/closure and staff closure',async()=>{
    for(const [a,verb] of [[citizen,'assign'],[citizen,'close'],[staff,'close']]){const r=await api(a,`/issues/${id}/${verb}`,'POST',verb==='assign'?{assigneeId:sessions.staff.userId}:{note:'Unauthorized QA close attempt must be denied.'});assert.equal(r.status(),403);}
  });
  await check('Citizen follow and unfollow preserve report counts and priority',async()=>{
    activePage=citizen.page;const before=await publicIssue(id);await citizen.page.goto(APP+'/issues/'+id);await citizen.page.getByRole('tab',{name:'Updates & questions',exact:true}).click();await citizen.page.getByRole('button',{name:'Follow this issue',exact:true}).click();await expect(citizen.page.getByRole('button',{name:'Stop following',exact:true})).toBeVisible();await citizen.page.getByRole('button',{name:'Stop following',exact:true}).click();await expect(citizen.page.getByRole('button',{name:'Follow this issue',exact:true})).toBeVisible();const after=await publicIssue(id);assert.equal(after.reportCount,before.reportCount);assert.equal(after.priorityScore,before.priorityScore);
  });
  await check('Citizen reads notifications and saves profile details across reload',async()=>{
    activePage=citizen.page;await citizen.page.goto(APP+'/me/notifications');const allRead=citizen.page.getByRole('button',{name:'Mark all read',exact:true});await allRead.waitFor();await allRead.click();await expect(citizen.page.getByText(/All read/).first()).toBeVisible();
    await citizen.page.goto(APP+'/me/settings');await citizen.page.getByLabel('Name',{exact:true}).fill('Daily QA Citizen Updated');await citizen.page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(citizen.page.getByText('Saved.',{exact:true})).toBeVisible();await citizen.page.reload();await expect(citizen.page.getByLabel('Name',{exact:true})).toHaveValue('Daily QA Citizen Updated');await screenshot(citizen,'citizen-profile-saved');
  });
  await check('Warm-browser offline report saves locally and delivers exactly once after reconnect',async()=>{
    activePage=citizen.page;await citizen.page.goto(APP+'/report/outbox');await expect(citizen.page.getByRole('button',{name:'Your account',exact:true})).toBeVisible();await expect(citizen.page.getByText('No queued reports on this device.',{exact:true})).toBeVisible();await citizen.page.getByRole('link',{name:'Back to reporting',exact:true}).click();await expect(citizen.page.getByRole('button',{name:'Your account',exact:true})).toBeVisible();
    await citizen.page.getByRole('combobox',{name:/^What is the problem/}).selectOption('POTHOLE');await citizen.page.locator('#photo').setInputFiles(join(photos,'photo-0.jpg'));await citizen.page.getByRole('button',{name:'Take a different photo',exact:true}).waitFor();await citizen.page.getByLabel('Description (optional)',{exact:true}).fill('SYNTHETIC LOCAL QA: warm-browser offline report; no municipal action required.');
    // A separate defect location avoids the real same-device nearby-report cooldown.
    const manual=citizen.page.getByRole('button',{name:'Place the pin myself instead',exact:true});if(await manual.isVisible())await manual.click();await citizen.page.locator('.report-map .leaflet-container').click({position:{x:80,y:150}});
    const before=await (await api(citizen,'/me/reports')).json();await citizen.context.setOffline(true);await citizen.page.getByRole('button',{name:/^Send report/}).click();await citizen.page.waitForURL('**/report/outbox');await citizen.page.getByRole('heading',{name:'Waiting to send',exact:true}).waitFor();await screenshot(citizen,'citizen-offline-waiting');
    await citizen.context.setOffline(false);const retry=citizen.page.getByRole('button',{name:'Retry now',exact:true});if(await retry.isVisible())await retry.click();await citizen.page.getByRole('heading',{name:'Sent',exact:true}).waitFor({timeout:90000});await citizen.page.reload();await citizen.page.getByRole('heading',{name:'Sent',exact:true}).waitFor();await expect(citizen.page.getByRole('button',{name:'Your account',exact:true})).toBeVisible();await expect(citizen.page.getByRole('button',{name:'Retry now',exact:true})).toHaveCount(0);
    const after=await (await api(citizen,'/me/reports')).json();assert.equal(after.total,before.total+1);result.offlineReceipt=await citizen.page.locator('main').getByRole('link',{name:/^CT-/}).innerText();await screenshot(citizen,'citizen-offline-sent');
  });
  await check('Desktop and mobile daily screens fit, with internal scrolling and no horizontal overflow',async()=>{
    await layout(citizen,'/me/reports','citizen-reports');await layout(staff,`/work?view=mine&issue=${id}`,'staff-work');await layout(supervisor,`/work?view=assignments&tab=all&issue=${id}`,'supervisor-work');await layout(admin,'/admin?view=audit','admin-audit');await layout(guest,'/issues/'+id,'public-detail');
  });
  await check('Signing out from each role returns to the general dashboard',async()=>{
    for(const a of [citizen,neighbor,staff,supervisor,admin]){activePage=a.page;await a.page.getByRole('button',{name:'Your account',exact:true}).click();await a.page.getByRole('button',{name:'Sign out',exact:true}).click();await a.page.waitForURL('**/dashboard');await expect(a.page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();}
  });
  assert.deepEqual(result.errors,[],'Application runtime errors');result.finishedAt=new Date().toISOString();await writeFile(join(output,'completed.json'),JSON.stringify({issue:result.issue,checks:result.checks.length,layouts:result.layouts.length},null,2));console.log('COMPLETE '+JSON.stringify(result.issue));
  }
}catch(error){result.failure={message:error.message,stack:error.stack};if(activePage){await activePage.screenshot({path:join(output,'failure.png')}).catch(()=>{});await writeFile(join(output,'failure-page.txt'),await activePage.locator('body').innerText().catch(()=>''));}console.error('FAIL '+error.message.split('Call log:')[0].replaceAll(password,'[redacted]'));process.exitCode=1;}
finally{await save();if(stateDir)await Promise.all(actors.map(a=>a.context.storageState({path:join(stateDir,a.role+'.json')})));await Promise.all(contexts.map(c=>c.close()));await browser.close();}
