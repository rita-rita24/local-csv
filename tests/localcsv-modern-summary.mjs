import fs from 'node:fs/promises';

const ROOT = new URL('./performance-results/modern/', import.meta.url);
const _stats = (_values) => {
  const _sorted = _values.toSorted((_a, _b) => _a - _b);
  return { median: _sorted[Math.floor(_sorted.length / 2)], min: _sorted[0], max: _sorted.at(-1), count: _sorted.length };
};
const _rows = [];
const _add = (_name, _condition, _metric, _beforeValues, _afterValues) => {
  const _before = _stats(_beforeValues), _after = _stats(_afterValues);
  const _difference = _before.median - _after.median;
  _rows.push({ screen: _name, condition: _condition, metric: _metric, before: _before, after: _after, difference: _difference,
    reductionPercent: _before.median ? _difference / _before.median * 100 : null,
    verdict: _after.max < _before.min ? '今回の標本では短縮を確認' : _after.min > _before.max ? '今回の標本では悪化を確認' : '分布が重なるため差は未確定' });
};
const _download = JSON.parse(await fs.readFile(new URL('paired-download-final.json', ROOT), 'utf8'));
for (const _execution of ['first', 'repeat']) {
  const _values = _version => _download.samples.filter(_sample => _sample.variant === _version && _sample.execution === _execution).map(_sample => _sample.ms);
  _add('LP download', _execution, '実click→ファイル確認（転送確認の代理指標）', _values('before'), _values('after'));
}
for (const _version of ['before', 'after']) {
  if (!_download.decodeSamples.some(_sample => _sample.variant === _version)) throw new Error('Missing decoder diagnostics');
}
_add('LP decoder', '1.2MB; internal diagnostic', '復号関数のみ（操作時間と別）',
  _download.decodeSamples.filter(_sample => _sample.variant === 'before').map(_sample => _sample.ms),
  _download.decodeSamples.filter(_sample => _sample.variant === 'after').map(_sample => _sample.ms));
for (const _filename of ['paired-panels.json', 'paired-search-recheck.json']) {
  const _data = JSON.parse(await fs.readFile(new URL(_filename, ROOT), 'utf8'));
  if (_data.errors.length) throw new Error(`${_filename}: benchmark errors`);
  const _keys = [...new Set(_data.results.map(_record => JSON.stringify([_record.screen, _record.condition, _record.metric])))];
  for (const _key of _keys) {
    const [_screen, _condition, _metric] = JSON.parse(_key);
    const _values = _version => _data.results.filter(_record => JSON.stringify([_record.screen, _record.condition, _record.metric]) === _key && _record.version === _version).map(_record => _record.ms);
    _add(_screen, _condition + (_filename.includes('recheck') ? '; 保存完了後の独立再確認' : ''), _metric, _values('before'), _values('after'));
  }
}
if (_rows.some(_row => _row.before.count !== 7 || _row.after.count !== 7)) throw new Error('Expected 7 samples per variant and condition');
await fs.writeFile(new URL('summary.json', ROOT), JSON.stringify(_rows, null, 2));
const _round = (_number) => _number.toFixed(1);
const _table = _rows.map(_row => `|${_row.screen}|${_row.condition}|${_row.metric}|${_round(_row.before.median)}|${_round(_row.after.median)}|${_round(_row.difference)}|${_row.reductionPercent === null ? '算出不可' : _round(_row.reductionPercent) + '%'}|7/7|${_round(_row.before.min)}–${_round(_row.before.max)} / ${_round(_row.after.min)}–${_round(_row.after.max)}|${_row.verdict}|`).join('\n');
await fs.writeFile(new URL('summary.md', ROOT), `# ローカルの前後比較\n\n本番は前後とも未計測、短縮率算出不可。全行がローカル計測。各指標の定義・限界はREPORT.mdと生JSONを参照。content/interactiveは表示と操作受付の確認後の描画機会確認、resultは正しい結果の利用確認。GPUの実描画トレース・入力INPではない。少数標本の範囲が重なる場合は差を断言しない。P95の安定性や全体平均改善率は算出しない。\n\n|画面|条件|指標|前中央値ms|後中央値ms|短縮ms|短縮率|回数 前/後|min–max 前/後ms|判定|\n|---|---|---|---:|---:|---:|---:|---|---|---|\n${_table}\n`);
console.log(`Saved ${_rows.length} paired metric rows with raw ranges and sample counts.`);
