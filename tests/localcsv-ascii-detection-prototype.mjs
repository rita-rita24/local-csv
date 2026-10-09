import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
// 自動判定を省けるのは、印字可能ASCIIとCSVの改行・タブだけの場合に限定する。
const _isPlainAsciiBuffer = (_bytes) => {
  const _allowed = _value => (_value >= 32 && _value <= 126) || _value === 9 || _value === 10 || _value === 13;
  let _index = 0;
  while (_index < _bytes.length && ((_bytes.byteOffset + _index) & 3)) {
    if (!_allowed(_bytes[_index++])) return false;
  }
  const _words = new Uint32Array(_bytes.buffer, _bytes.byteOffset + _index, Math.floor((_bytes.length - _index) / 4));
  for (let _i = 0; _i < _words.length; _i++) {
    const _word = _words[_i];
    if (_word & 0x80808080) return false;
    const _del = _word ^ 0x7f7f7f7f;
    if (((_word - 0x20202020) & ~_word & 0x80808080) || ((_del - 0x01010101) & ~_del & 0x80808080)) {
      for (let _shift = 0; _shift < 32; _shift += 8) if (!_allowed((_word >>> _shift) & 255)) return false;
    }
  }
  _index += _words.length * 4;
  for (; _index < _bytes.length; _index++) if (!_allowed(_bytes[_index])) return false;
  return true;
};
const html = await fs.readFile('/private/tmp/localcsv-round2-before/local-csv.html', 'utf8');
const lib = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0][1];
const context = { module: { exports: {} }, exports: {} };
vm.runInNewContext(lib, context);
const Encoding = context.module.exports;
assert.equal(typeof Encoding.detect, 'function');
let seed = 71;
const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
for (let i = 0; i < 10000; i++) {
  const padding = next() % 8, size = next() % 128;
  const backing = new Uint8Array(padding + size);
  const bytes = backing.subarray(padding);
  for (let j = 0; j < size; j++) bytes[j] = next() & 255;
  assert.equal(_isPlainAsciiBuffer(bytes), bytes.every(value => (value >= 32 && value <= 126) || [9, 10, 13].includes(value)));
  const ascii = Uint8Array.from(bytes, value => value % 95 + 32);
  const detected = Encoding.detect(ascii);
  assert.ok(!['SJIS', 'EUCJP', 'JIS', 'UTF16'].includes(detected), 'safe ASCII must keep the same utf-8 label');
}
const bytes = new TextEncoder().encode('1234,abcdefghijklmno\r\n'.repeat(2000000));
const samples = [];
for (let run = 0; run < 7; run++) for (const version of (run % 2 ? ['after', 'before'] : ['before', 'after'])) {
  const start = performance.now();
  const result = version === 'before' ? Encoding.detect(bytes) : _isPlainAsciiBuffer(bytes);
  samples.push({ run, version, ms: performance.now() - start, result });
}
await fs.writeFile(new URL('./performance-results/round2/ascii-prototype.json', import.meta.url), JSON.stringify({ measuredAt: new Date().toISOString(), bytes: bytes.length, samples }, null, 2));
console.log('10,000 byte-boundary and ASCII detection checks passed', samples);
