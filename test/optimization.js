/* Очередь: реальный выбор в DOM, массовые действия, удержание, платежи,
   устаревшее подтверждение, сохранение и узкий экран. */
module.exports=async function({page,eq,ok}){
 console.log('optimization');const t=await page();await require('./optimization-fixture')(t.p);
 eq('пять очередей показывают свои заказы; квоты и закрытые/отменённые исключены',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer();const states=['new','verified','batched','ready','done','closed','cancelled'];
  states.forEach((status,i)=>{const id=oqOrder(c,{businessNumber:String(76002+i)});if(status==='cancelled')salesSetRecordStatus(id,'cancelled');else if(status!=='new')oqThrough(id,status);});oqOrder(c,{kind:'quote'});oqQueue();
  return OPTIMIZATION_TABS.map(([key])=>{optimizationSetTab(key);return [key,optimizationRows().map(o=>o.status)];});
 }),[['new',['new']],['batch',['verified']],['production',['batched']],['ready',['ready']],['done',['done']]]);
 eq('выбор двух заказов кнопками очереди создаёт один номер батча и сохраняет его в строках',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer();window.oqA=oqOrder(c);window.oqB=oqOrder(c);oqThrough(oqA,'verified');oqThrough(oqB,'verified');soDraft=null;soEdit=null;oqQueue('batch');
  document.querySelector('[data-queue-all]').click();const n=optimizationSel.size;document.querySelector('[data-queue-action="batched"]').click();
  const a=salesRecord(oqA),b=salesRecord(oqB);return {n,states:[a.status,b.status],batch:[a.batchNo,b.batchNo],lines:a.lines.concat(b.lines).map(l=>l.batchNo),notice:document.querySelector('[role="status"]').textContent.includes('B-0001'),empty:optimizationRows().length,draft:soDraft};
 }),{n:2,states:['batched','batched'],batch:['B-0001','B-0001'],lines:['B-0001','B-0001','B-0001','B-0001'],notice:true,empty:0,draft:null});
 eq('Back на предупреждении второго заказа оставляет всю группу без батча',await t.p.evaluate(()=>{
  oqReset();const a=oqOrder(oqCustomer()),b=oqOrder(oqCustomer({paymentMode:'cash',legalName:'Cash buyer'}));salesSetRecordStatus(a,'verified');salesSetRecordStatus(b,'verified');oqQueue('batch');optimizationRunOrders([a,b],'batched');const title=salesDialog.title,before=[salesRecord(a).status,salesRecord(b).status];oqChoose('Back');return {title:title.includes(salesRecord(b).businessNumber),before,after:[salesRecord(a).status,salesRecord(b).status],batch:[salesRecord(a).batchNo,salesRecord(b).batchNo],next:salesNextBatchNumber()};
 }),{title:true,before:['verified','verified'],after:['verified','verified'],batch:['',''],next:'B-0001'});
 eq('Take payment во втором заказе группы адресован второму заказу; ни один не ушёл в батч',await t.p.evaluate(()=>{
  oqReset();const a=oqOrder(oqCustomer()),b=oqOrder(oqCustomer({paymentMode:'cash'}));salesSetRecordStatus(a,'verified');salesSetRecordStatus(b,'verified');soDraft=null;soEdit=null;oqQueue('batch');optimizationRunOrders([a,b],'batched');oqChoose('Take payment');return {tab,apply:Object.keys(finDraft.apply),id:b,unchanged:[salesRecord(a).status,salesRecord(b).status],draft:soDraft};
 }).then(r=>({...r,apply:r.apply.length===1&&r.apply[0]===r.id,id:undefined})),{tab:'finance',apply:true,id:undefined,unchanged:['verified','verified'],draft:null});
 eq('общий батч создаётся только после подтверждения всех предупреждений; номер не меняется между заказами',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({paymentMode:'cash'}),a=oqOrder(c),b=oqOrder(c);salesSetRecordStatus(a,'verified');salesSetRecordStatus(b,'verified');oqQueue('batch');optimizationRunOrders([a,b],'batched');oqChoose('Send anyway');const halfway=[salesRecord(a).status,salesRecord(b).status];oqChoose('Send anyway');return {halfway,batch:[salesRecord(a).batchNo,salesRecord(b).batchNo],next:salesNextBatchNumber()};
 }),{halfway:['verified','verified'],batch:['B-0001','B-0001'],next:'B-0002'});
 eq('On Hold серый и не выбирается для Verify/батча; Release снимает удержание без перехода',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer(),a=oqOrder(c),b=oqOrder(c);salesHoldApply([b],'Credit check');oqQueue();const row=document.querySelector(`[data-queue-order="${b}"]`),gray=row.classList.contains('oq-hold'),disabled=row.querySelector('[data-queue-check]').disabled;document.querySelector('[data-queue-all]').click();const selected=[...optimizationSel];optimizationRunOrders([b],'verified');const title=salesDialog.title;oqChoose('Release hold');return {gray,disabled,selected:selected.length===1&&selected[0]===a,title:title.includes('On Hold'),held:salesRecord(b).onHold,status:salesRecord(b).status,checkEnabled:!document.querySelector(`[data-queue-order="${b}"] [data-queue-check]`).disabled};
 }),{gray:true,disabled:true,selected:true,title:true,held:false,status:'new',checkEnabled:true});
 eq('поиск и смена вкладки сбрасывают выбор скрытых заказов',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer(),a=oqOrder(c,{customerPo:'Find-this'}),b=oqOrder(c);oqQueue();optimizationSelectAll(true);const input=document.getElementById('optimizationSearch');input.value='Find-this';optimizationSearchInput(input);const count=optimizationRows().length,sel=optimizationSel.size;optimizationSelectAll(true);const chosen=[...optimizationSel];optimizationSetTab('batch');return {count,sel,chosen:chosen.length===1&&chosen[0]===a,after:optimizationSel.size,beforeEmpty:!!b};
 }),{count:1,sel:0,chosen:true,after:0,beforeEmpty:true});
 eq('переход синхронизирует открытый черновик, но не сохраняет его заметки',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());soDraft.notes='Unsaved changes';oqQueue();oqAdvance(id,'verified');oqAdvance(id,'batched');return {savedNote:salesRecord(id).notes,draftNote:soDraft.notes,status:soDraft.status,batch:soDraft.batchNo,locks:soDraft.lines.every(salesLineLocked),stillDirty:salesDraftHasWork()};
 }),{savedNote:'',draftNote:'Unsaved changes',status:'batched',batch:'B-0001',locks:true,stillDirty:true});
 eq('устаревшее подтверждение после изменения записи не запускает батч',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({paymentMode:'cash'}));salesSetRecordStatus(id,'verified');oqQueue('batch');oqAdvance(id,'batched');salesRecord(id).onHold=true;oqChoose('Send anyway');return {status:salesRecord(id).status,batch:salesRecord(id).batchNo,title:salesDialog.title};
 }),{status:'verified',batch:'',title:'Orders changed during confirmation'});
 eq('новые строки у выданного заказа запрещают преждевременный Close и отправляются в очередь батча',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());oqThrough(id,'done');const o=salesRecord(id);o.lines.push(normalizeSalesOrderLine({makeupId:o.makeups[0].id,width16:320,height16:320}));const closed=salesSetRecordStatus(id,'closed');return {closed,toBatch:optimizationMatches(o,'batch'),toClose:optimizationMatches(o,'done'),status:o.status};
 }),{closed:false,toBatch:true,toClose:false,status:'done'});
 eq('возврат из Ready сохраняет производственный замок и номер батча',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());oqThrough(id,'ready');oqQueue('ready');oqAdvance(id,'back');oqChoose('Move back');const o=salesRecord(id);return [o.status,o.batchNo,o.lines.every(salesLineLocked),!!o.statusDates.ready,!!o.statusDates.batched];
 }),['batched','B-0001',true,false,true]);
 eq('массовая отмена показывает депозиты по заказам и возвращает оплаты нужным клиентам',await t.p.evaluate(()=>{
  oqReset();const a=oqOrder(oqCustomer()),b=oqOrder(oqCustomer({legalName:'City Glazing'}));oqPay(a);oqPay(b);oqQueue();optimizationRunOrders([a,b],'cancelled');const rows=salesDialog.rows.length;oqChoose('Cancel orders');return {rows,statuses:[salesRecord(a).status,salesRecord(b).status],deposits:[a,b].map(id=>finCustomerDeposit(salesRecord(id).customerId)),allocations:DB.receipt.map(r=>r.allocations.length)};
 }),{rows:2,statuses:['cancelled','cancelled'],deposits:[810.92,810.92],allocations:[0,0]});
 // Проверяем кнопки реальными кликами браузера, а не только вызовом обработчика.
 await t.p.evaluate(()=>{oqReset();window.readyA=oqOrder(oqCustomer());window.readyB=oqOrder(oqCustomer({legalName:'City Glazing'}));oqPay(readyA);oqPay(readyB);oqThrough(readyA,'ready');oqThrough(readyB,'ready');soDraft=null;soEdit=null;oqQueue('ready');});
 await t.p.locator('[data-queue-check]').first().check();await t.p.locator('[data-queue-action="pickup"]').click();
 await t.p.locator('[data-queue-check]').first().check();await t.p.locator('[data-queue-action="delivery"]').click();
 await t.p.locator('[data-queue-tab="done"]').click();
 eq('Picked up и Delivered попадают на общую вкладку; до Close оба заказа остаются открытыми',await t.p.evaluate(()=>optimizationRows().map(o=>[salesStatusLabel(o),o.status])),[['Picked up','done'],['Delivered','done']]);
 await t.p.locator('[data-queue-all]').check();await t.p.locator('[data-queue-action="closed"]').click();
 eq('Close закрывает оба выбранных оплаченных заказа',await t.p.evaluate(()=>[salesRecord(readyA).status,salesRecord(readyB).status]),['closed','closed']);
 await t.p.reload();
 eq('после перезагрузки статусы, способы выдачи и номера батча сохранены',await t.p.evaluate(()=>DB.salesOrder.map(o=>[o.status,o.fulfilledVia,o.batchNo])),[['closed','pickup','B-0001'],['closed','delivery','B-0002']]);
 await require('./optimization-fixture')(t.p);
 eq('очередь и окна без русского; название клиента не исполняет HTML',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({legalName:'<img src=x onerror="window.oqXss=1">',paymentMode:'cash'}));oqQueue();const escaped=document.body.textContent.includes('<img src=x'),images=document.querySelectorAll('.optimization-queue img').length;oqAdvance(id,'verified');const russian=/[А-яЁё]/.test(document.getElementById('app').innerText);return {escaped,images,russian,xss:!!window.oqXss,dialog:!!document.querySelector('.sales-dialog')};
 }),{escaped:true,images:0,russian:false,xss:false,dialog:true});
 await t.p.evaluate(()=>{salesDialog=null;render();});await t.p.setViewportSize({width:390,height:844});
 ok('на телефоне страница не шире экрана; прокручивается таблица',await t.p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 await t.p.evaluate(()=>{optimizationSelectAll(true);optimizationAction('verified');});
 ok('на телефоне окно предупреждения помещается по ширине',await t.p.evaluate(()=>{const r=document.querySelector('.sales-dialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
 eq('очередь без ошибок страницы',t.errs,[]);await t.c.close();
};
