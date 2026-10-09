# 2026-10-10 追加の性能改善・現代化監査

後続の検索共通化・配布リンク修正・総合再検証は [連続検索の追加報告](../search-refactor/REPORT.md) に記録した。この報告のhash・比較値は当時の版を識別し、後続版の計測値へ流用しない。

## ① 実施結果

ローカルの実装と検証を実施した。**依頼全体は未完了。本番未反映・本番未計測、最低対応環境未特定、全操作の個別性能目標の達成は未確認**である。全廃止・全面完了とは報告しない。

- 対象はLocalCSVのルート全体。HTML内のCSS/JavaScript/Worker文字列、紹介ページのTypeScriptと生成JS、CSS、設定、既存・追加のNode試験、CSVサンプルを一覧化した。バックエンド、SQL、DB移行、サーバー側ランタイムは存在しない。
- 入口は `index.html` と `local-csv.html` の2つ。静的マークアップには13のダイアログ/メニュー状態、140の操作要素がある。140はボタン・リンク・入力欄・同じ操作の別入口を含む数であり、独立した操作数ではない。動的セル・ショートカット・連続操作・背景処理は下表で別に扱う。
- 最終版の識別は `final-version.json`。11画面/状態群×3データ条件の63指標行を比較し、LPと検索再確認を含む最終集計は69行・各前後7回。全面の意味解析・全操作の性能検証と、この調査/実測範囲を区別する。
- 開始時の大量の未コミット変更を保持した。Git HEADは `1e2fc63`、packageの版は `1.2.6`。今回の比較元はHEADではなく、着手時の作業ツリーである。コードの識別には各JSONのハッシュと `baseline-source.tar.gz` を使う。
- 本番URL・配布先・通常リリース手順は未特定。GitHub接続で確認した正規リポジトリは `rita-rita24/local-csv`。2026-10-10確認時、`has_pages: false`、`homepage: null`。ローカルにデプロイ設定・既存CIはなく、GitHub CLIは未認証だった。接続先への書込み権限はあるため、「権限がないから」とは扱わない。公開先が未特定なので、既存の通常リリースと確認できる反映操作は実施していない。
- 復旧は保存した変更前ソースへの復帰を想定する。本番配布先とキャッシュ失効方法が不明なので、本番の復旧手順も未検証。重大なデータ差・console error・明確な性能悪化を復旧判断の対象とする。

ファイル一覧・サイズ・ハッシュは `inventory.json`、HTML操作要素と関連ソース位置は `controls.json`。両者は静的な目録であり、全コードの意味解析や全操作の実測を完了した証明ではない。現行ソースの宣言位置は `function-map.txt` に残した。

## ② コードの現代化

確認日: 2026-10-10 JST。ソースに安定した標準APIを採用し、実行時の存在確認と従来経路を併設した。ES2022の配信構文は維持する。TypeScriptの型ライブラリ名を変更しただけで移行済みとは扱わない。

|領域・単位|旧実装|採用方法|変更前|移行済み|必要な例外|未対応|根拠・範囲|
|---|---|---|---:|---:|---:|---:|---|
|LP復号・実装箇所|atob→文字ごとのUint8Array変換|Uint8Array.fromBase64→TextDecoder|1|1|1分岐|0|src/main.ts。生成JSは既存コンパイラーから出力|
|検索・実装箇所|独自の正規表現エスケープ|RegExp.escape|1|1|1分岐|0|通常処理とWorkerへ同じ関数を渡す|
|コピー・API呼出箇所|execCommand(copy)|Async Clipboardを優先、fallbackを限定|2|0（優先経路は元から実装済み）|2|0|本体とLP。LPのfocus/cursor/Range復帰を修正|
|IME・プロパティ参照|keyCode/whichの229判定|isComposingを優先|2|0（優先経路は元から実装済み）|2|0|1つの共有判定。日本語変換境界の互換経路|
|開発依存・パッケージ|TypeScript 5.9.3|7.0.2固定|1|1|0|0|packageとlockを整合、ビルド・設定例を型検査|
|開発試験・環境|環境外のPlaywrightに依存|1.64.0固定、環境変数による既存指定も維持|1|1|0|0|配布HTMLの依存は増やさない|
|設定例・ファイル|755行の独立・矛盾するTS5設定例|実設定をextends、noEmitで検査|1|1|0|0|tsconfig.example.jsonc|
|埋め込み依存・ライブラリ|encoding-japanese 2.2.0|2.4.0候補を比較し2.2.0を保持|1|0|1|0|39条件中10条件で入出力・判定が変わる|

