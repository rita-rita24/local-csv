import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { extractConstDeclaration } from './localcsv-source-audit.mjs';

const _app = await fs.readFile(process.env.LOCALCSV_CLEANUP_APP_SOURCE || new URL('../local-csv.html', import.meta.url), 'utf8');
const _lp = await fs.readFile(process.env.LOCALCSV_CLEANUP_LP_SOURCE || new URL('../public/js/main.js', import.meta.url), 'utf8');
const _expectedOld = process.env.LOCALCSV_CLEANUP_EXPECT_OLD === '1';
for (const [_source, _name] of [[_app, 'downloadPreparedBlob'], [_lp, '_triggerDownload']]) {
  for (const _mode of ['success', 'click-failure', 'append-failure']) {
    const _anchors = new Set(), _urls = new Set(), _timers = [], _toasts = [];
    const _failure = new Error(_mode);
    const _sandbox = {
      document: { createElement() { return { click() { if (_mode === 'click-failure') throw _failure; }, remove() { _anchors.delete(this); } }; },
        body: { appendChild(_anchor) { if (_mode === 'append-failure') throw _failure; _anchors.add(_anchor); } } },
      URL: { createObjectURL() { const _url = `blob:${_urls.size}`; _urls.add(_url); return _url; }, revokeObjectURL(_url) { _urls.delete(_url); } },
      setTimeout(_callback, _delay) { _timers.push({ callback: _callback, delay: _delay }); }, showToast: _text => _toasts.push(_text),
      isEnglish: () => true, escapeHTML: _text => _text,
    };
    const _download = vm.runInNewContext(`${extractConstDeclaration(_source, _name)} ${_name};`, _sandbox);
    for (let _repeat = 0; _repeat < 5; _repeat++) {
      if (_mode === 'success') _download('payload', 'file.csv');
      else assert.throws(() => _download('payload', 'file.csv'), _error => _error === _failure, 'the original failure propagates');
    }
    assert.equal(_anchors.size, _expectedOld && _mode === 'click-failure' ? 5 : 0, 'temporary anchors never accumulate after failure');
    if (_name === 'downloadPreparedBlob') {
      assert.equal(_urls.size, _mode === 'success' || _expectedOld ? 5 : 0, 'failed downloads release their Blob URLs');
      assert.equal(_timers.length, _mode === 'success' ? 5 : 0);
      assert.equal(_toasts.length, _mode === 'success' ? 5 : 0, 'failure must not report success');
      for (const _timer of _timers) { assert.equal(_timer.delay, 3000, 'successful download keeps its existing revocation delay'); _timer.callback(); }
      assert.equal(_urls.size, _expectedOld && _mode !== 'success' ? 5 : 0);
    }
  }
}
console.log(_expectedOld ? 'Baseline reproduced: failed clicks retain anchors; failed app downloads retain Blob URLs.' : 'Download success, repeated failure, anchor and Blob cleanup passed.');
