import assert from 'node:assert/strict';
import vm from 'node:vm';
import { analyzeSource, extractConstDeclaration } from './localcsv-source-audit.mjs';

const _fixture = [
  '// const actual = "wrong comment";',
  'const distraction = "const actual = wrong string;";',
  'const actual = () => `outer ${`inner ${/;[}]/.source}`}`;',
  'const first = 1, second = () => /a;b/.test("a;b");',
].join('\n');
assert.equal(vm.runInNewContext(`${extractConstDeclaration(_fixture, 'actual')} actual();`), 'outer inner ;[}]');
assert.equal(vm.runInNewContext(`${extractConstDeclaration(_fixture, 'second')} second();`), true);
assert.throws(() => extractConstDeclaration(_fixture, 'missing'), /declaration not found/);
const _html = '<!doctype html><script type="application/json">{"fake":"const item = 0;"}</script><script>const item = 7;</script>';
assert.equal(vm.runInNewContext(`${extractConstDeclaration(_html, 'item')} item;`), 7);
assert.equal(analyzeSource('const example = "document.write(); var legacy;"; // x.substr()\nconst pattern = /keyCode/;').legacy.length, 0);
const _legacy = analyzeSource('document["write"]("x"); window.document?.["execCommand"]("copy"); input["keyCode"]; input?.which; const x = str["substr"](0);');
assert.deepEqual(_legacy.legacy.map(_item => _item.rule), ['document.write', 'execCommand', 'keyCode', 'which', 'substr']);
assert.deepEqual(analyzeSource('const name = "write"; document[name]("x");').computedAccess.map(_item => _item.object), ['document']);
const _resources = analyzeSource('const run = () => { const worker = new Worker(url); worker.terminate(); URL.revokeObjectURL(url); };');
assert.deepEqual(_resources.resources.map(_item => [_item.api, _item.owner]), [['Worker', 'run'], ['terminate', 'run'], ['revokeObjectURL', 'run']]);
assert.throws(() => analyzeSource('const broken = ;'), /Unexpected token/);
const _worker = analyzeSource('const shared = x => x + 1; const workerCode = `const shared = ${shared.toString()}; self.onmessage = e => self.postMessage(shared(e.data));`;');
assert.equal(_worker.embeddedWorkers.length, 1);
assert.ok(_worker.embeddedWorkers[0].functions.some(_item => _item.name === 'shared'));
assert.throws(() => analyzeSource('const workerCode = `${unknown()}`;'), /Unsupported worker interpolation/);
assert.throws(() => extractConstDeclaration('const item = 1; { const item = 2; }', 'item'), /ambiguous across scopes/);
assert.throws(() => analyzeSource('const shared = x => x; { const shared = x => x + 1; } const workerCode = `${shared.toString()}`;'), /Ambiguous worker serialization/);
console.log('AST detection, exact declaration extraction and embedded worker checks passed.');
