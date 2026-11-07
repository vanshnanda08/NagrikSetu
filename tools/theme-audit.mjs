// Read-only route/appearance audit against the local demo API. Creates one
// isolated citizen login; never submits reports, votes or municipal changes.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { APP, API, json } from './http.mjs';

const directory = new URL('../artifacts/frontend-redesign/', import.meta.url);
await mkdir(directory, { recursive: true });
const issues = await json('/public/issues?category=POTHOLE&limit=100');
const issue = issues.items.find(i => !['CLOSED','REJECTED'].includes(i.status)) ?? issues.items[0];
assert.ok(issue, 'A seeded Roads issue is required');
const wards = await json('/wards');
const pending = (await json('/public/issues?status=PENDING_VERIFICATION&limit=1')).items[0] ?? issue;
const replacements = { '[id]': issue.id, '[ref]': issue.publicRef };
const pages = await readdir(new URL('../frontend/src/app/', import.meta.url), { recursive: true });
const routes = pages.filter(p => p.endsWith('page.tsx') && !p.startsWith('api/')).map(p => {
  let route = '/' + p.replace(/\/?page.tsx$/, '');
  if (route.startsWith('/dashboard/wards/')) return route.replace('[id]', wards[0].id);
  if (route.startsWith('/me/verify/')) return route.replace('[id]', pending.id);
  for (const [key,value] of Object.entries(replacements)) route = route.replace(key,value);
  return route;
}).sort();
routes.push('/does-not-exist','/issues/00000000-0000-0000-0000-000000000000','/report/success/CT-1999-000001','/dashboard/wards/00000000-0000-0000-0000-000000000000');
const email = `theme-review-${Date.now()}@example.test`, password = 'theme-review-1234';
if (!process.env.THEME_AUDIT_ROLE || process.env.THEME_AUDIT_ROLE === 'CITIZEN') await json('/auth/register', { method: 'POST', body: { email, password, fullName: 'Theme Review Citizen' } });
const browser = await chromium.launch({ channel: 'chrome' });
const failures = [], accessibility = [], spatialExceptions = [], runtime = [], results = [];
const sizes = [{ width:390,height:844 },{ width:768,height:1024 },{ width:1280,height:600 },{ width:1366,height:768 },{ width:1440,height:900 },{ width:1920,height:1080 }];
const roles = [['anonymous',null],['CITIZEN',email],['STAFF','crew.roads@civictrack.example'],['SUPERVISOR','head.roads@civictrack.example'],['ADMIN','commissioner@civictrack.example']].filter(([role]) => !process.env.THEME_AUDIT_ROLE || role === process.env.THEME_AUDIT_ROLE);
assert.ok(roles.length, 'Known audit role');
// Resume one role after local throttling without redoing successful contexts.
if (process.env.THEME_AUDIT_ROLE) {
  const prior = JSON.parse(await readFile(new URL('results.json',directory),'utf8'));
  for (const [key, list] of Object.entries({results,failures,accessibility,spatialExceptions,runtime})) list.push(...(prior[key] ?? []).filter(r => r.role !== process.env.THEME_AUDIT_ROLE));
}
const axeRoutes = new Set(['/dashboard','/issues','/map','/report','/login','/register','/forgot-password','/reset-password','/me/reports','/me/notifications','/me/profile','/me/security','/staff/queue','/supervisor/queue','/supervisor/review','/supervisor/analytics','/admin/audit','/admin/configuration',`/issues/${issue.id}`,`/supervisor/issues/${issue.id}`,`/supervisor/issues/${issue.id}/cluster`]);
const slug = p => p === '/' ? 'root' : p.slice(1).replaceAll('/','_');
async function palette(page) {
  return page.evaluate(() => {
    const els = [document.body,document.querySelector('header'),document.querySelector('main'),...document.querySelectorAll('.metric-tile,.ui-button,input,select,.auth-panel,.leaflet-bar a')];
    return els.filter(Boolean).map(el => { const s=getComputedStyle(el); return [s.color,s.backgroundColor,s.borderColor,s.colorScheme]; });
  });
}
try {
  for (const [role,account] of roles) {
    const context = await browser.newContext({ viewport:sizes[0], colorScheme:'light' });
    if (account) {
      const signIn = () => context.request.post(APP+'/api/auth/login',{ data:{ email:account,password:role==='CITIZEN'?password:'demo1234' } });
      let response = await signIn();
      if (response.status() === 429) {
        const seconds = Number(response.headers()['retry-after'] ?? 60) + 1;
        console.log(`${role}: respecting local sign-in throttle; retrying after ${seconds}s`);
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        response = await signIn();
      }
      assert.equal(response.status(),200,`${role} demo login`);
    }
    const page = await context.newPage();
    page.on('pageerror',e=>runtime.push({role,message:e.message}));
    for (const size of sizes) {
      await page.setViewportSize(size);
      for (const path of routes) {
        const record = { role,width:size.width,height:size.height,path };
        try {
          await page.emulateMedia({colorScheme:'light'});
          await page.goto(APP+path,{ waitUntil:'domcontentloaded' });
          await page.locator('h1, main .feedback-panel').first().waitFor({timeout:15000});
          await page.waitForTimeout(700);
          await page.locator('.loading-state').first().waitFor({state:'hidden',timeout:8000}).catch(()=>{});
          const text = await page.locator('body').innerText();
          assert.ok(!/This page couldn.t load|\bNaN\b|\[object Object\]/.test(text),'No crash or malformed values');
          const overflow = await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
          assert.equal(overflow,false,'No page-level horizontal overflow');
          if (size.width >= 1280) assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight > innerHeight + 1),false,'Desktop content remains inside its scroll regions');
          if (size.width >= 1280) {
            const header = await page.locator('.site-header-inner').evaluate(el => {
              const brand=el.querySelector('.site-logo').getBoundingClientRect(), nav=el.querySelector('#site-nav').getBoundingClientRect(), actions=el.querySelector('.site-actions').getBoundingClientRect();
              return { fits: brand.right <= nav.left && nav.right <= actions.left && el.scrollWidth <= el.clientWidth, selected:[...el.querySelectorAll('.site-links > a[aria-current="page"], .manage-toggle[data-active="true"]')].map(e=>getComputedStyle(e).backgroundColor) };
            });
            assert.equal(header.fits,true,'One-row desktop navigation fits without overlapping controls');
            assert.ok(header.selected.every(color => color === 'rgb(11, 59, 94)'), 'Active navigation uses the dark filled pill');
          }
          const light = await palette(page);
          await page.emulateMedia({colorScheme:'dark'});
          assert.deepEqual(await palette(page),light,'Operating-system appearance leaves the palette unchanged');
          assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('dark')),false);
          assert.equal(await page.getByRole('button',{name:/^(Light|Dark) mode$/}).count(),0,'No appearance toggle');
          assert.equal(await page.evaluate(()=>localStorage.getItem('theme')),null,'No saved theme preference');
          if(size.width===1440 || ['/dashboard','/report','/map','/me/profile','/staff/queue','/supervisor/queue','/admin/configuration'].includes(path)) await page.screenshot({path:fileURLToPath(new URL(`${role}-${size.width}-${slug(path)}.png`,directory)),fullPage:true});
          if((size.width===390 || size.width===1280) && axeRoutes.has(path)) {
            await page.addScriptTag({path:fileURLToPath(new URL('../frontend/node_modules/axe-core/axe.min.js',import.meta.url))});
            const violations=await page.evaluate(async()=> (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
            // WCAG 2.5.8 allows an equivalent control on the same page.
            // Crowded geographic markers have an identical-action, full-width
            // list below the map. Retain the raw geometry finding as evidence.
            const spatial = violations.filter(v => path === '/map' && v.id === 'target-size' && v.nodes.every(n => n.target.every(t => t.includes('civictrack-marker'))));
            if (spatial.length) {
              const options = page.locator('.map-issue-option');
              assert.ok(await options.count() > 0, 'Equivalent map list exists');
              const targets = await options.evaluateAll(els => els.every(el => parseFloat(getComputedStyle(el).minHeight) >= 44));
              assert.ok(targets, 'Equivalent map controls have at least 44px targets');
              spatialExceptions.push({...record,violations:spatial});
            }
            const actionable = violations.filter(v => !spatial.includes(v));
            if(actionable.length) accessibility.push({...record,violations:actionable});
          }
          record.ok=true;
        } catch(error) { record.ok=false;record.error=error.message;failures.push(record); console.log("FAIL",JSON.stringify(record)); }
        results.push(record);
      }
      console.log(`${role} ${size.width}px: ${results.filter(r=>r.role===role&&r.width===size.width&&r.ok).length}/${routes.length} routes passed`);
    }
    // Mobile disclosure is a real, keyboard-operable menu; closed links cannot
    // receive focus, and desktop Manage remains reachable above page content.
    await page.setViewportSize(sizes[0]); await page.goto(APP+'/dashboard');
    const toggle=page.getByRole('button',{name:'Open menu',exact:true});
    await toggle.click(); await page.getByRole('navigation',{name:'Main',exact:true}).getByRole('link',{name:'Issues',exact:true}).click();
    await page.waitForURL(APP+'/issues');
    assert.equal(await page.getByRole('button',{name:'Open menu',exact:true}).getAttribute('aria-expanded'),'false');
    await page.screenshot({path:fileURLToPath(new URL(`${role}-mobile-issues.png`,directory)),fullPage:true});
    await context.close();
  }
  console.log(`Total route checks: ${results.length}. Route failures: ${failures.length}; accessibility pages with findings: ${accessibility.length}; runtime errors: ${runtime.length}`);
} finally {
  await writeFile(new URL('results.json',directory),JSON.stringify({routes,results,failures,accessibility,spatialExceptions,runtime},null,2));
  await browser.close();
}
if(failures.length || accessibility.length || runtime.length) process.exitCode=1;
