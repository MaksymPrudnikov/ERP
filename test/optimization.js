/* Очередь: реальный выбор в DOM, массовые действия, удержание, платежи,
   устаревшее подтверждение, сохранение и узкий экран. */
module.exports=async function({page,eq,ok}){
 console.log('optimization');const t=await page();await require('./optimization-fixture')(t.p);
 eq('Optimization и Shipping показывают свои очереди; квоты и закрытые/отменённые исключены',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer();const states=['new','verified','batched','ready','done','closed','cancelled'];
  states.forEach((status,i)=>{const id=oqOrder(c,{businessNumber:String(76002+i)});if(status==='cancelled')salesSetRecordStatus(id,'cancelled');else if(status!=='new')oqThrough(id,status);});oqOrder(c,{kind:'quote'});oqQueue();
  return OPTIMIZATION_TABS.concat(SHIPPING_TABS).filter(t=>t[0]!=='all').map(([key])=>{oqQueue(key);return [key,optimizationRows().map(o=>o.status)];});
 }),[['new',['new']],['batch',['verified']],['production',['batched']],['stock',[]],['awaiting',['batched']],['ready',['ready']],['done',['done']]]);
 eq('To batch: галочка всех стёкол (каждое отдельной строкой) и Create batch дают один номер обоим заказам и открывают его состав',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer();window.oqA=oqOrder(c);window.oqB=oqOrder(c);oqThrough(oqA,'verified');oqThrough(oqB,'verified');soDraft=null;soEdit=null;oqQueue('batch');
  document.querySelector('[data-glass-all]').click();const n=glassBatchSelection.size;document.querySelector('[data-glass-action="create"]').click();
  const a=salesRecord(oqA),b=salesRecord(oqB);return {n,states:[a.status,b.status],batch:[a.batchNo,b.batchNo],lines:a.lines.concat(b.lines).map(l=>l.batchNo),title:document.querySelector('.glass-batches h2').textContent,empty:glassBatchRows().length,draft:soDraft};
 }),{n:12,states:['batched','batched'],batch:['B-0001','B-0001'],lines:['B-0001','B-0001','B-0001','B-0001'],title:'Batch B-0001',empty:0,draft:null});
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
 eq('фильтр и смена вкладки сбрасывают выбор скрытых заказов',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer(),a=oqOrder(c,{customerPo:'Find-this'});oqOrder(c);oqQueue();optimizationSelectAll(true);
  salesListSetFilter('po',{conds:[{op:'contains',v:'Find-this'}]});const count=optimizationRows().length,sel=optimizationSel.size;const chosen=[...optimizationSel];optimizationSetTab('batch');return {count,sel,chosen:chosen.length===1&&chosen[0]===a,after:optimizationSel.size};
 }),{count:1,sel:1,chosen:true,after:0});
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
 const readyIds=await t.p.evaluate(()=>{oqReset();window.readyA=oqOrder(oqCustomer());window.readyB=oqOrder(oqCustomer({legalName:'City Glazing'}));oqPay(readyA);oqPay(readyB);oqThrough(readyA,'ready');oqThrough(readyB,'ready');soDraft=null;soEdit=null;oqQueue('ready');return [readyA,readyB];});
 await t.p.locator(`[data-queue-order="${readyIds[0]}"] [data-queue-check]`).check();await t.p.locator('[data-queue-action="pickup"]').click();
 await t.p.locator(`[data-queue-order="${readyIds[1]}"] [data-queue-check]`).check();await t.p.locator('[data-queue-action="delivery"]').click();
 await t.p.locator('[data-queue-tab="done"]').click();
 eq('Picked up и Delivered попадают на общую вкладку; до Close оба заказа остаются открытыми',await t.p.evaluate(()=>optimizationRows().sort((a,b)=>a.businessNumber.localeCompare(b.businessNumber)).map(o=>[salesStatusLabel(o),o.status])),[['Picked up','done'],['Delivered','done']]);
 await t.p.locator('[data-queue-all]').check();await t.p.locator('[data-queue-action="closed"]').click();
 eq('Close закрывает оба выбранных оплаченных заказа',await t.p.evaluate(()=>[salesRecord(readyA).status,salesRecord(readyB).status]),['closed','closed']);
 await t.p.reload();
 eq('после перезагрузки статусы, способы выдачи и номера батча сохранены',await t.p.evaluate(()=>DB.salesOrder.map(o=>[o.status,o.fulfilledVia,o.batchNo])),[['closed','pickup','B-0001'],['closed','delivery','B-0002']]);
 await require('./optimization-fixture')(t.p);
 eq('All показывает проверенные и непроверенные заказы; Glass фильтруется по отдельному стеклу пакета',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer(),a=oqOrder(c),b=oqOrder(c);salesSetRecordStatus(b,'verified');const clear=glassProductByCode('6CLEAR'),other=DB.glassProduct.find(g=>g.id!==clear.id&&g.code&&g.active!==false);salesRecord(b).makeups[0].panes[1].glassProductId=other.id;
  oqQueue('all');const options=salesListValueOptions('glass',optimizationBase()).map(v=>v.text);document.querySelector('[data-filter-col="glass"]').click();document.querySelector('[data-val-all]').click();[...document.querySelectorAll('[data-val]')].find(e=>e.dataset.val==='6CLEAR').click();document.querySelector('[data-filter-apply]').click();const both=optimizationRows().map(o=>o.status).sort();salesListSetFilter('glass',{values:[other.code]});const one=optimizationRows().map(o=>o.id);return {options:options.includes('6CLEAR')&&options.includes(other.code),both,one:one.length===1&&one[0]===b,other:!!a};
 }),{options:true,both:['new','verified'],one:true,other:true});
 eq('фильтры, сортировка, Columns и настройки очередей независимы от Sales и сохраняются',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer();oqOrder(c,{businessNumber:'76003'});oqOrder(c,{businessNumber:'76002'});oqQueue('all');
  salesListSetFilter('units',{conds:[{op:'gt',v:'2'}]});salesListSort('number','asc');salesListSetColumn('area',true);salesListSetColumn('balance',false);const numbers=optimizationRows().map(o=>o.businessNumber),opt=JSON.stringify(salesListLoadPrefs());
  salesListOpenColumns(null);const menu=!!document.querySelector('.sl-cols');salesListCloseMenu();salesQueuePrefs.optimization=null;const persisted=JSON.stringify(salesListLoadPrefs())===opt;
  tab='sales';const salesBefore=JSON.stringify(salesListLoadPrefs());oqQueue('awaiting');salesListSetFilter('number',{conds:[{op:'contains',v:'76002'}]});const shipping=JSON.stringify(salesListLoadPrefs())!==opt;
  tab='sales';const salesUnchanged=JSON.stringify(salesListLoadPrefs())===salesBefore;oqQueue('all');return {numbers,menu,persisted,shipping,salesUnchanged,optUnchanged:JSON.stringify(salesListLoadPrefs())===opt};
 }),{numbers:['76002','76003'],menu:true,persisted:true,shipping:true,salesUnchanged:true,optUnchanged:true});
 eq('Shipping доступен из меню; только там Mark ready и выдача',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());oqThrough(id,'batched');oqQueue('production');const noReady=!document.querySelector('[data-queue-action="ready"]'),nav=!!document.querySelector('.nav-item[onclick*="shipping"]');oqQueue('awaiting');optimizationSelectAll(true);document.querySelector('[data-queue-action="ready"]').click();return {noReady,nav,status:salesRecord(id).status,tab,unbatch:!!document.querySelector('[data-queue-action="unbatch"]')};
 }),{noReady:true,nav:true,status:'ready',tab:'shipping',unbatch:false});
 eq('частичный Unbatch сохраняет замки остальных строк; повторный Verify обязателен',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());oqThrough(id,'batched');oqQueue('production');const o=salesRecord(id),keep=o.lines[1].id,release=o.lines[0].id;optimizationUnbatch([id]);salesDialogToggleLine(keep,false);salesDialogConfirm(true);oqChoose('Unbatch selected lines');
  const noBatch=salesSetRecordStatus(id,'batched'),locked=[salesLineLocked(o.lines[0]),salesLineLocked(o.lines[1])],history=o.unbatchHistory[0];oqAdvance(id,'verified');oqAdvance(id,'batched');return {noBatch,locked,history:history.lineIds.length===1&&history.lineIds[0]===release,old:o.lines[1].batchNo,new:o.lines[0].batchNo,status:o.status,via:soDraft.status};
 }),{noBatch:false,locked:[false,true],history:true,old:'B-0001',new:'B-0002',status:'batched',via:'batched'});
 eq('начатая резка защищена от Unbatch и обычного Back даже в записи',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());oqThrough(id,'batched');const o=salesRecord(id);o.lines[0].cutStartedAt='2026-09-16T08:00:00Z';oqQueue('production');optimizationUnbatch([id]);const disabled=salesDialog.lineChoices[0].disabled,selected=salesDialog.checkedLines.length;const force=salesUnbatchRecord(id,[o.lines[0].id],{confirmed:true}),back=salesSetRecordStatus(id,'verified',{back:true});salesDialogConfirm(true);oqChoose('Unbatch selected lines');const normalized=normalizeSalesOrder(JSON.parse(JSON.stringify(o)));return {disabled,selected,force,back,locks:normalized.lines.map(salesLineLocked),cut:normalized.lines[0].cutStartedAt,history:normalized.unbatchHistory.length};
 }),{disabled:true,selected:1,force:false,back:false,locks:[true,false],cut:'2026-09-16T08:00:00Z',history:1});
 eq('Unbatch не меняет заказ без подтверждения, без выбранных строк или при устаревшем окне',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());oqThrough(id,'batched');oqQueue('production');optimizationUnbatch([id]);salesDialog.checkedLines=[];salesDialogConfirm(true);oqChoose('Unbatch selected lines');const empty=salesRecord(id).status;salesDialogChoose(0);optimizationUnbatch([id]);salesRecord(id).lines[0].cutStartedAt='2026-09-16';salesDialogConfirm(true);oqChoose('Unbatch selected lines');return {empty,status:salesRecord(id).status,title:salesDialog.title};
 }),{empty:'batched',status:'batched',title:'Orders changed during confirmation'});
 eq('очередь и окна без русского; название клиента не исполняет HTML',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({legalName:'<img src=x onerror="window.oqXss=1">',paymentMode:'cash'}));oqQueue();const escaped=document.body.textContent.includes('<img src=x'),images=document.querySelectorAll('.optimization-queue img').length;oqAdvance(id,'verified');const russian=/[А-яЁё]/.test(document.getElementById('app').innerText);return {escaped,images,russian,xss:!!window.oqXss,dialog:!!document.querySelector('.sales-dialog')};
 }),{escaped:true,images:0,russian:false,xss:false,dialog:true});
 await t.p.evaluate(()=>{salesDialog=null;render();});await t.p.setViewportSize({width:390,height:844});
 ok('на телефоне страница не шире экрана; прокручивается таблица',await t.p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 await t.p.evaluate(()=>{optimizationSelectAll(true);optimizationAction('verified');});
 ok('на телефоне окно предупреждения помещается по ширине',await t.p.evaluate(()=>{const r=document.querySelector('.sales-dialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
 eq('очередь без ошибок страницы',t.errs,[]);await t.c.close();
};
