/* Money conservation, corrections, migration and actual UI workflows. */
module.exports=async function({page,eq}){
 console.log('finance ledger');const t=await page();
 await t.p.evaluate(()=>{
  window.financeSeed=function(){
   DB.receipt=[];DB.refund=[];DB.financeEvent=[];DB.financeTerms=[];DB.salesOrder=[];DB.customer=[];soDraft=null;soEdit=null;finDraft=null;finEdit=null;finAction=null;finCustomerFilter='';finOrderFilter='';finActor='QA Operator';
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
 eq('archived accounts retain money; exact filters ignore similar customer names and stale method filters',await t.p.evaluate(()=>{
  const {c}=financeSeed();const r=financePayment(100,20);c.status='archived';const other=normalizeCustomer({id:'CUS-FIN-2',legalName:'Finance Test'});DB.customer.push(other);DB.receipt.push(normalizeReceipt({id:'R-OTHER',customerId:other.id,amount:25,date:'2026-09-01',number:'R-0002'}));
  render();const visible=!!document.querySelector('[data-account="CUS-FIN"]');finMethod='card';finFrom='2099-01-01';finShowCustomer(c.id);return {visible,rows:finFilteredReceipts().map(r=>r.id),expected:r.id,method:finMethod,from:finFrom};
 }).then(x=>({...x,rows:x.rows.length===1&&x.rows[0]===x.expected,expected:undefined})),{visible:true,rows:true,expected:undefined,method:'',from:''});
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
  return {printed,allowed,warned:salesTransitionChecks(o,'done').some(x=>x.title.includes('balance due'))};
 }),{printed:'Net 30 days',allowed:0,warned:true});
 eq('receipt and account print paths use current refunded balances and preserve currency labels',await t.p.evaluate(()=>{
  financeSeed();const r=financePayment(100,20);finCreateRefund({receiptId:r.id,amount:25,date:'2026-09-02',method:'cash',reason:'Return'});
  const old=printSheet;let pages=[];printSheet=x=>pages=x;finPrintReceipt(r.id);const receipt=pages.join('');finPrintAccount('CUS-FIN');const account=pages.join('');
  r.currency='USD';finPrintReceipt(r.id);const currency=pages.join('').includes('USD');printSheet=old;
  return {receipt:receipt.includes('$55.00')&&receipt.includes('$25.00'),account:account.includes('current balances')&&account.includes('Refund'),currency};
 }),{receipt:true,account:true,currency:true});
 // Real input/click flow for a payment and refund, not just domain calls.
 await t.p.evaluate(()=>{financeSeed();finNewReceipt('CUS-FIN');});
 await t.p.locator('#finAmount').fill('200');await t.p.getByRole('button',{name:'Save receipt',exact:true}).click();
 await t.p.getByRole('button',{name:'Open',exact:true}).click();
 await t.p.getByRole('button',{name:'Record refund',exact:true}).click();
 await t.p.locator('#finRefundAmount').fill('25');await t.p.locator('#finActionReason').fill('Unused deposit returned');
 await t.p.getByRole('button',{name:'Record refund',exact:true}).click();
 eq('UI payment → refund → account → journal',await t.p.evaluate(()=>{
  const r=DB.receipt[0],refund=DB.refund[0];finOpenAccount('CUS-FIN');const account=document.getElementById('app').textContent;finSetTab('journal');const journal=document.getElementById('app').textContent;
  return {amount:r.amount,refund:refund.amount,free:finReceiptOnAccount(r),account:account.includes('175.00'),journal:journal.includes('Money refunded')&&journal.includes('Payment received')};
 }),{amount:200,refund:25,free:175,account:true,journal:true});
 await t.p.reload();
 eq('reload preserves payments, refunds and journal sequence',await t.p.evaluate(()=>({payments:DB.receipt.length,refunds:DB.refund.length,events:DB.financeEvent.map(e=>e.kind),deposit:finCustomerDeposit('CUS-FIN')})),{payments:1,refunds:1,events:['received','refunded'],deposit:175});
 eq('finance workspace has no browser errors',t.errs,[]);await t.c.close();
};
