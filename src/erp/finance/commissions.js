/* =====================================================================
   erp/finance/commissions  ·  commissions-1.0
   Комиссия тем, кто привёл клиента. Владелец, 11.10.2026: человек со
   стороны — «имя и фамилию, возможно номер телефона или почту, и назначаем
   клиента или двух или троих; доступа к ERP у них нет и не будет; это
   считает владелец и только он даёт этим людям деньги, возможно раз в год».
   Процент — «только за то, что клиент заплатил»; без HST, галочка «with
   HST» — отдельными колонками. Раздел свой (галочка Commissions в Users):
   продажникам это знать не надо.
   IN : DB.receipt (оплаты на заказы), DB.salesOrder, DB.customer
   OUT: DB.referrer {id, name, phone, email, note, customers[{customerId, pct,
        from, was[{pct, from}]}]},
        DB.referrerPayout {id, referrerId, date, amount, note, orders[{orderId, amount}]}
   Правило: клиент — у одного человека. Выплата — по заказам: в неё входит
   только ещё не выплаченная комиссия каждого заказа, сумма считается сама
   (владелец: «чтобы я не заплатил дважды за один и тот же заказ»).
   Процент действует с даты from ('' — всегда); прежние — в was. Оплата
   считается по проценту на день оплаты: поменяли процент — прошлое не
   пересчитывается (владелец, 19.10.2026, вариант Б; дату From выбирает он
   сам, 20.10.2026; аудит COM04).
   ===================================================================== */
DEFAULT.referrer=[];DEFAULT.referrerPayout=[];
function comStr(v,n){return String(v==null?'':v).trim().slice(0,n||200);}
function comPct(v){const n=+v;return Number.isFinite(n)&&n>0&&n<=100?Math.round(n*100)/100:0;}
function comDay(v){return /^\d{4}-\d{2}-\d{2}$/.test(v||'')?v:'';}
/* Процент клиента на день оплаты. */
function comPctOn(c,day){if(!c.from||day>=c.from)return c.pct;let p=0;c.was.forEach(w=>{if(!w.from||day>=w.from)p=w.pct;});return p;}
/* Новый процент с даты from: прежние, начатые до неё, уходят в was. */
function comRate(old,pct,from){return {customerId:old.customerId,pct,from,was:old.was.concat({pct:old.pct,from:old.from}).filter(w=>w.from<from)};}
function comClean(r){
 const seen=new Set();
 return {id:comStr(r.id,60),name:comStr(r.name,120),phone:comStr(r.phone,40),email:comStr(r.email,120),note:comStr(r.note,500),createdAt:comStr(r.createdAt,40),
  customers:(Array.isArray(r.customers)?r.customers:[]).filter(c=>c&&comStr(c.customerId)&&!seen.has(c.customerId)&&(seen.add(c.customerId),true)).map(c=>({customerId:comStr(c.customerId,80),pct:comPct(c.pct),from:comDay(c.from),
   was:(Array.isArray(c.was)?c.was:[]).map(w=>({pct:comPct(w&&w.pct),from:comDay(w&&w.from)})).filter(w=>w.pct).sort((a,b)=>a.from.localeCompare(b.from))}))};
}
function comPayoutClean(p){
 const orders=(Array.isArray(p.orders)?p.orders:[]).filter(x=>x&&comStr(x.orderId)).map(x=>({orderId:comStr(x.orderId,80),amount:finMoney(x.amount)})).filter(x=>x.amount!==0);
 return {id:comStr(p.id,60),referrerId:comStr(p.referrerId,60),date:/^\d{4}-\d{2}-\d{2}$/.test(p.date||'')?p.date:'',amount:finMoney(orders.reduce((n,x)=>n+x.amount,0)),note:comStr(p.note,300),createdAt:comStr(p.createdAt,40),orders};
}
function normalizeCommissions(){
 const ids=new Set(),owner=new Set();
 DB.referrer=(Array.isArray(DB.referrer)?DB.referrer:[]).filter(r=>r&&typeof r==='object'&&comStr(r.id)&&!ids.has(r.id)&&(ids.add(r.id),true)).map(comClean).filter(r=>r.name);
 DB.referrer.forEach(r=>{r.customers=r.customers.filter(c=>!owner.has(c.customerId)&&(owner.add(c.customerId),true));});
 const live=new Set(DB.referrer.map(r=>r.id));
 DB.referrerPayout=(Array.isArray(DB.referrerPayout)?DB.referrerPayout:[]).filter(p=>p&&typeof p==='object').map(comPayoutClean).filter(p=>p.id&&live.has(p.referrerId)&&p.orders.length&&p.date);
}
function comFind(id){return (DB.referrer||[]).find(r=>r.id===id)||null;}
function comOfCustomer(customerId){return (DB.referrer||[]).find(r=>r.customers.some(c=>c.customerId===customerId))||null;}

