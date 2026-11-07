// Run against the local frontend and demo API: node tools/complaint-tracking.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { APP, json } from './http.mjs';

const { items: [issue] } = await json('/public/issues?limit=1');
assert.ok(issue, 'The demo database needs at least one public complaint');
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext(); // No saved login or cookies.
const page = await context.newPage();
const errors = [];
const lookups = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (request.url().includes('/public/issues/by-ref/')) lookups.push(request);
});
const tracker = page.getByRole('region', { name: 'Track your complaint', exact: true });
const input = page.getByRole('textbox', { name: 'Complaint number', exact: true });
const submit = page.getByRole('button', { name: 'Track complaint', exact: true });
const result = tracker.locator('.complaint-tracker-result');
const directory = new URL('../artifacts/complaint-tracking/', import.meta.url);
await mkdir(directory, { recursive: true });

async function track(reference) {
  await input.fill(reference);
  await submit.click();
}
async function hasText(locator, text) {
  await locator.getByText(text, { exact: false }).first().waitFor();
}
async function layout(size, name) {
  await page.setViewportSize(size);
  const bounds = await tracker.boundingBox();
  assert.ok(bounds.y >= 0 && bounds.y < size.height, 'Tracker appears above dashboard statistics');
  const controls = await tracker.locator('.complaint-tracker-controls').boundingBox();
  assert.ok(controls.y + controls.height <= size.height, 'The tracking form is visible without scrolling');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'No horizontal page overflow');
  assert.equal(await tracker.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, 'Tracking controls and result fit');
  if (size.width >= 1280) {
    assert.ok(bounds.y + bounds.height <= size.height, 'The full tracking result fits on desktop');
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1), false, 'No outer desktop scrolling');
    assert.equal(await page.locator('.dashboard-layout').evaluate(el => el.getBoundingClientRect().height > 100), true, 'Dashboard statistics remain usable');
  }
  await page.screenshot({ path: fileURLToPath(new URL(name + '.png', directory)), fullPage: true });
}

try {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(APP + '/dashboard');
  await input.waitFor();
  await hasText(tracker, 'No login required.');
  await layout({ width: 1366, height: 768 }, 'desktop-empty');
  await track('   ');
  await hasText(tracker.getByRole('alert'), 'Enter the complaint number');
  assert.equal(lookups.length, 0, 'Blank references never hit the API');

  await track('  ' + issue.publicRef.toLowerCase() + '  ');
  await result.waitFor();
  await hasText(result, issue.publicRef);
  await hasText(result, issue.categoryName);
  await hasText(result, issue.wardName);
  assert.equal(await input.inputValue(), issue.publicRef, 'References are trimmed and case-normalised');
  assert.equal(new URL(page.url()).pathname, '/dashboard', 'The result stays on the dashboard');
  const fullRecord = tracker.getByRole('link', { name: 'View full complaint history' });
  assert.equal(await fullRecord.getAttribute('href'), '/issues/' + issue.id);
  for (const size of [{ width: 1280, height: 600 }, { width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 320, height: 640 }, { width: 768, height: 1024 }]) {
    await layout(size, 'result-' + size.width);
  }
  await page.addScriptTag({ path: fileURLToPath(new URL('../frontend/node_modules/axe-core/axe.min.js', import.meta.url)) });
  const violations = await page.evaluate(async () => (await window.axe.run('.complaint-tracker', {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
  assert.deepEqual(violations, [], 'Tracking controls and results pass accessibility checks');

  const previous = lookups.length;
  await Promise.all([
    page.waitForResponse(response => response.url().includes('/public/issues/by-ref/') && response.status() === 200),
    submit.click(),
  ]);
  assert.ok(lookups.length > previous, 'Submitting the same complaint refreshes its status');

  await track('CT-1900-000000');
  await hasText(tracker.getByRole('alert'), 'No complaint found');
  assert.equal(await result.count(), 0, 'A failed search does not display the previous complaint');

  const failureUrl = '**/public/issues/by-ref/CT-2026-999999';
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route(failureUrl, async route => {
    await held;
    await route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ status: 503 }) });
  });
  await track('CT-2026-999999');
  await tracker.getByRole('button', { name: 'Checking…', exact: true }).waitFor();
  assert.equal(await tracker.getByRole('button', { name: 'Checking…', exact: true }).isDisabled(), true);
  await hasText(tracker, 'Checking the latest complaint status');
  release();
  await hasText(tracker.getByRole('alert'), 'Please try again');
  await page.unroute(failureUrl);
  await track(issue.publicRef);
  await result.waitFor();
  assert.equal(await tracker.getByRole('alert').count(), 0, 'A successful retry clears lookup errors');

  // A public ticket may have been merged; keep a route to its continuing record.
  const mergedRef = 'CT-2026-999998';
  const mergedUrl = '**/public/issues/by-ref/' + mergedRef;
  await page.route(mergedUrl, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    ...issue, publicRef: mergedRef, mergedIntoId: issue.id, mergedIntoRef: issue.publicRef,
  }) }));
  await track(mergedRef);
  await hasText(result, 'This complaint was combined with');
  assert.equal(await result.getByRole('link', { name: /Follow its latest progress/ }).getAttribute('href'), '/issues/' + issue.id);
  await page.unroute(mergedUrl);

  await track(issue.publicRef);
  await result.waitFor();
  await fullRecord.click();
  await page.waitForURL(APP + '/issues/' + issue.id);
  await page.getByRole('heading', { name: issue.categoryName, exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0, 'Full public record opens without a login prompt');
  assert.ok(lookups.every(request => !request.headers().authorization), 'Tracking requests carry no login token');
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log('PASS: anonymous live lookup, inline results, normalisation, blank input, refresh, 404, loading, service failure, retry, merged complaints, public history, five screen sizes, accessibility');
} finally {
  await browser.close();
}
