import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESOURCE_APIS = new Set(['createObjectURL', 'revokeObjectURL', 'terminate', 'observe', 'unobserve', 'disconnect', 'addEventListener', 'removeEventListener', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'abort', 'close']);
const RESOURCE_TYPES = new Set(['Worker', 'FileReader', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'AbortController', 'MessageChannel']);
const _memberName = (_node) => _node?.type === 'Identifier' ? _node.name : _node?.type === 'StringLiteral' ? _node.value : null;
const _propertyName = (_node) => _node?.computed ? (_node.property.type === 'StringLiteral' ? _node.property.value : null) : _memberName(_node?.property);
const _receiver = (_node) => {
  if (_node?.type === 'Identifier') return _node.name;
  if (['MemberExpression', 'OptionalMemberExpression'].includes(_node?.type)) {
    const _object = _receiver(_node.object), _property = _propertyName(_node);
    return _object && _property ? `${_object}.${_property}` : null;
  }
  return null;
};
export const analyzeSource = (_source, { filename = 'source.js', startLine = 1, startIndex = 0, startColumn = 0, sourceType = 'module' } = {}) => {
  const _tree = parse(_source, { sourceType, startLine, startIndex, startColumn, plugins: filename.endsWith('.ts') ? ['typescript'] : [] });
  const _bindings = new Map(), _ambiguousBindings = new Set(), _workerTemplates = [];
  const _result = { filename, embeddedWorkers: [], functions: [], resources: [], legacy: [], dynamicCode: [], computedAccess: [], nodeCount: 0 };
  const _record = (_node, _details) => ({ line: _node.loc.start.line, ..._details });
  const _visit = (_node, _parent = null, _owner = '<top-level>') => {
    if (!_node || typeof _node.type !== 'string') return;
    _result.nodeCount++;
    if (_node.type === 'VariableDeclarator' && _node.id.type === 'Identifier' && _node.init) {
      if (_bindings.has(_node.id.name)) _ambiguousBindings.add(_node.id.name);
      _bindings.set(_node.id.name, _node.init);
      if (_node.id.name === 'workerCode' && _node.init.type === 'TemplateLiteral') _workerTemplates.push(_node.init);
    }
    if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod'].includes(_node.type)) {
      _owner = _node.id?.name ?? (_parent?.type === 'VariableDeclarator' ? _parent.id.name : null) ?? _memberName(_node.key) ?? `<callback:${_node.loc.start.line}>`;
      _result.functions.push(_record(_node, { name: _owner, async: !!_node.async, endLine: _node.loc.end.line }));
    }
    if (_node.type === 'VariableDeclaration' && _node.kind === 'var') _result.legacy.push(_record(_node, { rule: 'var', owner: _owner }));
    if (['MemberExpression', 'OptionalMemberExpression'].includes(_node.type)) {
      const _name = _propertyName(_node), _object = _receiver(_node.object);
      if (_node.computed && !_name) _result.computedAccess.push(_record(_node, { owner: _owner, object: _object }));
      if (['substr', 'readAsBinaryString', 'attachEvent', 'keyCode', 'which'].includes(_name)
        || (['document', 'window.document'].includes(_object) && ['write', 'execCommand'].includes(_name))
        || (_object === 'arguments' && _name === 'callee')) {
        _result.legacy.push(_record(_node, { rule: _name === 'write' ? 'document.write' : _name, owner: _owner, receiver: _object, computed: !!_node.computed }));
      }
    }
    if (['CallExpression', 'OptionalCallExpression', 'NewExpression'].includes(_node.type)) {
      const _name = _node.callee.type === 'Identifier' ? _node.callee.name : _propertyName(_node.callee);
      if (RESOURCE_APIS.has(_name) || (_node.type === 'NewExpression' && RESOURCE_TYPES.has(_name))) {
        _result.resources.push(_record(_node, { api: _name, owner: _owner, receiver: _receiver(_node.callee.object), event: _name === 'addEventListener' || _name === 'removeEventListener' ? _node.arguments[0]?.value ?? '<dynamic>' : undefined }));
      }
      if (['eval', 'Function', 'runInNewContext', 'runInContext', 'Script', 'evaluate', 'evaluateAll', 'addInitScript'].includes(_name)) {
        const _arg = _node.arguments[0];
        _result.dynamicCode.push(_record(_node, { api: _name, owner: _owner, argumentType: _arg?.type, coverage: ['ArrowFunctionExpression', 'FunctionExpression'].includes(_arg?.type) ? 'function body traversed' : 'runtime expression; covered by execution tests, not statically expanded' }));
      }
    }
    for (const [_key, _value] of Object.entries(_node)) {
      if (['loc', 'start', 'end', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'tokens'].includes(_key)) continue;
      if (Array.isArray(_value)) { for (const _child of _value) _visit(_child, _node, _owner); }
      else if (_value && typeof _value === 'object') _visit(_value, _node, _owner);
    }
  };
  _visit(_tree);
  const _resolve = (_node) => {
    if (_node.type === 'StringLiteral') return _node.value;
    if (_node.type === 'Identifier') {
      if (_ambiguousBindings.has(_node.name)) throw new Error(`Ambiguous worker constant ${_node.name}`);
      const _binding = _bindings.get(_node.name);
      if (!_binding || _binding.type !== 'StringLiteral') throw new Error(`Unresolved worker constant ${_node.name}`);
      return _binding.value;
    }
    if (_node.type === 'CallExpression' && _node.arguments.length === 0 && _propertyName(_node.callee) === 'toString' && _node.callee.object.type === 'Identifier') {
      if (_ambiguousBindings.has(_node.callee.object.name)) throw new Error(`Ambiguous worker serialization ${_node.callee.object.name}`);
      const _binding = _bindings.get(_node.callee.object.name);
      if (!_binding || !['ArrowFunctionExpression', 'FunctionExpression', 'RegExpLiteral'].includes(_binding.type)) throw new Error('Unresolved worker source serialization');
      return _source.slice(_binding.start - startIndex, _binding.end - startIndex);
    }
    if (_node.type === 'CallExpression' && _receiver(_node.callee) === 'JSON.stringify' && _node.arguments.length === 1) return JSON.stringify(_resolve(_node.arguments[0]));
    throw new Error(`Unsupported worker interpolation: ${_node.type}`);
  };
  for (const _template of _workerTemplates) {
    let _code = _template.quasis[0].value.cooked;
    for (let _index = 0; _index < _template.expressions.length; _index++) _code += _resolve(_template.expressions[_index]) + _template.quasis[_index + 1].value.cooked;
    const _worker = analyzeSource(_code, { filename: `${filename}#worker-at-${_template.loc.start.line}`, sourceType: 'script' });
    assert.equal(_worker.legacy.length, 0, 'worker source must not reintroduce old implementation patterns');
    _result.embeddedWorkers.push({ originalLine: _template.loc.start.line, sha256: crypto.createHash('sha256').update(_code).digest('hex'), ..._worker });
  }
  return _result;
};

