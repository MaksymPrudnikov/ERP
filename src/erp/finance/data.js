/* =====================================================================
   erp/finance/data  ·  finance-1.0
   Оплаты клиентов: квитанции, разнесение по заказам, депозит на счёте.
   IN : DB.receipt, DB.salesOrder, DB.customer
   OUT: баланс заказа, депозит и счёт клиента
   Правило: сумма заказа берётся из расчёта самого заказа
   (salesOrderCommercialTotals) — своих цен здесь нет. Бухгалтерии здесь тоже
   нет: владелец переносит оплаты в QuickBooks руками (14 сентября 2026),
   программа нужна, чтобы при выдаче видеть, сколько клиент внёс и сколько
   ему ещё доплатить.
   ===================================================================== */

DEFAULT.receipt=[];
if(!Array.isArray(DB.receipt))DB.receipt=[];

/* Debit и Credit card раздельно (владелец, 28 сентября 2026): сбор за карту
   берётся только с кредитки. Старое общее «Card» остаётся читаемым у прежних
   оплат, но для новых не предлагается — задним числом его не угадываем. */
const FIN_METHODS=[{k:'cash',label:'Cash'},{k:'cheque',label:'Cheque'},{k:'etransfer',label:'E-transfer'},{k:'debit',label:'Debit'},{k:'creditcard',label:'Credit card'},{k:'card',label:'Card',legacy:true}];
function finMethodLabel(k){const m=FIN_METHODS.find(x=>x.k===k);return m?m.label:'Other';}
function finMethodChoices(current){return FIN_METHODS.filter(m=>!m.legacy||m.k===current);}
function finMoney(v){const n=Number(v);return Number.isFinite(n)?Math.round((n+Number.EPSILON)*100)/100:0;}
function finUid(){
 try{if(globalThis.crypto&&typeof crypto.randomUUID==='function')return 'RCPT-'+crypto.randomUUID();}catch(e){}
 return 'RCPT-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,9).toUpperCase();
}
function finToday(){const d=new Date(),p=v=>String(v).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}

/* Квитанция: одна внесённая сумма. allocations — на какие заказы она ушла;
   всё, что не разнесено, лежит депозитом на счёте клиента. Разнести больше
   суммы квитанции нельзя: лишнее срезается при нормализации. */
function normalizeReceipt(r){
 r=r&&typeof r==='object'&&!Array.isArray(r)?r:{};
 const amount=Math.max(0,finMoney(r.amount)),allocations=[];let left=amount;
 (Array.isArray(r.allocations)?r.allocations:[]).forEach(a=>{
  if(!a||typeof a!=='object')return;
  const orderId=String(a.orderId||'').trim(),value=finMoney(Math.min(left,Math.max(0,finMoney(a.amount))));
  if(!orderId||value<=0)return;
  const same=allocations.find(x=>x.orderId===orderId);
  if(same)same.amount=finMoney(same.amount+value);else allocations.push({orderId,amount:value});
  left=finMoney(left-value);
 });
 const voided=r.voided===true;
 return {id:/^[A-Za-z0-9_-]{1,96}$/.test(String(r.id||''))?String(r.id):finUid(),number:String(r.number||'').trim().slice(0,20),
  date:/^\d{4}-\d{2}-\d{2}$/.test(String(r.date||''))?String(r.date):finToday(),customerId:String(r.customerId||'').trim(),
  method:FIN_METHODS.some(m=>m.k===r.method)?r.method:'cash',reference:String(r.reference||'').trim().slice(0,80),
  currency:['CAD','USD'].includes(r.currency)?r.currency:'CAD',amount,note:String(r.note||'').trim().slice(0,500),allocations,
  voided,voidReason:voided?String(r.voidReason||'').trim().slice(0,300):'',voidedAt:voided?String(r.voidedAt||''):'',
  createdAt:String(r.createdAt||''),updatedAt:String(r.updatedAt||'')};
}
function finNextReceiptNumber(){
 let max=typeof archiveFloor==='function'?archiveFloor('receipt'):0;(DB.receipt||[]).forEach(r=>{const m=String(r&&r.number||'').match(/^R-(\d+)$/);if(m)max=Math.max(max,+m[1]);});
 return 'R-'+String(max+1).padStart(4,'0');
}
function normalizeReceipts(){
 if(!Array.isArray(DB.receipt))DB.receipt=[];
 const orders=new Map((DB.salesOrder||[]).map(o=>[o.id,o])),ids=new Set(),numbers=new Set(),known=id=>orders.get(id)||(typeof archiveKnown==='function'?archiveKnown(id):null);
 DB.receipt=DB.receipt.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)).map(x=>{
  const r=normalizeReceipt(x);
  while(ids.has(r.id))r.id=finUid();ids.add(r.id);
  /* Разнесение живёт только на заказах того же клиента. Удалённый или чужой
     заказ возвращает деньги на депозит клиента — сумма квитанции не теряется. */
  r.allocations=r.allocations.filter(a=>{const o=known(a.orderId);return !!o&&o.customerId===r.customerId&&o.kind!=='quote';});
  if(r.number&&numbers.has(r.number))r.number='';
  if(r.number)numbers.add(r.number);
  return r;
 });
 DB.receipt.forEach(r=>{if(!r.number)r.number=finNextReceiptNumber();});
}

