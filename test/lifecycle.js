/* Статусы из очереди, финансовые предупреждения, замок и квоты.
   Проверяются по исходникам и по собранному HTML. */
module.exports=async function({page,eq,ok}){
 console.log('lifecycle');const t=await page();await require('./optimization-fixture')(t.p);
 eq('старый Draft становится New; номера квоты и заказа раздельные',await t.p.evaluate(()=>{
  oqReset();DB.salesOrder.push(normalizeSalesOrder({status:'draft',businessNumber:'76010'}));const c=oqCustomer();const a=oqOrder(c,{kind:'quote'}),b=oqOrder(c,{kind:'quote'}),o=oqOrder(c);
  return [DB.salesOrder[0].status,salesRecord(a).businessNumber,salesRecord(b).businessNumber,salesRecord(o).businessNumber,!!salesRecord(o).statusDates.new];
 }),['new','Q-10001','Q-10002','76011',true]);
 eq('оплаченный заказ проходит все этапы из очереди без открытого редактора',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());oqPay(id);soDraft=null;soEdit=null;oqQueue();const seen=[];
  for(const next of ['verified','batched','ready','done','closed']){oqAdvance(id,next,'pickup');seen.push([salesRecord(id).status,!!salesDialog]);}
  const o=salesRecord(id);return {seen,dates:Object.keys(o.statusDates),batch:o.batchNo,readOnly:salesOrderReadOnly(o),draft:soDraft};
 }),{seen:[['verified',false],['batched',false],['ready',false],['done',false],['closed',false]],dates:['new','verified','batched','ready','done','closed'],batch:'B-0001',readOnly:true,draft:null});
 eq('Verify cash-клиента: окно в очереди, Back не меняет заказ, Verify anyway продолжает',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({paymentMode:'cash'}));soDraft=null;soEdit=null;oqQueue();oqAdvance(id,'verified');const title=salesDialog.title,buttons=salesDialog.buttons.map(b=>b.label),shown=tab==='optimization'&&!!document.querySelector('#app .sales-dialog');oqChoose('Back');const before=salesRecord(id).status;oqAdvance(id,'verified');oqChoose('Verify anyway');return {title:/^Deposit not received — order \d+$/.test(title),buttons,shown,before,after:salesRecord(id).status};
 }),{title:true,buttons:['Back','Verify anyway','Take payment'],shown:true,before:'new',after:'verified'});
 eq('Take payment по ID открывает Finance на нужный заказ и сохраняет чужой черновик нетронутым',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({paymentMode:'cash'})),o=salesRecord(id),dep=salesMoney(finOrderBalance(o).total*.5).toFixed(2);const other=oqOrder(oqCustomer({legalName:'Other customer'}));soDraft.notes='Unsaved note';oqQueue();oqAdvance(id,'verified');oqChoose('Take payment');return {tab,form:finEdit,amount:finDraft.amount,apply:finDraft.apply[id],customer:finDraft.customerId===o.customerId,note:finDraft.note,status:salesRecord(id).status,draft:soDraft.id===other&&soDraft.notes==='Unsaved note',saved:salesRecord(other).notes,dep};
 }),{tab:'finance',form:'new',amount:'405.46',apply:'405.46',customer:true,note:'Order 76002',status:'new',draft:true,saved:'',dep:'405.46'});
 eq('Verify сверх кредитного лимита требует подтверждения',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({creditLimit:100}));oqQueue();oqAdvance(id,'verified');const title=salesDialog.title,buttons=salesDialog.buttons.map(b=>b.label);oqChoose('Verify anyway');return {title,buttons,status:salesRecord(id).status};
 }),{title:'Northside Windows Ltd is over the credit limit',buttons:['Back','Verify anyway'],status:'verified'});
 /* Владелец, 27.09.2026: новый заказ не сохранён — при уходе «сохранить?»,
    Don't save — заказа нет; сохранённый изменён — «обновить?», Don't update —
    в базе ничего не меняется, в том числе формы строк. */
 eq('уход из заказа: новый — Save / Don\'t save, сохранённый — Update / Don\'t update; метка и кнопка знают, сохранено ли',await t.p.evaluate(()=>{
  const pick=l=>salesDialogChoose(salesDialog.buttons.findIndex(b=>b.label===l)),state=()=>document.querySelector('[data-order-state]').textContent,off=()=>document.querySelector('[data-order-save]').disabled;
  oqReset();const cust=oqCustomer(),orders=DB.salesOrder.length;
  tab='sales';salesOrderNew();salesApplyCustomerDefaults(cust.id);soDraft.lines[0].width16=30*16;soDraft.lines[0].height16=20*16;salesEnsureLineShape(soDraft.lines[0]);render();
  const shape=soDraft.lines[0].shapeRef.id,fresh={state:state(),off:off()};
  salesOrderClose();const ask=[salesDialog.title,salesDialog.buttons.map(b=>b.label).join(' / ')];
  pick("Don't save");const gone={orders:DB.salesOrder.length===orders,draft:soDraft===null,shape:!DB.shapeDef.some(s=>s.id===shape)};
  const id=oqOrder(cust);salesOrderEdit(id);render();const saved={state:/^Saved · /.test(state()),off:off()};
  const w=document.querySelector('[data-so-width]');w.value='40';w.dispatchEvent(new Event('change',{bubbles:true}));const dirty={state:state(),off:off()};
  navGo('dashboard');const leave=[salesDialog.title,salesDialog.buttons.map(b=>b.label).join(' / ')];pick('Back');const back=tab==='sales'&&!!soDraft;
  navGo('dashboard');pick("Don't update");const kept={tab,width:salesRecord(id).lines[0].width16/16};
  tab='sales';salesOrderEdit(id);const w2=document.querySelector('[data-so-width]');w2.value='40';w2.dispatchEvent(new Event('change',{bubbles:true}));
  salesOrderClose();pick('Update');const updated={draft:soDraft===null,width:salesRecord(id).lines[0].width16/16};
  return {fresh,ask,gone,saved,dirty,leave,back,kept,updated};
 }),{fresh:{state:'Unsaved changes',off:false},ask:['Save the order before leaving?','Back / Don\'t save / Save'],gone:{orders:true,draft:true,shape:true},
  saved:{state:true,off:true},dirty:{state:'Unsaved changes',off:false},leave:['Update 76002 before leaving?','Back / Don\'t update / Update'],back:true,
  kept:{tab:'dashboard',width:37},updated:{draft:true,width:40}});
 eq('Don\'t update возвращает формы строк: размер строки, Save revision в редакторе формы',await t.p.evaluate(()=>{
  const pick=l=>salesDialogChoose(salesDialog.buttons.findIndex(b=>b.label===l));
  oqReset();const id=oqOrder(oqCustomer());tab='sales';salesOrderEdit(id);render();
  const ref=soDraft.lines[0].shapeRef.id,before=JSON.stringify(DB.shapeDef.find(s=>s.id===ref));
  /* Форма строки лежит в общем DB.shapeDef и меняется ещё до Update. */
  salesOrderConfigureShape(0);sDraft.w='50';saveShape();
  const changed=JSON.stringify(DB.shapeDef.find(s=>s.id===ref))!==before,back=tab==='sales';
  salesOrderClose();pick("Don't update");
  const restored=JSON.stringify(DB.shapeDef.find(s=>s.id===ref))===before;
  salesOrderEdit(id);salesOrderConfigureShape(0);sDraft.w='50';saveShape();salesOrderClose();pick('Update');
  const shape=DB.shapeDef.find(s=>s.id===salesRecord(id).lines[0].shapeRef.id);
  return {changed,back,restored,kept:{w:shape.w,line:salesRecord(id).lines[0].width16/16}};
 }),{changed:true,back:true,restored:true,kept:{w:'50',line:50}});
 eq('батч блокирует фигуру и сохранение изменённых размеров; непорезанную строку можно убрать; новых кнопок шагов в заказе нет',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());oqQueue();oqThrough(id,'batched');tab='sales';salesOrderEdit(id);
  /* Закрыта каждая ячейка, кроме Shape (форма открывает чертёж, не редактор) и —
     пока стекло не порезано — количества и крестика: меньше юнитов и убрать
     строку можно (владелец, 6.10.2026; test/batched-line-qty.js). Цена тоже
     открыта: Price by hand (владелец, 7.10.2026; test/money.js). */
  const inert=[...document.querySelectorAll('tr[data-metrics-line-id]')].every(r=>r.classList.contains('line-locked')&&[...r.children].every(td=>td.hasAttribute('inert')!==!!(td.querySelector('[data-line-drawing],.line-qty,.line-delete')||['unitPrice','lineTotal'].includes(td.dataset.metric)))),muLocked=!!document.querySelector('.mu-locked[inert]');
  const alerts=[],prev=window.alert;window.alert=m=>alerts.push(m);salesOrderConfigureShape(0);salesOrderRemoveLine(0);window.alert=prev;
  document.querySelector('[data-line-drawing]').click();
  const drawing=!!docState&&docState.kind==='drawings'&&docState.focus===soDraft.lines[0].id&&tab==='sales';docClose();
  soDraft.lines[0].width16+=16;const saved=salesOrderSave(),error=document.getElementById('e_sales_order').textContent;soDraft.lines[0].width16-=16;
  return {inert,drawing,muLocked,alerts:alerts.length,tab,kept:soDraft.lines.length,saved:!!saved,error:/Batched lines cannot change/.test(error),buttons:document.querySelectorAll('[data-next-status],[data-batch-new],.sales-status-row button').length,batch:document.querySelector('.sales-lockbar').textContent.includes('B-0001')};
 }),{inert:true,drawing:true,muLocked:true,alerts:1,tab:'sales',kept:1,saved:false,error:true,buttons:0,batch:true});
 eq('новая строка из готового заказа идёт в новый батч; старые номера и замки сохраняются',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());oqThrough(id,'ready');tab='sales';salesOrderEdit(id);const first=soDraft.lines.map(l=>[l.id,l.batchedAt,l.batchNo]);salesOrderAddLine(null,false);const l=soDraft.lines.at(-1);l.width16=320;l.height16=320;salesEnsureLineShape(l);salesOrderSave();const badge=document.body.textContent.includes('added after batch'),buttons=document.querySelectorAll('[data-batch-new]').length;oqQueue('batch');const appears=optimizationRows().some(o=>o.id===id),ready=optimizationMatches(salesRecord(id),'ready');oqAdvance(id,'batched');const o=salesRecord(id);return {badge,buttons,appears,ready,status:o.status,old:o.lines.slice(0,2).map(l=>[l.id,l.batchedAt,l.batchNo]),first,newBatch:o.lines.at(-1).batchNo,numbers:salesOrderBatchNumbers(o),allLocked:o.lines.every(salesLineLocked),readyDate:!!o.statusDates.ready};
 }).then(r=>({...r,old:JSON.stringify(r.old)===JSON.stringify(r.first),first:undefined})),{badge:true,buttons:0,appears:true,ready:true,status:'batched',old:true,first:undefined,newBatch:'B-0002',numbers:['B-0001','B-0002'],allLocked:true,readyDate:false});
 eq('Unbatch подтверждается отдельно, возвращает New, номер не используется повторно; Back не снимает замок',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());oqThrough(id,'batched');oqQueue('production');const back=salesSetRecordStatus(id,'verified',{back:true});optimizationUnbatch([id]);const warns=salesDialog.buttons.some(b=>b.requiresConfirmation)&&document.querySelector('.sales-dialog').innerText.includes('Cutting not started');oqChoose('Unbatch selected lines');const pending=salesRecord(id).status;salesDialogConfirm(true);oqChoose('Unbatch selected lines');const o=salesRecord(id);return {back,warns,pending,status:o.status,unlocked:o.lines.every(l=>!l.batchedAt&&!l.batchNo),date:!!o.statusDates.batched,batch:o.batchNo,next:salesNextBatchNumber(),history:o.batchHistory,events:o.unbatchHistory.length};
 }),{back:false,warns:true,pending:'batched',status:'new',unlocked:true,date:false,batch:'',next:'B-0002',history:['B-0001'],events:1});
 eq('долг при самовывозе: подтверждение; выданный заказ Sales без Users / Finance / Optimization не удаляет',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({paymentMode:'cash'}));oqThrough(id,'ready');oqQueue('ready');oqAdvance(id,'done','pickup');const title=salesDialog.title,buttons=salesDialog.buttons.map(b=>b.label);oqChoose('Create anyway');const o=salesRecord(id),prev=window.alert,ac=window.accessCan;let blocked=false;window.alert=()=>blocked=true;window.accessCan=k=>k==='sales';try{salesOrderDelete(id);}finally{window.alert=prev;window.accessCan=ac;}return {title:/has a balance due$/.test(title),buttons,status:o.status,label:salesStatusLabel(o),blocked};
 }),{title:true,buttons:['Back','Create anyway','Take payment'],status:'done',label:'Picked up',blocked:true});
 eq('Delivered выбирается отдельно, сохраняется после нормализации и не закрывает заказ автоматически',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({paymentMode:'cash'}),{delivery:'pickup'});oqThrough(id,'ready');oqQueue('ready');oqAdvance(id,'done','delivery');const buttons=salesDialog.buttons.map(b=>b.label);oqChoose('Create anyway');normalizeSalesData();const o=salesRecord(id);oqAdvance(id,'closed');const close=salesDialog.buttons.map(b=>b.label);oqChoose('Back');return {buttons,status:o.status,label:salesStatusLabel(o),planned:o.delivery,actual:o.fulfilledVia,queue:optimizationMatches(o,'done'),close};
 }),{buttons:['Back','Create anyway','Take payment'],status:'done',label:'Delivered',planned:'pickup',actual:'delivery',queue:true,close:['Back','Close anyway']});
 eq('Net 30: выдача без оплаты не спрашивает «Take payment», срок оплаты ставится сам от дня выдачи; просрочка клиента останавливает',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer(),id=oqOrder(c);oqThrough(id,'ready');const o=salesRecord(id),before=finPaymentDue(o),checks=salesTransitionChecks(o,'done').length;
  oqFulfill(id);const billed=finBillingDate(o),due=finPaymentDue(o),expected=finAddDays(finToday(),30);
  o.statusDates.done=new Date(finAddDays(finToday(),-40)+'T15:00:00').toISOString();const late=oqOrder(c);oqThrough(late,'ready');
  const stop=salesTransitionChecks(salesRecord(late),'done').map(x=>x.title);
  return {before,checks,billed:billed===finToday(),due:due===expected,overdue:finOrderFinancial(o).status,stop};
 }),{before:'',checks:0,billed:true,due:true,overdue:'Overdue',stop:['Northside Windows Ltd has overdue payments']});
 eq('отмена возвращает оплаты в депозит; Restore доступен из списка; производственные замки сохраняются',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer()),o=salesRecord(id);DB.receipt.push(normalizeReceipt({number:'R-1',customerId:o.customerId,amount:200,allocations:[{orderId:id,amount:200}]}));oqThrough(id,'batched');oqQueue('production');salesCancelOrder(id);const msg=salesDialog.note;oqChoose('Cancel orders');const deposit=finCustomerDeposit(o.customerId),debt=finCustomerAccount(salesFindCustomer(o.customerId)).balanceDue;tab='sales';salesOrderEdit(id);const ro=!!document.querySelector('.sales-readonly[inert]'),noRestore=!document.querySelector('.sales-status-row button');soEdit=null;soDraft=null;render();salesListContext(null,id);const restore=!!document.querySelector('[data-menu="restore"]');salesListMenuRun('restore');return {msg:msg.includes('deposit'),deposit,debt,ro,noRestore,restore,status:salesRecord(id).status,locked:salesRecord(id).lines.every(salesLineLocked),dates:Object.keys(salesRecord(id).statusDates)};
 }),{msg:true,deposit:200,debt:0,ro:true,noRestore:true,restore:true,status:'new',locked:true,dates:['new']});
 eq('Convert у квоты остаётся; заказ получает свой номер и фигуры',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer(),{kind:'quote'}),q=salesRecord(id),old=q.lines.map(l=>l.shapeRef.id),total=finOrderTotals(q).grand,convert=!!document.querySelector('[data-convert-quote]');salesConvertQuote();const o=soDraft;return {convert,kind:o.kind,status:o.status,from:o.fromQuoteId===id,newShapes:o.lines.every((l,i)=>l.shapeRef.id!==old[i]),sameTotal:finOrderTotals(o).grand===total,won:salesRecord(id).status,batch:o.batchNo};
 }),{convert:true,kind:'order',status:'new',from:true,newShapes:true,sameTotal:true,won:'won',batch:''});
 eq('подмена/пропуск шага и On Hold не проходят даже на уровне записи',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());const skip=salesSetRecordStatus(id,'ready');salesHoldApply([id],'Wait');const held=salesSetRecordStatus(id,'verified'),invalid=salesSetRecordStatus(id,'bogus');return [skip,held,invalid,salesRecord(id).status];
 }),[false,false,false,'new']);
 eq('новые поля батча и выдачи переживают JSON; повреждённые значения нормализуются',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());oqThrough(id,'done');const copy=normalizeSalesOrder(JSON.parse(JSON.stringify(salesRecord(id)))),bad=normalizeSalesOrder({batchNo:'<img>',batchHistory:['B-0004','bad','B-0004'],fulfilledVia:'script',status:'done',delivery:'delivery',lines:[{batchedAt:'',batchNo:'B-0003'}]});return {number:copy.batchNo,history:copy.batchHistory,lines:copy.lines.map(l=>l.batchNo),via:copy.fulfilledVia,bad:[bad.batchNo,bad.batchHistory,bad.fulfilledVia,bad.lines[0].batchNo]};
 }),{number:'B-0001',history:['B-0001'],lines:['B-0001','B-0001'],via:'pickup',bad:['',['B-0004'],'delivery','']});
 eq('страница жизненного цикла без ошибок',t.errs,[]);await t.c.close();
};
