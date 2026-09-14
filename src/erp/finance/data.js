/* =====================================================================
   erp/finance/data  ·  finance-1.0
   Оплаты клиентов: квитанции, разнесение по заказам, депозит на счёте.
   IN : DB.receipt, DB.salesOrder, DB.customer
   OUT: баланс заказа, депозит и счёт клиента, CSV для QuickBooks
   Правило: сумма заказа берётся из расчёта самого заказа
   (salesOrderCommercialTotals) — своих цен здесь нет. Бухгалтерии здесь тоже
   нет: владелец переносит оплаты в QuickBooks руками (14 сентября 2026),
   программа нужна, чтобы при выдаче видеть, сколько клиент внёс и сколько
   ему ещё доплатить.
   ===================================================================== */

DEFAULT.receipt=[];
if(!Array.isArray(DB.receipt))DB.receipt=[];

const FIN_METHODS=[{k:'cash',label:'Cash'},{k:'cheque',label:'Cheque'},{k:'etransfer',label:'E-transfer'},{k:'card',label:'Card'}];
function finMethodLabel(k){const m=FIN_METHODS.find(x=>x.k===k);return m?m.label:'Other';}
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
  amount,note:String(r.note||'').trim().slice(0,500),allocations,
  voided,voidReason:voided?String(r.voidReason||'').trim().slice(0,300):'',voidedAt:voided?String(r.voidedAt||''):'',
  createdAt:String(r.createdAt||''),updatedAt:String(r.updatedAt||'')};
}
function finNextReceiptNumber(){
 let max=0;(DB.receipt||[]).forEach(r=>{const m=String(r&&r.number||'').match(/^R-(\d+)$/);if(m)max=Math.max(max,+m[1]);});
 return 'R-'+String(max+1).padStart(4,'0');
}
function normalizeReceipts(){
 if(!Array.isArray(DB.receipt))DB.receipt=[];
 const orders=new Map((DB.salesOrder||[]).map(o=>[o.id,o])),ids=new Set(),numbers=new Set();
 DB.receipt=DB.receipt.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)).map(x=>{
  const r=normalizeReceipt(x);
  while(ids.has(r.id))r.id=finUid();ids.add(r.id);
  /* Разнесение живёт только на заказах того же клиента. Удалённый или чужой
     заказ возвращает деньги на депозит клиента — сумма квитанции не теряется. */
  r.allocations=r.allocations.filter(a=>{const o=orders.get(a.orderId);return !!o&&o.customerId===r.customerId;});
  if(r.number&&numbers.has(r.number))r.number='';
  if(r.number)numbers.add(r.number);
  return r;
 });
 DB.receipt.forEach(r=>{if(!r.number)r.number=finNextReceiptNumber();});
}

function finActiveReceipts(){return (DB.receipt||[]).filter(r=>!r.voided);}
function finReceiptApplied(r){return finMoney((r.allocations||[]).reduce((s,a)=>s+a.amount,0));}
function finReceiptOnAccount(r){return r.voided?0:finMoney(r.amount-finReceiptApplied(r));}

/* Цена строки частично читает Makeup из открытого заказа (soDraft). Сумма
   сохранённого, не открытого заказа поэтому считается с ним «на месте»
   открытого — иначе, скажем, Heat Soak выпал бы из суммы чужого заказа. */
function finWithOrder(order,fn){
 if(typeof soDraft==='undefined'||soDraft===order)return fn();
 const keep=soDraft;
 try{soDraft=order;return fn();}finally{soDraft=keep;}
}
function finOrderTotals(order){return finWithOrder(order,()=>salesOrderCommercialTotals(order));}
function finOrderPaid(orderId){
 let paid=0,receipts=0;
 finActiveReceipts().forEach(r=>r.allocations.forEach(a=>{if(a.orderId===orderId){paid+=a.amount;receipts++;}}));
 return {paid:finMoney(paid),receipts};
}
/* status: due — должен доплатить; paid — оплачен; overpaid — внесли больше
   суммы заказа (заказ после оплаты подешевел); incomplete — у заказа нет
   полной цены, долг посчитать нельзя; empty — пустой заказ без оплат. */
