import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
} catch {
  throw new Error('Install Playwright in your test environment or set PLAYWRIGHT_MODULE_PATH to its package directory. Browser tests add no dependencies to the distributed HTML.');
}
const ENGINES = (process.env.LOCALCSV_TEST_ENGINES || 'chromium,firefox,webkit').split(',');
const RESULTS = [];
const quoteCsv = (rows) => rows.map(row => row.map(cell => '"' + String(cell).replaceAll('"','""') + '"').join(',')).join('\n');
const waitSaved = page => page.waitForFunction(() => document.querySelector('#saveStatus')?.dataset.state === 'saved' || /Saved|保存済/.test(document.querySelector('#saveStatus')?.textContent), null, { timeout: 15000 });
const matrix = page => page.locator('#tableBody tr[data-row]').evaluateAll(rows => rows.map(row => Array.from(row.querySelectorAll('td[data-col]'), cell => cell.textContent)));
const importRows = async (page, rows) => {
  await page.locator('#pasteBtn').click();
  const input = page.locator('#pasteImportInput');
  await input.waitFor({state:'visible'});
  // 数百KBの文字を自動操作ドライバーが標準入力する時間は計測から除く。
  // 少量の入力では引き続き標準の編集経路を検証する。
  if (rows.length >= 5000) await input.evaluate((element, text) => {
    element.value = text;
    element.dispatchEvent(new Event('input', {bubbles:true}));
  }, quoteCsv(rows));
  else await input.fill(quoteCsv(rows));
  await page.locator('#pasteImportConfirmBtn').click();
  // 既存データの置換には、通常の確認ダイアログを使う。
  if (await page.locator('#modalOverlay.show').count()) await page.locator('#modalConfirmBtn').click();
  await page.locator('#pasteImportOverlay.show').waitFor({ state:'hidden' });
  await page.locator('#tableBody td[data-col="0"]').first().waitFor();
};
const filter = async (page, query) => {
  await page.locator('#searchInput').fill(query);
  await page.locator('#filterMode').check();
  await page.waitForFunction(() => !document.querySelector('#replaceNextBtn').disabled);
};
const clearFilters = async page => {
  const $clearButton = page.locator('#clearAllFiltersBtn');
  if (!await $clearButton.isVisible()) await page.locator('#searchAdvancedToggle').click();
  await $clearButton.click();
};
// Firefoxではfill()の完了後にも、カーソル位置への標準スクロールが待機している場合がある。
// そのレイアウト処理を終えてから、利用者による操作と同じスクロールを実行する。
const settleCaretLayout = page => page.evaluate(() => new Promise(resolve => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));
const sort = async (page, direction) => {
  await page.locator('button[data-col-menu="0"]').click();
  await page.locator(`#columnMenu [data-action="sort-${direction}"]`).click();
};
const copyOutput = async page => {
  await page.evaluate(() => {
    window.__qaCopy = undefined;
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__qaCopy=text;}}});
  });
  await page.locator('#copyBtn').click();
  await page.waitForFunction(() => typeof window.__qaCopy === 'string');
  return page.evaluate(() => window.__qaCopy);
};

