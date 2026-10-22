/* =====================================================================
   erp/archive  ·  erp-1.0
   Архив (задание «База», этап 3, А2): какие заказы уходят из работы, что
   уходит вместе с ними, что они оставляют после себя и как возвращаются.
   Владелец, 22.10.2026: через 3 месяца после отгрузки и полной оплаты;
   Hold не уходит; комиссия агенту заказ не держит («в агента падает номер
   заказа и его комиссия»). Склад — cold (erp/storage-records): перенос —
   storageColdMove внутри действия, возврат — storageColdBring; строка
   Sales — указатель архива (склад archive, archiveIndex в памяти).
   Сам уход пока выключен (ARCHIVE_ON): archiveRun вызывают проверки и
   инструменты. Включится, когда Sales, отчёты и Agents видят архив (А5),
   иначе экран молча показывал бы меньше, чем есть.
   IN : DB, salesListValue, finOrderBalance, shippingHistoryOrderIds,
        invSheetRows, invOffcutRows
   OUT: archiveIndex, archiveDue(day), archiveCollect(ids), archiveRun(day),
        archiveReturn(orderId), archiveIndexLoad / archiveIndexApply
   ===================================================================== */
const ARCHIVE_ON=false,ARCHIVE_MONTHS=3;
DEFAULT.archiveFloor={};DEFAULT.inventoryArchived={};
let archiveIndex=new Map();
function archiveIndexLoad(rows){archiveIndex=new Map((rows||[]).map(r=>[r.id,r.row]));}
function archiveIndexApply(pairs,clear){if(clear)archiveIndex=new Map();(pairs||[]).forEach(([id,row])=>{if(row)archiveIndex.set(id,row);else archiveIndex.delete(id);});}

/* Хранимые счётчики: наибольший номер, ушедший в архив, — номера «максимум
   + 1» не начнутся заново, когда старые заказы уйдут из работы. */
function archiveFloor(name){const f=DB.archiveFloor;return f&&Number.isFinite(+f[name])?+f[name]:0;}
function archiveFloorRaise(name,n){if(!(n>archiveFloor(name)))return;if(!DB.archiveFloor||typeof DB.archiveFloor!=='object')DB.archiveFloor={};DB.archiveFloor[name]=n;}

/* День, с которого считаются 3 месяца, — позже всего из: отгрузка, приём,
   полная оплата, закрытие, отмена. */
function archiveCutoff(day){const d=new Date(String(day).slice(0,10)+'T12:00:00');d.setMonth(d.getMonth()-ARCHIVE_MONTHS);return d.toISOString().slice(0,10);}
function archiveContext(){
 const ships=new Map(),pays=new Map(),add=(m,k,v)=>{let a=m.get(k);if(!a)m.set(k,a=[]);a.push(v);};
 (DB.shipment||[]).forEach(s=>shippingHistoryOrderIds(s).forEach(id=>add(ships,id,s)));
 (DB.receipt||[]).forEach(r=>{if(r.voided)return;(r.allocations||[]).forEach(a=>add(pays,a.orderId,r));});
 return {ships,pays,hot:new Set((DB.salesOrder||[]).map(o=>o.id))};
}
function archiveDayOf(o,ctx){
 const d=o.statusDates||{},days=['done','closed','cancelled'].map(k=>d[k]);
 (ctx.ships.get(o.id)||[]).forEach(s=>days.push(s.shippedAt,s.deliveredAt));
 (ctx.pays.get(o.id)||[]).forEach(r=>days.push(r.date));
 return days.filter(Boolean).map(x=>String(x).slice(0,10)).sort().pop()||String(o.updatedAt||o.createdAt||'').slice(0,10);
}
/* Заказ закрыт: отгружен целиком (или закрыт офисом) и оплачен без долга и
   переплаты, или отменён без денег на нём; накладной в пути нет; не Hold. */
function archiveOrderClosed(o,ctx){
 if(!o||salesIsQuote(o)||o.onHold)return false;
 if(o.status==='cancelled'){if((ctx.pays.get(o.id)||[]).length)return false;}
 else if(!['done','closed'].includes(o.status))return false;
 else if(!['paid','empty'].includes(finOrderBalance(o).status))return false;
 return !(ctx.ships.get(o.id)||[]).some(s=>s.status==='planned'||s.status==='shipped'&&s.method==='delivery');
}
/* Кому пора в архив на день day: заказы и группы квот. Переделка NCR и её
   исходный заказ уходят только вместе; квота без ответа — через 3 месяца
   после последней ревизии; выигравшая квота — вместе со своим заказом. */
