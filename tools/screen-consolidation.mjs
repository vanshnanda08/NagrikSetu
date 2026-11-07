// Consolidated-screen regression checks. Civic records are read-only; form writes use browser fixtures.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { json } from './http.mjs';
import { qaSignIn, isNavigationCancellation } from './qa-session.mjs';
const APP = process.env.SCREENS_APP ?? 'http://localhost:3003';
const output = new URL('../artifacts/screens-consolidation/', import.meta.url);
await mkdir(output, { recursive: true });
const issues = await json('/public/issues?limit=25');
const issue = issues.items[0];
assert.ok(issue, 'Local demo data contains an issue');
const email = `screen-review-${Date.now()}@example.test`, password = 'screen-review-1234';
await json('/auth/register', { method: 'POST', body: { email, password, fullName: 'Screen Review Citizen' } });
const browser = await chromium.launch({ channel: 'chrome' });
const checks = [], accessibility = [], accessibilityExceptions = [], runtime = [];
const sizes = [{width:1280,height:600},{width:1440,height:900},{width:390,height:844},{width:768,height:1024}];
async function bridge(context) {
  // Secondary local QA ports are not backend CORS origins. Leave backend configuration unchanged.
  await context.route('http://localhost:8080/api/v1/**', async route => {
    const cors = {'access-control-allow-origin':'*','access-control-allow-headers':'Authorization, Content-Type','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS'};
    if (route.request().method() === 'OPTIONS') return route.fulfill({status:204,headers:cors});
    if (route.request().url().includes('/stream/')) return route.fulfill({status:503,headers:cors});
    try {
      const response = await route.fetch({headers:{...route.request().headers(),origin:'http://localhost:3000'}});
      await route.fulfill({response,headers:{...response.headers(),...cors}});
    } catch (error) {
      if (isNavigationCancellation(error)) return;
      throw new Error(`Local QA API bridge failed: ${route.request().method()} ${new URL(route.request().url()).pathname}`);
    }
  });
}
async function layout(page, size, name) {
  const measured = await page.evaluate(() => ({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,scheme:getComputedStyle(document.documentElement).colorScheme}));
  assert.ok(measured.scrollWidth <= size.width + 1, `${name}: no horizontal page overflow ${JSON.stringify(measured)}`);
  if(size.width>=1280) assert.ok(measured.scrollHeight<=size.height+1, `${name}: desktop fits its window ${JSON.stringify(measured)}`);
  assert.ok(measured.scheme.includes('light'));
}
async function axe(page, name) {
  await page.addScriptTag({path:fileURLToPath(new URL('../frontend/node_modules/axe-core/axe.min.js',import.meta.url))});
  const violations=await page.evaluate(async()=> (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,html:n.html}))})));
  for(const violation of violations) {
    const spatialMarkers = violation.id === 'target-size' && violation.nodes.every(node => node.target.every(selector => selector.includes('.civictrack-marker')) || /^<[^>]+class="[^"]*\bcivictrack-marker\b/.test(node.html));
    if(spatialMarkers) {
      // WCAG 2.5.8 permits an equivalent control on the same page. Verify
      // the existing list alternative rather than hiding arbitrary findings.
      const alternative=page.locator('.map-issue-list');
      await alternative.locator('summary').click();
      const targets=await alternative.locator('.map-issue-option').evaluateAll(buttons=>buttons.map(button=>({width:button.getBoundingClientRect().width,height:button.getBoundingClientRect().height})));
      assert.ok(targets.length>0 && targets.every(target=>target.width>=44 && target.height>=44),'Equivalent map-list controls meet the comfortable target size');
      await alternative.locator('summary').click();
      await page.evaluate(()=>{document.querySelector('main').scrollTop=0;window.scrollTo(0,0);});
      accessibilityExceptions.push({name,reason:'Spatial map markers have equivalent issue-list controls of at least 44 by 44 pixels',violation});
    } else accessibility.push({name,violations:[violation]});
  }
}
async function visit(page, path, size, name) {
  await page.setViewportSize(size);
  const response = await page.goto(APP+path);
  assert.equal(response.status(),200,`${name}: page loads`);
  await page.locator('h1').first().waitFor();
  await page.waitForTimeout(650);
  await layout(page,size,name);
  if(size.width===1280 || size.width===390){await axe(page,`${name}-${size.width}`);await page.screenshot({path:fileURLToPath(new URL(`${name}-${size.width}.png`,output)),fullPage:true});}
  checks.push({kind:'layout',name,path,size});
}
const accounts=[
  ['guest',null,['/dashboard','/issues','/issues?view=map','/report','/report/outbox',`/issues/${issue.id}`]],
  ['CITIZEN',email,['/me/reports','/me/notifications','/me/settings','/me/settings?tab=security']],
  ['STAFF','crew.roads@civictrack.example',['/work?view=mine&tab=all',`/work?view=mine&issue=${issue.id}`,'/me/settings?tab=security']],
  ['SUPERVISOR','head.roads@civictrack.example',['/work?view=assignments','/work?view=review','/work?view=performance']],
  ['ADMIN','commissioner@civictrack.example',['/admin','/admin?view=audit','/work?view=assignments']],
];
try {
  for (const [role,account,paths] of accounts) {
    const context=await browser.newContext({viewport:sizes[0],serviceWorkers:'block',colorScheme:'dark'});
    await bridge(context);
    await context.addInitScript(()=>localStorage.setItem('theme','dark'));
    if(account)await qaSignIn(context,APP,account,role==='CITIZEN'?password:'demo1234',role);
    const page=await context.newPage();page.on('pageerror',e=>runtime.push({role,message:e.message}));
    for(const size of sizes)for(const [i,path] of paths.entries())await visit(page,path,size,`${role}-${i}`);
    console.log(`PASS ${role}: ${paths.length*sizes.length} page/layout checks`);
    // Primary links stay one desktop row; mobile opens with keyboard and returns focus on Escape.
    await page.setViewportSize(sizes[0]);await page.goto(APP+paths[0]);
    await page.waitForTimeout(350);
    const nav=page.getByRole('navigation',{name:'Main',exact:true});
    const positions=await nav.locator('.site-links > a.nav-link').evaluateAll(links=>links.map(el=>Math.round(el.getBoundingClientRect().top)));
    assert.equal(new Set(positions).size,1,'Primary links stay on one row');
    const expected = role==='guest'?['Dashboard','Explore issues','Report a problem']:role==='CITIZEN'?['Dashboard','Explore issues','Report a problem','My reports']:role==='STAFF'?['Complaints','Explore issues','Department overview']:role==='SUPERVISOR'?['Complaints','Explore issues','City overview']:['Administration','Complaints','Explore issues','City overview'];
    for(const name of expected)await nav.getByRole('link',{name,exact:true}).waitFor({state:'visible'});
    if(role==='STAFF'||role==='SUPERVISOR')assert.equal(await nav.getByRole('link',{name:'Administration',exact:true}).count(),0);
    if(account){
      const accountToggle=page.getByRole('button',{name:'Your account',exact:true});await accountToggle.focus();await page.keyboard.press('Enter');
      await page.locator('#account-menu').getByRole('link',{name:'Account settings',exact:true}).waitFor();
      assert.equal(await page.locator('#account-menu').getByRole('link',{name:'Security',exact:true}).count(),0);
      await page.keyboard.press('Escape');assert.equal(await accountToggle.getAttribute('aria-expanded'),'false');assert.equal(await accountToggle.evaluate(el=>document.activeElement===el),true);
    }
    await page.setViewportSize(sizes[2]);const toggle=page.getByRole('button',{name:'Open menu',exact:true});await toggle.focus();await page.keyboard.press('Enter');
    for(const name of expected)await nav.getByRole('link',{name,exact:true}).waitFor({state:'visible'});
    await page.keyboard.press('Escape');assert.equal(await toggle.evaluate(el=>document.activeElement===el),true);
    checks.push({kind:'navigation',role});
    if(role==='guest'){
      // A complete round trip retains URL-backed state rather than silently clearing filters.
      await page.goto(APP+'/issues?category=POTHOLE&sort=priority&offset=0');
      await page.getByRole('navigation',{name:'Complaint views'}).getByRole('link',{name:'Map',exact:true}).click();
      await page.locator('.leaflet-container').waitFor();await page.waitForTimeout(400);
      const mapList=page.locator('.map-issue-list');await mapList.locator('summary').click();await mapList.locator('.map-issue-option').first().click();await page.locator('.issue-detail-panel').waitFor();assert.equal(await mapList.locator('.map-issue-option[aria-pressed="true"]').count(),1,'Equivalent list control opens the same map detail');
      checks.push({kind:'accessible-map-list-selection'});
      assert.equal(new URL(page.url()).pathname,'/issues');assert.equal(new URL(page.url()).searchParams.get('view'),'map');assert.equal(new URL(page.url()).searchParams.get('category'),'POTHOLE');
      await page.getByRole('navigation',{name:'Complaint views'}).getByRole('link',{name:'List',exact:true}).click();
      await page.getByRole('combobox',{name:'Sort by',exact:true}).waitFor();assert.equal(await page.getByRole('combobox',{name:'Category',exact:true}).inputValue(),'POTHOLE');assert.equal(await page.getByRole('combobox',{name:'Sort by',exact:true}).inputValue(),'priority');
      checks.push({kind:'list-map-filter-round-trip'});
      for(const [old,target,key,value]of [
        ['/map?category=POTHOLE&z=12','/issues','view','map'],['/me/profile','/me/settings',null,null],['/me/security','/me/settings','tab','security'],['/supervisor/review','/work','view','review'],['/supervisor/analytics','/work','view','performance'],['/admin/configuration','/admin',null,null],['/admin/audit','/admin','view','audit'],
      ]){const response=await context.request.get(APP+old,{maxRedirects:0});assert.equal(response.status(),307);const next=new URL(response.headers().location,APP);assert.equal(next.pathname,target);if(key)assert.equal(next.searchParams.get(key),value);if(old.startsWith('/map')){assert.equal(next.searchParams.get('category'),'POTHOLE');assert.equal(next.searchParams.get('z'),'12');}checks.push({kind:'legacy-redirect',old,target});}
      for(const path of ['/work?view=review','/work?view=performance','/admin','/admin?view=audit','/me/settings']){await page.goto(APP+path);await page.getByText(/Sign in (with|to)|for municipal staff/).first().waitFor();assert.equal(await page.getByRole('button',{name:'Save configuration',exact:true}).count(),0);}
      checks.push({kind:'signed-out-workspace-guards'});
    }
    if(role==='CITIZEN'){
      await page.goto(APP+'/me/settings');await page.getByRole('button',{name:'Save changes',exact:true}).waitFor();
      let payload;
      await page.route('**/api/v1/me/profile',async route=>{if(route.request().method()==='PUT'){payload=route.request().postDataJSON();const response=await context.request.get('http://localhost:8080/api/v1/me/profile',{headers:{authorization:route.request().headers().authorization}});const current=await response.json();await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...current,...payload})});}else await route.fallback();});
      await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByText('Saved.',{exact:true}).waitFor();assert.equal(payload.fullName,'Screen Review Citizen');assert.ok(Array.isArray(payload.mutedNotificationTypes));
      await page.getByRole('navigation',{name:'Account settings views'}).getByRole('link',{name:'Security',exact:true}).click();
      const form=page.getByRole('form',{name:'Change password',exact:true});await form.getByLabel('Current password',{exact:true}).fill('fixture-current');await form.getByLabel('New password (at least 10 characters)',{exact:true}).fill('fixture-new-1234');await form.getByLabel('New password again',{exact:true}).fill('mismatch');assert.equal(await form.getByRole('button',{name:'Change password',exact:true}).isEnabled(),false);
      await form.getByLabel('New password again',{exact:true}).fill('fixture-new-1234');let passwordPayload;await page.route('**/api/v1/me/password',async r=>{passwordPayload=r.request().postDataJSON();await r.fulfill({status:204});});await form.getByRole('button',{name:'Change password',exact:true}).click();await form.getByText('Password changed.',{exact:true}).waitFor();assert.deepEqual(passwordPayload,{currentPassword:'fixture-current',newPassword:'fixture-new-1234'});
      await page.route('**/api/v1/me/security/mfa/setup',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({secret:'VISUAL-SETUP-FIXTURE',provisioningUri:'otpauth://totp/fixture?secret=VISUAL'})}));
      await page.getByLabel('Current password for authenticator setup',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Set up authenticator',exact:true}).click();await page.getByLabel('Six-digit code',{exact:true}).waitFor();
      checks.push({kind:'settings-profile-password-mfa-fixtures'});
      for(const path of ['/work?view=review','/admin?view=audit']){await page.goto(APP+path);await page.getByText(/for supervisors and administrators|for administrators|for municipal staff/).first().waitFor();}
      checks.push({kind:'citizen-workspace-guards'});
      await page.setViewportSize(sizes[0]);await page.goto(APP+'/me/settings');await page.getByRole('button',{name:'Save changes',exact:true}).waitFor();const region=page.getByRole('region',{name:'Profile and notification preferences',exact:true});await region.waitFor();await region.focus();await page.keyboard.press('PageDown');await page.waitForTimeout(100);assert.ok(await region.evaluate(el=>el.scrollTop>0),'Settings fields scroll internally');
      checks.push({kind:'desktop-settings-internal-scroll'});
    }
    if(role==='SUPERVISOR'||role==='ADMIN'){
      await page.goto(APP+'/work?view=assignments');const workspace=page.getByRole('navigation',{name:'Complaints views'});await workspace.getByRole('link',{name:'Needs review',exact:true}).click();await page.getByRole('heading',{name:'Review queue',exact:true}).waitFor();await workspace.getByRole('link',{name:'Team performance',exact:true}).click();await page.getByRole('heading',{name:'Team performance',exact:true}).waitFor();if(role!=='ADMIN'){await workspace.getByRole('link',{name:'My work',exact:true}).click();await page.getByRole('heading',{name:'My work',exact:true}).waitFor();}else{assert.equal(await workspace.getByRole('link',{name:'My work',exact:true}).count(),0);}await workspace.getByRole('link',{name:'Assignments',exact:true}).click();await page.getByRole('heading',{name:'Assignment board',exact:true}).waitFor();checks.push({kind:'shared-complaints-workspace-navigation',role});
    }
    if(role==='ADMIN'){
      await page.goto(APP+'/admin');await page.locator('.configuration-record').first().click();await page.getByRole('form',{name:'Edit configuration record',exact:true}).waitFor();await page.getByRole('navigation',{name:'Administration views'}).getByRole('link',{name:'Audit log',exact:true}).click();await page.getByRole('button',{name:'Export CSV',exact:true}).waitFor();checks.push({kind:'admin-configuration-audit-tabs'});
    }
    await page.unrouteAll({behavior:'wait'});
    await context.unrouteAll({behavior:'wait'});
    await context.close();
  }
  const context=await browser.newContext();await bridge(context);const page=await context.newPage();for(const size of [{width:1366,height:768},{width:1920,height:1080}])await visit(page,'/dashboard',size,`extra-dashboard-${size.width}`);await context.unrouteAll({behavior:'wait'});await context.close();
  assert.deepEqual(runtime,[],'No application runtime errors');assert.deepEqual(accessibility,[],'No actionable accessibility findings');
  console.log(`PASS ${checks.filter(c=>c.kind==='layout').length} page/layout checks, ${checks.filter(c=>c.kind!=='layout').length} interaction/redirect checks, zero runtime errors or actionable accessibility findings; ${accessibilityExceptions.length} spatial-map exceptions documented`);
} finally {await writeFile(new URL('results.json',output),JSON.stringify({checks,runtime,accessibility,accessibilityExceptions},null,2));await browser.close();}
