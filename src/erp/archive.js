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
   Sales и вкладка Orders клиента (А3) показывают ушедшие строки вместе с
   живыми; клик — заказ с диска на том же экране, только просмотр и печать;
   Repeat — новый заказ из него; NCR — возврат в работу.
   IN : DB, salesListValue, finOrderBalance, shippingHistoryOrderIds,
        invSheetRows, invOffcutRows, storageIdbColdOf, storageVisit
   OUT: archiveIndex, archiveDue(day), archiveCollect(ids), archiveRun(day),
        archiveReturn(orderId), archiveIndexLoad / archiveIndexApply,
        archiveListInfos, archiveOpen(id), archiveViewing(o), archiveRepeat,
        archiveLedgerFor(customerId), archiveWith(owners,fn), archiveScopeFor(range)
   ===================================================================== */
const ARCHIVE_ON=false,ARCHIVE_MONTHS=3;
DEFAULT.archiveFloor={};DEFAULT.inventoryArchived={};
let archiveIndex=new Map(),archiveIncoming=null;
/* Заказ в архиве: строка указателя (клиент, вид). Пока идёт Import —
   указатель из файла (archiveIncoming; у прежнего JSON его нет). Записи в
   работе, которые ссылаются на ушедший заказ (оплата на два заказа, батч,
   накладная), нормализация и проверка Import не считают битыми. */
function archiveKnown(id){const m=archiveIncoming||archiveIndex;return id&&m.get(id)||null;}
/* В том же складе archive — строки выписки ушедших записей (ключ
   `L:<таблица>:<id>`): выписка клиента за любой период берёт их отсюда
   (finStatementLines). В памяти — по клиенту. */
let archiveLedgerBy=new Map(),archiveLedgerKeys=new Map();
function archiveIndexLoad(rows){archiveIndex=new Map();archiveLedgerBy=new Map();archiveLedgerKeys=new Map();archiveIndexApply((rows||[]).map(r=>[r.id,r.row]));}
function archiveIndexApply(pairs,clear){
 if(clear){archiveIndex=new Map();archiveLedgerBy=new Map();archiveLedgerKeys=new Map();}
 (pairs||[]).forEach(([id,row])=>{
  if(!String(id).startsWith('L:')){if(row)archiveIndex.set(id,row);else archiveIndex.delete(id);return;}
  const was=archiveLedgerKeys.get(id);if(was!=null){const m=archiveLedgerBy.get(was);if(m){m.delete(id);if(!m.size)archiveLedgerBy.delete(was);}archiveLedgerKeys.delete(id);}
  if(!row)return;let m=archiveLedgerBy.get(row.customerId);if(!m)archiveLedgerBy.set(row.customerId,m=new Map());m.set(id,row);archiveLedgerKeys.set(id,row.customerId);
 });
}
function archiveLedgerFor(customerId){const m=archiveLedgerBy.get(customerId);return m?[...m.values()]:[];}
/* Строки записей, которые сейчас уходят, — как в день ухода. Заказ: для
   Agents — номер, дата, сумма и HST (com); для выписки — начисление и
   строка раздела Orders (оплачен целиком). Оплата: для Agents — дата и
   разнесения (alloc); для выписки — строка. Возврат — строка выписки. */
