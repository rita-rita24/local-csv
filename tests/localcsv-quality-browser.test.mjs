import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDITOR_FILE = process.env.LOCALCSV_TEST_FILE || 'LocalCSV.html';
const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
} catch {
  throw new Error('Install Playwright in your test environment or set PLAYWRIGHT_MODULE_PATH to its package directory. Browser tests add no dependencies to the distributed HTML.');
}
const ENGINES = (process.env.LOCALCSV_TEST_ENGINES || 'chromium,firefox,webkit').split(',');
const quoteCsv = (rows) => rows.map(row => row.map(cell => '"' + String(cell).replaceAll('"','""') + '"').join(',')).join('\n');
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
  // 全解除ボタンは詳細検索内に配置している。
  if (!await $clearButton.isEnabled()) {
    await page.locator('#searchClearBtn').click();
    return;
  }
  if (!await $clearButton.isVisible()) await page.locator('#searchAdvancedToggle').click();
  await $clearButton.click();
};
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

const CASES = [
  ['column condition logic belongs to its own filter', async page => {
    await importRows(page, [['A', '1'], ['B', '2'], ['C', '3']]);
    await page.locator('button[data-filter-col="0"]').click();
    await page.locator('input[name="colFilterLogic"][value="or"]').check();
    await page.locator('#colFilterClose').click();
    await page.locator('button[data-filter-col="1"]').click();
    assert.equal(await page.locator('input[name="colFilterLogic"]:checked').inputValue(), 'and', 'cancelled logic from another column must not leak');
    await page.locator('.col-filter-op').selectOption('gte');
    await page.locator('.col-filter-cond-val').fill('2');
    await page.locator('#colFilterAddCond').click();
    await page.locator('.col-filter-op').nth(1).selectOption('lte');
    await page.locator('.col-filter-cond-val').nth(1).fill('2');
    await page.locator('#colFilterApplyBtn').click();
    assert.deepEqual(await matrix(page), [['B', '2']]);
    await clearFilters(page);
    await page.locator('button[data-filter-col="0"]').click();
    await page.locator('input[name="colFilterLogic"][value="or"]').check();
    await page.locator('#colFilterSelectNone').click();
    await page.locator('#colFilterValues input').first().check();
    await page.locator('#colFilterApplyBtn').click();
    await page.locator('button[data-filter-col="1"]').click();
    assert.equal(await page.locator('input[name="colFilterLogic"]:checked').inputValue(), 'and');
    await page.locator('#colFilterClose').click();
    await page.locator('button[data-filter-col="0"]').click();
    assert.equal(await page.locator('input[name="colFilterLogic"]:checked').inputValue(), 'or', 'a values-only filter must also restore its saved logic');
  }],
  ['late column filtering preserves the next panel draft', async page => {
    for (const action of ['apply', 'clear']) {
      const rows = Array.from({length: 8000}, (_, i) => [i < 4 ? 'A' : 'B', i % 2 ? 'drop' : 'keep']);
      await importRows(page, rows);
      if (action === 'clear') {
        await page.locator('button[data-filter-col="1"]').click();
        await page.locator('#colFilterValues label[data-value="drop"] input').uncheck();
        await page.locator('#colFilterApplyBtn').click();
        await page.waitForFunction(() => !document.querySelector('#colFilterPanel').classList.contains('show'));
        await page.locator('button[data-filter-col="0"]').click();
        await page.locator('#colFilterValues label[data-value="B"] input').uncheck();
        await page.locator('#colFilterApplyBtn').click();
        await page.waitForFunction(() => document.querySelectorAll('#tableBody tr[data-row]').length === 2);
      }
      await page.locator('button[data-filter-col="0"]').click();
      await page.locator('#colFilterValues input').first().waitFor();
      if (action === 'apply') await page.locator('#colFilterValues label[data-value="B"] input').uncheck();
      await page.evaluate(() => {
        const original = Worker.prototype.postMessage;
        const pending = [];
        window.__qaFilterHeld = 0;
        Worker.prototype.postMessage = function(packet, ...args) {
          if (packet?.type === 'evaluateFilters') { pending.push([this, packet, args]); window.__qaFilterHeld++; return; }
          return original.call(this, packet, ...args);
        };
        window.__qaReleaseFilter = () => {
          Worker.prototype.postMessage = original;
          for (const [worker, packet, args] of pending) original.call(worker, packet, ...args);
        };
      });
      await page.locator(action === 'apply' ? '#colFilterApplyBtn' : '#colFilterClearBtn').click();
      await page.waitForFunction(() => window.__qaFilterHeld > 0);
      await page.locator('button[data-filter-col="1"]').click();
      await page.locator('#colFilterSearch').fill('keep');
      await page.evaluate(() => window.__qaReleaseFilter());
      await page.waitForFunction(action => { const count = document.querySelectorAll('#tableBody tr[data-row]').length; return action === 'apply' ? count === 4 : count > 4; }, action);
      assert.equal(await page.locator('#colFilterPanel').isVisible(), true, `${action} completion must not close a newly opened panel`);
      assert.equal(await page.locator('#colFilterSearch').inputValue(), 'keep');
      assert.equal(await page.locator('#colFilterSearch').evaluate(element => element === document.activeElement), true);
      assert.equal(await page.locator('button[data-filter-col="1"]').getAttribute('aria-expanded'), 'true');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('button[data-filter-col="1"]').evaluate(element => element === document.activeElement), true);
      assert.equal(await page.locator('button[data-filter-col="1"]').getAttribute('aria-expanded'), 'false');
    }
  }],
  ['window blur ends resize and cancels unfinished pointer selection', async page => {
    await importRows(page, [['1', 'a'], ['8', 'b'], ['9', 'c']]);
    const handle = page.locator('[data-resize-col="0"]');
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + box.height / 2);
    const width = await page.locator('th[data-col="0"]').evaluate(element => getComputedStyle(element).width);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.notEqual(await page.locator('body').evaluate(element => getComputedStyle(element).cursor), 'col-resize', 'missing mouseup outside the window must not leave resize active');
    await page.mouse.move(box.x + 140, box.y + box.height / 2);
    assert.equal(await page.locator('th[data-col="0"]').evaluate(element => getComputedStyle(element).width), width);
    await page.mouse.up();
    const cell = page.locator('td[data-row="0"][data-col="0"]');
    await cell.click();
    // 通常の範囲選択で、ウィンドウ外へ移った際の中断を確認する。
    const start = await cell.boundingBox();
    const destination = await page.locator('td[data-row="2"][data-col="0"]').boundingBox();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.mouse.up();
    assert.equal(await copyOutput(page), '1,a\n8,b\n9,c', 'an interrupted pointer gesture must not change data when the mouse returns');
    assert.equal(await page.locator('#dataTable.selecting-cells').count(), 0);
  }],
  ['HTML export preserves carriage returns in headers and cells', async page => {
    const rows = [['head\rname', 'head\r\nname'], ['left\rright', 'left\r\nright'], ['line\nend', '<b>&\rtext']];
    // ファイル読み込みはCRを保持するが、テキストエリアは改行を正規化する。
    await page.evaluate(() => { window.showOpenFilePicker = undefined; });
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#openFileBtn').click();
    await (await chooser).setFiles({name:'returns.csv', mimeType:'text/csv', buffer:Buffer.from(quoteCsv(rows))});
    await page.locator('#wizHeader').check();
    await page.locator('#wizNextBtn').click();
    await page.locator('#wizImportBtn').click();
    await page.locator('#importWizardOverlay.show').waitFor({state:'hidden'});
    await page.locator('#exportWizardBtn').click();
    await page.locator('#expFormat').selectOption('html');
    await page.evaluate(() => Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.__qaExport=text}}));
    await page.locator('#expCopyBtn').click();
    await page.waitForFunction(() => typeof window.__qaExport === 'string');
    const parsed = await page.evaluate(() => Array.from(new DOMParser().parseFromString(window.__qaExport, 'text/html').querySelectorAll('tr'), row => Array.from(row.children, cell => cell.textContent)));
    assert.deepEqual(parsed, rows, 'HTML parsing must not silently turn CR and CRLF into LF');
  }],
  ['line breaks at search highlight boundaries survive copying and history', async page => {
    await importRows(page, [['headtail', 'other']]);
    await page.locator('#searchInput').fill('head');
    await page.waitForFunction(() => !document.querySelector('#replaceAllBtn').disabled);
    const cell = page.locator('td[data-row="0"][data-col="0"]');
    await cell.click();
    await cell.evaluate(element => {
      const range = document.createRange();
      range.setStart(element.querySelector('mark').firstChild, 4);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.keyboard.press('Shift+Enter');
    assert.equal(await copyOutput(page), '"head\ntail",other');
    await page.locator('#searchClearBtn').click();
    await page.locator('#undoBtn').click();
    assert.equal(await copyOutput(page), 'headtail,other');
    await page.locator('#redoBtn').click();
    assert.equal(await copyOutput(page), '"head\ntail",other');
  }],
  ['keyboard history preserves the restored data and redo stack', async page => {
    await importRows(page, [['before', 'b'], ['c', 'd']]);
    const cell = page.locator('td[data-row="0"][data-col="0"]');
    await cell.click();
    await cell.fill('edited');
    await page.keyboard.press('Control+z');
    assert.equal(await cell.textContent(), 'before');
    assert.equal(await page.locator('#redoBtn').isEnabled(), true, 'render-time blur must not replace the redo stack with a new edit');
    assert.equal(await copyOutput(page), 'before,b\nc,d', 'the restored view and output must agree');
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await copyOutput(page), 'edited,b\nc,d');
    await cell.click();
    await page.keyboard.press('Meta+z');
    assert.equal(await copyOutput(page), 'before,b\nc,d');
    await cell.click();
    await page.keyboard.press('Meta+Shift+z');
    assert.equal(await copyOutput(page), 'edited,b\nc,d');
    await page.locator('#searchInput').fill('edited');
    await page.waitForFunction(() => !document.querySelector('#replaceAllBtn').disabled);
    await cell.click();
    await cell.fill('second edit');
    await page.keyboard.press('Control+z');
    await page.waitForFunction(() => document.querySelector('#searchInfo').textContent.includes('一致なし'));
    assert.equal(await copyOutput(page), 'before,b\nc,d');
  }],
  ['selection aggregates include the uncommitted cell draft', async page => {
    await importRows(page, [['1.1', '2.2']]);
    await page.locator('#settingsBtn').click();
    await page.locator('#settingShowStatusBar').check();
    await page.locator('#settingsCloseBtn').click();
    const cell = page.locator('td[data-row="0"][data-col="0"]');
    await cell.click();
    await cell.fill('9007199254740993.1');
    await page.waitForFunction(() => document.querySelector('[data-status-sum]').textContent === '9,007,199,254,740,993.1');
    assert.equal(await cell.evaluate(element => element === document.activeElement), true, 'aggregation must preserve the editor and caret');
    await page.locator('td[data-row="0"][data-col="1"]').click({ modifiers: ['Shift'] });
    await page.waitForFunction(() => document.querySelector('[data-status-sum]').textContent === '9,007,199,254,740,995.3');
    await cell.fill('-2.2');
    await page.waitForFunction(() => document.querySelector('[data-status-sum]').textContent === '0');
    assert.equal(await page.locator('[data-status-numeric]').textContent(), '2');
    await cell.click();
    await cell.fill('');
    await page.waitForFunction(() => document.querySelector('[data-status-count]').textContent === '0');
    assert.equal(await page.locator('#statusBarSum').isVisible(), false);
    assert.equal(await copyOutput(page), ',2.2');
    await page.locator('#undoBtn').click();
    assert.equal(await copyOutput(page), '1.1,2.2', 'live statistics must not create additional undo steps');
  }],
  ['null characters survive rendering, search and editing', async page => {
    const value = 'left\0right';
    await page.locator('#pasteBtn').click();
    // ファイル読み込みと同様に、入力中の制御文字を保持する。
    await page.locator('#pasteImportInput').evaluate((element, text) => {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, `${value},other`);
    await page.locator('#pasteImportConfirmBtn').click();
    await page.locator('#pasteImportOverlay.show').waitFor({ state: 'hidden' });
    const cell = page.locator('td[data-row="0"][data-col="0"]');
    assert.equal(await cell.textContent(), value);
    await cell.click();
    assert.equal(await copyOutput(page), `${value},other`);
    await page.locator('#searchInput').fill('right');
    await page.waitForFunction(() => !document.querySelector('#replaceAllBtn').disabled);
    assert.equal(await cell.textContent(), value);
    assert.equal(await cell.locator('mark').textContent(), 'right');
    await cell.click();
    assert.equal(await copyOutput(page), `${value},other`);
    await page.locator('#searchClearBtn').click();
    await cell.fill('changed');
    await page.keyboard.press('Control+z');
    assert.equal(await copyOutput(page), `${value},other`);
    assert.equal(await cell.locator('[data-cell-null]').count(), 0);
  }],
  ['HTML export escapes text without allocating a DOM node per cell', async page => {
    const values = ['<img src=x onerror=alert(1)>', '&amp; "quote" \'apostrophe\'', '日本語😀\u00a0text'];
    const rows = Array.from({ length: 1200 }, () => values);
    await importRows(page, rows);
    await page.locator('#exportWizardBtn').click();
    await page.locator('#expFormat').selectOption('html');
    await page.waitForFunction(() => document.querySelector('#expPreview').textContent.startsWith('<table>'));
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: async text => { window.__qaExport = text; } } });
      const original = document.createElement.bind(document);
      window.__qaCreatedDivs = 0;
      document.createElement = (tag, ...args) => {
        if (tag === 'div') window.__qaCreatedDivs++;
        return original(tag, ...args);
      };
    });
    await page.locator('#expCopyBtn').click();
    await page.waitForFunction(() => typeof window.__qaExport === 'string');
    assert.ok(await page.evaluate(() => window.__qaCreatedDivs) < 20, 'export must not allocate thousands of temporary escaping elements');
    const output = await page.evaluate(() => {
      const parsed = new DOMParser().parseFromString(window.__qaExport, 'text/html');
      return { rows: Array.from(parsed.querySelectorAll('tr'), row => Array.from(row.children, cell => cell.textContent)),
        images: parsed.querySelectorAll('img').length };
    });
    assert.deepEqual(output.rows, rows);
    assert.equal(output.images, 0);
  }],
  ['combined column filters retain unchecked values on reapply', async page => {
    await importRows(page, [['group1', 'A'], ['group1', 'C'], ['group2', 'B'], ['group2', 'C']]);
    await page.locator('button[data-filter-col="1"]').click();
    await page.locator('#colFilterValues label[data-value="B"] input').uncheck();
    await page.locator('#colFilterApplyBtn').click();
    await page.locator('button[data-filter-col="0"]').click();
    await page.locator('#colFilterValues label[data-value="group1"] input').uncheck();
    await page.locator('#colFilterApplyBtn').click();
    await page.locator('button[data-filter-col="1"]').click();
    assert.equal(await page.locator('#colFilterValues label[data-value="B"] input').isChecked(), false);
    await page.locator('#colFilterApplyBtn').click();
    assert.deepEqual(await matrix(page), [['group2', 'C']], 'reapplying must not include a value whose checkbox remains unchecked');
  }],
  ['reopening a column filter resets its value search', async page => {
    await importRows(page, [['A'], ['B']]);
    await page.locator('button[data-filter-col="0"]').click();
    await page.locator('#colFilterSearch').fill('A');
    assert.equal(await page.locator('#colFilterValues input').count(), 1);
    await page.locator('#colFilterClose').click();
    await page.locator('button[data-filter-col="0"]').click();
    assert.equal(await page.locator('#colFilterSearch').inputValue(), '');
    assert.equal(await page.locator('#colFilterValues input').count(), 2, 'a blank value search must display all values when the panel reopens');
  }],
  ['filter value loading preserves existing and early selections', async page => {
    for (const action of ['preserve', 'none', 'all']) {
      const rows = Array.from({length: 8000}, (_, i) => [i < 2 ? 'A' : 'B', String(i)]);
      await importRows(page, rows);
      await page.locator('button[data-filter-col="0"]').click();
      await page.locator('#colFilterValues label[data-value="B"] input').uncheck();
      await page.locator('#colFilterApplyBtn').click();
      await page.waitForFunction(() => document.querySelectorAll('#tableBody tr[data-row]').length === 2);
      await page.locator('td[data-row="0"][data-col="1"]').fill('edited');
      await page.locator('#searchInput').click();
      await page.evaluate(() => {
        const original = Worker.prototype.postMessage;
        const pending = [];
        window.__qaValueRequests = 0;
        Worker.prototype.postMessage = function(packet, ...args) {
          if (packet?.type === 'valueCounts') {
            pending.push([this, packet, args]); window.__qaValueRequests++; return;
          }
          return original.call(this, packet, ...args);
        };
        window.__qaReleaseValues = () => {
          Worker.prototype.postMessage = original;
          for (const [worker, packet, args] of pending) original.call(worker, packet, ...args);
        };
      });
      await page.locator('button[data-filter-col="0"]').click();
      await page.waitForFunction(() => window.__qaValueRequests === 1);
      assert.equal(await page.locator('#colFilterValues input').count(), 0, 'the value list must still be loading');
      if (action !== 'preserve') await page.locator(action === 'none' ? '#colFilterSelectNone' : '#colFilterSelectAll').click();
      await page.locator('#colFilterApplyBtn').click();
      await page.locator('#colFilterPanel.show').waitFor({state:'hidden'});
      const visibleCount = await page.locator('#tableBody tr[data-row]').count();
      if (action === 'preserve') assert.equal(visibleCount, 2, 'applying before values load must retain the existing value restriction');
      if (action === 'none') assert.equal(visibleCount, 0, 'early deselection must be respected');
      if (action === 'all') assert.ok(visibleCount > 2, 'early select-all must clear the previous restriction');
      await page.evaluate(() => window.__qaReleaseValues());
      await page.locator('#searchInput').click();
      if (action !== 'all') await clearFilters(page);
      assert.equal((await matrix(page))[0][1], 'edited');
    }
  }],
  ['literal Unicode search and replacement use the same matches', async page => {
    await importRows(page, [['σ'], ['ς'], ['Σ'], ['other']]);
    await page.locator('#searchInput').fill('σ');
    await page.waitForFunction(() => !document.querySelector('#replaceAllBtn').disabled);
    assert.equal(await page.locator('td.highlight').count(), 3, 'Greek sigma variants must agree with case-insensitive replacement');
    assert.equal(await page.locator('mark.search-text-hit').count(), 3);
    await page.locator('#replaceInput').fill('changed');
    await page.locator('#replaceAllBtn').click();
    await page.waitForFunction(() => document.querySelector('td[data-row="0"][data-col="0"]').textContent === 'changed');
    await page.locator('#searchClearBtn').click();
    assert.deepEqual(await matrix(page), [['changed'], ['changed'], ['changed'], ['other']]);
    await page.locator('#undoBtn').click();
    assert.deepEqual(await matrix(page), [['σ'], ['ς'], ['Σ'], ['other']]);
  }],
  ['Worker search preserves Unicode case matching', async page => {
    const rows = Array.from({length: 12000}, () => ['other']);
    rows.splice(-3, 3, ['ς'], ['K'], ['𐐀']);
    await importRows(page, rows);
    for (const [query, expected] of [['σ', 'ς'], ['k', 'K'], ['𐐨', '𐐀']]) {
      await filter(page, query);
      assert.deepEqual(await matrix(page), [[expected]]);
      assert.equal(await page.locator('mark.search-text-hit').textContent(), expected);
    }
    await page.locator('#replaceInput').fill('replaced');
    await page.locator('#replaceAllBtn').click();
    await page.waitForFunction(() => document.querySelectorAll('#tableBody tr[data-row]').length === 0);
    await clearFilters(page);
    const expected = rows.map(row => row[0]); expected[11999] = 'replaced';
    assert.equal(await copyOutput(page), expected.join('\n'));
    await page.locator('#undoBtn').click();
    assert.equal(await copyOutput(page), rows.map(row => row[0]).join('\n'));
  }],
  ['large range edits only look up rendered cells', async page => {
    const rows = Array.from({length: 2000}, (_, i) => [`row ${i}`, 'value', 'tail']);
    await importRows(page, rows);
    await page.locator('#tableHead th.row-num').click();
    await page.evaluate(() => {
      window.__qaCellQueries = 0;
      for (const method of ['querySelector', 'querySelectorAll']) {
        const original = Element.prototype[method];
        Element.prototype[method] = function(selector) {
          if (this.id === 'dataTable' && selector.startsWith('td[data-row')) window.__qaCellQueries++;
          return original.call(this, selector);
        };
      }
    });
    await page.keyboard.press('Delete');
    assert.ok(await page.evaluate(() => window.__qaCellQueries) < 20, 'range deletion must not perform a DOM lookup for every offscreen cell');
    assert.equal(await copyOutput(page), rows.map(() => ',,').join('\n'));
    await page.locator('#undoBtn').click();
    assert.equal(await copyOutput(page), rows.map(row => row.join(',')).join('\n'));
    await page.locator('#tableHead th.row-num').click();
    await page.evaluate(() => {
      window.__qaCellQueries = 0;
      const data = new DataTransfer(); data.setData('text/plain', 'pasted');
      const event = new Event('paste', {bubbles:true, cancelable:true});
      Object.defineProperty(event, 'clipboardData', {value:data});
      document.querySelector('#tableHead th.row-num').dispatchEvent(event);
    });
    assert.ok(await page.evaluate(() => window.__qaCellQueries) < 20, 'range paste must not perform a DOM lookup for every offscreen cell');
    assert.equal(await copyOutput(page), rows.map(() => 'pasted,pasted,pasted').join('\n'));
    await page.locator('#undoBtn').click();
    assert.equal(await copyOutput(page), rows.map(row => row.join(',')).join('\n'));
  }],
  ['clearing a filter with Escape preserves pending cell input', async page => {
    await importRows(page, [['keep', 'before'], ['hide', 'other']]);
    await filter(page, 'keep');
    const cell = page.locator('td[data-row="0"][data-col="1"]');
    await cell.click();
    await cell.fill('edited while filtered');
    await page.keyboard.press('Escape'); // 先に選択範囲を解除する。
    await page.keyboard.press('Escape'); // フォーカスを移さず検索を解除する。
    await page.waitForFunction(() => document.querySelector('#searchInput').value === '');
    assert.deepEqual(await matrix(page), [['keep', 'edited while filtered'], ['hide', 'other']]);
    assert.equal(await copyOutput(page), 'keep,edited while filtered\nhide,other');
    await page.locator('#undoBtn').click();
    assert.deepEqual(await matrix(page), [['keep', 'before'], ['hide', 'other']]);
    await page.locator('#redoBtn').click();
    assert.deepEqual(await matrix(page), [['keep', 'edited while filtered'], ['hide', 'other']]);
  }],
  ['tab leaves the table at its boundaries without losing input', async page => {
    await importRows(page, [['a', 'b'], ['c', 'd']]);
    const last = page.locator('td[data-row="1"][data-col="1"]');
    await last.click();
    await last.fill('last edit');
    await page.keyboard.press('Tab');
    assert.equal(await last.evaluate(element => element === document.activeElement), false, 'Tab at the final cell must not trap keyboard focus');
    assert.equal(await copyOutput(page), 'a,b\nc,last edit');
    const first = page.locator('td[data-row="0"][data-col="0"]');
    await first.click();
    await first.fill('first edit');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await first.evaluate(element => element === document.activeElement), false, 'Shift+Tab at the first cell must leave the cell');
    assert.equal(await copyOutput(page), 'first edit,b\nc,last edit');
    await page.locator('#undoBtn').click();
    assert.equal(await copyOutput(page), 'a,b\nc,last edit');
  }],
  ['range deletion preserves pending input in undo', async page => {
    await importRows(page, [['before', 'b'], ['c', 'd']]);
    const first = page.locator('td[data-row="0"][data-col="0"]');
    await first.click();
    await first.fill('edited');
    await page.locator('td[data-row="1"][data-col="1"]').click({ modifiers: ['Shift'] });
    assert.equal(await page.locator('td.selected').count(), 4);
    await page.keyboard.press('Delete');
    assert.deepEqual(await matrix(page), [['', ''], ['', '']]);
    await page.locator('#undoBtn').click();
    assert.deepEqual(await matrix(page), [['edited', 'b'], ['c', 'd']]);
    await page.locator('#undoBtn').click();
    assert.deepEqual(await matrix(page), [['before', 'b'], ['c', 'd']]);
    await page.locator('#redoBtn').click();
    await page.locator('#redoBtn').click();
    assert.deepEqual(await matrix(page), [['', ''], ['', '']]);
  }],
  ['exact selection aggregates and filtered dimensions', async page => {
    await importRows(page, [['9007199254740993.1', 'keep'], ['-9007199254740992.2', 'hide'], ['0.1', 'keep']]);
    await page.locator('#settingsBtn').click();
    await page.locator('#settingShowStatusBar').check();
    await page.locator('#settingsCloseBtn').click();
    await page.locator('#tableHead th.row-num').click();
    await page.waitForFunction(() => document.querySelector('[data-status-numeric]').textContent === '3');
    assert.equal(await page.locator('[data-status-sum]').textContent(), '1');
    assert.equal(await page.locator('[data-status-avg]').textContent(), '0.333333');
    assert.equal(await page.locator('[data-status-min]').textContent(), '-9,007,199,254,740,992.2');
    assert.equal(await page.locator('[data-status-max]').textContent(), '9,007,199,254,740,993.1');
    await filter(page, 'keep');
    await page.waitForFunction(() => document.querySelector('[data-status-count]').textContent === '4');
    assert.match(await page.locator('[data-status-selection]').textContent(), /2×2/);
    assert.equal(await page.locator('[data-status-sum]').textContent(), '9,007,199,254,740,993.2');
    await clearFilters(page);
    await page.locator('#tableHead th.row-num').click();
    await page.evaluate(() => {
      const data = new DataTransfer(); data.setData('text/plain', '2');
      const event = new Event('paste', {bubbles:true, cancelable:true});
      Object.defineProperty(event, 'clipboardData', {value:data});
      document.querySelector('#tableHead th.row-num').dispatchEvent(event);
    });
    await page.waitForFunction(() => document.querySelector('[data-status-sum]').textContent === '12');
    assert.equal(await page.locator('[data-status-avg]').textContent(), '2');
  }],
  ['empty export filters keep preview consistent with output', async page => {
    const rows = Array.from({length: 205}, (_, i) => i < 200 ? ['', '', ''] : [`${i}`, 'keep', i === 204 ? 'late value' : '']);
    await importRows(page, rows);
    await page.locator('#tableHead th.row-num').click();
    await page.locator('#exportWizardBtn').click();
    await page.locator('#expFormat').selectOption('json');
    await page.locator('#expSkipEmptyRows').check();
    await page.locator('#expSkipEmptyCols').check();
    for (const target of ['all', 'selected']) {
      await page.locator('#expTarget').selectOption(target);
      await page.waitForFunction(() => /^\s*\[/.test(document.querySelector('#expPreview').textContent) && document.querySelector('#expPreview').textContent.includes('late value'));
      assert.deepEqual(JSON.parse(await page.locator('#expPreview').textContent()), rows.slice(200));
    }
    await page.locator('#expSkipEmptyRows').uncheck();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#expPreview').textContent).length === 200);
    assert.deepEqual(JSON.parse(await page.locator('#expPreview').textContent()), rows.slice(0, 200), 'late values must preserve their column even outside the preview');
    await page.locator('#expCancelBtn').click();
    await filter(page, 'keep');
    await page.locator('#exportWizardBtn').click();
    await page.locator('#expTarget').selectOption('filtered');
    await page.locator('#expFormat').selectOption('json');
    await page.waitForFunction(() => /^\s*\[/.test(document.querySelector('#expPreview').textContent) && document.querySelector('#expPreview').textContent.includes('late value'));
    assert.deepEqual(JSON.parse(await page.locator('#expPreview').textContent()), rows.slice(200));
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async text=>{window.__qaExport=text;}}}));
    await page.locator('#expCopyBtn').click();
    await page.waitForFunction(() => typeof window.__qaExport === 'string');
    assert.deepEqual(JSON.parse(await page.evaluate(() => window.__qaExport)), rows.slice(200));
  }],
  ['distribution download matches standalone editor', async page => {
    await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
    const downloadEvent = page.waitForEvent('download');
    await page.locator('[data-download-editor]').first().click();
    const download = await downloadEvent;
    assert.deepEqual(await fs.readFile(await download.path()), await fs.readFile(path.join(ROOT, 'LocalCSV.html')));
    assert.equal(download.suggestedFilename().toLowerCase(), 'localcsv.html');
  }],
  ['landing dialogs contain keyboard focus and restore the trigger', async page => {
    await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
    const $dialog = page.locator('#legalModal');
    assert.equal(await $dialog.isVisible(), false);
    for (const key of ['runtime', 'terms', 'privacy']) {
      const $trigger = page.locator(`[data-legal-modal="${key}"]`);
      await $trigger.click();
      assert.equal(await $dialog.evaluate(element => element.matches(':modal')), true);
      assert.equal(await $dialog.locator('[data-legal-close]').evaluate(element => element === document.activeElement), true);
      // モーダル表示中、背景の操作へプログラムでフォーカスを移そうとしても戻らない。
      await page.locator('.glass-nav-logo').evaluate(element => element.focus());
      assert.equal(await $dialog.evaluate(element => element.contains(document.activeElement)), true);
      await page.keyboard.press('Escape');
      assert.equal(await $dialog.isVisible(), false);
      assert.equal(await $trigger.evaluate(element => element === document.activeElement), true);
    }
    await page.locator('[data-legal-modal="runtime"]').click();
    await page.mouse.click(2, 2);
    assert.equal(await $dialog.isVisible(), false, 'the backdrop closes the dialog');
  }],
  ['landing content stays visible with reduced motion or disabled scripts', async page => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
    assert.equal(await page.locator('.fade-in').first().evaluate(element => getComputedStyle(element).opacity), '1');
    assert.equal(await page.locator('html').evaluate(element => getComputedStyle(element).scrollBehavior), 'auto');
    const context = await page.context().browser().newContext({ javaScriptEnabled: false });
    try {
      const staticPage = await context.newPage();
      await staticPage.goto(page.url());
      assert.equal(await staticPage.locator('.fade-in').first().evaluate(element => getComputedStyle(element).opacity), '1');
      assert.equal(await staticPage.locator('#legalModal').isVisible(), false);
    } finally {
      await context.close();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const $toggle = page.locator('#navToggle');
    await $toggle.click();
    assert.equal(await $toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#navLinks').isVisible(), true);
    const bounds = await $toggle.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44, 'the mobile menu needs an adequate touch target');
    await page.locator('#navLinks a').first().focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#navLinks').isVisible(), false);
    assert.equal(await $toggle.evaluate(element => element === document.activeElement), true);
  }],
  ['compact status bar and command palette remain usable on narrow screens', async page => {
    await importRows(page, [['商品', '価格'], ['りんご', '120']]);
    await page.locator('#settingsBtn').click();
    await page.locator('#settingShowStatusBar').check();
    await page.locator('#settingsCloseBtn').click();
    await page.setViewportSize({ width: 390, height: 844 });
    const status = await page.locator('#statusBar').evaluate(element => {
      const style = getComputedStyle(element);
      return { font: style.fontSize, gap: style.columnGap, padding: style.paddingInlineStart };
    });
    assert.deepEqual(status, { font: '12px', gap: '12px', padding: '10px' });
    await page.keyboard.press('Control+k');
    const $palette = page.locator('.palette-modal');
    await $palette.waitFor({ state: 'visible' });
    assert.equal(await $palette.evaluate(element => getComputedStyle(element).padding), '0px');
    const paletteInset = await page.locator('#paletteOverlay').evaluate(element => Number.parseFloat(getComputedStyle(element).paddingBlockStart));
    assert.ok(Math.abs(paletteInset - 84.4) < 0.1, 'the palette keeps its 10vh top inset');
    await page.keyboard.press('Escape');
    await page.locator('#themeModeToggle').click();
    assert.equal(await page.evaluate(() => document.documentElement.style.colorScheme), 'dark');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }],
  ['bounded selection preview and complete export', async page => {
    const rows = Array.from({ length: 1200 }, (_, i) => [String(i), `value-${i}`]);
    await importRows(page, rows);
    await page.locator('#tableHead th.row-num').click();
    await page.locator('#exportWizardBtn').click();
    await page.locator('#expTarget').selectOption('selected');
    await page.locator('#expFormat').selectOption('json');
    await page.waitForFunction(() => document.querySelector('#expPreview').textContent.trim().startsWith('['));
    assert.deepEqual(JSON.parse(await page.locator('#expPreview').textContent()), rows.slice(0, 200));
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: async text => { window.__qaExport = text; } } });
    });
    await page.locator('#expCopyBtn').click();
    await page.waitForFunction(() => typeof window.__qaExport === 'string');
    assert.deepEqual(JSON.parse(await page.evaluate(() => window.__qaExport)), rows);
  }],
  ['dialog focus preserves early input', async page => {
    await importRows(page, [['value']]);
    const activeId = await page.evaluate(() => {
      const original = window.requestAnimationFrame;
      const callbacks = [];
      window.requestAnimationFrame = callback => { callbacks.push(callback); return 1; };
      try { document.querySelector('#virtualHeaderBtn').click(); }
      finally { window.requestAnimationFrame = original; }
      const input = document.querySelector('#virtualHeaderPresetName');
      input.focus();
      input.value = '入力中';
      for (const callback of callbacks) callback(0);
      return document.activeElement.id;
    });
    assert.equal(activeId, 'virtualHeaderPresetName', 'delayed dialog autofocus must not steal a user-selected input');
    await page.keyboard.insertText('継続');
    assert.ok((await page.locator('#virtualHeaderPresetName').inputValue()).includes('継続'));
  }],
  ['language and theme preserve user labels', async page => {
    const title = '行を追加しました';
    await importRows(page, [[title, '設定'], ['保存', '<b>キャンセル</b>']]);
    await page.locator('#settingsBtn').click();
    await page.locator('#settingHeader').check();
    await page.locator('#settingLanguage').selectOption('en');
    await page.locator('#settingsCloseBtn').click();
    await page.locator('#themeModeToggle').click();
    const mode = await page.evaluate(() => document.documentElement.style.colorScheme);
    assert.ok(['light', 'dark'].includes(mode));
    await page.locator('#themeModeToggle').click();
    assert.notEqual(await page.evaluate(() => document.documentElement.style.colorScheme), mode);
    assert.deepEqual(await matrix(page), [['保存', '<b>キャンセル</b>']]);
    assert.equal(await page.locator('th[data-col="0"] .th-text').textContent(), title);
    assert.ok((await page.locator('#searchTargetCol option[value="0"]').textContent()).includes(title), 'search column labels must remain user data');
    await page.locator('#virtualHeaderBtn').click();
    await page.locator('#virtualHeaderPresetName').fill(title);
    await page.locator('#virtualHeaderSavePresetBtn').click();
    await page.waitForFunction(() => document.querySelector('#virtualHeaderPresetSelect').options.length === 2);
    assert.equal(await page.locator('#virtualHeaderPresetSelect option').last().textContent(), `${title} (2 columns)`);
    await page.locator('#virtualHeaderCancelBtn').click();
    await page.locator('#settingsBtn').click();
    await page.locator('#settingLanguage').selectOption('ja');
    await page.locator('#settingsCloseBtn').click();
    assert.equal(await copyOutput(page), `${title},設定\n保存,<b>キャンセル</b>`);
    assert.equal(await page.locator('#tableBody b').count(), 0);
  }],
  ['plain text cell editing', async page => {
    await importRows(page, [['original', 'other']]);
    const cell = page.locator('td[data-row="0"][data-col="0"]');
    await cell.click();
    await cell.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('bold');
      document.execCommand('italic');
    });
    assert.equal(await cell.locator('b, strong, i, em, span[style]').count(), 0, 'CSV cells must not acquire rich formatting');
    assert.equal(await cell.textContent(), 'original');
    await cell.fill('first');
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.insertText('second');
    const editingMarkup = await cell.innerHTML();
    assert.equal(await copyOutput(page), '"first\nsecond",other', editingMarkup);
    await page.locator('#undoBtn').click();
    assert.equal((await matrix(page))[0][0], 'original');
    await cell.fill('tail');
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Enter');
    const trailingMarkup = await cell.evaluate(element => ({ html: element.innerHTML, text: element.innerText,
      nodes: Array.from(element.childNodes, node => ({type: node.nodeType, value: node.nodeValue, name: node.nodeName})) }));
    assert.equal(await copyOutput(page), '"tail\n",other', JSON.stringify(trailingMarkup));
    await cell.fill('hello');
    await cell.evaluate(element => {
      const range = document.createRange();
      range.setStart(element.firstChild, 2);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.insertText('X');
    assert.equal(await copyOutput(page), '"he\n\nXllo",other', 'insert two line breaks in the middle without losing surrounding text');
  }],
  ['HTML-only and whitespace paste', async page => {
    await importRows(page, [['original', 'other']]);
    const cell = page.locator('td[data-row="0"][data-col="0"]');
    await cell.click();
    const paste = text => cell.evaluate((element, value) => {
      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: {
        getData: type => type === 'text/html' ? '<img src=x onerror="window.__qaInjected=true">' : value,
        types: ['text/plain', 'text/html'],
      } });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }, text);
    assert.equal(await paste(''), true, 'HTML-only clipboard must not reach native rich paste');
    assert.deepEqual(await matrix(page), [['original', 'other']]);
    assert.equal(await paste('  '), true);
    assert.deepEqual(await matrix(page), [['  ', 'other']]);
    await page.locator('#undoBtn').click();
    assert.deepEqual(await matrix(page), [['original', 'other']]);
    await cell.click();
    assert.equal(await paste('\t'), true);
    assert.deepEqual(await matrix(page), [['', '']]);
    await page.locator('#undoBtn').click();
    assert.deepEqual(await matrix(page), [['original', 'other']]);
    assert.equal(await page.locator('#tableBody img').count(), 0);
  }],
  ['failed save cleanup and retry', async page => {
    await importRows(page, [['intact', 'value']]);
    await page.evaluate(() => {
      window.__qaWrites = [];
      window.showSaveFilePicker = async () => ({ name: 'failed.csv', createWritable: async () => ({
        write: async () => { window.__qaWrites.push('write'); throw new Error('forced write failure'); },
        close: async () => { window.__qaWrites.push('close'); },
        abort: async () => { window.__qaWrites.push('abort'); throw new Error('forced cleanup failure'); },
      }) });
    });
    const download = page.waitForEvent('download');
    await page.locator('#saveBtn').click();
    assert.equal((await fs.readFile(await (await download).path())).toString().replace(/^\uFEFF/, ''), 'intact,value');
    assert.deepEqual(await page.evaluate(() => window.__qaWrites), ['write', 'abort']);
    await page.evaluate(() => { window.showSaveFilePicker = undefined; });
    const retry = page.waitForEvent('download');
    await page.locator('#saveBtn').click();
    await (await retry).path();
    assert.deepEqual(await matrix(page), [['intact', 'value']]);
  }],
  ['UTF-8 content BOM byte preservation', async page => {
    const text = '\uFEFF名前,😀\r\n𠮷野,値';
    const bytes = Buffer.from('\uFEFF' + text, 'utf8');
    // 標準のファイル入力はlocalcsv-browser.test.mjsで検証する。このケースでは、
    // ファイル選択UIのタイミングに依存せず、読み込み処理に渡すバイト列を検証する。
    await page.evaluate(data => {
      const file = new File([new Uint8Array(data)], 'bom-content.csv', { type: 'text/csv' });
      window.showOpenFilePicker = async () => [{ name: file.name, getFile: async () => file }];
    }, Array.from(bytes));
    await page.locator('#openFileBtn').click();
    await page.locator('#importWizardOverlay.show').waitFor();
    await page.locator('#wizNextBtn').click();
    await page.locator('#wizImportBtn').click();
    await page.locator('#importWizardOverlay.show').waitFor({ state: 'hidden' });
    assert.deepEqual(await matrix(page), [['\uFEFF名前', '😀'], ['𠮷野', '値']]);
    const download = page.waitForEvent('download');
    await page.locator('#dlBtn').click();
    assert.deepEqual(await fs.readFile(await (await download).path()), bytes);
  }],
  ['literal Markdown export', async page => {
    await importRows(page, [['**title**', '[link](url)'], ['`code`', '_text_ ~~strike~~']]);
    await page.locator('#exportWizardBtn').click();
    await page.locator('#expFormat').selectOption('markdown');
    await page.waitForFunction(() => document.querySelector('#expPreview').textContent.includes('\\*\\*title\\*\\*'));
    const output = await page.locator('#expPreview').textContent();
    assert.ok(output.includes('\\[link\\](url)'));
    assert.ok(output.includes('\\`code\\`'));
    assert.ok(output.includes('\\_text\\_ \\~\\~strike\\~\\~'));
  }],
  ['filtered sort and history', async page => {
    const rows = [['30', 'keep'], ['10', 'hide'], ['20', 'keep']];
    await importRows(page, rows);
    await filter(page, 'keep');
    await sort(page, 'asc');
    await page.waitForFunction(() => document.querySelector('#replaceNextBtn').disabled === false
      && document.querySelector('td[data-col="0"]')?.textContent === '20');
    assert.deepEqual(await matrix(page), [['20', 'keep'], ['30', 'keep']]);
    await page.locator('#undoBtn').click();
    await page.waitForFunction(() => document.querySelector('#replaceNextBtn').disabled === false
      && document.querySelector('td[data-col="0"]')?.textContent === '30');
    assert.deepEqual(await matrix(page), [['30', 'keep'], ['20', 'keep']]);
    await page.locator('#redoBtn').click();
    await page.waitForFunction(() => document.querySelector('#replaceNextBtn').disabled === false
      && document.querySelector('td[data-col="0"]')?.textContent === '20');
    assert.deepEqual(await matrix(page), [['20', 'keep'], ['30', 'keep']]);
    await clearFilters(page);
    assert.deepEqual(await matrix(page), [['10', 'hide'], ['20', 'keep'], ['30', 'keep']]);
  }],
  ['multiline delimiter detection', async page => {
    const note = Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n');
    await page.locator('#pasteBtn').click();
    await page.locator('#pasteImportInput').fill(`"${note}"\tone\n"${note}"\ttwo`);
    await page.locator('#pasteImportConfirmBtn').click();
    await page.locator('#pasteImportOverlay.show').waitFor({ state: 'hidden' });
    assert.deepEqual(await matrix(page), [[note, 'one'], [note, 'two']]);
  }],
];

