/* =====================================================================
   reports/facts-customers  ·  facts-1.0
   Клиенты в отчётах: первый и последний заказ, дней с последнего, новые по
   месяцам, сумма продаж.
   IN : DB.customer, DB.salesOrder, archiveIndex (ушедшие в архив заказы)
   OUT: repCustomerFacts() — строка на клиента
   Правило: файл ничего не рисует.

   План отчётов, часть «клиенты» (владелец, 26.10.2026), галочка Customers.
   · Заказ — не квота и не отменённый. Ушедшие в архив — из указателя
     архива (дата, сумма строки Sales на день ухода); подгруженный отчётом
     из архива заказ не считается дважды.
   · Давность — от последнего заказа до сегодня: в 90 дней, 91–180,
     181–365, больше года; без заказов — No orders yet.
   · Новый клиент — по первому заказу: «новые по месяцам» — месяц первого
     заказа.
   · Сумма продаж — итоги заказов (finOrderTotals), считается, когда её
     читает график (repLazy, reports/facts-office); в валюте клиента.
   ===================================================================== */
let repCustCache={stamp:'',rows:null};
const REP_RECENCY=[[90,'Ordered in 90 days'],[180,'91–180 days'],[365,'181–365 days'],[Infinity,'Over a year']];
function repRecency(days){return days==null?'No orders yet':REP_RECENCY.find(x=>days<=x[0])[1];}
function repCustStamp(){
 return [finToday(),(DB.customer||[]).map(c=>c.id+(c.updatedAt||'')).join(','),(DB.salesOrder||[]).map(o=>o.id+(o.updatedAt||'')+o.status).join(','),
  typeof archiveIndex!=='undefined'?archiveIndex.size:0].join('|');
}
function repCustomerFacts(){
 const stamp=readMemo('repCustStamp',[DB.customer,DB.salesOrder],repCustStamp);
 if(repCustCache.stamp===stamp&&repCustCache.rows)return repCustCache.rows;
 const today=finToday(),by=new Map(),seen=new Set(),add=(cid,day,o,archived)=>{
  let x=by.get(cid);if(!x)by.set(cid,x={first:'',last:'',orders:0,live:[],archived:0});
  if(day){if(!x.first||day<x.first)x.first=day;if(day>x.last)x.last=day;}
  x.orders++;if(o)x.live.push(o);else x.archived+=+archived||0;
 };
 (DB.salesOrder||[]).forEach(o=>{if(!o||salesIsQuote(o)||o.status==='cancelled')return;seen.add(o.id);add(o.customerId,salesListIsoDay(o.createdAt),o);});
 if(typeof archiveIndex!=='undefined')archiveIndex.forEach((a,id)=>{
  if(seen.has(id)||a.kind!=='order'||a.status==='cancelled')return;
  const t=a.row&&+a.row.total;add(a.customerId,String(a.createdAt||'').slice(0,10),null,Number.isFinite(t)?t:0);
 });
 const rows=(DB.customer||[]).map(c=>{
  const x=by.get(c.id)||{first:'',last:'',orders:0,live:[],archived:0},a=repCustomerAddr(c),days=x.last?Math.max(0,repDaysBetween(x.last,today)):null,recency=repRecency(days);
  const row={id:c.id,customerId:c.id,rep:c.salesRep||'',ctype:c.customerType||'',city:a.city||'',province:a.province||'',status:c.isProspect?'Prospect':c.status==='archived'?'Archived':c.status==='inactive'?'Inactive':'Active',
   terms:c.paymentMode==='credit'?'Credit':'Cash',currency:c.currency||'CAD',created:salesListIsoDay(c.createdAt)||c.accountOpenedAt||'',firstOrder:x.first,lastOrder:x.last,daysSince:days,recency,
   orders:x.orders,customers:1,buying:x.orders?1:0,active:days!=null&&days<=90?1:0,lapsed:days!=null&&days>180?1:0};
  repLazy(row,'total',()=>{let n=x.archived;x.live.forEach(o=>{const t=finOrderTotals(o);if(t&&t.complete)n+=t.grand;});return x.orders?salesMoney(n):null;});
  return row;
 });
 repCustCache={stamp,rows};
 return rows;
}
