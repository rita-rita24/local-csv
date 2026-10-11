# 選択コピーの行取得・列整列の整理と公開配布物の再検証

## ① 実施結果

2026-10-11 JST。ユーザー指定の通常の本番反映はGitHub mainへのpushであり、単体HTMLの公開配布が対象。GitHub Actionsは無効のまま維持し、ワークフローは追加しない。反映コミットと再取得・公開後測定の結果はpublished-after.json / published-after-measurement.jsonと、本報告の公開後欄へ記録する。

対象は本体の選択コピー1経路（全量初回、全量反復、1列の3条件）と、紹介ページの埋め込み配布HTML。セルごとの同じ行データの取得、既に昇順の列の再ソート、セル変換用callbackを減らした。HTMLの情報量・CSS・表示設計・Clipboard APIと代替経路は変更せず、本文全量・行順・列順・単一空セルの引用・履歴・保存復元を維持する。README・開発規約・ローカル検査も更新した。

依頼全体の完了とは扱わない。同期コピーの停止、全操作の個別性能、長時間メモリ、最低対応ブラウザ/WebView、実OS ClipboardとGPU描画の完了、全実装の意味・アクセシビリティ監査は残る。本報告の測定はGitHubから取得した配布物をfile:で開く利用経路で、未特定のホストWebサイトの性能とは別である。

## ② コードの現代化

|領域・件数の単位|以前の処理|今回の処理|前件数|移行|必要例外|未対応|根拠・範囲|
|---|---|---|---:|---:|---:|---:|---|
|JS・コピー経路|列選択を常にsort|昇順の整数なら順序維持、その他は同じ数値sort|1|1|0|0|_getSelectedColumnsInOrder、copySelectedCells|
|JS・コピー経路|セルごとにstate.data[row]、変換callback|行ごとに取得、同じquote helperで固定長配列へ変換|1|1|0|0|copySelectedCells。全値・列数を維持|
|Node・集計器|結果ディレクトリが固定|任意ディレクトリ引数、既定の動作も維持。未測定欄はhostedWebsiteへ明確化|1|1|0|0|localcsv-copy-summary.mjs。履歴を上書きしない|
|ローカル静的検査|Actions追加禁止を文書だけに記載|workflow YAML再混入を失敗として検出|新設|新設1|0|0|localcsv-static.test.mjs、AGENTS.md|
|製品互換API・直接参照|execCommand 2、keyCode/which 2|従来の限定した代替/IME判定を保持|4|0|4|0※|modern/REPORT.mdの理由・解消条件を継続|

※定義した直接API参照の説明なし残件がないという意味で、全旧式実装ゼロの宣言ではない。基本的なfor・Array・Map・Set・sortは現行標準として保持する。今回の対象は旧API廃止ではなく、必要な取得・整列・引用の責務を明確にして不要な繰り返しを減らす変更。新しい実行時依存・ビルド工程・通信・計測コードを製品へ追加していない。

