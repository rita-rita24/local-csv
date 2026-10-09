import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const PARSE = require('./performance-results/baseline-parser.cjs');
const UNQUOTED = process.env.LOCALCSV_PERF_UNQUOTED === '1';
const NON_ASCII = process.env.LOCALCSV_PERF_NON_ASCII || '';
const _hash = _value => crypto.createHash('sha256').update(JSON.stringify(_value)).digest('hex');
const _fixtureRoot = await fs.mkdtemp('/private/tmp/localcsv-integrity-');
const _browser = await chromium.launch({ headless: true, executablePath: process.env.LOCALCSV_CHROMIUM_PATH });
const _errors = [];
try {
  for (const SPEC of [{ name: 'large', rows: 100000, cols: 20, length: 12 }, { name: 'long-cell', rows: 2000, cols: 3, length: 4000 }]) {
    const _text = Array.from({ length: SPEC.rows }, (_, _row) => Array.from({ length: SPEC.cols }, (_, _col) => `"${_row === 0 && _col === 0 ? 'target' : `${_row}:${_col}`} ${'x'.repeat(SPEC.length)}${_col === 1 && _row % 17 === 0 ? '\r\nline' : ''}${(NON_ASCII === 'mixed' && _col === 1) || (NON_ASCII === 'tail' && _row === SPEC.rows - 1 && _col === SPEC.cols - 1) ? '日本語' : ''}"`).map(_cell => UNQUOTED && !_cell.includes('\r\n') ? _cell.slice(1, -1) : _cell).join(',')).join('\r\n');
    const _expectedHash = _hash(PARSE(_text, ','));
    const _file = path.join(_fixtureRoot, SPEC.name + '.csv');
    await fs.writeFile(_file, _text);
    const _context = await _browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 900 } });
    const _page = await _context.newPage();
    _page.on('pageerror', _error => _errors.push(_error.message));
    _page.on('console', _message => { if (_message.type() === 'error') _errors.push(_message.text()); });
    _page.on('request', _request => { if (/^https?:/.test(_request.url())) _errors.push('external request'); });
    await _page.addInitScript(() => { window.showOpenFilePicker = undefined; });
    await _page.goto(pathToFileURL(path.join(ROOT, 'local-csv.html')).href);
    const [_chooser] = await Promise.all([_page.waitForEvent('filechooser'), _page.locator('#openFileBtn').click()]);
    await _chooser.setFiles(_file);
    await _page.locator('#wizNextBtn').click();
    assert.equal(await _page.locator('#wizPreviewBody tr').count(), 10);
    await _page.locator('#wizImportBtn').click();
    await _page.locator('#importWizardOverlay.show').waitFor({ state: 'hidden' });
    assert.equal((await _page.locator('#rowCount').textContent()).replaceAll(',', ''), String(SPEC.rows));
    await _page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async _text => { window.__integrityCopy = _text; } } }));
    await _page.locator('#copyBtn').click();
    await _page.waitForFunction(() => typeof window.__integrityCopy === 'string', null, { timeout: 30000 });
    const _copied = await _page.evaluate(() => window.__integrityCopy);
    // 全行・全列・行順・引用内CRLFを変更前解析器で照合する。コピー形式は文書の区切り設定に従うCSV。
    assert.equal(_hash(PARSE(_copied, ',')), _expectedHash, SPEC.name + ': every cell must match');
    console.log(`${SPEC.name}: ${SPEC.rows} x ${SPEC.cols} cells / ${Buffer.byteLength(_text)} bytes, complete values and order match baseline parser`);
    await _context.close();
  }
  assert.deepEqual(_errors, []);
  console.log('0 console errors / external requests');
} finally {
  await _browser.close();
  await fs.rm(_fixtureRoot, { recursive: true, force: true });
}