function finActiveReceipts(){return (DB.receipt||[]).filter(r=>!r.voided);}
function finReceiptApplied(r){return finMoney((r.allocations||[]).reduce((s,a)=>s+a.amount,0));}
function finReceiptOnAccount(r){return r.voided?0:finMoney(r.amount-finReceiptApplied(r)-finRefunded(r.id));}
/* Долг и лимит — только по заказам: квота не долг, отменённый заказ тоже. */
function finOrderCounts(o){return !!o&&o.kind!=='quote'&&o.status!=='cancelled'&&o.isDraft!==true;}

/* Цена строки частично читает Makeup из открытого заказа (soDraft). Сумма
   сохранённого, не открытого заказа поэтому считается с ним «на месте»
   открытого — иначе, скажем, Heat Soak выпал бы из суммы чужого заказа. */
function finWithOrder(order,fn){
 if(typeof soDraft==='undefined'||soDraft===order)return fn();
 const keep=soDraft;
 try{soDraft=order;return fn();}finally{soDraft=keep;}
}
/* Итоги заказа — один раз на отрисовку (erp/read-scope): Finance спрашивал их
   почти трижды на заказ (задание «База», П2). Пока пишется прайс заказа
   (salesPriceBookOf ловит его по ходу расчёта) — считать по-настоящему. */
/* Итоги заказа живут и между отрисовками: Finance после оплаты пересчитывал
   цены всех заказов с формами — на годе это и есть 26 с на слабом ПК
   (задание «База»). Запись в базу (storageBaseApply) забывает итоги своих
   заказов; правка таблицы, от которой зависит цена (прайс, клиенты,
   фигуры, настройки), — все. Таблицы ниже на цену заказа не влияют. В тестах
   (GF_SCOPE_CHECK) каждый ответ из памяти сверяется с расчётом заново. */
const FIN_TOTALS_NEUTRAL=new Set(['stationScan','stationScanSeq','productionRoute','glassBatch','cutPlan','glassPiece','glassPieceSeq','glassUnitId','glassUnitIdSeq',
 'orderEvent','masterDataEvent','authEvent','receipt','refund','financeEvent','financeExport','financeExportBatch','shipment','shipmentSeq','carrier','truck','tripKm',
 'skidReturn','sheetBreak','stockOffcut','stockOffcutSeq','inventoryEvent','consumableEvent','purchasingEvent','purchaseOrder','purchaseOrderSeq','purchaseReceipt','purchaseReceiptSeq',
 'report','archiveRunDay','terminal','skip','productionUnbatch']);
let finTotalsKeep=new Map();
/* Фигура строки (ownerLineId) — забыть её заказ; новая фигура — ничего (от
   неё не зависел ни один посчитанный заказ); фигура библиотеки — все. */
function finTotalsForget(changes){
 if(!finTotalsKeep.size)return;
 let lines=null;
 for(const c of changes){
  if(c.tbl==='salesOrder'||c.tbl==='financeTerms')finTotalsKeep.delete(String(c.id));
  else if(c.tbl==='shapeDef'){
   const was=storageBase.get('shapeDef'),old=was&&was.get(c.id);if(!old)continue;
   const owners=[old.t,c.del?null:c.data].filter(Boolean).map(t=>{try{return JSON.parse(t).ownerLineId||'';}catch(e){return '';}});
   if(owners.some(x=>!x)){finTotalsKeep=new Map();return;}
   if(!lines){lines=new Map();finTotalsKeep.forEach((k,id)=>(k.order.lines||[]).forEach(l=>lines.set(l.id,id)));}
   owners.forEach(x=>{if(lines.has(x))finTotalsKeep.delete(lines.get(x));});
  }
  else if(!FIN_TOTALS_NEUTRAL.has(c.tbl==='_meta'?c.id:c.tbl)&&c.tbl!=='_archive'){finTotalsKeep=new Map();return;}
 }
}
function finOrderTotals(order){
 if(!order||!readOn()||salesBookRec)return finWithOrder(order,()=>salesOrderCommercialTotals(order));
 const m=readMemo('finOrderTotals',[],()=>new WeakMap());let t=m.get(order);
 if(!t){
  const db=readMemo('finDbOrders',[DB.salesOrder],()=>new Set(DB.salesOrder||[])).has(order),k=db?finTotalsKeep.get(String(order.id)):null;
  if(k&&k.order===order){t=k.totals;if(typeof window!=='undefined'&&window.GF_SCOPE_CHECK)finTotalsCheck(order,t);}
  else{t=finWithOrder(order,()=>salesOrderCommercialTotals(order));if(db&&order.id)finTotalsKeep.set(String(order.id),{order,totals:t});}
  m.set(order,t);
 }
 return t;
}
/* После F5 итоги заказов считаются понемногу в простое (30 мс за шаг), и
   первый вход в Finance берёт готовое. Не на станции, не без Finance и не
   во время ввода: скан и набор заказа важнее. */