function archiveLedgerOf(set){
 const out=[],paidOn=new Map();
 finActiveReceipts().forEach(r=>(r.allocations||[]).forEach(a=>{let d=paidOn.get(a.orderId);if(!d)paidOn.set(a.orderId,d=[]);d.push(r.date);}));
 set.forEach(x=>{
  const r=x.row,key='L:'+x.tbl+':'+r.id;
  if(x.tbl==='salesOrder'&&!salesIsQuote(r)){
   const t=finOrderTotals(r),e={id:r.id,customerId:r.customerId,com:{number:r.businessNumber||'',created:r.createdAt||'',t:{grand:t.grand,hst:t.hst,complete:!!t.complete}}},l=finStatementOrderLine(r);
   if(l&&l.skipped)e.skipped=r.businessNumber||'';
   else if(l){const f=finOrderFinancial(r);e.line=l;e.order={number:r.businessNumber||'',po:r.customerPo||'',billed:l.date,paidOn:paidOn.get(r.id)||[],
    f:{b:{total:f.b.total,paid:f.b.paid,balance:f.b.balance,status:f.b.status},overdue:0,dueOn:f.dueOn||'',terms:{paymentMode:f.terms.paymentMode,creditDays:f.terms.creditDays},handover:f.handover}};}
   out.push([key,e]);
  }
  if(x.tbl==='receipt'&&!r.voided){const e={id:r.id,customerId:r.customerId,date:r.date,alloc:(r.allocations||[]).map(a=>({orderId:a.orderId,amount:a.amount}))},l=finStatementPaymentLine(r);if(l)e.line=l;out.push([key,e]);}
  if(x.tbl==='refund'){const l=finStatementRefundLine(r);if(l)out.push([key,{id:r.id,customerId:r.customerId,line:l}]);}
 });
 return out;
}

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
 /* Выплаты агентам остаются в работе: их мало, а «к выплате» считается по
    ним за всё время (Agents, finance/commissions). */
 /* Журнал выгрузок QuickBooks — вместе со своей оплатой или заказом. */
 const exported=new Map();out.forEach(x=>{if(['salesOrder','receipt','refund'].includes(x.tbl))exported.set(x.row.id,x.owners);});
 (DB.financeExport||[]).forEach(e=>{if(e&&exported.has(e.entityId))add('financeExport',e,exported.get(e.entityId));});
 return out;
}

/* Строка Sales на день ухода — все колонки списка (SALES_LIST_COLUMNS);
   клиент — номером, имя Sales берёт живое. status — код (кнопки статусов
   над списком), rep — квота, которая стоит в списке за свою группу, pay —
   как Sales показывает Balance (Paid). */
function archiveRowOf(o,day,now){
 const info=salesListInfo(o),row={};
 (typeof SALES_LIST_COLUMNS!=='undefined'?SALES_LIST_COLUMNS:[]).forEach(c=>{try{row[c.k]=salesListValue(info,c.k);}catch(e){row[c.k]=null;}});
 const q=salesIsQuote(o),b=info.memo.balanceInfo;
 return {kind:q?'quote':'order',status:salesListStatus(o),customerId:o.customerId||'',currency:o.currency||'',number:o.businessNumber||'',createdAt:o.createdAt||'',groupId:q?salesQuoteGroupId(o):'',rep:!q||salesQuoteRepresentative(o).id===o.id,
  pay:b?{status:b.status,balance:b.balance}:null,day,archivedAt:now,row};
}

/* ------------------------- Sales и клиент ------------------------------ */
/* Ушедшие строки для списка Sales и вкладки Orders клиента: те же info, что
   у живых (salesListInfo), значения — из снятой строки (archiveListValue).
   Квота — одной строкой за группу, как в работе. Заказ на просмотре сейчас
   в DB — его строку список берёт оттуда. */
