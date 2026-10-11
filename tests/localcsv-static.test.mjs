import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXCEPTIONS = new Map([
  ['local-csv.html:execCommand', 1], // Insecure/permission-denied local clipboard fallback.
  ['src/main.ts:execCommand', 1],
  ['local-csv.html:keyCode', 1], // IME composition boundary compatibility (229 only).
  ['local-csv.html:which', 1],
]);
const _inventory = [];
const _walk = async (_relative = '') => {
  for (const _entry of await fs.readdir(path.join(ROOT, _relative), { withFileTypes: true })) {
    const _name = path.join(_relative, _entry.name);
    if (_entry.isDirectory()) {
      if (['.git', 'node_modules'].includes(_entry.name)) continue;
      // Recorded comparisons are historical evidence, never modernized in place.
      if (_name === 'tests/performance-results') continue;
      await _walk(_name);
      continue;
    }
    const _bytes = await fs.readFile(path.join(ROOT, _name));
    _inventory.push({ path: _name, bytes: _bytes.length, sha256: crypto.createHash('sha256').update(_bytes).digest('hex') });
    if (_name.endsWith('.mjs') || _name.endsWith('.js')) execFileSync(process.execPath, ['--check', path.join(ROOT, _name)]);
  }
};
await _walk();
// GitHub Actionsを追加しない方針を、ローカルの検査でも確認する。
assert.deepEqual(_inventory.filter((_entry) =>
  _entry.path.startsWith(path.join('.github', 'workflows') + path.sep) && /\.ya?ml$/i.test(_entry.path)
).map((_entry) => _entry.path), [], 'GitHub Actions workflows must not be added to this repository');
// JavaScript無効時も、紹介ページの通常リンクから実在するファイルを開けること。
const _indexHtml = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
for (const _match of _indexHtml.matchAll(/\b(?:href|src)="([^"#]+)"/g)) {
  const _reference = _match[1];
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(_reference)) continue;
  const _assetPath = _reference.split(/[?#]/)[0];
  await fs.access(path.resolve(ROOT, _assetPath));
}

const _vendors = JSON.parse(await fs.readFile(path.join(ROOT, 'tests/vendor-manifest.json'), 'utf8'));
for (const [_name, _vendor] of Object.entries(_vendors)) {
  const _html = await fs.readFile(path.join(ROOT, _vendor.file), 'utf8');
  const _scripts = [..._html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.equal(crypto.createHash('sha256').update(_scripts[_vendor.scriptIndex][1]).digest('hex'), _vendor.sha256, `${_name}: vendor source changed; recheck input/output compatibility`);
}

for (const _name of ['local-csv.html', 'index.html', 'src/main.ts']) {
  let _source = await fs.readFile(path.join(ROOT, _name), 'utf8');
  if (_name.endsWith('.html')) {
    const _scripts = [..._source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter(_match => !/\b(?:src|type)\s*=/.test(_match[1]));
    for (const _script of _scripts) new vm.Script(_script[2], { filename: _name });
    // Bundled encoding-japanese is upstream minified code, not handwritten application source.
    _source = _scripts.filter(_script => !_script[2].trimStart().startsWith('!function(n)')).map(_script => _script[2]).join('\n');
  }
  for (const [_rule, _pattern] of [
    ['execCommand', /\bdocument\.execCommand\b/g],
    ['keyCode', /\bkeyCode\b/g],
    ['which', /\?\.which\b/g],
    ['removed API', /\b(?:document\.write|readAsBinaryString|attachEvent|arguments\.callee)\b/g],
    ['obsolete syntax', /\bvar\s+[a-zA-Z_$]|\.substr\s*\(/g],
  ]) {
    const _count = [..._source.matchAll(_pattern)].length;
    assert.equal(_count, EXCEPTIONS.get(`${_name}:${_rule}`) ?? 0, `${_name}: unexpected ${_rule}; review the compatibility contract before changing exceptions`);
  }
}

const _package = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
const _lock = JSON.parse(await fs.readFile(path.join(ROOT, 'package-lock.json'), 'utf8'));
assert.equal(_package.version, _lock.packages[''].version);
assert.deepEqual(_package.devDependencies, _lock.packages[''].devDependencies);
execFileSync(process.execPath, [path.join(ROOT, 'node_modules/typescript/lib/tsc.js'), '--project', path.join(ROOT, 'tsconfig.example.jsonc')]);
const _emitDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'localcsv-emit-'));
try {
  execFileSync(process.execPath, [path.join(ROOT, 'node_modules/typescript/lib/tsc.js'), '--project', path.join(ROOT, 'tsconfig.json'), '--outDir', _emitDirectory]);
  assert.deepEqual(await fs.readFile(path.join(_emitDirectory, 'main.js')), await fs.readFile(path.join(ROOT, 'public/js/main.js')), 'Generated LP script must match its TypeScript source');
} finally { await fs.rm(_emitDirectory, { recursive: true, force: true }); }
if (process.env.LOCALCSV_AUDIT_OUTPUT) await fs.writeFile(process.env.LOCALCSV_AUDIT_OUTPUT, JSON.stringify({ checkedAt: new Date().toISOString(), inventory: _inventory, exclusions: ['.git', 'node_modules (upstream dependencies)', 'tests/performance-results (immutable historical evidence)'], exceptions: Object.fromEntries(EXCEPTIONS), limits: 'Pattern checks are targeted safeguards, not a complete semantic refactoring audit. Embedded worker syntax/behavior is covered by regression/browser tests.' }, null, 2));
console.log(`Static checks passed; inventoried ${_inventory.length} files; 4 documented compatibility occurrences.`);
