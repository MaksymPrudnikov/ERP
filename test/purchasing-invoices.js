/* Supplier money stays isolated from customer money. Check currencies,
   multi-PO invoices, historical payment facts, corrections and real forms. */
module.exports=async function({page,eq}){
 console.log('supplier invoices');const t=await page(undefined,{width:1440,height:1000});await t.p.waitForFunction(()=>storageWriter&&!storageStarting);
 await t.p.evaluate(()=>{
  DB.purchaseInvoice=[];DB.purchaseInvoiceSeq=0;DB.purchasePayment=[];DB.purchasePaymentSeq=0;DB.purchaseOrder=[];DB.purchaseOrderSeq=0;DB.purchasingEvent=[];DB.supplier=[];
  window.piSupplier=purSupplierSave({name:'North Glass',currency:'USD',paymentDays:30,paymentMethod:'Bank transfer'}).value;
  window.piPO1=purOrderSave({supplierId:piSupplier.id,supplierName:piSupplier.name,currency:'USD',lines:[{id:'a',description:'Glass',qty:5,price:100}]}).value;
  window.piPO2=purOrderSave({supplierId:piSupplier.id,supplierName:piSupplier.name,currency:'USD',lines:[{id:'b',description:'Sealant',qty:1,price:100}]}).value;
  window.piSave=x=>purMoneySave('invoice',Object.assign({supplierId:piSupplier.id,supplierName:piSupplier.name,currency:'USD',date:'2026-10-01',dueDate:'2026-10-31'},x));
  window.piPay=(invoice,amount,extra)=>purMoneySave('payment',Object.assign({invoiceId:invoice.id,supplierId:invoice.supplierId,supplierName:invoice.supplierName,currency:invoice.currency,date:'2026-10-13',method:'Bank transfer',amount},extra||{}));
  window.piClient=JSON.stringify({receipt:DB.receipt,salesOrder:DB.salesOrder,credit:DB.creditNote,qb:DB.qbExport,glassSheet:DB.glassSheet});
  window.piInv=piSave({invoiceNumber:'INV-100',amount:1000,poIds:[piPO1.id,piPO2.id]}).value;
  window.piInv2=piSave({invoiceNumber:'INV-200',amount:200,poIds:[piPO1.id],dueDate:'2026-10-10'}).value;
  window.piCAD=piSave({invoiceNumber:'CAD-1',amount:300,currency:'CAD',dueDate:'2026-11-15'}).value;
 });
 eq('one invoice links several POs and several invoices link one PO without duplicating the amount',await t.p.evaluate(()=>({first:purInvoicesForPO(piPO1.id).map(d=>d.invoiceNumber),second:purInvoicesForPO(piPO2.id).map(d=>d.invoiceNumber),usd:purSupplierAccounts().find(a=>a.currency==='USD').invoiced})),{first:['INV-100','INV-200'],second:['INV-100'],usd:1200});
 eq('partial payment and overdue balance use the invoice due date',await t.p.evaluate(()=>{
  window.piPayment1=piPay(piInv,300).value;const b=purInvoiceBalance(piInv),a=purSupplierAccounts('2026-11-01').find(a=>a.currency==='USD');return {status:purInvoiceStatus(piInv),paid:b.paid,balance:b.balance,overdue:a.overdue,net30:purInvoiceDue('2026-10-01',30)};
 }),{status:'Partially paid',paid:300,balance:700,overdue:900,net30:'2026-10-31'});
 eq('split payments with different methods close an invoice at the full amount',await t.p.evaluate(()=>{
  window.piPayment2=piPay(piInv,700,{method:'Cheque',reference:'CH-77'}).value;return {state:purInvoiceStatus(piInv),balance:purInvoiceBalance(piInv).balance,methods:purInvoicePayments(piInv.id).map(d=>d.method)};
 }),{state:'Paid',balance:0,methods:['Bank transfer','Cheque']});
 eq('overpayment warns but records the real amount as supplier credit',await t.p.evaluate(()=>{
  const d={invoiceId:piInv2.id,supplierId:piSupplier.id,supplierName:piSupplier.name,currency:'USD',amount:250},warn=purMoneyWarnings('payment',d);window.piOver=purMoneySave('payment',d).value;
  return {warning:warn.some(x=>x.includes('exceeds')),paid:purInvoiceBalance(piInv2).paid,balance:purInvoiceBalance(piInv2).balance,status:purInvoiceStatus(piInv2)};
 }),{warning:true,paid:250,balance:-50,status:'Overpaid'});
 eq('USD and CAD remain separate supplier balances, including credit',await t.p.evaluate(()=>purSupplierAccounts('2026-11-01').map(a=>[a.currency,a.invoiced,a.paid,a.balance,a.overdue]).sort()),[['CAD',300,0,300,0],['USD',1200,1250,-50,0]]);
 eq('changing invoice currency keeps old payment currency and requires review instead of guessing FX',await t.p.evaluate(()=>{
  const d=purClone(purMoneyFind('invoice',piInv.id));d.currency='CAD';const changed=purMoneySave('invoice',d).value,b=purInvoiceBalance(changed),accounts=purSupplierAccounts().map(a=>[a.currency,a.balance]).sort();
  const result={status:purInvoiceStatus(changed),balance:b.balance,review:b.review,payment:purMoneyFind('payment',piPayment1.id).currency,accounts,warn:purMoneyWarnings('invoice',changed).some(s=>s.includes('keep their currency'))};
  purMoneySave('invoice',Object.assign(purClone(changed),{currency:'USD'}));return result;
 }),{status:'Review payments',balance:null,review:true,payment:'USD',accounts:[['CAD',1300],['USD',-1050]],warn:true});
 eq('changing invoice supplier does not move a historical payment to another supplier',await t.p.evaluate(()=>{
  const d=purClone(purMoneyFind('invoice',piInv.id));d.supplierId='';d.supplierName='Another company';const changed=purMoneySave('invoice',d).value;
  const result={balance:purInvoiceBalance(changed).balance,original:purMoneyFind('payment',piPayment1.id).supplierId===piSupplier.id,accounts:purSupplierAccounts().filter(a=>a.currency==='USD').map(a=>[a.supplierName,a.balance]).sort()};
  purMoneySave('invoice',Object.assign(purClone(changed),{supplierId:piSupplier.id,supplierName:piSupplier.name}));return result;
 }),{balance:null,original:true,accounts:[['Another company',1000],['North Glass',-1050]]});
 eq('deleting a paid invoice preserves payment credit, and restore reverses the balance change',await t.p.evaluate(()=>{
  const inv=purMoneyFind('invoice',piInv2.id);purMoneyUndo('invoice',inv.id,inv.rev,false);const balance=purSupplierAccounts().find(a=>a.currency==='USD').balance,payment=!!purMoneyFind('payment',piOver.id)&&!purMoneyFind('payment',piOver.id).voidAt;
  purMoneyUndo('invoice',inv.id,inv.rev,true);return {balance,payment,restored:purSupplierAccounts().find(a=>a.currency==='USD').balance,events:purHistory('invoice',inv.id).map(e=>e.what).slice(0,2)};
 }),{balance:-250,payment:true,restored:-50,events:['Restored','Deleted']});
 eq('payment Undo / Restore recalculates payable and keeps the same payment number',await t.p.evaluate(()=>{
  const p=purMoneyFind('payment',piOver.id),number=p.number;purMoneyUndo('payment',p.id,p.rev,false);const balance=purInvoiceBalance(piInv2).balance;purMoneyUndo('payment',p.id,p.rev,true);
  return {balance,restored:purInvoiceBalance(piInv2).balance,same:p.number===number,events:purHistory('payment',p.id).map(e=>e.what)};
 }),{balance:200,restored:-50,same:true,events:['Restored','Undone','Created']});
 eq('supplier advances without an invoice, credit invoices and refunds keep their signed amounts',await t.p.evaluate(()=>{
  const advance=purMoneySave('payment',{supplierId:piSupplier.id,supplierName:piSupplier.name,currency:'CAD',amount:150,method:'Card'});
  const credit=piSave({invoiceNumber:'CREDIT-1',amount:-50}).value,refund=piPay(credit,-20,{method:'Refund'});
  return {allowed:advance.ok&&refund.ok,cad:purSupplierAccounts().find(a=>a.currency==='CAD').balance,credit:purInvoiceBalance(credit).balance,status:purInvoiceStatus(credit),usd:purSupplierAccounts().find(a=>a.currency==='USD').balance};
 }),{allowed:true,cad:150,credit:-30,status:'Credit',usd:-80});
 eq('unknown invoice and payment amounts stay incomplete and never become a false zero',await t.p.evaluate(()=>{
  const inv=piSave({amount:''}).value,payment=piPay(inv,'').value,a=purSupplierAccounts().find(a=>a.currency==='USD');
  const result={invoice:inv.amount,payment:payment.amount,balance:a.balance,known:a.knownBalance,unknown:a.unknown,status:purInvoiceStatus(inv)};
  purMoneySave('invoice',Object.assign(purClone(inv),{amount:40}));purMoneySave('payment',Object.assign(purClone(payment),{amount:10}));return result;
 }),{invoice:null,payment:null,balance:null,known:-80,unknown:2,status:'Amount needed'});
 eq('duplicate supplier invoice numbers warn without blocking and a one-off shop needs no supplier card',await t.p.evaluate(()=>{
  const d=purMoneyClean({supplierId:piSupplier.id,supplierName:piSupplier.name,invoiceNumber:'INV-100',amount:20}),warn=purMoneyWarnings('invoice',d).some(s=>s.includes('already recorded')),a=purMoneySave('invoice',d),cards=DB.supplier.length,b=purMoneySave('invoice',{supplierName:'One-off web store',amount:15,currency:'USD'});
  return {warn,allowed:a.ok&&b.ok,noCard:DB.supplier.length===cards,po:b.value.poIds};
 }),{warn:true,allowed:true,noCard:true,po:[]});
 eq('supplier invoices and payments have not changed customer Finance, QuickBooks or inventory data',await t.p.evaluate(()=>piClient===JSON.stringify({receipt:DB.receipt,salesOrder:DB.salesOrder,credit:DB.creditNote,qb:DB.qbExport,glassSheet:DB.glassSheet})),true);
 eq('failed money storage rolls back amounts, events and numbering; stale forms cannot overwrite a payment',await t.p.evaluate(()=>{
  const before=JSON.stringify(DB),seq=DB.purchaseInvoiceSeq,set=Storage.prototype.setItem;let r;Storage.prototype.setItem=function(k,v){if(k===STORAGE_KEY)throw new Error('Quota test');return set.call(this,k,v);};try{r=piSave({amount:12});}finally{Storage.prototype.setItem=set;}
  const same=JSON.stringify(DB)===before,retry=piSave({amount:12}),p=purClone(purMoneyFind('payment',piPayment1.id));purMoneySave('payment',Object.assign({},p,{note:'Fresh'}));const stale=purMoneySave('payment',Object.assign({},p,{note:'Old'}));
  return {refused:!r.ok,same,next:retry.value.number==='PI-'+String(seq+1).padStart(4,'0'),stale:!stale.ok,note:purMoneyFind('payment',p.id).note};
 }),{refused:true,same:true,next:true,stale:true,note:'Fresh'});
 eq('supplier ledger survives Export / Import including corrections and historical currencies',await t.p.evaluate(()=>{
  const e=prepareImportedState(storageExportEnvelope()),canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
  return ['purchaseInvoice','purchasePayment','purchaseInvoiceSeq','purchasePaymentSeq','purchasingEvent'].every(k=>JSON.stringify(canonical(e[k]))===JSON.stringify(canonical(DB[k])));
 }),true);
 eq('bad amounts and malformed imported supplier records are rejected before changing the database',await t.p.evaluate(()=>{
  const before=JSON.stringify(DB),d=purClone(DB.purchaseInvoice[0]),cases=[[d,d],[Object.assign({},d,{amount:'not money'})],[Object.assign({},d,{poIds:{bad:true}})]];
  return {bad:cases.map(purchaseInvoice=>{try{prepareImportedState({purchaseInvoice});return false;}catch(e){return true;}}),same:JSON.stringify(DB)===before};
 }),{bad:[true,true,true],same:true});
 eq('PO Customize can include shared supplier invoices and payments without adding currencies together',await t.p.evaluate(()=>{
  const texts=purDocPages(piPO1,{invoices:true,payments:true}).flatMap(p=>p.items).filter(x=>x.t==='text').map(x=>x.s).join('\n');
  return {invoice:texts.includes('INV-100'),shared:texts.includes('shared across 2 POs'),payment:texts.includes(piPayment1.number)&&texts.includes('300.00 USD')};
 }),{invoice:true,shared:true,payment:true});
 await t.p.evaluate(()=>{tab='purchasing';purMoneyEdit('invoice','');});
 await t.p.locator('#pur_money_supplierName').fill('Local shop form');await t.p.locator('#pur_money_invoiceNumber').fill('STORE-1');await t.p.locator('#pur_money_date').fill('2026-10-13');await t.p.locator('#pur_money_amount').fill('123.45');await t.p.locator('#pur_money_paymentDays').fill('30');
 await t.p.getByRole('button',{name:'Use payment terms',exact:true}).click();
 await t.p.locator('#pur_invoice_add_po').selectOption(await t.p.evaluate(()=>piPO1.id));await t.p.locator('#pur_invoice_add_po').selectOption(await t.p.evaluate(()=>piPO2.id));await t.p.locator('[data-pur-money-save]').click();
 eq('real invoice form retains a one-off supplier, multiple POs, amount and editable payment terms',await t.p.evaluate(()=>({supplier:purMoneyDraft.data.supplierName,amount:purMoneyDraft.data.amount,due:purMoneyDraft.data.dueDate,po:purMoneyDraft.data.poIds.length,number:purMoneyDraft.data.invoiceNumber})),{supplier:'Local shop form',amount:123.45,due:'2026-11-12',po:2,number:'STORE-1'});
 await t.p.setViewportSize({width:390,height:844});eq('supplier invoice form fits phone width',await t.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await t.p.setViewportSize({width:1440,height:1000});
 await t.p.getByRole('button',{name:'Record payment',exact:true}).click();await t.p.locator('#pur_money_amount').fill('120');await t.p.locator('#pur_money_method').fill('Card');await t.p.locator('[data-pur-money-save]').click();
 eq('Record payment opens the linked invoice and saves a partial payment without initiating a transfer',await t.p.evaluate(()=>{const d=purMoneyDraft.data,inv=purMoneyFind('invoice',d.invoiceId);return {amount:d.amount,method:d.method,invoice:inv.invoiceNumber,balance:purInvoiceBalance(inv).balance,state:purInvoiceStatus(inv)};}),{amount:120,method:'Card',invoice:'STORE-1',balance:3.45,state:'Partially paid'});
 eq('payables has separate currency rows and its own supplier filter; history opens invoices and payments',await t.p.evaluate(()=>{
  purGo('payables');salesListSetFilter('supplierName',{values:['Local shop form']});const rows=salesListRows(purMoneyInfos());salesListClearAll();const scope=salesListScope();purGo('history');const history=document.querySelector('.purchasing-workspace').textContent;purHistoryOpen('invoice',piInv.id);const invoice=purMoneyDraft.data.id===piInv.id;purHistoryOpen('payment',piPayment1.id);
  return {scope,count:rows.length,balance:rows[0].account.balance,history:history.includes('Supplier payment')&&history.includes('Supplier invoice'),invoice,payment:purMoneyDraft.data.id===piPayment1.id};
 }),{scope:'purchasing-payables',count:1,balance:3.45,history:true,invoice:true,payment:true});
 eq('supplier ledger pages have no JavaScript errors',t.errs,[]);await t.c.close();
};