function archiveDue(day){
 const ctx=archiveContext(),cut=archiveCutoff(day),due=new Set();
 (DB.salesOrder||[]).forEach(o=>{if(!salesIsQuote(o)&&archiveOrderClosed(o,ctx)&&archiveDayOf(o,ctx)<=cut)due.add(o.id);});
 const links=(DB.ncr||[]).filter(n=>n.remakeOrderId).map(n=>[n.orderId,n.remakeOrderId]);
 for(let changed=true;changed;){changed=false;links.forEach(([a,b])=>{if(due.has(a)!==due.has(b)&&(due.has(a)?ctx.hot.has(b):ctx.hot.has(a))){due.delete(a);due.delete(b);changed=true;}});}
 const seen=new Set();
 (DB.salesOrder||[]).forEach(o=>{
  if(!salesIsQuote(o))return;const g=salesQuoteGroupId(o);if(seen.has(g))return;seen.add(g);
  const ms=salesQuoteMembers(o),won=ms.find(m=>m.status==='won'),last=ms.map(m=>String(m.createdAt||'').slice(0,10)).sort().pop()||'';
  const ready=won?!!won.wonOrderId&&(due.has(won.wonOrderId)||!ctx.hot.has(won.wonOrderId)):!ms.some(m=>m.wonOrderId&&ctx.hot.has(m.wonOrderId))&&last<=cut;
  if(ready)ms.forEach(m=>due.add(m.id));
 });
 return due;
}

/* Записи, которые уходят вместе с заказами ids: [{tbl,row,owners,month}].
   Общая запись (батч, накладная, оплата) уходит, только когда ни один её
   заказ не остаётся в работе. */
