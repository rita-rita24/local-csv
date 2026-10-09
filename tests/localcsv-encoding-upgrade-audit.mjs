import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

if (!process.argv[2]) throw new Error('Pass the official encoding-japanese candidate package directory.');
const _html = await fs.readFile(new URL('../local-csv.html', import.meta.url), 'utf8');
const _embedded = [..._html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][0][1];
const _context = { module: { exports: {} }, exports: {} };
vm.runInNewContext(_embedded, _context);
const _old = _context.module.exports;
const _candidate = createRequire(import.meta.url)(process.argv[2]);
const _cases = [];
for (const _text of ['ASCII', '日本語', '〜', '～', '①', '髙', '﨑', '−', '¢', '£', '¬', '‖']) {
  for (const _encoding of ['SJIS', 'EUCJP', 'JIS']) {
    const _convert = _library => Array.from(_library.convert(_library.stringToCode(_text), { from: 'UNICODE', to: _encoding, type: 'array' }));
    const _before = _convert(_old), _after = _convert(_candidate);
    _cases.push({ text: _text, encoding: _encoding, before: _before, after: _after, equal: JSON.stringify(_before) === JSON.stringify(_after) });
  }
}
for (const _bytes of [[0x81, 0x7f], [0xfa, 0x40], [0x41, 0x01, 0x42]]) {
  const _before = _old.detect(_bytes), _after = _candidate.detect(_bytes);
  _cases.push({ bytes: _bytes, before: _before, after: _after, equal: _before === _after });
}
const _record = { checkedAt: new Date().toISOString(), embeddedVersion: _old.version, candidateVersion: _candidate.version, embeddedSha256: crypto.createHash('sha256').update(_embedded).digest('hex'), upstream: 'https://github.com/polygonplanet/encoding.js/releases/tag/2.4.0', cases: _cases, changedCases: _cases.filter(_case => !_case.equal).length, conclusion: 'The candidate changes encoded bytes/detection. Retain 2.2.0 under the explicit existing-input/output preservation requirement; revisit when a migration policy for CP932/JIS aliases and warnings is agreed.' };
if (process.env.LOCALCSV_ENCODING_AUDIT_OUTPUT) await fs.writeFile(process.env.LOCALCSV_ENCODING_AUDIT_OUTPUT, JSON.stringify(_record, null, 2));
console.log(JSON.stringify(_record, null, 2));
