import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.resolve(process.env.LOCALCSV_COPY_ROOT || ROOT, 'local-csv.html');
const COMPARE_ROOT = process.env.LOCALCSV_COPY_COMPARE_ROOT;
const ROWS = Number(process.env.LOCALCSV_COPY_ROWS || 100000);
const COLS = 20;
const RUNS = Number(process.env.LOCALCSV_COPY_RUNS || 7);
const SPECIAL = process.env.LOCALCSV_COPY_SPECIAL === '1';
const MATRIX = Array.from({ length: ROWS }, (_, _row) => Array.from({ length: COLS }, (_, _col) => SPECIAL
  ? ['', 'a,b', 'a\tb', 'line\r\nnext', '"quoted"', '日本語😀', 'zero\0byte'][(_row + _col) % 7] : `${_row}:${_col}`));
const QUOTE = (_text, _delimiter, _single = false) => ((_single && _text === '') || _text.includes(_delimiter) || /[\r\n"]/.test(_text)) ? '"' + _text.replaceAll('"', '""') + '"' : _text;
const CSV = MATRIX.map(_row => _row.map(_cell => QUOTE(_cell, ',')).join(',')).join('\n');
// 既存のファイル取込は引用内を含むCRLFを検出して、出力の行区切りもCRLFに設定する。
const EXPECTED_SAVED_CSV = SPECIAL ? MATRIX.map(_row => _row.map(_cell => QUOTE(_cell, ',')).join(',')).join('\r\n') : CSV;
const EXPECTED_TSV = MATRIX.map(_row => _row.map(_cell => QUOTE(_cell, '\t')).join('\t')).join('\n');
const HASH = (_text) => crypto.createHash('sha256').update(_text).digest('hex');
const ENGINE = process.env.LOCALCSV_COPY_ENGINE || 'chromium';
const _browser = await ({ chromium, firefox, webkit })[ENGINE].launch({ headless: true, executablePath: process.env[`LOCALCSV_${ENGINE.toUpperCase()}_PATH`] });
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
    if (SPECIAL) await $page.addInitScript(() => { window.showOpenFilePicker = undefined; });
    await $page.goto(pathToFileURL(_source).href);
    await $page.waitForTimeout(200); // 初期化の準備待ち。操作時間には含めない。
    if (SPECIAL) {
      // ファイル経路ならtextareaのCRLF正規化を受けず、元の改行を検証できる。
      const [_chooser] = await Promise.all([$page.waitForEvent('filechooser'), $page.locator('#openFileBtn').click()]);
      await _chooser.setFiles({ name: 'copy-special.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
      await $page.locator('#wizEncoding').selectOption('utf-8');
      await $page.locator('#wizDelimiter').selectOption(',');
      await $page.locator('#wizHeader').uncheck();
      await $page.locator('#wizNextBtn').click();
      await $page.locator('#wizImportBtn').click();
      await $page.waitForFunction(() => document.querySelector('#modalOverlay').classList.contains('show') || !document.querySelector('#importWizardOverlay').classList.contains('show'));
      if (await $page.locator('#modalOverlay.show').count()) await $page.locator('#modalConfirmBtn').click();
      await $page.locator('#importWizardOverlay.show').waitFor({ state: 'hidden' });
      await $page.locator('td[data-row="0"][data-col="0"]').waitFor();
    } else {
      await $page.locator('#pasteBtn').click();
      await $page.locator('#pasteImportInput').evaluate(($input, _text) => { $input.value = _text; $input.dispatchEvent(new Event('input', { bubbles: true })); }, CSV);
      await $page.locator('#pasteImportConfirmBtn').click();
      await $page.locator('#pasteImportOverlay.show').waitFor({ state: 'hidden' });
    }
    await $page.waitForFunction(() => document.querySelector('#saveStatus').dataset.state === 'saved');
    await $page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async _text => { window.__copyCopy = _text; } } });
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
        window.__copyTiming = null;
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
            requestAnimationFrame(() => requestAnimationFrame(() => { _longObserver?.disconnect(); window.__copyTiming = { resultMs: _content - _start, frameOpportunityMs: performance.now() - _start, longTasks: _longTasks };  }));
          };
          const _observer = new MutationObserver(_finish);
          _observer.observe($hint, { childList: true, characterData: true, subtree: true });
        }, { capture: true, once: true });
      }, { _selector, _count });
      await $page.locator(_selector).click();
      await $page.waitForFunction(() => window.__copyTiming !== null);
      // 選択確定は準備。コピーは実際のkeydownからwriteTextへの全文受け渡しまで。
      await $page.evaluate(() => {
        document.body.focus(); window.__copyCopy = null; window.__copyMeasurement = null;
        window.__copyLongTasks = [];
        window.__copyObserver = PerformanceObserver.supportedEntryTypes.includes('longtask')
          ? new PerformanceObserver(_list => window.__copyLongTasks.push(..._list.getEntries().map(_entry => ({ start: _entry.startTime, duration: _entry.duration })))) : null;
        // keydownのtask開始前から監視する。開始済みtaskの見落としを避ける。
        window.__copyObserver?.observe({ type: 'longtask', buffered: false });
        const _startCopy = (_event) => {
          if (!(_event.ctrlKey && _event.key.toLowerCase() === 'c')) return;
          document.removeEventListener('keydown', _startCopy, true);
          window.__copyStart = performance.now();
        };
        document.addEventListener('keydown', _startCopy, true);
        navigator.clipboard.writeText = async (_text) => {
          const _result = performance.now(); window.__copyCopy = _text;
          requestAnimationFrame(() => requestAnimationFrame(() => {
            const _frame = performance.now();
            window.__copyLongTasks.push(...(window.__copyObserver?.takeRecords() ?? []).map(_entry => ({ start: _entry.startTime, duration: _entry.duration })));
            window.__copyObserver?.disconnect();
            window.__copyMeasurement = { resultMs: _result - window.__copyStart, frameOpportunityMs: _frame - window.__copyStart,
              longTasks: window.__copyLongTasks.filter(_task => _task.start + _task.duration >= window.__copyStart && _task.start <= _frame) };
          }));
        };
      });
      await $page.keyboard.press('Control+c');
      await $page.waitForFunction(() => window.__copyMeasurement !== null);
      assert.equal(await $page.evaluate(() => Number.isFinite(window.__copyMeasurement.resultMs) && window.__copyMeasurement.resultMs >= 0), true, 'copy clock starts on C, not Control alone');
      _results.push({ run: _run, version: _version, operation: _operation, ...await $page.evaluate(() => window.__copyMeasurement) });
      const _expected = _operation === 'column' ? MATRIX.map(_row => QUOTE(_row[0], '\t', true)).join('\n') : EXPECTED_TSV;
      assert.equal(HASH(await $page.evaluate(() => window.__copyCopy)), HASH(_expected), 'selected output includes exactly every intended cell');
    }
    await $page.keyboard.press('Escape');
    await $page.locator('td[data-row="0"][data-col="0"]').click();
    assert.equal(await $page.locator('#cellEditBtn').isEnabled(), true, 'selection contracts back to one cell');
    await $page.waitForFunction(() => document.querySelector('#saveStatus').dataset.state === 'saved');
    await $page.reload();
    await $page.locator('#modalConfirmBtn').click();
    await $page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async _text => { window.__copyCopy = _text; } } }));
    await $page.locator('#copyBtn').click();
    await $page.waitForFunction(() => typeof window.__copyCopy === 'string');
    assert.equal(HASH(await $page.evaluate(() => window.__copyCopy)), HASH(EXPECTED_SAVED_CSV), 'selection never changes persisted data or the existing export newline setting');
    await _context.close();
    console.log(`copy ${_version} trial ${_run + 1}/${RUNS}: exact all/column output, contraction passed`);
    }
  }
} finally { await _browser.close(); }
assert.deepEqual(_errors, []);
const _report = { nodeVersion: process.version, platform: process.platform, architecture: process.arch, timestamp: new Date().toISOString(), source: SOURCE, sha256: HASH(await fs.readFile(SOURCE)), engine: ENGINE, special: SPECIAL, browser: _browser.version(), rows: ROWS, columns: COLS, runs: RUNS, completion: 'Actual Ctrl+C keydown to full text passed to stub writeText; separate second-rAF opportunity. OS clipboard, GPU presentation and INP are not measured.', results: _results, errors: _errors };
if (COMPARE_ROOT) _report.before = { source: path.resolve(COMPARE_ROOT, 'local-csv.html'), sha256: HASH(await fs.readFile(path.resolve(COMPARE_ROOT, 'local-csv.html'))) };
if (process.env.LOCALCSV_COPY_OUTPUT) await fs.writeFile(process.env.LOCALCSV_COPY_OUTPUT, JSON.stringify(_report, null, 2) + '\n');
console.log(JSON.stringify(_report, null, 2));
