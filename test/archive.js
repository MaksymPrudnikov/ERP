/* Архив (задание «База», этап 3, А2, erp/archive): кто уходит, что уходит
   вместе, что остаётся (строка Sales, счётчики, склад листов), F5 и
   возврат. Уход выключен (ARCHIVE_ON) — здесь archiveRun вызывается сам. */
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
  if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(a,'verified');
  const b0=glassBatchAssign(glassBatchRows([salesRecord(a)]),{}),plan=cutPlanRun(b0.number);if(plan&&plan.error)throw new Error(plan.error);
  const o=salesRecord(a),l=o.lines[0],piece=glassPieceMap(a).get(glassBatchComponents(o,l)[0].key).ids[0];stationMove('CUT',stationCheck('CUT',piece),{id:'ar',name:'Archive test'});
  const b=oqOrder(oqCustomer({legalName:'Second customer'})),h=oqOrder(oqCustomer({legalName:'Hold customer'})),open=oqOrder(oqCustomer({legalName:'Open customer'}));salesDraftDrop();
  storageCommand(()=>{[a,b,h].forEach(id=>{const x=salesRecord(id);x.status='done';x.statusDates=Object.assign({},x.statusDates,{done:'2026-01-10T12:00:00.000Z'});});salesRecord(h).onHold=true;});
  [a,b].forEach(id=>{const x=salesRecord(id),total=finOrderTotals(x).grand;finPersist(()=>finSaveReceiptRecord({customerId:x.customerId,date:'2026-01-15',method:'cash',reference:'',note:'',amount:total,allocations:[{orderId:id,amount:total}],currency:'CAD'},'','',true));});
  await storageFlush();return {a,b,h,open};
 });
 const snap=()=>t.p.evaluate(()=>readScope(()=>({
  rows:Object.fromEntries(DB.salesOrder.map(o=>{const i=salesListInfo(o);return [o.id,SALES_LIST_COLUMNS.map(c=>salesListValue(i,c.k))];})),
  inv:invSheetRows().map(r=>[r.key,r.onRack,r.free,r.cut]),deposit:DB.customer.map(c=>finCustomerDeposit(c.id)),
  next:[nextSalesOrderNumber(),salesNextBatchNumber(),finNextReceiptNumber()]})));
 const before=await snap();
 eq('кому пора: отгружен и оплачен 3 месяца назад — да; Hold, не отгружен и рано — нет',await t.p.evaluate(x=>{
  const due=d=>{const s=archiveDue(d);return [x.a,x.b,x.h,x.open].map(id=>s.has(id));};return {june:due('2026-06-01'),march:due('2026-03-20')};
 },ids),{june:[true,true,false,false],march:[false,false,false,false]});
 const run=await t.p.evaluate(async()=>{const r=archiveRun('2026-06-01');await storageFlush();return r;});
 eq('уход в архив: оба заказа и их записи ушли одной командой',{ok:run.ok,orders:run.value.orders,records:run.value.records>10},{ok:true,orders:2,records:true});
 const mid=await t.p.evaluate(x=>({hot:[x.a,x.b,x.h,x.open].map(id=>!!salesRecord(id)),index:[...archiveIndex.keys()].sort().join()===[x.a,x.b].sort().join(),
  scans:DB.stationScan.some(s=>s.by==='Archive test'),receipts:DB.receipt.some(r=>r.allocations.some(a=>a.orderId===x.a)),deleted:DB.orderEvent.some(e=>e.what==='Deleted'),sheetsKept:Object.values(DB.inventoryArchived.sheets||{}).reduce((n,x)=>n+x.cut,0)}),ids);
 eq('…в работе их нет, их скан и оплата ушли, в журнале заказа нет «Deleted», порезанный лист — в разнице склада',mid,{hot:[false,false,true,true],index:true,scans:false,receipts:false,deleted:false,sheetsKept:1});
 const after=await snap();
 eq('строка Sales ушедших — та же; оставшиеся, склад, депозиты, следующие номера — те же',{
  index:await t.p.evaluate(([x,b])=>[x.a,x.b].every(id=>JSON.stringify(SALES_LIST_COLUMNS.map(c=>archiveIndex.get(id).row[c.k]))===JSON.stringify(b.rows[id])),[ids,before]),
  rows:[ids.h,ids.open].every(id=>JSON.stringify(after.rows[id])===JSON.stringify(before.rows[id])),inv:JSON.stringify(after.inv)===JSON.stringify(before.inv),
  deposit:JSON.stringify(after.deposit)===JSON.stringify(before.deposit),next:JSON.stringify(after.next)===JSON.stringify(before.next)},
  {index:true,rows:true,inv:true,deposit:true,next:true});
 await t.p.reload();await t.p.evaluate(()=>window.storageReady);
 const f5=await snap();
 eq('после F5: архив не загружен, указатель на месте, склад и номера те же',{
  hot:await t.p.evaluate(x=>[x.a,x.b].some(id=>!!salesRecord(id)),ids),index:await t.p.evaluate(()=>archiveIndex.size),
  inv:JSON.stringify(f5.inv)===JSON.stringify(before.inv),next:JSON.stringify(f5.next)===JSON.stringify(before.next)},{hot:false,index:2,inv:true,next:true});
 eq('возврат в работу: заказ, его скан и оплата на месте, строки указателя нет, склад тот же',await t.p.evaluate(async x=>{
  storageTakeControl();const out=await archiveReturn(x.a);await storageFlush();
  return {ok:out.ok,back:!!salesRecord(x.a),scan:DB.stationScan.some(s=>s.by==='Archive test'),paid:finOrderBalance(salesRecord(x.a)).status,index:archiveIndex.has(x.a),created:DB.orderEvent.filter(e=>e.orderId===x.a&&e.what==='Created').length};
 },ids),{ok:true,back:true,scan:true,paid:'paid',index:false,created:1});
 const back=await snap();
 eq('после возврата склад и строка Sales — как до ухода',{inv:JSON.stringify(back.inv)===JSON.stringify(before.inv),row:JSON.stringify(back.rows[ids.a])===JSON.stringify(before.rows[ids.a])},{inv:true,row:true});
 eq('архив без ошибок страницы',t.errs,[]);
 await t.c.close();
};
