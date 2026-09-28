/* Money conservation, corrections, migration and actual UI workflows. */
module.exports=async function({page,eq}){
 console.log('finance ledger');const t=await page();
 await t.p.evaluate(()=>{
  window.financeSeed=function(){
   DB.receipt=[];DB.refund=[];DB.financeEvent=[];DB.financeTerms=[];DB.financeExport=[];DB.salesOrder=[];DB.customer=[];soDraft=null;soEdit=null;finDraft=null;finEdit=null;finAction=null;finCustomerFilter='';finOrderFilter='';finFrom='';finTo='';finSearch='';finActor='QA Operator';
   const c=normalizeCustomer({id:'CUS-FIN',code:'FIN',legalName:'Finance Test',paymentMode:'credit',creditDays:30});DB.customer.push(c);
   const o=normalizeSalesOrder({id:'SO-FIN',businessNumber:'91001',customerId:c.id,lines:[],extraItems:[{id:'EXT-FIN',table:'stockItem',itemId:'TEST',qty:1,priceOverride:100}],orderCharges:{energy:{enabled:false},hst:{enabled:false},card:{enabled:false},delivery:{enabled:false},skidDeposit:{enabled:false}}});DB.salesOrder.push(o);
   finCaptureTerms(o);tab='finance';finTab='accounts';finAccountId='';render();return {c,o};
  };
  window.financePayment=function(amount,applied){return finSaveReceiptRecord({customerId:'CUS-FIN',currency:'CAD',date:'2026-09-01',method:'etransfer',reference:'REF-1',amount,note:'Test',allocations:applied?[{orderId:'SO-FIN',amount:applied}]:[]});};
 });
 eq('record → allocate → refund → void refund preserves money and append-only snapshots',await t.p.evaluate(()=>{
  financeSeed();const r=financePayment(150,40);finApplyDeposit('CUS-FIN','SO-FIN',20);
  const refund=finCreateRefund({receiptId:r.id,amount:30,date:'2026-09-02',method:'etransfer',reason:'Customer requested excess back'});
  const first={paid:finOrderPaid('SO-FIN').paid,free:finReceiptOnAccount(r),refunded:finRefunded(r.id),amount:r.amount};
  const kinds=DB.financeEvent.map(e=>e.kind),original=DB.financeEvent[0].after.allocations[0].amount;
  finVoidRefund(refund.id,'Refund not sent');return {first,kinds,original,restored:finReceiptOnAccount(r),actor:DB.financeEvent[0].actor};
 }),{first:{paid:60,free:60,refunded:30,amount:150},kinds:['received','allocated','refunded'],original:40,restored:90,actor:'QA Operator'});
 eq('invalid amounts, refunds and duplicate references do not mutate balances',await t.p.evaluate(()=>{
  financeSeed();const r=financePayment(100,80),errors=[];
  const check=f=>{try{f();errors.push(false);}catch(e){errors.push(true);}};
  check(()=>finCreateRefund({receiptId:r.id,amount:21,date:'2026-09-02',method:'cash',reason:'Excess'}));
  check(()=>finCreateRefund({receiptId:r.id,amount:-1,date:'2026-09-02',method:'cash',reason:'Excess'}));
  check(()=>financePayment(100,0));
  check(()=>finSaveReceiptRecord({...r,amount:20,allocations:[]},r.id,''));
  check(()=>finSaveReceiptRecord({...r,date:'2026-02-30'},r.id,'Bad date'));
  check(()=>finSaveReceiptRecord({...r,amount:'NaN'},r.id,'Bad amount'));
  return {errors,events:DB.financeEvent.length,amount:r.amount,free:finReceiptOnAccount(r)};
 }),{errors:[true,true,true,true,true,true],events:1,amount:100,free:20});
 eq('correction records before/after; refunded money cannot be reallocated or voided',await t.p.evaluate(()=>{
  financeSeed();const r=financePayment(100,40);finCreateRefund({receiptId:r.id,amount:20,date:'2026-09-02',method:'cash',reason:'Return'});
  finSaveReceiptRecord({...r,allocations:[{orderId:'SO-FIN',amount:60}],note:'Reallocated'},r.id,'Customer requested allocation');
  let denied=false;try{finSaveReceiptRecord({...r,allocations:[{orderId:'SO-FIN',amount:90}]},r.id,'Too much');}catch(e){denied=true;}
  const e=DB.financeEvent.find(e=>e.kind==='corrected');return {before:e.before.allocations[0].amount,after:e.after.allocations[0].amount,reason:e.reason,denied,voided:finVoidReceipt(r.id,'Incorrect'),free:finReceiptOnAccount(r)};
 }),{before:40,after:60,reason:'Customer requested allocation',denied:true,voided:false,free:20});
 eq('storage failure rolls back payment and journal together; draft remains editable',await t.p.evaluate(()=>{
  financeSeed();finNewReceipt('CUS-FIN');finDraft.amount='120';finDraft.date='2026-09-01';const original=touch;touch=()=>false;finSaveReceipt();touch=original;
  return {payments:DB.receipt.length,events:DB.financeEvent.length,draft:finDraft.amount,error:document.getElementById('e_fin').textContent.includes('Not saved')};
 }),{payments:0,events:0,draft:'120',error:true});
 eq('terms are frozen per order; billing dates, leap dates and past-due balances are distinct from production due date',await t.p.evaluate(()=>{
  const {c,o}=financeSeed();o.dueDate='2020-01-01';c.creditDays=90;
  const unchanged=finTermsFor(o).creditDays,unknown=finOrderFinancial(o,'2026-10-01').overdue;
  finSaveTerms(o.id,{paymentMode:'credit',depositPercent:0,creditDays:30,issuedOn:'2026-09-01',dueOn:''},'Agreed billing date');
  const atDue=finOrderFinancial(o,'2026-10-01'),late=finOrderFinancial(o,'2026-10-02');
  return {unchanged,unknown,due:finPaymentDue(o),atDue:atDue.overdue,late:late.overdue,total:late.b.total,kinds:DB.financeEvent.map(e=>e.kind)};
 }),{unchanged:30,unknown:0,due:'2026-10-01',atDue:0,late:100,total:100,kinds:['terms']});
 eq('CAD cannot be applied to a USD extra-item order',await t.p.evaluate(()=>{
  const {o}=financeSeed();o.currency='USD';const r=financePayment(100,0);let denied=false;try{finSaveReceiptRecord({...r,allocations:[{orderId:o.id,amount:10}]},r.id,'Apply');}catch(e){denied=true;}
  return {total:finOrderBalance(o).total,applied:finApplyDeposit('CUS-FIN',o.id,10),denied,free:finReceiptOnAccount(r)};
 }),{total:null,applied:0,denied:true,free:100});
 eq('archived accounts retain money; exact filters ignore similar customer names and stale date filters',await t.p.evaluate(()=>{
  const {c}=financeSeed();const r=financePayment(100,20);c.status='archived';const other=normalizeCustomer({id:'CUS-FIN-2',legalName:'Finance Test'});DB.customer.push(other);DB.receipt.push(normalizeReceipt({id:'R-OTHER',customerId:other.id,amount:25,date:'2026-09-01',number:'R-0002'}));
  render();const visible=!!document.querySelector('[data-account="CUS-FIN"]');finFrom='2099-01-01';finShowCustomer(c.id);return {visible,rows:finFilteredReceipts().map(r=>r.id),expected:r.id,from:finFrom};
 }).then(x=>({...x,rows:x.rows.length===1&&x.rows[0]===x.expected,expected:undefined})),{visible:true,rows:true,expected:undefined,from:''});
 eq('JSON round trip keeps journal/refunds; malformed refund is rejected; migration is idempotent',await t.p.evaluate(()=>{
  financeSeed();const r=financePayment(100,20);finCreateRefund({receiptId:r.id,amount:25,date:'2026-09-02',method:'cash',reason:'Return'});
  const raw=finCopy(DB),next=prepareImportedState(raw),before=JSON.stringify(DB);raw.refund[0].amount=1000;let rejected=false;try{prepareImportedState(raw);}catch(e){rejected=true;}
  normalizeFinanceLedger();normalizeFinanceLedger();return {events:next.financeEvent.length,refunds:next.refund.length,rejected,unchanged:before===JSON.stringify(DB)};
 }),{events:2,refunds:1,rejected:true,unchanged:true});
 eq('existing payment gets one honest opening entry; cancellation preserves its previous order reference',await t.p.evaluate(()=>{
  financeSeed();DB.receipt.push(normalizeReceipt({id:'LEGACY',number:'R-0010',customerId:'CUS-FIN',date:'2026-08-01',amount:100,allocations:[{orderId:'SO-FIN',amount:80}]}));normalizeFinanceLedger();normalizeFinanceLedger();finReleaseOrder('SO-FIN');DB.salesOrder=[];
  return {kinds:DB.financeEvent.map(e=>e.kind),order:DB.financeEvent[1].orders[0].number,deposit:finCustomerDeposit('CUS-FIN')};
 }),{kinds:['opening','released'],order:'91001',deposit:100});
 eq('receipt navigation protects unsaved input and CSV protects formula cells',await t.p.evaluate(()=>{
  financeSeed();finNewReceipt('CUS-FIN');finDraft.amount='250';const original=confirm;window.confirm=()=>false;navGo('sales');const stayed=tab==='finance'&&finDraft.amount==='250';window.confirm=original;
  return {stayed,formula:finCsvCell('=1+1'),normal:finCsvCell('Customer, Inc')};
 }),{stayed:true,formula:"'=1+1",normal:'"Customer, Inc"'});
 eq('correction cannot change payment identity, number or original creation time',await t.p.evaluate(()=>{
  financeSeed();const r=financePayment(100,20),id=r.id,created=r.createdAt;
  finSaveReceiptRecord({...r,id:'REPLACED',number:'R-9999',createdAt:'2000',note:'Corrected note'},id,'Fix note');
  return {id:r.id===id,number:r.number,created:r.createdAt===created,kind:DB.financeEvent[1].kind};
 }),{id:true,number:'R-0001',created:true,kind:'corrected'});
 eq('failed refund persistence rolls back both refund and history',await t.p.evaluate(()=>{
  financeSeed();const r=financePayment(100,0),old=touch;touch=()=>false;
  const out=finPersist(()=>finCreateRefund({receiptId:r.id,amount:20,date:'2026-09-02',method:'cash',reason:'Return'}));touch=old;
  return {ok:out.ok,refunds:DB.refund.length,events:DB.financeEvent.length,available:finReceiptOnAccount(DB.receipt[0])};
 }),{ok:false,refunds:0,events:1,available:100});
 eq('import rejects damaged finance structures without replacing existing data',await t.p.evaluate(()=>{
  financeSeed();financePayment(100,20);const before=JSON.stringify(DB),results=[];
  for(const mutate of [x=>x.receipt[0].amount=-1,x=>x.receipt[0].currency='USD',x=>x.financeEvent[0].orders={},x=>x.financeEvent[0].after=null,x=>x.financeTerms[0].dueOn='2026-02-30']){
   const raw=finCopy(DB);mutate(raw);try{prepareImportedState(raw);results.push(false);}catch(e){results.push(true);}
  }return {results,unchanged:before===JSON.stringify(DB)};
 }),{results:[true,true,true,true,true],unchanged:true});
 eq('released allocation remains discoverable by exact order history',await t.p.evaluate(()=>{
  financeSeed();const r=financePayment(100,20);finSaveReceiptRecord({...r,allocations:[]},r.id,'Release order allocation');finShowOrder('SO-FIN');
  return {matches:finFilteredReceipts().map(x=>x.id).includes(r.id),paid:finOrderPaid('SO-FIN').paid,deposit:finReceiptOnAccount(r)};
 }),{matches:true,paid:0,deposit:100});
 eq('saved terms govern documents and dated credit handover',await t.p.evaluate(()=>{
  const {c,o}=financeSeed();finSaveTerms(o.id,{paymentMode:'credit',depositPercent:0,creditDays:30,issuedOn:finToday(),dueOn:'2099-01-01'},'Agreed date');c.paymentMode='cash';c.depositPercent=100;
  const printed=docBuildModel('proforma',o).meta.find(x=>x.label==='Terms').value;
  const allowed=salesTransitionChecks(o,'done').length;finSaveTerms(o.id,{paymentMode:'credit',depositPercent:0,creditDays:30,issuedOn:'2020-01-01',dueOn:'2020-02-01'},'Past due');
  return {printed,allowed,warned:salesTransitionChecks(o,'done').some(x=>x.title.includes('overdue payments'))};
 }),{printed:'Net 30 days',allowed:0,warned:true});
 eq('receipt: company block, balance after this payment, refunds; statement for a period: orders, activity, balance forward and closing',await t.p.evaluate(()=>{
  const {o}=financeSeed();DB.company=Object.assign(DB.company||{},{legalName:'QA Glass Co'});const r=financePayment(100,20);finCreateRefund({receiptId:r.id,amount:25,date:'2026-09-02',method:'cash',reason:'Return'});
  const later=finSaveReceiptRecord({customerId:'CUS-FIN',currency:'CAD',date:'2026-09-05',method:'cash',reference:'',amount:30,note:'',allocations:[{orderId:'SO-FIN',amount:30}]});
  o.status='done';o.statusDates.done=new Date('2026-09-03T15:00:00').toISOString();
  const receipt=finDocText(finReceiptDoc(r.id)),d=finStatementData('CUS-FIN','2026-09-02','2026-09-30'),statement=finDocText(finStatementDoc('CUS-FIN','2026-09-02','2026-09-30','2026-10-01'));
  return {company:receipt.includes('QA Glass Co')&&statement.includes('QA Glass Co'),title:receipt.includes('PAYMENT RECEIPT'),after:receipt.includes('$80.00')&&!receipt.includes('$50.00'),refund:receipt.includes('Refunded')&&receipt.includes('$25.00'),
   data:[d.opening,d.billed,d.paid,d.refunded,d.closing],lines:d.rows.map(l=>l.kind+':'+l.balance),orders:statement.includes('91001')&&statement.includes('Orders')&&statement.includes('Account activity'),
   closing:statement.includes('Balance forward')&&statement.includes('-$100.00')&&statement.includes('Credit balance')&&statement.includes('$5.00'),later:!!later};
 }),{company:true,title:true,after:true,refund:true,data:[-100,100,30,25,-5],lines:['refund:-75','order:25','payment:-5'],orders:true,closing:true,later:true});
 eq('monthly statements: last month range, customers with activity only, CSV for the customer books, email text with totals',await t.p.evaluate(()=>{
  const {o}=financeSeed();financePayment(100,100);o.status='done';o.statusDates.done=new Date('2026-09-10T15:00:00').toISOString();
  DB.customer.push(normalizeCustomer({id:'CUS-IDLE',code:'IDLE',legalName:'Idle Ltd'}));
  const range=finMonthRange(-1,'2026-10-15'),dec=finMonthRange(-1,'2027-01-05');finStatements={from:range.from,to:range.to,period:'custom',sent:{}};
  const list=finStatementsList().map(x=>x.c.id),csv=finStatementCSV('CUS-FIN',range.from,range.to).split('\r\n'),mail=finStatementMail('CUS-FIN',range.from,range.to);finStatements=null;
  return {range,dec,list,csv:[csv[0],csv[1],csv[csv.length-1]],rows:csv.length,mail:mail.includes('September 2026')&&mail.includes('Payments received: $100.00')&&mail.includes('Balance due: $0.00'),period:finPeriodText('2026-09-01','2026-09-30')};
 }),{range:{from:'2026-09-01',to:'2026-09-30'},dec:{from:'2026-12-01',to:'2026-12-31'},list:['CUS-FIN'],csv:['Date,Document,Type,Description,Charges,Payments,Balance','2026-09-01,,Balance forward,,,,0.00','2026-09-30,,Closing balance,,,,0.00'],rows:5,mail:true,period:'September 2026'});
 eq('Debit and Credit card are separate; old «Card» stays readable but is not offered for new payments',await t.p.evaluate(()=>{
  financeSeed();const old=normalizeReceipt({id:'OLD-CARD',customerId:'CUS-FIN',amount:10,method:'card',date:'2026-09-01'});
  return {fresh:finMethodChoices('cash').map(m=>m.k),legacy:finMethodChoices('card').some(m=>m.k==='card'),kept:old.method,label:finMethodLabel(old.method),credit:finMethodLabel('creditcard')};
 }),{fresh:['cash','cheque','etransfer','debit','creditcard'],legacy:true,kept:'card',label:'Card',credit:'Credit card'});
 eq('credit card payment flags an order without card fee; one click adds the fee and raises the balance; debit does not',await t.p.evaluate(()=>{
  const {o}=financeSeed();finNewReceipt('CUS-FIN');finDraft.method='debit';render();const debit=!!document.querySelector('.fin-card-fee');
  finDraft.method='creditcard';render();const credit=!!document.querySelector('.fin-card-fee'),before=finOrderBalance(o).total;
  finAddCardFee(o.id);const after=finOrderBalance(o).total;finDraft.method='creditcard';render();
  return {debit,credit,enabled:o.orderCharges.card.enabled,raised:after>before,rate:finMoney(after-before)===finMoney(before*o.orderCharges.card.rate/100),gone:!document.querySelector('.fin-card-fee')};
 }),{debit:false,credit:true,enabled:true,raised:true,rate:true,gone:true});
 eq('QuickBooks «only new»: new, corrected and voided after export come back once; voided before export is skipped; rollback keeps marks',await t.p.evaluate(()=>{
  financeSeed();const a=financePayment(100,20),b=finSaveReceiptRecord({customerId:'CUS-FIN',currency:'CAD',date:'2026-09-02',method:'cash',reference:'',amount:40,note:'',allocations:[]});
  const skip=finSaveReceiptRecord({customerId:'CUS-FIN',currency:'CAD',date:'2026-09-03',method:'cash',reference:'',amount:5,note:'',allocations:[]});finVoidReceipt(skip.id,'Typo');
  const first=finExportPending().map(x=>x.x.number+':'+x.state);let file='';const old=customerDownload;customerDownload=(n,t)=>file=t;finExportQuickBooks();
  const afterFirst=finExportPending().length;
  finSaveReceiptRecord({...a,note:'Changed'},a.id,'Note only');const noteOnly=finExportPending().length;
  finSaveReceiptRecord({...a,allocations:[{orderId:'SO-FIN',amount:30}]},a.id,'Reallocated');finVoidReceipt(b.id,'Bounced');const refund=finCreateRefund({receiptId:a.id,amount:10,date:'2026-09-04',method:'cash',reason:'Back'});
  const second=finExportPending().map(x=>(x.x.number)+':'+x.state).sort();
  const keep=touch;touch=()=>false;finExportQuickBooks();touch=keep;const rolled=finExportPending().length;
  finExportQuickBooks();customerDownload=old;
  return {first,afterFirst,noteOnly,second,rolled,last:finExportPending().length,labels:file.includes(',Corrected')&&file.includes(',Voided')&&file.includes(refund.number),batches:finExportLastBatch()};
 }),{first:['R-0001:new','R-0002:new'],afterFirst:0,noteOnly:0,second:['R-0001:changed','R-0002:voided','RF-0001:new'],rolled:3,last:0,labels:true,batches:2});
 eq('QuickBooks marks travel with the JSON backup and damaged marks are rejected',await t.p.evaluate(()=>{
  financeSeed();financePayment(100,0);const old=customerDownload;customerDownload=()=>{};finExportQuickBooks();customerDownload=old;
  const raw=finCopy(DB),next=prepareImportedState(raw);raw.financeExport[0].kind='invoice';let rejected=false;try{prepareImportedState(raw);}catch(e){rejected=true;}
  return {kept:next.financeExport.length,rejected};
 }),{kept:1,rejected:true});
 eq('balances: prepaid is money on orders not yet picked up; totals for all customers; customer card shows the same numbers',await t.p.evaluate(()=>{
  const {c,o}=financeSeed();financePayment(100,60);const inWork=finCustomerMoney(c.id);o.status='done';o.statusDates.done=new Date().toISOString();const shipped=finCustomerMoney(c.id);
  const all=finAllMoney();tab='finance';finSetTab('accounts');const foot=document.querySelector('.fin-table tfoot');
  const doc=finDocText(finBalancesDoc(finAccountsList(),'Open accounts'));tab='customers';customerEdit(c.id);const strip=document.querySelector('.fin-customer-strip').textContent;cEdit=null;cDraft=null;
  return {inWork:[inWork.balance,inWork.prepaid,inWork.deposit],shipped:[shipped.balance,shipped.prepaid],all:[all.balance,all.prepaid,all.deposit],foot:!foot,doc:doc.includes('CUSTOMER BALANCES')&&doc.includes('$40.00'),strip:strip.includes('$40.00')&&strip.includes('Finance account')};
 }),{inWork:[40,60,40],shipped:[40,0],all:[40,0,40],foot:true,doc:true,strip:true});
 await t.p.evaluate(()=>{
  window.financeScheduleSeed=function(){
   const {o}=financeSeed();DB.salesOrder=[];DB.financeTerms=[];
   const entries=[['late','2026-03-07'],['today','2026-03-08'],['d7','2026-03-15'],['d8','2026-03-16'],['d14','2026-03-22'],['d30','2026-04-07'],['d31','2026-04-08'],['undated',''],['paid','2026-03-09'],['cancelled','2026-03-09'],['quote','2026-03-09'],['usd','2026-03-09'],['closed','2026-03-01']];
   entries.forEach(([key,due])=>{const next=finCopy(o);next.id='DUE-'+key;next.businessNumber=key;next.customerPo='PO-'+key;if(key==='cancelled'||key==='closed')next.status=key;if(key==='quote')next.kind='quote';if(key==='usd')next.currency='USD';DB.salesOrder.push(next);DB.financeTerms.push({...finTermsFor(next),paymentMode:key==='d7'?'cash':'credit',issuedOn:'2026-02-01',creditDays:due?30:null,dueOn:due});});
   DB.customer[0].status='archived';DB.receipt.push(normalizeReceipt({id:'DUE-PAY',number:'R-0001',customerId:o.customerId,date:'2026-03-01',amount:190,allocations:[{orderId:'DUE-today',amount:40},{orderId:'DUE-paid',amount:100}]}));
   finSchedule={period:'custom',from:'2026-03-08',to:'2026-03-15',terms:'all',query:''};return finSchedule;
  };
 });
 eq('due schedule includes exact horizon boundaries, separates overdue and sorts earliest first',await t.p.evaluate(()=>{
  const f=financeScheduleSeed(),out={};for(const period of ['today','7','14','30','overdue'])out[period]=finDueRows({...f,period},'2026-03-08').rows.map(x=>x.o.businessNumber);return out;
 }),{'7':['today','d7'],'14':['today','d7','d8','d14'],'30':['today','d7','d8','d14','d30'],today:['today'],overdue:['closed','late']});
 eq('schedule counts partial balances, archived customers and cash terms without subtracting free deposits',await t.p.evaluate(()=>{
  const f=financeScheduleSeed(),all=finDueRows({...f,period:'all'},'2026-03-08');return {total:all.total,count:all.rows.length,review:all.review,customers:all.customers,deposit:finCustomerDeposit('CUS-FIN'),undated:finDueRows({...f,period:'undated'},'2026-03-08').rows.map(x=>x.o.businessNumber),cash:finDueRows({...f,period:'all',terms:'cash'},'2026-03-08').rows.map(x=>x.o.businessNumber),search:finDueRows({...f,period:'all',query:'PO-d14'},'2026-03-08').total};
 }),{total:860,count:9,review:1,customers:1,deposit:50,undated:['undated'],cash:['d7'],search:100});
 eq('due ranges reject reversed/invalid dates; calendar days survive leap days and DST',await t.p.evaluate(()=>{
  const f=financeScheduleSeed();return {errors:[{from:'2026-03-16',to:'2026-03-01'},{from:'2026-02-30',to:''}].map(d=>!!finDueRows({...f,...d},'2026-03-08').error),empty:finDueRows({...f,from:'2026-03-16',to:'2026-03-01'},'2026-03-08').total,days:finDueDayDiff('2026-03-09','2026-03-08'),leap:finAddDays('2028-02-28',2),open:finDueRows({...f,from:'2026-04-08',to:''},'2026-03-08').rows.map(x=>x.o.businessNumber)};
 }),{errors:[true,true],empty:0,days:1,leap:'2028-03-01',open:['d31']});
 eq('schedule uses frozen Net days or override and updates immediately after allocation and cancellation',await t.p.evaluate(()=>{
  const {o,c}=financeSeed();finSaveTerms(o.id,{paymentMode:'credit',depositPercent:0,creditDays:30,issuedOn:'2028-02-01',dueOn:''},'Net agreement');c.creditDays=90;
  const f={period:'all',terms:'all',query:''},first=finDueRows(f,'2028-03-01').rows[0];financePayment(100,40);const partial=finDueRows(f,'2028-03-01').total;
  finSaveTerms(o.id,{...finTermsFor(o),dueOn:'2028-03-08'},'Extension');const due=finDueRows(f,'2028-03-01').rows[0].f.dueOn;
  finApplyDeposit(c.id,o.id,60);const settled=finDueRows(f,'2028-03-01').rows.length;o.status='cancelled';return {date:first.f.dueOn,days:first.days,partial,due,settled,cancelled:finDueRows(f,'2028-03-01').rows.length};
 }),{date:'2028-03-02',days:1,partial:60,due:'2028-03-08',settled:0,cancelled:0});
 eq('schedule CSV and printing contain only the selected period and safe customer text',await t.p.evaluate(()=>{
  financeScheduleSeed();DB.customer[0].displayName='=Unsafe';const oldDownload=customerDownload;let csv='';customerDownload=(name,text)=>csv=text;finDueExport();customerDownload=oldDownload;
  const printed=finDocText(finScheduleDoc(finDueRows(finSchedule),finSchedule));
  return {rows:csv.split('\r\n').length,safe:csv.includes("'=Unsafe"),dates:printed.includes('2026-03-08 to 2026-03-15'),total:printed.includes('$160.00'),excluded:!printed.includes('PO-d8')&&!csv.includes('PO-d8')};
 }),{rows:3,safe:true,dates:true,total:true,excluded:true});
 await t.p.evaluate(()=>{financeScheduleSeed();finFrom='2099-01-01';finTo='2099-12-31';finSetTab('schedule');});
 await t.p.getByLabel('Payment due from',{exact:true}).fill('2026-03-16');
 await t.p.getByLabel('Payment due to',{exact:true}).fill('2026-03-22');
 await t.p.getByLabel('Schedule payment terms',{exact:true}).selectOption('credit');
 await t.p.getByLabel('Search payment schedule',{exact:true}).fill('PO-d14');
 eq('UI date/search/terms filters work independently of receipt dates; Before pickup hides the date range',await t.p.evaluate(()=>{
  const selected=[...document.querySelectorAll('[data-due-order]')].map(el=>el.dataset.dueOrder),history=finFrom;
  finSchedule.query='';finDuePeriodSet('undated');return {selected,history,undated:[...document.querySelectorAll('[data-due-order]')].map(el=>el.dataset.dueOrder),dates:!!document.querySelector('[aria-label="Payment due from"]')};
 }),{selected:['DUE-d14'],history:'2099-01-01',undated:['DUE-undated'],dates:false});
 // Real input/click flow for a payment and refund, not just domain calls.
 await t.p.evaluate(()=>{financeSeed();finNewReceipt('CUS-FIN');});
 await t.p.locator('#finAmount').fill('200');await t.p.getByRole('button',{name:'Save receipt',exact:true}).click();
 await t.p.getByRole('button',{name:'R-0001',exact:true}).click();
 await t.p.getByRole('button',{name:'Refund',exact:true}).click();
 await t.p.locator('#finRefundAmount').fill('25');await t.p.locator('#finActionReason').fill('Unused deposit returned');
 await t.p.getByRole('button',{name:'Record refund',exact:true}).click();
 eq('UI payment → refund → account card with its history',await t.p.evaluate(()=>{
  const r=DB.receipt[0],refund=DB.refund[0];finOpenAccount('CUS-FIN');const account=document.getElementById('app').textContent,journal=document.querySelector('.fin-history-box').textContent;
  return {amount:r.amount,refund:refund.amount,free:finReceiptOnAccount(r),account:account.includes('175.00'),journal:journal.includes('Money refunded')&&journal.includes('Payment received')};
 }),{amount:200,refund:25,free:175,account:true,journal:true});
 await t.p.reload();
 eq('reload preserves payments, refunds and journal sequence',await t.p.evaluate(()=>({payments:DB.receipt.length,refunds:DB.refund.length,events:DB.financeEvent.map(e=>e.kind),deposit:finCustomerDeposit('CUS-FIN')})),{payments:1,refunds:1,events:['received','refunded'],deposit:175});
 eq('finance workspace has no browser errors',t.errs,[]);await t.c.close();
};