/* Запись: имя обязательно; клиент, которого забрали у другого, у того
   пропадает (клиент — у одного человека). */
function comSave(d){
 /* Другой процент у клиента, который уже был у человека, — с даты From
    (по умолчанию сегодня); новый клиент — за всё время, как раньше. */
 const old=d.id?comFind(d.id):null,customers=(Array.isArray(d.customers)?d.customers:[]).map(c=>{
  const was=old&&c&&old.customers.find(x=>x.customerId===c.customerId),pct=comPct(c&&c.pct);
  return !was?Object.assign({},c,{from:'',was:[]}):!pct?c:pct!==was.pct?comRate(was,pct,comDay(c.newFrom)||finToday()):was;
 });
 const r=comClean(Object.assign({},d,{customers,id:d.id||salesUid('RFR'),createdAt:d.createdAt||new Date().toISOString()}));
 if(!r.name)return {error:'Enter a name.'};
 if(r.customers.some(c=>!salesFindCustomer(c.customerId)))return {error:'Pick a customer.'};
 if(r.customers.some(c=>!c.pct))return {error:'Enter a percent from 0.01 to 100.'};
 return finPersist(()=>{
  if(!Array.isArray(DB.referrer))DB.referrer=[];
  const mine=new Set(r.customers.map(c=>c.customerId));
  DB.referrer.forEach(x=>{if(x.id!==r.id)x.customers=x.customers.filter(c=>!mine.has(c.customerId));});
  const i=DB.referrer.findIndex(x=>x.id===r.id);if(i<0)DB.referrer.push(r);else DB.referrer[i]=r;
  return r;
 });
}
function comDelete(id){return finPersist(()=>{DB.referrer=(DB.referrer||[]).filter(r=>r.id!==id);DB.referrerPayout=(DB.referrerPayout||[]).filter(p=>p.referrerId!==id);return true;});}
/* Выплата по выбранным заказам: каждый — на свой долг сейчас. Заказ без
   долга в выплату не входит — дважды за один заказ не заплатить. Переплата
   по другим заказам (оплату клиента перенесли на другой заказ, заказ
   отменили или удалили, оплату аннулировали после выплаты) вычитается из
   этой выплаты отдельными строками (ревью 12.10.2026: иначе одну и ту же
   комиссию можно было выплатить дважды). */
function comPayoutPlan(ref,orderIds){
 const due=[...comDue(ref).values()],want=new Set(orderIds||[]);
 const pay=due.filter(x=>want.has(x.orderId)&&x.due>0),back=due.filter(x=>x.due<0);
 return {pay,back,total:finMoney(pay.concat(back).reduce((n,x)=>n+x.due,0))};
}
function comPayoutAdd(d){
 const ref=comFind(d.referrerId);if(!ref)return {error:'Person not found.'};
 const plan=comPayoutPlan(ref,d.orderIds);
 const p=comPayoutClean({id:salesUid('RFP'),createdAt:new Date().toISOString(),referrerId:ref.id,date:d.date,note:d.note,
  orders:plan.pay.concat(plan.back).map(x=>({orderId:x.orderId,amount:x.due}))});
 if(!p.date)return {error:'Enter the date.'};
 if(!plan.pay.length)return {error:'Nothing to pay.'};
 if(plan.total<=0)return {error:'Nothing to pay: earlier payouts cover it.'};
 return finPersist(()=>{if(!Array.isArray(DB.referrerPayout))DB.referrerPayout=[];DB.referrerPayout.push(p);return p;});
}
function comPayoutDelete(id){return finPersist(()=>{DB.referrerPayout=(DB.referrerPayout||[]).filter(p=>p.id!==id);return true;});}

/* Итоги заказа считаются один раз за экран (ревью 12.10.2026: каждый
   показ считал их ~10 раз на заказ — секунды на сотнях заказов). comScope —
   память одного показа Agents; вне него — как обычно. */