function archiveCollect(ids){
 const out=[],live=new Set((DB.salesOrder||[]).map(o=>o.id).filter(id=>!ids.has(id))),gone=id=>!live.has(id);
 const ctx=archiveContext(),month=new Map();
 (DB.salesOrder||[]).forEach(o=>{if(ids.has(o.id))month.set(o.id,archiveDayOf(o,ctx).slice(0,7));});
 const add=(tbl,row,owners)=>{const o=[...new Set(owners.filter(Boolean))];out.push({tbl,row,owners:o,month:o.map(x=>month.get(x)||'').sort().pop()||''});};
 const own=(tbl,field)=>(DB[tbl]||[]).forEach(r=>{if(r&&ids.has(r[field]))add(tbl,r,[r[field]]);});
 const lines=new Set(),pieces=new Set(),shapeOwner=new Map(),liveShapes=new Set();
 const refs=(o,l)=>[l.shapeRef&&l.shapeRef.id].concat(Object.values(l.liteShapes||{}).map(x=>x&&x.id));
 (DB.salesOrder||[]).forEach(o=>(o.lines||[]).forEach(l=>refs(o,l).forEach(id=>{if(!id)return;if(ids.has(o.id))shapeOwner.set(id,o.id);else liveShapes.add(id);})));
 (DB.recut||[]).forEach(r=>[r.shapeRef&&r.shapeRef.id].concat(Object.values(r.liteShapes||{}).map(x=>x&&x.id)).forEach(id=>{if(!id)return;if(ids.has(r.orderId))shapeOwner.set(id,r.orderId);else liveShapes.add(id);}));
 (DB.salesOrder||[]).forEach(o=>{if(ids.has(o.id)){add('salesOrder',o,[o.id]);(o.lines||[]).forEach(l=>lines.add(l.id));}});
 (DB.shapeDef||[]).forEach(s=>{if(!s||liveShapes.has(s.id))return;const by=shapeOwner.get(s.id)||(s.ownerLineId&&lines.has(s.ownerLineId)?[...ids].find(id=>(salesRecord(id)||{lines:[]}).lines.some(l=>l.id===s.ownerLineId)):'');if(by)add('shapeDef',s,[by]);});
 ['financeTerms','orderEvent','recut','ncr','skip','productionUnbatch'].forEach(t=>own(t,'orderId'));
 const keyed=tbl=>(DB[tbl]||[]).forEach(r=>{const id=r&&String(r.key||'').split('|')[0];if(ids.has(id))add(tbl,r,[id]);});
 ['glassPiece','glassUnitId','productionRoute'].forEach(keyed);
 (DB.glassPiece||[]).forEach(r=>{if(r&&ids.has(String(r.key).split('|')[0]))r.ids.concat(...Object.values(r.extra||{})).forEach(id=>id&&pieces.add(id));});
 (DB.glassUnitId||[]).forEach(r=>{if(r&&ids.has(String(r.key).split('|')[0]))(r.ids||[]).forEach(id=>id&&pieces.add(id));});
 const pieceOwner=new Map();(DB.glassPiece||[]).concat(DB.glassUnitId||[]).forEach(r=>{const id=r&&String(r.key).split('|')[0];if(ids.has(id))(r.ids||[]).concat(...Object.values(r.extra||{})).forEach(p=>p&&pieceOwner.set(p,id));});
 (DB.stationScan||[]).forEach(s=>{if(s&&pieces.has(s.piece))add('stationScan',s,[pieceOwner.get(s.piece)]);});
 const batches=new Set();
 (DB.glassBatch||[]).forEach(b=>{
  const orders=[...new Set(b.parts.map(p=>p.orderId))];if(!orders.some(id=>ids.has(id)))return;
  if(b.parts.some((p,i)=>live.has(p.orderId)&&b.items.some(x=>x.part===i&&!x.releasedAt)))return;
  batches.add(b.number);add('glassBatch',b,orders.filter(gone));
 });
 (DB.cutPlan||[]).forEach(p=>{if(p&&batches.has(p.batch))add('cutPlan',p,(DB.glassBatch||[]).find(b=>b.number===p.batch).parts.map(x=>x.orderId).filter(gone));});
 (DB.sheetBreak||[]).forEach(x=>{if(x&&batches.has(x.batch)){const b=(DB.glassBatch||[]).find(y=>y.number===x.batch);add('sheetBreak',x,b.parts.map(p=>p.orderId).filter(gone));}});
 const out_=typeof skidsOut==='function'?skidsOut():new Map();
 (DB.shipment||[]).forEach(s=>{
  const orders=shippingHistoryOrderIds(s);if(!orders.some(id=>ids.has(id))||orders.some(id=>live.has(id)))return;
  if(s.status==='planned'||s.status==='shipped'&&s.method==='delivery')return;
  if((s.skidsOut||[]).some(c=>out_.has&&out_.has(c)))return;
  add('shipment',s,orders);
 });
 const receipts=new Set();
 (DB.receipt||[]).forEach(r=>{
  const orders=[...new Set((r.allocations||[]).map(a=>a.orderId))];if(!orders.length||!orders.some(id=>ids.has(id))||orders.some(id=>live.has(id)))return;
  if(!r.voided&&finReceiptOnAccount(r)!==0)return;
  receipts.add(r.id);add('receipt',r,orders);
 });
 const refunds=new Set();(DB.refund||[]).forEach(f=>{if(f&&receipts.has(f.receiptId)){refunds.add(f.id);const r=(DB.receipt||[]).find(x=>x.id===f.receiptId);add('refund',f,[...new Set(r.allocations.map(a=>a.orderId))]);}});
 (DB.financeEvent||[]).forEach(e=>{
  if(!e)return;const orders=(e.orders||[]).map(x=>x&&x.id||x).filter(Boolean),entity=e.entityId;
  const mine=ids.has(entity)||receipts.has(entity)||refunds.has(entity);if(!mine||orders.some(id=>live.has(id)))return;
  add('financeEvent',e,orders.length?orders:[entity]);
 });
 (DB.referrerPayout||[]).forEach(p=>{const orders=(p.orders||[]).map(x=>x.orderId);if(orders.length&&orders.some(id=>ids.has(id))&&!orders.some(id=>live.has(id)))add('referrerPayout',p,orders);});
 return out;
}

/* Строка Sales на день ухода — все колонки списка (SALES_LIST_COLUMNS);
   клиент — номером, имя Sales берёт живое. */
function archiveRowOf(o,day,now){
 const info=salesListInfo(o),row={};
 (typeof SALES_LIST_COLUMNS!=='undefined'?SALES_LIST_COLUMNS:[]).forEach(c=>{try{row[c.k]=salesListValue(info,c.k);}catch(e){row[c.k]=null;}});
 return {kind:salesIsQuote(o)?'quote':'order',customerId:o.customerId||'',number:o.businessNumber||'',createdAt:o.createdAt||'',groupId:salesIsQuote(o)?salesQuoteGroupId(o):'',day,archivedAt:now,row};
}

/* Склад листов и обрезки — что они показывают, без журнала движений. */
function archiveInvState(){
 const sheets=new Map(),offcuts=new Map();
 if(typeof invSheetRows==='function')invSheetRows().forEach(r=>sheets.set(r.key,{cut:r.cut,broken:r.broken}));
 if(typeof invOffcutRows==='function')invOffcutRows().forEach(o=>offcuts.set(o.id,{status:o.status,used:o.used,broken:o.broken,onRackAt:o.onRackAt,onRackBy:o.onRackBy}));
 return {sheets,offcuts};
}
/* Разница «до − после» по складу ложится в inventoryArchived: склад
   прибавляет её, остаток не меняется ни на лист. sign −1 — возврат. */
