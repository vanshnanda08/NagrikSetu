// Compare the isolated committed frontend (port 3002) and the adapted app.
// Only isolated test accounts/authentication are written; civic records are read-only.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {json} from './http.mjs';
const SOURCE='011ecb5c04192b1823065a2d4c248630c853add8';
const RESTORED=process.env.RESTORED_APP??'http://localhost:3003';
const dir=new URL('../artifacts/restored-design/',import.meta.url);await mkdir(dir,{recursive:true});
const issues=await json('/public/issues?category=POTHOLE&limit=100'),issue=issues.items.find(i=>!['CLOSED','REJECTED'].includes(i.status));
const email=`restore-review-${Date.now()}@example.test`,password='restore-review-1234';
await json('/auth/register',{method:'POST',body:{email,password,fullName:'Restore Review Citizen'}});
const browser=await chromium.launch({channel:'chrome'}),results=[],runtime=[],accessibility=[],comparisons=[];
const roles=[
 ['guest',null,['/dashboard','/issues','/map','/report','/login',`/issues/${issue.id}`,`/issues/${issue.id}/cluster`]],
 ['CITIZEN',email,['/me/reports','/me/notifications','/me/profile','/me/security']],
 ['STAFF','crew.roads@civictrack.example',['/staff/queue','/me/security']],
 ['SUPERVISOR','head.roads@civictrack.example',['/supervisor/queue','/supervisor/review','/supervisor/analytics',`/supervisor/issues/${issue.id}/cluster`]],
 ['ADMIN','commissioner@civictrack.example',['/admin/configuration','/admin/audit']],
];
const sizes=[{width:1440,height:900},{width:390,height:844}];
const sourceTokens=new Map();
const prior=await readFile(new URL('results.json',dir),'utf8').then(JSON.parse).catch(()=>null);
const cachedSource=prior?.sourceCommit===SOURCE ? prior.results.filter(r=>r.version==='source') : [];
const reuseSource=cachedSource.length===38;
const initialOnly=process.env.RESTORE_INITIAL_ONLY==='1';
if(initialOnly){assert.equal(prior?.results.filter(r=>r.version==='restored').length,42);results.push(...prior.results);comparisons.push(...prior.comparisons);runtime.push(...prior.runtime);accessibility.push(...prior.accessibility);}
else if(reuseSource)results.push(...cachedSource);
async function proxyLocalApi(context){
 await context.route('http://localhost:8080/api/v1/**',async route=>{
  const cors={'access-control-allow-origin':'*','access-control-allow-headers':'Authorization, Content-Type','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
  if(route.request().url().includes('/stream/'))return route.fulfill({status:503,headers:cors});
  const response=await route.fetch({headers:{...route.request().headers(),origin:'http://localhost:3000'}});
  await route.fulfill({response,headers:{...response.headers(),...cors}});
 });
}
async function tokens(page){return page.evaluate(()=>{
 const root=getComputedStyle(document.documentElement),head=getComputedStyle(document.querySelector('h1'));
 return {ink:root.getPropertyValue('--ink').trim(),muted:root.getPropertyValue('--ink-muted').trim(),primary:root.getPropertyValue('--brand-primary').trim(),orange:root.getPropertyValue('--brand-orange').trim(),surface:root.getPropertyValue('--surface').trim(),fill:root.getPropertyValue('--glass-fill').trim(),radius:root.getPropertyValue('--radius').trim(),font:head.fontFamily};
});}
async function layout(page,size){
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No horizontal page overflow');
 if(size.width>=1280)assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1),false,'No outer desktop scrolling');
}
async function axe(page,record){await page.addScriptTag({path:fileURLToPath(new URL('../frontend/node_modules/axe-core/axe.min.js',import.meta.url))});const v=await page.evaluate(async()=> (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));if(v.length)accessibility.push({...record,violations:v});}
try{
 if(!initialOnly){
 if(reuseSource){
  const reference=await browser.newContext({colorScheme:'light'});await proxyLocalApi(reference);await reference.addInitScript(()=>localStorage.setItem('theme','light'));const referencePage=await reference.newPage();
  for(const size of sizes){await referencePage.setViewportSize(size);await referencePage.goto('http://localhost:3002/dashboard');await referencePage.locator('.metric-tile').nth(7).waitFor();sourceTokens.set(size.width,await tokens(referencePage));}
  await reference.close();console.log('Reusing 38 completed source page checks and refreshing reference tokens');
 }
 for(const version of (reuseSource?['restored']:['source','restored']))for(const[role,account,paths]of roles){
  const app=version==='source'?'http://localhost:3002':RESTORED;
  const context=await browser.newContext({colorScheme:version==='source'?'light':'dark'});await proxyLocalApi(context);
  await context.addInitScript(theme=>localStorage.setItem('theme',theme),version==='source'?'light':'dark');
  if(account){const res=await context.request.post(app+'/api/auth/login',{data:{email:account,password:role==='CITIZEN'?password:'demo1234'}});assert.equal(res.status(),200,role+' login');}
  const page=await context.newPage();page.on('pageerror',e=>runtime.push({version,role,message:e.message}));
  for(const size of sizes){await page.setViewportSize(size);for(const path of paths){
   const record={version,role,path,...size};await page.goto(app+path,{waitUntil:'domcontentloaded'});await page.locator('h1, main .feedback-panel').first().waitFor();
   if(account){if(version==='restored')await page.locator('.notification-control').waitFor();else await page.getByRole('button',{name:'Sign out',exact:true}).first().waitFor();}
   await page.waitForTimeout(350);await page.locator('.loading-state').first().waitFor({state:'hidden',timeout:8000}).catch(()=>{});
   if(version==='restored'){
    await layout(page,size);
    const dark=await tokens(page);await page.emulateMedia({colorScheme:'light'});assert.deepEqual(await tokens(page),dark,'Appearance is independent of OS theme');await page.emulateMedia({colorScheme:'dark'});
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('dark')),false);
    assert.equal(await page.evaluate(()=>localStorage.getItem('theme')),null);
    assert.equal(await page.getByRole('button',{name:/^(Light|Dark) mode$/i}).count(),0);
    assert.ok(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme.includes('light')));
    if(path==='/dashboard'){
     const actual=await tokens(page),expected=sourceTokens.get(size.width);assert.deepEqual(actual,expected,'Brand, surfaces, typography and card radius match the committed light design');comparisons.push({...record,tokens:actual});
    }
    if(size.width===390&&['/dashboard','/issues','/report','/login','/me/profile','/me/security','/staff/queue','/supervisor/queue','/supervisor/analytics','/admin/configuration','/admin/audit'].includes(path))await axe(page,record);
   }else if(path==='/dashboard')sourceTokens.set(size.width,await tokens(page));
   await page.screenshot({path:fileURLToPath(new URL(`${version}-${role}-${size.width}-${path.slice(1).replaceAll('/','_')}.png`,dir)),fullPage:true});results.push(record);
  }}
  await context.close();console.log(version,role,'completed',paths.length*sizes.length,'page checks');
 }
 // Desktop edge sizes, tablet, and preserved keyboard disclosures.
 const context=await browser.newContext({colorScheme:'dark'});await proxyLocalApi(context);const page=await context.newPage();
 for(const size of [{width:1280,height:600},{width:1366,height:768},{width:1920,height:1080},{width:768,height:1024}]){
  await page.setViewportSize(size);await page.goto(RESTORED+'/dashboard');await page.locator('.metric-tile').nth(7).waitFor();await layout(page,size);
  assert.equal(await page.locator('.metric-tile').count(),8,'All eight statistics are retained');
  await page.screenshot({path:fileURLToPath(new URL(`restored-edge-${size.width}-dashboard.png`,dir)),fullPage:true});results.push({version:'restored',role:'guest',path:'/dashboard',...size});
 }
 await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('navigation',{name:'Main',exact:true}).getByRole('link',{name:'Issues',exact:true}).click();await page.waitForURL(RESTORED+'/issues');assert.equal(await page.getByRole('button',{name:'Open menu',exact:true}).getAttribute('aria-expanded'),'false');
 await context.close();
 }
 const initial=await browser.newContext({javaScriptEnabled:false,colorScheme:'dark',storageState:{cookies:[],origins:[{origin:RESTORED,localStorage:[{name:'theme',value:'dark'}]}]}});
 const initialPage=await initial.newPage();await initialPage.goto(RESTORED+'/forgot-password');
 assert.equal(await initialPage.evaluate(()=>getComputedStyle(document.body).color),'rgb(11, 37, 64)');
 assert.ok(await initialPage.locator('main input').first().evaluate(el=>getComputedStyle(el).colorScheme.includes('light')),'Server-rendered native fields are light before hydration');
 await initialPage.screenshot({path:fileURLToPath(new URL('restored-before-hydration.png',dir)),fullPage:true});await initial.close();
 assert.equal(runtime.filter(r=>r.version==='restored').length,0);assert.equal(accessibility.length,0);
 console.log('PASS',results.filter(r=>r.version==='restored').length,'restored page/layout checks,',comparisons.length,'exact token comparisons, zero actionable accessibility/runtime findings');
}finally{await writeFile(new URL('results.json',dir),JSON.stringify({sourceBranch:'main',sourceCommit:SOURCE,results,comparisons,runtime,accessibility},null,2));await browser.close();}
