/* =====================================================================
   erp/sales/save-job · Save большого заказа в фоне
   Владелец, 28–29.10.2026: квота на здание — 500 строк, и Save на слабом ПК
   идёт 10–30 с. «Главное, чтобы система не висла, а показывала, что заказ
   сохраняется»; процент настоящий; работать дальше можно («сразу фоновое»).

   Save идёт кусками, между кусками экран живой: проверки с теми же
   вопросами, цены заказа, количества работ строка за строкой — всё в
   памяти, база не меняется. Запись — одним куском в конце, тем же Save, что
   у маленького заказа: цены и строки он берёт готовыми, только если база и
   заказ с тех пор не менялись, иначе считает всё сам.
   Пока идёт, заказ только для просмотра (стекло в углу, полоса в заказе).
   Другие экраны работают, их записи идут сразу; база изменилась посреди
   счёта — проверки и счёт заново. Открыть другой заказ — откроется сам после
   записи. Не записалось — заказ снова на экране с ошибкой, правки целы.
   ===================================================================== */
const SALES_BG_LINES=100;
let salesSaveJob=null,salesSaveNote=null,salesSaveNoteTimer=null;
/* Кнопка Save / Update — salesOrderSave({bg:true}). */
function salesOrderSaveBg(){
 if(salesSaveJob)return false;
 if(!soDraft||(soDraft.lines||[]).length<SALES_BG_LINES)return salesOrderSave();
 return salesSaveBg();
}
function salesSaveTitle(o){return (salesIsQuote(o)?'quote ':'order ')+(o.businessNumber||'');}
function salesSaveBg(){
 const o=soDraft,job={title:o.businessNumber?salesSaveTitle(o):salesIsQuote(o)?'new quote':'new order',lines:o.lines.length,glass:o.lines.reduce((n,l)=>n+salesPositiveInt(l.qty,1),0),pct:0,step:'Checking lines',paint:false,next:null};
 salesSaveJob=job;salesSaveNote=null;salesSaveDom();
 const it=salesSaveSteps(job);
 const tick=()=>{
  const t0=performance.now();let r;
  try{do{r=it.next();if(!r.done)job.pct=r.value;}while(!r.done&&!job.paint&&performance.now()-t0<40);}
  catch(e){console.error('Background save failed:',e);r={done:true,value:{error:e&&e.message||'The order was not saved.'}};}
  job.paint=false;
  if(!r.done){salesSaveDom();setTimeout(tick,0);return;}
  salesSaveEnd(job,r.value||{});
 };
 /* Сначала стекло и полоса на экране, потом счёт. */
 setTimeout(tick,30);
 return true;
}
function* salesSaveSteps(job){
 const before=JSON.stringify(soDraft);
 let pre=null;
 /* Записи других экранов посреди счёта — проверки и счёт заново (без
    вопросов); третий раз подряд — Save считает всё сам при записи. */
 for(let round=0;round<3;round++){
  job.step='Checking lines';job.paint=true;yield 0.01;
  const dry=salesOrderSaveCommand(round?{dry:true,checked:true,pre}:{dry:true});
  if(dry===true)return {ok:true};
  if(!dry||dry.dry!==true){const e=salesOrderErrorBox(),msg=e.style.display!=='none'?e.textContent:'';soDraft=JSON.parse(before);return msg?{error:msg}:{cancelled:true};}
  pre={rev:storageBaseRev,json:JSON.stringify(soDraft),shrinks:dry.shrinks,measures:new Map()};
  job.step='Prices';job.paint=true;yield 0.2;
  const copy=JSON.parse(pre.json);
  pre.book=salesPriceBookOf(copy);pre.from=copy.priceFrom;copy.priceBook=pre.book;
  const lines=copy.lines,n=lines.length;
  for(let i=0;i<n;i++){
   const l=lines[i],m=salesMeasureLive(l,copy);
   pre.measures.set(l.id,{sig:salesMeasureSig(l,copy),rows:m.rows,areas:m.areas});
   job.step='Line '+(i+1)+' of '+n;yield 0.4+0.35*(i+1)/n;
  }
  if(pre.rev===storageBaseRev)break;
 }
 job.step='Writing';job.paint=true;yield 0.76;
 let error='';
 if(!salesOrderSave({checked:true,pre,noRender:true,failed:m=>{error=m;}}))return {error:error||'The order was not saved.'};
 if(tab==='sales'&&soEdit!==null){job.title=salesSaveTitle(soDraft);job.step='Opening the order';job.paint=true;yield 0.85;}
 return {ok:true};
}
function salesSaveEnd(job,res){
 salesSaveJob=null;
 if(res.ok){
  const title=soDraft&&soDraft.businessNumber?salesSaveTitle(soDraft):job.title;
  /* Ушли из заказа — он сохранён, закрываем его, как Close. */
  if(tab!=='sales'&&soDraft&&!salesDraftHasWork())salesDraftDrop(false);
  render();
  salesSaveShow({kind:'done',title});
  if(job.next)job.next.run();
  return;
 }
 /* Не записалось — заказ снова на экране, с ошибкой; ушли в другой экран —
    возвращаемся: черновик с правками не должен остаться без хозяина. */
 if(res.error)tab='sales';
 render();
 const el=document.getElementById('e_sales_order');if(el&&res.error)fail(el,res.error);
 salesSaveShow(res.error?{kind:'error',title:job.title,text:res.error}:null);
}
/* Открыть другой заказ, пока идёт Save, — откроется сам после записи. */
function salesSaveQueue(run,text){if(salesSaveJob){salesSaveJob.next={run,text:text||''};salesSaveDom();}}
function salesSaveShow(note){
 clearTimeout(salesSaveNoteTimer);salesSaveNote=note;salesSaveDom();
 if(note&&note.kind==='done')salesSaveNoteTimer=setTimeout(()=>{salesSaveNote=null;salesSaveDom();},1500);
}
function salesSaveClose(){salesSaveShow(null);}
/* Тесты (GF_SCOPE_CHECK): готовые цены сверяются с расчётом заново — по
   черновику, каким он пришёл в запись. */
