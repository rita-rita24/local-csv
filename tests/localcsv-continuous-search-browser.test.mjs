import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.resolve(process.env.LOCALCSV_SEARCH_ROOT || ROOT, 'local-csv.html');
const RUNS = Number(process.env.LOCALCSV_SEARCH_RUNS || 7);
const ROWS = 12000;
const CSV = Array.from({ length: ROWS }, (_, _row) => `${_row},item-${_row},${_row % 10 === 0 ? 'target' : 'ordinary'},日本語`).join('\n');
const _results = [], _errors = [];
const _browser = await chromium.launch({ headless: true, executablePath: process.env.LOCALCSV_CHROMIUM_PATH });
try {
  for (let _run = 0; _run < RUNS; _run++) {
    const _context = await _browser.newContext({ locale: "ja-JP", viewport: { width: 1440, height: 900 } });
    const $page = await _context.newPage();
    $page.setDefaultTimeout(30000);
    $page.on('pageerror', _error => _errors.push(_error.message));
    $page.on('console', _message => { if (_message.type() === 'error') _errors.push(_message.text()); });
    await $page.goto(pathToFileURL(SOURCE).href);
    await $page.waitForTimeout(200); // Setup only: complete asynchronous initial hydration before importing.
    await $page.locator('#pasteBtn').click();
    await $page.locator('#pasteImportInput').waitFor({ state: 'visible' });
    await $page.locator('#pasteImportInput').evaluate(($input, _text) => { $input.value = _text; $input.dispatchEvent(new Event('input', { bubbles: true })); }, CSV);
    await $page.locator('#pasteImportConfirmBtn').click();
    await $page.locator('#pasteImportOverlay.show').waitFor({ state: 'hidden' });
    await $page.waitForFunction(() => document.querySelector('#saveStatus').dataset.state === 'saved');
    await $page.evaluate(() => {
      window.__searchTimings = { inputs: [], tasks: [] };
      document.querySelector('#searchInput').addEventListener('input', () => window.__searchTimings.inputs.push(performance.now()), { capture: true });
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        window.__searchObserver = new PerformanceObserver(_list => window.__searchTimings.tasks.push(..._list.getEntries().map(_entry => ({ start: _entry.startTime, duration: _entry.duration }))));
        window.__searchObserver.observe({ type: 'longtask', buffered: false });
      }
    });
    for (const [_operation, _query, _count] of [['first', 'target', 1200], ['warm', 'ordinary', 10800], ['burst-latest', 'target', 1200]]) {
      await $page.evaluate(() => { window.__searchTimings.inputs = []; window.__searchTimings.tasks = []; });
      console.log('search', _run, _operation);
      await $page.locator('#searchInput').fill('');
      await $page.locator('#searchInput').pressSequentially(_query, { delay: _operation === 'burst-latest' ? 5 : 40 });
      await $page.waitForFunction(_count => {
        const $info = document.querySelector('#searchInfo');
        return !document.querySelector('#searchNextBtn').disabled && $info.textContent.replaceAll(',', '').includes(`/ ${_count}件`);
      }, _count);
      const _sample = await $page.evaluate(async () => {
        await new Promise(_resolve => requestAnimationFrame(() => requestAnimationFrame(_resolve)));
        const _end = performance.now(), _inputs = window.__searchTimings.inputs;
        return { inputCount: _inputs.length, firstInputToResultMs: _end - _inputs[0], lastInputToResultMs: _end - _inputs.at(-1), longTasks: window.__searchTimings.tasks.filter(_task => _task.start >= _inputs[0]), result: document.querySelector('#searchInfo').textContent };
      });
      assert.ok(_sample.inputCount >= _query.length);
      _results.push({ run: _run, operation: _operation, ..._sample });
    }
    // A cell mutation must invalidate both Worker data and the row prefilter cache.
    await $page.locator('#searchClearBtn').click();
    const $cell = $page.locator('#tableBody td[data-row="0"][data-col="2"]');
    await $cell.click();
    await $cell.fill('changed-target');
    await $page.locator('#searchInput').click();
    await $page.locator('#searchInput').fill('changed-target');
    await $page.waitForFunction(() => document.querySelector('#searchInfo').textContent.includes('/ 1件') && !document.querySelector('#searchNextBtn').disabled);
    await $page.waitForFunction(() => document.querySelector('#saveStatus').dataset.state === 'saved');
    await $page.reload();
    await $page.locator('#modalConfirmBtn').click();
    await $page.waitForFunction(() => document.querySelector('#tableBody td[data-row="0"][data-col="2"]')?.textContent === 'changed-target');
    await $page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async _text => { window.__csvCopy = _text; } } }); });
    await $page.locator('#copyBtn').click();
    await $page.waitForFunction(() => typeof window.__csvCopy === 'string');
    const _expected = CSV.replace('0,item-0,target,日本語', '0,item-0,changed-target,日本語');
    assert.equal(await $page.evaluate(() => window.__csvCopy), _expected, 'every cell survives edit and durable restore');
    await _context.close();
    console.log(`continuous search trial ${_run + 1}/${RUNS}: results, edit synchronization, save/restore passed`);
  }
} finally { await _browser.close(); }
assert.deepEqual(_errors, []);
const _report = { timestamp: new Date().toISOString(), source: SOURCE, sha256: crypto.createHash('sha256').update(await fs.readFile(SOURCE)).digest('hex'), environment: { browser: await _browser.version(), rows: ROWS, columns: 4, runs: RUNS }, completion: 'Verified result count followed by two animation frames; driver observation latency included. Not GPU presentation or INP.', results: _results, errors: _errors };
if (process.env.LOCALCSV_SEARCH_OUTPUT) await fs.writeFile(process.env.LOCALCSV_SEARCH_OUTPUT, JSON.stringify(_report, null, 2) + '\n');
console.log(JSON.stringify(_report, null, 2));
