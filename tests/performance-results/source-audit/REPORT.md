# ソース全体のAST監査とダウンロード失敗時の解放

## ① 実施結果

2026-10-10 JSTのローカル作業。package 1.2.6、Git HEAD 1e2fc63上の未コミット作業版。既存の作業途中の変更を保持した。本番URL・通常の公開手順・復旧手順は未特定で、本番未反映・未検証・未計測。以前に確認を依頼したこれらの情報と最低対応ブラウザ/WebViewの回答は未取得。本番の反映バージョン・日時は存在しない。version.jsonのハッシュが今回の版識別で、前回copyディレクトリの版とは異なる。

本体HTMLと紹介ページの2文書を対象に、既存の静的検査を構文木解析へ補強した。59ファイルの一覧には6個のOSメタデータも含む。33スクリプト単位のうち32をAST解析し、1単位は外部encoding-japaneseを既知ハッシュで別扱いにした。さらに生成する3 Workerを復元・解析した。現在の管理形式はHTML、CSS、JavaScript、TypeScript、JSON/JSONC、YAML、Markdown、CSV、フォント・画像など。バックエンド言語・SQL・DBマイグレーションは見つからない。全ファイルの用途別一覧と操作・代表ケースは既存のmodern/inventoryとtests/QA.mdに併記してあり、今回のファイル一覧はafter.jsonで全実バイトを記録する。今回の故障注入は2ダウンロード経路×3条件で、各条件5回。

文字列スキャナ1実装、そのコードを切り出して複製していた2検証スクリプト、関数境界の文字列切り出し3箇所を共通のAST抽出へ移行した。本体と紹介ページのダウンロード関数2箇所では、開始失敗時の一時リンク・未使用URLの解放を修正した。今回の変更に速度改善率を付けない。全操作の前後測定、全実装の意味・アクセシビリティ監査、最低対応環境、本番工程は未完了であり、依頼全体の完了とは扱わない。

## ② 現代化の結果

件数は「実装1個」「呼出経路1箇所」「直接API参照1箇所」で区別する。前回までの移行を今回の新規件数に加えず、生成JSは生成元との二重計上をしない。

|言語・領域|以前の方法|採用する方法|前件数|今回移行|必要例外|未対応|根拠・範囲|
|---|---|---|---:|---:|---:|---:|---|
|JS・検証ヘルパー|手書きの文字列・括弧走査|正式parserのAST範囲からconst宣言を抽出|1|1|0|0|regressionの約90行の独自走査を共通moduleへ置換|
|JS・検証ヘルパー利用|回帰ファイルの文字列をVMへ読み込み、走査器を複製|共通moduleを直接import|2|2|0|0|round2-microbench、encoding-detection|
|JS・検証対象抽出|indexOf/sliceで開始・終了境界を推測|同じAST抽出|3|3|0|0|regressionのmatcher/TSV、parser-equivalence|
|JS/TS・リソース|click成功を前提に後続行でリンクを除去|try/finally、開始失敗時は本体URLを即時解放|2|2|0|0|downloadPreparedBlob、_triggerDownloadの2関数|
|JS・Clipboard|document.execCommand(copy)|Async Clipboard優先、既存fallbackを限定|2|0|2|0※|本体・LPの互換経路。今回増加なし|
|JS・IME|keyCode/whichの229|isComposing優先、共有境界判定を保持|2|0|2|0※|本体の1関数内2プロパティ参照|
|HTML/CSS|有限の旧要素・表示属性、ID参照、レイヤー違反|初期DOM・templateとブラウザCSSOMで検査|検査を新設|置換なし|対象内検出なし|網羅検証は未完了|CSSを変更してゼロにしたものではない|

※この0は定義した直接参照のうち説明のない残件がないという意味で、コード全体の旧式実装ゼロを意味しない。AST上の直接旧式参照は計10件: 手書き製品4、生成JS1、テスト用互換mock5。mockは失敗・代替経路の検証に必要であり、製品の移行件数へ加算しない。製品のvar/document.write/substr/readAsBinaryString/attachEvent/arguments.calleeは定義した直接検出ルールでは検出されない。動的な別名や文字列経由の全参照を証明したものではない。

本体は53,449 ASTノード、971関数、232リソース関連呼出。Workerはparse/search/filterの3種類、各551/1,213/870ノード、4/15/8関数。LP TSは1,607ノード、27関数、14リソース関連呼出。関数数やcreate/revoke件数の一致はリソース寿命の正しさの証明には使用しない。