function archiveListInfos(test){
 const out=[];
 archiveIndex.forEach((a,id)=>{if(!a.rep||archiveVisit&&archiveVisit.ids.has(id)||!test(a))return;
  out.push({o:{id,kind:a.kind,status:a.status||'',customerId:a.customerId,createdAt:a.createdAt,businessNumber:a.number,archived:true},q:a.kind==='quote',a,c:null,memo:{}});});
 return out;
}
function archiveListValue(info,k){
 const a=info.a;let v=Object.prototype.hasOwnProperty.call(a.row,k)?a.row[k]:null;
 if(k==='customer'||k==='rep'){const c=readMemo('archiveCustomers',[DB.customer],()=>new Map((DB.customer||[]).map(x=>[x.id,x]))).get(a.customerId);if(c)v=k==='customer'?c.displayName||c.legalName||'':c.salesRep||'';}
 if(k==='balance'&&a.pay)info.memo.balanceInfo=a.pay;
 info.memo[k]=v;return v;
}
/* Ячейка ушедшей строки: статус — как был, с серой меткой Archived. */
function archiveListCell(info,col){
 if(col.k==='status')return `<td><span class="pill st-${esc(info.a.status||'')}">${esc(salesListValue(info,'status')||'')}</span> <span class="pill archived" data-archived>Archived</span></td>`;
 if(col.k==='number'){const v=salesListValue(info,'number'),from=info.q?'':salesListValue(info,'fromQuote');return `<td><b class="mono">${raw(v||'—')}</b>${from?` <span class="mut small">from ${raw(from)}</span>`:''}</td>`;}
 return salesListCell(info,col);
}
function archiveListRow(r,cols){
 const id=esc(r.o.id);
 return `<tr data-archived-row="${id}" class="sl-row-archived" ondblclick="archiveOpen('${id}')"><td class="sl-check"></td>${cols.map(c=>archiveListCell(r,c)).join('')}<td class="sales-row-actions"><button class="sm" onclick="archiveOpen('${id}')">Open</button></td></tr>`;
}

/* ------------------------- Просмотр с диска --------------------------- */
/* Заказ из архива на экране — только просмотр и печать (владелец,
   22.10.2026: «тот же экран»). Его записи читаются с диска и встают в DB,
   пока он открыт; сравнение базы их не видит (storageVisit) — в базу они не
   пишутся. Закрыли заказ (salesDraftDrop) — записи убираются по ключам. */
let archiveVisit=null;
async function archiveOpen(id){
 const a=archiveIndex.get(id);if(!a)return false;
 archiveScopeDrop();
 if(typeof soDraft!=='undefined'&&soDraft){salesLeaveDraft(()=>archiveOpen(id));return false;}
 const ids=a.kind==='quote'?[...archiveIndex].filter(([,x])=>x.kind==='quote'&&x.groupId===a.groupId).map(([k])=>k):[id];
 const recs=await archiveRead(ids);
 if(!recs.some(r=>r.tbl==='salesOrder'&&r.id===id)){alert('This archived order could not be read.');return false;}
 archiveVisitEnd();
 const tables=archiveRowsPut(recs,true);
 archiveVisit={id,ids:new Set(ids),tables,arrays:new Map([...tables.keys()].map(t=>[t,DB[t]]))};
 salesOrderEdit(id);return true;
}
/* Просмотр закрыт — строки уходят из DB. */
function archiveVisitEnd(){const v=archiveVisit;if(!v)return;archiveVisit=null;archiveRowsDrop(v.tables);}
/* Записи ушедших заказов owners с диска (общая запись — один раз). */
async function archiveRead(owners){
 const seen=new Set(),recs=[];
 for(const owner of owners)(await storageIdbColdOf(owner)).forEach(r=>{const k=r.tbl+'\u0000'+r.id;if(!seen.has(k)){seen.add(k);recs.push(r);}});
 return recs;
}
/* Записи архива — в DB на время просмотра или расчёта; сравнение базы их не
   видит (storageVisit). Уже стоящие (открытый заказ) не дублируются. Встают
   на прежнее место по seq — порядок строк тот же, что до ухода, и отчёты
   складывают в том же порядке. Возвращает поставленное: tbl → Map id → текст
   записи (keep — для просмотра, который возвращает строки после пересборки
   таблицы; отчёту и расчёту текст не нужен — меньше памяти). */