for (const engine of ENGINES) {
  const started = performance.now();
  const executablePath = process.env[`LOCALCSV_${engine.toUpperCase()}_PATH`];
  const browser = await playwright[engine].launch({ headless:true, ...(executablePath ? {executablePath} : {}) });
  const context = await browser.newContext({ acceptDownloads:true, locale:'ja-JP' });
  context.setDefaultTimeout(15000);
  const errors = [];
  context.on('page', page => {
    // 一時的な入力要素がファイル選択画面を開く前に、標準の選択画面を捕捉できるようにする。
    page.on('filechooser', () => {});
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(path.join(ROOT,'LocalCSV.html')).href);
    await page.locator('#pasteZone').waitFor();
    await page.waitForTimeout(150);
    await importRows(page, [['9007199254740993','keep'],['9007199254740992','hide'],['2','keep'],['10','keep']]);
    await sort(page,'asc');
    await page.waitForFunction(() => document.querySelector('td[data-row="0"][data-col="0"]')?.textContent === '2');
    assert.deepEqual((await matrix(page)).map(row=>row[0]),['2','10','9007199254740992','9007199254740993']);
    await filter(page,'keep');
    await page.locator('td[data-row="1"][data-col="1"]').click();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.dataset.row === '3');
    await page.keyboard.press('Shift+Tab');
    await page.waitForFunction(() => document.activeElement?.dataset.row === '3' && document.activeElement?.dataset.col === '0');
    await page.keyboard.press('Shift+Tab');
    await page.waitForFunction(() => document.activeElement?.dataset.row === '1' && document.activeElement?.dataset.col === '1');
    await clearFilters(page);
    await waitSaved(page);
    const output = await copyOutput(page);
    assert.equal(output,'2,keep\n10,keep\n9007199254740992,hide\n9007199254740993,keep');
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#dlBtn').click();
    const download = await downloadEvent;
    const bytes = await fs.readFile(await download.path());
    assert.equal(new TextDecoder().decode(bytes), output);
    await page.reload();
    await page.locator('#modalOverlay.show').waitFor();
    await page.locator('#modalConfirmBtn').click();
    assert.equal(await copyOutput(page),output);

    console.log(`${engine}: exact sort, navigation, download and recovery passed`);
    await importRows(page,[['a','keep'],['b','keep']]);
    await page.locator('td[data-row="0"][data-col="0"]').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('second line');
    await page.locator('#searchInput').click();
    assert.equal(await copyOutput(page),'"a\nsecond line",keep\nb,keep', 'typed line breaks must survive serialization');

    // 小さな表でも、利用者の正規表現には中断可能なWorkerを使う。
    await importRows(page,[['aaa','keep'],['a'.repeat(70)+'!','keep']]);
    await page.locator('#searchAdvancedToggle').click();
    await page.locator('#searchRegex').check();
    await page.locator('#searchInput').fill('^(a+)+$');
    // ブラウザ自身が正規表現の探索回数を制限する場合があるため、安全な完了とタイムアウトのどちらも許容する。
    await page.waitForFunction(() => document.querySelector('#searchInfo').dataset.error === 'true' || !document.querySelector('#replaceNextBtn').disabled, null, {timeout:8000});
    await page.evaluate(() => {
      window.__qaWorkerPost = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function(packet, ...args) {
        if (packet?.type === 'search' && packet.payload?.query === '__qa_timeout__') return;
        return window.__qaWorkerPost.call(this, packet, ...args);
      };
    });
    await page.locator('#searchInput').fill('__qa_timeout__');
    await page.waitForFunction(() => document.querySelector('#searchInfo').dataset.error === 'true', null, {timeout:8000});
    assert.equal(await page.locator('#replaceAllBtn').isDisabled(),true);
    await page.evaluate(() => { Worker.prototype.postMessage = window.__qaWorkerPost; });
    await page.locator('#searchInput').fill('a+');
    await page.waitForFunction(() => document.querySelector('#replaceNextBtn').disabled === false);
    assert.ok(await page.locator('#tableBody mark').count() > 0);
    await page.locator('#replaceInput').fill('X');
    await page.locator('#replaceAllBtn').click();
    await page.waitForFunction(() => document.querySelector('td[data-row="0"][data-col="0"]')?.textContent === 'X');
    await page.locator('#undoBtn').click();
    await page.waitForFunction(() => document.querySelector('td[data-row="0"][data-col="0"]')?.textContent === 'aaa');
    await clearFilters(page);
    await waitSaved(page);

    console.log(`${engine}: multiline editing and regex timeout/recovery passed`);

    // 別のタブで同じリビジョンを復元しても、より新しい保存を上書きしてはならない。
    const second = await context.newPage();
    await second.goto(page.url());
    await second.locator('#modalOverlay.show').waitFor();
    await second.locator('#modalConfirmBtn').click();
    const cell=page.locator('td[data-row="0"][data-col="0"]');
    await cell.fill('first-tab-latest');
    await page.locator('#searchInput').click();
    await waitSaved(page);
    await second.locator('td[data-row="0"][data-col="0"]').fill('second-tab-unsaved');
    await second.locator('#searchInput').click();
    await second.waitForFunction(() => /失敗|failed/i.test(document.querySelector('#saveStatus').textContent));
    assert.equal((await matrix(second))[0][0],'second-tab-unsaved');
    await second.close({runBeforeUnload:false});
    await page.reload();
    await page.locator('#modalOverlay.show').waitFor();
    await page.locator('#modalConfirmBtn').click();
    await page.locator('#tableBody td[data-col="0"]').first().waitFor();
    assert.equal((await matrix(page))[0][0],'first-tab-latest');

    console.log(`${engine}: concurrent tabs retain the latest recovery copy`);
    await waitSaved(page);
    await page.evaluate(() => {
      window.__qaLocked = false;
      void navigator.locks.request('csvEditor_recovery_state',async()=>{
        window.__qaLocked=true;
        await new Promise(resolve=>{window.__qaUnlock=resolve;});
      });
    });
    await page.waitForFunction(()=>window.__qaLocked);
    await page.locator('#clearBtn').click();
    await page.locator('#modalConfirmBtn').click();
    await page.locator('td[data-row="0"][data-col="0"]').fill('edited-during-clear');
    await page.evaluate(()=>window.__qaUnlock());
    await page.locator('#modalOverlay.show').waitFor({state:'hidden'});
    await waitSaved(page);
    assert.equal((await matrix(page))[0][0],'edited-during-clear','clear must not discard a newer edit');

    // しきい値を超えるデータで、実際の解析・並べ替え・フィルター・保存Workerを検証する。
    const count=Number(process.env.LOCALCSV_PERF_ROWS || 12000);
    const rows=Array.from({length:count},(_,i)=>[String(9007199254740992n+BigInt(count-i)),i%2?'odd':'even','日本語,"quoted"\nline']);
    const loadStart=performance.now();
    await importRows(page,rows);
    await waitSaved(page);
    const importMs=Math.round(performance.now()-loadStart);
    const sortStart=performance.now();
    await sort(page,'asc');
    await page.waitForFunction(() => document.querySelector('td[data-row="0"][data-col="0"]')?.textContent === '9007199254740993', null, {timeout:30000});
    const sortMs=Math.round(performance.now()-sortStart);
    await page.locator('button[data-filter-col="0"]').click();
    await page.locator('#colFilterConditions .col-filter-op').first().selectOption('lte');
    await page.locator('#colFilterConditions .col-filter-cond-val').first().fill('9007199254740996');
    await page.locator('#colFilterApplyBtn').click();
    await page.waitForFunction(()=>document.querySelectorAll('#tableBody tr[data-row]').length===4);
    assert.deepEqual((await matrix(page)).map(row=>row[0]),['9007199254740993','9007199254740994','9007199254740995','9007199254740996']);
    await clearFilters(page);
    await filter(page,'even');
    await page.waitForFunction(() => document.querySelector('#searchInfo').textContent.includes('6,000') || !document.querySelector('#replaceNextBtn').disabled);
    assert.ok(await page.locator('#tableBody tr[data-row]').count() < 300,'large tables must stay virtualized');
    await clearFilters(page);
    await waitSaved(page);
    const expected=rows.slice().reverse().map(row=>row.map(cell=>/[",\r\n]/.test(cell)?'"'+cell.replaceAll('"','""')+'"':cell).join(',')).join('\n');
    assert.ok(await copyOutput(page) === expected, 'worker sort and export must retain every exact cell value');
    // 解析・直列化の正確な往復は、基本テストで別途検証する。

    for (const failure of ['chunk', 'manifest']) {
      const faultContext=await browser.newContext({locale:'ja-JP'});
      try {
        await faultContext.addInitScript(({failure})=>{
          const put=IDBObjectStore.prototype.put;
          let writes=0;
          IDBObjectStore.prototype.put=function(value,key){
            if(window.__qaQuotaArmed && (failure==='manifest' ? key==='csvEditor_state_pro' : String(key).includes('::chunk::') && ++writes===2)) {
              window.__qaQuotaArmed=false;
              throw new DOMException('QA simulated quota failure','QuotaExceededError');
            }
            return put.call(this,value,key);
          };
        },{failure});
        const faultPage=await faultContext.newPage();
        faultPage.on('pageerror',error=>errors.push(error.message));
        await faultPage.goto(pathToFileURL(path.join(ROOT,'LocalCSV.html')).href);
        await faultPage.waitForTimeout(150);
        await faultPage.evaluate(()=>{window.__qaQuotaArmed=true;});
        const faultRows=Array.from({length:801},(_,i)=>[String(i),'restore me']);
        await importRows(faultPage,faultRows);
        await faultPage.waitForFunction(()=>document.querySelector('#saveStatus').dataset.state==='fallback');
        const expectedFault=faultRows.map(row=>row.join(',')).join('\n');
        assert.equal(await copyOutput(faultPage),expectedFault);
        await faultPage.reload();
        await faultPage.locator('#modalOverlay.show').waitFor();
        await faultPage.locator('#modalConfirmBtn').click();
        assert.ok(await copyOutput(faultPage)===expectedFault,`${failure} quota fallback must retain every row after migration/reload`);
      } finally { await faultContext.close(); }
    }
    console.log(`${engine}: chunk/manifest quota failures restore completely`);

    const fileContext=await browser.newContext({locale:'ja-JP',acceptDownloads:true});
    fileContext.setDefaultTimeout(15000);
    try {
      const filePage=await fileContext.newPage();
      filePage.on('filechooser', () => {});
      filePage.on('pageerror',error=>errors.push(error.message));
      filePage.on('console',message=>{if(message.type()==='error') errors.push(message.text());});
      await filePage.goto(pathToFileURL(path.join(ROOT,'LocalCSV.html')).href);
      await filePage.waitForTimeout(150);
      await filePage.evaluate(()=>{window.showOpenFilePicker=undefined;});
      const fileRows=[['日本語','<img src=x onerror="globalThis.__qaInjected=true">'],['a\r\nb','x,"y"'],['a\rb','😀']];
      const fileText=fileRows.map(row=>row.map(cell=>/[",\r\n]/.test(cell)?'"'+cell.replaceAll('"','""')+'"':cell).join(',')).join('\r\n');
      const fixtures=[
        {name:'日本語-utf8.csv',rows:fileRows,text:fileText,bytes:Buffer.from('\ufeff'+fileText,'utf8')},
        {name:'日本語-utf16.csv',rows:fileRows,text:fileText,bytes:Buffer.from('\ufeff'+fileText,'utf16le')},
        {name:'日本語-sjis.csv',rows:[['a','あ'],['b','い']],text:'a,あ\r\nb,い',bytes:Buffer.from([0x61,0x2c,0x82,0xa0,0x0d,0x0a,0x62,0x2c,0x82,0xa2])},
      ];
      for(const fixture of fixtures) {
        console.log(`${engine}: importing ${fixture.name}`);
        const [chooser]=await Promise.all([filePage.waitForEvent('filechooser'),filePage.locator('#openFileBtn').click()]);
        await chooser.setFiles({name:fixture.name,mimeType:'text/csv',buffer:fixture.bytes});
        await filePage.locator('#importWizardOverlay.show').waitFor();
        await filePage.locator('#wizNextBtn').click();
        await filePage.locator('#wizImportBtn').click();
        if(await filePage.locator('#modalOverlay.show').count()) await filePage.locator('#modalConfirmBtn').click();
        await filePage.locator('#importWizardOverlay.show').waitFor({state:'hidden'});
        assert.deepEqual(await matrix(filePage),fixture.rows,`${fixture.name}: preserve decoded cell contents`);
        assert.equal(await filePage.locator('#tableBody img').count(),0,'CSV markup must remain inert text');
        assert.equal(await filePage.evaluate(()=>window.__qaInjected),undefined);
        assert.equal(await copyOutput(filePage),fixture.text);
        const fileDownload=filePage.waitForEvent('download');
        await filePage.locator('#dlBtn').click();
        assert.deepEqual(await fs.readFile(await (await fileDownload).path()),fixture.bytes,`${fixture.name}: preserve encoding and BOM on export`);
      }
    } finally {await fileContext.close();}
    console.log(`${engine}: file import/export preserves UTF-8, UTF-16, Shift-JIS, line breaks and inert markup`);

    // Firefoxは仮想表の本体を置き換える際、blurなしでフォーカス中のセルを取り除く。
    await page.bringToFront();
    const scrollRows = Array.from({length: 2000}, (_, i) => [String(i), 'keep']);
    await importRows(page, scrollRows);
    await page.locator('td[data-row="0"][data-col="1"]').fill('typed before scroll');
    await settleCaretLayout(page);
    await page.locator('#tableScroll').evaluate(element => { element.scrollTop = 12000; });
    await page.locator('td[data-row="0"][data-col="1"]').waitFor({state: 'detached'});
    await page.locator('#tableScroll').evaluate(element => { element.scrollTop = 0; });
    await page.locator('td[data-row="0"][data-col="1"]').waitFor();
    assert.equal((await matrix(page))[0][1], 'typed before scroll');
    await page.locator('#undoBtn').click();
    assert.equal((await matrix(page))[0][1], 'keep', 'scroll must retain edit history');
    await page.locator('#redoBtn').click();
    assert.equal((await matrix(page))[0][1], 'typed before scroll');

    const composingCell = page.locator('td[data-row="0"][data-col="1"]');
    await composingCell.fill('変換中');
    await settleCaretLayout(page);
    await composingCell.evaluate(element => {
      window.__qaComposingCell = element;
      element.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
    });
    await page.locator('#tableScroll').evaluate(element => { element.scrollTop = 12000; });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__qaComposingCell.isConnected), true, 'scroll must keep the composing cell attached');
    await composingCell.evaluate(element => {
      element.textContent = 'スクロール後の確定値';
      element.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true}));
    });
    await composingCell.waitFor({state: 'detached'});
    await page.locator('#tableScroll').evaluate(element => { element.scrollTop = 0; });
    await composingCell.waitFor();
    assert.equal((await matrix(page))[0][1], 'スクロール後の確定値');

    for (const outcome of ['success', 'failure', 'composition']) {
      await importRows(page, [['a', 'keep'], ['b', 'keep']]);
      if (!(await page.locator('#searchRegex').isVisible())) await page.locator('#searchAdvancedToggle').click();
      await page.locator('#searchRegex').check();
      await page.locator('#filterMode').check();
      await page.evaluate(() => {
        window.__qaReleaseSearch = undefined;
        const post = Worker.prototype.postMessage;
        Worker.prototype.postMessage = function(packet, ...args) {
          if (packet?.type === 'search' && packet.payload?.query === '^keep$') {
            Worker.prototype.postMessage = post;
            window.__qaReleaseSearch = failure => failure
              ? this.onerror({message: 'QA search failure', preventDefault() {}})
              : post.call(this, packet, ...args);
            return;
          }
          return post.call(this, packet, ...args);
        };
      });
      await page.locator('#searchInput').fill('^keep$');
      await page.waitForFunction(() => window.__qaReleaseSearch);
      const pendingCell = page.locator('td[data-row="0"][data-col="1"]');
      await pendingCell.fill('typed during search');
      if (outcome === 'composition') await pendingCell.evaluate(element => {
        window.__qaComposingCell = element;
        element.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
      });
      await page.evaluate(failure => window.__qaReleaseSearch(failure), outcome === 'failure');
      if (outcome === 'composition') {
        await page.waitForTimeout(250);
        assert.equal(await page.evaluate(() => window.__qaComposingCell.isConnected && document.activeElement === window.__qaComposingCell), true,
          'pending search must not replace the IME composition target');
        await pendingCell.evaluate(element => {
          element.textContent = '変換確定';
          element.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: '変換確定'}));
          element.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertCompositionText', data: '変換確定'}));
        });
      }
      await page.waitForFunction(() => !document.querySelector('#replaceAllBtn').disabled && document.querySelectorAll('#tableBody tr[data-row]').length === 1);
      assert.equal(await copyOutput(page), `a,${outcome === 'composition' ? '変換確定' : 'typed during search'}\nb,keep`,
        `${outcome}: search completion must retain the active cell edit and re-evaluate the filter`);
    }
    console.log(`${engine}: virtual scrolling, delayed search and IME preserve pending edits`);

    await importRows(page, Array.from({length: 8000}, (_, i) => [String(i), 'keep']));
    await page.evaluate(() => {
      window.__qaReleaseFilter = undefined;
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function(packet, ...args) {
        if (packet?.type === 'evaluateFilters') {
          Worker.prototype.postMessage = post;
          window.__qaReleaseFilter = () => post.call(this, packet, ...args);
          return;
        }
        return post.call(this, packet, ...args);
      };
    });
    await page.locator('button[data-filter-col="1"]').click();
    await page.locator('#colFilterConditions .col-filter-op').first().selectOption('equals');
    await page.locator('#colFilterConditions .col-filter-cond-val').first().fill('keep');
    await page.locator('#colFilterApplyBtn').click();
    await page.waitForFunction(() => window.__qaReleaseFilter);
    await page.locator('td[data-row="0"][data-col="0"]').fill('typed during filter');
    await page.evaluate(() => window.__qaReleaseFilter());
    await page.locator('#colFilterPanel.show').waitFor({state: 'hidden'});
    await waitSaved(page);
    assert.equal((await copyOutput(page)).split('\n')[0], 'typed during filter,keep');
    await clearFilters(page);

    // 完全一致の置換は、末尾の改行だけが異なるセルを変更してはならない。
    const exactRows = [['foo'], ['foo\n'], ['foo\u2028'], ['foo\u2029']];
    await importRows(page, exactRows);
    if (!(await page.locator('#searchExactMatch').isVisible())) await page.locator('#searchAdvancedToggle').click();
    await page.locator('#searchExactMatch').check();
    await page.locator('#searchInput').fill('foo');
    await page.locator('#replaceInput').fill('done');
    await page.waitForFunction(() => !document.querySelector('#replaceAllBtn').disabled);
    await page.locator('#replaceAllBtn').click();
    assert.deepEqual(await matrix(page), [['done'], ...exactRows.slice(1)]);
    await importRows(page, [['a'], ['ab'], ['ab\n']]);
    await page.locator('#searchExactMatch').check();
    await page.locator('#searchRegex').check();
    await page.locator('#searchInput').fill('a|ab');
    await page.locator('#replaceInput').fill('done');
    await page.waitForFunction(() => !document.querySelector('#replaceAllBtn').disabled);
    await page.locator('#replaceAllBtn').click();
    await page.waitForFunction(() => document.querySelector('td[data-row="0"][data-col="0"]')?.textContent === 'done');
    assert.deepEqual(await matrix(page), [['done'], ['done'], ['ab\n']]);

    // キーボードのコピー・貼り付けには未確定の編集を含め、元に戻す履歴にも保持する。
    await importRows(page, [['original', 'keep'], ['second', 'keep']]);
    const editCell = page.locator('td[data-row="0"][data-col="0"]');
    await editCell.click();
    await editCell.fill('typed before copy');
    await page.evaluate(() => {window.__qaCopy = undefined;});
    await page.keyboard.press('Control+c');
    await page.waitForFunction(() => typeof window.__qaCopy === 'string');
    assert.equal(await page.evaluate(() => window.__qaCopy), 'typed before copy');
    await editCell.fill('typed before paste');
    const pasteEvent = async text => page.evaluate(text => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', text);
      clipboardData.setData('text/html', '<b>unexpected rich text</b>');
      const event = new ClipboardEvent('paste', {bubbles: true, cancelable: true, clipboardData});
      // Firefoxは合成イベントのコンストラクターに渡したclipboardDataを保持しない。
      Object.defineProperty(event, 'clipboardData', {value: clipboardData});
      document.activeElement.dispatchEvent(event);
      return event.defaultPrevented;
    }, text);
    assert.equal(await pasteEvent('pasted'), true);
    assert.equal((await matrix(page))[0][0], 'pasted');
    await page.keyboard.press('Control+z');
    assert.equal((await matrix(page))[0][0], 'typed before paste');
    // mousedownなしでフォーカスし、選択範囲のない1セルの経路を検証する。
    await editCell.focus();
    await page.keyboard.press('Escape');
    await editCell.focus();
    assert.equal(await pasteEvent('"unterminated'), true, 'a rejected paste must never fall back to native rich-text insertion');
    assert.equal((await matrix(page))[0][0], 'typed before paste');

    // 変更処理のWorkerだけを待機させ、その結果をアプリに返す前に入力する。
    const installMutationDelay = async () => page.evaluate(() => {
      document.querySelector('#toastContainer').replaceChildren();
      window.__qaReleaseMutation = undefined;
      window.__qaMutationPost = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function(packet, ...args) {
        if (Array.isArray(packet?.rows) || typeof packet?.regexSource === 'string') {
          window.__qaReleaseMutation = failure => failure
            ? this.onerror({message: 'QA delayed failure', preventDefault() {}})
            : window.__qaMutationPost.call(this, packet, ...args);
          return;
        }
        return window.__qaMutationPost.call(this, packet, ...args);
      };
    });
    const releaseMutation = failure => page.evaluate(failure => {
      Worker.prototype.postMessage = window.__qaMutationPost;
      window.__qaReleaseMutation(failure);
    }, failure);
    const mutationRows = Array.from({length: 5000}, (_, i) => [String(5000 - i), 'keep']);
    for (const operation of ['sort', 'replace', 'sort-failure', 'replace-failure']) {
      await importRows(page, mutationRows);
      const replacing = operation.startsWith('replace');
      if (replacing) {
        await page.locator('#searchInput').fill('keep');
        await page.locator('#replaceInput').fill('done');
        await page.waitForFunction(() => !document.querySelector('#replaceAllBtn').disabled);
      }
      await installMutationDelay();
      if (replacing) await page.locator('#replaceAllBtn').click();
      else await sort(page, 'asc');
      await page.waitForFunction(() => window.__qaReleaseMutation);
      await page.locator('td[data-row="0"][data-col="1"]').fill('edited during worker');
      await releaseMutation(operation.endsWith('failure'));
      await page.waitForFunction(() => /結果を破棄/.test(document.querySelector('#toastContainer').textContent));
      const mutationOutput = (await copyOutput(page)).split('\n');
      assert.equal(mutationOutput[0], '5000,edited during worker', `${operation}: retain the edit on the original row`);
      assert.equal(mutationOutput[1], '4999,keep');
      assert.equal(mutationOutput.length, 5000);
    }
    // 検索キャンセル後に失敗したWorkerが、古い置換設定を適用してはならない。
    await importRows(page, mutationRows);
    await page.locator('#searchInput').fill('keep');
    await page.locator('#replaceInput').fill('done');
    await page.waitForFunction(() => !document.querySelector('#replaceAllBtn').disabled);
    await installMutationDelay();
    await page.locator('#replaceAllBtn').click();
    await page.waitForFunction(() => window.__qaReleaseMutation);
    await page.locator('#searchInput').fill('no matches');
    await releaseMutation(true);
    await page.waitForFunction(() => document.querySelector('#searchInfo').textContent.includes('一致なし'));
    assert.equal((await copyOutput(page)).split('\n')[0], '5000,keep');

    // 空ファイルでも、ヘッダー設定付きのプレビューで例外を発生させない。
    await page.evaluate(() => {window.showOpenFilePicker = undefined;});
    const [emptyChooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#openFileBtn').click()]);
    await emptyChooser.setFiles({name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.alloc(0)});
    await page.locator('#importWizardOverlay.show').waitFor();
    await page.locator('#wizHeader').check();
    await page.locator('#wizNextBtn').click();
    assert.equal(await page.locator('#wizPreviewBody tr').count(), 0);
    await page.locator('#wizCancelBtn').click();
    console.log(`${engine}: exact replacement, pending edits, clipboard failure and empty preview passed`);

    // 列挿入時は、新しい選択肢ができる前でも末尾列の検索対象を保持する。
    await importRows(page, [['match','match'],['other','match']]);
    if (!await page.locator('#searchTargetCol').isVisible()) await page.locator('#searchAdvancedToggle').click();
    await page.locator('#searchTargetCol').selectOption('1');
    await page.locator('button[data-col-menu="0"]').click();
    await page.locator('#columnMenu [data-action="add-col-left"]').click();
    assert.equal(await page.locator('#searchTargetCol').inputValue(), '2');
    await page.locator('#undoBtn').click();
    assert.equal(await page.locator('#searchTargetCol').inputValue(), '1');
    await page.locator('#redoBtn').click();
    assert.equal(await page.locator('#searchTargetCol').inputValue(), '2');
    await page.locator('#searchInput').fill('match');
    await page.locator('#replaceInput').fill('replaced');
    await page.waitForFunction(() => !document.querySelector('#replaceAllBtn').disabled);
    await page.locator('#replaceAllBtn').click();
    await page.waitForFunction(() => document.querySelector('td[data-row="1"][data-col="2"]')?.textContent === 'replaced');
    assert.deepEqual(await matrix(page), [['','match','replaced'],['','other','replaced']]);

    // 元に戻す際は、異なる形の表に属する選択範囲やドラッグの起点を破棄する。
    await importRows(page, [['a','b'],['c','d']]);
    await page.locator('#addColBtn').click();
    await page.locator('td[data-row="0"][data-col="2"]').click();
    await page.locator('#undoBtn').click();
    assert.equal(await page.locator('td.selected').count(), 0);
    await page.keyboard.press('Delete');
    assert.equal(await copyOutput(page), 'a,b\nc,d', 'an obsolete selection must not append a hidden column');
    await page.locator('td[data-row="1"][data-col="0"]').click({modifiers:['Shift']});
    assert.equal(await page.locator('td.selected').count(), 1, 'old drag anchors must not select an unrelated rectangle');

    // クリップボード操作は、絞り込み中の行移動も含めてキーボードフォーカスに従う。
    await page.locator('td[data-row="0"][data-col="0"]').click();
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => document.activeElement?.dataset.col === '1');
    await page.evaluate(() => {window.__qaCopy = undefined;});
    await page.keyboard.press('Control+c');
    await page.waitForFunction(() => typeof window.__qaCopy === 'string');
    assert.equal(await page.evaluate(() => window.__qaCopy), 'b');
    assert.equal(await pasteEvent('new B'), true);
    assert.deepEqual(await matrix(page), [['a','new B'],['c','d']]);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.dataset.row === '1');
    assert.equal(await pasteEvent('new D'), true);
    assert.deepEqual(await matrix(page), [['a','new B'],['c','new D']]);

    // ツールバー操作後もセルにフォーカスが残る環境で、入力値を保持する。
    await page.locator('td[data-row="0"][data-col="0"]').fill('unblurred');
    await page.locator('#addRowBtn').evaluate(button => button.click());
    assert.equal((await matrix(page))[0][0], 'unblurred');
    await page.locator('#undoBtn').click();
    assert.deepEqual(await matrix(page), [['unblurred','new B'],['c','new D']]);
    await page.locator('#undoBtn').click();
    assert.equal((await matrix(page))[0][0], 'a');
    await page.locator('#redoBtn').click();
    assert.equal((await matrix(page))[0][0], 'unblurred');
    await page.locator('td[data-row="0"][data-col="0"]').fill('export pending');
    await page.locator('#exportWizardBtn').evaluate(button => button.click());
    await page.waitForFunction(() => document.querySelector('#expPreview').textContent.includes('export pending'));
    await page.locator('#expCancelBtn').click();

    // 列の複製時は、実データと仮想ヘッダーの両方を保持する。
    await page.locator('#virtualHeaderBtn').click();
    await page.locator('[data-virtual-header-col="1"]').fill('Virtual B');
    await page.locator('#virtualHeaderApplyBtn').click();
    await page.locator('button[data-col-menu="1"]').click();
    await page.locator('#columnMenu [data-action="dup-col"]').click();
    assert.equal(await page.locator('th[data-col="2"] .th-virtual-text').textContent(), 'Virtual B');
    assert.deepEqual((await matrix(page)).map(row => row.slice(1)), [['new B','new B'],['new D','new D']]);
    await page.locator('#undoBtn').click();
    assert.equal(await page.locator('th[data-col]').count(), 2);
    await page.locator('#redoBtn').click();
    assert.equal(await page.locator('th[data-col="2"] .th-virtual-text').textContent(), 'Virtual B');
    await waitSaved(page);
    console.log(`${engine}: search-column remapping, structural undo, keyboard clipboard and pending toolbar edits passed`);

    assert.deepEqual(errors,[],`${engine}: runtime/console errors`);
    RESULTS.push({engine,version:browser.version(),rows:count,importMs,sortMs,totalMs:Math.round(performance.now()-started)});
    console.log(JSON.stringify(RESULTS.at(-1)));
  } catch (error) {
    console.error(JSON.stringify({engine,errors}));
    throw new Error(error.message.split('Call log:')[0], {cause: {stack: error.stack?.split('\n').filter(line=>/^\s+at /.test(line)).join('\n')}});
  } finally {
    await context.close();
    await browser.close();
  }
}
if(process.env.LOCALCSV_QA_RESULTS) await fs.writeFile(process.env.LOCALCSV_QA_RESULTS,JSON.stringify(RESULTS,null,2)+'\n');
console.log('localcsv browser tests passed');