function archiveInvKeep(before,after,sign){
 const A=DB.inventoryArchived&&typeof DB.inventoryArchived==='object'?DB.inventoryArchived:(DB.inventoryArchived={});
 A.sheets=A.sheets||{};A.offcuts=A.offcuts||{};
 before.sheets.forEach((b,key)=>{const a=after.sheets.get(key)||{cut:0,broken:0},x=A.sheets[key]||{cut:0,broken:0};
  x.cut+=(b.cut-a.cut)*sign;x.broken+=(b.broken-a.broken)*sign;if(x.cut||x.broken)A.sheets[key]=x;else delete A.sheets[key];});
 if(sign>0)before.offcuts.forEach((b,id)=>{const a=after.offcuts.get(id);if(a&&JSON.stringify(a)===JSON.stringify(b))return;
  const slim=x=>x?{at:x.at||'',by:x.by||'',batch:x.batch||'',sheet:x.sheet||''}:null;A.offcuts[id]={used:slim(b.used),broken:slim(b.broken),onRackAt:b.onRackAt||'',onRackBy:b.onRackBy||''};});
}

/* Уход в архив на день day (по умолчанию сегодня): одной командой — откат
   целиком. limit — сколько заказов за раз (экран не замирает надолго). */
function archiveRun(day,opts){
 opts=opts||{};day=String(day||new Date().toISOString()).slice(0,10);
 const now=new Date().toISOString();
 return storageCommand(()=>{
  let due=[...archiveDue(day)];if(opts.limit)due=due.slice(0,opts.limit);
  const ids=new Set(due);if(!ids.size)return {orders:0,records:0};
  const set=archiveCollect(ids),ctx=archiveContext();
  const rows=readScope(()=>(DB.salesOrder||[]).filter(o=>ids.has(o.id)).map(o=>[o.id,archiveRowOf(o,archiveDayOf(o,ctx),now)]));
  const num=(v,re)=>{const m=re.exec(String(v||''));return m?+m[1]:0;};
  set.forEach(x=>{
   if(x.tbl==='salesOrder'){if(salesIsQuote(x.row))archiveFloorRaise('quote',num(x.row.businessNumber,/^Q-(\d+)/));else archiveFloorRaise('order',+String(x.row.businessNumber||'').replace(/\D/g,'')||0);
    [x.row.batchNo].concat(x.row.batchHistory||[],(x.row.lines||[]).map(l=>l.batchNo)).forEach(v=>archiveFloorRaise('batch',num(v,/^B-(\d+)$/)));}
   if(x.tbl==='glassBatch')archiveFloorRaise('batch',num(x.row.number,/^B-(\d+)$/));
   if(x.tbl==='ncr')archiveFloorRaise('ncr',num(x.row.number,/^NCR(\d+)$/));
   if(x.tbl==='receipt')archiveFloorRaise('receipt',num(x.row.number,/^R-(\d+)$/));
   if(x.tbl==='financeEvent')archiveFloorRaise('financeEvent',+x.row.seq||0);
  });
  const before=archiveInvState();
  const byTbl=new Map();set.forEach(x=>{let a=byTbl.get(x.tbl);if(!a)byTbl.set(x.tbl,a=[]);a.push(x);});
  byTbl.forEach((list,tbl)=>storageColdMoveAll(tbl,list));
  archiveInvKeep(before,archiveInvState(),1);
  rows.forEach(([id,row])=>storageArchiveIndex(id,row));
  return {orders:ids.size,records:set.length};
 });
}
/* Вернуть заказ в работу (NCR, поздняя оплата, возврат денег): весь его
   набор — и общие записи с другими заказами — встаёт на место; строка
   указателя снимается; склад — разница обратно. */
async function archiveReturn(orderId){
 await storageFlush();
 const got=await storageIdbColdOf(orderId);if(!got.length)return {ok:true,value:0};
 const owners=new Set();got.forEach(r=>(r.owners||[]).forEach(o=>owners.add(o)));
 return storageCommand(()=>{
  const before=archiveInvState();
  got.forEach(r=>storageColdPut(r));
  archiveInvKeep(before,archiveInvState(),-1);
  if(DB.inventoryArchived&&DB.inventoryArchived.offcuts)(DB.stockOffcut||[]).forEach(o=>{if(got.some(r=>r.tbl==='glassBatch'&&JSON.parse(r.data).number===o.batch))delete DB.inventoryArchived.offcuts[o.id];});
  (DB.salesOrder||[]).forEach(o=>{if(owners.has(o.id)&&archiveIndex.has(o.id))storageArchiveIndex(o.id,null);});
  return got.length;
 });
}
