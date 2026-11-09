// Local scratch data only. Real password/outbox writes never target a deployed API.
import { chromium, expect } from 'playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP=process.env.SCREENS_APP??'http://localhost:3040';
const API=process.env.VERIFY_API??'http://localhost:8087/api/v1';
for(const url of [APP,API]) assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname),'Loopback URLs required');
assert.equal(process.env.VERIFY_SCRATCH,'1','Explicitly acknowledge a disposable local database with VERIFY_SCRATCH=1');
const output=new URL('../artifacts/release-followup/',import.meta.url);await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),checks=[],errors=[],limitations=[];
const record=name=>{checks.push(name);console.log('PASS '+name);};
const context=await browser.newContext({viewport:{width:1280,height:600}});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
let installContext,installProfile;
async function tileZoom(){return page.locator('.leaflet-tile-pane').evaluate(pane=>{
  const levels=[...pane.querySelectorAll('.leaflet-tile-container')].sort((a,b)=>Number(b.style.zIndex)-Number(a.style.zIndex));
  return Number(levels[0]?.querySelector('img')?.src.match(/\/(\d+)\/\d+\/\d+\.png/)?.[1]);
});}
async function jobValue(id){return page.evaluate(id=>new Promise((resolve,reject)=>{const r=indexedDB.open('civictrack-offline',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('outbox');const q=tx.objectStore('outbox').get(id);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);tx.oncomplete=()=>db.close();};r.onerror=()=>reject(r.error);}),id);}
try{
  await page.goto(APP+'/report');const map=page.locator('.report-map .leaflet-container');await map.waitFor();
  await expect.poll(tileZoom).toBe(15);
  await map.getByRole('button',{name:'Zoom out',exact:true}).click();await page.waitForTimeout(300);
  await map.getByRole('button',{name:'Zoom out',exact:true}).click();await expect.poll(tileZoom).toBe(13);
  await map.click({position:{x:180,y:100}});await page.getByText(/30\.\d{5}, 76\.\d{5}/).waitFor();await expect.poll(tileZoom).toBe(13);
  await map.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');await expect.poll(tileZoom).toBe(13);
  record('Report map opens at zoom 15 and preserves zoom 13 after pointer and keyboard pin placement');
  await page.screenshot({path:fileURLToPath(new URL('report-map-1280.png',output))});
  const description=page.getByLabel('Description (optional)',{exact:true});await description.fill('Disposable draft to verify discard');await page.waitForTimeout(600);await page.reload();await expect(description).toHaveValue('Disposable draft to verify discard');
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Discard draft',exact:true}).click();await expect(description).toHaveValue('');await page.reload();await expect(description).toHaveValue('');record('Draft reload preserves details; confirmed discard remains cleared after another reload');
  await page.goto(APP+'/issues?view=map');await page.locator('.map-workspace .civictrack-marker').first().waitFor();
  const marker=page.locator('.map-workspace .civictrack-marker').first();await marker.focus();await page.keyboard.press('Enter');
  await page.locator('.issue-detail-panel').waitFor();record('Browse-map marker opens complaint details using Enter');
  await page.locator('.issue-detail-panel').getByRole('button',{name:/Close/}).click();await marker.focus();await page.keyboard.press('Space');await page.locator('.issue-detail-panel').waitFor();record('Browse-map marker also supports Space activation');
  for(const path of ['/forgot-password','/reset-password']){await page.goto(APP+path);await expect(page.locator('main')).toContainText('currently unavailable');await expect(page.locator('main form')).toHaveCount(0);}
  record('Deferred recovery screens do not offer an unavailable email reset');

  const quota=await browser.newContext({serviceWorkers:'block'});const quotaPage=await quota.newPage();await quotaPage.goto(APP+'/report');
  const quotaMap=quotaPage.locator('.report-map .leaflet-container');await quotaMap.waitFor();await quotaMap.click({position:{x:180,y:100}});
  const photo=await quotaPage.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=80;c.getContext('2d').fillRect(0,0,80,80);return c.toDataURL('image/png').split(',')[1];});
  await quotaPage.locator('#photo').setInputFiles({name:'quota-fixture.png',mimeType:'image/png',buffer:Buffer.from(photo,'base64')});await quotaPage.getByRole('button',{name:'Take a different photo',exact:true}).waitFor();
  await quotaPage.getByRole('combobox',{name:/^What is the problem/}).selectOption('POTHOLE');await quotaPage.getByLabel('Description (optional)',{exact:true}).fill('Keep this draft after storage failure');
  await quotaPage.evaluate(()=>{indexedDB.open=()=>{throw new DOMException('Device storage is full','QuotaExceededError');};});await quota.setOffline(true);
  await quotaPage.getByRole('button',{name:/^Send report/}).click();await quotaPage.getByRole('alert').filter({hasText:/Device storage is full/}).waitFor();
  await expect(quotaPage.getByLabel('Description (optional)',{exact:true})).toHaveValue('Keep this draft after storage failure');await quotaPage.getByRole('button',{name:'Take a different photo',exact:true}).waitFor();await quota.close();record('Offline storage quota refusal preserves the in-memory photo and report details');

  // Incognito contexts are intentionally ineligible for installation. Use an
  // isolated regular profile without touching the user's browser profile.
  installProfile=await mkdtemp(join(tmpdir(),'nagriksetu-install-check-'));
  const cold=installContext=await chromium.launchPersistentContext(installProfile,{channel:'chrome'});const coldPage=await cold.newPage();await coldPage.goto(APP+'/report');
  await coldPage.evaluate(async()=>{await navigator.serviceWorker.register('/report-worker.js');await navigator.serviceWorker.ready;});
  const cdp=await cold.newCDPSession(coldPage);const installability=await cdp.send('Page.getInstallabilityErrors');
  await writeFile(new URL('installability.json',output),JSON.stringify(installability,null,2));assert.deepEqual(installability.installabilityErrors,[]);record('Chromium reports no manifest/installability errors (native installation remains a manual check)');
  await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cold.setOffline(true);
  let coldFailure;try{await coldPage.reload();}catch(error){coldFailure=error.message;}
  assert.match(coldFailure??'',/ERR_INTERNET_DISCONNECTED/);limitations.push('Cold offline reload cannot open the app shell: the worker deliberately caches no application assets. Warm-tab outbox delivery is tested separately.');
  await cold.close();

  const email=`release-${crypto.randomUUID()}@example.test`,password='release-check-password-123',next=password+'-new';
  const registered=await fetch(API+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,fullName:'Release Check Citizen'})});assert.equal(registered.status,201);
  // Successful proxy login with a newly created local-only account establishes
  // that the frontend's server routes point at the same disposable API.
  assert.equal((await context.request.post(APP+'/api/auth/login',{data:{email,password}})).status(),200);
  await page.goto(APP+'/me/settings?tab=security');const form=page.getByRole('form',{name:'Change password',exact:true});
  await form.getByLabel('Current password',{exact:true}).fill(password);await form.getByLabel('New password (at least 10 characters)',{exact:true}).fill(next);await form.getByLabel('New password again',{exact:true}).fill(next);
  await form.getByRole('button',{name:'Change password',exact:true}).click();await form.getByText('Password changed.',{exact:true}).waitFor();
  assert.equal((await context.request.post(APP+'/api/auth/login',{data:{email,password}})).status(),401);
  assert.equal((await context.request.post(APP+'/api/auth/login',{data:{email,password:next}})).status(),200);
  record('Actual citizen browser password change rejects old password and accepts new password');
  await page.reload();await page.getByRole('button',{name:'Your account',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL('**/dashboard');
  record('Sign out returns to the general dashboard from account security');

  const unavailable=await browser.newContext();await unavailable.addInitScript(()=>Object.defineProperty(window,'indexedDB',{value:{open(){throw new DOMException('Storage unavailable','InvalidStateError');}}}));
  const storagePage=await unavailable.newPage();await storagePage.goto(APP+'/report/outbox');await storagePage.getByRole('alert').filter({hasText:'Browser storage is unavailable.'}).waitFor();await unavailable.close();record('Unavailable IndexedDB has a readable outbox error');

  // An existing owned-cloud QA asset is reused; this harness uploads no new media.
  if(process.env.VERIFY_EVIDENCE_URL){
    await page.goto(APP+'/report/outbox');const id=crypto.randomUUID();
    const body={categoryCode:'POTHOLE',lat:30.386,lng:76.326,accuracyM:8,manualPin:true,photoUrl:process.env.VERIFY_EVIDENCE_URL,deviceId:'release-'+id,description:'Disposable local release verification'};
    await context.setOffline(true);
    await page.evaluate(({id,body})=>new Promise((resolve,reject)=>{const r=indexedDB.open('civictrack-offline',1);r.onupgradeneeded=()=>{r.result.createObjectStore('drafts');r.result.createObjectStore('outbox',{keyPath:'id'});};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('outbox','readwrite');tx.objectStore('outbox').put({id,userId:null,body,blob:null,cloud:'',preset:'',createdAt:Date.now(),nextAttempt:0,attempts:0,state:'pending'});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}),{id,body});
    assert.equal((await jobValue(id)).state,'pending');await context.setOffline(false);await page.reload();await page.getByRole('button',{name:'Retry now',exact:true}).click();
    await expect.poll(async()=>(await jobValue(id))?.state,{timeout:45000}).toBe('sent');
    const job=await jobValue(id);assert.deepEqual(job.body,{});assert.equal(job.blob,null);assert.match(job.publicRef,/^CT-/);
    await page.reload();await page.getByRole('heading',{name:'Sent',exact:true}).waitFor();
    record('Prepared offline job survives storage, delivers through real worker/API/photo verification, and clears local photo/location after sending');
    const replay=await fetch(API+'/reports',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify(body)});assert.ok(replay.ok);assert.equal((await replay.json()).publicRef,job.publicRef);record('Delivered offline job retains idempotency on replay');
  }else{limitations.push('Real worker/media delivery not run: VERIFY_EVIDENCE_URL was not supplied');console.log('NOT RUN real worker/media delivery: no evidence URL supplied');}
  assert.deepEqual(errors,[]);record('No application runtime errors in follow-up browser checks');
}finally{await writeFile(new URL('results.json',output),JSON.stringify({checks,errors,limitations},null,2));await installContext?.close();if(installProfile)await rm(installProfile,{recursive:true,force:true});await browser.close();}