移行済み箇所の中にも必要な代替分岐があるので、例外列は移行済み列と重複する。外部のminifiedライブラリの `var` 等は管理対象の手書きソースの残件に数えない。生成物を手で現代化していない。基本的なループ、条件分岐、Promise、イベント、`fileURLToPath`、`atob` 自体など、現在も有効な標準APIは導入年だけで禁止しない。

採用基準と公式根拠:

- [ECMAScript 2026・Uint8Array.fromBase64](https://tc39.es/ecma262/2026/multipage/indexed-collections.html#sec-uint8array.frombase64)、[ECMAScript 2026・RegExp.escape](https://tc39.es/ecma262/2026/multipage/text-processing.html#sec-regexp.escape)。公開済み仕様を参照し、翌年の草案と区別した。対応状況は[Base64 APIのブラウザ資料](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/fromBase64)、[RegExp.escapeのブラウザ資料](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/escape)も確認。新しいAPIがない環境で従来の入出力を保つ。
- [HTML Living Standard・dialog](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element)。LPの既存native dialogを維持。本体の既存ARIA・focus・keyboard処理は回帰検証した。全モーダルをnative dialogへ置換したとは扱わない。
- [CSS Cascade Level 5](https://drafts.csswg.org/css-cascade-5/#layering)、[CSS Nesting](https://drafts.csswg.org/css-nesting-1/)。既存のreset→base→component→utility、ネスト、oklchを維持。新しい狭幅ルールもcomponent layer内。CSSOMでレイヤー外のセレクターと重複IDを検査した。新しい表現機能を目的なしに追加していない。
- [TypeScript 7正式公開](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)、[TSConfig公式資料](https://www.typescriptlang.org/tsconfig/)。npm公式レジストリのlatest=7.0.2を確認し採用。noEmitOnError、erasableSyntaxOnly、noUncheckedIndexedAccess、exactOptionalPropertyTypesを有効化。`ESNext.TypedArrays` は当該標準APIの型のためだけに使用し、実行時確認も実装した。
- [Clipboard API](https://www.w3.org/TR/clipboard-apis/)。非secure環境や権限拒否があるローカル配布を維持するため、限定したcopy fallbackは残す。
- [encoding.js 2.4.0の公式変更記録](https://github.com/polygonplanet/encoding.js/releases/tag/2.4.0)。旧版と `〜` のEUC-JP出力は `[143,161,193]`→`[161,193]` に変わる。SJIS出力、¢/£、不正SJISの判定にも差がある。ユーザーの既存入出力・警告保持条件のため無条件更新を見送った。解消には、CP932/JIS別名の変換・警告について新旧差を許容する移行方針が必要。

実行した開発環境はNode 22.22.2、npm 10.9.7。静的HTMLなので本番のNode/TS実行版は該当しない。推奨環境はREADMEの現行Chrome/Edge/Firefox/Safari。最低版・組織WebViewは未指定で、最小環境を検証済みとは報告しない。Playwright WebKitは実機Safariと同一とは扱わない。

再混入防止: `npm run test:static` は現行の.mjs/.jsの構文、アプリ内script構文、限定した旧APIの許可件数、依存manifestのハッシュ、package/lock一致、TypeScript設定例、生成JSの再生成一致を検査する。簡易パターン検査のため、完全なAST・型・アクセシビリティ監査ではない。`.git`、`node_modules`、過去の計測証拠を除外した理由を記録し、既存アプリを一括除外しない。`.github/workflows/verify.yml` に型・静的・回帰・3ブラウザ・pointer/yield試験を組み込んだ。**リモートCIは未実行**。AGENTS.mdに同じ検査手順と例外のレビュー条件を追記した。

## ③ 時間の比較

本番は全項目が変更前/変更後とも未計測、短縮率算出不可。ローカル値を本番値へ転記しない。

ローカルの最終集計は `summary.md` の69指標行を参照。生データは `paired-download-final.json`、`paired-panels.json`、`paired-search-recheck.json`。`node tests/localcsv-modern-summary.mjs` で再集計できる。時間の短縮率は `(前−後)/前×100`、中央値同士で比較する。改善が確認できない場合は未確認とする。

|画面・条件|指標|前中央値ms|後中央値ms|短縮ms|短縮率|回数 前/後|判定|
|---|---|---:|---:|---:|---:|---|---|
|LP 初回|実click→ダウンロード済みファイル確認|76.4|40.5|35.9|47.0%|7/7|今回の標本では短縮を確認|
|LP 反復・Blob cache|同上|6.1|6.1|0.0|0.0%|7/7|改善未確認|
|LP 約1.2MB、2回ダウンロード後|内部の復号関数のみ|42.8|1.3|41.5|97.0%|7/7|内部診断。操作全体の改善率と別|
|検索filter 100×8・パネル操作後|結果確定の代理指標|62.9|61.5|1.4|2.2%|7/7|差は未確定|
|検索filter 10万×20・パネル操作後|同上|414.8|461.4|-46.6|-11.2%|7/7|悪化方向の中央値、分布は重なる。独立再確認へ|
|検索filter 10万×20・保存完了後、他パネルなし|同上|329.0|313.3|15.7|4.8%|7/7|初回と異なる条件。差は未確定。条件を混ぜて平均しない|

内部診断の環境・実行時点を変えた以前の記録では72.9→2.0msなどの値も出たが、最終比較には上表の同じ実行時点の値を使う。バイト配列生成負荷を削減できた一方、検索の追加性能効果は確認できていない。

LPは同じ最終HTML・CSSを配信し、比較時だけ着手時のLP JSへ切り替える。初回とキャッシュされたBlobを使う繰り返しを分ける。7回ずつ、前後の実行順を交互に変える。最終の開始点は実clickイベント、終了は保存済みファイルの読取り後にブラウザ時刻を確認した時点。自動操作の通信・確認遅延は含むが、click前のドライバーの要素安定待ちは分離する。これは実OSの入力待ちやINPではない。ブラウザ内復号時間は独立した補助指標で、入力待ち・描画・保存を含まない。

診断処理を初回と繰り返しの間に挟んだ一度の測定では、旧版だけ長い復号が操作間隔を変えた。`diagnostic-interleaved-decode.json` を診断資料として残し、操作比較の最終値には使わない。診断を両クリックの後へ移しても、hoverのtransform transition終了をドライバーが待つ時間が短い復号の後の反復へ集中した。`diagnostic-driver-stability.json` にその値を残した。実clickからの計測では反復は前後とも6.1msで、cacheの処理も変更していない。ドライバー待機は最終JSONの `driverMs` に別記する。初回の以前の7回比較は `paired-download.json` にも残した。

パネル・検索・復元は、通常100×8、10万×20、長いセル2000×3の3条件で各7回。変更前の本体HTMLと最終HTMLを比較し、正しい件数、結果、実際の操作受付を確認した。完了は既存測定器の表示確認+描画機会確認で、GPUの描画トレースそのものではない。結果確定の代理指標として限界を記録する。検索は検索語を事前入力してからフィルタ適用を開始点とし、日本語入力開始からのINPではない。保存の測定は主に復元できる内容の確認で、自動保存開始→全完了の個別比較を行ったとは扱わない。

開始時のソースを変更前に保存し、その保存版を使って比較計測した。今回の一部前後計測は実装後のreplayであり、変更前の本番計測を取得した代わりにはならない。実機低性能端末・ネットワーク・CDN・OSファイルキャッシュ・120Hzは制御/検証していない。

## ④ 連続操作と画面配置

ドラッグ表示の集約は今回変更していない。既存の `../drag/REPORT.md` は合成イベント120回×7試行の負荷診断で、実入力の追従遅延や本番FPSと区別する。今回のpointer最終位置/コピー/幅の復元/ドロップ確定は `pointer.log`、出力中の再編集と次回出力の新しさは `yield.log` に成功記録がある。

狭幅での空のfilter statusは検索カード内に約103pxを占め、表を下へ押し出していた。幅560px以下で条件がない状態だけ領域を畳む。同じ390×844、同じ2行、同じ保存済み状態で表の上端は **687.7px→584.8px**。時間短縮率をこの位置差に流用しない。活性化時の条件と解除ボタンは表示する。表の内部scrollTopが活性/非活性の切替で変わらないことも検証した。デスクトップの予約領域は維持する。

画像: `mobile-before.png`、`mobile-after.png`。寸法・全件コピー一致: `mobile-layout.json`。再現ソース: `mobile-measurement-source.mjs`（比較元を展開し、記録されたパスを合わせて実行）。画像比較はUI配置の検証で、入力反応時間の計測ではない。

## ⑤ 検証の根拠と残件

- Node回帰、TypeScript build、設定例、生成JS一致、限定旧APIチェック、vendor hash、`git diff --check` が成功。
- 本体の統合試験はChrome154.0.8037.99、Firefox155.0、WebKit27.2で成功。12,000行の取込、保存復元、履歴、文字コード、Worker、IME、編集中競合を含む。品質試験は各37件（111件）、console error 0件。
- 最初の総合試験は狭幅の表領域で失敗した。単独再現・寸法診断・画面撮影で空の領域を特定し、期待値は変更せず実装を修正した。狭幅を含むユーザビリティ試験は最終版で各11件（33件）成功、console error/外部HTTP(S)リクエスト0件。
- 追加試験は3エンジン×標準/代替の2経路（6条件）。Base6417入力の互換、Unicode/正規表現メタ文字/改行/孤立surrogate、配布ファイル全バイト、コピー成功/例外の入力選択・通常Range復帰、重複ID、CSS layer、狭幅scroll維持を確認した。OSの実クリップボード権限はfakeで制御し、実OS権限の完了保証とは扱わない。
- 実装の対応: 文字ごとの復号→標準の直接復号→配列生成を削減→内部時間と初回ダウンロードを実測→全バイト一致。独自regex escape→標準関数/同一Worker関数→公式動作へ統一→検索・Worker・置換・Unicodeの一致を検証。空の状態領域→狭幅の状態selector→操作領域を確保→位置差とscroll/出力一致を検証。
- 詳細ログ: `full-browser.log`（最初の失敗も保持）、`usability-final.log`、`modern-final.log`、`regression-final.log`、`static-final.log`。各JSONは日時・環境・回数・全サンプルを持つ。日時はUTCで保存し、JSTでは+9時間。

操作の対応と未計測範囲:

|画面・操作群|代表条件/期待結果|関連処理・検証|今回の性能計測|
|---|---|---|---|
|LP、リンク、nav、利用規約|PC/狭幅、keyboard、reduced motion|src/main.ts、quality/usability|downloadのみ。遷移・scroll等は未計測|
|初期画面、読込、貼付、wizard、取消|空/通常/大量/文字コード/古い結果拒否|parseCSV、import、regression/browser|貼付はパネル計測の前提。実ファイルは過去記録、今回未比較|
|一覧、仮想scroll、cell/range、全文編集|全件・改行・null・filter、cursor/history保持|render、selection、cell edit|各パネル。実scrollの追従は未計測|
|検索、regex、置換、列filter、さらに表示|通常/大量/長セル、同じ件数/順序|matcher、Worker、filter、quality|検索適用と列filter初回。後続表示・入力INPは未計測|
|行列の追加/複製/削除/移動/幅/ソート|全セル・最終位置・undo/redo・保存復元|pointer、browser、regression|今回の連続操作時間は未計測。既存drag記録と分離|
|コピー、保存、export各形式、プレビュー|元値/選択/全件、encoding warnings、取消|output、copy、quality/yield|LP download、export preview。OS clipboard・本体save完了は未比較|
|設定、theme、言語、header、help、palette|values/labels/focus/keyboard保持|quality/usability、controls.json|各パネル。全個別設定の時間は未計測|
|自動保存、復元、他tab、quota/retry|snapshot、世代/件数/hash、最新状態維持|IDBStore、persist、browser|restore offer/restore。全背景処理・memory継続観測は未計測|

以前の詳細な操作別計測と未計測表は `../REPORT.md`、`../round2/REPORT.md`、`../round3/REPORT.md`。以前の改善値を今回新しく達成した値として加算しない。APIの移行数だけで高速化完了とは扱わない。

再開に必要な情報は本番URL/配布先・通常の反映/復旧手順、最低対応ブラウザ/WebView、必要な検証用データ。これらが確認できたら、本番の変更前計測→反映→配信ハッシュ確認→同条件の再計測を実施する。全操作個別の性能目標、実入力の連続追従、最低版互換、完全な意味解析/静的解析、リモートCIの実行は残件である。
