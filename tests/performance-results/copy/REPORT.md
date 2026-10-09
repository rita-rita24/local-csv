# 選択コピーの追加リファクタリングと性能検証（2026-10-10）

## ① 実施結果

本体の選択コピーを行ごとのTSV生成へ整理し、選択値の二次元中間配列を省いた。共通の引用処理は、引用不要のセルに対する置換を省く。可視行順・選択列の昇順・全件コピー・単一の空セルの引用を維持し、文字列変換も既存のコピー失敗通知で処理する。紹介ページの埋め込み本体を同期した。製品の外部通信・依存・ビルド手順は追加していない。

対象は本体1画面の3代表条件（200万セル初回/反復、10万セルの1列）。本体と紹介ページの2入口を持つ全プロジェクトの過去の調査は ../modern/REPORT.md、検索と選択の追加調査は ../search-refactor/REPORT.md と ../selection/REPORT.md。今回の値を過去の別版の値と足し合わせて全体改善率にしない。

**依頼全体は未完了。本番未反映・本番未計測、最低対応環境と通常の公開/復旧手順未特定、全面の意味監査・全操作の個別目標と性能検証が残る。** package版1.2.6、Git HEAD1e2fc63は据え置き。作業ツリーの版はversion.jsonのhashで識別し、既存の大量の未コミット変更を保持した。反映日時・本番URL・本番計測日時は未確定。本番短縮率は算出不可。

## ② コードの現代化

|言語・領域|旧実装|採用実装|変更前|移行済み|必要な例外|未対応|単位・対象|
|---|---|---|---:|---:|---:|---:|---|
|JavaScript・TSV引用|全セルで引用符置換を先行|引用不要・単一空セルを先に判定|1|1|0|0|_quoteTsvCell 1関数。全TSV呼出元へ共通適用|
|JavaScript・選択コピー|選択値の全行二次元配列を作成後に引用配列へ変換|各行から直接TSV行文字列を生成|1|1|0|0|copySelectedCells 1処理。列の整列・可視順・例外処理を維持|

今回の2は処理の整理数で、廃止API数ではない。String.replace、RegExp、Array.map/join/sort、Map/Setはいずれも有効な現行標準であり、導入年だけで置換しない。移行可能な全コードを調査済みとする集計ではない。生成された埋め込みコピーを二重に数えない。既存のClipboard/IMEの4参照、Base64/RegExp.escapeの必要な代替分岐、encoding-japanese2.2.0の互換性例外は以前の具体的な証拠に基づき維持する。最低環境と文字コード出力の移行契約を確認した場合に解消を再評価する。

