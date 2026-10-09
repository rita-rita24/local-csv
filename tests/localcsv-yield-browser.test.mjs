import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.LOCALCSV_CHROMIUM_PATH });
const errors = [];
try {
  const page = await browser.newPage({ locale: 'ja-JP', viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    const Native = window.MessageChannel;
    const held = [];
    window.MessageChannel = function () {
      const channel = new Native();
      const post = channel.port2.postMessage.bind(channel.port2);
      channel.port2.postMessage = value => {
        if (window.__pauseYield) held.push(() => post(value));
        else post(value);
        window.__heldYields = held.length;
      };
      return channel;
    };
    window.__releaseYield = () => { window.__pauseYield = false; held.splice(0).forEach(post => post()); };
  });
  await page.goto(pathToFileURL(path.join(ROOT, 'local-csv.html')).href);
  const text = Array.from({ length: 1000 }, (_, row) => `${row},original`).join('\n');
  await page.locator('#pasteBtn').click();
  await page.locator('#pasteImportInput').fill(text);
  await page.locator('#pasteImportConfirmBtn').click();
  await page.locator('#pasteImportOverlay.show').waitFor({ state: 'hidden' });
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copyResult = text; } } });
    const qs = (sel, root = document) => root.querySelector(sel);
    qs('#copyBtn').addEventListener('click', () => { window.__pauseYield = true; }, { once: true, capture: true });
  });
  await page.locator('#copyBtn').click();
  await page.waitForFunction(() => window.__heldYields > 0);
  await page.locator('#tableScroll').evaluate($scroll => { $scroll.scrollTop = $scroll.scrollHeight; });
  const $last = page.locator('#tableBody td[data-row="999"][data-col="1"]');
  await $last.fill('edited during output');
  await page.locator('#searchInput').click();
  await page.evaluate(() => window.__releaseYield());
  await page.waitForFunction(() => typeof window.__copyResult === 'string');
  assert.equal(await page.evaluate(() => window.__copyResult), text, 'in-flight output must retain all original snapshot values');
  await page.evaluate(() => { window.__copyResult = null; });
  await page.locator('#copyBtn').click();
  await page.waitForFunction(() => typeof window.__copyResult === 'string');
  assert.equal(await page.evaluate(() => window.__copyResult), text.replace(/999,original$/, '999,edited during output'), 'the next operation must see the latest edit');
  assert.deepEqual(errors, []);
  console.log('Native MessageChannel: task yielding, edit during output, complete original snapshot and latest subsequent output; 0 console errors');
} finally { await browser.close(); }
