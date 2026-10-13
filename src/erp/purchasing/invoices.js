/* Purchasing P4 · supplier invoices and manually recorded payments.
   This ledger never writes DB.receipt or customer Finance / QuickBooks.
   Currency and supplier on a payment are historical facts. Editing an
   invoice must not silently turn an old USD payment into CAD, or move it
   to another supplier. Deleted invoices keep payments as supplier credit.
   Blank amounts remain unknown; signed amounts allow credits/refunds. */
DEFAULT.purchaseInvoice=[];DEFAULT.purchaseInvoiceSeq=0;
DEFAULT.purchasePayment=[];DEFAULT.purchasePaymentSeq=0;
const PUR_MONEY={invoice:{key:'purchaseInvoice',seq:'purchaseInvoiceSeq',prefix:'PI',label:'Supplier invoice'},payment:{key:'purchasePayment',seq:'purchasePaymentSeq',prefix:'PP',label:'Supplier payment'}};
function purMoneyFind(kind,id){return (DB[PUR_MONEY[kind].key]||[]).find(d=>d.id===id)||null;}
function purMoneyClean(x){
 const d={};['id','number','invoiceNumber','invoiceId','supplierId','supplierName','currency','date','dueDate','method','reference','note','createdAt','createdBy','createdById','updatedAt','updatedBy','updatedById','voidAt'].forEach(k=>d[k]=purText(x[k]));
 d.currency=d.currency.toUpperCase()||'CAD';const amount=purNumber(x.amount);d.amount=amount==null?null:salesMoney(amount);d.paymentDays=purNumber(x.paymentDays);
 d.poIds=[...new Set((Array.isArray(x.poIds)?x.poIds:[]).map(purText).filter(Boolean))];d.rev=Number.isSafeInteger(x.rev)&&x.rev>0?x.rev:1;return d;
}
function normalizePurchaseInvoices(){
 Object.values(PUR_MONEY).forEach(c=>{const ids=new Set();DB[c.key]=(DB[c.key]||[]).filter(d=>d&&purText(d.id)&&!ids.has(purText(d.id))&&(ids.add(purText(d.id)),true)).map(purMoneyClean);DB[c.seq]=DB[c.key].reduce((n,d)=>Math.max(n,new RegExp('^'+c.prefix+'-\\d+$').test(d.number)?+d.number.slice(3):0),Number.isSafeInteger(DB[c.seq])&&DB[c.seq]>=0?DB[c.seq]:0);});
}
function validatePurchaseInvoices(src){
 Object.values(PUR_MONEY).forEach(c=>{if(!Array.isArray(src[c.key]))return;const ids=new Set(),nums=new Set();src[c.key].forEach(d=>{
  if(!d||typeof d!=='object'||Array.isArray(d)||!purText(d.id)||ids.has(purText(d.id))||!new RegExp('^'+c.prefix+'-\\d+$').test(d.number)||nums.has(d.number)||d.amount!=null&&(typeof d.amount!=='number'||!Number.isFinite(d.amount))||d.poIds!=null&&(!Array.isArray(d.poIds)||d.poIds.some(x=>typeof x!=='string')))throw new Error(c.label+': invalid or duplicate record.');
  ids.add(purText(d.id));nums.add(d.number);
 });});
}
function purSupplierKey(d){return d.supplierId?'id:'+d.supplierId:purNameKey(d.supplierName)?'name:'+purNameKey(d.supplierName):'unknown:'+(d.invoiceId||d.id||'new');}
function purMoneyReference(d){return d.invoiceNumber||d.number||'New invoice';}
function purInvoicePayments(id){return (DB.purchasePayment||[]).filter(p=>p.invoiceId===id&&!p.voidAt);}
function purInvoiceBalance(d){
 const payments=purInvoicePayments(d.id),matching=payments.filter(p=>p.currency===d.currency&&purSupplierKey(p)===purSupplierKey(d)),paid=salesMoney(matching.reduce((n,p)=>n+(p.amount||0),0)),review=payments.some(p=>p.amount==null||!matching.includes(p));
 return {paid,balance:purNumber(d.amount)==null||review?null:salesMoney(Number(d.amount)-paid),knownBalance:purNumber(d.amount)==null?null:salesMoney(Number(d.amount)-paid),review,payments};
}
function purInvoiceStatus(d){
 if(d.voidAt)return 'Deleted';const b=purInvoiceBalance(d);
 if(purNumber(d.amount)==null)return 'Amount needed';if(b.review)return 'Review payments';if(b.balance<0)return d.amount<0?'Credit':'Overpaid';if(b.balance===0)return 'Paid';return b.paid>0?'Partially paid':'Unpaid';
}
function purInvoiceDue(date,days){if(!date||days==null)return '';const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+Number(days));return finLocalDate(d);}
function purMoneySave(kind,raw){
 return purPersist(()=>{
  const c=PUR_MONEY[kind],old=raw.id?purMoneyFind(kind,raw.id):null;
  if(raw.id&&!old)throw new Error(c.label+' no longer exists.');if(old&&(old.rev!==raw.rev||old.voidAt))throw new Error(c.label+' changed elsewhere. Reopen it.');
  const d=purMoneyClean(raw),n=purNumber(raw.amount);
  purResolveSupplier(d);
  if(purText(raw.amount)!==''&&(n==null||!Number.isFinite(d.amount)))throw new Error('Amount: enter a number or leave empty.');
  if(!CURRENCY_RE.test(d.currency))throw new Error('Currency: enter a three-letter code.');
  ['date','dueDate'].forEach(k=>{if(d[k]&&!ISO_DATE_RE.test(d[k]))throw new Error('Date: use YYYY-MM-DD or leave empty.');});
  if(purText(raw.paymentDays)!==''&&(d.paymentDays==null||d.paymentDays<0||!Number.isInteger(d.paymentDays)))throw new Error('Payment terms: enter whole days or leave empty.');
  const actor=orderLogActor(),now=new Date().toISOString();d.id=old?old.id:salesUid(c.prefix);d.number=old?old.number:c.prefix+'-'+String(++DB[c.seq]).padStart(4,'0');d.createdAt=old?old.createdAt:now;d.createdBy=old?old.createdBy:actor.by;d.createdById=old?old.createdById:actor.byId;d.updatedAt=now;d.updatedBy=actor.by;d.updatedById=actor.byId;d.rev=old?old.rev+1:1;d.voidAt='';
  const changes=['invoiceNumber','invoiceId','supplierId','supplierName','currency','date','dueDate','method','reference','note','amount','paymentDays','poIds'].filter(k=>JSON.stringify(old&&old[k])!==JSON.stringify(d[k])).map(k=>({field:k,label:({poIds:'Purchase orders',invoiceId:'Invoice',invoiceNumber:'Supplier invoice number'})[k]||stkHuman(k),before:old?old[k]:null,after:d[k]}));
  if(old)DB[c.key][DB[c.key].indexOf(old)]=d;else DB[c.key].push(d);
  if(changes.length){purRecordEvent(kind,d.id,old?'Edited':'Created',changes);
   if(kind==='payment')[...new Set([old&&old.invoiceId,d.invoiceId].filter(Boolean))].forEach(id=>purRecordEvent('invoice',id,(old?'Edited payment ':'Recorded payment ')+d.number,[{field:'payment',label:'Payment',before:old?{amount:old.amount,currency:old.currency}:null,after:{amount:d.amount,currency:d.currency}}]));
   else [...new Set([...(old?old.poIds:[]),...d.poIds])].forEach(id=>purRecordEvent('po',id,(old?'Edited invoice ':'Linked invoice ')+purMoneyReference(d),[]));
  }return d;
 });
}
function purMoneyUndo(kind,id,rev,restore){
 return purPersist(()=>{const d=purMoneyFind(kind,id);if(!d||d.rev!==rev)throw new Error('Document changed elsewhere. Reopen it.');d.voidAt=restore?'':new Date().toISOString();d.rev++;const what=restore?'Restored':kind==='invoice'?'Deleted':'Undone';purRecordEvent(kind,id,what,[]);if(kind==='payment'&&d.invoiceId)purRecordEvent('invoice',d.invoiceId,what+' payment '+d.number,[]);if(kind==='invoice')d.poIds.forEach(id=>purRecordEvent('po',id,what+' invoice '+purMoneyReference(d),[]));return d;});
}
function purMoneyWarnings(kind,d){
 const a=[];
 if(d.amount==null||purText(d.amount)==='')a.push('Amount is unknown. Balances remain incomplete.');
 if(kind==='invoice'){
  const payments=d.id?purInvoicePayments(d.id):[];
  if(payments.some(p=>p.currency!==d.currency||purSupplierKey(p)!==purSupplierKey(d)))a.push('Existing payments keep their currency and supplier. Review them before using this invoice balance.');
  if(d.invoiceNumber&&(DB.purchaseInvoice||[]).some(x=>x.id!==d.id&&!x.voidAt&&purSupplierKey(x)===purSupplierKey(d)&&purNameKey(x.invoiceNumber)===purNameKey(d.invoiceNumber)))a.push('This supplier invoice number is already recorded.');
  d.poIds.forEach(id=>{const p=purOrderFind(id);if(!p||p.deletedAt||p.state==='cancelled')a.push('Linked PO is missing, deleted or cancelled.');else if(p.currency!==d.currency)a.push(p.number+' has a different currency. Enter the supplier invoice total.');});
 }else{
  const inv=purMoneyFind('invoice',d.invoiceId);
  if(d.invoiceId&&!inv)a.push('Linked invoice is missing. Payment remains on the supplier account.');
  else if(inv){
   if(inv.voidAt)a.push('Invoice is deleted. Payment remains on the supplier account.');
   if(inv.currency!==d.currency||purSupplierKey(inv)!==purSupplierKey(d))a.push('Currency or supplier differs from the invoice. Review this payment.');
   else if(inv.amount!=null&&purNumber(d.amount)!=null){const paid=purInvoicePayments(inv.id).filter(p=>p.id!==d.id&&p.currency===inv.currency&&purSupplierKey(p)===purSupplierKey(inv)).reduce((n,p)=>n+(p.amount||0),0);if(salesMoney(paid+Number(d.amount))>inv.amount)a.push('Payment exceeds the invoice balance. You can record it anyway.');}
  }else a.push('No invoice linked. This payment stays on the supplier account.');
 }return [...new Set(a)];
}
function purSupplierAccounts(today){
 today=today||finToday();const map=new Map(),get=d=>{const key=purSupplierKey(d)+'|'+d.currency;if(!map.has(key)){const s=purSupplierFind(d.supplierId);map.set(key,{id:key,supplierKey:purSupplierKey(d),supplierId:d.supplierId,supplierName:s?s.name:d.supplierName||'Supplier not set',currency:d.currency,invoiced:0,paid:0,knownBalance:0,unknown:0,overdue:0,review:0,invoices:[],payments:[]});}return map.get(key);};
 (DB.purchaseInvoice||[]).filter(d=>!d.voidAt).forEach(d=>{const a=get(d);a.invoices.push(d);if(d.amount==null)a.unknown++;else a.invoiced=salesMoney(a.invoiced+d.amount);const b=purInvoiceBalance(d);if(b.review)a.review++;if(d.dueDate&&d.dueDate<today&&b.balance>0)a.overdue=salesMoney(a.overdue+b.balance);});
 (DB.purchasePayment||[]).filter(d=>!d.voidAt).forEach(d=>{const a=get(d);a.payments.push(d);if(d.amount==null)a.unknown++;else a.paid=salesMoney(a.paid+d.amount);});
 return [...map.values()].map(a=>Object.assign(a,{knownBalance:salesMoney(a.invoiced-a.paid),balance:a.unknown?null:salesMoney(a.invoiced-a.paid)}));
}
function purInvoicesForPO(id){return (DB.purchaseInvoice||[]).filter(d=>!d.voidAt&&d.poIds.includes(id));}
function purInvoicePrintLines(id){return purInvoicesForPO(id).map(d=>{const b=purInvoiceBalance(d);return purMoneyReference(d)+' · '+(d.amount==null?'Amount needed':docNum(d.amount,2))+' '+d.currency+' · balance '+(b.balance==null?'Review':docNum(b.balance,2))+(d.poIds.length>1?' · shared across '+d.poIds.length+' POs':'');});}
function purPaymentPrintLines(id){return purInvoicesForPO(id).flatMap(d=>purInvoicePayments(d.id).map(p=>p.number+' · '+docDate(p.date)+' · '+(p.amount==null?'Amount needed':docNum(p.amount,2))+' '+p.currency+' · '+p.method));}
