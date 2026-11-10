// Focused visual states. All write endpoints below are intercepted in-browser;
// no issue, profile, vote or configuration records are changed.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { APP, json } from './http.mjs';
const dir=new URL('../artifacts/frontend-redesign/states/',import.meta.url);await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}), context=await browser.newContext({viewport:{width:390,height:844}}), page=await context.newPage();
const checks=[], accessibility=[];
const capture=async name=>{await page.screenshot({path:fileURLToPath(new URL(name+'.png',dir)),fullPage:true});checks.push(name);};
const overflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No page overflow');
async function axe(name){await page.addScriptTag({path:fileURLToPath(new URL('../frontend/node_modules/axe-core/axe.min.js',import.meta.url))}); const v=await page.evaluate(async()=> (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))); if(v.length)accessibility.push({name,violations:v});}
const issue=(await json('/public/issues?category=POTHOLE&limit=1')).items[0];
try {
  // Old preferences are removed; OS appearance never changes the palette.
  await context.addInitScript(()=>localStorage.setItem('theme','dark'));
  await page.emulateMedia({colorScheme:'dark'});await page.goto(APP+'/dashboard');await page.waitForTimeout(600);
  assert.equal(await page.evaluate(()=>localStorage.getItem('theme')),null);assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(234, 243, 250)');
  checks.push('legacy-preference-ignored-and-removed');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Skip to main content');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement?.id),'main-content');checks.push('keyboard-skip-link');
  for(const size of [{width:320,height:700},{width:1280,height:600},{width:1920,height:1080}]) {
    await page.setViewportSize(size);
    for(const path of ['/dashboard','/issues','/report','/login','/map']) {await page.goto(APP+path);await page.waitForTimeout(500);await overflow();if(path==='/login')await page.keyboard.press('Escape');}
    checks.push(`extra-layout-${size.width}x${size.height}`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(APP+'/issues');await page.getByRole('combobox').first().selectOption('NEW');await page.waitForURL(/status=NEW/);await page.waitForTimeout(500);checks.push('issue-filter-preserved');
  await page.goto(APP+'/issues');await page.getByRole('button',{name:'Next',exact:true}).click();await page.waitForURL(/offset=/);checks.push('issue-pagination-preserved');
  await page.route('**/api/v1/public/issues?*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],total:0,limit:25,offset:0})}));
  await page.goto(APP+'/issues?status=NEW');await page.getByText('No issues match these filters.').waitFor();await capture('empty-filtered-list');await axe('empty-filtered-list');await page.unroute('**/api/v1/public/issues?*');
  await page.route('**/api/v1/public/issues?*',r=>r.fulfill({status:503,contentType:'application/problem+json',body:JSON.stringify({status:503,detail:'The issue service is temporarily unavailable. Please retry.'})}));
  await page.goto(APP+'/issues');await page.getByRole('alert').waitFor();await capture('service-error-and-retry');await axe('service-error-and-retry');await page.unroute('**/api/v1/public/issues?*');
  let release;const held=new Promise(resolve=>release=resolve);
  await page.route('**/api/v1/public/issues?*',async r=>{await held;await r.continue();});await page.goto(APP+'/issues');await page.getByText('Loading issues…',{exact:true}).first().waitFor({state:'attached'});await overflow();await capture('loading-skeleton');release();await page.locator('.issue-row').first().waitFor();await page.unroute('**/api/v1/public/issues?*');
  await page.goto(APP+'/map');await page.getByText('View these issues as a list',{exact:true}).click();await page.locator('.map-issue-option').first().click();await page.locator('aside').waitFor();await capture('equivalent-map-list-controls');
  await page.goto(APP+'/report');await page.getByRole('button',{name:'Send report',exact:true}).click();await page.getByRole('alert').first().waitFor();await capture('report-validation');await axe('report-validation');
  await context.setOffline(true);await page.getByText('You are offline.',{exact:true}).waitFor();await capture('offline-notice');await context.setOffline(false);
  await page.goto(APP+'/login');const dialog=page.locator('dialog[open]');await dialog.getByLabel('Email',{exact:true}).fill('missing@example.test');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('type')),'password');
  await page.route('**/api/auth/login',r=>r.fulfill({status:401,contentType:'application/problem+json',body:JSON.stringify({status:401,detail:'That email and password did not match. Check them and try again.'})}));await dialog.getByLabel('Password',{exact:true}).fill('wrong-password');await dialog.getByRole('button',{name:'Sign in',exact:true}).click();await dialog.getByRole('alert').waitFor();await capture('authentication-error');await axe('authentication-error');await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);await page.unroute('**/api/auth/login');
  checks.push('dialog-keyboard-focus-and-escape');
  // Local demo accounts, view-only. Responses for verification/profile changes
  // are visual fixtures so the live database is never altered.
  const response=await context.request.post(APP+'/api/auth/login',{data:{email:'commissioner@civictrack.example',password:'demo1234'}});assert.equal(response.status(),200);
  await page.goto(APP+'/admin/configuration');await page.locator('.configuration-record').first().click();await page.getByRole('form',{name:'Edit configuration record'}).waitFor();assert.equal(await page.locator('.configuration-record').first().getAttribute('aria-pressed'),'true');await overflow();await capture('admin-selected-record');await axe('admin-selected-record');
  await page.setViewportSize({width:1440,height:900});await page.goto(APP+'/dashboard');await page.getByRole('button',{name:'Manage',exact:true}).click();await page.getByRole('link',{name:'Assignment board',exact:true}).click();await page.waitForURL(APP+'/supervisor/queue');checks.push('desktop-manage-navigation');
  await page.goto(APP+'/dashboard');await page.locator('.dashboard-section > summary').filter({hasText:'Reported against resolved, last 90 days'}).click();const chart=page.locator('svg[aria-label^="New issues and resolved"]');await chart.waitFor();await chart.focus();await page.keyboard.press('ArrowLeft');await page.getByRole('status').filter({hasText:/new issues/i}).waitFor();await capture('chart-keyboard-tooltip');await axe('chart-keyboard-tooltip');
  await page.setViewportSize({width:390,height:844});await page.goto(APP+'/dashboard');await page.locator('.dashboard-section > summary').filter({hasText:'Reported against resolved, last 90 days'}).click();await overflow();await capture('mobile-trend-chart');
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('main')).animationName),'none');checks.push('reduced-motion');
  await page.route('**/api/v1/me/verifications/*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({issue:{...issue,status:'PENDING_VERIFICATION'},beforePhotoUrl:null,submittedAt:new Date().toISOString(),silenceDeadline:new Date(Date.now()+86400000).toISOString(),round:1,eligible:true,ineligibleReason:null,myVerdict:null,myReason:null,confirmations:0,rejections:0,required:1})}));
  await page.goto(APP+`/me/verify/${issue.id}`);await page.getByRole('button',{name:'Not fixed',exact:true}).click();await page.getByLabel('What is still wrong? (optional)',{exact:true}).fill('The repair has not held.');await capture('verification-choice');await axe('verification-choice');
  await page.route('**/api/v1/issues/*/verify',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({verdict:'NOT_FIXED',status:'REOPENED',outcome:'REOPENED',confirmations:0,rejections:1,required:1})}));await page.getByRole('button',{name:'Send: not fixed',exact:true}).click();await page.getByText(/You said.*not fixed/).first().waitFor();await capture('verification-recorded-success');
  await page.goto(APP+'/me/security');
  await page.getByRole('heading',{name:'Signed-in devices',exact:true}).waitFor();await capture('security-devices');await axe('security-devices');
  let profileFixture;
  await page.route('**/api/v1/me/profile',async r=>{
    if(r.request().method()==='PUT') await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...profileFixture,...JSON.parse(r.request().postData())})});
    else {const response=await r.fetch();profileFixture=await response.json();await r.fulfill({response});}
  });
  await page.goto(APP+'/me/profile');
  const save=page.getByRole('button',{name:'Save changes',exact:true});await save.waitFor();await save.click();await page.getByText('Saved.',{exact:true}).waitFor();await capture('profile-save-success-fixture');
  // New shell interactions: disclosures, focus return and internal scrolling.
  await page.setViewportSize({width:1280,height:600});
  await page.goto(APP+'/dashboard');
  const accountToggle=page.getByRole('button',{name:'Your account',exact:true});
  await accountToggle.focus();await page.keyboard.press('Enter');
  await page.locator('#account-menu').getByRole('link',{name:'Security',exact:true}).waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  assert.equal(await accountToggle.getAttribute('aria-expanded'),'false');
  assert.equal(await accountToggle.evaluate(el=>document.activeElement===el),true);
  await accountToggle.click();await page.getByRole('heading',{level:1}).click();
  assert.equal(await accountToggle.getAttribute('aria-expanded'),'false');
  checks.push('account-menu-keyboard-escape-and-outside-dismissal');
  const manage=page.getByRole('button',{name:'Manage',exact:true});
  await manage.focus();await page.keyboard.press('Enter');
  for(const name of ['Work queue','Assignment board','Review queue','Analytics','Audit log','Configuration']) await page.locator('#work-menu').getByRole('link',{name,exact:true}).waitFor({state:'visible'});
  await page.keyboard.press('Escape');assert.equal(await manage.evaluate(el=>document.activeElement===el),true);
  checks.push('all-municipal-destinations-and-work-menu-focus-return');
  await page.goto(APP+'/report');
  const fields=page.getByRole('region',{name:'Photo, category and location fields',exact:true});
  await fields.waitFor();const titleTop=await page.locator('h1').evaluate(el=>el.getBoundingClientRect().top);
  await fields.focus();await page.keyboard.press('PageDown');await page.waitForTimeout(200);
  assert.ok(await fields.evaluate(el=>el.scrollTop>0),'Report fields scroll from the keyboard');
  assert.equal(await page.locator('h1').evaluate(el=>el.getBoundingClientRect().top),titleTop);
  const submitRect=await page.getByRole('button',{name:'Send report',exact:true}).evaluate(el=>({top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom}));
  assert.ok(submitRect.top>=0 && submitRect.bottom<=600,'Submission remains visible while fields scroll');
  await capture('desktop-report-internal-scroll');checks.push('desktop-report-title-and-primary-action-stay-visible');
  await page.setViewportSize({width:768,height:1024});await page.goto(APP+'/dashboard');
  const mobile=page.getByRole('button',{name:'Open menu',exact:true});
  await mobile.focus();await page.keyboard.press('Enter');
  await page.getByRole('navigation',{name:'Main',exact:true}).getByRole('link',{name:'Analytics',exact:true}).waitFor();
  await capture('tablet-mobile-navigation');await axe('tablet-mobile-navigation');
  await page.keyboard.press('Escape');assert.equal(await mobile.getAttribute('aria-expanded'),'false');assert.equal(await mobile.evaluate(el=>document.activeElement===el),true);
  checks.push('tablet-navigation-disclosure-and-keyboard-escape');
  for(const size of [{width:1024,height:768},{width:1100,height:768},{width:1280,height:500}]) {
    await page.setViewportSize(size);await page.goto(APP+'/dashboard');await page.locator('.notification-control').waitFor();await overflow();
    if(size.height<600) assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),'Short desktop viewport uses natural scrolling');
    checks.push(`breakpoint-and-short-height-${size.width}x${size.height}`);
  }

  await page.setViewportSize({width:1280,height:600});
  await page.goto(APP+`/supervisor/issues/${issue.id}/cluster`);
  await page.locator('.workspace-scroll .leaflet-container').waitFor();
  assert.ok(await page.locator('.workspace-scroll > section').evaluateAll(sections=>sections.every(el=>el.scrollHeight<=el.clientHeight+2)), 'Cluster sections retain their content height and never overlap');
  await capture('desktop-split-merge-workspace');checks.push('split-merge-map-and-sections-do-not-overlap');
  const staffContext=await browser.newContext({viewport:{width:1280,height:600}});
  try {
    const response=await staffContext.request.post(APP+'/api/auth/login',{data:{email:'crew.roads@civictrack.example',password:'demo1234'}});assert.equal(response.status(),200);
    const workPage=await staffContext.newPage();await workPage.goto(APP+'/staff/queue');
    const firstWork=workPage.locator('table tbody a').first();await firstWork.waitFor();await firstWork.click();
    await workPage.getByRole('heading',{name:'Start work',exact:true}).waitFor();
    assert.equal(await workPage.getByRole('button',{name:'Start work',exact:true}).isEnabled(),true);
    assert.equal(await workPage.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1),false);
    await workPage.screenshot({path:fileURLToPath(new URL('staff-assigned-issue-work.png',dir)),fullPage:true});
    checks.push('staff-own-assigned-issue-action-preserved-read-only');
  } finally {await staffContext.close();}
  await page.setViewportSize({width:1280,height:600});await page.goto(APP+'/dashboard');
  await page.locator('.notification-control').waitFor();
  await page.getByRole('button',{name:'Your account',exact:true}).click();
  await page.locator('#account-menu').getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Manage',exact:true}).count(),0);
  checks.push('account-signout-returns-public-navigation');
  console.log('PASS',checks.length,'focused interaction/state checks; accessibility findings',accessibility.length);
} finally {await writeFile(new URL('results.json',dir),JSON.stringify({checks,accessibility},null,2));await browser.close();}
if(accessibility.length)process.exitCode=1;
