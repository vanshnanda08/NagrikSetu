// Scratch API + local Mailpit only. No external emails or production data.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const APP='http://localhost:3000', API='http://localhost:8080/api/v1', MAIL='http://localhost:18025';
const browser=await chromium.launch({channel:'chrome'});
const context=await browser.newContext({viewport:{width:1280,height:900}});
const page=await context.newPage();
const errors=[];page.on('pageerror',error=>errors.push(String(error)));
const email=`feature-${crypto.randomUUID()}@example.test`,password='feature-password-123';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
await mkdir('../artifacts/browser',{recursive:true});
try {
  assert.equal((await context.request.post(APP+'/api/auth/register',{data:{email,password,fullName:'Feature Tester'}})).status(),200);
  await page.goto(APP+'/me/profile');
  await page.getByRole('checkbox',{name:'Email me issue updates'}).waitFor();
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/me/email-preferences') && r.request().method()==='PUT'),page.getByRole('checkbox',{name:'Email me issue updates'}).click()]);
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('input[type=checkbox]')?.checked===true);
  const tab=await context.newPage();
  await Promise.all([page.goto(APP+'/me/profile'),tab.goto(APP+'/me/profile')]);
  await Promise.all([page.getByRole('heading',{name:'Profile',exact:true}).waitFor(),tab.getByRole('heading',{name:'Profile',exact:true}).waitFor()]);
  await tab.close();
  console.log('PASS email preference persistence and cross-tab refresh rotation');

  await context.request.post(APP+'/api/auth/logout');
  await page.goto(APP+'/forgot-password');
  await page.locator('main').getByLabel('Email',{exact:true}).fill(email);
  await page.getByRole('button',{name:'Email reset link'}).click();
  await page.getByRole('status').filter({hasText:'If that account is active'}).waitFor();
  let message;
  for(let i=0;i<30;i++) {
    const inbox=await (await fetch(MAIL+'/api/v1/messages')).json();
    const entry=inbox.messages.find(m=>m.To.some(to=>to.Address===email));
    if(entry) {message=await (await fetch(MAIL+'/api/v1/message/'+entry.ID)).json();break;}
    await wait(500);
  }
  assert.ok(message,'reset email delivered through SMTP to Mailpit');
  const link=message.Text.match(/http:\/\/localhost:3000\/reset-password#token=[\w-]+/)[0];
  await page.goto(link);await page.getByLabel('New password').fill(password+'-new');
  await page.getByRole('button',{name:'Save password'}).click();
  await page.getByRole('status').filter({hasText:'Password changed'}).waitFor();
  assert.equal((await context.request.post(APP+'/api/auth/login',{data:{email,password}})).status(),401);
  assert.equal((await context.request.post(APP+'/api/auth/login',{data:{email,password:password+'-new'}})).status(),200);
  console.log('PASS real SMTP reset email, reset screen, old-password rejection and new login');

  await page.goto(APP+'/report');
  const description=page.locator('textarea').first();await description.fill('Persistent browser draft');
  await wait(500);await page.reload();await description.waitFor();
  assert.equal(await description.inputValue(),'Persistent browser draft');
  console.log('PASS draft survives full page reload');

  await context.request.post(APP+'/api/auth/logout');
  await page.goto(APP+'/report/outbox');await page.evaluate(()=>navigator.serviceWorker.ready);
  await context.setOffline(true);
  const id=crypto.randomUUID();
  const body={categoryCode:'POTHOLE',lat:30.93,lng:75.82,accuracyM:8,manualPin:false,photoUrl:'https://example.test/offline.jpg',deviceId:'offline-'+crypto.randomUUID(),description:'Offline browser fixture'};
  await page.evaluate(async ({id,body})=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('civictrack-offline',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    await new Promise((resolve,reject)=>{const tx=db.transaction('outbox','readwrite');tx.objectStore('outbox').put({id,userId:null,body,blob:null,cloud:'',preset:'',createdAt:Date.now(),nextAttempt:0,attempts:0,state:'pending'});tx.oncomplete=resolve;tx.onerror=reject;});db.close();
  },{id,body});
  await page.close();
  await context.setOffline(false);
  const outbox=await context.newPage();outbox.on('pageerror',e=>errors.push(String(e)));
  await outbox.goto(APP+'/report/outbox');
  await outbox.getByRole('heading',{name:'Sent',exact:true}).waitFor({timeout:30000});
  const first=await fetch(API+'/reports',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify(body)});
  assert.equal(first.status,201);const firstResult=await first.json();
  const again=await fetch(API+'/reports',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify(body)});
  assert.equal((await again.json()).reportId,firstResult.reportId);
  console.log('PASS durable outbox across tab closure, worker delivery and idempotent replay');

  assert.equal((await context.request.post(APP+'/api/auth/login',{data:{email:'commissioner@civictrack.example',password:'demo1234'}})).status(),200);
  await outbox.goto(APP+'/admin/configuration');
  await outbox.getByRole('button',{name:'Pothole',exact:true}).click();
  const editor=outbox.locator('main form');
  assert.equal(await editor.evaluate(form=>form.reportValidity()),true,'administrator editor is valid');
  const saving=outbox.waitForResponse(response=>response.url().includes('/admin/configuration/categories/POTHOLE') && response.request().method()==='PUT');
  await outbox.getByRole('button',{name:'Save configuration'}).click();
  const saved=await saving;
  assert.equal(saved.status(),204,`administrator save returned ${saved.status()}`);
  await outbox.getByRole('status').filter({hasText:'Saved.'}).waitFor();
  await outbox.screenshot({path:'../artifacts/browser/configuration-desktop.png',fullPage:true});
  console.log('PASS administrator category save and audit rendering');
  await outbox.setViewportSize({width:375,height:812});
  for(const path of ['/admin/configuration','/me/profile','/forgot-password','/reset-password','/report/outbox']) {
    await outbox.goto(APP+path);await outbox.locator('h1').waitFor();await wait(300);
    const overflow=await outbox.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    assert.equal(overflow,false,`mobile horizontal overflow: ${path}`);
  }
  await outbox.screenshot({path:'../artifacts/browser/outbox-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS mobile layouts and no browser runtime errors');
} finally {await browser.close();}