function salesSaveBookCheck(o,pre){
 if(typeof window==='undefined'||!window.GF_SCOPE_CHECK)return;
 const copy=JSON.parse(JSON.stringify(o)),book=salesPriceBookOf(copy);
 if(JSON.stringify(book)!==JSON.stringify(pre.book)||JSON.stringify(copy.priceFrom||null)!==JSON.stringify(pre.from||null))console.error('Stale save book: '+(o.businessNumber||o.id));
}
/* Стекло в углу — поверх любого экрана, живёт вне #app; заказ на экране —
   полоса «Saving», всё ниже — только просмотр. Рисуется после каждой
   отрисовки (afterRender) и на каждом шаге. */
function salesSaveDom(){
 const job=salesSaveJob,note=salesSaveNote;let g=document.getElementById('busyGlass');
 if(!job&&!note){if(g)g.remove();return;}
 if(!g){g=document.createElement('div');g.id='busyGlass';g.className='busy-dock';g.setAttribute('role','status');document.body.appendChild(g);}
 const pct=job?Math.min(99,Math.round(job.pct*100)):note.kind==='done'?100:0;
 const head=job?'Saving '+job.title:note.kind==='done'?'Saved '+note.title:'Not saved: '+note.title;
 const sub=job?job.step:note.kind==='done'?'Saved':note.text;
 const tail=job?`<div class="busy-note">${esc(job.next&&job.next.text||'You can keep working. This order is read-only until it’s saved.')}</div>`:note.kind==='error'?`<div class="busy-acts"><button type="button" onclick="salesSaveClose()">Close</button></div>`:'';
 g.className='busy-dock'+(note&&note.kind==='error'?' busy-error':'');
 g.innerHTML=`<div class="busy-pane"><h3>${esc(head)}${note&&note.kind==='error'?'':`<span class="busy-pct">${pct}%</span>`}</h3><div class="busy-sub">${esc(sub)}</div>${note&&note.kind==='error'?'':`<div class="busy-tube"><i style="width:${pct}%"></i></div>`}${tail}</div>`;
 const ed=job&&document.querySelector('.sales-order-editor');if(!ed)return;
 let band=ed.querySelector('[data-saving-band]');
 if(!band){
  const top=ed.querySelector('.sales-editor-top');if(!top)return;
  top.insertAdjacentHTML('afterend','<div class="sales-saving" data-saving-band><b>Saving · read-only until saved</b><span></span><div class="busy-tube"><i></i></div><span class="busy-pct"></span></div>');
  band=ed.querySelector('[data-saving-band]');
  [...ed.children].forEach(x=>{if(x!==top&&x!==band){x.inert=true;x.classList.add('sales-saving-ro');}});
  top.querySelectorAll('button').forEach(b=>{b.disabled=true;});
 }
 band.children[1].textContent=job.lines.toLocaleString('en-US')+' lines · '+job.glass.toLocaleString('en-US')+' glass';
 band.querySelector('i').style.width=pct+'%';band.querySelector('.busy-pct').textContent=pct+'%';
 const btn=ed.querySelector('[data-order-save]');if(btn)btn.textContent='Saving '+pct+'%';
 const st=ed.querySelector('[data-order-state]');if(st)st.textContent='Saving…';
}
