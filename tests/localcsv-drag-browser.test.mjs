import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.LOCALCSV_CHROMIUM_PATH});
const results=[],errors=[];
const RUNS=Number(process.env.LOCALCSV_DRAG_RUNS||7);
const BEFORE=process.env.LOCALCSV_DRAG_BEFORE||'/private/tmp/localcsv-drag-before';
const ROWS=2000,COLS=50,EVENTS=120;
const text=Array.from({length:ROWS},(_,r)=>Array.from({length:COLS},(_,c)=>`${r}:${c}`).join(',')).join('\n');
const painted=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const copy=async page=>{await page.evaluate(()=>{window.__copy=null;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copy=text}}});});await page.locator('#copyBtn').click();await page.waitForFunction(()=>typeof window.__copy==='string');return page.evaluate(()=>window.__copy);};
try {
 for(let run=0;run<RUNS;run++)for(const version of(run%2?['after','before']:['before','after']))for(const operation of ['selection','resize','column-preview','column-drop','row-drop']){
  const context=await browser.newContext({locale:'ja-JP',viewport:{width:1440,height:900}}),page=await context.newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))errors.push('unexpected external request')});
  await page.goto(pathToFileURL(path.join(version==='before'?BEFORE:ROOT,'local-csv.html')).href);
  await page.locator('#pasteBtn').click();await page.locator('#pasteImportInput').evaluate(($input,text)=>{$input.value=text;$input.dispatchEvent(new Event('input',{bubbles:true}));},text);await page.locator('#pasteImportConfirmBtn').click();await page.locator('#pasteImportOverlay.show').waitFor({state:'hidden'});await painted(page);
  const measured=await page.evaluate(async({operation,events})=>{
   const qs=(s,r=document)=>r.querySelector(s);
   const $cell=qs('td[data-row="0"][data-col="0"]');
   const mouse=($target,type,point={x:0,y:0})=>$target.dispatchEvent(new MouseEvent(type,{bubbles:true,clientX:point.x,clientY:point.y,buttons:type==='mouseup'?0:1}));
   const dataTransfer=new DataTransfer();
   const drag=($target,type,point)=>$target.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer,clientX:point.x,clientY:point.y}));
   const point=$el=>{const b=$el.getBoundingClientRect();return{x:b.left+b.width*.75,y:b.top+b.height*.75}};
   let verify;
   const nativeFrame=window.requestAnimationFrame.bind(window);
   let deferredMs=0;
   window.requestAnimationFrame=callback=>nativeFrame(time=>{const begin=performance.now();try{callback(time);}finally{deferredMs+=performance.now()-begin;}});
   const start=performance.now();
   if(operation==='selection'){
    mouse($cell,'mousedown');
    for(let i=0;i<events;i++)mouse(qs(`td[data-row="${i%10+1}"][data-col="${i%6+1}"]`),'mousemove');
    mouse(document,'mouseup');verify=()=>qs('td[data-row="10"][data-col="6"]').classList.contains('selected')&&qs('td[data-row="0"][data-col="0"]').classList.contains('selected')&&qs('#tableEditHint').textContent.includes('77');
   }else if(operation==='resize'){
    const $handle=qs('[data-resize-col="0"]'),p=point($handle),original=qs('th[data-col="0"]').offsetWidth;
    mouse($handle,'mousedown',p);for(let i=1;i<=events;i++)mouse(document,'mousemove',{x:p.x+i,y:p.y});mouse(document,'mouseup',{x:p.x+events,y:p.y});
    verify=()=>Math.abs(qs('th[data-col="0"]').offsetWidth-original-events)<=1&&!document.body.classList.contains('resizing-columns');
   }else{
    const row=operation==='row-drop';const $handle=qs(row?'[data-row-drag="0"]':'[data-col-drag="0"]');
    drag($handle,'dragstart',point($handle));
    for(let i=0;i<(operation.endsWith('drop')?1:events);i++){const $target=qs(row?'tr[data-row="3"]':`th[data-col="${operation.endsWith('drop')?3:i%4+1}"]`);drag(qs('#tableScroll'),'dragover',point($target));}
    if(operation.endsWith('drop')){const p=point(qs(row?'tr[data-row="3"]':'th[data-col="3"]'));drag(qs('#tableScroll'),'drop',p);verify=()=>qs('td[data-row="0"][data-col="0"]').textContent===(row?'1:0':'0:1');}
    else verify=()=>qs('th[data-col="4"]').classList.contains('drag-insert-after');
   }
   const handlerMs=performance.now()-start;
   await new Promise(resolve=>nativeFrame(()=>nativeFrame(resolve)));
   window.requestAnimationFrame=nativeFrame;
   if(!verify())throw Error('Invalid final '+operation);
   const readyMs=performance.now()-start;
   if(operation==='column-preview')drag($cell,'dragend',point($cell));
   return{handlerMs,workMs:handlerMs+deferredMs,readyMs};
  },{operation,events:EVENTS});
  results.push({run,version,operation,...measured});
  if(operation.endsWith('drop')){
   const expected=text.split('\n').map(line=>line.split(','));
   if(operation==='column-drop')for(const row of expected){const [cell]=row.splice(0,1);row.splice(3,0,cell);}else{const [row]=expected.splice(0,1);expected.splice(3,0,row);}
   assert.equal(crypto.createHash('sha256').update(await copy(page)).digest('hex'),crypto.createHash('sha256').update(expected.map(row=>row.join(',')).join('\n')).digest('hex'),'all values and order after drop');
   await page.locator('#undoBtn').click();assert.equal(crypto.createHash('sha256').update(await copy(page)).digest('hex'),crypto.createHash('sha256').update(text).digest('hex'),'undo restores every cell');
   await page.locator('#redoBtn').click();assert.equal(crypto.createHash('sha256').update(await copy(page)).digest('hex'),crypto.createHash('sha256').update(expected.map(row=>row.join(',')).join('\n')).digest('hex'),'redo restores moved data');
   await page.waitForFunction(()=>document.querySelector('#saveStatus')?.dataset.state==='saved');await page.reload();await page.locator('#modalConfirmBtn').click();assert.equal(crypto.createHash('sha256').update(await copy(page)).digest('hex'),crypto.createHash('sha256').update(expected.map(row=>row.join(',')).join('\n')).digest('hex'),'saved result survives reload');
  }
  await context.close();
 }
 console.log('drag runs completed',RUNS,'0 errors',errors.length);
 assert.deepEqual(errors,[]);
}finally{
 await browser.close();const versions={};for(const [version,root]of [['before',BEFORE],['after',ROOT]])versions[version]=crypto.createHash('sha256').update(await fs.readFile(path.join(root,'local-csv.html'))).digest('hex');await fs.writeFile(new URL('./performance-results/drag/results.json',import.meta.url),JSON.stringify({measuredAt:new Date().toISOString(),versions,conditions:{rows:ROWS,columns:COLS,events:EVENTS,viewport:'1440x900',browser:browser.version(),locale:'ja-JP',file:'fresh context; direct file; no network; IndexedDB isolated',input:'120 synchronous synthetic pointer events per burst; diagnostic high-frequency condition'},errors,results},null,2));
}
