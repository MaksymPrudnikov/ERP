/* Finance: оплаты клиентов, депозит на счёте, баланс заказа, CSV для
   QuickBooks. Решения владельца 14 сентября 2026. Прогоняется и на src, и на
   собранном dist. */
module.exports=async function({page,eq,ok}){
 console.log('finance');
 const t=await page();
 await t.p.evaluate(()=>{
  /* Сохранённый заказ с известными ценами у своего клиента. */
  window.finFixture=function(customer,lines){
   const cust=normalizeCustomer(Object.assign({legalName:'QA Finance Ltd',code:'QAFIN'+(DB.customer.length+1)},customer||{}));DB.customer.push(cust);
   tab='sales';salesOrderNew();salesSetUnitType('double');
   const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');
   m.panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=6;p.priceOverride=5.55;p.heatTreatmentId='HT-FT';p.heatSoak=false;});
   m.cavities.forEach(c=>{c.priceOverride=3.1;});
   soDraft.lines=[];
   (lines||[[37,71,2,'F-1']]).forEach(x=>{
    const l=normalizeSalesOrderLine({makeupId:m.id,width16:x[0]*16,height16:x[1]*16,qty:x[2],mark:x[3]});
    soDraft.lines.push(l);salesEnsureLineShape(l);
    salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});
   });
   soDraft.customerId=cust.id;soDraft.businessNumber=String(80001+DB.salesOrder.length);
   const o=normalizeSalesOrder(JSON.parse(JSON.stringify(soDraft)));DB.salesOrder.push(o);
   soEdit=null;soDraft=null;
   return {cust,o,total:finOrderTotals(o).grand};
  };
  window.finCleanup=function(){
   DB.receipt=[];DB.salesOrder=DB.salesOrder.filter(o=>!/^8\d{4}$/.test(o.businessNumber));DB.customer=DB.customer.filter(c=>!/^QA/.test(c.code||''));
   soEdit=null;soDraft=null;finEdit=null;finDraft=null;finApply=null;finSearch='';finMethod='';finFrom='';finTo='';finTab='receipts';
  };
 });

 eq('квитанции нормализуются: центы, разнесение не больше суммы, чужой и удалённый заказ возвращают деньги, номера по порядку',await t.p.evaluate(()=>{
  finCleanup();const a=finFixture({code:'QANORMA',legalName:'QA Norm A'}),b=finFixture({code:'QANORMB',legalName:'QA Norm B'});
  DB.receipt=[{customerId:a.cust.id,amount:'99.999',allocations:[{orderId:a.o.id,amount:80},{orderId:a.o.id,amount:50},{orderId:b.o.id,amount:10},{orderId:'SO-missing',amount:5}]},{number:'R-0007',customerId:a.cust.id,amount:10,method:'bitcoin'}];
  normalizeReceipts();
  const r=DB.receipt[0];
  return {amount:r.amount,alloc:r.allocations.map(x=>x.amount),onAccount:finReceiptOnAccount(r),numbers:DB.receipt.map(x=>x.number),method:DB.receipt[1].method};
 }),{amount:100,alloc:[100],onAccount:0,numbers:['R-0008','R-0007'],method:'cash'});

 eq('сумма сохранённого заказа не зависит от того, какой заказ открыт в редакторе (Heat Soak на месте)',await t.p.evaluate(()=>{
  finCleanup();const a=finFixture();
  const saved=DB.salesOrder.find(x=>x.id===a.o.id);saved.makeups[0].panes[0].heatSoak=true;
  salesOrderEdit(saved.id);const whenOpen=salesOrderCommercialTotals(soDraft).grand;
  salesOrderNew();const bare=salesOrderCommercialTotals(saved).grand,fin=finOrderTotals(saved).grand;
  soEdit=null;soDraft=null;
  return {same:fin===whenOpen,bareDiffers:bare!==whenOpen};
 }),{same:true,bareDiffers:true});

 eq('новая оплата: Max разносит её на долг заказа, остаток ложится депозитом, в списке строка с заказом',await t.p.evaluate(()=>{
  finCleanup();const {cust,o,total}=finFixture();
  tab='finance';finSetTab('receipts');finNewReceipt(cust.id);
  finDraft.amount='5000';finDraft.method='cheque';finDraft.reference='#1042';render();
  finApplyMax(o.id);finSaveReceipt();
  const r=DB.receipt[0],row=document.querySelector('[data-receipt="'+r.id+'"]');
  return {number:r.number,applied:r.allocations.length===1&&r.allocations[0].amount===total,onAccount:finReceiptOnAccount(r)===finMoney(5000-total),row:!!row&&row.textContent.includes(o.businessNumber)&&row.textContent.includes('#1042'),status:finOrderBalance(o).status,closed:finEdit===null};
 }),{number:'R-0001',applied:true,onAccount:true,row:true,status:'paid',closed:true});

 eq('Void: квитанция остаётся в списке с причиной и перестаёт считаться в балансе и депозите',await t.p.evaluate(()=>{
  const r=DB.receipt[0],o=DB.salesOrder.find(x=>x.id===r.allocations[0].orderId);
  finOpenReceipt(r.id);const old=window.prompt;window.prompt=()=>'Entered twice';finVoidCurrent();window.prompt=old;
  const row=document.querySelector('[data-receipt="'+r.id+'"]');
  return {voided:r.voided,reason:r.voidReason,rowVoid:!!row&&row.classList.contains('fin-void')&&/Void/.test(row.textContent),status:finOrderBalance(o).status,deposit:finCustomerDeposit(r.customerId)};
 }),{voided:true,reason:'Entered twice',rowVoid:true,status:'due',deposit:0});

 eq('Customer accounts: долг по заказам, условия клиента, депозит и превышение кредитного лимита',await t.p.evaluate(()=>{
  finCleanup();
  const a=finFixture({code:'QACREDIT',legalName:'QA Credit Ltd',paymentMode:'credit',creditDays:30,creditLimit:100});
  const b=finFixture({code:'QACASH',legalName:'QA Cash Ltd'});
  DB.receipt.push(normalizeReceipt({number:'R-0001',customerId:b.cust.id,amount:250}));
  tab='finance';finSetTab('accounts');
  const rowA=document.querySelector('[data-account="'+a.cust.id+'"]').textContent,rowB=document.querySelector('[data-account="'+b.cust.id+'"]').textContent;
  return {overLimit:finCustomerAccount(a.cust).overLimit,pill:/Over limit/.test(rowA),terms:/Net 30 days/.test(rowA),deposit:/\$250\.00/.test(rowB),applyButton:/Apply deposit/.test(rowB)};
 }),{overLimit:true,pill:true,terms:true,deposit:true,applyButton:true});

 eq('заказ: в шапке Receipt total и Balance, красное «Balance due», после доплаты — «Paid»; в списке колонки Receipts и Balance',await t.p.evaluate(()=>{
  finCleanup();const {cust,o,total}=finFixture(),half=finMoney(total/2),rest=finMoney(total-half);
  DB.receipt.push(normalizeReceipt({number:'R-0001',customerId:cust.id,amount:half,allocations:[{orderId:o.id,amount:half}]}));
  salesOrderEdit(o.id);
  const strip=document.querySelector('.fin-strip').textContent,due=/Balance due/.test(strip)&&strip.includes(finFmt(rest));
  DB.receipt.push(normalizeReceipt({number:'R-0002',customerId:cust.id,amount:rest,allocations:[{orderId:o.id,amount:rest}]}));
  render();const paid=/Paid/.test(document.querySelector('.fin-strip').textContent);
  soEdit=null;soDraft=null;render();
  const heads=[...document.querySelectorAll('.sales-list-card th')].map(x=>x.textContent.trim());
  const row=[...document.querySelectorAll('.sales-list-card tbody tr')].find(tr=>tr.textContent.includes(o.businessNumber));
  salesOrderNew();const fresh=document.querySelector('.fin-strip').textContent.trim();soEdit=null;soDraft=null;
  return {due,paid,heads:['Total','Receipts','Balance'].every(h=>heads.includes(h)),rowPaid:!!row&&/Paid/.test(row.textContent),fresh};
 }),{due:true,paid:true,heads:true,rowPaid:true,fresh:'Save the order to take payments'});

 eq('депозит клиента: подсказка в заказе и окно Apply deposit зачитывают его в долг заказа',await t.p.evaluate(()=>{
  finCleanup();const {cust,o}=finFixture();
  DB.receipt.push(normalizeReceipt({number:'R-0001',customerId:cust.id,amount:300}));
  salesOrderEdit(o.id);
  const hint=document.querySelector('.fin-hint'),hasHint=!!hint&&hint.textContent.includes('$300.00');
  hint.querySelector('button').click();
  const modal=!!document.querySelector('.fin-modal'),amount=document.getElementById('finApplyAmount').value;
  finConfirmApply();
  const r={hasHint,modal,amount,paid:finOrderBalance(o).paid,deposit:finCustomerDeposit(cust.id),hintGone:!document.querySelector('.fin-hint')};
  soEdit=null;soDraft=null;return r;
 }),{hasHint:true,modal:true,amount:'300.00',paid:300,deposit:0,hintGone:true});

 eq('удаление заказа с оплатами: деньги возвращаются на депозит клиента',await t.p.evaluate(()=>{
  finCleanup();const {cust,o}=finFixture();
  DB.receipt.push(normalizeReceipt({number:'R-0001',customerId:cust.id,amount:400,allocations:[{orderId:o.id,amount:400}]}));
  const old=window.confirm;let msg='';window.confirm=m=>{msg=m;return true;};
  tab='sales';subtab='orders';render();salesOrderDelete(o.id);window.confirm=old;
  return {message:/\$400\.00 go back to the customer deposit/.test(msg),gone:!DB.salesOrder.some(x=>x.id===o.id),deposit:finCustomerDeposit(cust.id),allocations:DB.receipt[0].allocations.length};
 }),{message:true,gone:true,deposit:400,allocations:0});

 eq('CSV для QuickBooks: квитанция с заказом и депозитом, аннулированная — со статусом Void и причиной',await t.p.evaluate(()=>{
  finCleanup();const {cust,o}=finFixture({code:'QACSV',legalName:'QA CSV, Ltd'});
  DB.receipt.push(normalizeReceipt({number:'R-0001',date:'2026-09-20',customerId:cust.id,method:'cheque',reference:'#1042',amount:500,allocations:[{orderId:o.id,amount:200}]}));
  DB.receipt.push(normalizeReceipt({number:'R-0002',date:'2026-09-21',customerId:cust.id,method:'cash',amount:50,voided:true,voidReason:'Duplicate'}));
  const lines=finReceiptsCsv(DB.receipt).split('\r\n');
  return {head:lines[0],first:lines[1]===['R-0001','2026-09-20','"QA CSV, Ltd"','QACSV','Cheque','#1042','500.00','200.00',o.businessNumber+': 200.00','300.00','Active','',''].join(','),second:lines[2]};
 }),{head:'Receipt No,Date,Customer,Customer Account,Method,Reference,Amount,Applied,Applied To Orders,On Account,Status,Void Reason,Note',first:true,second:'R-0002,2026-09-21,"QA CSV, Ltd",QACSV,Cash,,50.00,0.00,,0.00,Void,Duplicate,'});

 eq('Proforma: «Paid to date» и «Balance due» в итогах, депозит к оплате уменьшается на внесённое',await t.p.evaluate(()=>{
  finCleanup();const {cust,o,total}=finFixture(),part=finMoney(total*.2),dep=salesMoney(total*.5);
  DB.receipt.push(normalizeReceipt({number:'R-0001',customerId:cust.id,amount:part,allocations:[{orderId:o.id,amount:part}]}));
  salesOrderEdit(o.id);
  const m=docBuildModel('proforma',soDraft),paid=m.end.paid.map(x=>x.label+'='+x.value),deposit=m.end.deposit.map(x=>x.label+'='+x.value);
  const printed=docLayout(m).some(p=>p.items.some(x=>x.t==='text'&&x.s==='Balance due'));
  DB.receipt[0]=normalizeReceipt({number:'R-0001',customerId:cust.id,amount:dep,allocations:[{orderId:o.id,amount:dep}]});
  const received=docBuildModel('proforma',soDraft).end.deposit.map(x=>x.label),off=docBuildModel('proforma',soDraft,{receipts:false}).end.paid;
  soEdit=null;soDraft=null;
  return {paid:paid[0]==='Paid to date · 1 receipt='+docMoney(part)&&paid[1]==='Balance due='+docMoney(salesMoney(total-part)),deposit:deposit[0]==='Deposit due now · 50%='+docMoney(salesMoney(dep-part)),printed,received,off};
 }),{paid:true,deposit:true,printed:true,received:['Deposit received · 50%'],off:null});

 eq('Export/Import JSON несёт квитанции, не массив — понятная ошибка; клиента с оплатами не удалить',await t.p.evaluate(()=>{
  finCleanup();const {cust,o}=finFixture();
  DB.receipt.push(normalizeReceipt({number:'R-0001',customerId:cust.id,amount:120,allocations:[{orderId:o.id,amount:120}]}));
  const next=prepareImportedState(JSON.parse(JSON.stringify(DB)));
  let error='';try{prepareImportedState(Object.assign(JSON.parse(JSON.stringify(DB)),{receipt:{}}));}catch(e){error=e.message;}
  return {count:next.receipt.length,alloc:next.receipt[0].allocations[0].amount,error,blocked:customerHasReferences(cust.id)};
 }),{count:1,alloc:120,error:'The "receipt" field must be an array.',blocked:true});

 eq('экран Finance, форма оплаты и окно зачёта — без русского текста',await t.p.evaluate(()=>{
  finCleanup();const {cust,o}=finFixture();DB.receipt.push(normalizeReceipt({number:'R-0001',customerId:cust.id,amount:10}));
  tab='finance';finSetTab('receipts');let text=document.getElementById('app').innerText;
  finNewReceipt(cust.id);text+=document.getElementById('app').innerText;
  finSetTab('accounts');text+=document.getElementById('app').innerText;
  finOpenApply(cust.id,o.id);text+=document.querySelector('.fin-modal').innerText;finCloseApply();
  finCleanup();render();
  return /[А-яЁё]/.test(text);
 }),false);
 eq('Finance не дал ошибок страницы',t.errs,[]);
 await t.c.close();
};
