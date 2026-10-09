import fs from 'node:fs/promises';

// 集計方法を固定し、計測条件の異なる結果は混ぜない。
const ROOT = new URL('./performance-results/', import.meta.url);
const PAIRS = [
  ['initial-cache', 'before-cache', 'final-cache', 0],
  ['real-file', 'before-files', 'final-files', 0],
  ['unquoted-file', 'before-unquoted-files', 'final-unquoted-files', 0],
  ['main', 'before-final', 'final', 1],
  ['all-panels', 'before-all-panels', 'final-all-panels', 1],
  ['help-recheck', 'before-help-recheck', 'final-help-recheck', 1],
];
const _median = _values => {
  const _sorted = _values.toSorted((_a, _b) => _a - _b);
  const _mid = Math.floor(_sorted.length / 2);
  return _sorted.length % 2 ? _sorted[_mid] : (_sorted[_mid - 1] + _sorted[_mid]) / 2;
};
const _stats = _values => ({ n: _values.length, median: _median(_values), min: Math.min(..._values), max: Math.max(..._values) });
const _key = _record => [_record.screen, _record.condition, _record.metric].join('|');
const _groups = [];
for (const [_name, _beforeName, _afterName, _skip] of PAIRS) {
  const _read = async _file => JSON.parse(await fs.readFile(new URL(_file + '.json', ROOT), 'utf8'));
  const _before = await _read(_beforeName), _after = await _read(_afterName);
  if (_before.errors.length || _after.errors.length) throw new Error('Browser errors in ' + _name);
  const _keys = [...new Set(_before.results.map(_key))];
  const _rows = _keys.map(_id => {
    const [_screen, _condition, _metric] = _id.split('|');
    const _values = _data => _data.results.filter(_record => _key(_record) === _id && _record.run >= _skip).map(_record => _record.ms);
    const _old = _stats(_values(_before)), _new = _stats(_values(_after));
    if (_old.n < 5 || _new.n < 5) throw new Error('Insufficient samples: ' + _id);
    const _rate = (_old.median - _new.median) / _old.median * 100;
    // 範囲が重なる差は改善確認に使わない保守的な判定。統計的有意差検定ではない。
    const _status = _new.max < _old.min && _old.median - _new.median >= 8 && _rate >= 5 ? '改善確認' : _new.min > _old.max && _new.median - _old.median >= 8 && _rate <= -5 ? '悪化確認' : '改善未確認';
    return { screen: _screen, condition: _condition, metric: _metric, before: _old, after: _new, reductionPercent: _rate, status: _status };
  });
  _groups.push({ name: _name, beforeFile: _beforeName + '.json', afterFile: _afterName + '.json', discardedWarmupRuns: _skip, beforeAt: _before.measuredAt, afterAt: _after.measuredAt, beforeVersions: _before.versions, afterVersions: _after.versions, rows: _rows });
}
await fs.writeFile(new URL('summary.json', ROOT), JSON.stringify(_groups, null, 2) + '\n');
console.log('Saved separate medians, ranges, sample counts and reductions for ' + _groups.reduce((_n, _group) => _n + _group.rows.length, 0) + ' comparisons');
