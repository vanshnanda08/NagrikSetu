// Failure and accessibility checks against an owned loopback production build.
// Browser fixtures model transport/concurrency failures; no civic writes leave this fixture.
import { chromium, expect as baseExpect } from 'playwright/test';
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const cfg = JSON.parse(await readFile(process.env.CLOSEOUT_CONFIG, 'utf8'));
const APP = cfg.app, API = cfg.api;
for (const url of [APP, API]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
assert.equal(process.env.CLOSEOUT_SCRATCH, '1');
const out = resolve(process.env.CLOSEOUT_OUTPUT ?? 'artifacts/nonphone-closeout-browser');
await mkdir(out, { recursive: true });
const expect = baseExpect.configure({ timeout: 25000 });
const result = { startedAt: new Date().toISOString(), checks: [], accessibility: [], errors: [], fixtures: [], screenshots: [] };
const redact = value => [cfg.password, cfg.citizenPassword].reduce((s, p) => s.replaceAll(p, '[redacted]'), String(value));
const save = () => writeFile(out + '/results.json', redact(JSON.stringify(result, null, 2)));
const browser = await chromium.launch({ channel: 'chrome' });
const actors = [];
let activePage;
async function actor(role, email, password) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 600 }, geolocation: { latitude: 30.356, longitude: 76.3655, accuracy: 8 }, permissions: ['geolocation'] });
  if (cfg.sessionDir && existsSync(cfg.sessionDir + '/' + role + '.json')) await context.addCookies(JSON.parse(await readFile(cfg.sessionDir + '/' + role + '.json', 'utf8')).cookies);
  const page = await context.newPage(); page.setDefaultTimeout(25000);
  page.on('pageerror', e => result.errors.push({ role, message: redact(e.message) }));
  const a = { role, context, page }; actors.push(a);
  if (email) {
    let response = cfg.sessionDir && existsSync(cfg.sessionDir + '/' + role + '.json') ? await context.request.post(APP + '/api/auth/refresh') : null;
    if (!response?.ok()) response = await context.request.post(APP + '/api/auth/login', { data: { email, password } });
    assert.equal(response.status(), 200, role + ' normal sign-in');
    a.session = await response.json();
  }
  // Auth refresh is real; all civic mutations in this harness must be specifically fulfilled fixtures.
  await context.route(API + '/**', async route => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue();
    result.errors.push('Unexpected civic write ' + new URL(route.request().url()).pathname);
    return route.abort();
  });
  return a;
}
async function api(a, path) {
  const response = await a.context.request.get(API + path, { headers: a.session ? { Authorization: 'Bearer ' + a.session.accessToken } : {} });
  assert.equal(response.status(), 200, path); return response.json();
}
async function check(name, fn) {
  if (process.env.CLOSEOUT_ONLY && !name.startsWith(process.env.CLOSEOUT_ONLY)) return;
  await fn(); result.checks.push(name); await save(); console.log('PASS ' + name);
}
async function loaded(a, path, selector) {
  activePage = a.page; await a.page.goto(APP + path);
  await expect(a.page.locator('main h1:visible')).toHaveCount(1);
  if (selector) await selector(a.page);
  await expect(a.page.locator('main').getByText(/^Loading(?: |…|\.\.\.)/)).toHaveCount(0);
}
async function capture(a, label) {
  const file = label + '.png'; await a.page.screenshot({ path: out + '/' + file }); result.screenshots.push(file);
}
async function axe(a, label) {
  await a.page.addScriptTag({ path: resolve('frontend/node_modules/axe-core/axe.min.js') });
  const violations = await a.page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })));
  result.accessibility.push({ label, violations });
}
async function putJob(page, job) {
  await page.evaluate(job => new Promise((resolve, reject) => {
    const r = indexedDB.open('civictrack-offline', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('drafts'); r.result.createObjectStore('outbox', { keyPath: 'id' }); };
    r.onsuccess = () => { const db = r.result, tx = db.transaction('outbox', 'readwrite'); tx.objectStore('outbox').put(job); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    r.onerror = () => reject(r.error);
  }), job);
}
async function readJob(page, id) {
  return page.evaluate(id => new Promise((resolve, reject) => {
    const r = indexedDB.open('civictrack-offline', 1); r.onsuccess = () => { const db = r.result, tx = db.transaction('outbox'); const q = tx.objectStore('outbox').get(id); q.onsuccess = () => resolve(q.result); tx.oncomplete = () => db.close(); }; r.onerror = () => reject(r.error);
  }), id);
}
async function wake(page) {
  await page.evaluate(async () => { const r = await navigator.serviceWorker.register('/report-worker.js'); await navigator.serviceWorker.ready; r.active?.postMessage('send-reports'); });
}
try {
  const guest = await actor('public'), citizen = await actor('citizen', cfg.citizenEmail, cfg.citizenPassword),
    staff = await actor('staff', 'crew.roads@civictrack.example', cfg.password),
    supervisor = await actor('supervisor', 'head.roads@civictrack.example', cfg.password),
    admin = await actor('admin', 'commissioner@civictrack.example', cfg.password);
  await check('Bulk acknowledgement keeps only actionable failures selected after concurrent updates', async () => {
    const actual = await api(supervisor, '/supervisor/queue?tab=all&limit=200');
    assert.ok(actual.length >= 3); const rows = actual.slice(0, 3).map(b => ({ ...b, row: { ...b.row, status: 'NEW' } }));
    const state = new Map(rows.map(b => [b.row.id, 'NEW'])); let attempts = [], refuse = true, reads = 0;
    await supervisor.context.route(API + '/supervisor/queue?**', r => { reads++; return r.fulfill({ json: rows.map(b => ({ ...b, row: { ...b.row, status: state.get(b.row.id) } })) }); });
    for (const [i, b] of rows.entries()) await supervisor.context.route(API + '/issues/' + b.row.id + '/acknowledge', r => {
      attempts.push(b.row.id);
      if (i === 1 && refuse) { state.set(b.row.id, 'ACKNOWLEDGED'); return r.fulfill({ status: 409, json: { detail: 'Another officer acknowledged this complaint.' } }); }
      if (i === 2 && refuse) return r.fulfill({ status: 503, json: { detail: 'Temporary service failure; retry this complaint.' } });
      state.set(b.row.id, 'ACKNOWLEDGED'); return r.fulfill({ json: { ...b.row, status: 'ACKNOWLEDGED' } });
    });
    await loaded(supervisor, '/work?view=assignments', p => p.getByRole('button', { name: 'Select new on this page', exact: true }).waitFor());
    await supervisor.page.getByRole('button', { name: 'Select new on this page', exact: true }).click();
    await supervisor.page.getByRole('button', { name: 'Acknowledge 3 selected', exact: true }).click();
    await expect(supervisor.page.getByRole('status').filter({ hasText: '1 acknowledged, 2 refused' })).toBeVisible();
    await expect.poll(() => reads).toBeGreaterThan(1);
    await expect(supervisor.page.getByRole('button', { name: 'Acknowledge 1 selected', exact: true })).toBeVisible();
    await expect(supervisor.page.getByRole('region', { name: 'Assignment queue', exact: true }).getByRole('alert')).toHaveCount(2); refuse = false;
    await supervisor.page.getByRole('button', { name: 'Acknowledge 1 selected', exact: true }).click();
    await expect(supervisor.page.getByRole('status').filter({ hasText: /^1 acknowledged\.$/ })).toBeVisible();
    assert.deepEqual(attempts, [rows[0].row.id, rows[1].row.id, rows[2].row.id, rows[2].row.id]);
    await expect(supervisor.page.getByRole('button', { name: /Acknowledge/ })).toHaveCount(0);
    result.fixtures.push('Three bulk rows: success, concurrent 409, temporary 503; retry only the remaining NEW row');
    await capture(supervisor, 'bulk-partial-retry'); await supervisor.context.unroute(API + '/supervisor/queue?**');
  });
  await check('Dashboard polls after unsupported SSE and resumes updates after an SSE reconnect', async () => {
    const context = await browser.newContext(); const page = await context.newPage(); activePage = page;
    await page.clock.install(); let summaryReads = 0, summary = await api(guest, '/dashboard/summary');
    await context.addInitScript(() => { Object.defineProperty(window, 'EventSource', { value: undefined }); });
    await context.route(API + '/dashboard/summary', r => { summaryReads++; return r.fulfill({ json: { ...summary, overdueCount: summaryReads > 1 ? 123 : 122 } }); });
    await page.goto(APP + '/dashboard'); await expect(page.locator('.metric-tile').filter({ has: page.getByRole('heading', { name: 'Currently overdue', exact: true }) }).locator('.metric-figure')).toHaveText('122');
    await page.clock.runFor(61000); await expect.poll(() => summaryReads).toBeGreaterThan(1);
    await expect(page.locator('.metric-tile').filter({ has: page.getByRole('heading', { name: 'Currently overdue', exact: true }) }).locator('.metric-figure')).toHaveText('123'); await context.close();
    const reconnect = await browser.newContext(); const p = await reconnect.newPage(); let reads = 0;
    await reconnect.addInitScript(() => { class TestEventSource extends EventTarget { constructor() { super(); window.closeoutStream = this; } close() {} } window.EventSource = TestEventSource; });
    await reconnect.route(API + '/dashboard/summary', r => { reads++; return r.fulfill({ json: { ...summary, overdueCount: reads > 1 ? 125 : 124 } }); });
    await p.goto(APP + '/dashboard'); await expect(p.locator('.metric-tile').filter({ has: p.getByRole('heading', { name: 'Currently overdue', exact: true }) }).locator('.metric-figure')).toHaveText('124');
    await p.evaluate(() => { window.closeoutStream.onerror?.(); window.closeoutStream.dispatchEvent(new Event('ready')); window.closeoutStream.dispatchEvent(new Event('changed')); });
    await expect(p.locator('.metric-tile').filter({ has: p.getByRole('heading', { name: 'Currently overdue', exact: true }) }).locator('.metric-figure')).toHaveText('125'); await reconnect.close();
    result.fixtures.push('Unsupported EventSource with real polling timer; simulated reconnect/changed event with actual query invalidation');
  });
  await check('Outbox preserves permanent refusals, honors Retry-After and clears payload only after success', async () => {
    const a = await actor('outbox'); await a.page.goto(APP + '/report/outbox');
    let mode = 'permanent', calls = 0;
    await a.context.route(APP + '/api/offline-report', r => { calls++; return mode === 'permanent'
      ? r.fulfill({ status: 400, json: { detail: 'Fixture category is no longer available.' } })
      : mode === 'limited' ? r.fulfill({ status: 429, headers: { 'Retry-After': '180' }, json: { detail: 'Try again later.' } })
      : r.fulfill({ json: { issueId: crypto.randomUUID(), publicRef: 'CT-2026-S900001' } }); });
    const job = { id: crypto.randomUUID(), userId: null, body: { photoUrl: cfg.evidenceUrl, categoryCode: 'SIGNAGE', description: 'LOCAL UI FIXTURE ONLY' }, blob: null, cloud: '', preset: '', createdAt: Date.now(), nextAttempt: 0, attempts: 0, state: 'pending' };
    await putJob(a.page, job); await wake(a.page);
    await expect.poll(async () => (await readJob(a.page, job.id))?.state).toBe('failed');
    await expect(a.page.getByRole('heading', { name: 'Needs attention', exact: true })).toBeVisible();
    assert.ok((await readJob(a.page, job.id)).body.photoUrl); mode = 'limited';
    await a.page.getByRole('button', { name: 'Retry now', exact: true }).click();
    await expect.poll(async () => (await readJob(a.page, job.id))?.message).toBe('Try again later.');
    const limited = await readJob(a.page, job.id); assert.ok(limited.nextAttempt >= Date.now() + 170000); const n = calls;
    const worker = a.context.serviceWorkers()[0]; await worker.evaluate(async () => { try { await drain(); } catch { /* Future retry remains queued. */ } }); assert.equal(calls, n, 'Worker does not retry before Retry-After deadline');
    result.outboxRetry = { attempts: limited.attempts, delaySeconds: Math.round((limited.nextAttempt - Date.now()) / 1000) };
    mode = 'success'; await a.page.getByRole('button', { name: 'Retry now', exact: true }).click();
    await expect.poll(async () => (await readJob(a.page, job.id))?.state).toBe('sent');
    const sent = await readJob(a.page, job.id); assert.deepEqual(sent.body, {}); assert.equal(sent.blob, null);
    await capture(a, 'outbox-failure-retry'); result.fixtures.push('400, 429 Retry-After=180, then 200 from fixture-only report proxy');
  });
  await check('Warm offline form keeps its saved confirmation and cannot overwrite the queued photo', async () => {
    const a = await actor('offline-form');
    await a.context.route('**/report/outbox?*', r => r.abort());
    await a.page.goto(APP + '/report');
    await a.page.getByRole('button', { name: 'Take a photo', exact: true }).waitFor();
    const data = await a.page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 960; c.height = 640;
      const g = c.getContext('2d'); g.fillStyle = '#174c5b'; g.fillRect(0, 0, 960, 640);
      g.fillStyle = 'white'; g.font = 'bold 40px sans-serif'; g.fillText('SYNTHETIC OFFLINE QA', 35, 100);
      g.font = '28px sans-serif'; g.fillText('NO MUNICIPAL ACTION REQUIRED', 35, 160);
      g.fillRect(50, 220, 240, 300); g.fillRect(380, 220, 150, 170);
      return c.toDataURL('image/jpeg').split(',')[1];
    });
    await a.page.locator('#photo').setInputFiles({ name: 'synthetic-offline-qa.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(data, 'base64') });
    await a.page.getByRole('button', { name: 'Take a different photo', exact: true }).waitFor();
    await a.page.getByRole('combobox', { name: /What is the problem/ }).selectOption('SIGNAGE');
    await a.page.getByLabel('Description (optional)', { exact: true }).fill('SYNTHETIC LOCAL OFFLINE QA ONLY; no municipal action required.');
    await expect(a.page.getByText(/Located to within/)).toBeVisible();
    await a.context.setOffline(true); await a.page.getByRole('button', { name: /^Send report/ }).click();
    await expect(a.page.getByRole('button', { name: 'Saved for delivery', exact: true })).toBeDisabled();
    await expect(a.page.getByText(/Your report is saved in the outbox/)).toBeVisible();
    assert.equal(new URL(a.page.url()).pathname, '/report');
    const saved = await a.page.evaluate(() => new Promise((resolve, reject) => {
      const r = indexedDB.open('civictrack-offline', 1); r.onerror = () => reject(r.error);
      r.onsuccess = () => { const db = r.result, tx = db.transaction('outbox'), q = tx.objectStore('outbox').getAll();
        q.onsuccess = () => resolve(q.result.map(j => ({ state: j.state, body: j.body, photoBytes: j.blob?.size }))); tx.oncomplete = () => db.close(); };
    }));
    assert.equal(saved.length, 1); assert.ok(saved[0].photoBytes > 0);
    assert.match(saved[0].body.description, /SYNTHETIC LOCAL OFFLINE QA/);
    await axe(a, 'warm-offline-confirmation');
    await capture(a, 'warm-offline-saved');
  });
  await check('Administrator closure draft survives queue arrival and cancellation', async () => {
    for (const [width, height] of [[1280, 600], [390, 844]]) {
      let releaseQueue;
      const queueGate = new Promise(resolve => { releaseQueue = resolve; });
      await admin.context.route(API + '/supervisor/queue?**', async route => {
        const response = await route.fetch();
        await queueGate;
        return route.fulfill({ response });
      });
      try {
        await admin.page.setViewportSize({ width, height }); activePage = admin.page;
        await admin.page.goto(APP + '/work?view=assignments&tab=all&issue=' + cfg.pendingIssue);
        const pane = admin.page.getByRole('region', { name: 'Selected complaint', exact: true });
        const reason = pane.getByRole('textbox', { name: /^Closure reason/ });
        const draft = 'SYNTHETIC LOCAL QA: closure draft must survive queue arrival.';
        await reason.fill(draft); await expect(reason).toHaveValue(draft);
        await expect(admin.page.locator('.work-master-detail')).toHaveClass(/detail-only/);
        releaseQueue();
        await expect(admin.page.locator('.work-master-detail')).not.toHaveClass(/detail-only/);
        await expect(reason).toHaveValue(draft);
        await pane.getByRole('button', { name: 'Close complaint', exact: true }).click();
        const dialog = admin.page.getByRole('dialog', { name: /^Close CT-/ });
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(dialog).not.toBeVisible(); await expect(reason).toHaveValue(draft);
        await expect(pane.getByRole('button', { name: 'Close complaint', exact: true })).toBeEnabled();
        await capture(admin, 'closure-draft-after-queue-' + width);
      } finally {
        releaseQueue(); await admin.context.unroute(API + '/supervisor/queue?**');
      }
    }
    result.fixtures.push('Real queue GET held until draft entry, then released; cancel only, no closure POST');
  });
  await check('Core public, citizen, staff, supervisor and administrator pages pass axe at desktop and mobile widths', async () => {
    const pages = [[guest, '/dashboard', 'dashboard'], [guest, '/report', 'report'], [citizen, '/me/reports', 'my-reports'], [citizen, '/me/verify/' + cfg.pendingIssue, 'verification'], [citizen, '/me/settings?tab=security', 'security'], [staff, '/work?view=mine&tab=all&issue=' + cfg.staffIssue, 'staff-work'], [supervisor, '/work?view=performance', 'performance'], [admin, '/admin', 'configuration'], [admin, '/admin?view=audit', 'audit']];
    for (const [a, path, label] of pages) for (const [width, height] of [[1280, 600], [390, 844]]) {
      await a.page.setViewportSize({ width, height }); await loaded(a, path); await axe(a, label + '-' + width);
      const dims = await a.page.evaluate(() => ({ width: innerWidth, height: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }));
      assert.ok(dims.sw <= width + 1, label + ' horizontal overflow'); if (width >= 1280) assert.ok(dims.sh <= height + 1, label + ' desktop outer overflow');
      await capture(a, label + '-' + width);
    }
    assert.deepEqual(result.accessibility.filter(scan => scan.violations.length), [], 'Accessibility findings');
  });
  await check('Keyboard skip navigation, sign-in dialog and account menu preserve focus', async () => {
    await guest.page.setViewportSize({ width: 1280, height: 600 }); await citizen.page.setViewportSize({ width: 1280, height: 600 });
    await loaded(guest, '/report'); await guest.page.keyboard.press('Tab');
    await expect(guest.page.getByRole('link', { name: 'Skip to main content', exact: true })).toBeFocused();
    await guest.page.keyboard.press('Enter'); await expect(guest.page.locator('#main-content')).toBeFocused();
    const signIn = guest.page.getByRole('button', { name: 'Sign in', exact: true }); await signIn.focus(); await signIn.press('Enter');
    const dialog = guest.page.getByRole('dialog', { name: 'Sign in', exact: true }); await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused(); await guest.page.keyboard.press('Tab'); await expect(dialog.getByLabel('Email', { exact: true })).toBeFocused(); await guest.page.keyboard.press('Escape'); await expect(signIn).toBeFocused();
    await loaded(citizen, '/me/settings?tab=security');
    const account = citizen.page.getByRole('button', { name: 'Your account', exact: true }); await account.focus(); await account.press('Enter'); await citizen.page.keyboard.press('Escape'); await expect(account).toBeFocused();
  });
  assert.deepEqual(result.errors, []); result.finishedAt = new Date().toISOString(); console.log('COMPLETE ' + result.checks.length + ' non-phone check groups');
} catch (error) { result.failure = redact(error.message); console.error('FAIL ' + redact(error.message)); if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: out + '/failure.png' }).catch(() => {}); process.exitCode = 1; }
finally { await save(); for (const a of actors) { if (cfg.sessionDir) { await mkdir(cfg.sessionDir, { recursive: true, mode: 0o700 }); const file = cfg.sessionDir + '/' + a.role + '.json'; await a.context.storageState({ path: file }); await chmod(file, 0o600); } await a.context.close(); } await browser.close(); }
