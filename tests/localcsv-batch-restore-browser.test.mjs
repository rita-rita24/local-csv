import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const PARSE = require('./performance-results/baseline-parser.cjs');
const ROWS = Array.from({ length: 13001 }, (_, index) => [String(index), `000${index}`, index % 17 === 0 ? '日本語\n"quoted"' : 'value', '']);
// 貼り付け欄は HTML textarea の仕様で改行を LF に正規化する。
const INPUT = ROWS.map(row => row.map(cell => '"' + cell.replaceAll('"', '""') + '"').join(',')).join('\r\n');
const browser = await chromium.launch({ headless: true, executablePath: process.env.LOCALCSV_CHROMIUM_PATH });
const errors = [];
const saved = page => page.waitForFunction(() => document.querySelector('#saveStatus')?.dataset.state === 'saved', null, { timeout: 30000 });
const copy = async page => {
  await page.evaluate(() => {
    window.__restoreCopy = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__restoreCopy = text; } } });
  });
  await page.locator('#copyBtn').click();
  await page.waitForFunction(() => window.__restoreCopy !== null);
  return page.evaluate(() => window.__restoreCopy);
};
try {
  const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url())) errors.push('unexpected external request'); });
  await page.goto(pathToFileURL(path.join(ROOT, 'local-csv.html')).href);
  await page.locator('#pasteBtn').click();
  await page.locator('#pasteImportInput').evaluate(($input, text) => { $input.value = text; $input.dispatchEvent(new Event('input', { bubbles: true })); }, INPUT);
  await page.locator('#pasteImportConfirmBtn').click();
  await page.locator('#pasteImportOverlay.show').waitFor({ state: 'hidden' });
  await saved(page);
  assert.deepEqual(PARSE(await copy(page), ','), ROWS);
  await page.reload();
  await page.locator('#modalOverlay.show').waitFor();
  await page.locator('#modalConfirmBtn').click();
  await page.locator('#tableBody td[data-col="0"]').first().waitFor();
  assert.deepEqual(PARSE(await copy(page), ','), ROWS, 'all 33 chunks must restore in manifest order');

  await page.locator('#tableBody td[data-col="0"]').first().fill('updated');
  await page.locator('#searchInput').click();
  await saved(page);
  await page.reload();
  await page.locator('#modalOverlay.show').waitFor();
  await page.locator('#modalConfirmBtn').click();
  await page.locator('#tableBody td[data-col="0"]').first().waitFor();
  const updated = ROWS.map(row => [...row]);
  updated[0][0] = 'updated';
  assert.deepEqual(PARSE(await copy(page), ','), updated, 'the latest edited revision must restore');

  await page.evaluate(() => new Promise((resolve, reject) => {
    const $request = indexedDB.open('csvEditorDB', 1);
    $request.onerror = () => reject($request.error);
    $request.onsuccess = () => {
      const _db = $request.result;
      const _transaction = _db.transaction('kvStore', 'readwrite');
      const _store = _transaction.objectStore('kvStore');
      const $metaRequest = _store.get('csvEditor_state_pro');
      $metaRequest.onsuccess = () => {
        const _packet = $metaRequest.result;
        const _meta = _packet.value || _packet;
        _store.delete(_meta.rowChunkRefs[4].key);
      };
      _transaction.oncomplete = () => { _db.close(); resolve(); };
      _transaction.onerror = () => { _db.close(); reject(_transaction.error); };
    };
  }));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('保存データの一部が欠落'));
  assert.equal(await page.locator('#modalOverlay.show').count(), 0);
  assert.equal(await page.locator('#tableBody tr[data-row]').count(), 0, 'corrupt data must never be partially applied');
  assert.deepEqual(errors, []);
  console.log(`chromium ${browser.version()}: 13,001 rows / 33 chunks, complete restoration, updated revision, missing chunk rejection; 0 console errors / external requests`);
} finally { await browser.close(); }