function archiveRowsPut(recs,keep){
 const put=new Map(),byTbl=new Map();
 recs.forEach(r=>{const v=storageVisit.get(r.tbl);if(v&&v.has(r.id))return;let a=byTbl.get(r.tbl);if(!a)byTbl.set(r.tbl,a=[]);a.push(r);});
 byTbl.forEach((list,tbl)=>{
  if(!Array.isArray(DB[tbl]))DB[tbl]=[];
  const rows=DB[tbl],base=storageBase.get(tbl)||new Map(),out=[],t=new Map();let v=storageVisit.get(tbl),i=0;
  if(!v)storageVisit.set(tbl,v=new Set());put.set(tbl,t);
  list.sort((a,b)=>a.seq-b.seq);
  /* Строка в работе без seq (ещё не записана) — в конце, как и была. */
  rows.forEach(row=>{const b=base.get(storageRowKey(tbl,row)),seq=b?b.s:Infinity;for(;i<list.length&&list[i].seq<seq;i++)out.push(JSON.parse(list[i].data));out.push(row);});
  for(;i<list.length;i++)out.push(JSON.parse(list[i].data));
  /* Массив тот же: на него держат ссылки. */
  rows.length=0;out.forEach(x=>rows.push(x));
  list.forEach(r=>{v.add(r.id);t.set(r.id,keep?r.data:'');});
 });
 storageInvalidate();return put;
}
/* Убрать поставленное — по ключам (объект строки мог смениться: правка формы
   на экране, откат). */
function archiveRowsDrop(put){
 put.forEach((t,tbl)=>{const a=DB[tbl],v=storageVisit.get(tbl);
  if(Array.isArray(a)){let n=0;for(let i=0;i<a.length;i++)if(!t.has(storageRowKey(tbl,a[i])))a[n++]=a[i];a.length=n;}
  if(v){t.forEach((x,id)=>v.delete(id));if(!v.size)storageVisit.delete(tbl);}});
 storageInvalidate();
}
/* ------------------------- Отчёты за прошлые месяцы -------------------- */
/* Отчёт, чей период захватывает ушедшие заказы (Reports): записи заказов,
   чья жизнь «создан … день ухода» пересекает период, читаются с диска и
   стоят в DB, пока отчёт открыт с этим периодом (задание: «детали — по
   запросу с индикатором»). range — [from, to] днями, '' — без границы.
   Ответ: 'none' (архив не нужен), 'loading' (читается), 'ready', 'big' —
   заказов больше ARCHIVE_SCOPE_MAX: столько разом память не вместит, нужен
   период короче (предел — проверить на базе за 7 лет, А5). */
const ARCHIVE_SCOPE_MAX=3000;
let archiveScope=null;
function archiveScopeFor(range){
 const from=range&&range[0]||'',to=range&&range[1]||'',owners=[];
  archiveIndex.forEach((a,id)=>{if(archiveSpanIn(a,from,to))owners.push(id);});
 if(!owners.length){archiveScopeDrop();return 'none';}
 if(owners.length>ARCHIVE_SCOPE_MAX){archiveScopeDrop();return 'big';}
 const key=from+'|'+to+'|'+owners.length+'|'+owners[0]+'|'+owners[owners.length-1];
 if(archiveScope&&archiveScope.key===key)return archiveScope.put?'ready':'loading';
 archiveScopeDrop();const st=archiveScope={key,put:null,orders:owners.length};
 archiveRead(owners).then(recs=>{if(archiveScope!==st)return;st.put=archiveRowsPut(recs,false);render();}).catch(e=>{if(archiveScope===st)archiveScope=null;console.warn('Archive was not read:',e.message);});
 return 'loading';
}
function archiveScopeDrop(){const st=archiveScope;archiveScope=null;if(st&&st.put)archiveRowsDrop(st.put);}
/* Жизнь заказа пересекает период — от самой ранней до самой поздней из его
   дат: создан, срок (Due), «действительна до» у квоты, день ухода. */
function archiveSpanIn(a,from,to){const span=[String(a.createdAt||'').slice(0,10),a.day,a.row&&a.row.due,a.row&&a.row.validUntil].filter(Boolean).map(String).sort();return !!span.length&&(!to||span[0]<=to)&&(!from||span[span.length-1]>=from);}
/* Сколько ушедших заказов в периоде — для надписи на экране. */
function archiveScopeCount(range){const from=range&&range[0]||'',to=range&&range[1]||'';let n=0;archiveIndex.forEach(a=>{if(archiveSpanIn(a,from,to))n++;});return n;}
/* Ушли из отчётов — записи архива уходят из памяти. */
(window.NAV_GUARDS=window.NAV_GUARDS||[]).push(function(k){if(archiveScope&&k!=='reports')archiveScopeDrop();return false;});