2026-10-11確認の[ECMA-262公式公開版](https://ecma-international.org/publications-and-standards/standards/ecma-262/)は2026年6月の第17版。既存環境でも使用済みのconst/for/Array/Number.isIntegerを使う。tc39.esの2027草案を公開済み2026仕様として扱わない。Node22.22.2/24.21.0、TypeScript7.0.2、Playwright1.64.0、@babel/parser8.0.7、埋め込みencoding-japanese2.2.0は維持する。追加コードも同じAST・Worker・旧API参照・型/生成一致検査へ含める。外部vendorと生成JS、過去のsnapshotは別分類で、生成済みJSへ直接パッチしない。

## ③ 時間計測

変更前は公開コミット3ebc1cde0e5b0974d2d6a22feb04b725696ff19aの[配布HTML](https://raw.githubusercontent.com/rita-rita24/local-csv/3ebc1cde0e5b0974d2d6a22feb04b725696ff19a/local-csv.html)を取得し、全実バイトをローカルHEADと照合した。変更前7回を完了後、初回/反復の結果時間20%短縮、その他の中央値15%超悪化なしという数値目標をtargets.jsonへ保存してから製品を変更した。初期基準中央値は302.9 / 305.7 / 84.9ms、全量結果の絶対目標は242.32 / 244.56ms。後の標本へ目標を合わせ直さない。

その後、旧公開配布物と変更候補を前後交互に各5回実行した。10万行×20列、全量200万セル/1列10万セル、Chrome154.0.8037.99、Node24.21.0、Apple M4/32GB、1440×900、日本語、毎回新しいブラウザcontext。準備のCSV取込・選択確定・初期保存を除き、実際のCtrl+C keydownからstub writeTextへ全文を渡す時点までを結果時間とする。第2rAFを別の描画機会とする。OS書込み完了・GPU表示・INPではない。保存は全量復元の正しさを照合するが、保存時間は新たに計測していない。

|操作|指標|前中央値ms|後中央値ms|短縮ms|観測短縮率|前範囲ms|後範囲ms|回数|絶対目標ms|判定|
|---|---|---:|---:|---:|---:|---|---|---|---:|---|
|all-first|resultMs|329.4|213.6|115.8|35.2%|298.2–457.8|172.6–220.8|5/5|242.32|達成|
|all-first|frameOpportunityMs|345.8|219.6|126.2|36.5%|306.4–466.1|186.7–230.1|5/5|355.92|達成|
|all-repeat|resultMs|333.4|241.8|91.6|27.5%|301.6–362.5|143.5–275.1|5/5|244.56|達成|
|all-repeat|frameOpportunityMs|371.7|248.1|123.6|33.3%|313.9–385.5|161.5–309.7|5/5|365.24|達成|
|column|resultMs|99.0|58.9|40.1|40.5%|95.3–173.6|26.1–85.9|5/5|97.63|達成|
|column|frameOpportunityMs|107.3|73.4|33.9|31.6%|102.5–179.2|32.0–110.2|5/5|117.18|達成|

短縮率は（前−後）/前×100。各5ペアすべてで結果時間が短かった。初回・反復・1列の結果と全量の描画機会では観測範囲が分離し、1列の描画機会は重なる。これはこの標本の結果であり、安定した端末共通の改善率ではない。OS全体の負荷は制御できず、測定途中のload averageは127.49/108.77/61.60。以前の98msなど別日の結果と直接比較・平均しない。温度、電源、GC/JIT、他作業の影響が残る。今回は自分でCPU負荷の高い別の検証を同時実行していない。

公開後はGitHub mainへ通常pushし、固定コミットの本体・LPを再取得してハッシュを照合し、配布物をfile:で同じ3条件・各5回計測する。公開後は旧・新の公開配布物を交互に各5回測定し、公開前の候補測定へ合算しない。初期7回との時刻の違いを改善率へ混ぜず、同じ測定期間の前後差を別表へ記録する。OS負荷を完全に制御した測定ではなく、コードだけによる安定した改善率とは断定しない。ホストWebサイトの応答・取得所要時間は未計測。

## ④ 連続操作と停止

[Long Tasks仕様](https://www.w3.org/TR/longtasks/)の50msを超えるtaskを、対応するChromeでkeydown開始前から監視し終了時takeRecordsも回収する。草案である文書の新規機能を製品へ採用せず、検証環境で実装されている観測に限定する。

|条件・各5回|50ms超の件数 前→後|観測最大ms 前→後|判断|
|---|---|---|---|
|全量初回|5→5|458→221|短くなったが停止は残る|
|全量反復|5→5|363→275|短くなったが停止は残る|
|1列|5→4|174→86|0件になったとは扱わない|

全文SHA-256を独立した期待TSVと照合し、画面外の選択セルを含む全量、可視順、昇順・異なる列順、疎な選択、単一空セル、タブ/引用符/CRLF/Unicode/NULを維持する。通常出力の元値を削らない。選択縮小後の編集受付と、再読込後の全CSVも照合する。保存後のヘッダー/引用/改行設定を含む比較であり、件数だけの確認ではない。Clipboard false/例外、変換例外、未確定入力のcommitも回帰に含める。

ドラッグ・実OS入力追従・120Hz実機・長時間メモリの新しい計測は今回行っていない。同期で巨大なTSVを作る負荷が残る。分割/Worker化は、同時編集のsnapshot・値と履歴・最後の入力・Clipboard user activationとfallbackを維持して検証する必要があるため、未実施候補として残す。

## ⑤ 検証・公開後の記録・残件

before.jsonは公開前配布物の各7回、paired.jsonは候補と交互の各5回。targets.jsonは変更前の数値目標、summary.jsonは交互測定の集計、published-before.jsonは取得URL/コミット/hash。source gzip、product.diff、version.json、inventory.json、各ログを保持する。再現はlocalcsv-copy-browser.test.mjsのLOCALCSV_COPY_ROOT / LOCALCSV_COPY_COMPARE_ROOT / LOCALCSV_COPY_RUNS / LOCALCSV_COPY_OUTPUTと、`node tests/localcsv-copy-summary.mjs tests/performance-results/copy-row-access`。過去のcopy/selection/modern/source-audit等の履歴は更新しない。

総合テストの初回は2000行の貼り付けinput.fillが15秒でタイムアウトした。browser-initial-failure.logを保持し、コンソールエラー0件でも全成功とは扱わない。再試行では統合テスト3ブラウザが通ったが、品質検査の2000行貼り付けでも同じタイムアウトが発生した。入力は全量挿入済みで、disabled/readOnly/inertなし。失敗シナリオ名と状態の診断、および名前指定の単独実行を検査へ追加した。旧公開版の単独実行と、変更版の単独再試行3ブラウザは通った。製品・入力経路・15秒の制限・判定は変えていない。失敗原因をOS負荷や製品の不具合と断定せず、失敗ログも保持する。

最低対応ブラウザ/WebView、全画面の全操作についての初期反応/確定/保存の前後計測、OS ClipboardとGPU表示、完全なHTML/CSSソース検証・アクセシビリティ、長時間メモリは依然未完了。今回の範囲はコピー3条件で、全操作の達成率へ拡大しない。GitHub Actionsの無効化・削除は維持し、検査はローカルで行う。

最終の `npm run test:browser` は終了コード0。統合3ブラウザ、品質111ケース、操作性33ケース、互換6構成、DOM/CSS6構成が通った。標準PlaywrightブラウザはChromium156.0.8078.4 / Firefox157.0 / WebKit27.2で、性能比較に使用した実Chrome154とは別。Node22.22.2のbuild/static/test、Node24.21.0のbuild/static/AST・回帰、特殊文字のコピー3ブラウザも通った。詳細はverification.jsonと各ログ。失敗した試行は成功率から消さず残し、タイムアウトの根本原因は未確定とする。

### 公開後

2026-10-11 21:05 JST頃、[fe8ea13](https://github.com/rita-rita24/local-csv/commit/fe8ea13a470ae10ed2a30db9a15f71d640cba3ec)をmainへ通常pushした。本体と紹介ページを固定コミットから再取得し、実バイト・SHA-256の一致を確認した。埋め込みHTMLも静的検査で一致。変更前3ebc1cdと変更後fe8ea13の公開配布物をChrome154上で前後交互各5回実行し、出力全文・選択縮小・保存後の再読込も一致、console/page errorsは0。検証中に別の検査をこのタスクで起動していない。

取得と測定のメタデータはpublished-after.json / published-after-measurement.json、全標本はpublished-comparison/paired.json。再現はLOCALCSV_COPY_ROOTに取得した新配布物、LOCALCSV_COPY_COMPARE_ROOTに旧配布物を指定し、LOCALCSV_COPY_RUNS=5。集計は `node tests/localcsv-copy-summary.mjs tests/performance-results/copy-row-access/published-comparison`。結果のhostedWebsite欄は未測定のWebサイトを意味し、GitHub配布物の端末上測定とは別である。

|公開配布物・各5回|指標|旧中央値ms|新中央値ms|観測短縮率|旧範囲ms|新範囲ms|範囲重複|
|---|---|---:|---:|---:|---|---|---|
|all-first|resultMs|82.0|59.2|27.8%|79.6–86.1|56.9–61.0|なし|
|all-first|frameOpportunityMs|83.6|60.9|27.2%|81.1–87.8|58.5–63.0|なし|
|all-repeat|resultMs|87.5|64.1|26.7%|83.5–104.5|59.0–86.5|あり|
|all-repeat|frameOpportunityMs|89.0|81.7|8.2%|85.0–114.1|60.6–98.8|あり|
|column|resultMs|19.1|15.0|21.5%|18.8–22.4|12.7–18.7|なし|
|column|frameOpportunityMs|30.6|31.5|-2.9%|29.9–31.7|30.2–32.1|あり|

結果時間の観測短縮は初回27.8%、反復26.7%、1列21.5%。初回/1列の範囲は分離、反復は重なる。第2rAFは初回27.2%、反復8.2%短縮、1列は2.9%遅くなり、後2条件の範囲は重なる。すべて改善したとは扱わない。初期の固定絶対目標6指標は満たしたが、測定前OS load averageが6.83/11.73/38.61まで下がっており、初期高負荷の目標に対する達成だけで安定性能を保証しない。公開前の候補測定値を合算しない。端末間・温度・長時間・実OS Clipboard/GPU等は未確認。

公開配布物のLong Tasksは初回5→5件、最大86→61ms、反復5→5件、最大104→86ms、1列0→0件。全量に50ms超の停止が残る。GitHub読取APIでもActions enabled=false、追跡workflowファイル0を確認し、actions-status.jsonへ記録した。Actionsを追加・再有効化していない。最終の測定と報告のみの追記も通常pushし、本体・LPの測定済みハッシュが維持されることを確認する。
