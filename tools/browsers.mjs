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
    const errors = [];
    const settledPages = [];
    // Keep each loaded document alive until every assertion finishes. Next can
    // schedule link prefetches after any finite quiet period; reusing a page
    // can cancel those reads and trigger WebKit unload errors in Linux CI.
    // All pages continue reporting genuine errors, including background pages.
    const newPage = async width => {
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.setViewportSize({ width, height: 900 });
      const pendingReads = new Set();
      let lastRead = Date.now();
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.searchParams.has('_rsc') || (url.pathname.startsWith('/api/') && !url.pathname.includes('/stream/'))) {
          pendingReads.add(request);
          lastRead = Date.now();
        }
      });
      const finished = request => {
        if (pendingReads.delete(request)) lastRead = Date.now();
      };
      page.on('requestfinished', finished);
      page.on('requestfailed', finished);
      const settled = () => expect.poll(
        () => pendingReads.size === 0 && Date.now() - lastRead >= 750,
        { timeout: 15_000, message: `${name}: finite page and prefetch reads settle` },
      ).toBe(true);
      settledPages.push(settled);
      return { page, settled };
    };
    let checks = 0;
    for (const width of [320, 1280]) {
      for (const [route, title] of routes) {
        const { page, settled } = await newPage(width);
        await page.goto(app + route);
        // Streaming/hydration can temporarily retain hidden copies of a page.
        // Assert one visible title, rather than selecting the first DOM match
        // or accepting two visible copies of the interface.
        const heading = page.locator('main h1:visible');
        const caseLabel = `${name} ${width}px ${route}`;
        await expect(heading, caseLabel).toHaveCount(1, { timeout: 15_000 });
        await expect(heading, caseLabel).toHaveText(title);
        await settled();
        await expect(heading, caseLabel).toHaveCount(1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name} ${width} ${route}`);
        checks++;
      }
    }
    const { page, settled } = await newPage(1280);
    await page.goto(app + '/login');
    const dialog = page.locator('dialog[open]');
    await dialog.getByLabel('Email', { exact: true }).fill('keyboard@example.test');
    await settled();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('type')), 'password');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog')?.open);
    await Promise.all(settledPages.map(settled => settled()));
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
