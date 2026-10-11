import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = process.argv[2]
  ? path.resolve(process.argv[2]) + path.sep
  : fileURLToPath(new URL('./performance-results/copy/', import.meta.url));
const _paired = JSON.parse(await fs.readFile(ROOT + 'paired.json', 'utf8'));
const _targets = JSON.parse(await fs.readFile(ROOT + 'targets.json', 'utf8'));
assert.equal(_paired.before.sha256, _targets.sourceSha256, 'targets apply to the preserved baseline');
const _median = (_values) => {
  const _sorted = _values.toSorted((_a, _b) => _a - _b);
  const _middle = Math.floor(_sorted.length / 2);
  return _sorted.length % 2 ? _sorted[_middle] : (_sorted[_middle - 1] + _sorted[_middle]) / 2;
};
const _summary = _targets.targets.map((_target) => {
  const _values = (_version) => _paired.results.filter(_result => _result.version === _version && _result.operation === _target.operation).map(_result => _result[_target.metric]);
  const _before = _values('before'), _after = _values('after');
  for (const _values of [_before, _after]) {
    assert.equal(_values.length, _paired.runs);
    assert.ok(_values.length >= 5);
    assert.ok(_values.every(_value => Number.isFinite(_value) && _value >= 0));
  }
  const _beforeMedian = _median(_before), _afterMedian = _median(_after);
  const _overlap = Math.max(Math.min(..._before), Math.min(..._after)) <= Math.min(Math.max(..._before), Math.max(..._after));
  return { operation: _target.operation, metric: _target.metric, beforeMedianMs: _beforeMedian, afterMedianMs: _afterMedian,
    reductionMs: _beforeMedian - _afterMedian, reductionPercent: _beforeMedian === 0 ? null : (_beforeMedian - _afterMedian) / _beforeMedian * 100,
    beforeRangeMs: [Math.min(..._before), Math.max(..._before)], afterRangeMs: [Math.min(..._after), Math.max(..._after)],
    beforeRuns: _before.length, afterRuns: _after.length, rangesOverlap: _overlap,
    absoluteTargetMs: _target.maximumMedianMs, targetMet: _afterMedian <= _target.maximumMedianMs,
    assessment: _overlap ? 'difference not confirmed; observed ranges overlap' : 'observed ranges separate; local sample only' };
});
const _longTasks = ['all-first', 'all-repeat', 'column'].map(_operation => ({ operation: _operation,
  ...Object.fromEntries(['before', 'after'].map(_version => {
    const _samples = _paired.results.filter(_result => _result.operation === _operation && _result.version === _version);
    const _durations = _samples.flatMap(_result => _result.longTasks.map(_task => _task.duration));
    return [_version, { trials: _samples.length, tasks: _durations.length, maximumMs: _durations.length ? Math.max(..._durations) : null }];
  })) }));
await fs.writeFile(ROOT + 'summary.json', JSON.stringify({ generatedAt: new Date().toISOString(), sourceSha256: _paired.sha256, baselineSha256: _paired.before.sha256, rows: _summary, longTasks: _longTasks, hostedWebsite: 'unmeasured; rate cannot be calculated' }, null, 2) + '\n');
console.log(JSON.stringify({ rows: _summary, longTasks: _longTasks }, null, 2));
