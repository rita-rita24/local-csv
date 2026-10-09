import { extractConstDeclaration } from './localcsv-source-audit.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const BEFORE = require('./performance-results/baseline-parser.cjs');
const HTML = fs.readFileSync(new URL('../local-csv.html', import.meta.url), 'utf8');
const AFTER = vm.runInNewContext(['CSV_PARSE_ERROR_UNCLOSED_QUOTE', 'parseCSV'].map(_name => extractConstDeclaration(HTML, _name)).join('\n') + '\nparseCSV;');
let _seed = 41;
const _next = () => (_seed = (Math.imul(_seed, 1664525) + 1013904223) >>> 0);
const CHARS = ['a', 'b', '"', ',', ';', '\t', ' ', '\r', '\n', '\0', '日', '😀'];
const DELIMITERS = [',', ';', '\t', ' ', '|', ']', '\\'];
const LIMITS = [1, 2, 10, Infinity];
const _run = (_parser, _text, _delimiter, _limit) => {
  try { return JSON.stringify({ data: _parser(_text, _delimiter, _limit) }); }
  catch (_error) { return JSON.stringify({ error: _error.code || _error.message }); }
};
for (let _case = 0; _case < 10000; _case++) {
  let _text = '';
  for (let _length = _next() % 150; _length > 0; _length--) _text += CHARS[_next() % CHARS.length];
  const _delimiter = DELIMITERS[_next() % DELIMITERS.length];
  const _limit = LIMITS[_next() % LIMITS.length];
  assert.equal(_run(AFTER, _text, _delimiter, _limit), _run(BEFORE, _text, _delimiter, _limit), `case ${_case}`);
}
console.log('10,000 seeded parser equivalence cases passed');
