import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRE = createRequire(import.meta.url);
const PLAYWRIGHT = REQUIRE(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const ENGINES = (process.env.LOCALCSV_TEST_ENGINES || 'chromium,firefox,webkit').split(',');
const _html = await fs.readFile(path.join(ROOT, 'local-csv.html'));
const _escapeDeclaration = _html.toString('utf8').match(/const escapeRegExp = [^\n]+/)[0];
const _lpSource = await fs.readFile(path.join(ROOT, 'public/js/main.js'), 'utf8');
const _decoderDeclaration = _lpSource.match(/const _decodeBase64Utf8 = [\s\S]*?\n};/)[0];
const _lpStyle = await fs.readFile(path.join(ROOT, 'public/css/style.css'), 'utf8');
const _results = [];

for (const _engine of ENGINES) {
  const _executablePath = process.env[`LOCALCSV_${_engine.toUpperCase()}_PATH`];
  const _browser = await PLAYWRIGHT[_engine].launch({ headless: true, ...(_executablePath ? { executablePath: _executablePath } : {}) });
  try {
    for (const _fallback of [false, true]) {
      const _context = await _browser.newContext({ viewport: { width: 1280, height: 720 } });
      try {
        if (_fallback) await _context.addInitScript(() => { Uint8Array.fromBase64 = undefined; RegExp.escape = undefined; });
        const $page = await _context.newPage();
        const _errors = [];
        $page.on('pageerror', _error => _errors.push(_error.message));
        $page.on('console', _message => { if (_message.type() === 'error') _errors.push(_message.text()); });
        await $page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
        const _base64Cases = ['', 'Zg', 'Zg=', 'Zg==', 'Zm8', 'Zm9v', 'Z m\n9v', '====', 'A', 'A===', 'Zg===', 'Zg==A', '%', '/w==', '77u/5pel5pys', 'AAEC', 'Zg\u00a0=='];
        const _decoderResults = await $page.evaluate(new Function('_cases', `
          ${_decoderDeclaration}
          const _legacy = (_text) => {
            try { return new TextDecoder('utf-8').decode(Uint8Array.from(window.atob(_text), (_char) => _char.charCodeAt(0))); }
            catch { return null; }
          };
          return _cases.map(_text => [_text, _decodeBase64Utf8(_text), _legacy(_text)]);
        `), _base64Cases);
        for (const [_case, _native, _legacy] of _decoderResults) assert.equal(_native, _legacy, `base64 parity: ${JSON.stringify(_case)}`);
        const _downloadEvent = $page.waitForEvent('download');
        await $page.locator('[data-download-editor]').first().click();
        const _download = await _downloadEvent;
        assert.deepEqual(await fs.readFile(await _download.path()), _html);
        await $page.evaluate(() => {
          Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
          const $input = document.createElement('textarea');
          $input.id = 'qa-cursor';
          $input.value = 'abcdef';
          document.body.appendChild($input);
          $input.focus({ preventScroll: true });
          $input.setSelectionRange(1, 4, 'backward');
          document.execCommand = () => { window.__copiedHtml = document.activeElement.value; return true; };
          document.querySelector('[data-copy-editor]').click();
        });
        await $page.waitForFunction(() => document.querySelector('.lp-toast--success'));
        assert.equal(await $page.evaluate(() => window.__copiedHtml), _html.toString('utf8'));
        assert.deepEqual(await $page.evaluate(() => {
          const $input = document.querySelector('#qa-cursor');
          return [document.activeElement.id, $input.selectionStart, $input.selectionEnd, $input.selectionDirection];
        }), ['qa-cursor', 1, 4, 'backward']);
        assert.equal(await $page.locator('.clipboard-fallback').count(), 0);
        await $page.evaluate(() => {
          document.execCommand = () => { throw new Error('permission denied'); };
          document.querySelector('[data-copy-editor]').click();
        });
        await $page.waitForFunction(() => document.querySelector('.lp-toast--error'));
        assert.equal(await $page.locator('.clipboard-fallback').count(), 0);
        assert.equal(await $page.evaluate(() => document.activeElement.id), 'qa-cursor');
        const _rangeState = await $page.evaluate(async () => {
          const $text = document.createElement('span');
          $text.textContent = 'abcdef';
          $text.tabIndex = 0;
          document.body.appendChild($text);
          $text.focus({ preventScroll: true });
          const _range = document.createRange();
          _range.setStart($text.firstChild, 1);
          _range.setEnd($text.firstChild, 4);
          const _selection = window.getSelection();
          _selection.removeAllRanges();
          _selection.addRange(_range);
          document.execCommand = () => true;
          document.querySelector('[data-copy-editor]').click();
          await Promise.resolve();
          return { focus: document.activeElement === $text, selection: _selection.toString() };
        });
        assert.deepEqual(_rangeState, { focus: true, selection: 'bcd' });
        assert.deepEqual(_errors, []);
        const _queries = ['a.b', '[x]', '\\', 'a-b', 'a/b', 'a\nb', 'a\rb', '日本', '😀', '\ud800', 'foo', 'σ', '𐐨'];
        assert.deepEqual(await $page.evaluate(new Function('_queries', `
          ${_escapeDeclaration}
          return _queries.map(_query => {
            const _regex = new RegExp('^(?:' + escapeRegExp(_query) + ')(?![\\\\s\\\\S])', 'iu');
            return [_regex.test(_query), _regex.test(_query + '\\n')];
          });
        `), _queries), _queries.map(() => [true, false]));
        for (const _file of ['index.html', 'local-csv.html']) {
          await $page.goto(pathToFileURL(path.join(ROOT, _file)).href);
          const _audit = await $page.evaluate((_css) => {
            const _seen = new Set(), _duplicateIds = [], _unlayered = [];
            for (const $element of document.querySelectorAll('[id]')) {
              if (_seen.has($element.id)) _duplicateIds.push($element.id);
              _seen.add($element.id);
            }
            const _walk = (_rules, _inLayer = false) => {
              for (const _rule of _rules) {
                const _layer = _inLayer || _rule.constructor.name === 'CSSLayerBlockRule';
                if (_rule.selectorText && !_layer) _unlayered.push(_rule.selectorText);
                if (_rule.cssRules) _walk(_rule.cssRules, _layer);
              }
            };
            for (const _sheet of document.styleSheets) {
              if (!_sheet.href) _walk(_sheet.cssRules);
            }
            // file: stylesheets have opaque origins; parse their exact saved source independently.
            const _linkedSheet = new CSSStyleSheet();
            _linkedSheet.replaceSync(_css);
            _walk(_linkedSheet.cssRules);
            return { duplicateIds: _duplicateIds, unlayered: _unlayered };
          }, _lpStyle);
          assert.deepEqual(_audit, { duplicateIds: [], unlayered: [] }, `${_file}: structure and CSS layers`);
        }
        await $page.setViewportSize({ width: 390, height: 844 });
        await $page.locator('#pasteBtn').click();
        await $page.locator('#pasteImportInput').fill(Array.from({ length: 100 }, (_, _row) => `${_row},value`).join('\n'));
        await $page.locator('#pasteImportConfirmBtn').click();
        await $page.locator('#pasteImportOverlay.show').waitFor({ state: 'hidden' });
        assert.equal(await $page.locator('#filterStatus').isVisible(), false);
        const _mobileState = await $page.evaluate(() => {
          const $scroll = document.querySelector('#tableScroll');
          $scroll.scrollTop = 200;
          const _before = $scroll.scrollTop;
          const $reset = document.querySelector('#clearAllFiltersBtn');
          $reset.disabled = false;
          const _visible = getComputedStyle(document.querySelector('#filterStatus')).display !== 'none';
          const _activeScroll = $scroll.scrollTop;
          $reset.disabled = true;
          return { before: _before, active: _activeScroll, after: $scroll.scrollTop, visible: _visible };
        });
        assert.equal(_mobileState.visible, true);
        assert.equal(_mobileState.active, _mobileState.before);
        assert.equal(_mobileState.after, _mobileState.before);
        await $page.setViewportSize({ width: 1280, height: 720 });
        assert.equal(await $page.locator('#filterStatus').evaluate($element => getComputedStyle($element).display), 'flex');
        assert.deepEqual(_errors, []);
        _results.push({ engine: _engine, version: _browser.version(), fallback: _fallback, status: 'passed' });
      } finally { await _context.close(); }
    }
  } finally { await _browser.close(); }
}

