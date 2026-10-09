import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.resolve(process.env.LOCALCSV_SELECTION_ROOT || ROOT, 'local-csv.html');
const COMPARE_ROOT = process.env.LOCALCSV_SELECTION_COMPARE_ROOT;
const ROWS = Number(process.env.LOCALCSV_SELECTION_ROWS || 100000);
const COLS = 20;
const RUNS = Number(process.env.LOCALCSV_SELECTION_RUNS || 7);
const CSV = Array.from({ length: ROWS }, (_, _row) => Array.from({ length: COLS }, (_, _col) => `${_row}:${_col}`).join(',')).join('\n');
const EXPECTED_TSV = CSV.replaceAll(',', '\t');
const HASH = (_text) => crypto.createHash('sha256').update(_text).digest('hex');
const _browser = await chromium.launch({ headless: true, executablePath: process.env.LOCALCSV_CHROMIUM_PATH });
const _results = [], _errors = [];
try {
  for (let _run = 0; _run < RUNS; _run++) {
    for (const _version of (COMPARE_ROOT ? (_run % 2 ? ['after', 'before'] : ['before', 'after']) : ['after'])) {
    const _source = _version === 'before' ? path.resolve(COMPARE_ROOT, 'local-csv.html') : SOURCE;
    const _context = await _browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 900 } });
    _context.setDefaultTimeout(30000);
    const $page = await _context.newPage();
    $page.on('pageerror', _error => _errors.push(_error.message));
    $page.on('console', _message => { if (_message.type() === 'error') _errors.push(_message.text()); });
    await $page.goto(pathToFileURL(_source).href);
    await $page.waitForTimeout(200); // 初期化の準備待ち。操作時間には含めない。
    await $page.locator('#pasteBtn').click();
    await $page.locator('#pasteImportInput').evaluate(($input, _text) => { $input.value = _text; $input.dispatchEvent(new Event('input', { bubbles: true })); }, CSV);
    await $page.locator('#pasteImportConfirmBtn').click();
    await $page.locator('#pasteImportOverlay.show').waitFor({ state: 'hidden' });
    await $page.waitForFunction(() => document.querySelector('#saveStatus').dataset.state === 'saved');
    await $page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async _text => { window.__selectionCopy = _text; } } });
      document.body.tabIndex = -1;
    });
    for (const _operation of ['all-first', 'all-repeat', 'column']) {
      // メニューの準備は操作開始点から除き、実際の確定clickから測る。
      if (_operation === 'column') await $page.locator('button[data-col-menu="0"]').click();
      else { await $page.evaluate(() => document.body.focus()); await $page.keyboard.press('Control+k'); await $page.locator('#paletteInput').fill('select-all'); }
      const _selector = _operation === 'column' ? '#columnMenu [data-action="select-col"]' : '[data-cmd-id="select-all"]';
      const _count = _operation === 'column' ? ROWS : ROWS * COLS;
      await $page.evaluate(({ _selector, _count }) => {
        const $trigger = document.querySelector(_selector), $hint = document.querySelector('#tableEditHint');
        window.__selectionTiming = null;
        $trigger.addEventListener('click', () => {
          const _start = performance.now();
          const _longTasks = [];
          const _longObserver = PerformanceObserver.supportedEntryTypes.includes('longtask')
            ? new PerformanceObserver(_list => _longTasks.push(..._list.getEntries().map(_entry => ({ start: _entry.startTime, duration: _entry.duration })))) : null;
          _longObserver?.observe({ type: 'longtask', buffered: false });
          const _finish = () => {
            if (!$hint.textContent.startsWith(`${_count}セル選択中`)) return;
            _observer.disconnect();
            const _content = performance.now();
            requestAnimationFrame(() => requestAnimationFrame(() => { _longObserver?.disconnect(); window.__selectionTiming = { resultMs: _content - _start, frameOpportunityMs: performance.now() - _start, longTasks: _longTasks };  }));
          };
          const _observer = new MutationObserver(_finish);
          _observer.observe($hint, { childList: true, characterData: true, subtree: true });
        }, { capture: true, once: true });
      }, { _selector, _count });
      await $page.locator(_selector).click();
      await $page.waitForFunction(() => window.__selectionTiming !== null);
      _results.push({ run: _run, version: _version, operation: _operation, ...await $page.evaluate(() => window.__selectionTiming) });
      // ネイティブテキスト選択ではなく表の選択モデルから全セルをコピーする。
      await $page.evaluate(() => { document.body.focus(); window.__selectionCopy = null; });
      await $page.keyboard.press('Control+c');
      await $page.waitForFunction(() => typeof window.__selectionCopy === 'string');
      const _expected = _operation === 'column' ? Array.from({ length: ROWS }, (_, _row) => `${_row}:0`).join('\n') : EXPECTED_TSV;
      assert.equal(HASH(await $page.evaluate(() => window.__selectionCopy)), HASH(_expected), 'selected output includes exactly every intended cell');
    }
    await $page.keyboard.press('Escape');
    await $page.locator('td[data-row="0"][data-col="0"]').click();
    assert.equal(await $page.locator('#cellEditBtn').isEnabled(), true, 'selection contracts back to one cell');
    await $page.waitForFunction(() => document.querySelector('#saveStatus').dataset.state === 'saved');
    await $page.reload();
    await $page.locator('#modalConfirmBtn').click();
    await $page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async _text => { window.__selectionCopy = _text; } } }));
    await $page.locator('#copyBtn').click();
    await $page.waitForFunction(() => typeof window.__selectionCopy === 'string');
    assert.equal(HASH(await $page.evaluate(() => window.__selectionCopy)), HASH(CSV), 'selection never changes persisted data');
    await _context.close();
    console.log(`selection ${_version} trial ${_run + 1}/${RUNS}: exact all/column output, contraction passed`);
    }
  }
} finally { await _browser.close(); }
assert.deepEqual(_errors, []);
const _report = { nodeVersion: process.version, platform: process.platform, architecture: process.arch, timestamp: new Date().toISOString(), source: SOURCE, sha256: HASH(await fs.readFile(SOURCE)), browser: _browser.version(), rows: ROWS, columns: COLS, runs: RUNS, completion: 'Actual click to correct selection hint mutation; separate second-rAF opportunity. No GPU presentation or INP claim.', results: _results, errors: _errors };
if (COMPARE_ROOT) _report.before = { source: path.resolve(COMPARE_ROOT, 'local-csv.html'), sha256: HASH(await fs.readFile(path.resolve(COMPARE_ROOT, 'local-csv.html'))) };
if (process.env.LOCALCSV_SELECTION_OUTPUT) await fs.writeFile(process.env.LOCALCSV_SELECTION_OUTPUT, JSON.stringify(_report, null, 2) + '\n');
console.log(JSON.stringify(_report, null, 2));