let finTotalsWarmTimer=null;
function finTotalsWarm(delay){
 if(finTotalsWarmTimer||typeof window==='undefined'||window.GF_NO_ARCHIVE)return;
 let i=0;
 const step=()=>{
  finTotalsWarmTimer=null;
  if(tab==='station'||!accessCan('finance'))return;
  if(storageDepth||Date.now()-archiveInputAt<2000){finTotalsWarmTimer=setTimeout(step,2000);return;}
  const list=DB.salesOrder||[],t=performance.now();
  readScope(()=>{while(i<list.length&&performance.now()-t<30)finOrderTotals(list[i++]);});
  if(i<list.length&&list===DB.salesOrder)finTotalsWarmTimer=setTimeout(step,0);
 };
 finTotalsWarmTimer=setTimeout(step,delay==null?3000:delay);
}
function finTotalsCheck(order,t){const now=finWithOrder(order,()=>salesOrderCommercialTotals(order));if(JSON.stringify(now)!==JSON.stringify(t))console.error('Stale totals: '+order.id+' · '+String(new Error().stack).split('\n').slice(3,6).map(x=>x.trim().split(' ')[1]).join(' < '));}
/* Оплаты заказа: на отрисовку — указатель «заказ → разнесения» за один
   проход по оплатам (erp/read-scope): Finance спрашивает каждый заказ года,
   и каждый вопрос перебирал все оплаты. Порядок сложения тот же. */
function finOrderPaid(orderId){
 let paid=0,receipts=0;
 const order=salesRecord(orderId),cur=order&&finCurrency(order);
 if(readOn()){
  (readMemo('finPaidByOrder',[DB.receipt],()=>{const m=new Map();finActiveReceipts().forEach(r=>r.allocations.forEach(a=>{let l=m.get(a.orderId);if(!l)m.set(a.orderId,l=[]);l.push([a.amount,finCurrency(r)]);}));return m;}).get(orderId)||[])
   .forEach(([amount,c])=>{if(!order||c===cur){paid+=amount;receipts++;}});
  return {paid:finMoney(paid),receipts};
 }
 finActiveReceipts().filter(r=>!order||finCurrency(r)===cur).forEach(r=>r.allocations.forEach(a=>{if(a.orderId===orderId){paid+=a.amount;receipts++;}}));
 return {paid:finMoney(paid),receipts};
}
/* status: due — должен доплатить; paid — оплачен; overpaid — внесли больше
   суммы заказа (заказ после оплаты подешевел); incomplete — у заказа нет
   полной цены, долг посчитать нельзя; empty — пустой заказ без оплат. */
function finOrderBalance(order){
 const t=finOrderTotals(order),p=finOrderPaid(order.id),total=t.complete&&finCurrency(order)==='CAD'?finMoney(t.grand):null;
 const balance=total==null?null:finMoney(total-p.paid);
 let status=t.complete&&t.grand<0?'review':total==null?'incomplete':balance>0?'due':balance<0?'overpaid':'paid';
 if(total===0&&p.paid===0)status='empty';
 return {total,paid:p.paid,receipts:p.receipts,balance,status};
}
function finCustomerDeposit(customerId,currency){
 currency=currency||'CAD';
 return finMoney(finActiveReceipts().filter(r=>r.customerId===customerId&&finCurrency(r)===currency).reduce((s,r)=>s+finReceiptOnAccount(r),0));
}
function finCustomerAccount(c){
 let due=0,dueOrders=0,incomplete=0,review=0;
 (DB.salesOrder||[]).filter(o=>o.customerId===c.id&&finOrderCounts(o)).forEach(o=>{
  const b=finOrderBalance(o);
  if(b.status==='due'){due+=b.balance;dueOrders++;}else if(b.status==='incomplete')incomplete++;else if(b.status==='review')review++;
 });
 due=finMoney(due);
 const limit=c.creditLimit!=null&&c.creditLimit!==''&&Number.isFinite(+c.creditLimit)?finMoney(c.creditLimit):null;
 return {customer:c,terms:paymentTermsLabel(c),creditLimit:limit,balanceDue:due,dueOrders,incomplete,...(review?{review}:{}),deposit:finCustomerDeposit(c.id),
  available:limit==null?null:finMoney(limit-due),overLimit:limit!=null&&due>limit};
}

