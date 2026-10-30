/* Архив (задание «База», этап 3, А2–А3, erp/archive): кто уходит, что
   уходит вместе, что остаётся (строка Sales, счётчики, склад листов), F5,
   Sales и клиент видят ушедшее, просмотр с диска, Repeat, NCR и возврат.
   Сам уход (archiveAuto) в тестах выключен (GF_NO_ARCHIVE) — здесь
   archiveRun вызывается сам. */
module.exports=async function({page,eq}){
 console.log('archive');
 const t=await page();await require('./optimization-fixture')(t.p);
 /* Три заказа отгружены 10 января 2026: два оплачены, третий на Hold;
    у первого батч, раскрой и скан резки. Ещё один — не отгружен. */
 const ids=await t.p.evaluate(async()=>{
  window.alert=()=>{};oqReset();DB.cutting=cutSettingsDefault();
  /* Лист 144 × 96 на складе — раскрой строится, скан резки списывает лист (как test/inventory.js). */
  DB.glassSheet=[normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'})];
  const a=oqOrder(oqCustomer({legalName:'Archive Windows'}));salesOrderEdit(a);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
  soDraft.lines=[normalizeSalesOrderLine({makeupId:m.id,width16:60*16,height16:40*16,qty:4,mark:'A1'})];soDraft.lines.forEach(l=>{salesEnsureLineShape(l);salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});});
  if(!soDraft.customerPo)soDraft.customerPo='PO-QA';if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(a,'verified');
  const b0=glassBatchAssign(glassBatchRows([salesRecord(a)]),{}),plan=cutPlanRun(b0.number);if(plan&&plan.error)throw new Error(plan.error);
  const o=salesRecord(a),l=o.lines[0],piece=glassPieceMap(a).get(glassBatchComponents(o,l)[0].key).ids[0];stationMove('CUT',stationCheck('CUT',piece),{id:'ar',name:'Archive test'});
  const b=oqOrder(oqCustomer({legalName:'Second customer'})),h=oqOrder(oqCustomer({legalName:'Hold customer'})),open=oqOrder(oqCustomer({legalName:'Open customer'}));salesDraftDrop();
  /* У второго собран стеклопакет: рамка, герметики и газ ушли со склада (аудит 25.10.2026, I-1). */
  oqThrough(b,'verified');glassBatchAssign(glassBatchRows([salesRecord(b)]),{});const lb=salesRecord(b).lines[0];
  storageCommand(()=>DB.glassPiece.filter(p=>p.key.split('|')[1]===lb.id).forEach(p=>DB.stationScan.push({id:stationScanNextId(),at:'2026-01-09T12:00:00.000Z',piece:p.ids[0],station:'IGU',by:'Archive IGU',byId:'',asm:'SC-ARCH-1',unit:1})));
  storageCommand(()=>{[a,b,h].forEach(id=>{const x=salesRecord(id);x.status='done';x.statusDates=Object.assign({},x.statusDates,{done:'2026-01-10T12:00:00.000Z'});});salesRecord(h).onHold=true;});
  [a,b].forEach(id=>{const x=salesRecord(id),total=finOrderTotals(x).grand;finPersist(()=>finSaveReceiptRecord({customerId:x.customerId,date:'2026-01-15',method:'cash',reference:'',note:'',amount:total,allocations:[{orderId:id,amount:total}],currency:'CAD'},'','',true));});
  /* Агент: 10% с клиента первого заказа, 5% со второго; комиссия первого выплачена. */
  storageCommand(()=>{DB.referrer=[{id:'RFR-T',name:'Agent Test',customers:[{customerId:salesRecord(a).customerId,pct:10},{customerId:salesRecord(b).customerId,pct:5}]}];normalizeCommissions();});
  const pay=comPayoutAdd({referrerId:'RFR-T',date:'2026-01-20',note:'',orderIds:[a]});if(pay.error)throw new Error(pay.error);
  await storageFlush();return {a,b,h,open};
 });
 const snap=()=>t.p.evaluate(()=>readScope(()=>({
  rows:Object.fromEntries(DB.salesOrder.map(o=>{const i=salesListInfo(o);return [o.id,SALES_LIST_COLUMNS.map(c=>salesListValue(i,c.k))];})),
  inv:invSheetRows().map(r=>[r.key,r.onRack,r.free,r.cut]).concat(consRows().map(r=>[r.key,+r.used.toFixed(6),+r.onHand.toFixed(6),r.status])),deposit:DB.customer.map(c=>finCustomerDeposit(c.id)),
  next:[nextSalesOrderNumber(),salesNextBatchNumber(),finNextReceiptNumber()],
  statements:DB.customer.map(c=>JSON.stringify([finStatementData(c.id,'',''),finStatementData(c.id,'2026-01-01','2026-01-31'),finStatementOrders(c.id,'','').map(x=>[x.o.businessNumber,x.billed,x.f.b.total,x.f.b.paid])])),
  reports:JSON.stringify(['glass','cutting','orders','payments','sheets'].map(src=>{const S=REP_SRC[src],r=repQuery({source:src,date:{from:'2025-12-01',to:'2026-01-31'},dims:[],metrics:S.metrics.map(m=>m.k),filters:[]});return [src,r.count,r.total];})),
  agents:comWithScope(()=>{const r=comFind('RFR-T');return JSON.stringify([null,{from:'2026-01-01',to:'2026-01-31'}].map(g=>{const x=comSummary(r,g);return [x.orders,x.base,x.paid,x.com,x.earned,x.paidOut,x.toPay,x.rows.map(y=>[y.number,y.date,y.total,y.paid,y.base,y.pct,y.com])];})
   .concat([[...comDue(r).values()].map(y=>[y.number,y.com,y.paidOut,y.due]).sort()]));})})));
 const before=await snap();
 eq('кому пора: отгружен и оплачен 3 месяца назад — да; Hold, не отгружен и рано — нет',await t.p.evaluate(x=>{
  const due=d=>{const s=archiveDue(d);return [x.a,x.b,x.h,x.open].map(id=>s.has(id));};return {june:due('2026-06-01'),march:due('2026-03-20')};
 },ids),{june:[true,true,false,false],march:[false,false,false,false]});
 /* Пачками, как уходит сам (archiveAuto): по одному заказу; день отмечен, когда пачка неполная. */
 const run=await t.p.evaluate(async()=>{const a=archiveRun('2026-06-01',{limit:1,mark:true}),day1=DB.archiveRunDay||'',b=archiveRun('2026-06-01',{limit:1,mark:true}),c=archiveRun('2026-06-01',{limit:1,mark:true});await storageFlush();
  return {ok:a.ok&&b.ok&&c.ok,batches:[a.value.orders,b.value.orders,c.value.orders],records:a.value.records+b.value.records>10,day1,day2:DB.archiveRunDay};});
 eq('уход в архив пачками: по заказу за раз, их записи ушли; день отмечен последней, неполной пачкой',run,{ok:true,batches:[1,1,0],records:true,day1:'',day2:'2026-06-01'});
 const mid=await t.p.evaluate(x=>({hot:[x.a,x.b,x.h,x.open].map(id=>!!salesRecord(id)),index:[...archiveIndex.keys()].sort().join()===[x.a,x.b].sort().join(),
  scans:DB.stationScan.some(s=>s.by==='Archive test'),receipts:DB.receipt.some(r=>r.allocations.some(a=>a.orderId===x.a)),deleted:DB.orderEvent.some(e=>e.what==='Deleted'),sheetsKept:Object.values(DB.inventoryArchived.sheets||{}).reduce((n,x)=>n+x.cut,0),
  igu:DB.stationScan.some(s=>s.by==='Archive IGU'),consKept:Object.keys(DB.inventoryArchived.cons||{}).length>0,used:consRows().some(r=>r.used>0)}),ids);
 eq('…в работе их нет, их скан и оплата ушли, в журнале заказа нет «Deleted», порезанный лист и расход стеклопакета — в разнице склада',mid,{hot:[false,false,true,true],index:true,scans:false,receipts:false,deleted:false,sheetsKept:1,igu:false,consKept:true,used:true});
 const after=await snap();
 eq('строка Sales ушедших — та же; оставшиеся, склад, депозиты, следующие номера — те же',{
  index:await t.p.evaluate(([x,b])=>[x.a,x.b].every(id=>JSON.stringify(SALES_LIST_COLUMNS.map(c=>archiveIndex.get(id).row[c.k]))===JSON.stringify(b.rows[id])),[ids,before]),
  rows:[ids.h,ids.open].every(id=>JSON.stringify(after.rows[id])===JSON.stringify(before.rows[id])),inv:JSON.stringify(after.inv)===JSON.stringify(before.inv),
  deposit:JSON.stringify(after.deposit)===JSON.stringify(before.deposit),next:JSON.stringify(after.next)===JSON.stringify(before.next)},
  {index:true,rows:true,inv:true,deposit:true,next:true});
 eq('выписки клиентов (всё время, январь, раздел Orders) — те же после ухода: строки ушедших — из указателя архива',after.statements.map((x,i)=>x===before.statements[i]),before.statements.map(()=>true));
 eq('отчёт за декабрь–январь: ушедшие заказы читаются с диска на время показа — те же числа; закрыли — в памяти пусто',await t.p.evaluate(async b=>{
  const range=['2025-12-01','2026-01-31'],first=archiveScopeFor(range);for(let i=0;i<100&&archiveScopeFor(range)!=='ready';i++)await new Promise(r=>setTimeout(r,20));
  const rows=readScope(()=>JSON.stringify(['glass','cutting','orders','payments','sheets'].map(src=>{const S=REP_SRC[src],r=repQuery({source:src,date:{from:'2025-12-01',to:'2026-01-31'},dims:[],metrics:S.metrics.map(m=>m.k),filters:[]});return [src,r.count,r.total];})));
  const loaded=storageVisit.size>0,diff=storageDiff(DB).length;archiveScopeDrop();
  return {first,same:rows===b.reports,loaded,diff,after:storageVisit.size,hot:DB.salesOrder.length,none:archiveScopeFor(['2025-01-01','2025-01-31'])};
 },before),{first:'loading',same:true,loaded:true,diff:0,after:0,hot:2,none:'none'});
 eq('Agents: комиссия, выплачено и к выплате — те же после ухода; выплата агенту осталась в работе',{same:after.agents===before.agents,due:JSON.parse(after.agents)[2].map(x=>x[3]),payout:await t.p.evaluate(()=>DB.referrerPayout.length)},{same:true,due:[0,JSON.parse(before.agents)[2].find(x=>x[3]>0)[3]],payout:1});
 await t.p.reload();await t.p.evaluate(()=>window.storageReady);
 const f5=await snap();
 eq('после F5: архив не загружен, указатель на месте, склад и номера те же',{
  hot:await t.p.evaluate(x=>[x.a,x.b].some(id=>!!salesRecord(id)),ids),index:await t.p.evaluate(()=>archiveIndex.size),
  inv:JSON.stringify(f5.inv)===JSON.stringify(before.inv),next:JSON.stringify(f5.next)===JSON.stringify(before.next),statements:JSON.stringify(f5.statements)===JSON.stringify(before.statements),agents:f5.agents===before.agents},{hot:false,index:2,inv:true,next:true,statements:true,agents:true});
 /* А3: Sales и вкладка клиента показывают ушедшие строки; открыть — с диска,
    только просмотр; в базу ничего не пишется; Repeat; NCR возвращает в работу. */
 eq('Sales: ушедшие строки вместе с живыми, с меткой Archived, Open; те же значения и итоги',await t.p.evaluate(([x,b])=>{
  storageTakeControl();tab='sales';subtab='orders';salesShow={orders:true,quotes:false,ncr:false};salesStatusFilter='';salesListLoadPrefs().filters={};render();
  const rows=[...document.querySelectorAll('[data-archived-row]')].map(tr=>tr.dataset.archivedRow).sort(),num=id=>document.querySelector(`[data-archived-row="${id}"] td:nth-child(2)`).textContent.trim();
  return {rows:rows.join()===[x.a,x.b].sort().join(),hot:document.querySelectorAll('[data-order-row]').length,label:document.querySelectorAll('[data-archived-row] [data-archived]').length,
   number:num(x.a)===b.rows[x.a][1],open:!!document.querySelector(`[data-archived-row="${x.b}"] .sales-row-actions button`),foot:/Orders 4/.test(document.querySelector('[data-foot-count]').textContent),
   chip:salesListBase().all.filter(o=>o.status==='done').length};
 },[ids,before]),{rows:true,hot:2,label:2,number:true,open:true,foot:true,chip:3});
 eq('вкладка Orders клиента: ушедший заказ с меткой Archived',await t.p.evaluate(x=>{
  cEdit=archiveIndex.get(x.b).customerId;cTab='orders';const html=customerOrdersTab();cEdit=null;
  return {row:html.includes(`data-customer-order="${x.b}"`),archived:/Archived/.test(html),count:/1 order/.test(html)};
 },ids),{row:true,archived:true,count:true});
 eq('открыть из архива: тот же экран, только просмотр; база не видит его записи, журнал не пишет «Created», Export их не берёт',await t.p.evaluate(async x=>{
  const opened=await archiveOpen(x.b),o=soDraft;render();touch();await storageFlush();
  const html=document.querySelector('.sales-order-editor').innerHTML;
  const r={opened,edit:soEdit===x.b,ro:salesOrderReadOnly(o),repeat:html.includes('data-archive-repeat'),save:html.includes('data-order-save'),inert:!!document.querySelector('.sales-order-editor .sales-readonly[inert]'),
   diff:storageDiff(DB).length,created:DB.orderEvent.filter(e=>e.orderId===x.b&&e.what==='Created').length,exported:storageHotRecords().some(c=>c.tbl==='salesOrder'&&c.id===x.b),paid:finOrderBalance(salesRecord(x.b)).status};
  salesOrderClose();
  return Object.assign(r,{closed:soEdit===null,gone:!salesRecord(x.b)&&!DB.receipt.some(q=>q.allocations.some(a=>a.orderId===x.b)),visit:storageVisit.size,after:storageDiff(DB).length,still:archiveIndex.has(x.b)});
 },ids),{opened:true,edit:true,ro:true,repeat:true,save:false,inert:true,diff:0,created:1,exported:false,paid:'paid',closed:true,gone:true,visit:0,after:0,still:true});
 eq('Repeat: новый заказ того же клиента с теми же строками, без PO и производства; архивный остаётся в архиве',await t.p.evaluate(async x=>{
  await archiveOpen(x.b);const src=JSON.parse(JSON.stringify(salesRecord(x.b)));archiveRepeat();
  const d=soDraft,r={edit:soEdit,customer:d.customerId===src.customerId,lines:d.lines.map(l=>[l.width16,l.height16,l.qty].join()).join()===src.lines.map(l=>[l.width16,l.height16,l.qty].join()).join(),
   fresh:d.id!==src.id&&!d.businessNumber&&!d.customerPo&&d.status==='new'&&d.lines.every(l=>!l.batchedAt),visit:storageVisit.size,src:!salesRecord(x.b)};
  const n=nextSalesOrderNumber(),saved=salesOrderSave();
  return Object.assign(r,{saved,number:salesRecord(soEdit).businessNumber===n,still:archiveIndex.has(x.b)});
 },ids),{edit:'new',customer:true,lines:true,fresh:true,visit:0,src:true,saved:true,number:true,still:true});
 await t.p.evaluate(()=>{salesDraftDrop(false);});
 eq('выписка за январь с галочкой Invoices: счёт ушедшего заказа читается с диска на время сборки и после выписки в том же PDF',await t.p.evaluate(async x=>{
  const cid=archiveIndex.get(x.a).customerId;finOpenStatement(cid,{from:'2026-01-01',to:'2026-01-31'});const plain=finPreviewPages().length;finStatementInvoices(true);
  const waiting=finPreviewPages().length;for(let i=0;i<100&&!finPreview.invoicePages;i++)await new Promise(r=>setTimeout(r,20));
  const pages=finPreviewPages(),info=finPreviewInfo(),r={plain:plain>0,waiting,more:pages.length>plain,count:finPreview.invoiceCount,mail:/and 1 invoice for the period/.test(info.body),visit:storageVisit.size,diff:storageDiff(DB).length,hot:!!salesRecord(x.a)};
  finClosePreview();return r;
 },ids),{plain:true,waiting:0,more:true,count:1,mail:true,visit:0,diff:0,hot:false});
 eq('возврат в работу: заказ, его скан и оплата на месте, строки указателя нет, склад тот же',await t.p.evaluate(async x=>{
  storageTakeControl();const out=await archiveReturn(x.a);await storageFlush();
  return {ok:out.ok,back:!!salesRecord(x.a),scan:DB.stationScan.some(s=>s.by==='Archive test'),paid:finOrderBalance(salesRecord(x.a)).status,index:archiveIndex.has(x.a),created:DB.orderEvent.filter(e=>e.orderId===x.a&&e.what==='Created').length};
 },ids),{ok:true,back:true,scan:true,paid:'paid',index:false,created:1});
 const back=await snap();
 eq('после возврата склад и строка Sales — как до ухода',{inv:JSON.stringify(back.inv)===JSON.stringify(before.inv),row:JSON.stringify(back.rows[ids.a])===JSON.stringify(before.rows[ids.a])},{inv:true,row:true});
 eq('NCR по архивному заказу: заказ в работе, строки указателя нет, форма NCR открыта',await t.p.evaluate(async x=>{
  await archiveOpen(x.b);await archiveNcr();await storageFlush();
  return {back:!!salesRecord(x.b),edit:soEdit===x.b,index:archiveIndex.has(x.b),form:!!ncrForm,visit:storageVisit.size,stored:(await storageIdbColdOf(x.b)).length};
 },ids),{back:true,edit:true,index:false,form:true,visit:0,stored:0});
 eq('архив без ошибок страницы',t.errs,[]);
 await t.c.close();
};