let comScope=null;
function comWithScope(fn){const was=comScope;comScope={totals:new Map(),orders:new Map()};try{return fn();}finally{comScope=was;}}
function comTotals(o){
 if(!comScope)return finOrderTotals(o);
 const k=o.id+'|'+(o.updatedAt||'');if(!comScope.totals.has(k))comScope.totals.set(k,finOrderTotals(o));return comScope.totals.get(k);
}
/* Доля заказа без HST: оплата делится в пропорции суммы заказа. */
function comNoHstShare(t){return t&&t.grand>0?Math.max(0,(t.grand-t.hst)/t.grand):1;}
/* Заказы клиентов человека с оплатами за период (по дате оплаты). range —
   {from, to} днями или null (всё время). */
function comOrders(ref,range){
 const key=ref.id+'|'+JSON.stringify(ref.customers)+'|'+(range?range.from+'|'+range.to:'all');
 if(comScope&&comScope.orders.has(key))return comScope.orders.get(key);
 const pct=new Map(ref.customers.map(c=>[c.customerId,c])),by=new Map();
 finActiveReceipts().forEach(r=>{
  if(range&&(r.date<range.from||r.date>range.to))return;
  r.allocations.forEach(a=>{const o=salesRecord(a.orderId);if(!o||!pct.has(o.customerId))return;
   const x=by.get(o.id)||{o,paid:0,payments:0,byPct:new Map()},p=comPctOn(pct.get(o.customerId),r.date);
   x.paid+=a.amount;x.payments++;x.byPct.set(p,(x.byPct.get(p)||0)+a.amount);by.set(o.id,x);});
 });
 const out=[...by.values()].map(x=>{
  const t=comTotals(x.o),share=comNoHstShare(t),paid=finMoney(x.paid),base=finMoney(paid*share),ps=[...x.byPct.keys()].sort((a,b)=>a-b);
  /* Каждая оплата — по своему проценту; один процент — как прежде. */
  const com=finMoney([...x.byPct].reduce((n,[p,v])=>n+finMoney(finMoney(v)*share)*p/100,0)),comHst=finMoney([...x.byPct].reduce((n,[p,v])=>n+finMoney(v)*p/100,0));
  return {o:x.o,customerId:x.o.customerId,number:x.o.businessNumber,date:salesListIsoDay(x.o.createdAt),total:t&&t.complete?t.grand:null,paid,base,payments:x.payments,pct:ps.join(' · '),com,comHst};
 }).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.number).localeCompare(String(a.number)));
 if(comScope)comScope.orders.set(key,out);
 return out;
}
/* Долг по заказам за всё время: начислено − выплачено. Отрицательный —
   переплачено (оплату перенесли или аннулировали после выплаты). Удалённый
   заказ с выплатой остаётся строкой — его переплата тоже вычитается. */
function comDue(ref){
 const paid=new Map();(DB.referrerPayout||[]).filter(p=>p.referrerId===ref.id).forEach(p=>p.orders.forEach(x=>paid.set(x.orderId,finMoney((paid.get(x.orderId)||0)+x.amount))));
 const m=new Map(comOrders(ref,null).map(x=>[x.o.id,{orderId:x.o.id,o:x.o,number:x.number,customerId:x.customerId,com:x.com,paidOut:paid.get(x.o.id)||0}]));
 paid.forEach((v,id)=>{if(!m.has(id)){const o=salesRecord(id);m.set(id,{orderId:id,o,number:o?o.businessNumber:'Deleted order',customerId:o?o.customerId:'',com:0,paidOut:v});}});
 m.forEach(x=>{x.due=finMoney(x.com-x.paidOut);});
 return m;
}
/* Итоги человека: за период и «к выплате» за всё время. */
function comSummary(ref,range){
 const rows=comOrders(ref,range),all=range?comOrders(ref,null):rows,sum=(list,k)=>finMoney(list.reduce((n,x)=>n+x[k],0));
 const paidOut=finMoney((DB.referrerPayout||[]).filter(p=>p.referrerId===ref.id).reduce((n,p)=>n+p.amount,0));
 return {rows,orders:rows.length,base:sum(rows,'base'),paid:sum(rows,'paid'),com:sum(rows,'com'),comHst:sum(rows,'comHst'),
  earned:sum(all,'com'),earnedHst:sum(all,'comHst'),paidOut,toPay:finMoney(sum(all,'com')-paidOut),toPayHst:finMoney(sum(all,'comHst')-paidOut)};
}
