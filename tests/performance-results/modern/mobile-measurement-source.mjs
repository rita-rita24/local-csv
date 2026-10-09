import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const ROOT=process.cwd();
const {chromium}=createRequire(path.join(ROOT,'package.json'))('playwright');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const records=[];
try {
 for(const [variant,file] of [['before','/private/tmp/localcsv-modern-before/local-csv.html'],['after',path.join(ROOT,'local-csv.html')]]) {
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,locale:'ja-JP'}),page=await context.newPage();
  await page.goto(pathToFileURL(file).href);
  await page.locator('#pasteBtn').click();await page.locator('#pasteImportInput').fill('項目,数量\n商品A,10');await page.locator('#pasteImportConfirmBtn').click();await page.locator('#pasteImportOverlay.show').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#saveStatus').dataset.state==='saved');
  await page.evaluate(()=>document.fonts.ready);
  const geometry=await page.evaluate(()=>({tableTop:document.querySelector('#tableScroll').getBoundingClientRect().top,searchHeight:document.querySelector('.search-bar').getBoundingClientRect().height,bodyWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth}));
  await page.screenshot({path:path.join(ROOT,'tests/performance-results/modern/mobile-'+variant+'.png')});
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__out=text}}}));
  await page.locator('#toolbarMore summary').click();await page.locator('#copyBtn').click();await page.waitForFunction(()=>typeof window.__out==='string');
  records.push({variant,geometry,output:await page.evaluate(()=>window.__out)});await context.close();
 }
 assert.equal(records[0].output,records[1].output);
 await fs.writeFile(path.join(ROOT,'tests/performance-results/modern/mobile-layout.json'),JSON.stringify({browser:browser.version(),viewport:[390,844],records},null,2));
 console.log(JSON.stringify(records));
} finally {await browser.close();}
