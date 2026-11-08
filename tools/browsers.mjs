// Local cross-engine smoke checks; not a substitute for physical-device testing.
import { firefox, webkit } from 'playwright';
import { expect } from 'playwright/test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP } from './http.mjs';

const app = process.env.BROWSERS_APP ?? APP;
const routes = [
  ['/dashboard', 'Complaint Dashboard'],
  ['/issues', 'Explore issues'],
  ['/report', 'Report a problem'],
  ['/forgot-password', 'Reset your password'],
  ['/report/outbox', 'Report outbox'],
];

for (const [name, engine] of Object.entries({ firefox, webkit })) {
  let browser;
  let browserHome;
  try {
    // Firefox bundled with Playwright <=1.64 resolves Mozilla's shared app-data
    // directory on macOS 27, which TCC rejects before it reads the test profile.
    // A private CoreFoundation home avoids that upstream launch bug. Remove this
    // workaround once the project moves to Playwright 1.65+ / Firefox 158+.
    if (name === 'firefox' && process.platform === 'darwin') {
      browserHome = await mkdtemp(join(tmpdir(), 'nagrik-firefox-home-'));
    }
    browser = await engine.launch({
      env: browserHome ? { ...process.env, CFFIXED_USER_HOME: browserHome } : process.env,
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let checks = 0;
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [route, title] of routes) {
        await page.goto(app + route);
        // Streaming/hydration can temporarily retain hidden copies of a page.
        // Assert one visible title, rather than selecting the first DOM match
        // or accepting two visible copies of the interface.
        const heading = page.locator('main h1:visible');
        const caseLabel = `${name} ${width}px ${route}`;
        await expect(heading, caseLabel).toHaveCount(1, { timeout: 15_000 });
        await expect(heading, caseLabel).toHaveText(title);
        await page.waitForTimeout(500);
        await expect(heading, caseLabel).toHaveCount(1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name} ${width} ${route}`);
        checks++;
      }
    }
    await page.goto(app + '/login');
    const dialog = page.locator('dialog[open]');
    await dialog.getByLabel('Email', { exact: true }).fill('keyboard@example.test');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('type')), 'password');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog')?.open);
    assert.deepEqual(errors, []);
    console.log(`PASS ${name}: ${checks} responsive route checks, dialog keyboard/Escape, no runtime errors`);
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    if (browserHome) {
      // macOS adds a deny-delete ACL to the synthetic Downloads directory.
      execFileSync('/bin/chmod', ['-RN', browserHome]);
      await rm(browserHome, { recursive: true, force: true });
    }
  }
}
