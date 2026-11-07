// Read-only dashboard follow-up: all statistics visible together, details selected
// without navigating a long accordion. Loading/empty/error responses are fixtures.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { APP, json } from './http.mjs';
const dir=new URL('../artifacts/dashboard-layout/',import.meta.url);await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage();
const checks=[],runtime=[],accessibility=[];page.on('pageerror',e=>runtime.push(e.message));
const sizes=[{width:1280,height:600},{width:1366,height:768},{width:1440,height:900},{width:1920,height:1080},{width:390,height:844},{width:768,height:1024}];
const picker=page.getByRole('combobox',{name:'Detail view',exact:true});
async function noOverflow(size,statistics=true){
 const layout=await page.evaluate(()=>{
  const stats=document.querySelector('.dashboard-metrics'),details=document.querySelector('.dashboard-detail'),main=document.querySelector('main');
  return {outerX:document.documentElement.scrollWidth>innerWidth+1,outerY:document.documentElement.scrollHeight>innerHeight+1,main:main.scrollHeight>main.clientHeight+1,stats:stats.scrollHeight>stats.clientHeight+1,sideBySide:stats.getBoundingClientRect().right<details.getBoundingClientRect().left,cards:[...stats.querySelectorAll('.metric-tile')].map(el=>({overflows:el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1,visible:el.getBoundingClientRect().top>=0&&el.getBoundingClientRect().bottom<=innerHeight}))};
 });
 assert.equal(layout.outerX,false,'No horizontal page overflow');
 if(size.width>=1280){
  assert.equal(layout.outerY,false,'No outer desktop scrolling');assert.equal(layout.main,false,'No scrolling of the desktop dashboard');assert.equal(layout.stats,false,'Statistics do not scroll');assert.equal(layout.sideBySide,true,'Statistics left, details right');
  if(statistics){assert.equal(layout.cards.length,8);assert.ok(layout.cards.every(card=>card.visible&&!card.overflows),'All eight complete statistic cards fit in the window');}
 }
}
async function screenshot(name){await page.screenshot({path:fileURLToPath(new URL(name+'.png',dir)),fullPage:true});}
async function axe(name){await page.addScriptTag({path:fileURLToPath(new URL('../frontend/node_modules/axe-core/axe.min.js',import.meta.url))});const violations=await page.evaluate(async()=> (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));if(violations.length)accessibility.push({name,violations});}
const endpoints=/\/api\/v1\/dashboard\/(summary|metrics|departments)$/;
try{
 for(const size of sizes){
  await page.setViewportSize(size);await page.goto(APP+'/dashboard');await page.locator('.metric-tile').nth(7).waitFor();await page.waitForTimeout(200);
  await noOverflow(size);await screenshot(`${size.width}-overview`);
  if(size.width>=1280) assert.equal(await page.locator('.dashboard-detail-body').evaluate(el=>el.scrollHeight>el.clientHeight+1),false,'Default chart and controls fit without scrolling');
  const views=await picker.locator('option').allTextContents();assert.equal(views.length,8);
  for(const view of views){await picker.selectOption(view);await page.waitForTimeout(100);assert.equal(await page.locator('.dashboard-view:visible').count(),1);assert.equal(await page.locator('.dashboard-view:visible').getAttribute('aria-label'),view);await noOverflow(size);checks.push({size,view});if(size.width===1280)await axe(view);}
  if(size.width===390)await axe('mobile-dashboard');
  console.log(size.width,'all eight statistics and detail views passed');
 }
 await page.setViewportSize(sizes[0]);await page.goto(APP+'/dashboard');await page.locator('.metric-tile').nth(7).waitFor();
 await picker.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await picker.inputValue(),'Currently breaching');
 const metricsTop=await page.locator('.dashboard-metrics').evaluate(el=>el.getBoundingClientRect().top);await page.locator('.dashboard-detail-body').focus();await page.keyboard.press('PageDown');await page.waitForTimeout(200);assert.equal(await page.locator('.dashboard-metrics').evaluate(el=>el.getBoundingClientRect().top),metricsTop);checks.push('keyboard-detail-switch-and-scroll-leaves-statistics-visible');
 await picker.selectOption('Reported against resolved, last 90 days');await page.locator('.dashboard-view:visible .chart-figure > details > summary').click();await page.locator('.dashboard-view:visible table').waitFor();checks.push('chart-table-remains-accessible');
 await page.locator('.dashboard-notes > summary').click();await page.locator('.dashboard-notes > p').waitFor({state:'visible'});checks.push('figure-definitions-remain-accessible');
 let release;const held=new Promise(resolve=>release=resolve);await page.route(endpoints,async route=>{await held;await route.continue();});
 await page.goto(APP+'/dashboard');await page.locator('.dashboard-metric-grid > section[aria-hidden="true"]').nth(7).waitFor();await noOverflow(sizes[0],false);await screenshot('loading');release();await page.locator('.metric-tile').nth(7).waitFor();await page.unroute(endpoints);checks.push('loading-placeholders-fit');
 const summary=await json('/dashboard/summary'),metrics=await json('/dashboard/metrics');
 await page.route(endpoints,route=>{const path=new URL(route.request().url()).pathname;const body=path.endsWith('/summary')?{...summary,overdueCount:0,totalResolved:0,topOverdueWard:null,topOverdueDepartment:null}:path.endsWith('/departments')?[]:{...metrics,resolutionTime:{overall:{name:'City',medianHours:null,resolved:0},byDepartment:[],byWard:[]},slaCompliance:{resolved:0,onTime:0,rate:null,trend:[]},reportedVsResolved:[],backlogAge:[],topClusters:[]};return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});});
 await page.goto(APP+'/dashboard');await page.locator('.metric-tile').nth(7).waitFor();await noOverflow(sizes[0]);assert.ok(!/NaN|undefined/.test(await page.locator('main').innerText()));await screenshot('insufficient-data');checks.push('empty-and-minimum-sample-statistics-fit');await page.unroute(endpoints);
 await page.route(endpoints,route=>route.fulfill({status:503,contentType:'application/problem+json',body:JSON.stringify({status:503,detail:'Statistics are temporarily unavailable. Please retry.'})}));
 await page.goto(APP+'/dashboard');await page.locator('.dashboard-metric-grid [role="alert"]').nth(2).waitFor();await noOverflow(sizes[0],false);await screenshot('error');await axe('dashboard-error');await page.unroute(endpoints);checks.push('independent-errors-fit');
 for(const button of await page.locator('.dashboard-metric-grid').getByRole('button',{name:'Try again',exact:true}).all())await button.click();await page.locator('.metric-tile').nth(7).waitFor();checks.push('statistics-retry-recovers');
 assert.equal(runtime.length,0);assert.equal(accessibility.length,0);console.log('PASS',checks.length,'dashboard checks; no runtime or accessibility findings');
}finally{await writeFile(new URL('results.json',dir),JSON.stringify({checks,runtime,accessibility},null,2));await browser.close();}