/* Записи ушедших заказов на время одного расчёта (счета за период к
   выписке): встают в DB, fn строит из них — и сразу уходят. */
async function archiveWith(owners,fn){
 const put=archiveRowsPut(await archiveRead(owners),false);
 try{return fn();}finally{archiveRowsDrop(put);}
}
/* Таблицу собрали заново из базы (откат, чужая запись) — строки просмотра
   возвращаются туда же. */
function archiveVisitKeep(){
 const v=archiveVisit;if(!v)return;
 v.tables.forEach((t,tbl)=>{const a=DB[tbl];if(!Array.isArray(a)||v.arrays.get(tbl)===a)return;
  const have=new Set(a.map(r=>storageRowKey(tbl,r)));t.forEach((data,id)=>{if(!have.has(id))a.push(JSON.parse(data));});v.arrays.set(tbl,a);});
}
function archiveViewing(o){return !!archiveVisit&&!!o&&(archiveVisit.ids.has(o.id)||typeof soDraft!=='undefined'&&o===soDraft);}
function archiveHeaderActions(o){
 const a=archiveIndex.get(archiveVisit.id);
 return `<span class="sales-save-state" data-order-state>Archived${a&&a.archivedAt?' · '+esc(salesShortDate(a.archivedAt)):''}</span><button onclick="salesOrderClose()">Close</button><button onclick="docOpen()">Documents</button><button data-archive-repeat onclick="archiveRepeat()">Repeat</button>${salesIsQuote(o)?'':'<button class="ncr-btn" data-archive-ncr title="Returns the order to work" onclick="archiveNcr()">NCR</button>'}`;
}
/* Repeat (владелец, 22.10.2026: «возможность воссоздать заказ»): новый
   заказ того же клиента с теми же стёклами, размерами и фигурами. Цены —
   сегодняшние из Master Data (снимок цен старого заказа не берётся), цены
   руками — как были. PO, срок и производство — пустые. */
function archiveRepeat(){
 const src=archiveVisit&&(DB.salesOrder||[]).find(o=>o.id===archiveVisit.id);if(!src)return;
 const now=new Date().toISOString(),q=salesIsQuote(src);
 const copy=salesCopySalesRecord(src,{businessNumber:'',status:q?'open':'new',statusDates:{},batchNo:'',batchHistory:[],unbatchHistory:[],productionUnbatchVerify:false,fulfilledVia:'',fromQuoteId:'',wonOrderId:'',quoteGroupId:'',quoteRev:0,sentAt:'',validUntil:'',
  customerPo:'',dueDate:'',onHold:false,holdReason:'',holdAt:'',remakeNcrId:'',noCharge:false,cancellations:[],adjustments:[],createdAt:now,updatedAt:now});
 delete copy.priceBook;
 copy.lines.forEach(l=>{Object.assign(l,{onHold:false,holdReason:'',holdAt:'',cutStartedAt:'',batchNo:''});});
 const draft=normalizeSalesOrder(copy);
 /* Копии фигур уже в DB (salesCopySalesRecord): просмотр закрывается без
    salesDraftDrop — та убрала бы их как ничьи до нового черновика. */
 archiveVisitEnd();
 salesOrderNew(q?'quote':'order');soDraft=draft;salesEnsureAllLineShapes();
 soMakeupId=(soDraft.makeups[0]||{}).id||null;soGlassOpen=soDraft.lines.length>0;render();
}
/* NCR по архивному заказу возвращает его в работу (владелец, 22.10.2026),
   и форма NCR открывается на нём. */
async function archiveNcr(){
 const id=archiveVisit&&archiveVisit.id;if(!id)return;
 salesDraftDrop(false);
 const out=await archiveReturn(id);
 if(!out.ok){alert(out.error);render();return;}
 salesOrderEdit(id);
 if(typeof ncrCanOpen==='function'&&ncrCanOpen(salesRecord(id)))ncrOpenForm('ncr');
}