const _constDeclarationsCache = new Map();
export const extractConstDeclaration = (_source, _name) => {
  let _declarations = _constDeclarationsCache.get(_source);
  if (!_declarations) {
    _declarations = new Map();
    const _units = /^\s*(?:<!doctype html|<html)/i.test(_source)
      ? [..._source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
        .filter(_match => {
          if (/\bsrc\s*=/.test(_match[1])) return false;
          const _type = _match[1].match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1];
          return !_type || ['module', 'text/javascript', 'application/javascript'].includes(_type);
        })
        .map(_match => ({ code: _match[2], offset: _match.index + _match[0].indexOf('>') + 1 }))
      : [{ code: _source, offset: 0 }];
    for (const _unit of _units) {
      const _tree = parse(_unit.code, { sourceType: 'unambiguous', startIndex: _unit.offset, plugins: ['typescript'] });
      const _collect = (_node) => {
        if (!_node || typeof _node.type !== 'string') return;
        if (_node.type === 'VariableDeclaration' && _node.kind === 'const') {
          for (const _declaration of _node.declarations) {
            if (_declaration.id.type === 'Identifier') {
              const _declarationName = _declaration.id.name;
              _declarations.set(_declarationName, _declarations.has(_declarationName) ? null : `const ${_source.slice(_declaration.start, _declaration.end)};`);
            }
          }
        }
        for (const [_key, _value] of Object.entries(_node)) {
          if (['loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'tokens'].includes(_key)) continue;
          if (Array.isArray(_value)) { for (const _child of _value) _collect(_child); }
          else if (_value && typeof _value === 'object') _collect(_value);
        }
      };
      _collect(_tree);
    }
    _constDeclarationsCache.set(_source, _declarations);
  }
  assert.ok(_declarations.has(_name), `${_name} declaration not found`);
  assert.ok(_declarations.get(_name), `${_name} declaration is ambiguous across scopes`);
  return _declarations.get(_name);
};

export const auditRepository = async () => {
  const _inventory = [], _units = [], _vendorManifest = JSON.parse(await fs.readFile(path.join(ROOT, 'tests/vendor-manifest.json'), 'utf8'));
  const _walk = async (_relative = '') => {
    for (const _entry of await fs.readdir(path.join(ROOT, _relative), { withFileTypes: true })) {
      const _name = path.join(_relative, _entry.name);
      if (_entry.isDirectory()) {
        if (['.git', 'node_modules'].includes(_entry.name) || _name === 'tests/performance-results') continue;
        await _walk(_name); continue;
      }
      const _bytes = await fs.readFile(path.join(ROOT, _name));
      _inventory.push({ path: _name, bytes: _bytes.length, sha256: crypto.createHash('sha256').update(_bytes).digest('hex') });
      if (/\.(?:js|mjs|ts)$/.test(_name)) {
        _units.push({ classification: _name === 'public/js/main.js' ? 'generated from src/main.ts' : 'managed source', ...analyzeSource(_bytes.toString('utf8'), { filename: _name }) });
      } else if (_name.endsWith('.html')) {
        const _html = _bytes.toString('utf8'); let _index = 0;
        for (const _match of _html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
          const _scriptIndex = _index++;
          if (/\bsrc\s*=/.test(_match[1])) continue;
          const _type = _match[1].match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1];
          if (_type && !['module', 'text/javascript', 'application/javascript'].includes(_type)) continue;
          const _vendor = Object.entries(_vendorManifest).find(([, _value]) => _value.file === _name && _value.scriptIndex === _scriptIndex);
          if (_vendor) {
            assert.equal(crypto.createHash('sha256').update(_match[2]).digest('hex'), _vendor[1].sha256);
            _units.push({ filename: `${_name}#script-${_scriptIndex}`, classification: 'upstream vendor; hash verified; migration requires input/output comparison', vendor: _vendor[0] });
            continue;
          }
          const _offset = _match.index + _match[0].indexOf('>') + 1;
          const _startLine = _html.slice(0, _offset).split('\n').length;
          _units.push({ classification: 'managed inline source', ...analyzeSource(_match[2], { filename: `${_name}#script-${_scriptIndex}`, startLine: _startLine, startIndex: _offset, startColumn: _offset - _html.lastIndexOf('\n', _offset - 1) - 1, sourceType: _type === 'module' ? 'module' : 'script' }) });
        }
      }
    }
  };
  await _walk();
  const _productUnits = _units.filter(_unit => _unit.filename.startsWith('local-csv.html#') || _unit.filename === 'src/main.ts' || _unit.filename.startsWith('index.html#'));
  const _compatibility = _productUnits.flatMap(_unit => (_unit.legacy ?? []).map(_item => ({ filename: _unit.filename, ..._item })));
  assert.deepEqual(_compatibility.map(_item => `${_item.filename.split('#')[0]}:${_item.rule}`).toSorted(), ['local-csv.html:execCommand', 'local-csv.html:keyCode', 'local-csv.html:which', 'src/main.ts:execCommand'].toSorted(), 'only documented product compatibility references may remain');
  return { auditedAt: new Date().toISOString(), inventory: _inventory, units: _units, compatibility: _compatibility,
    exclusions: ['.git', 'node_modules: external dependencies', 'tests/performance-results: preserved historical evidence'],
    limits: 'AST syntax/API/resource inventory is not proof of lifecycle correctness. Dynamic strings, aliases and computed runtime keys require execution tests and manual review. Generated JS is inspected separately without doubling migration counts.' };
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const _report = await auditRepository();
  if (process.env.LOCALCSV_SOURCE_AUDIT_OUTPUT) await fs.writeFile(process.env.LOCALCSV_SOURCE_AUDIT_OUTPUT, JSON.stringify(_report, null, 2) + '\n');
  console.log(`AST audit passed: ${_report.inventory.length} managed files, ${_report.units.length} script units, four documented product compatibility references.`);
}
