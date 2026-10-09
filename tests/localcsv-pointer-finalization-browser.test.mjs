import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.LOCALCSV_CHROMIUM_PATH});
const errors=[];
const rows=Array.from({length:12},(_,r)=>Array.from({length:6},(_,c)=>`${r}:${c}`));
try {
 const context=await browser.newContext({locale:'ja-JP',viewport:{width:1440,height:900}}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(pathToFileURL(path.join(ROOT,'local-csv.html')).href);
 await page.locator('#pasteBtn').click();await page.locator('#pasteImportInput').fill(rows.map(r=>r.join(',')).join('\n'));await page.locator('#pasteImportConfirmBtn').click();
 await page.locator('#pasteImportOverlay.show').waitFor({state:'hidden'});
 // The final movement must survive a release before the scheduled frame.
 await page.evaluate(()=>{
  const qs=s=>document.querySelector(s),mouse=($el,type,x=0)=>$el.dispatchEvent(new MouseEvent(type,{bubbles:true,clientX:x,buttons:type==='mouseup'?0:1}));
  mouse(qs('td[data-row="0"][data-col="0"]'),'mousedown');
  mouse(qs('td[data-row="8"][data-col="4"]'),'mousemove');
  mouse(qs('td[data-row="2"][data-col="1"]'),'mousemove');mouse(document,'mouseup');
 });
 assert.equal(await page.locator('td.selected').count(),6,'only the final contracted range is selected');
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copy=text}}}));
 await page.keyboard.press('Control+c');await page.waitForFunction(()=>typeof window.__copy==='string');
 assert.equal(await page.evaluate(()=>window.__copy),'0:0\t0:1\n1:0\t1:1\n2:0\t2:1');
 const width=await page.locator('th[data-col="0"]').evaluate($el=>$el.offsetWidth);
 await page.evaluate(()=>{
  const $handle=document.querySelector('[data-resize-col="0"]'),b=$handle.getBoundingClientRect(),x=b.left+b.width/2;
  const mouse=($el,type,dx)=>$el.dispatchEvent(new MouseEvent(type,{bubbles:true,clientX:x+dx,clientY:b.top+b.height/2,buttons:type==='mouseup'?0:1}));
  mouse($handle,'mousedown',0);mouse(document,'mousemove',80);mouse(document,'mousemove',45);mouse(document,'mouseup',45);
 });
 assert.equal(await page.locator('th[data-col="0"]').evaluate($el=>$el.offsetWidth),width+45);
 await page.waitForFunction(()=>document.querySelector('#saveStatus')?.dataset.state==='saved');
 await page.reload();await page.locator('#modalConfirmBtn').click();
 assert.equal(await page.locator('th[data-col="0"]').evaluate($el=>$el.offsetWidth),width+45,'final width persists');
 // A drop may differ from both the painted preview and the pending dragover.
 await page.evaluate(async()=>{
  const qs=s=>document.querySelector(s),dt=new DataTransfer();
  const point=$el=>{const b=$el.getBoundingClientRect();return{x:b.left+b.width*.75,y:b.top+b.height*.75}};
  const drag=($el,type,p)=>$el.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:dt,clientX:p.x,clientY:p.y}));
  const $handle=qs('[data-col-drag="0"]');drag($handle,'dragstart',point($handle));
  drag(qs('#tableScroll'),'dragover',point(qs('th[data-col="1"]')));
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  drag(qs('#tableScroll'),'dragover',point(qs('th[data-col="2"]')));
  drag(qs('#tableScroll'),'drop',point(qs('th[data-col="3"]')));
 });
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copy=text}}}));
 await page.locator('#copyBtn').click();await page.waitForFunction(()=>typeof window.__copy==='string');
 const expected=rows.map(row=>{const r=[...row],v=r.shift();r.splice(3,0,v);return r.join(',');}).join('\n');
 assert.equal(await page.evaluate(()=>window.__copy),expected,'actual drop location wins');
 assert.equal(await page.locator('.drag-insert-before,.drag-insert-after,.is-dragging').count(),0,'no stale preview remains');
 assert.deepEqual(errors,[]);await context.close();
 console.log('PASS final selection/copy, resize/reload, painted+pending preview vs actual drop, 0 console errors');
}finally {await browser.close();}
