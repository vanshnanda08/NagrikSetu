// Run only against the local demo scratch API. Never uses production accounts.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { APP, json, login } from './http.mjs';

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let buffer = 0, bits = 0; const bytes = [];
  for (const c of secret) { buffer = (buffer << 5) | alphabet.indexOf(c); bits += 5;
    if (bits >= 8) { bytes.push((buffer >> (bits - 8)) & 255); bits -= 8; } }
  const time = Buffer.alloc(8); time.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac('sha1', Buffer.from(bytes)).update(time).digest();
  const offset = hash.at(-1) & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('../artifacts/audit', { recursive: true });
const email = `audit-${crypto.randomUUID()}@example.test`, password = 'audit-password-123';
try {
  for (const route of ['login', 'register', 'refresh', 'logout']) {
    const response = await context.request.post(`${APP}/api/auth/${route}`, {
      headers: { Origin: 'https://outside.example' }, data: {},
    });
    assert.equal(response.status(), 403, `cross-origin ${route}`);
  }
  console.log('PASS cross-origin auth writes rejected');
  const registered = await context.request.post(APP + '/api/auth/register', { data: { email, password, fullName: 'Audit Citizen' } });
  assert.equal(registered.status(), 200);
  const account = await registered.json();
  assert.equal('refreshToken' in account, false, 'refresh token never returned to browser JS');
  const cookie = (await context.cookies()).find(c => c.name === 'civictrack_refresh');
  assert.ok(cookie.httpOnly && cookie.secure && cookie.sameSite === 'Lax');
  await page.goto(APP + '/me/security');
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Set up authenticator' }).click();
  const secret = await page.locator('code').first().textContent();
  await page.getByLabel('Six-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Confirm and enable' }).click();
  await page.getByRole('heading', { name: 'Save these recovery codes now' }).waitFor();
  const recovery = await page.locator('[role="status"] li').allTextContents();
  assert.equal(recovery.length, 10);
  await context.request.post(APP + '/api/auth/logout');
  await page.goto(APP + '/login?next=javascript:alert(1)');
  const dialog = page.locator('dialog');
  await dialog.getByLabel('Email', { exact: true }).fill(email);
  await dialog.getByLabel('Password', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await dialog.getByLabel('Authenticator or recovery code').fill(recovery[0]);
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(APP + '/dashboard');
  assert.equal((await context.request.post(APP + '/api/auth/login', { data: { email, password, mfaCode: recovery[0] } })).status(), 401);
  console.log('PASS MFA enrolment, recovery login, one-use recovery and safe redirect');

  const other = await browser.newContext();
  const otherLogin = await other.request.post(APP + '/api/auth/login', { data: { email, password, mfaCode: recovery[1] } });
  assert.equal(otherLogin.status(), 200);
  await page.goto(APP + '/me/security');
  await page.getByRole('button', { name: 'Sign out other devices' }).click();
  await page.getByRole('status').filter({ hasText: 'Session access updated.' }).waitFor();
  assert.equal((await other.request.post(APP + '/api/auth/refresh')).status(), 401);
  await other.close();
  console.log('PASS session revocation through UI');

  const token = await (await context.request.post(APP + '/api/auth/refresh')).json();
  const donor = (await json('/public/issues?category=POTHOLE&status=NEW&limit=1')).items[0];
  assert.ok(donor, 'seeded Roads issue');
  const report = await json('/reports', { token, method: 'POST', body: {
    categoryCode: donor.categoryCode, lat: donor.lat, lng: donor.lng, accuracyM: 8,
    manualPin: false, deviceId: 'audit-' + crypto.randomUUID(),
    photoUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', description: 'Audit reporter evidence',
  } });
  const issuePath = `/issues/${report.issueId}`;
  await page.goto(APP + issuePath);
  await page.getByRole('button', { name: 'Follow this issue', exact: true }).click();
  await page.getByRole('button', { name: 'Stop following', exact: true }).waitFor();
  const staff = await login('head.roads@civictrack.example');
  const question = `Which side of the road is affected? ${crypto.randomUUID()}`;
  const reply = `The north side beside the bus stop. ${crypto.randomUUID()}`;
  await json(`${issuePath}/messages`, { token: staff, method: 'POST', body: { body: question } });
  await page.reload();
  await page.getByText(question, { exact: true }).waitFor();
  await page.getByLabel('Reply to the department').fill(reply);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByText(reply, { exact: true }).waitFor();
  await json(`${issuePath}/messages`, { token, method: 'POST', body: { body: 'Long-reference-' + 'x'.repeat(300) } });
  await page.getByRole('button', { name: 'Stop following', exact: true }).click();
  await page.getByRole('button', { name: 'Follow this issue', exact: true }).waitFor();
  console.log('PASS following and private clarification round trip');

  // A failed write must remain visible and preserve the user's input.
  await page.route('**/api/v1/issues/*/follow', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ detail: 'Audit simulated outage' }) })
    : route.continue());
  await page.getByRole('button', { name: 'Follow this issue', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Audit simulated outage' }).waitFor();
  await page.unroute('**/api/v1/issues/*/follow');
  console.log('PASS failed follow action displays error feedback');

  const routes = ['/dashboard', '/issues', '/report', '/me/profile', '/me/security', '/report/outbox', issuePath];
  let checks = 0; const violations = [];
  for (const theme of ['light', 'dark']) {
    await page.evaluate(t => { localStorage.setItem('theme', t); document.documentElement.classList.toggle('dark', t === 'dark'); }, theme);
    for (const width of [320, 375, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of routes) {
        const refreshed = page.waitForResponse(r => r.url().endsWith('/api/auth/refresh'));
        await page.goto(APP + path);
        assert.equal((await refreshed).status(), 200, `authenticated session retained: ${theme} ${width}px ${path}`);
        await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor({ state: 'attached' });
        await page.locator('h1').waitFor();
        await page.waitForTimeout(350);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        assert.equal(overflow, false, `${theme} ${width}px overflow on ${path}`);
        checks++;
        if (width === 375) {
          await page.addScriptTag({ path: '../frontend/node_modules/axe-core/axe.min.js' });
          const result = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }));
          for (const v of result.violations) violations.push({ theme, path, id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) });
        }
      }
      if (width === 375 || width === 1280) await page.screenshot({ path: `../artifacts/audit/issue-${theme}-${width}.png`, fullPage: true });
    }
  }
  console.log(`PASS ${checks} responsive route/theme checks`);
  console.log('ACCESSIBILITY', JSON.stringify(violations));
  const manifest = await (await context.request.get(APP + '/manifest.webmanifest')).json();
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.equal((await context.request.get(APP + icon.src)).status(), 200);
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log('PASS manifest assets and no browser runtime errors');
  if (violations.length) process.exitCode = 1;
} finally { await browser.close(); }