/* Зачёт депозита в заказ: деньги берутся из самых старых квитанций клиента, у
   которых есть незачтённый остаток; в заказ ложится не больше его долга. */
function finApplyDeposit(customerId,orderId,amount){
 const order=(DB.salesOrder||[]).find(o=>o.id===orderId);
 if(!order||order.customerId!==customerId||!finOrderCounts(order)||finCurrency(order)!=='CAD')return 0;
 const b=finOrderBalance(order);if(b.status!=='due')return 0;
 let want=finMoney(Math.min(finMoney(amount),b.balance,finCustomerDeposit(customerId)));
 if(!(want>0))return 0;
 let done=0;const now=new Date().toISOString();
 finActiveReceipts().filter(r=>r.customerId===customerId&&finCurrency(r)===finCurrency(order)).sort((x,y)=>(x.date+x.number).localeCompare(y.date+y.number)).forEach(r=>{
  const free=finReceiptOnAccount(r);if(want<=0||free<=0)return;
  finEnsureHistory(r);const before=finCopy(r);
  const take=finMoney(Math.min(free,want)),a=r.allocations.find(x=>x.orderId===orderId);
  if(a)a.amount=finMoney(a.amount+take);else r.allocations.push({orderId,amount:take});
  r.updatedAt=now;want=finMoney(want-take);done=finMoney(done+take);finEvent('allocated',before,r,'Deposit applied to order '+finOrderNumber(orderId));
 });
 return done;
}
/* Заказ подешевел после оплаты — лишнее уходит обратно на депозит, начиная с
   последних квитанций. */
function finReleaseOverpayment(order){
 const b=finOrderBalance(order);if(b.status!=='overpaid')return 0;
 let extra=finMoney(-b.balance),moved=0;const now=new Date().toISOString();
 finActiveReceipts().slice().sort((x,y)=>(y.date+y.number).localeCompare(x.date+x.number)).forEach(r=>{
  const a=r.allocations.find(x=>x.orderId===order.id);if(extra<=0||!a)return;
  finEnsureHistory(r);const before=finCopy(r);
  const take=finMoney(Math.min(a.amount,extra));
  a.amount=finMoney(a.amount-take);if(a.amount<=0)r.allocations=r.allocations.filter(x=>x!==a);
  r.updatedAt=now;extra=finMoney(extra-take);moved=finMoney(moved+take);finEvent('released',before,r,'Order overpayment moved to deposit.');
 });
 return moved;
}
/* Удаление заказа: его оплаты не пропадают, а возвращаются на депозит. */
function finReleaseOrder(orderId){
 let moved=0;const now=new Date().toISOString();
 (DB.receipt||[]).forEach(r=>{
  const keep=r.allocations.filter(a=>a.orderId!==orderId);
  if(keep.length===r.allocations.length)return;
  finEnsureHistory(r);const before=finCopy(r);
  if(!r.voided)moved+=r.allocations.filter(a=>a.orderId===orderId).reduce((s,a)=>s+a.amount,0);
  r.allocations=keep;r.updatedAt=now;finEvent('released',before,r,'Order cancelled or deleted; allocation returned to deposit.');
 });
 return finMoney(moved);
}
/* Ошибочная квитанция не удаляется, а аннулируется с причиной: остаётся в
   списке для сверки с QuickBooks и перестаёт считаться в балансах. */
function finVoidReceipt(id,reason){
 const r=(DB.receipt||[]).find(x=>x.id===id);if(!r||r.voided||!String(reason||'').trim()||finRefunded(id)>0)return false;
 finEnsureHistory(r);const before=finCopy(r);
 r.voided=true;r.voidReason=String(reason||'').trim().slice(0,300);r.voidedAt=new Date().toISOString();r.updatedAt=r.voidedAt;finEvent('voided',before,r,r.voidReason);
 return true;
}

/* Ячейка CSV: текст, начинающийся с = + @ -, Excel считает формулой — ему
   ставится апостроф. Число (и отрицательная сумма возврата) остаётся числом. */
function finCsvCell(v){let s=String(v==null?'':v);if(!/^-?\d+(\.\d+)?$/.test(s)&&(/^[\s]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s)))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
/* Заказ ушёл в архив — номер из указателя архива (erp/archive). */
function finOrderNumber(id){const o=(DB.salesOrder||[]).find(x=>x.id===id),a=!o&&typeof archiveKnown==='function'?archiveKnown(id):null;return o?(o.businessNumber||o.id):a?a.number:'deleted order';}
