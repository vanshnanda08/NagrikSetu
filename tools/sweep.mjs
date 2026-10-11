import { chromium } from 'playwright';
import { json } from './http.mjs';
const APP='http://localhost:3000', API='http://localhost:8080/api/v1';
const page1 = await (await fetch(`${API}/public/issues?limit=1`)).json();
const iss = page1.items[0];

// The staff work view is scoped by @issueGuard, so it has to be exercised with
// an issue the signed-in user can actually see. This walk signs in as the ROADS
// supervisor, and picking the newest issue regardless of department produced a
// 403 that read as a failure and was in fact the guard working correctly --
// which is the worst kind of finding for a harness to report, because a check
// that cries wolf gets ignored. Pick an issue that department owns.
const roads = await (await fetch(`${API}/public/issues?category=POTHOLE&limit=1`)).json();
const staffIss = roads.items[0] ?? iss;
const q = await (await fetch(`${API}/public/issues?status=PENDING_VERIFICATION&limit=1`)).json();
const pend = q.items[0];
const r = await (await fetch(`${API}/public/issues?status=RESOLVED&limit=1`)).json();
const res = r.items[0];

const routes = [
  '/', '/report', '/map', '/issues', '/issues?sort=priority&status=NEW', '/dashboard',
  '/login', '/register', '/me/reports', '/staff/queue', '/staff/queue?tab=unassigned',
  `/issues/${iss.id}`, `/issues/${iss.id}/cluster`, `/report/success/${iss.publicRef}`,
  `/staff/issues/${staffIss.id}`, '/does-not-exist', '/issues/00000000-0000-0000-0000-000000000000',
  '/report/success/CT-1999-000001',
];
routes.push('/me/notifications', `/me/verify/${pend?.id ?? iss.id}`,
  '/supervisor/queue', '/supervisor/queue?tab=all', '/supervisor/review',
  `/supervisor/issues/${staffIss.id}/cluster`);
if (pend) { routes.push(`/issues/${pend.id}`, `/issues/${pend.id}/cluster`); }
if (res)  { routes.push(`/issues/${res.id}`); }

const citizenEmail = `sweep-${Date.now()}@civictrack.example`;
await json('/auth/register', { method:'POST', body:{
  email:citizenEmail, password:'sweep-demo1234', fullName:'Route sweep citizen',
} });
const b = await chromium.launch({ channel:'chrome' });
let failures = 0;
try {
for (const [role, email] of [
  ['anonymous', null], ['CITIZEN', citizenEmail],
  ['STAFF', 'crew.roads@civictrack.example'],
  ['SUPERVISOR', 'head.roads@civictrack.example'],
  ['ADMIN', 'commissioner@civictrack.example'],
]) {
  const ctx = await b.newContext({ viewport:{width:1280,height:900} });
  const p = await ctx.newPage();
  if (email) {
    // Sign-in is a DIALOG now, and it is mounted globally -- so scope every
    // selector to it. `getByLabel('Email')` unscoped matched two inputs the
    // moment /login stopped carrying its own copy of the form, and this
    // harness died on the strict-mode violation rather than on anything real.
    await p.goto(APP+'/login',{waitUntil:'networkidle'});
    const dlg = p.locator('dialog');
    await dlg.locator('input[autocomplete="username"]').fill(email);
    await dlg.locator('input[autocomplete="current-password"]').fill(role === 'CITIZEN' ? 'sweep-demo1234' : 'demo1234');
    await dlg.getByRole('button',{name:'Sign in'}).click();
    // The dialog closing IS the success signal; there is no navigation to await
    // unless the caller asked for one.
    await p.waitForFunction(() => !document.querySelector('dialog')?.open, null, { timeout: 15000 });
    await p.waitForTimeout(500);
  }
  console.log(`\n--- ${role} ---`);
  for (const route of routes) {
    const errs = [];
    const failedPhotos = [];
    const onErr = e => errs.push('pageerror: ' + String(e).slice(0,110));
    // HTTP errors are checked with their URL/status below, so deliberate 404s
    // cannot hide an unrelated JavaScript failure on the same page.
    const onCon = m => { if (m.type()==='error' && !m.text().startsWith('Failed to load resource:')) errs.push('console: ' + m.text().slice(0,110)); };
    const onResponse = response => {
      const status = response.status();
      if (status < 400) return;
      const url = new URL(response.url());
      const missing = ['/does-not-exist', '/issues/00000000-0000-0000-0000-000000000000', '/report/success/CT-1999-000001'].includes(route);
      if (status === 404 && missing && (url.pathname === route || /^\/api\/v1\/public\/issues\/00000000-0000-0000-0000-000000000000(?:\/(?:history|reports))?$/.test(url.pathname) || url.pathname.endsWith('/CT-1999-000001'))) return;
      if (response.request().resourceType() === 'image' && url.hostname === 'res.cloudinary.com') {
        failedPhotos.push(response.url());
        return;
      }
      if (status === 401 && url.pathname === '/api/auth/refresh') return;
      if (status === 403 && role === 'CITIZEN' && (url.pathname.startsWith('/api/v1/staff/') || url.pathname === `/api/v1/issues/${staffIss.id}`)) return;
      errs.push(`HTTP ${status}: ${url.pathname}`);
    };
    p.on('response', onResponse);
    p.on('pageerror', onErr); p.on('console', onCon);
    try {
      await p.goto(APP+route, { waitUntil:'domcontentloaded', timeout: 25000 });
      await p.waitForSelector('h1, h2', { timeout: 15000 }).catch(()=>{});
      await p.waitForTimeout(1600);
      const t = await p.locator('body').innerText();
      if (failedPhotos.length) {
        const remaining = await p.locator('img').evaluateAll((images, urls) => images.some(image => urls.includes(image.src)), failedPhotos);
        if (remaining || !t.includes('Photo unavailable')) errs.push('Failed photo did not render its fallback');
      }
      const crashed = /This page couldn.t load/.test(t);
      const nan = /\bNaN\b|undefined|\[object Object\]/.test(t);
      const flag = crashed ? 'CRASHED' : errs.length ? 'ERRORS ' : nan ? 'NaN/undef' : 'ok     ';
      if (crashed || errs.length || nan) failures++;
      console.log(`  ${flag}  ${route}`);
      if (crashed || errs.length) errs.slice(0,2).forEach(e=>console.log(`        ${e}`));
      if (nan && !crashed) console.log(`        ${t.split('\n').find(l=>/\bNaN\b|undefined|\[object Object\]/.test(l))?.slice(0,90)}`);
    } catch (e) {
      failures++;
      console.log(`  TIMEOUT  ${route}  ${String(e).slice(0,80)}`);
    }
    p.off('pageerror', onErr); p.off('console', onCon); p.off('response', onResponse);
  }
  await ctx.close();
}
} finally {
  await b.close();
}
console.log(`\n${failures} failing route checks`);
process.exitCode = failures ? 1 : 0;
