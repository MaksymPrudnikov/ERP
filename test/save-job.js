/* Save большого заказа в фоне (erp/sales/save-job, владелец 29.10.2026):
   стекло и полоса сразу, заказ только для просмотра; записано то же, что
   обычным Save; другие экраны работают; другой заказ и Sign out — после
   записи; запись другого экрана посреди счёта — проверки заново; отказ —
   заказ снова на экране с правками. Цены и строки, посчитанные заранее,
   сверяет с расчётом GF_SCOPE_CHECK («Stale save book», «Stale measure»). */
module.exports=async function({page,eq}){
 console.log('save-job');
 const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  /* Заказ на 120 разных строк: правки не сохранены, кнопка Save включена. */
  window.sjBig=function(keep){
   if(!keep)oqReset();const id=oqOrder(oqCustomer());salesOrderEdit(id);const l0=soDraft.lines[0];
   for(let k=0;soDraft.lines.length<120;k++){const l=normalizeSalesOrderLine({makeupId:l0.makeupId,width16:(20+k%40)*16,height16:(30+k%25)*16,qty:1+k%3,mark:'W'+k});soDraft.lines.push(l);salesEnsureLineShape(l);}
   soDraft.notes='Background';render();return id;
  };
  window.sjGlass=n=>salesRecord(n).lines.reduce((a,l)=>a+l.qty,0);
  /* Стеклопакет заказа — два стекла на юнит: номера юнитов и стёкол на каждый. */
  window.sjPieces=id=>{const n=t=>(DB[t]||[]).filter(r=>r.key.startsWith(id+'|')).reduce((a,r)=>a+r.ids.length,0);return n('glassUnitId')===sjGlass(id)&&n('glassPiece')===2*sjGlass(id);};
  window.sjWait=()=>new Promise(r=>{const c=()=>salesSaveJob?setTimeout(c,10):r();c();});
 });
 eq('Save большого заказа — в фоне: стекло и полоса сразу, заказ только для просмотра',await t.p.evaluate(()=>{
  sjBig();document.querySelector('[data-order-save]').click();
  const ed=document.querySelector('.sales-order-editor'),btn=ed.querySelector('[data-order-save]'),body=[...ed.children].filter(x=>x.classList.contains('sales-saving-ro'));
  return {job:!!salesSaveJob,glass:!!document.querySelector('#busyGlass .busy-tube'),band:!!ed.querySelector('[data-saving-band]'),inert:body.length>0&&body.every(x=>x.inert),btn:btn.disabled&&/^Saving \d+%$/.test(btn.textContent)};
 }),{job:true,glass:true,band:true,inert:true,btn:true});
 eq('после записи — сохранено, как обычным Save: строки, стёкла, цены',await t.p.evaluate(async()=>{
  const id=soEdit;await sjWait();const o=salesRecord(id);
  return {notes:o.notes,lines:o.lines.length,pieces:sjPieces(id),book:Object.keys(o.priceBook||{}).length>0,measure:o.lines.every(l=>l.measure&&l.measure.sig),open:soEdit===id&&!salesDraftHasWork(),band:!document.querySelector('[data-saving-band]'),saved:/^Saved /.test((document.querySelector('#busyGlass h3')||{}).textContent||'')};
 }),{notes:'Background',lines:120,pieces:true,book:true,measure:true,open:true,band:true,saved:true});
 eq('уход в другой экран во время Save: экран работает, заказ сохранён и закрыт',await t.p.evaluate(async()=>{
  const id=sjBig();salesOrderSave({bg:true});navGo('shipping');const there=tab==='shipping'&&!!document.querySelector('#busyGlass');
  await sjWait();return {there,tab,closed:soEdit===null&&soDraft===null,notes:salesRecord(id).notes,lines:salesRecord(id).lines.length};
 }),{there:true,tab:'shipping',closed:true,notes:'Background',lines:120});
 eq('другой заказ и Sign out во время Save — после записи',await t.p.evaluate(async()=>{
  oqReset();const other=oqOrder(oqCustomer({legalName:'Second customer'}));salesDraftDrop();const id=sjBig(true);salesOrderSave({bg:true});
  /* Ждёт одно, последнее: Sign out, потом заказ — откроется заказ. */
  const guarded=window.NAV_GUARDS.some(g=>g('signout',()=>{}))&&salesSaveJob.next.text==='Sign out after saving.';
  salesOrderEdit(other);const waits=soEdit===id,note=(document.querySelector('#busyGlass .busy-note')||{}).textContent;
  await sjWait();return {waits,note:note.replace(/\d+/,'N'),guarded,opened:soEdit===other,saved:salesRecord(id).notes};
 }),{waits:true,note:'Order N opens after saving.',guarded:true,opened:true,saved:'Background'});
 eq('запись другого экрана посреди Save — проверки и счёт заново, заказ записан',await t.p.evaluate(async()=>{
  salesDraftDrop();const id=sjBig(),f=window.salesOrderSaveCommand;let dry=0;
  window.salesOrderSaveCommand=function(o){if(o&&o.dry)dry++;return f.apply(this,arguments);};
  try{
   salesOrderSave({bg:true});
   await new Promise(r=>{const c=()=>/^Line /.test(salesSaveJob&&salesSaveJob.step||'')?r():setTimeout(c,5);c();});
   storageCommand(()=>{DB.customer[0].notes='Changed elsewhere';return true;},{customer:[DB.customer[0].id]});
   await sjWait();
  }finally{window.salesOrderSaveCommand=f;}
  return {dry,saved:salesRecord(id).notes,pieces:sjPieces(id)};
 }),{dry:2,saved:'Background',pieces:true});
 eq('не записалось — заказ снова на экране с правками и ошибкой',await t.p.evaluate(async()=>{
  salesDraftDrop();const id=sjBig(),keep=window.storageWrite;
  salesOrderSave({bg:true});navGo('finance');
  window.storageWrite=()=>{throw new DOMException('Test quota','QuotaExceededError');};
  try{await sjWait();}finally{window.storageWrite=keep;}
  const e=document.getElementById('e_sales_order');
  return {tab,draft:soEdit===id&&soDraft.notes==='Background'&&soDraft.lines.length===120,stored:salesRecord(id).notes,lines:salesRecord(id).lines.length,error:!!(e&&e.textContent),card:/^Not saved: /.test((document.querySelector('#busyGlass h3')||{}).textContent||'')};
 }),{tab:'sales',draft:true,stored:'',lines:2,error:true,card:true});
 eq('вопрос при проверке отменён — ничего не записано, правки на экране',await t.p.evaluate(async()=>{
  salesSaveClose();salesDraftDrop(true);const id=sjBig(),keep=[window.confirm,window.salesItemSizeWarnings];let asked='';
  window.salesItemSizeWarnings=()=>['Line 6: wider than the item allows'];
  window.confirm=m=>{asked=m.split('\n')[0];return false;};
  try{salesOrderSave({bg:true});await sjWait();}finally{[window.confirm,window.salesItemSizeWarnings]=keep;}
  return {asked,stored:salesRecord(id).lines.length,draft:soDraft.lines.length===120&&soDraft.notes==='Background',band:!document.querySelector('[data-saving-band]'),glass:!document.querySelector('#busyGlass')};
 }),{asked:'Item size warning:',stored:2,draft:true,band:true,glass:true});
 eq('маленький заказ — Save как раньше, сразу',await t.p.evaluate(()=>{
  salesDraftDrop(true);const id=oqOrder(oqCustomer());salesOrderEdit(id);soDraft.notes='Small';render();
  const ok=salesOrderSave({bg:true});return {ok,job:!!salesSaveJob,notes:salesRecord(id).notes};
 }),{ok:true,job:false,notes:'Small'});
 /* Аудит 29.10.2026, А1: «Saved», закрытие заказа и отложенное — только
    после записи на диск; диск отказал — заказ на экране, «Not saved». */
 eq('запись на диск ещё идёт — «Saved» нет; отказала — заказ на экране, «Not saved», другой заказ не открыт',await t.p.evaluate(async()=>{
  salesDraftDrop(true);oqReset();const other=oqOrder(oqCustomer({legalName:'Queued customer'}));salesDraftDrop();await storageFlush();
  const id=sjBig(true),keep=window.storageIdbWrite;let fail=null;
  window.storageIdbWrite=()=>new Promise((res,rej)=>{fail=rej;});
  const h3=()=>(document.querySelector('#busyGlass h3')||{}).textContent||'';
  try{
   salesOrderSave({bg:true});navGo('finance');salesOrderEdit(other);
   await new Promise(r=>{const c=()=>fail&&salesRecord(id).notes==='Background'?r():setTimeout(c,10);c();});
   await new Promise(r=>setTimeout(r,50));
   const waiting={job:!!salesSaveJob,saved:/^Saved /.test(h3()),step:salesSaveJob&&salesSaveJob.step,tab};
   fail(new Error('Disk test'));await sjWait();
   const e=document.getElementById('e_sales_order');
   return {waiting,tab,open:soEdit===id,card:/^Not saved: /.test(h3()),error:!!(e&&e.textContent),state:(document.querySelector('[data-order-state]')||{}).textContent,queued:soEdit!==other};
  }finally{window.storageIdbWrite=keep;storageRetry();await storageFlush();salesSaveClose();}
 }),{waiting:{job:true,saved:false,step:'Saving to disk',tab:'finance'},tab:'sales',open:true,card:true,error:true,state:'Not saved',queued:true});
 eq('Save в фоне без ошибок страницы',t.errs,[]);
 await t.c.close();
};
