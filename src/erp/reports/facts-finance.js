/* =====================================================================
   reports/facts-finance  ·  facts-1.0
   Финансы и агенты в отчётах: оплаты по заказам, возвраты, комиссии.
   IN : DB.receipt (разнесения на заказы), DB.refund, DB.salesOrder,
        DB.referrer, DB.referrerPayout (erp/finance)
   OUT: repPayOrderFacts · repRefundFacts · repCommissionFacts
   Правило: файл ничего не рисует.

   План отчётов, часть «финансы и агенты» (владелец, 26.10.2026). Оплаты и
   возвраты — с галочкой Finance, комиссии — с галочкой Commissions
   (продажникам их знать не надо, erp/finance/commissions).
   · Оплата на два заказа — две строки, каждая на своё разнесение: сумма
     строк — сколько пришло на заказы, ничего не удваивается. Нераспределённое
     (On account) — в источнике Payments.
   · Дни до оплаты — от счёта (день выдачи заказа), «вовремя» — к сроку
     оплаты, как в Finance (finPaymentDue). Оплата до счёта — Before billing.
   · Комиссия — строка на агента и заказ, как на экране Agents (comDue,
     comOrders): начислено за всё время, выплачено, к выплате; сумма по
     агенту — его To pay. Ушедшие в архив заказы — из указателя архива.
   ===================================================================== */
let repPayCache={stamp:'',rows:null},repComCache={stamp:'',rows:null};
function repPayStamp(){
 return [(DB.receipt||[]).map(r=>r.id+(r.voided?'v':'')+r.date+':'+(r.allocations||[]).map(a=>a.orderId+'='+a.amount).join(';')).join(','),
  (DB.salesOrder||[]).map(o=>o.id+(o.updatedAt||'')+o.status).join(','),(DB.financeTerms||[]).length].join('|');
}
/* Заказ оплаты: живой или строка указателя архива. */
function repPayOrder(id){
 const o=salesRecord(id);if(o)return {o,number:o.businessNumber||'',customerId:o.customerId||'',created:salesListIsoDay(o.createdAt)};
 const a=typeof archiveKnown==='function'?archiveKnown(id):null;
 return a?{o:null,number:a.number||'',customerId:a.customerId||'',created:String(a.createdAt||'').slice(0,10)}:{o:null,number:'Deleted order',customerId:'',created:''};
}
function repPayOrderFacts(){
 const stamp=readMemo('repPayStamp',[DB.receipt,DB.salesOrder,DB.financeTerms],repPayStamp);
 if(repPayCache.stamp===stamp&&repPayCache.rows)return repPayCache.rows;
 const rows=[],orders=new Map();
 finActiveReceipts().forEach(r=>{
  const m=FIN_METHODS.find(x=>x.k===r.method);
  (r.allocations||[]).forEach(a=>{
   let x=orders.get(a.orderId);
   if(!x){const p=repPayOrder(a.orderId);x=Object.assign(p,{billed:p.o?finBillingDate(p.o)||'':'',due:p.o?finPaymentDue(p.o)||'':''});orders.set(a.orderId,x);}
   const before=!x.billed||r.date<x.billed,state=!x.o?'Archived order':before?'Before billing':x.due&&r.date>x.due?'Late':'On time';
   rows.push({...repCustomerInfo(x.customerId),id:r.id+'|'+a.orderId,at:r.date,receipt:r.number,order:x.number,customerId:x.customerId,created:x.created,billed:x.billed,due:x.due,
    method:m?m.label:r.method,currency:finCurrency(r),amount:a.amount,state,lateAmount:state==='Late'?a.amount:0,
    daysToPay:x.billed&&!before?repDaysBetween(x.billed,r.date):null,daysLate:state==='Late'?repDaysBetween(x.due,r.date):null,payments:1});
  });
 });
 repPayCache={stamp,rows};
 return rows;
}
/* Возврат клиенту: с какой оплаты, почему, сколько дней спустя. */
function repRefundFacts(){
 return (DB.refund||[]).filter(x=>x&&!x.voided).map(x=>{
  const r=(DB.receipt||[]).find(p=>p.id===x.receiptId),m=FIN_METHODS.find(k=>k.k===x.method);
  return {...repCustomerInfo(x.customerId),id:x.id,at:x.date,refund:x.number,receipt:r?r.number:'',customerId:x.customerId||'',method:m?m.label:x.method,currency:finCurrency(x),
   amount:x.amount,reason:x.reason||'No reason',days:r&&r.date&&x.date?repDaysBetween(r.date,x.date):null};
 });
}
/* Комиссия: агент × заказ. Начислено и с HST — за всё время, как в Agents. */
function repComStamp(){
 return [repPayStamp(),JSON.stringify(DB.referrer||[]),(DB.referrerPayout||[]).map(p=>p.id+':'+p.amount).join(','),typeof archiveIndex!=='undefined'?archiveIndex.size:0].join('|');
}
function repCommissionFacts(){
 const stamp=readMemo('repComStamp',[DB.receipt,DB.salesOrder,DB.referrer,DB.referrerPayout],repComStamp);
 if(repComCache.stamp===stamp&&repComCache.rows)return repComCache.rows;
 const rows=[];
 comWithScope(()=>(DB.referrer||[]).forEach(ref=>{
  const earned=new Map(comOrders(ref,null).map(x=>[x.o.id,x])),pct=new Map(ref.customers.map(c=>[c.customerId,c.pct]));
  comDue(ref).forEach(d=>{
   const e=earned.get(d.orderId),customerId=d.customerId||'';
   rows.push({...repCustomerInfo(customerId),id:ref.id+'|'+d.orderId,agent:ref.name,customerId,order:d.number,date:e?e.date:d.o&&salesListIsoDay(d.o.createdAt)||'',
    pct:e?e.pct:String(pct.get(customerId)||''),total:e?e.total:null,paid:e?e.paid:0,base:e?e.base:0,com:d.com,comHst:e?e.comHst:0,paidOut:d.paidOut,
    due:d.due,dueHst:finMoney((e?e.comHst:0)-d.paidOut),owed:d.due>0?1:0});
  });
 }));
 repComCache={stamp,rows};
 return rows;
}
