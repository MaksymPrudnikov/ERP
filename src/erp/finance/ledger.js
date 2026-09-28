/* Finance commands and history. No DOM; balances keep using the order pricing
   contract. Events are append-only through these commands; local JSON is not
   an authenticated or tamper-proof accounting ledger. */
DEFAULT.refund=[];DEFAULT.financeEvent=[];DEFAULT.financeTerms=[];DEFAULT.financeExport=[];DEFAULT.financeVersion=1;
const FIN_TABLES=['refund','financeEvent','financeTerms','financeExport'];
for(const k of FIN_TABLES)if(!Array.isArray(DB[k]))DB[k]=[];
const FIN_EVENT_LABELS={opening:'Opening record',received:'Payment received',corrected:'Payment corrected',allocated:'Deposit allocated',released:'Allocation released',voided:'Payment voided',refunded:'Money refunded',refund_voided:'Refund voided',terms:'Payment terms changed'};
/* Who recorded an entry. Stays empty until the app has sign-in: a name picked
   by hand is not evidence, so the screen no longer asks for it. */
let finActor='';
function finCopy(x){return JSON.parse(JSON.stringify(x));}
function finDateValid(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s)))return false;const d=new Date(s+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s;}
function finCents(v){const n=Number(v);return v!==''&&v!=null&&Number.isFinite(n)&&Math.abs(n)<=1e10?Math.round((n+Number.EPSILON)*100):null;}
function finAssert(cond,message){if(!cond)throw new Error(message);}
function finCurrency(r){return r&&r.currency||'CAD';}
function finRefunded(id){return finMoney((DB.refund||[]).filter(r=>r.receiptId===id&&!r.voided).reduce((s,r)=>s+r.amount,0));}
function finHistoryFor(id){return (DB.financeEvent||[]).filter(e=>e.entityId===id);}
function finEvent(kind,before,after,reason,entity){
 const r=after||before,customer=(DB.customer||[]).find(c=>c.id===r.customerId);
 const number=r.number||finOrderNumber(r.orderId),snapshot=x=>x?finCopy(x):null;
 const seq=(DB.financeEvent||[]).reduce((n,e)=>Math.max(n,e.seq||0),0)+1;
 const e={id:'FE-'+finUid(),seq,at:new Date().toISOString(),date:r.date||finToday(),kind,entity:entity||'receipt',entityId:r.id||r.orderId,
  customerId:r.customerId,customerName:customer?(customer.displayName||customer.legalName):'',number,currency:finCurrency(r),
  actor:finActor||'Not specified',reason:String(reason||'').trim(),before:snapshot(before),after:snapshot(after)};
 e.orders=[...new Set([...(before&&before.allocations||[]),...(after&&after.allocations||[])].map(a=>a.orderId).concat(r.orderId?[r.orderId]:[]))].map(id=>({id,number:finOrderNumber(id)}));
 DB.financeEvent.push(e);return e;
}
function finEnsureHistory(r){if(!finHistoryFor(r.id).length)finEvent('opening',null,r,'Existing record; earlier changes are not available.');}
function normalizeFinanceLedger(){
 for(const k of FIN_TABLES)if(!Array.isArray(DB[k]))DB[k]=[];
 /* Отметка выгрузки живёт, пока жива сама оплата или возврат. */
 const alive=new Set((DB.receipt||[]).concat(DB.refund||[]).map(x=>x&&x.id));
 DB.financeExport=DB.financeExport.filter(e=>e&&typeof e==='object'&&alive.has(e.entityId));
 DB.financeVersion=1;
 (DB.receipt||[]).forEach(finEnsureHistory);
}
/* Commit money and its history together. A failed write leaves the UI draft
   available, and restores the previous in-memory balances. */
