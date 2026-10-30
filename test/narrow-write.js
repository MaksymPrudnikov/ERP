/* Узкая запись не оставляет введённого в памяти (аудит 29.10.2026, А4, А5).
   Команда с областью пишет только названное; остальное ждёт сверки в простое
   (30 с), и F5 раньше этого его терял. Save со сменой клиента пишет запись
   журнала Finance, отмена заказа — перенос оплаты на депозит: после команды
   и записи на диск в памяти не остаётся ничего, F5 их не теряет. */
module.exports=async function({page,eq}){
 console.log('narrow-write');
 const t=await page();await require('./optimization-fixture')(t.p);
 const left=()=>t.p.evaluate(async()=>{await storageFlush();return [...new Set(storageDiff(DB).map(x=>x.tbl))];});
 const f5=async()=>{await t.p.reload();await t.p.evaluate(()=>window.storageReady);await require('./optimization-fixture')(t.p);};
 const ids=await t.p.evaluate(async()=>{
  oqReset();const a=oqCustomer({legalName:'Alpha Narrow'}),b=oqCustomer({legalName:'Beta Narrow'}),one=oqOrder(a),two=oqOrder(a);touch();await storageFlush();
  salesOrderEdit(one);soDraft.customerId=b.id;salesOrderSave();salesDraftDrop();
  return {one,two,b:b.id};
 });
 const afterSave=await left();await f5();
 eq('Save со сменой клиента: журнал Finance записан сразу, F5 его не теряет',{left:afterSave,...await t.p.evaluate(ids=>({
  customer:salesRecord(ids.one).customerId===ids.b,terms:DB.financeTerms.find(x=>x.orderId===ids.one).customerId===ids.b,
  journal:(DB.financeEvent||[]).filter(e=>e.kind==='terms'&&e.entityId===ids.one).length}),ids)},{left:[],customer:true,terms:true,journal:1});
 await t.p.evaluate(async id=>{
  const o=salesRecord(id),sum=finOrderBalance(o).total,d={customerId:o.customerId,currency:'CAD',date:finToday(),method:'etransfer',reference:'NW-1',amount:sum,note:'',allocations:[{orderId:id,amount:sum}]};
  finPersist(()=>finSaveReceiptRecord(d,null,''),finReceiptScope(d,null));await storageFlush();
  salesSetRecordStatus(id,'cancelled');
 },ids.two);
 const afterCancel=await left();await f5();
 eq('отмена заказа с оплатой: квитанция и журнал записаны сразу, F5 их не теряет',{left:afterCancel,...await t.p.evaluate(id=>{
  const r=DB.receipt.find(x=>x.reference==='NW-1');
  return {status:salesRecord(id).status,allocations:r.allocations.length,journal:(DB.financeEvent||[]).filter(e=>e.kind==='released'&&e.entityId===r.id).length};},ids.two)},
  {left:[],status:'cancelled',allocations:0,journal:1});
 /* Команды с областью записи в разных случаях: после каждой и записи на
    диск в памяти ничего не остаётся (иначе — имя случая и таблицы). */
 const steps=[
  ['new order',()=>{window.NW1=oqOrder(oqCustomer({legalName:'Walk A'}));}],
  ['more units',()=>{salesOrderEdit(NW1);soDraft.lines[0].qty=3;salesOrderSave();}],
  ['new line',()=>{salesOrderEdit(NW1);const l=normalizeSalesOrderLine(Object.assign({},soDraft.lines[0],{id:'',qty:1,mark:'New'}));soDraft.lines.push(l);salesEnsureLineShape(l);salesOrderSave();}],
  ['PO and notes',()=>{salesOrderEdit(NW1);soDraft.customerPo='PO-W';soDraft.notes='Walk';salesOrderSave();}],
  ['surcharge for this order',()=>{salesOrderEdit(NW1);salesOpenMetrics('rules');salesSetOrderSurcharge('largeUnit','value','40');salesSetOrderSurcharge('minArea','value','8');salesOrderSave();}],
  ['customer changed',()=>{salesOrderEdit(NW1);soDraft.customerId=oqCustomer({legalName:'Walk B'}).id;salesOrderSave();}],
  ['line removed',()=>{salesOrderEdit(NW1);soDraft.lines.pop();salesOrderSave();}],
  ['batched: fewer units',()=>{window.NW2=oqOrder(oqCustomer({legalName:'Walk C'}));oqThrough(NW2,'batched');touch();salesOrderEdit(NW2);soDraft.lines[0].qty=1;salesOrderSave();}],
  ['batched: line removed',()=>{salesOrderEdit(NW2);soDraft.lines=soDraft.lines.slice(0,1);salesOrderSave();}],
  ['new quote',()=>{window.NWQ=oqOrder(oqCustomer({legalName:'Walk D'}),{kind:'quote'});}],
  ['quote sent',()=>{salesQuoteMarkSent([NWQ]);}],
  ['quote revision',()=>{salesOrderEdit(NWQ);soDraft.lines[0].qty=4;salesOrderSave();}],
  ['quote converted',()=>{salesConvertQuoteRecord(NWQ,'PO-Q');}],
  ['verified',()=>{window.NW3=oqOrder(oqCustomer({legalName:'Walk E'}));salesSetRecordStatus(NW3,'verified');}],
  ['batched',()=>{salesSetRecordStatus(NW3,'batched');}],
  ['payment',()=>{const o=salesRecord(NW3),s=finOrderBalance(o).total,d={customerId:o.customerId,currency:'CAD',date:finToday(),method:'etransfer',reference:'NW-2',amount:s,note:'',allocations:[{orderId:NW3,amount:s}]};finPersist(()=>finSaveReceiptRecord(d,null,''),finReceiptScope(d,null));}],
  ['restore',()=>{window.NW4=oqOrder(oqCustomer({legalName:'Walk F'}));salesSetRecordStatus(NW4,'cancelled');salesSetRecordStatus(NW4,'new',{restore:true});}],
  ['batch',()=>{window.NW5=oqOrder(oqCustomer({legalName:'Walk G'}),{priority:'rush'});salesSetRecordStatus(NW5,'verified');glassBatchAssign(glassBatchRows([salesRecord(NW5)]),{});}],
  ['scans to Ready',()=>{oqReady(NW5);}],
  ['packing slip',()=>{const o=salesRecord(NW5),m=shippingCreate({customerId:o.customerId,method:'pickup',shipTo:{address1:'Walk'},date:finToday(),items:shippingAvailable(o).map(shippingItem),extras:[]});window.NWPS=m.value.id;}],
  ['shipped',()=>{shippingMarkShipped(NWPS);}]];
 const bad=[];
 for(const [name,fn] of steps){
  await t.p.evaluate(`(${fn})()`);
  const rest=await left();if(rest.length)bad.push(name+': '+rest.join(', '));
  await t.p.evaluate(()=>touch());
 }
 eq('узкая запись: 21 случай (Save, надбавки заказа, квота, статусы, оплата, батч, сканы, PS) — ничего не остаётся незаписанным',bad,[]);
 /* Short name стекла (владелец, 29.10.2026): Save карточки пишет его сразу, F5 не теряет. */
 await t.p.evaluate(()=>{tab='masterdata';mdCatalogGo('glassProduct');mdGlassEdit(glassProductByCode('6CLEAR').id);const el=document.getElementById('md_short');if(el)el.value='6 Clear';mdGlassSave();});
 const afterShort=await left();await f5();
 eq('Save карточки стекла: Short name записан сразу, F5 его не теряет',{left:afterShort,short:await t.p.evaluate(()=>glassProductByCode('6CLEAR').shortName||'')},{left:[],short:'6 Clear'});
 /* Контакт заказа (пункт 6): выбранное лицо Save пишет сразу, F5 его не теряет. */
 const contact=await t.p.evaluate(async()=>{
  const c=oqCustomer({legalName:'Contact Narrow',contacts:[{name:'First Person',isPrimary:true},{name:'Second Person'}]});touch();await storageFlush();
  const id=oqOrder(c),second=salesFindCustomer(c.id).contacts[1].id;salesOrderEdit(id);if(typeof salesContactPick==='function')salesContactPick(second);salesOrderSave();salesDraftDrop();return {id,second};
 });
 const afterContact=await left();await f5();
 eq('Save с выбранным контактом заказа: записан сразу, F5 его не теряет',{left:afterContact,contact:await t.p.evaluate(x=>salesRecord(x.id).customerContactId===x.second,contact)},{left:[],contact:true});
 /* Save as Draft (пункт 2): черновик пишется сразу, F5 его не теряет. */
 const draft=await t.p.evaluate(()=>{
  const c=oqCustomer({legalName:'Draft Narrow'});tab='sales';salesOrderNew('order');salesApplyCustomerDefaults(c.id);if(!soDraft.customerPo&&!salesIsQuote(soDraft))soDraft.customerPo='PO-T';soDraft.notes='Draft narrow';salesOrderClose();
  const i=salesDialog?salesDialog.buttons.findIndex(b=>b.label==='Save as Draft'):-1;if(i>=0)salesDialogChoose(i);else{salesDialog=null;salesDraftDrop(true);}
  const o=DB.salesOrder.find(x=>x.notes==='Draft narrow');return o?o.id:'';
 });
 const afterDraft=await left();await f5();
 eq('Save as Draft: черновик записан сразу, F5 его не теряет',{left:afterDraft,draft:await t.p.evaluate(id=>{const o=salesRecord(id);return !!o&&o.isDraft===true;},draft)},{left:[],draft:true});
 /* Copy order (пункт 8): Save копии пишет её сразу — заказ и копии фигур, F5 не теряет. */
 const copy=await t.p.evaluate(async()=>{
  const c=oqCustomer({legalName:'Copy Narrow'});touch();await storageFlush();const src=oqOrder(c);tab='sales';salesOrderEdit(src);
  if(typeof salesCopyOrder==='function')salesCopyOrder(src);
  if(soEdit!=='new'){salesDraftDrop();return {src,id:'',shapes:[]};}
  salesOrderSave();const o=salesRecord(soEdit);salesDraftDrop();return {src,id:o.id,shapes:o.lines.map(l=>l.shapeRef.id)};
 });
 const afterCopy=await left();await f5();
 eq('Copy order → Save: копия и её фигуры записаны сразу, F5 их не теряет',{left:afterCopy,...await t.p.evaluate(x=>({copy:!!salesRecord(x.id)&&x.id!==x.src,shapes:x.shapes.length>0&&x.shapes.every(id=>DB.shapeDef.some(s=>s.id===id))}),copy)},{left:[],copy:true,shapes:true});
 await t.c.close();
};