{ // 本体の業務UIを含め、すべての対象HTMLで検証する。
  CASES.push(['conditional panels retain their values and expose only applicable controls', async page => {
    const advanced = page.locator('#searchAdvanced');
    const toggle = page.locator('#searchAdvancedToggle');
    assert.equal(await advanced.isVisible(), false);
    await toggle.click();
    assert.equal(await advanced.isVisible(), true);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await page.locator('#searchExactMatch').check();
    await toggle.click();
    assert.equal(await advanced.isVisible(), false);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click();
    assert.equal(await page.locator('#searchExactMatch').isChecked(), true);

    await importRows(page, [['a', '10'], ['b', '20']]);
    await page.locator('button[data-filter-col="0"]').click();
    const operator = page.locator('.col-filter-op');
    const value = page.locator('.col-filter-cond-val');
    await operator.selectOption('contains');
    await value.fill('a');
    await operator.selectOption('empty');
    assert.equal(await value.isVisible(), false);
    await operator.selectOption('contains');
    assert.equal(await value.isVisible(), true);
    assert.equal(await value.inputValue(), 'a');
    await page.locator('#colFilterClose').click();

    await page.locator('#exportWizardBtn').click();
    for (const format of ['csv', 'json', 'ndjson', 'html', 'markdown', 'tsv', 'ssv', 'txt']) {
      await page.locator('#expFormat').selectOption(format);
      const isDsv = ['csv', 'tsv', 'ssv', 'txt'].includes(format);
      for (const id of ['expQuoteGroup', 'expEncodingGroup', 'expBomGroup', 'expFormulaGuardGroup']) {
        assert.equal(await page.locator(`#${id}`).isVisible(), isDsv, `${format}: ${id}`);
      }
      assert.equal(await page.locator('#expNewlineGroup').isVisible(), isDsv || format === 'ndjson');
    }
    await page.locator('#expCancelBtn').click();
  }]);
  CASES.push(['resized columns stay aligned when virtual rows are replaced', async page => {
    await importRows(page, Array.from({ length: 2000 }, (_, index) => [`row-${index}`, String(index)]));
    const header = page.locator('th[data-col="0"]');
    const originalWidth = (await header.boundingBox()).width;
    const handle = await page.locator('[data-resize-col="0"]').boundingBox();
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80, y);
    await page.mouse.up();
    const resizedWidth = (await header.boundingBox()).width;
    assert.ok(resizedWidth >= originalWidth + 75, 'drag must visibly widen the column');
    assert.notEqual(await page.locator('body').evaluate(element => getComputedStyle(element).cursor), 'col-resize');
    // Firefoxの編集カーソルによる遅延スクロールを終えてから、仮想行を切り替える。
    await page.locator('#searchInput').focus();
    await page.waitForFunction(() => document.querySelector('#saveStatus').dataset.state === 'saved');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.locator('#tableScroll').evaluate(element => { element.scrollTop = element.scrollHeight; });
    // 仮想行の差し替え中に、切り離された旧セルの寸法を読まない。
    const dimensions = await page.waitForFunction(() => {
      const cell = document.querySelector('td[data-row="1999"][data-col="0"]');
      const header = document.querySelector('th[data-col="0"]');
      if (!cell || !header) return null;
      const widths = [header, cell].map(element => element.getBoundingClientRect().width);
      return widths.every(width => width > 0) ? widths : null;
    });
    const [headerWidth, lastCellWidth] = await dimensions.jsonValue();
    assert.ok(Math.abs(headerWidth - resizedWidth) <= 1, 'the column width must persist after scrolling');
    assert.ok(Math.abs(lastCellWidth - headerWidth) <= 1, 'new virtual rows must align with their header');
    assert.ok(await page.locator('tr.virtual-spacer').first().evaluate(element => element.getBoundingClientRect().height > 0));
  }]);
  CASES.push(['theme restoration keeps labels and avoids redundant writes', async page => {
    const assertPrimaryColor = async () => {
      const background = await page.locator('#settingsCloseBtn').evaluate(element => getComputedStyle(element).backgroundColor);
      assert.notEqual(background, 'rgba(0, 0, 0, 0)', 'primary buttons must retain their theme background');
    };
    await assertPrimaryColor();
    await page.locator('#themeModeToggle').click();
    await page.locator('#settingsBtn').click();
    await page.locator('.theme-swatch[data-accent="sumire"]').click();
    await page.locator('#settingLanguage').selectOption('en');
    await page.locator('#settingsCloseBtn').click();
    await page.addInitScript(() => {
      window.__qaThemeWrites = 0;
      const _put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (_value, _key) {
        if (_key === 'csvEditor_theme') window.__qaThemeWrites++;
        return _put.call(this, _value, _key);
      };
    });
    await page.reload();
    await page.waitForFunction(() => document.documentElement.lang === 'en'
      && document.documentElement.style.colorScheme === 'dark'
      && document.querySelector('.theme-swatch.active')?.dataset.accent === 'sumire');
    assert.equal(await page.evaluate(() => window.__qaThemeWrites), 0, 'restoring a saved theme must not write it again');
    await assertPrimaryColor();
    assert.equal(await page.locator('#themeModeToggle').getAttribute('aria-label'), 'Toggle theme');
    await page.locator('#themeModeToggle').click();
    await page.waitForFunction(() => window.__qaThemeWrites === 1);
    assert.equal(await page.evaluate(() => document.documentElement.style.colorScheme), 'light');
    assert.equal(await page.locator('#themeModeToggle').getAttribute('aria-label'), 'Toggle theme');
    await page.locator('#settingsBtn').click();
    await page.locator('#settingLanguage').selectOption('ja');
    assert.equal(await page.locator('#themeModeToggle').getAttribute('aria-label'), 'テーマ切替');
    await page.locator('#settingLanguage').selectOption('en');
    assert.equal(await page.locator('#themeModeToggle').getAttribute('aria-label'), 'Toggle theme');
  }]);
}

