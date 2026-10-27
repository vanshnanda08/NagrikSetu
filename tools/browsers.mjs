// Local cross-engine smoke checks; not a substitute for physical-device testing.
import { firefox, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP } from './http.mjs';

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
      for (const route of ['/dashboard', '/issues', '/report', '/forgot-password', '/report/outbox']) {
        await page.goto(APP + route);
        await page.locator('h1').waitFor();
        await page.waitForTimeout(500);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name} ${width} ${route}`);
        checks++;
      }
    }
    await page.goto(APP + '/login');
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