function finPersist(fn){
 const keys=['receipt'].concat(FIN_TABLES),before={};keys.forEach(k=>before[k]=finCopy(DB[k]||[]));
 try{const value=fn();finAssert(value!==false,'The operation could not be completed.');finAssert(touch()!==false,'Not saved. Your changes are still open; retry or export a backup.');return {ok:true,value};}
 catch(e){keys.forEach(k=>DB[k]=before[k]);return {ok:false,error:e.message};}
}
function finReceiptDuplicates(d,id){
 const ref=String(d.reference||'').trim().toLowerCase();if(!ref||d.method==='cash')return [];
 return (DB.receipt||[]).filter(r=>!r.voided&&r.id!==id&&r.customerId===d.customerId&&r.method===d.method&&r.reference.trim().toLowerCase()===ref);
}
function finSaveReceiptRecord(d,id,reason,allowDuplicate){
 const old=id?(DB.receipt||[]).find(r=>r.id===id):null;
 finAssert(!id||!!old,'Payment not found.');finAssert(!old||!old.voided,'A void payment cannot be edited.');
 finAssert(!!salesFindCustomer(d.customerId),'Select a customer');
 finAssert(finCurrency(d)==='CAD','Payments currently support CAD only.');
 finAssert(finDateValid(d.date),'Enter a valid payment date.');
 finAssert(FIN_METHODS.some(m=>m.k===d.method),'Select a payment method.');
 const cents=finCents(d.amount);finAssert(cents!=null&&cents>0,'Enter a positive amount with a maximum of 10 billion.');
 if(old){finAssert(!(DB.refund||[]).some(x=>x.receiptId===old.id&&!x.voided&&x.date<d.date),'Payment date cannot be after an active refund.');finAssert(old.customerId===d.customerId,'The customer of a recorded payment cannot change. Void it and enter the correct payment.');finAssert(finCurrency(old)==='CAD','This payment currency is not supported.');}
 const refunded=old?finCents(finRefunded(old.id)):0;
 finAssert(cents>=refunded,'The amount cannot be less than money already refunded.');
 const allocations=[],seen=new Set();let applied=0;
 (d.allocations||[]).forEach(a=>{
  const value=finCents(a.amount);finAssert(value!=null&&value>=0,'Allocation amounts must be valid and non-negative.');if(!value)return;
  finAssert(!seen.has(a.orderId),'An order can only appear once in a payment.');seen.add(a.orderId);
  const o=(DB.salesOrder||[]).find(o=>o.id===a.orderId);
  finAssert(o&&o.customerId===d.customerId&&finOrderCounts(o),'Select an active order of this customer.');
  finAssert(finCurrency(o)==='CAD','A CAD payment cannot be applied to another currency.');
  const b=finOrderBalance(o),mine=old?(old.allocations.find(x=>x.orderId===o.id)||{}).amount||0:0;
  finAssert(b.total!=null,'Finish pricing the order before applying a payment.');
  finAssert(value<=finCents(Math.max(0,b.balance+mine)),'Allocation exceeds the order balance.');
  applied+=value;allocations.push({orderId:o.id,amount:value/100});
 });
 finAssert(applied+refunded<=cents,'Applied and refunded amounts exceed the payment.');
 const now=new Date().toISOString(),next=normalizeReceipt({id:old?old.id:finUid(),number:old?old.number:finNextReceiptNumber(),createdAt:old?old.createdAt:now,customerId:d.customerId,date:d.date,method:d.method,reference:d.reference,note:d.note,amount:cents/100,allocations,currency:'CAD',updatedAt:now});
 if(old){const equal=r=>JSON.stringify([r.date,r.method,r.reference,r.amount,r.note,r.allocations]);if(equal(old)===equal(next))return old;
  finAssert(String(reason||'').trim(),'Enter a reason for correcting this payment.');}
 finAssert(allowDuplicate||!finReceiptDuplicates(next,id).length,'A payment with this reference already exists. Review it or confirm the duplicate.');
 if(old){finEnsureHistory(old);const before=finCopy(old);Object.assign(old,next);finEvent('corrected',before,old,reason);return old;}
 DB.receipt.push(next);finEvent('received',null,next,'');return next;
}
function finCreateRefund(d){
 const r=DB.receipt.find(r=>r.id===d.receiptId);
 finAssert(r&&!r.voided,'Select an active payment.');finAssert(finCurrency(r)==='CAD','Refunds currently support CAD only.');
 const cents=finCents(d.amount);finAssert(cents!=null&&cents>0,'Enter a positive refund amount.');
 finAssert(cents<=finCents(finReceiptOnAccount(r)),'Refund exceeds the available deposit. Release the order allocation first.');
 finAssert(finDateValid(d.date)&&d.date>=r.date,'Refund date must be valid and not before the payment.');
 finAssert(FIN_METHODS.some(m=>m.k===d.method),'Select a refund method.');finAssert(String(d.reason||'').trim(),'Enter the refund reason.');
 finEnsureHistory(r);
 const seq=DB.refund.reduce((n,x)=>Math.max(n,+String(x.number).replace('RF-','')||0),0)+1;
 const out={id:'RF-'+finUid(),number:'RF-'+String(seq).padStart(4,'0'),receiptId:r.id,customerId:r.customerId,currency:'CAD',amount:cents/100,
  date:d.date,method:d.method,reference:String(d.reference||'').trim().slice(0,80),reason:String(d.reason).trim().slice(0,300),createdAt:new Date().toISOString(),voided:false,voidReason:'',voidedAt:''};
 DB.refund.push(out);finEvent('refunded',null,out,out.reason,'refund');return out;
}
function finVoidRefund(id,reason){
 const r=DB.refund.find(r=>r.id===id);finAssert(r&&!r.voided,'Refund not found or already void.');finAssert(String(reason||'').trim(),'Enter a reason.');
 const before=finCopy(r);r.voided=true;r.voidReason=String(reason).trim().slice(0,300);r.voidedAt=new Date().toISOString();finEvent('refund_voided',before,r,r.voidReason,'refund');return r;
}
function finTermsFor(o){
 const stored=(DB.financeTerms||[]).find(t=>t.orderId===o.id);if(stored&&stored.customerId===o.customerId)return stored;
 const c=salesFindCustomer(o.customerId)||{},t=paymentTermsFrom(c);
 return {orderId:o.id,customerId:o.customerId,currency:finCurrency(o),paymentMode:t.paymentMode,depositPercent:paymentDepositPercent(t),creditDays:t.creditDays,issuedOn:'',dueOn:'',capturedAt:''};
}
function finCaptureTerms(o){
 if(!o||o.kind==='quote')return;
 const at=DB.financeTerms.findIndex(t=>t.orderId===o.id),old=DB.financeTerms[at];
 if(old&&old.customerId===o.customerId)return;
 const next=Object.assign({},finTermsFor(o),{capturedAt:new Date().toISOString()});
 if(old){DB.financeTerms[at]=next;finEvent('terms',old,next,'Order customer changed.','terms');}else DB.financeTerms.push(next);
}
function finSaveTerms(orderId,d,reason){
 const o=(DB.salesOrder||[]).find(o=>o.id===orderId);finAssert(o&&finOrderCounts(o),'Select an active order.');
 finAssert(['cash','credit'].includes(d.paymentMode),'Select payment terms.');
 const pct=Number(d.depositPercent),days=d.creditDays===''||d.creditDays==null?null:Number(d.creditDays);
 finAssert(Number.isFinite(pct)&&pct>=0&&pct<=100,'Deposit percent must be between 0 and 100.');
 finAssert(days===null||Number.isInteger(days)&&days>=0&&days<=365,'Credit days must be between 0 and 365.');
 finAssert(!d.issuedOn||finDateValid(d.issuedOn),'Enter a valid billing date.');finAssert(!d.dueOn||finDateValid(d.dueOn),'Enter a valid payment due date.');
 finAssert(!d.issuedOn||!d.dueOn||d.dueOn>=d.issuedOn,'Payment due date cannot precede the billing date.');
 const before=finCopy(finTermsFor(o)),next={orderId,customerId:o.customerId,currency:finCurrency(o),paymentMode:d.paymentMode,depositPercent:pct,creditDays:days,issuedOn:d.issuedOn||'',dueOn:d.dueOn||'',capturedAt:before.capturedAt||new Date().toISOString()};
 const same=['paymentMode','depositPercent','creditDays','issuedOn','dueOn'].every(k=>before[k]===next[k]);if(same&&before.capturedAt)return before;
 const at=DB.financeTerms.findIndex(t=>t.orderId===orderId);if(at<0)DB.financeTerms.push(next);else DB.financeTerms[at]=next;
 finEvent('terms',before,next,reason,'terms');return next;
}
/* Calendar date in the shop's time zone: an entry made in the evening must not
   land on tomorrow, which toISOString() would do. */