採用環境はNode22.22.2/24.21.0 LTS、TypeScript7.0.2、Playwright1.64.0、開発時の@babel/parser8.0.7。parserのNode条件は22系列22.18以上、または24.11以上。依存とlockを一致させ、提案段階の構文pluginは有効にしない。実行時APIの対応はparser成功と別に検査する。製品にparserや新しいランタイム依存を追加せず、既存の単体HTML運用と既存のTSビルドを維持する。encoding-japanese2.2.0は前回の39ケースで新候補との10差分があったため継続し、upstreamコードを直接書き換えない。

公式根拠の確認日: 2026-10-10 JST。

- [Babel parserの公式API](https://babeljs.io/docs/babel-parser): AST、TypeScript解析、開始位置の扱い。コメント・正規表現・入れ子テンプレート・複数宣言を自作字句走査で推測しない。正式パッケージのversion/enginesはnpmレジストリで確認しdependency-install.logとlockへ保存した。
- [Microsoft Compiler API資料](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API): 従来APIは6以前向けで7.1には別のAPIを予定。実際に7.0.2ではcreateSourceFile/forEachChildが存在しないため、TSを旧版へ戻さず開発専用parserを採用した。
- [HTML Living Standard・旧式機能](https://html.spec.whatwg.org/multipage/obsolete.html): 要素/表示属性の検査基準。今回の有限リストは全conformance checkerの代替ではない。
- [HTML・ダウンロード](https://html.spec.whatwg.org/multipage/links.html#downloading-resources)、[File API・URL lifetime](https://www.w3.org/TR/FileAPI/#lifeTime): 既存のBlob URLの所有期間を維持し、未使用URLを解放する。File API文書自体はWorking Draftで、提案中の追加APIを安定APIとして導入しない。長く実装されているcreate/revokeObjectURLとfinallyの使用に限定する。

互換例外の実際の失敗経路と解消条件はmodern/REPORT.mdを継続する。Clipboardはfile:利用・API不在/拒否時の代替、IMEは変換確定境界の229を理由とし、最低対応環境の確定と実機で同等動作を検証できるまで削除しない。

READMEとAGENTSを更新し、npm testに故障解放・既存parser同等性・文字コード比較、test:staticにAST/Worker解析、test:browserにDOM/CSS監査を追加した。既存Node22/24のCIが同じコマンドを実行する。リモートCIは未実行。

## ③ 本番・ローカルの時間

|環境・文書|操作・条件|指標|前中央値ms|後中央値ms|短縮ms|短縮率|前/後回数|判断|
|---|---|---|---|---|---|---|---|---|
|本番・URL未特定|全操作|初期反応/結果/保存/表示|未計測|未計測|算出不可|算出不可|0/0|通常公開・復旧手順が未特定|
|今回のローカル版|全操作|同じ指標|今回未計測|今回未計測|算出不可|算出不可|0/0|機能検証の単発時間を前後性能比較へ流用しない|

前回copy/REPORT.mdでは10万行×20列、各7回の実キーイベントからClipboard APIへの全量受け渡しを計測した。初回182.9→98.0ms、反復202.2→110.0ms、1列30.1→18.4msで中央値目標を満たしたが、観測範囲が重なり安定した短縮率は未確認。今回の版にはさらに解放処理が加わり、これらを今回版や本番の再計測として扱わない。LP/search/selectionの履歴も各reportの版・環境・未達を保持する。

## ④ 連続操作・表示・リソース

|文書・経路|故障条件・区間|指標|変更前|変更後|試行数前/後|評価|
|---|---|---|---:|---:|---|---|
|本体・ダウンロード|click例外を5回連続|残存リンク個数|5|0|5/5|同じ例外を伝播し成功toastなし|
|本体・ダウンロード|click例外を5回連続|残存Blob URL個数|5|0|5/5|未使用URLを直ちに解放|
|本体・ダウンロード|append例外を5回連続|残存Blob URL個数|5|0|5/5|リンク追加前の失敗も解放|
|LP・ダウンロード|click例外を5回連続|残存リンク個数|5|0|5/5|LPの再利用URLを誤ってrevokeしない|
|全連続入力・ドラッグ等|本番/低性能端末|追従・停止/最終保存時間|今回未計測|今回未計測|0/0|全面達成とは報告しない|

故障はDOM/URLの注入であり、OSで5回実際に失敗した測定やヒープ計測ではない。正常時5回の本体URLは3秒タイマーまで保持し、その実行後0個。LPのcache URLはLPの所有物として保持する。Workerのterminate/revoke、pending message・timeoutの解放、書込み失敗時のabort、ページ寿命のObserverとMessageChannel、tooltipの一度だけのリスナー登録を既存の回帰と併せて確認した。構文木のリソース表は寿命の包括証明ではなく、未測定の長時間メモリが残る。

3ブラウザの初期DOM・templateで重複ID、label/aria参照、有限の旧要素と表示属性、root colorScheme、CSSレイヤーを確認する。file:で外部CSSのCSSOMがSecurityErrorとなる場合は同一ファイルのソースを未適用CSSStyleSheetへ解析して確認し、例外を単に無視しない。動的DOM全状態・完全なHTML/CSS検証・全アクセシビリティの証明には使用しない。CSSOMが捨てる不正なソース宣言は別途未検査。今回HTMLレイアウトとCSSの仕様は変更していない。

## ⑤ 根拠・再現・残件

実行: npm run build、npm run test:static、npm test、npm run test:browser。CIはUbuntu上のNode22/24、ローカルはApple M4/32GB/macOS、file:、Chromium154.0.8037.99・Firefox155.0・WebKit27.2。browser.logとverification.jsonに最終成否を記録した。変更後の3ブラウザ統合、品質111条件、ユーザビリティ33条件、標準/代替6条件、DOM/CSS6条件は全て成功し、console/page errorは0件。Node22/24の静的・回帰・同等性検証とNode24 buildも成功した。git diff --checkを実行し、8ファイルの未公開配布ZIPを全バイトのSHA-256と照合した。本体HTMLは今回の開始版から238バイト増で、配信量削減とは報告しない。共通抽出へ移行したround2-microbenchも別ファイルへsmoke実行し、28標本の前後の長さ・バイト数が一致した。過去のmicrobench.jsonを上書きせず、このsmokeを今回製品の速度評価へ流用しない。正常ダウンロード・配布HTML一致は実ブラウザ、失敗解放は実関数の故障注入を分ける。

Node22/24でregression、AST検出/曖昧性の拒否、ダウンロード失敗解放、CSV解析1万ケース、文字コード24,576 byte/alignmentケース・1万ランダム・1万安全ASCII・全符号化/BOM境界を検査する。ASTは別名と動的な算出キーを記録し、289動的コード生成/評価呼出を確認した。関数式として渡すevaluate等は本体を走査するが、VM文字列などを全て再構築したわけではなく、該当検証スクリプトの実行と区別する。検査ルールは旧式APIの有限集合であり、全意味の正しさや全旧式実装ゼロを保証しない。Workerの未知の補間・曖昧な同名bindingは検査を失敗させる。

before.jsonは最初のAST一覧作成時点であり、新しい監査moduleの作成後の一覧。完全な作業開始前の全ファイルsnapshotとは呼ばない。before-source/main/regression/package*.gzは今回の該当実装変更前に保存した原本。phase.diff、after.json、各Nodeとbrowser log、version/verification/manifestに根拠を残す。fragment-extraction-failure、markup-file-cssom-failure、markup-theme-initialization-failureは検証作成途中の失敗を保持する。非同期初期化の完了を待つよう修正し、製品のテーマを変えて検査を通したものではない。

除外: .gitの履歴、node_modulesの外部依存、tests/performance-resultsの履歴と不採用候補。後者は製品・現在のテストの生成元として使用される基準snapshotも含み、ハッシュを変えず既存同等性テストで利用する。外部encoding-japaneseは既知版/ハッシュ/出力比較を別管理。生成public/js/main.jsは解析したうえでTS生成一致を検査し、修正数はTS側だけに計上する。Base64配布HTMLは独立の手編集ソースとして扱わず、本体の全バイト一致を検査する。

残件: 最低対応ブラウザ/WebView、file:の実OS Clipboard、長時間メモリ、低性能実機とタッチ、全操作の初期反応/確定/保存を分けた前後測定、意味とアクセシビリティの網羅監査、完全なHTML/CSSソース検証、リモートCI、通常の本番公開・復旧・変更前本番計測と再計測。本番URL・既存の公開/復旧手順が必要。新規の公開経路を推測して作らない。コピー全文の同期生成では50ms超の停止が残り、次の候補は同時編集・順序・Clipboard activationを維持した分割/Worker化である。効果はまだ推定も数値化していない。
