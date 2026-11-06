/* Allocate payments (Finance → Accounts → клиент → Allocate): отмеченные
   квитанции разносятся в отмеченные заказы, Unallocate возвращает деньги на
   счёт клиента, окно показывает итог до нажатия. */
module.exports=async function({page,eq}){
 console.log('finance allocate');const t=await page();
 await t.p.evaluate(()=>{
  window.allocSeed=function(){
   DB.receipt=[];DB.refund=[];DB.financeEvent=[];DB.financeTerms=[];DB.financeExport=[];DB.financeExportBatch=[];DB.salesOrder=[];DB.customer=[];soDraft=null;soEdit=null;finDraft=null;finEdit=null;finAction=null;finAlloc=null;finActor='QA Operator';
   const c=normalizeCustomer({id:'CUS-AL',code:'AL',legalName:'Allocate Test',paymentMode:'credit',creditDays:30});DB.customer.push(c);
   const charges={energy:{enabled:false},hst:{enabled:false},card:{enabled:false},delivery:{enabled:false},skidDeposit:{enabled:false}};
   [['SO-A1','92001',100,'2026-09-01'],['SO-A2','92002',50,'2026-09-05'],['SO-A3','92003',30,'2026-09-09']].forEach(([id,n,price,day])=>{
    const o=normalizeSalesOrder({id,businessNumber:n,customerId:c.id,customerPo:'PO-'+n,createdAt:day+'T12:00:00Z',lines:[],extraItems:[{id:'EXT-'+id,table:'stockItem',itemId:'TEST',qty:1,priceOverride:price}],orderCharges:charges});
    DB.salesOrder.push(o);finCaptureTerms(o);
   });
   const pay=(amount,date,ref,allocations)=>finSaveReceiptRecord({customerId:c.id,currency:'CAD',date,method:'cheque',reference:ref,amount,note:'',allocations:allocations||[]});
   const r1=pay(40,'2026-09-10','CH-1'),r2=pay(200,'2026-09-12','CH-2'),r3=pay(30,'2026-09-14','CH-3',[{orderId:'SO-A3',amount:30}]);
   tab='finance';finTab='accounts';finAccountId='';render();return {c,r1,r2,r3};
  };
 });
 eq('Allocate selected: oldest selected receipt first, orders in order, each up to its balance; unselected receipt untouched',await t.p.evaluate(()=>{
  const {r1,r2,r3}=allocSeed();
  const done=finAllocate('CUS-AL',['SO-A1','SO-A2'],[r1.id,r2.id]);
  return {done,r1:r1.allocations,r2:r2.allocations,a1:finOrderBalance(DB.salesOrder[0]).balance,a2:finOrderBalance(DB.salesOrder[1]).balance,r2left:finReceiptOnAccount(r2),r3:r3.allocations.length,events:DB.financeEvent.filter(e=>e.kind==='allocated').length};
 }),{done:150,r1:[{orderId:'SO-A1',amount:40}],r2:[{orderId:'SO-A1',amount:60},{orderId:'SO-A2',amount:50}],a1:0,a2:0,r2left:90,r3:1,events:3});
 eq('Ask amount caps the allocation; nothing selected allocates nothing',await t.p.evaluate(()=>{
  const {r2}=allocSeed();
  const capped=finAllocate('CUS-AL',['SO-A1','SO-A2'],[r2.id],120.5),none=finAllocate('CUS-AL',['SO-A1'],[]),noOrders=finAllocate('CUS-AL',[],[r2.id]);
  return {capped,none,noOrders,a2:finOrderBalance(DB.salesOrder[1]).balance,left:finReceiptOnAccount(r2)};
 }),{capped:120.5,none:0,noOrders:0,a2:29.5,left:79.5});
 eq('Unallocate returns the pair to the account and writes the journal; repeated and foreign pairs are skipped',await t.p.evaluate(()=>{
  const {r3}=allocSeed();
  const moved=finUnallocate('CUS-AL',[{receiptId:r3.id,orderId:'SO-A3'}]),again=finUnallocate('CUS-AL',[{receiptId:r3.id,orderId:'SO-A3'}]),foreign=finUnallocate('OTHER',[{receiptId:r3.id,orderId:'SO-A3'}]);
  const ev=DB.financeEvent.filter(e=>e.kind==='released').map(e=>e.reason);
  return {moved,again,foreign,left:finReceiptOnAccount(r3),due:finOrderBalance(DB.salesOrder[2]).balance,ev};
 }),{moved:30,again:0,foreign:0,left:30,due:30,ev:['Allocation released from order 92003']});
 eq('Allocate window: opened from the customer card, Fully paid hidden, summary before the click, links with × Unallocate',await t.p.evaluate(()=>{
  const {c,r2}=allocSeed();finOpenAccount(c.id);
  document.querySelector('[data-fin-open-allocate]').click();
  const rows=()=>[...document.querySelectorAll('[data-fin-alloc="o"] tbody tr[data-order]')].map(r=>r.dataset.order),rrows=()=>[...document.querySelectorAll('[data-fin-alloc="r"] tbody tr[data-receipt]')].length;
  const first={orders:rows(),receipts:rrows(),allocate:document.querySelector('[data-fin-allocate]').disabled,unallocate:document.querySelector('[data-fin-unallocate]').disabled};
  finAllocToggle('o','SO-A2');finAllocToggle('r',r2.id);
  const say=document.getElementById('finAllocSay').textContent;
  document.querySelector('[data-fin-allocate]').click();
  const after={balance:finOrderBalance(DB.salesOrder[1]).balance,selected:finAlloc.orders.length+finAlloc.receipts.length,orders:rows()};
  finAllocShow('o','paid');finAllocExpand('o:SO-A2');
  const link=document.querySelector('[data-fin-alloc="o"] .fin-alloc-unlink');link.click();
  const text=document.querySelector('.fin-alloc-bar').textContent+document.querySelector('.fin-alloc').textContent;
  return {first,say,after,back:finOrderBalance(DB.salesOrder[1]).balance,english:!/[А-Яа-яЁё]/.test(text),title:document.querySelector('.fin-account-head h3').textContent};
 }),{first:{orders:['SO-A1','SO-A2'],receipts:2,allocate:true,unallocate:true},say:'Allocate $50.00 from R-0002 to 92002 · $150.00 stays on account',after:{balance:0,selected:0,orders:['SO-A1']},back:50,english:true,title:'Allocate payments · Allocate Test'});
 eq('Allocate window: Unallocate selected releases every link of the selected order; + Receipt comes back to the window',await t.p.evaluate(()=>{
  const {c,r1,r2}=allocSeed();finAllocate('CUS-AL',['SO-A1'],[r1.id,r2.id]);finOpenAllocate(c.id);
  finAllocToggle('o','SO-A1');finAllocShow('o','paid');
  const pairs=finAllocPairs(c.id).length;document.querySelector('[data-fin-unallocate]').click();
  const due=finOrderBalance(DB.salesOrder[0]).balance;
  finAllocNewReceipt();const form=finTab==='receipts'&&finEdit==='new'&&finDraft.customerId===c.id;finCloseReceipt(true);
  return {pairs,due,form,back:finTab==='accounts'&&!!document.querySelector('.fin-alloc')};
 }),{pairs:2,due:100,form:true,back:true});
 eq('allocate window has no browser errors',t.errs,[]);await t.c.close();
};
