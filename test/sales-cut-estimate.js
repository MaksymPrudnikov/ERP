/* Cut preview из Sales: заказы и квоты в любом сочетании раскраиваются тем
   же движком, что батч, только внутри одного стекла; номера стёкол свои;
   «отдельно / вместе» сходится с отдельными прогонами; в базу не пишется
   ничего — ни раскроя, ни брони стока, ни touch(); работает и во вкладке
   без права записи; батч и его раскрой не меняются. */
module.exports=async function({page,eq,ok}){
 console.log('sales cut preview');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.ceSheet=(code,w,h)=>{DB.glassSheet.push(normalizeGlassSheet({productCode:code,supplier:'Vitro',sheetWIn:w,sheetHIn:h,availability:'stock'}));};
  window.ceRec=(kind,sizes,code)=>{
   const id=oqOrder(oqCustomer({legalName:kind==='quote'?'Lakeview Glass':'Northside Windows'}),{kind,dueDate:'2026-10-20'});
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q||1,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   if(!salesOrderSave())throw new Error('record not saved');soDraft=null;soEdit=null;
   if(code)salesRecord(id).makeups[0].panes[0].glassProductId=glassProductByCode(code).id;
   return id;
  };
  window.ceSetup=()=>{oqReset();DB.sheetBreak=[];DB.glassSheet=[];DB.cutting=cutSettingsDefault();ceSheet('6CLEAR',96,144);cutEstClose();
   salesShow.orders=true;salesShow.quotes=true;salesShow.ncr=false;salesStatusFilter='';};
  /* Плохой батч: один большой лист на заказ — и квота, которая дозаполняет лист. */
  window.ceBad=()=>{
   ceSetup();const a=ceRec('order',[[100,70,1]]);oqThrough(a,'verified');
   glassBatchAssign(glassBatchRows([salesRecord(a)]),{});const bn=DB.glassBatch[0].number;cutPlanRun(bn);
   const b=ceRec('quote',[[40,90,1],[100,20,1]]);tab='sales';render();return {a,b,bn};
  };
  window.ceWait=async()=>{await new Promise(r=>setTimeout(r,60));await cutBuildDone();await new Promise(r=>setTimeout(r,20));};
 });

 eq('заказ + квота одного стекла: окно по кнопке, один раскрой на двоих, свои номера стёкол; база, раскрой батча и touch() не тронуты',await t.p.evaluate(async()=>{
  const {a,b,bn}=ceBad();salesListSel=new Set([a,b]);render();
  const btn=document.querySelector('[data-cut-est-open]'),label=btn.textContent.trim(),before=JSON.stringify(DB),plan=JSON.stringify(cutPlanFor(bn));
  let touched=0;const orig=window.touch;window.touch=function(){touched++;return orig.apply(this,arguments);};
  btn.click();await ceWait();window.touch=orig;
  const p=cutEst&&cutEst.plan,ids=cutPiecesOf('EST').map(x=>x.piece),q=sel=>!document.querySelector(sel);
  return {label,built:!!p&&!p.reset,groups:p.groups.map(g=>g.glass+':'+g.sheets.length),orders:p.orders.map(o=>o.order).sort().join()===[salesRecord(a).businessNumber,salesRecord(b).businessNumber].sort().join(),
   ids:ids.length===3&&ids.every(id=>/^[A-Za-z0-9-]+\/\d+\/\w+\/\d+$/.test(id)&&!/^G-/.test(id)),same:JSON.stringify(DB)===before,batchPlan:JSON.stringify(cutPlanFor(bn))===plan,touched,
   notInDb:!(DB.cutPlan||[]).some(x=>cutEstIs(x.batch)),window:!!document.querySelector('[data-cut-est]'),status:document.querySelector('[data-batch-status]').textContent,
   hidden:q('[data-cut-trial-open]')&&q('[data-cut-print]')&&q('[data-cut-move-sheet]')&&q('[data-cut-sheet-lock]')&&q('[data-cut-offcuts]')&&q('[data-cut-size-queue]')&&q('.cut-stock-add')&&q('[data-cut-open]'),
   russian:/[А-яЁё]/.test(document.querySelector('[data-cut-est]').innerText)};
 }),{label:'2',built:true,groups:['6CLEAR:1'],orders:true,ids:true,same:true,batchPlan:true,touched:0,notInDb:true,window:true,status:'Preview',hidden:true,russian:false});

 eq('отдельно / вместе: плохой заказ и квота — по листу каждому отдельно, вместе один лист; цифры совпадают с отдельными прогонами того же движка',await t.p.evaluate(()=>{
  const g=cutEstCompare()[0],pick=cutEst.plan.sheetPick||{};
  const same=g.rows.every(r=>{const p=cutDrain(cutPlanSteps('EST:'+r.id,x=>pick[x]||null)).plan,t=cutTotals([p.groups.find(x=>x.glass===g.glass)]);return r.alone.sheets===t.sheets&&r.alone.net===t.net;});
  return {glass:g.glass,rows:g.rows.length,sheets:document.querySelector('[data-cut-est-sheets]').textContent,same,better:g.rows.every(r=>r.alonePct>g.pct+20),
   shown:document.querySelectorAll('[data-cut-est-row]').length,win:document.querySelectorAll('[data-cut-est-compare] .cut-win').length===3,dbHasNoAlone:!JSON.stringify(DB).includes('EST:')};
 }),{glass:'6CLEAR',rows:2,sheets:'2 → 1',same:true,better:true,shown:2,win:true,dbHasNoAlone:true});

 eq('только просмотр: стекло не выбирается, меню и клавиши не работают; Esc закрывает окно, прикидки больше нет',await t.p.evaluate(()=>{
  const id=cutPiecesOf('EST')[0].piece;cutUiPick(id);const picked=cutUi.sel;
  document.querySelector('[data-cut-list]').click();const clicked=cutUi.sel;
  const before=JSON.stringify(cutEst.plan);document.dispatchEvent(new KeyboardEvent('keydown',{key:'r',bubbles:true}));
  const sameAfterKey=JSON.stringify(cutEst&&cutEst.plan)===before;
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  return {picked,clicked,sameAfterKey,closed:cutEst===null,list:!!document.querySelector('[data-cut-est-open]')&&!document.querySelector('[data-cut-est]')};
 }),{picked:'',clicked:'',sameAfterKey:true,closed:true,list:true});

 eq('квота + квота и заказ другого стекла: ревизия по умолчанию последняя и меняется в окне; разные стёкла не смешиваются',await t.p.evaluate(async()=>{
  ceSetup();ceSheet('6Q240',96,144);
  const q1=ceRec('quote',[[30,30,2]]);salesOrderEdit(q1);salesQuoteNewRevision();soDraft.lines[0].qty=5;salesOrderSave();const r1=soDraft.id;soDraft=null;soEdit=null;
  const q2=ceRec('quote',[[50,40,3]]),c=ceRec('order',[[20,20,4]],'6Q240');tab='sales';render();
  salesCutEstimateOpen([q1,q2,c]);await ceWait();
  const key=salesQuoteGroupId(salesRecord(q1)),first=cutEst.recs.find(r=>r.key===key).id===r1,n1=cutPiecesOf('EST').filter(p=>p.orderId===r1).length;
  const glass=cutEstGlass(cutPiecesOf('EST')).map(g=>g.glass+':'+g.ids.size),groups=cutEst.plan.groups.map(g=>g.glass);
  const compare=[...document.querySelectorAll('[data-cut-est-compare]')].map(x=>x.dataset.cutEstCompare);
  const sel=document.querySelector('[data-cut-est-rev="'+key+'"]');sel.value=q1;sel.dispatchEvent(new Event('change'));
  const reset=!!cutEst.plan.reset;document.querySelector('[data-cut-run]').click();await ceWait();
  const n0=cutPiecesOf('EST').filter(p=>p.orderId===q1).length;
  const box=document.querySelector('[data-cut-est-rec="'+c+'"] [data-cut-est-on]');box.checked=false;box.dispatchEvent(new Event('change'));
  const off=cutEst.plan.groups.map(g=>g.glass);cutEstClose();
  return {first,n1,glass,groups,compare,reset,n0,off,only:document.querySelector('[data-cut-est-shared="false"]')===null};
 }),{first:true,n1:5,glass:['6CLEAR:2','6Q240:1'],groups:['6CLEAR','6Q240'],compare:['6CLEAR'],reset:true,n0:2,off:['6CLEAR'],only:true});

 eq('вкладка без права записи: окно строится, предупреждений нет, база та же; правка квоты после Build — предупреждение',await t.p.evaluate(async()=>{
  const {a,b}=ceBad();const before=JSON.stringify(DB),err=storageLastError;let alerts=0;const oa=window.alert;window.alert=()=>{alerts++;};
  storageWriter=false;salesCutEstimateOpen([a,b]);await ceWait();
  const built=!!cutEst.plan&&!cutEst.plan.reset,same=JSON.stringify(DB)===before,errSame=storageLastError===err;
  storageWriter=true;window.alert=oa;
  salesRecord(b).lines[0].qty=2;render();const stale=!!document.querySelector('[data-cut-stale]');salesCutEstimateClose();
  return {built,alerts,same,errSame,stale};
 }),{built:true,alerts:0,same:true,errSame:true,stale:true});

 eq('сток в прикидку не идёт: куска S-… нет в таблице размеров, раскрой его не берёт, запись стока не меняется',await t.p.evaluate(async()=>{
  const {a,b}=ceBad();const rec=stockOffcutAdd({glass:'6CLEAR',mm:6,w:60,h:50,batch:'B-0099',sheet:1}),before=JSON.stringify(DB.stockOffcut);
  salesCutEstimateOpen([a,b]);await ceWait();
  const row=!!document.querySelector('[data-cut-stock="'+rec.id+'"]'),onSheet=cutEst.plan.groups.some(g=>g.sheets.some(s=>/^S-/.test((s.size||{}).key||'')));
  const claims=cutStockClaims('').size,refused=cutStockTake('EST','6CLEAR',1,0).error;cutEstClose();
  return {row,onSheet,claims,refused,same:JSON.stringify(DB.stockOffcut)===before};
 }),{row:false,onSheet:false,claims:0,refused:'Preview only.',same:true});

 eq('выигранная квота и заказ из неё отмечены вместе — стекло берётся один раз, из заказа',await t.p.evaluate(()=>{
  ceSetup();const q=ceRec('quote',[[30,30,2]]);salesConvertQuoteRecord(q);const o=salesRecord(q).wonOrderId;soDraft=null;soEdit=null;
  cutEstOpen([q,o]);const recs=cutEst.recs.map(r=>r.id),n=cutPiecesOf('EST').length;cutEstClose();
  return {recs:recs.length===1&&recs[0]===o,n};
 }),{recs:true,n:2});

 eq('открытый заказ важнее окна: «Open order» показывает заказ, после него снова прикидка; Esc в заказе её не закрывает',await t.p.evaluate(async()=>{
  const {a,b}=ceBad();salesCutEstimateOpen([a,b]);await ceWait();
  optimizationOpenOrder(a);const editor=!!soDraft&&soDraft.id===a&&!document.querySelector('[data-cut-est]');
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));const kept=!!cutEst;
  soDraft=null;soEdit=null;render();const back=!!document.querySelector('[data-cut-est]');cutEstClose();render();
  return {editor,kept,back};
 }),{editor:true,kept:true,back:true});

 eq('два типа стекла: кнопки стекла над листом, список стёкол слева — только выбранного типа',await t.p.evaluate(async()=>{
  ceSetup();ceSheet('6Q240',96,144);
  const a=ceRec('order',[[30,30,2]]),c=ceRec('order',[[20,20,3]],'6Q240');tab='sales';render();
  salesCutEstimateOpen([a,c]);await ceWait();
  const glassOf=new Map(cutPiecesOf('EST').map(p=>[p.piece,p.glass]));
  const list=()=>[...new Set([...document.querySelectorAll('[data-cut-list]')].map(r=>glassOf.get(r.dataset.cutList)))];
  const buttons=[...document.querySelectorAll('[data-cut-glass]')].map(b=>b.dataset.cutGlass),first=list();
  document.querySelector('[data-cut-glass="6Q240"]').click();
  const second=list(),n=document.querySelectorAll('[data-cut-list]').length;cutEstClose();render();
  return {buttons,first,second,n};
 }),{buttons:['6CLEAR','6Q240'],first:['6CLEAR'],second:['6Q240'],n:3});

 eq('штуки по типу стекла: в карточке записи, в строке общего стекла (всего и по записям) и на кнопках над листом',await t.p.evaluate(async()=>{
  ceSetup();['6SBN60','6Q366','6SOLARGRAY'].forEach(k=>ceSheet(k,96,144));
  const igu=(first,sizes)=>{const id=oqOrder(oqCustomer({legalName:'IGU '+first}),{dueDate:'2026-10-20'});salesOrderEdit(id);const m=soDraft.makeups[0];
   m.panes[0].glassProductId=glassProductByCode(first).id;m.panes[1].glassProductId=glassProductByCode('6SOLARGRAY').id;
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));salesOrderSave();soDraft=null;soEdit=null;return id;};
  const a=igu('6SBN60',[[70,60,2],[46,30,2]]),b=igu('6Q366',[[60,30,3],[22,30,4]]);tab='sales';render();
  salesCutEstimateOpen([a,b]);await ceWait();
  const na=salesRecord(a).businessNumber,nb=salesRecord(b).businessNumber;
  const chips=[...document.querySelectorAll('[data-cut-est-rec-pcs]')].map(x=>x.textContent);
  const line=[...document.querySelectorAll('[data-cut-est-glass-pcs]')].map(x=>x.dataset.cutEstGlassPcs);
  const shared=document.querySelector('[data-cut-est-glass-pcs="6SOLARGRAY:11"]').textContent;
  const buttons=[...document.querySelectorAll('[data-cut-glass]')].map(x=>x.textContent);cutEstClose();render();
  return {chips,line,shared:shared===`6SOLARGRAY · 6 mm — 11 pcs together: ${na} 4, ${nb} 7`,buttons};
 }),{chips:['8 pcs · 6SBN60 4 · 6SOLARGRAY 4','14 pcs · 6Q366 7 · 6SOLARGRAY 7'],line:['6Q366:7','6SBN60:4','6SOLARGRAY:11'],shared:true,
  buttons:['6Q366 · 6 mm · 7 pcs','6SBN60 · 6 mm · 4 pcs','6SOLARGRAY · 6 mm · 11 pcs']});

 eq('меню правой кнопки: Cut preview по отмеченным строкам; без отметок кнопка неактивна',await t.p.evaluate(async()=>{
  const {a,b}=ceBad();salesListSel=new Set();render();const off=document.querySelector('[data-cut-est-open]').disabled;
  salesListSel=new Set([a,b]);salesListContext({preventDefault(){},stopPropagation(){},clientX:20,clientY:20},b);
  const item=document.querySelector('[data-menu="cutpreview"]'),text=item&&item.textContent;item.click();await ceWait();
  const recs=cutEst.recs.length;cutEstClose();render();
  return {off,text,recs};
 }),{off:true,text:'Cut preview · 2 selected',recs:2});
};