公式確認日2026-10-10 JST。[ECMAScript 2026のString.replace](https://tc39.es/ecma262/2026/multipage/text-processing.html#sec-string.prototype.replace)、[Clipboard API](https://w3c.github.io/clipboard-apis/#dom-clipboard-writetext)。Clipboardの非同期受け渡しとOSへの完了を区別する。Node24.21.0 LTS/22.22.2、TypeScript7.0.2、Playwright1.64.0、encoding-japanese2.2.0を保持。HTML構造とCSSは今回変更していない。

READMEとAGENTSにTSVの順序・引用・全量照合・計測の限界を追記。CIは既存のNode22/24 matrix内で3エンジンの特殊文字コピー/永続保存復元を追加する。静的検査・回帰・ブラウザ検査は追加コードにも適用し、旧APIの例外件数を増やさない。リモートCIは未実行。

## ③ ローカル時間と本番の状態

変更前の本体を保存し、各条件7回でコピー全文と保存復元を照合してから、実装前にtargets.jsonへ数値目標を記録した。全セル初回/反復は結果時間20%短縮（絶対164.56/178.48ms）、1列と描画機会は変更前中央値から15%超の悪化を避ける。最初の基準値と最終交互測定の変更前値が異なっても、目標を後から緩めない。

開始は実際のCtrl+C keydown、結果はstub writeTextへ全文を渡した時点。第2rAFは別の描画機会指標であり、GPU表示完了ではない。OSへのクリップボード書込み・実OSの入力待ち・INP・利用者の画面認識・本体の保存所要時間は未計測。全文と永続保存は別途照合する。

準備は初期化200ms、CSV取込、初期保存、選択確定。準備を除いた同じ定義で前後を交互に各7回実行し、毎回新しいcontextを使う。初回と反復を分け、他のCPU負荷の大きい試験を比較中に実行していない。条件: file:、Chrome154.0.8037.99、1440×900、日本語ロケール、Node24.21.0、Apple M4/32GB、100000行×20列の数値文字列。温度・電源状態・OS負荷・GC/JIT・実画面更新率は制御できない。

|Operation|Metric|Before median ms|After median ms|Reduction ms|Reduction %|Before range ms|After range ms|Runs before/after|Absolute target ms|Met|
|---|---|---:|---:|---:|---:|---|---|---|---:|---|
|all-first|resultMs|182.9|98.0|84.9|46.4%|121.2 - 259.8|76.1 - 147.8|7/7|164.56|True|
|all-first|frameOpportunityMs|188.9|113.0|75.9|40.2%|131.6 - 264.3|77.6 - 154.6|7/7|256.79|True|
|all-repeat|resultMs|202.2|110.0|92.2|45.6%|126.6 - 240.5|73.8 - 145.1|7/7|178.48|True|
|all-repeat|frameOpportunityMs|216.3|112.9|103.4|47.8%|128.0 - 246.3|75.3 - 147.4|7/7|266.68|True|
|column|resultMs|30.1|18.4|11.7|38.9%|20.8 - 35.9|15.2 - 25.0|7/7|45.42|True|
|column|frameOpportunityMs|33.0|30.2|2.8|8.5%|30.5 - 37.9|27.5 - 31.7|7/7|48.42|True|

All six observed ranges overlap. All absolute median targets were met; the stable improvement rate remains unconfirmed. Each of the seven paired trials was faster after the change. Result-time paired reductions: initial 45.1-153.9ms; repeated 50.4-130.5ms; column 4.0-11.8ms. This exploratory paired analysis is not a population P95 or a claim for every device.

短縮率は `(前−後)/前×100`。重なる範囲の差は改善未確認とする。別条件の中央値・実装途中版と最終版を混ぜない。本番は全条件の前後とも未計測で、短縮率は算出不可。

## ④ 連続操作・全量の正しさ

初回・反復の200万セル、1列の10万セルをSHA-256で期待TSVの全量と照合し、選択縮小後の編集受付と再読込後の元CSVを確認した。行数だけの確認や画面外セルの除外は行わない。特殊文字試験は3ブラウザ各500行×20列、前後各1回の機能確認であり、大容量性能の標本数へ加算しない。

空セル、タブ、CRLF、引用符、Unicode、NULをファイルで取り込み、取込ウィザードのUTF-8・区切り・ヘッダー・既存警告確認を通る。textareaによるCRLFの正規化を避ける。既存のdetectNewlineSettingFromTextが引用内CRLFも検出してCSV出力をCRLFへ設定するため、その出力設定も全量で照合する。可視行の並び順、飛び飛びの列、null/数値/boolean/孤立surrogate、単一空セル、非表示だけの選択、Clipboardのfalse/例外、文字列変換失敗は回帰で検証する。

|Operation|Trials before/after|Long Tasks before/after|Before maximum ms|After maximum ms|
|---|---|---|---:|---:|
|all-first|7/7|7/7|260|148|
|all-repeat|7/7|7/7|240|145|
|column|7/7|0/0|none observed|none observed|

Each full-copy condition still had seven tasks exceeding 50ms before and after. Maximum observed duration fell, but main-thread pauses remain. This is whole-task observation, not CPU self-time for the quoting helper.

Long Tasksは50ms以上のtaskの限定観測であり、件数0でも停止や入力待ちゼロを意味しない。移動・scroll・120Hz・低性能実機・長時間メモリ・GPU描画の新しい計測は今回実施していない。同期の全量TSV生成は残り、Worker化・分割時の同時編集とClipboard user activationを維持する必要がある。現在の結果から滑らかさの全面達成を報告しない。

## ⑤ 根拠・試験・残件

再現は tests/localcsv-copy-browser.test.mjs（LOCALCSV_COPY_COMPARE_ROOT、ROWS/RUNS、OUTPUT）と tests/localcsv-copy-summary.mjs。before-source.html.gz / before.json / targets.json / paired.json / summary.json と各logへソース・日時・全標本を保存した。

Long Tasksの監視をkeydown内で開始した途中計測（keydown-observer-paired.*）は開始済みtaskを見落とすため、停止件数の最終判断には使用しない。最終paired.jsonはキーイベント開始前から監視し、終了時のtakeRecordsも回収する。結果時刻の定義は維持した。

初回はキー監視がControl単体で解除され時間を得られなかった（invalid-key-observer.*）。修正後の変更前7回を数値目標の基準とした。途中版は例外処理を調整する前の記録（intermediate-*）。特殊文字試験の失敗ログは、標準ファイル選択への切替え、既存警告の確認、既存CRLF出力の期待値修正を記録して保持する。製品の取込・警告・出力規則や試験の許容差を変えて通していない。

Node22/24の回帰、Node24のbuild、55管理ファイルの静的検査、3ブラウザの総合試験が成功した。総合試験は統合、品質111件、ユーザビリティ33件、標準/代替6条件を含む。特殊文字コピーと保存後の復元も3ブラウザで前後各1回成功し、console/page errorは0件。git diff --checkも成功した。version.jsonとverification.jsonに識別と検証結果を記録し、未公開の8ファイル配布ZIPの全実バイトをmanifestのhashと照合した。本体の配信サイズは変更前から98バイト増であり、配信量削減とは報告しない。

原因の対応: 全セルの置換・選択値の全行中間配列 → 引用が必要な時だけ置換・行文字列を直接生成 → 変換と配列保持を削減 → 中央値・組ごとの差・絶対目標を実測 → 全セル・順序・空セル・特殊文字・エラー・永続保存を照合。CPUとheapの原因分離測定は未実施。

有望な残件は、クリップボードの実OS完了、低性能実機の停止時間、同時編集を保持した重いTSVの分割・Worker化、全コードの意味監査、全操作の計測/目標、最低ブラウザ、通常の本番反映・配信hash・復旧・本番再計測。通常公開先の確認を待ち、未知のホスティングを新設したりmain更新を通常リリースと仮定したりしていない。独立して実施したローカル実装/検証と、この未完了工程を区別する。