// Paired local measurement with identical assets and the saved pre-change LP script.
if (process.env.LOCALCSV_LP_BASELINE_JS) {
  const _before = await fs.readFile(process.env.LOCALCSV_LP_BASELINE_JS);
  const _beforeDecoder = _before.toString('utf8').match(/const _decodeBase64Utf8 = [\s\S]*?\n};/)[0];
  const _base64 = _html.toString('base64');
  const _server = http.createServer(async (_request, _response) => {
    try {
      const _url = new URL(_request.url, 'http://localhost');
      const _relative = _url.pathname.replace(/^\/(before|after)\//, '');
      const _file = path.resolve(ROOT, _relative);
      if (!_file.startsWith(ROOT + path.sep)) { _response.writeHead(404).end(); return; }
      const _content = _url.pathname === '/before/public/js/main.js' ? _before : await fs.readFile(_file);
      _response.setHeader('Cache-Control', 'no-store');
      _response.setHeader('Content-Type', _file.endsWith('.js') ? 'text/javascript' : _file.endsWith('.css') ? 'text/css' : _file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
      _response.end(_content);
    } catch { _response.writeHead(404).end(); }
  });
  await new Promise(_resolve => _server.listen(0, '127.0.0.1', _resolve));
  const _browser = await PLAYWRIGHT.chromium.launch({ headless: true, ...(process.env.LOCALCSV_CHROMIUM_PATH ? { executablePath: process.env.LOCALCSV_CHROMIUM_PATH } : {}) });
  const _samples = [];
  const _decodeSamples = [];
  try {
    for (let _trial = 0; _trial < 7; _trial++) {
      for (const _variant of (_trial % 2 ? ['after', 'before'] : ['before', 'after'])) {
        const _context = await _browser.newContext({ viewport: { width: 1280, height: 720 } });
        try {
          const $page = await _context.newPage();
          await $page.goto(`http://127.0.0.1:${_server.address().port}/${_variant}/index.html`);
          await $page.evaluate(() => document.addEventListener('click', (_event) => {
            if (_event.target instanceof Element && _event.target.closest('[data-download-editor]')) window.__lpDownloadStart = performance.now();
          }, { capture: true }));
          for (const _execution of ['first', 'repeat']) {
            const _event = $page.waitForEvent('download');
            const _start = performance.now();
            await $page.locator('[data-download-editor]').first().click();
            const _download = await _event;
            const _bytes = await fs.readFile(await _download.path());
            const _driverMs = performance.now() - _start;
            const _elapsed = await $page.evaluate(() => performance.now() - window.__lpDownloadStart);
            assert.deepEqual(_bytes, _html);
            _samples.push({ variant: _variant, execution: _execution, trial: _trial, ms: _elapsed, driverMs: _driverMs });
            // Keep internal diagnostics after both user operations, so they cannot change
            // the interval between first/repeated clicks differently for each variant.
            if (_execution === 'repeat') {
              const _decoded = await $page.evaluate(new Function('_input', `
                ${_variant === 'before' ? _beforeDecoder : _decoderDeclaration}
                const _start = performance.now();
                const _text = _decodeBase64Utf8(_input.base64);
                const _ms = performance.now() - _start;
                return { ms: _ms, equal: _text === _input.expected };
              `), { base64: _base64, expected: _html.toString('utf8') });
              assert.equal(_decoded.equal, true);
              _decodeSamples.push({ variant: _variant, trial: _trial, ms: _decoded.ms });
            }
          }
        } finally { await _context.close(); }
      }
    }
    const _summary = ['first', 'repeat'].map(_execution => {
      const _stats = _variant => {
        const _values = _samples.filter(_sample => _sample.variant === _variant && _sample.execution === _execution).map(_sample => _sample.ms).sort((_a, _b) => _a - _b);
        return { median: _values[3], min: _values[0], max: _values[6], count: _values.length };
      };
      const _beforeStats = _stats('before'), _afterStats = _stats('after');
      return { execution: _execution, before: _beforeStats, after: _afterStats, reductionPercent: (_beforeStats.median - _afterStats.median) / _beforeStats.median * 100 };
    });
    const _record = { measuredAt: new Date().toISOString(), browser: _browser.version(), viewport: [1280, 720], htmlBytes: _html.length, cache: 'no-store; fresh context per variant/trial', metric: 'actual click event through confirmed download file read and browser timestamp response; includes transport/file overhead; excludes driver element-stability wait; local only', driverMetric: 'driver click request through file read; element-stability animation waiting is included; diagnostic only', decodeMetric: 'performance.now around decoder only; excludes serialization, input wait, rendering and disk; internal diagnostic', verification: _results, samples: _samples, summary: _summary, decodeSamples: _decodeSamples };
    if (process.env.LOCALCSV_LP_OUTPUT) await fs.writeFile(process.env.LOCALCSV_LP_OUTPUT, JSON.stringify(_record, null, 2));
    console.log(JSON.stringify(_record.summary, null, 2));
  } finally {
    await _browser.close();
    await new Promise(_resolve => _server.close(_resolve));
  }
}
console.log(JSON.stringify(_results, null, 2));
