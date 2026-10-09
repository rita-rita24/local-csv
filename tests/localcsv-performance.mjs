import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Test-only loopback server and temporary browser contexts; no product telemetry.
const ROOT = path.resolve(process.env.LOCALCSV_PERF_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const COMPARE_ROOT = process.env.LOCALCSV_PERF_COMPARE_ROOT ? path.resolve(process.env.LOCALCSV_PERF_COMPARE_ROOT) : null;
let _activeRoot = ROOT, _activeVersion = 'after';
const OUTPUT = process.env.LOCALCSV_PERF_OUTPUT || '/private/tmp/localcsv-performance.json';
const FILE_ONLY = process.env.LOCALCSV_PERF_FILE_ONLY === '1';
const NO_CACHE = process.env.LOCALCSV_PERF_NO_CACHE === '1';
const CACHE_ONLY = process.env.LOCALCSV_PERF_CACHE_ONLY === '1';
const RESTORE_ONLY = process.env.LOCALCSV_PERF_RESTORE_ONLY === '1';
const EXTRA = process.env.LOCALCSV_PERF_EXTRA === '1';
const PANEL_ALL = process.env.LOCALCSV_PERF_PANEL_ALL === '1';
const HELP_ONLY = process.env.LOCALCSV_PERF_HELP_ONLY === '1';
const UNQUOTED = process.env.LOCALCSV_PERF_UNQUOTED === '1';
const NON_ASCII = process.env.LOCALCSV_PERF_NON_ASCII || '';
const STATS_ONLY = process.env.LOCALCSV_PERF_STATS_ONLY === '1';
const OUTPUT_ONLY = process.env.LOCALCSV_PERF_OUTPUT_ONLY === '1';
const PANEL_ONLY = process.env.LOCALCSV_PERF_PANEL_ONLY === '1';
const SEARCH_ONLY = process.env.LOCALCSV_PERF_SEARCH_ONLY === '1';
const CASE_ONLY = process.env.LOCALCSV_PERF_CASE || '';
const RUNS = Number(process.env.LOCALCSV_PERF_RUNS || 7);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const server = http.createServer(async (req, res) => {
  try {
    let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let _root = ROOT;
    if (COMPARE_ROOT && /^\/(before|after)(?:\/|$)/.test(name)) {
      _root = name.startsWith('/before') ? COMPARE_ROOT : ROOT;
      name = name.replace(/^\/(?:before|after)/, '') || '/';
    }
    if (name === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const file = path.resolve(_root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(_root + path.sep)) throw new Error('outside root');
    const bytes = await fs.readFile(file);
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'max-age=3600' });
    res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
let BASE = ORIGIN;
const browser = await chromium.launch({ headless: true, executablePath: process.env.LOCALCSV_CHROMIUM_PATH });
const results = [], errors = [], cacheAudit = [];
const fixtureRoot = FILE_ONLY ? await fs.mkdtemp('/private/tmp/localcsv-perf-files-') : null;
const disableCache = async page => {
  if (!NO_CACHE) return;
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
};
const painted = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const mark = async (page, selector, event = 'click') => {
  await page.evaluate(({ selector, event }) => {
    document.querySelector(selector).addEventListener(event, () => { window.__perfStart = performance.now(); }, { once: true, capture: true });
  }, { selector, event });
};
const elapsed = async page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - (window.__perfStart || 0))))));
const record = (screen, condition, metric, ms, run) => results.push({ screen, condition, metric, ms, run, ...(COMPARE_ROOT ? { version: _activeVersion } : {}) });
const CASES = [
  { name: 'small', rows: 100, cols: 8, length: 12 },
  { name: 'large', rows: 100000, cols: 20, length: 12 },
  { name: 'long-cell', rows: 2000, cols: 3, length: 4000 },
];
const csv = spec => Array.from({ length: spec.rows }, (_, row) => Array.from({ length: spec.cols }, (_, col) => `"${row === 0 && col === 0 ? 'target' : `${row}:${col}`} ${'x'.repeat(spec.length)}${col === 1 && row % 17 === 0 ? '\r\nline' : ''}${(NON_ASCII === 'mixed' && col === 1) || (NON_ASCII === 'tail' && row === spec.rows - 1 && col === spec.cols - 1) ? '日本語' : ''}"`).map(_cell => UNQUOTED && !_cell.includes('\r\n') ? _cell.slice(1, -1) : _cell).join(',')).join('\r\n');
try {
  for (let run = 0; run < RUNS; run++) {
    for (const _version of (COMPARE_ROOT ? (run % 2 ? ['after', 'before'] : ['before', 'after']) : ['after'])) {
    _activeVersion = _version;
    _activeRoot = _version === 'before' ? COMPARE_ROOT : ROOT;
    BASE = COMPARE_ROOT ? ORIGIN + '/' + _version : ORIGIN;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ja-JP' });
    const page = await context.newPage();
    await disableCache(page);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    for (const warm of (RESTORE_ONLY || FILE_ONLY || HELP_ONLY || STATS_ONLY || OUTPUT_ONLY || PANEL_ONLY || SEARCH_ONLY ? [] : [false, true])) {
      await page.goto(BASE + '/');
      await page.locator('h1').waitFor();
      await painted(page);
      record('LP', warm ? 'browser-cache' : 'cold-context', 'content', await elapsed(page), run);
      cacheAudit.push({ ...(COMPARE_ROOT ? { version: _activeVersion } : {}), screen: 'LP', warm, run, entries: await page.evaluate(() => [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')].map(entry => ({ name: entry.name, type: entry.entryType, transferSize: entry.transferSize, decodedBodySize: entry.decodedBodySize }))) });
      await mark(page, '[data-download-editor]');
      const download = page.waitForEvent('download');
      await page.locator('[data-download-editor]').first().click();
      const file = await download;
      const downloaded = await fs.readFile(await file.path());
      const lp = await fs.readFile(path.join(_activeRoot, 'index.html'), 'utf8');
      const app = Buffer.from(lp.match(/<script id="editor-html-base64"[^>]*>([\s\S]*?)<\/script>/)[1].replace(/\s+/g, ''), 'base64');
      if (!downloaded.equals(app)) throw new Error('LP download mismatch');
      record('LP-download', warm ? 'browser-cache' : 'cold-context', 'result', await elapsed(page), run);
      if (EXTRA) record('LP', warm ? 'browser-cache' : 'cold-context', 'interactive', await page.evaluate(() => performance.now()), run);
      await page.goto(BASE + '/local-csv.html');
      await page.locator('#pasteZone').waitFor();
      await painted(page);
      record('editor-empty', warm ? 'browser-cache' : 'cold-context', 'content', await elapsed(page), run);
      cacheAudit.push({ ...(COMPARE_ROOT ? { version: _activeVersion } : {}), screen: 'editor-empty', warm, run, entries: await page.evaluate(() => performance.getEntriesByType('navigation').map(entry => ({ name: entry.name, transferSize: entry.transferSize, decodedBodySize: entry.decodedBodySize }))) });
      await mark(page, '#pasteBtn');
      await page.locator('#pasteBtn').click();
      await page.locator('#pasteImportOverlay.show textarea').waitFor();
      record('paste-dialog', warm ? 'browser-cache' : 'cold-context', 'interactive', await elapsed(page), run);
      if (EXTRA) record('editor-empty', warm ? 'browser-cache' : 'cold-context', 'interactive', await page.evaluate(() => performance.now()), run);
      await page.keyboard.press('Escape');
    }
    await context.close();
    for (const spec of (HELP_ONLY ? CASES.slice(1, 2) : CACHE_ONLY ? [] : EXTRA && !FILE_ONLY && !PANEL_ALL ? CASES.slice(0, 1) : CASES).filter(_spec => !CASE_ONLY || _spec.name === CASE_ONLY)) {
      const text = csv(spec);
      if (!FILE_ONLY) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ja-JP' });
      const p = await ctx.newPage();
      await disableCache(p);
      p.on('pageerror', error => errors.push(error.message));
      p.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await p.goto(BASE + '/local-csv.html');
      await p.locator('#pasteBtn').click();
      await p.locator('#pasteImportInput').evaluate(($input, value) => { $input.value = value; $input.dispatchEvent(new Event('input', { bubbles: true })); }, text);
      await mark(p, '#pasteImportConfirmBtn');
      await p.locator('#pasteImportConfirmBtn').click();
      await p.waitForFunction(rows => document.querySelector('#rowCount')?.textContent.replaceAll(',', '') === String(rows) && !document.querySelector('#pasteImportOverlay').classList.contains('show') && document.querySelector('#tableBody td[data-col="0"]')?.textContent.startsWith('target'), spec.rows);
      record('paste-import', spec.name, 'content', await elapsed(p), run);
      await p.locator('#tableBody td[data-col="0"]').first().click();
      await p.waitForFunction(() => document.activeElement?.dataset.col === '0');
      record('paste-import', spec.name, 'interactive', await elapsed(p), run);
      if (OUTPUT_ONLY) {
        await p.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
          writeText: async _text => { window.__perfOutput = _text; }
        } }));
        await mark(p, '#copyBtn');
        await p.locator('#copyBtn').click();
        await p.waitForFunction(() => typeof window.__perfOutput === 'string', null, { timeout: 30000 });
        record('dataset-copy', spec.name, 'result', await elapsed(p), run);
        const _complete = await p.evaluate(({ rows, cols, length }) => window.__perfOutput.startsWith('target') && window.__perfOutput.endsWith(`${rows - 1}:${cols - 1} ${'x'.repeat(length)}`), spec);
        if (!_complete) throw new Error('incomplete copied output');
        await ctx.close();
        continue;
      }
      if (STATS_ONLY) {
        await p.waitForFunction(() => / B$| KB$| MB$/.test(document.querySelector('#dataSize')?.textContent ?? ''), null, { timeout: 30000 });
        record('dataset-size', spec.name, 'result', await elapsed(p), run);
        await ctx.close();
        continue;
      }
      if (EXTRA) {
        for (const [screen, trigger, overlay] of (HELP_ONLY ? [['help', '#infoBtn', '#infoOverlay'], ['help-saved', '#infoBtn', '#infoOverlay']] : [
          ['help', '#infoBtn', '#infoOverlay'],
          ['settings', '#settingsBtn', '#settingsOverlay'],
          ['virtual-header', '#virtualHeaderBtn', '#virtualHeaderOverlay'],
          ['cell-edit', '#cellEditBtn', '#cellEditOverlay'],
          ['export-preview', '#exportWizardBtn', '#exportWizardOverlay'],
          ['column-filter', 'button[data-filter-col="0"]', '#colFilterPanel'],
        ])) {
          if (screen === 'help-saved') await p.waitForFunction(() => document.querySelector('#saveStatus')?.dataset.state === 'saved', null, { timeout: 30000 });
          await mark(p, trigger);
          await p.locator(trigger).click();
          await p.locator(overlay + '.show').waitFor();
          if (screen === 'export-preview') await p.waitForFunction(() => document.querySelector('#expPreview').textContent.includes('target'));
          if (screen === 'column-filter') await p.waitForFunction(() => document.querySelector('#colFilterValues input[type="checkbox"]'));
          record(screen, spec.name, 'content', await elapsed(p), run);
          await p.waitForFunction(selector => {
            const $overlay = document.querySelector(selector);
            return $overlay.contains(document.activeElement) && !document.activeElement.disabled;
          }, overlay);
          record(screen, spec.name, 'interactive', await elapsed(p), run);
          await p.keyboard.press('Escape');
        }
        if (HELP_ONLY) { await ctx.close(); continue; }
        await p.evaluate(() => document.addEventListener('keydown', event => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'k') window.__perfStart = performance.now();
        }, { capture: true }));
        await p.keyboard.press('Control+k');
        await p.locator('#paletteOverlay.show').waitFor();
        record('command-palette', spec.name, 'content', await elapsed(p), run);
        await p.waitForFunction(() => document.activeElement.id === 'paletteInput');
        record('command-palette', spec.name, 'interactive', await elapsed(p), run);
        await p.keyboard.press('Escape');
      }
      if (SEARCH_ONLY) await p.waitForFunction(() => document.querySelector('#saveStatus')?.dataset.state === 'saved', null, { timeout: 30000 });
      await p.locator('#searchInput').fill('target');
      await mark(p, '#filterMode', 'change');
      await p.locator('#filterMode').check();
      await p.waitForFunction(() => document.querySelectorAll('#tableBody tr[data-row]').length === 1 && !document.querySelector('#replaceNextBtn').disabled);
      record('search-filter', spec.name, 'result', await elapsed(p), run);
      if (SEARCH_ONLY) { await ctx.close(); continue; }
      await p.waitForFunction(() => document.querySelector('#saveStatus')?.dataset.state === 'saved', null, { timeout: 30000 });
      await p.reload();
      await p.locator('#modalOverlay.show').waitFor();
      record('restore-offer', spec.name, 'content', await elapsed(p), run);
      record('restore-offer', spec.name, 'interactive', await p.evaluate(() => performance.now()), run);
      await mark(p, '#modalConfirmBtn');
      await p.locator('#modalConfirmBtn').click();
      await p.locator('#tableBody td[data-col="0"]').first().waitFor();
      record('restore', spec.name, 'content', await elapsed(p), run);
      await p.locator('#tableBody td[data-col="0"]').first().click();
      record('restore', spec.name, 'interactive', await elapsed(p), run);
      await ctx.close();
      if (RESTORE_ONLY || PANEL_ONLY) continue;
      }

      const fileCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ja-JP' });
      const f = await fileCtx.newPage();
      await disableCache(f);
      f.on('pageerror', error => errors.push(error.message));
      f.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await f.addInitScript(() => { window.showOpenFilePicker = undefined; });
      await f.goto(BASE + '/local-csv.html');
      const [chooser] = await Promise.all([f.waitForEvent('filechooser'), f.locator('#openFileBtn').click()]);
      await f.evaluate(() => document.addEventListener('change', event => { if (event.target.type === 'file') window.__perfStart = performance.now(); }, { capture: true }));
      if (FILE_ONLY) {
        const fixtureDir = path.join(fixtureRoot, spec.name);
        await fs.mkdir(fixtureDir, { recursive: true });
        const fixturePath = path.join(fixtureDir, 'performance.csv');
        await fs.writeFile(fixturePath, text);
        await chooser.setFiles(fixturePath);
      } else await chooser.setFiles({ name: 'performance.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
      await f.locator('#importWizardOverlay.show').waitFor();
      record('file-settings', spec.name, 'content', await elapsed(f), run);
      if (EXTRA || FILE_ONLY) {
        await f.waitForFunction(() => document.activeElement.id === 'wizNextBtn' && !document.activeElement.disabled);
        record('file-settings', spec.name, 'interactive', await elapsed(f), run);
      }
      await mark(f, '#wizNextBtn');
      await f.locator('#wizNextBtn').click();
      await f.locator('#wizardPage2').waitFor();
      if (await f.locator('#wizPreviewBody tr').count() !== 10) throw new Error('preview count');
      record('file-preview', spec.name, 'content', await elapsed(f), run);
      if (EXTRA || FILE_ONLY) {
        await f.waitForFunction(() => document.activeElement.id === 'wizPreviewRows' && !document.activeElement.disabled);
        record('file-preview', spec.name, 'interactive', await elapsed(f), run);
      }
      await mark(f, '#wizImportBtn');
      await f.locator('#wizImportBtn').click();
      await f.locator('#importWizardOverlay.show').waitFor({ state: 'hidden' });
      await f.locator('#tableBody td[data-col="0"]').first().waitFor();
      record('file-import', spec.name, 'content', await elapsed(f), run);
      await f.locator('#tableBody td[data-col="0"]').first().click();
      record('file-import', spec.name, 'interactive', await elapsed(f), run);
      await fileCtx.close();
    }
    }
    console.log(`performance run ${run + 1}/${RUNS} completed`);
  }
} finally {
  await browser.close();
  server.close();
  if (fixtureRoot) await fs.rm(fixtureRoot, { recursive: true, force: true });
  const versions = {};
  for (const name of ['local-csv.html', 'index.html', 'public/js/main.js']) versions[name] = crypto.createHash('sha256').update(await fs.readFile(path.join(ROOT, name))).digest('hex');
  const comparisonVersions = {};
  if (COMPARE_ROOT) for (const [_version, _root] of [['before', COMPARE_ROOT], ['after', ROOT]]) {
    comparisonVersions[_version] = {};
    for (const _name of ['local-csv.html', 'index.html', 'public/js/main.js']) comparisonVersions[_version][_name] = crypto.createHash('sha256').update(await fs.readFile(path.join(_root, _name))).digest('hex');
  }
  await fs.writeFile(OUTPUT, JSON.stringify({ comparisonVersions, measuredAt: new Date().toISOString(), root: ROOT, runs: RUNS, versions, environment: { browser: browser.version(), viewport: '1440x900', network: 'loopback; no throttling', cache: NO_CACHE ? 'HTTP cache disabled via CDP; fresh context vs same-context repeated access; no server/CDN cache' : 'fresh context vs same-context reload; HTTP max-age=3600; resource timing cache-hit audit; no server/CDN cache', data: CASES, nonAscii: NON_ASCII, fileSource: FILE_ONLY ? 'real generated files; OS page cache not cleared (written before selection)' : 'synthetic File payload; physical disk latency excluded' }, cacheAudit, errors, results }, null, 2));
}
if (errors.length) throw new Error(JSON.stringify(errors));