/* Склад листов и обрезки — что они показывают, без журнала движений. */
function archiveInvState(){
 const sheets=new Map(),offcuts=new Map();
 if(typeof invSheetRows==='function')invSheetRows().forEach(r=>sheets.set(r.key,{cut:r.cut,broken:r.broken}));
 if(typeof invOffcutRows==='function')invOffcutRows().forEach(o=>offcuts.set(o.id,{status:o.status,used:o.used,broken:o.broken,onRackAt:o.onRackAt,onRackBy:o.onRackBy}));
 return {sheets,offcuts};
}
/* Разница «до − после» по складу ложится в inventoryArchived: склад
   прибавляет её, и он показывает то же, что до действия, — при уходе и при
   возврате одинаково. offcuts — запомнить факты обрезков (уход). */
function archiveInvKeep(before,after,offcuts){
 const A=DB.inventoryArchived&&typeof DB.inventoryArchived==='object'?DB.inventoryArchived:(DB.inventoryArchived={});
 A.sheets=A.sheets||{};A.offcuts=A.offcuts||{};
 before.sheets.forEach((b,key)=>{const a=after.sheets.get(key)||{cut:0,broken:0},x=A.sheets[key]||{cut:0,broken:0};
  x.cut+=b.cut-a.cut;x.broken+=b.broken-a.broken;if(x.cut||x.broken)A.sheets[key]=x;else delete A.sheets[key];});
 if(offcuts)before.offcuts.forEach((b,id)=>{const a=after.offcuts.get(id);if(a&&JSON.stringify(a)===JSON.stringify(b))return;
  const slim=x=>x?{at:x.at||'',by:x.by||'',batch:x.batch||'',sheet:x.sheet||''}:null;A.offcuts[id]={used:slim(b.used),broken:slim(b.broken),onRackAt:b.onRackAt||'',onRackBy:b.onRackBy||''};});
}

/* Уход в архив на день day (по умолчанию сегодня): одной командой — откат
   целиком. limit — сколько заказов за раз (экран не замирает надолго). */
function archiveRun(day,opts){
 opts=opts||{};day=String(day||new Date().toISOString()).slice(0,10);
 /* Открыт заказ из архива — его записи сейчас в DB; уход подождёт. */
 if(archiveVisit||archiveScope)return {ok:false,error:'Archived orders are open.'};
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
  const before=archiveInvState(),ledger=archiveLedgerOf(set);
  const byTbl=new Map();set.forEach(x=>{let a=byTbl.get(x.tbl);if(!a)byTbl.set(x.tbl,a=[]);a.push(x);});
  byTbl.forEach((list,tbl)=>storageColdMoveAll(tbl,list));
  archiveInvKeep(before,archiveInvState(),true);
  rows.forEach(([id,row])=>storageArchiveIndex(id,row));
  ledger.forEach(([key,e])=>storageArchiveIndex(key,e));
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
  /* Заказ ушёл при прежней версии программы — в работу он встаёт в
     нынешнем виде, как после F5 (normalizeDB). */
  got.forEach(r=>{if(r.tbl==='salesOrder')normalizeSalesOrderIn(r.id);});
  archiveInvKeep(before,archiveInvState(),false);
  if(DB.inventoryArchived&&DB.inventoryArchived.offcuts)(DB.stockOffcut||[]).forEach(o=>{if(got.some(r=>r.tbl==='glassBatch'&&JSON.parse(r.data).number===o.batch))delete DB.inventoryArchived.offcuts[o.id];});
  (DB.salesOrder||[]).forEach(o=>{if(owners.has(o.id)&&archiveIndex.has(o.id))storageArchiveIndex(o.id,null);});
  /* Записи снова в работе — их строки выписки считаются из них самих. */
  got.forEach(r=>{const key='L:'+r.tbl+':'+r.id;if(archiveLedgerKeys.has(key))storageArchiveIndex(key,null);});
  return got.length;
 });
}
