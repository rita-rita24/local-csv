import fs from 'node:fs/promises';

const ROOT = new URL(process.argv[2] || './performance-results/round2/', import.meta.url);
const SETS = [['files', 0], ['stats', 1], ['output', 1], ['panels', 1], ['cache', 0], ['unquoted', 0],
  ...(process.env.LOCALCSV_PERF_NON_ASCII_SETS === '1' ? [['mixed', 0], ['tail', 0]] : []),
  ...(process.env.LOCALCSV_PERF_RECHECK_SETS === '1' ? [['stats-recheck', 1]] : [])];
const _median = _values => {
  const _sorted = _values.toSorted((_a, _b) => _a - _b), _mid = Math.floor(_sorted.length / 2);
  return _sorted.length % 2 ? _sorted[_mid] : (_sorted[_mid - 1] + _sorted[_mid]) / 2;
};
const _stats = _values => ({ n: _values.length, median: _median(_values), min: Math.min(..._values), max: Math.max(..._values) });
const _key = _record => [_record.screen, _record.condition, _record.metric].join('|');
const _groups = [];
for (const [_name, _skip] of SETS) {
  const _data = JSON.parse(await fs.readFile(new URL('paired-' + _name + '.json', ROOT), 'utf8'));
  if (_data.errors.length) throw new Error('Browser errors: ' + _name);
  const _rows = [...new Set(_data.results.map(_key))].map(_id => {
    const [_screen, _condition, _metric] = _id.split('|');
    const _records = _version => _data.results.filter(_record => _key(_record) === _id && _record.version === _version && _record.run >= _skip);
    const _old = _records('before'), _new = _records('after');
    const _before = _stats(_old.map(_record => _record.ms)), _after = _stats(_new.map(_record => _record.ms));
    if (_before.n < 5 || _after.n < 5) throw new Error('Insufficient samples: ' + _id);
    const _deltas = _old.map(_record => _record.ms - _new.find(_other => _other.run === _record.run).ms);
    const _rate = (_before.median - _after.median) / _before.median * 100;
    const _status = _after.max < _before.min && _rate >= 5 && _before.median - _after.median >= 8 ? '改善確認' :
      _after.min > _before.max && _rate <= -5 && _after.median - _before.median >= 8 ? '悪化確認' : '改善未確認';
    return { screen: _screen, condition: _condition, metric: _metric, before: _before, after: _after, reductionPercent: _rate, pairedDifferencesMs: _deltas, status: _status };
  });
  _groups.push({ name: _name, file: 'paired-' + _name + '.json', measuredAt: _data.measuredAt, discardedWarmupRuns: _skip, versions: _data.comparisonVersions, rows: _rows });
}
await fs.writeFile(new URL('summary.json', ROOT), JSON.stringify(_groups, null, 2) + '\n');
console.log('Saved ' + _groups.reduce((_n, _group) => _n + _group.rows.length, 0) + ' comparisons against the previous optimized HTML');