for (const engine of ENGINES) {
  const executablePath = process.env[`LOCALCSV_${engine.toUpperCase()}_PATH`];
  const browser = await playwright[engine].launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const errors = [];
  try {
    for (const [name, run] of CASES) {
      const context = await browser.newContext({ locale: 'ja-JP', acceptDownloads: true });
      context.setDefaultTimeout(15000);
      context.on('request', request => {
        if (/^https?:/i.test(request.url())) errors.push(`${name}: unexpected network request ${request.url()}`);
      });
      const page = await context.newPage();
      page.on('filechooser', () => {});
      page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
      page.on('console', message => { if (message.type() === 'error') errors.push(`${name}: ${message.text()}`); });
      await page.goto(pathToFileURL(path.join(ROOT, EDITOR_FILE)).href);
      await page.locator('#pasteZone').waitFor();
      await page.waitForTimeout(150);
      try { await run(page); }
      catch (error) {
        console.log(await page.evaluate(() => ({
          scenario: document.title,
          presetName: document.querySelector('#virtualHeaderPresetName')?.value,
          presetStatus: document.querySelector('#virtualHeaderStatus')?.textContent,
          presets: document.querySelector('#virtualHeaderPresetSelect')?.innerHTML,
          overlays: Array.from(document.querySelectorAll('.modal-overlay.show'), node => node.id),
        })));
        throw error;
      }
      await context.close();
      console.log(`${engine}: ${name} passed`);
    }
    assert.deepEqual(errors, [], 'No uncaught exceptions or console errors');
    console.log(`${engine} ${browser.version()}: ${CASES.length} cases, 0 errors`);
  } finally {
    await browser.close();
  }
}