function finOrderBalance(order){
 const t=finOrderTotals(order),p=finOrderPaid(order.id),total=t.complete?finMoney(t.grand):null;
 const balance=total==null?null:finMoney(total-p.paid);
 let status=total==null?'incomplete':balance>0?'due':balance<0?'overpaid':'paid';
 if(total===0&&p.paid===0)status='empty';
 return {total,paid:p.paid,receipts:p.receipts,balance,status};
}
function finCustomerDeposit(customerId){
 return finMoney(finActiveReceipts().filter(r=>r.customerId===customerId).reduce((s,r)=>s+finReceiptOnAccount(r),0));
}
function finCustomerAccount(c){
 let due=0,dueOrders=0,incomplete=0;
 (DB.salesOrder||[]).filter(o=>o.customerId===c.id).forEach(o=>{
  const b=finOrderBalance(o);
  if(b.status==='due'){due+=b.balance;dueOrders++;}else if(b.status==='incomplete')incomplete++;
 });
 due=finMoney(due);
 const limit=c.creditLimit!=null&&c.creditLimit!==''&&Number.isFinite(+c.creditLimit)?finMoney(c.creditLimit):null;
 return {customer:c,terms:paymentTermsLabel(c),creditLimit:limit,balanceDue:due,dueOrders,incomplete,deposit:finCustomerDeposit(c.id),
  available:limit==null?null:finMoney(limit-due),overLimit:limit!=null&&due>limit};
}

/* Зачёт депозита в заказ: деньги берутся из самых старых квитанций клиента, у
   которых есть незачтённый остаток; в заказ ложится не больше его долга. */
function finApplyDeposit(customerId,orderId,amount){
 const order=(DB.salesOrder||[]).find(o=>o.id===orderId);
 if(!order||order.customerId!==customerId)return 0;
 const b=finOrderBalance(order);if(b.status!=='due')return 0;
 let want=finMoney(Math.min(finMoney(amount),b.balance,finCustomerDeposit(customerId)));
 if(!(want>0))return 0;
 let done=0;const now=new Date().toISOString();
 finActiveReceipts().filter(r=>r.customerId===customerId).sort((x,y)=>(x.date+x.number).localeCompare(y.date+y.number)).forEach(r=>{
  const free=finReceiptOnAccount(r);if(want<=0||free<=0)return;
  const take=finMoney(Math.min(free,want)),a=r.allocations.find(x=>x.orderId===orderId);
  if(a)a.amount=finMoney(a.amount+take);else r.allocations.push({orderId,amount:take});
  r.updatedAt=now;want=finMoney(want-take);done=finMoney(done+take);
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
  const take=finMoney(Math.min(a.amount,extra));
  a.amount=finMoney(a.amount-take);if(a.amount<=0)r.allocations=r.allocations.filter(x=>x!==a);
  r.updatedAt=now;extra=finMoney(extra-take);moved=finMoney(moved+take);
 });
 return moved;
}
/* Удаление заказа: его оплаты не пропадают, а возвращаются на депозит. */
function finReleaseOrder(orderId){
 let moved=0;const now=new Date().toISOString();
 (DB.receipt||[]).forEach(r=>{
  const keep=r.allocations.filter(a=>a.orderId!==orderId);
  if(keep.length===r.allocations.length)return;
  if(!r.voided)moved+=r.allocations.filter(a=>a.orderId===orderId).reduce((s,a)=>s+a.amount,0);
  r.allocations=keep;r.updatedAt=now;
 });
 return finMoney(moved);
}
/* Ошибочная квитанция не удаляется, а аннулируется с причиной: остаётся в
   списке для сверки с QuickBooks и перестаёт считаться в балансах. */
function finVoidReceipt(id,reason){
 const r=(DB.receipt||[]).find(x=>x.id===id);if(!r||r.voided)return false;
 r.voided=true;r.voidReason=String(reason||'').trim().slice(0,300);r.voidedAt=new Date().toISOString();r.updatedAt=r.voidedAt;
 return true;
}

function finCsvCell(v){const s=String(v==null?'':v);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function finOrderNumber(id){const o=(DB.salesOrder||[]).find(x=>x.id===id);return o?(o.businessNumber||o.id):'deleted order';}
function finReceiptsCsv(rows){
 const H=['Receipt No','Date','Customer','Customer Account','Method','Reference','Amount','Applied','Applied To Orders','On Account','Status','Void Reason','Note'];
 const body=rows.map(r=>{
  const c=(DB.customer||[]).find(x=>x.id===r.customerId)||{};
  return [r.number,r.date,c.legalName||c.displayName||'',c.code||'',finMethodLabel(r.method),r.reference,r.amount.toFixed(2),finReceiptApplied(r).toFixed(2),
   r.allocations.map(a=>finOrderNumber(a.orderId)+': '+a.amount.toFixed(2)).join('; '),finReceiptOnAccount(r).toFixed(2),r.voided?'Void':'Active',r.voidReason,r.note];
 });
 return [H].concat(body).map(row=>row.map(finCsvCell).join(',')).join('\r\n');
}
