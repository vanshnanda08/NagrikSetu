// Local cross-engine smoke checks; not a substitute for physical-device testing.
import { firefox, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { APP } from './http.mjs';

for (const [name, engine] of Object.entries({ firefox, webkit })) {
  let browser;
  try {
    browser = await engine.launch();
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
  } finally { await browser?.close(); }
}
