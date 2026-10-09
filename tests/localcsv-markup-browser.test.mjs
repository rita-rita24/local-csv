import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = (process.env.LOCALCSV_TEST_ENGINES || 'chromium,firefox,webkit').split(',');
const _results = [];
const CSS_SOURCES = { [pathToFileURL(path.join(ROOT, 'public/css/style.css')).href]: await fs.readFile(path.join(ROOT, 'public/css/style.css'), 'utf8') };
for (const _engine of ENGINES) {
  const _browser = await ({ chromium, firefox, webkit })[_engine].launch({ headless: true, executablePath: process.env[`LOCALCSV_${_engine.toUpperCase()}_PATH`] });
  try {
    for (const _file of ['index.html', 'local-csv.html']) {
      const _context = await _browser.newContext();
      try {
        _context.setDefaultTimeout(10000);
        const $page = await _context.newPage(), _errors = [];
        $page.on('pageerror', _error => _errors.push(_error.message));
        $page.on('console', _message => { if (_message.type() === 'error') _errors.push(_message.text()); });
        await $page.goto(pathToFileURL(path.join(ROOT, _file)).href);
        await $page.waitForFunction(() => ['light', 'dark'].includes(document.documentElement.style.colorScheme));
        const _audit = await $page.evaluate((_cssSources) => {
          const qs = (_sel, _root = document) => _root.querySelector(_sel);
          const qsa = (_sel, _root = document) => [..._root.querySelectorAll(_sel)];
          const _roots = [document, ...qsa('template').map($template => $template.content)];
          const _issues = [], _references = [], _prefixes = new Set();
          let _elements = 0, _rules = 0;
          for (const _root of _roots) {
            const _ids = new Set();
            for (const $element of qsa('*', _root)) {
              _elements++;
              if ($element.id) { if (_ids.has($element.id)) _issues.push(`duplicate id ${$element.id}`); _ids.add($element.id); }
            }
            for (const $element of qsa('font,center,marquee,blink,big,tt,strike,acronym,applet,frameset,frame,basefont,dir,isindex,listing,plaintext,xmp', _root)) _issues.push(`obsolete element ${$element.localName}`);
            for (const $element of qsa('[align],[bgcolor],table[border],table[cellpadding],table[cellspacing]', _root)) _issues.push(`obsolete presentation attribute ${$element.localName}#${$element.id}`);
            for (const $element of qsa('[aria-labelledby],[aria-describedby],[aria-controls],label[for]', _root)) {
              for (const _attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'for']) {
                const _value = $element.getAttribute(_attribute);
                if (!_value) continue;
                for (const _id of _value.trim().split(/\s+/)) {
                  _references.push({ element: $element.id || $element.localName, attribute: _attribute, target: _id });
                  if (!qs(`[id="${CSS.escape(_id)}"]`, _root) && !document.getElementById(_id)) _issues.push(`missing ${_attribute} target ${_id}`);
                }
              }
            }
          }
          const _walkRules = (_list, _layer = false) => {
            for (const _rule of _list) {
              const _insideLayer = _layer || _rule.constructor.name === 'CSSLayerBlockRule';
              if (_rule.type === CSSRule.STYLE_RULE) {
                _rules++;
                if (!_insideLayer) _issues.push(`style outside layer ${_rule.selectorText}`);
                if (_rule.selectorText.includes('-webkit-')) _prefixes.add(_rule.selectorText);
                for (const _property of Array.from(_rule.style)) if (_property.startsWith('-')) _prefixes.add(_property);
              }
              if (_rule.cssRules) _walkRules(_rule.cssRules, _insideLayer);
            }
          };
          for (const _sheet of document.styleSheets) {
            try { _walkRules(_sheet.cssRules); }
            catch (_error) {
              // file: の不透明なオリジンでCSSOM参照が拒まれる場合は、同じローカルソースを未適用のシートで解析する。
              if (_error.name !== 'SecurityError' || !_cssSources[_sheet.href]) throw _error;
              const _detached = new CSSStyleSheet();
              _detached.replaceSync(_cssSources[_sheet.href]);
              _walkRules(_detached.cssRules);
            }
          }
          return { elements: _elements, rules: _rules, references: _references.length, issues: _issues, prefixes: [..._prefixes], colorScheme: document.documentElement.style.colorScheme };
        }, CSS_SOURCES);
        assert.deepEqual(_audit.issues, [], `${_engine}/${_file}: semantic references and CSS layers`);
        assert.ok(_audit.rules > 0);
        assert.ok(['light', 'dark'].includes(_audit.colorScheme));
        assert.deepEqual(_errors, []);
        _results.push({ engine: _engine, browser: _browser.version(), file: _file, ..._audit, errors: _errors });
        console.log(`${_engine}/${_file}: markup references, obsolete features and CSS layers passed`);
      } finally { await _context.close(); }
    }
  } finally { await _browser.close(); }
}
if (process.env.LOCALCSV_MARKUP_OUTPUT) await fs.writeFile(process.env.LOCALCSV_MARKUP_OUTPUT, JSON.stringify({ timestamp: new Date().toISOString(), results: _results, limits: 'Initial DOM and template content; finite obsolete-feature checks. Browser CSSOM drops invalid source declarations. This is not a complete HTML validator or accessibility audit.' }, null, 2) + '\n');
