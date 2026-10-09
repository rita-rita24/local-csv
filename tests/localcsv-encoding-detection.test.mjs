import { extractConstDeclaration as extract } from './localcsv-source-audit.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const names = ['normalizeEncoding', 'prependBytes', 'encodeUtf16Bytes', 'decodeUtf16Bytes', 'detectBomEncoding', 'decodeWithTextDecoder', 'strictTextDecoderResult', 'collectDecodeWarnings', 'decodeByEncoding', 'encodeToBytes', 'decodeBytesWithMeta', 'decodeFileBytesWithMeta', 'detectEncodingLabel'];
const html = fs.readFileSync(new URL('../local-csv.html', import.meta.url), 'utf8');
const baselinePath = new URL('./performance-results/round3/baseline-encoding.js', import.meta.url);
if (!fs.existsSync(baselinePath)) {
  const before = fs.readFileSync('/private/tmp/localcsv-round3-before/local-csv.html', 'utf8');
  fs.writeFileSync(baselinePath, names.map(name => extract(before, name)).join('\n'));
}
const lib = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0][1];
const context = { module: { exports: {} }, exports: {} };
vm.runInNewContext(lib, context);
const Encoding = context.module.exports;
let detects = 0;
const actualDetect = Encoding.detect;
Encoding.detect = (...args) => { detects++; return actualDetect(...args); };
const LABELS = { 'utf-8': 'utf-8', 'utf-16le': 'utf-16le', 'utf-16be': 'utf-16be', 'shift-jis': 'shift_jis', 'euc-jp': 'euc-jp', 'iso-2022-jp': 'iso-2022-jp' };
const load = (code, extra = {}) => vm.runInNewContext(code + '\n({detectEncodingLabel, decodeFileBytesWithMeta, encodeToBytes, '+(extra.helper?'_isPlainAsciiBuffer':'normalizeEncoding')+'});', {
  TextDecoder, TextEncoder, Uint8Array, Uint32Array, Encoding, HAS_LEGACY_ENCODING_LIB: true,
  SUPPORTED_ENCODINGS: Object.keys(LABELS), ENCODING_TO_DECODER_LABEL: LABELS,
  ENCODING_TO_LIBRARY: { 'shift-jis': 'SJIS', 'euc-jp': 'EUCJP', 'iso-2022-jp': 'JIS' },
  supportsBom: value => ['utf-8', 'utf-16le', 'utf-16be'].includes(value), getEncodingDisplayName: value => value,
});
const old = load(fs.readFileSync(baselinePath, 'utf8'));
const current = load(extract(html, '_isPlainAsciiBuffer') + '\n' + names.map(name => extract(html, name)).join('\n'), { helper: true });
const allowed = value => (value >= 32 && value <= 126) || [9,10,13].includes(value);
for (let padding = 0; padding < 8; padding++) for (let length = 0; length < 12; length++) for (let value = 0; value < 256; value++) {
  const buffer = new Uint8Array(padding + length).fill(65), bytes = buffer.subarray(padding);
  if (length) bytes[value % length] = value;
  assert.equal(current._isPlainAsciiBuffer(bytes), bytes.every(allowed), `alignment ${padding}, length ${length}, byte ${value}`);
}
const run = (functions, bytes) => {
  const label = functions.detectEncodingLabel(bytes.buffer);
  return JSON.stringify({ label, automatic: functions.decodeFileBytesWithMeta(bytes.buffer, 'auto'), selected: functions.decodeFileBytesWithMeta(bytes.buffer, label) });
};
let seed = 811;
const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
for (let i = 0; i < 10000; i++) {
  const bytes = Uint8Array.from({ length: next() % 256 }, () => next() >>> 24);
  assert.equal(current._isPlainAsciiBuffer(bytes), bytes.every(allowed), `random classifier ${i}`);
  assert.equal(run(current, bytes), run(old, bytes), `random ${i}`);
  const safe = Uint8Array.from(bytes, value => value < 3 ? [9,10,13][value] : value % 95 + 32);
  assert.equal(run(current, safe), run(old, safe), `ASCII ${i}`);
}
for (const label of Object.keys(LABELS)) for (const bom of [false, true]) {
  for (const text of ['名前,金額\r\n田中,123', '\uFEFF名前,😀\r\n𠮷野,�\0', 'ASCII only\t123\r\n', '\u001b$B$"\u001b(B', '']) {
    const bytes = old.encodeToBytes(text, label, bom);
    assert.equal(run(current, bytes), run(old, bytes), `${label}, BOM ${bom}`);
  }
}
for (const position of [0, 1, 31, 4095, 8191]) {
  const bytes = new Uint8Array(8192).fill(65);
  for (const value of [0, 0x1b, 0x0e, 0x0f, 0x7f, 0x80, 0xff]) {
    bytes[position] = value;
    assert.equal(run(current, bytes), run(old, bytes), `fallback ${position}:${value}`);
    bytes[position] = 65;
  }
}
detects = 0;
const ascii = new TextEncoder().encode('id,value\r\n1,abcdef\t123');
run(current, ascii);
assert.equal(detects, 0, 'safe ASCII must bypass the general detector');
detects = 0;
run(current, new TextEncoder().encode('名前,値'));
assert.equal(detects, 2, 'non-ASCII must retain both original detection entry points');
console.log('24,576 byte/alignment cases; 10,000 random + 10,000 safe ASCII files; all encodings/BOM/control boundaries: labels, text and warnings match the previous HTML');