function finLocalDate(iso){const d=new Date(iso||'');if(!iso||isNaN(d))return '';const p=v=>String(v).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function finAddDays(date,days){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function finShortDate(date,today){
 if(!finDateValid(date))return '';const [y,m,d]=date.split('-').map(Number),year=String(today||finToday()).slice(0,4);
 return DOC_MONTHS[m-1]+' '+d+(String(y)===year?'':', '+y);
}
/* Billing date: typed by hand, otherwise the day the order was picked up or
   delivered. Nobody has to remember to set it, and it disappears again if the
   pickup is undone. */
function finBillingDate(o){const t=finTermsFor(o);return t.issuedOn||finLocalDate(o&&o.statusDates&&o.statusDates.done);}
/* Payment due: agreed date, otherwise billing date + Net days (credit) or the
   billing date itself (cash pays at pickup). Before pickup there is no date;
   credit without Net days has none either — it is not invented. */
function finPaymentDue(o){
 const t=finTermsFor(o);if(t.dueOn)return t.dueOn;
 const billed=finBillingDate(o);if(!billed)return '';
 if(t.paymentMode!=='credit')return billed;
 return t.creditDays==null?'':finAddDays(billed,t.creditDays);
}
function finShipped(o){return !!o&&['done','closed'].includes(o.status);}
/* One reading of an order's money for every screen: status text and its tone
   (bad = act now, good = paid, info = nothing to do yet). */
function finOrderFinancial(o,today){
 const b=finOrderBalance(o),t=finTermsFor(o),dueOn=finPaymentDue(o),c=salesFindCustomer(o.customerId),day=today||finToday();
 const overdue=b.balance>0&&dueOn&&dueOn<day?b.balance:0;
 const depositRequired=b.total==null?null:finMoney(b.total*(t.paymentMode==='cash'?t.depositPercent:0)/100);
 const depositMissing=depositRequired==null?null:finShipped(o)?0:finMoney(Math.max(0,depositRequired-b.paid));
 let status,tone='info';
 if(!finOrderCounts(o))status='Inactive';
 else if(finCurrency(o)!=='CAD'){status='Currency review';tone='warn';}
 else if(b.total==null){status='Pricing incomplete';tone='warn';}
 else if(b.balance<0)status='Overpaid';
 else if(b.balance===0){status='Paid';tone='good';}
 else if(overdue){status='Overdue';tone='bad';}
 else if(c&&c.onHold){status='Customer on hold';tone='bad';}
 else if(depositMissing>0){status='Deposit due';tone='bad';}
 else if(dueOn)status=dueOn===day?'Due today':'Due '+finShortDate(dueOn,day);
 else if(t.paymentMode==='credit'&&t.creditDays==null){status='Net days not set';tone='warn';}
 else status=t.paymentMode==='credit'&&t.creditDays?'Net '+t.creditDays+' after pickup':'Due at pickup';
 return {b,terms:t,dueOn,overdue,depositRequired,depositMissing,status,tone};
}
function finCustomerOverdue(customerId,today){
 return finMoney((DB.salesOrder||[]).filter(o=>o.customerId===customerId&&finOrderCounts(o)).reduce((s,o)=>s+finOrderFinancial(o,today).overdue,0));
}
/* Деньги клиента одним взглядом. Balance — остаток по заказам; Prepaid —
   оплачено по заказам, которые ещё не выданы (деньги клиента у нас, товар
   ещё в работе); On account — внесено и ни к чему не привязано. */
function finCustomerMoney(customerId,today){
 const day=today||finToday(),m={balance:0,overdue:0,prepaid:0,orders:0,incomplete:0};
 (DB.salesOrder||[]).filter(o=>o.customerId===customerId&&finOrderCounts(o)).forEach(o=>finMoneyAdd(m,o,day));
 return finMoneyRound(Object.assign(m,{deposit:finCustomerDeposit(customerId)}));
}
function finMoneyAdd(m,o,day){
 const f=finOrderFinancial(o,day),b=f.b;
 if(b.total==null)m.incomplete++;
 if(b.balance>0){m.balance+=b.balance;m.orders++;}
 m.overdue+=f.overdue;
 if(!finShipped(o)&&finCurrency(o)==='CAD')m.prepaid+=b.paid;
 return f;
}
function finMoneyRound(m){['balance','overdue','prepaid','deposit'].forEach(k=>m[k]=finMoney(m[k]));return m;}
/* То же по всем клиентам — для четырёх цифр в шапке Finance. */
function finAllMoney(today){
 const day=today||finToday(),m={balance:0,overdue:0,prepaid:0,orders:0,incomplete:0},late=new Set();
 (DB.salesOrder||[]).filter(finOrderCounts).forEach(o=>{if(finMoneyAdd(m,o,day).overdue>0)late.add(o.customerId);});
 m.deposit=finActiveReceipts().filter(r=>finCurrency(r)==='CAD').reduce((s,r)=>s+finReceiptOnAccount(r),0);
 m.lateCustomers=late.size;
 return finMoneyRound(m);
}

/* Выписка за период (владелец, 28 сентября 2026: «раз в месяц слать клиенту
   файл… чтобы клиент тоже мог вести свой учёт»). Счёт клиента как в его
   книгах: заказ становится начислением в день выдачи (billing date), оплата —
   в свой день, возврат снова увеличивает долг. Остаток на начало периода +
   начисления − оплаты + возвраты = остаток на конец. Минус — деньги клиента
   у нас (депозит, предоплата по заказам в работе). */
function finStatementLines(customerId){
 const lines=[],skipped=[];
 (DB.salesOrder||[]).filter(o=>o.customerId===customerId&&finOrderCounts(o)&&finCurrency(o)==='CAD').forEach(o=>{
  const billed=finBillingDate(o);if(!billed)return;
  const f=finOrderFinancial(o);if(f.b.total==null){skipped.push(o);return;}
  lines.push({date:billed,sort:0,doc:o.businessNumber,kind:'order',text:'Order'+(o.customerPo?' · '+(/^po/i.test(o.customerPo)?'':'PO ')+o.customerPo:'')+(f.dueOn?' · due '+finShortDate(f.dueOn,'0000'):''),charge:f.b.total,payment:0,overdue:f.overdue>0});
 });
 finActiveReceipts().filter(r=>r.customerId===customerId&&finCurrency(r)==='CAD').forEach(r=>lines.push({date:r.date,sort:1,doc:r.number,kind:'payment',
  text:'Payment · '+finMethodLabel(r.method)+(r.reference?' '+r.reference:'')+(r.allocations.length?' · '+r.allocations.map(a=>finOrderNumber(a.orderId)).join(', '):''),charge:0,payment:r.amount}));
 (DB.refund||[]).filter(x=>x.customerId===customerId&&!x.voided&&x.currency==='CAD').forEach(x=>lines.push({date:x.date,sort:2,doc:x.number,kind:'refund',text:'Refund · '+finMethodLabel(x.method),charge:x.amount,payment:0}));
 lines.sort((a,b)=>a.date.localeCompare(b.date)||a.sort-b.sort||String(a.doc).localeCompare(String(b.doc)));
 return {lines,skipped};
}
function finStatementData(customerId,from,to){
 const {lines,skipped}=finStatementLines(customerId);
 const opening=finMoney(lines.filter(l=>from&&l.date<from).reduce((s,l)=>s+l.charge-l.payment,0));
 const rows=lines.filter(l=>(!from||l.date>=from)&&(!to||l.date<=to)).map(l=>Object.assign({},l));
 let run=opening;rows.forEach(l=>{run=finMoney(run+l.charge-l.payment);l.balance=run;});
 const sum=(kind,k)=>finMoney(rows.filter(l=>l.kind===kind).reduce((s,l)=>s+l[k],0));
 /* Просрочка «сейчас» не больше текущего долга: свободный депозит клиента
    уже уменьшил его счёт, даже если к заказу ещё не привязан. */
 const money=finCustomerMoney(customerId),today=finToday(),current=finMoney(lines.filter(l=>l.date<=today).reduce((s,l)=>s+l.charge-l.payment,0));
 return {from,to,opening,rows,closing:run,current,billed:sum('order','charge'),paid:sum('payment','payment'),refunded:sum('refund','charge'),overdue:finMoney(Math.min(money.overdue,Math.max(0,current))),prepaid:money.prepaid,skipped};
}
/* Прошлый месяц (или текущий) целиком — по местному календарю. */
function finMonthRange(offset,today){
 const t=today||finToday(),y=+t.slice(0,4),m=+t.slice(5,7)-1+(offset||0),d=new Date(Date.UTC(y,m,1)),e=new Date(Date.UTC(y,m+1,0));
 return {from:d.toISOString().slice(0,10),to:e.toISOString().slice(0,10)};
}

/* Выгрузка в QuickBooks «только новое». У каждой выгруженной оплаты и
   возврата запоминается подпись того, что ушло в файл. Новая запись, правка
   после выгрузки и Void после выгрузки попадают в следующий файл с пометкой;
   аннулированная до выгрузки в QuickBooks не нужна. */
function finExportSig(kind,x){
 return JSON.stringify(kind==='refund'?[x.date,x.amount,x.method,x.reference,x.receiptId,!!x.voided]:[x.date,x.amount,x.method,x.reference,x.customerId,!!x.voided,(x.allocations||[]).map(a=>[a.orderId,a.amount])]);
}
function finExportRecord(id){return (DB.financeExport||[]).find(e=>e.entityId===id)||null;}
function finExportState(kind,x){
 const e=finExportRecord(x.id);
 if(!e)return x.voided?'skip':'new';
 return e.sig===finExportSig(kind,x)?'done':x.voided?'voided':'changed';
}
const FIN_EXPORT_LABELS={new:'New',changed:'Corrected',voided:'Voided',done:'Exported',skip:'Not needed'};
function finExportPending(){
 const out=[];
 (DB.receipt||[]).forEach(x=>{const state=finExportState('receipt',x);if(state!=='done'&&state!=='skip')out.push({kind:'receipt',x,state});});
 (DB.refund||[]).forEach(x=>{const state=finExportState('refund',x);if(state!=='done'&&state!=='skip')out.push({kind:'refund',x,state});});
 return out;
}
function finExportLastBatch(){return (DB.financeExport||[]).reduce((n,e)=>Math.max(n,e.batch||0),0);}
function finExportMark(list){
 finAssert(list.length,'Nothing new to export.');
 const batch=finExportLastBatch()+1,at=new Date().toISOString();
 list.forEach(({kind,x})=>{
  const e={entityId:x.id,kind,sig:finExportSig(kind,x),at,batch},i=DB.financeExport.findIndex(y=>y.entityId===x.id);
  if(i<0)DB.financeExport.push(e);else DB.financeExport[i]=e;
 });
 return batch;
}
function finValidatePayload(src){
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,96}$/.test(v),money=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e10&&Math.abs(v*100-Math.round(v*100))<0.001;
 const unique=(rows,key,label)=>{const seen=new Set();(rows||[]).forEach(r=>{finAssert(r&&typeof r==='object'&&id(r[key]),label+': invalid id.');finAssert(!seen.has(r[key]),label+': duplicate id.');seen.add(r[key]);});};
 for(const k of FIN_TABLES)finAssert(src[k]==null||Array.isArray(src[k]),k+' must be an array.');
 unique(src.financeExport,'entityId','QuickBooks export');
 (src.financeExport||[]).forEach(e=>finAssert(['receipt','refund'].includes(e.kind)&&typeof e.sig==='string'&&Number.isSafeInteger(e.batch)&&e.batch>0&&Number.isFinite(Date.parse(e.at)),'Invalid QuickBooks export record.'));
 unique(src.refund,'id','Refund');unique(src.financeEvent,'id','Journal');unique(src.financeTerms,'orderId','Terms');
 unique(src.receipt,'id','Payment');
 const receipts=new Map((src.receipt||[]).map(r=>[r.id,r])),refunds=new Map(),orders=new Map((src.salesOrder||[]).map(o=>[o.id,o]));
 const numbers=new Set();
 (src.receipt||[]).forEach(r=>{
  finAssert(money(r.amount)&&finDateValid(r.date)&&['CAD','USD'].includes(finCurrency(r)),'Payment has an invalid amount, date or currency.');
  finAssert(!r.number||!numbers.has(r.number),'Duplicate payment number.');if(r.number)numbers.add(r.number);
  finAssert(!r.allocations||Array.isArray(r.allocations),'Payment allocations must be an array.');
  const seen=new Set();let applied=0;
  (r.allocations||[]).forEach(a=>{const o=a&&orders.get(a.orderId);finAssert(a&&money(a.amount)&&a.amount>0&&!seen.has(a.orderId),'Invalid or duplicate payment allocation.');seen.add(a.orderId);applied+=a.amount;
   finAssert(o&&o.customerId===r.customerId&&finCurrency(o)===finCurrency(r)&&o.kind!=='quote','Payment allocation must match the customer, order and currency.');});
  finAssert(finMoney(applied)<=r.amount,'Applied amounts exceed the payment.');
 });
 (src.refund||[]).forEach(r=>{
  const receipt=receipts.get(r.receiptId);finAssert(receipt&&receipt.customerId===r.customerId,'Refund must reference its customer payment.');
  finAssert(money(r.amount)&&r.amount>0&&r.currency===finCurrency(receipt)&&finDateValid(r.date)&&r.date>=receipt.date,'Invalid refund amount, currency or date.');
  finAssert(typeof r.voided==='boolean'&&String(r.reason||'').trim(),'Refund requires status and reason.');
  if(!r.voided){finAssert(!receipt.voided,'A void payment cannot have active refunds.');refunds.set(receipt.id,(refunds.get(receipt.id)||0)+r.amount);}
 });
 (src.receipt||[]).forEach(r=>{const refunded=refunds.get(r.id)||0;if(refunded)finAssert(finMoney(refunded+(r.allocations||[]).reduce((s,a)=>s+a.amount,0))<=r.amount,'Refunded and applied amounts exceed the payment.');});
 const refundNumbers=new Set();(src.refund||[]).forEach(r=>{finAssert(typeof r.number==='string'&&!refundNumbers.has(r.number),'Refund numbers must be unique.');refundNumbers.add(r.number);});
 const seqs=new Set();(src.financeEvent||[]).forEach(e=>{
  finAssert(Number.isSafeInteger(e.seq)&&e.seq>0&&!seqs.has(e.seq),'Journal sequence must be unique.');seqs.add(e.seq);
  finAssert(Array.isArray(e.orders)&&e.orders.every(o=>o&&id(o.id)&&typeof o.number==='string')&&(e.before===null||e.before&&typeof e.before==='object'&&!Array.isArray(e.before))&&e.after&&typeof e.after==='object'&&!Array.isArray(e.after),'Invalid journal snapshots or order references.');
  finAssert(Object.prototype.hasOwnProperty.call(FIN_EVENT_LABELS,e.kind)&&['receipt','refund','terms'].includes(e.entity)&&id(e.entityId)&&id(e.customerId)&&Number.isFinite(Date.parse(e.at)),'Invalid journal entry.');
 });
 (src.financeTerms||[]).forEach(t=>{finAssert(['cash','credit'].includes(t.paymentMode)&&Number.isFinite(t.depositPercent)&&t.depositPercent>=0&&t.depositPercent<=100&&(t.creditDays==null||Number.isInteger(t.creditDays)&&t.creditDays>=0&&t.creditDays<=365)&&(!t.issuedOn||finDateValid(t.issuedOn))&&(!t.dueOn||finDateValid(t.dueOn))&&(!t.issuedOn||!t.dueOn||t.dueOn>=t.issuedOn),'Invalid payment terms.');});
}
