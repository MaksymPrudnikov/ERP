/* Счёт (Invoice) из ERP. Владелец, 7 октября 2026: «счёт выставляется только
   когда клиент получил последний юнит»; «у нас маленький штамп, но если будет
   PAID на бумаге — топ»; бухгалтер набирала счета в QuickBooks руками —
   «если сделаешь, будет отлично»; «для инвойса тоже конструктор». */
module.exports=async function({page,eq,ok}){
 console.log('invoice');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{};window.open=()=>({});
  window.ivShip=function(id,units,addr){
   const o=salesRecord(id),made=shippingCreate({customerId:o.customerId,method:'delivery',shipTo:{addressee:'Summit Builders · Tower B',address1:addr||'88 King St W',city:'Toronto',province:'ON',postalCode:'M5H 1A1'},date:finToday(),items:units.map(shippingItem),extras:[]});
   if(!made.ok)throw new Error(made.error);shippingMarkShipped(made.value.id);const out=shippingMarkDelivered(made.value.id,'Site foreman',finToday());return {ps:made.value,out};
  };
  window.ivOrder=function(extra){oqReset();const id=oqOrder(oqCustomer(Object.assign({legalName:'Summit Builders',paymentMode:'credit',creditDays:30},extra||{})),{delivery:'delivery',customerPo:'SB-2207'});salesDraftDrop();oqThrough(id,'ready');return id;};
  window.ivModel=function(id){tab='sales';salesOrderEdit(id);const m=docBuildModel('invoice',soDraft,docDefaultOptions('invoice'));return m;};
 });

 eq('счёт — только когда клиент получил последний юнит: после частичной доставки его нет, после последней — дата выдачи и Invoice в документах заказа; Shipping говорит «Invoice … ready»',await t.p.evaluate(()=>{
  const id=ivOrder(),o=salesRecord(id),units=shippingAvailable(o);
  const first=ivShip(id,units.slice(0,1));const part={date:finInvoiceDate(salesRecord(id)),kinds:(tab='sales',salesOrderEdit(id),docKindsFor(soDraft).map(d=>d.k))};salesDraftDrop();
  shippingResult(first.out);const partNote=shippingNotice.text.includes('Invoice');
  const last=ivShip(id,shippingAvailable(salesRecord(id)));shippingResult(last.out);const note=shippingNotice.text;
  salesOrderEdit(id);const kinds=docKindsFor(soDraft).map(d=>d.k);salesDraftDrop();tab='dashboard';render();
  return {partDate:part.date,partInvoice:part.kinds.includes('invoice'),partNote,date:finInvoiceDate(salesRecord(id))===finToday(),kinds,note:new RegExp('Delivered · Invoice '+salesRecord(id).businessNumber+' ready$').test(note)};
 }),{partDate:'',partInvoice:false,partNote:false,date:true,kinds:['workOrder','proforma','confirmation','invoice'],note:true});

 eq('бланк счёта: INVOICE, номер заказа, дата выдачи, срок оплаты Net 30, «Shipped to» — адрес объекта из PS, к оплате — остаток со сроком; без PAID',await t.p.evaluate(()=>{
  const id=ivOrder();ivShip(id,shippingAvailable(salesRecord(id)),'1450 Marine Dr');const m=ivModel(id),due=finAddDays(finToday(),30);
  const meta=Object.fromEntries(m.meta.map(x=>[x.label,x.value])),box=m.boxes.find(b=>b.label==='Shipped to'),dep=m.end.deposit[0];
  const out={title:m.title,number:m.number===salesRecord(id).businessNumber,date:meta['Invoice date']===docDate(finToday()),due:meta['Payment due']===docDate(due),box:box&&box.title+' | '+box.lines[0],
   deposit:dep.label===('Payment due '+docDate(due)+' · Net 30 days'),value:dep.value===docMoney(finOrderBalance(salesRecord(id)).total),stamp:m.stamp||null,signature:m.signature,footer:m.footerRight.endsWith('Invoice '+salesRecord(id).businessNumber)};
  salesDraftDrop();tab='dashboard';render();return out;
 }),{title:'INVOICE',number:true,date:true,due:true,box:'Summit Builders · Tower B | 1450 Marine Dr, Toronto, ON M5H 1A1',deposit:true,value:true,stamp:null,signature:'',footer:true});

 eq('оплачен полностью — отметка PAID с датой оплаты на бланке и в PDF, «Paid in full · thank you», без инструкций оплаты; письмо — «Paid in full»',await t.p.evaluate(()=>{
  const id=ivOrder();ivShip(id,shippingAvailable(salesRecord(id)));
  const before=(tab='sales',salesOrderEdit(id),docOpen('invoice'),docEmailBody());salesDraftDrop();
  oqPay(id);const m=ivModel(id),pages=docLayout(m),texts=pages.flatMap(p=>p.items.filter(x=>x.t==='text').map(x=>x.s));
  docOpen('invoice');const body=docEmailBody(),subject=docEmailSubject();docState=null;salesDraftDrop();tab='dashboard';render();
  return {stamp:m.stamp&&m.stamp.text,paidOn:!!(m.stamp&&m.stamp.sub),onPage:texts.includes('PAID'),deposit:m.end.deposit[0].label,instructions:m.end.left.some(x=>x.label==='Payment'),before:/Balance due: \$[\d,.]+ by \w+ \d+, \d{4} \(Net 30 days\)\./.test(before),after:body.includes('Paid in full. Thank you!'),subject:/^Invoice \d+ · PO SB-2207/.test(subject)};
 }),{stamp:'PAID',paidOn:true,onPage:true,deposit:'Paid in full · thank you',instructions:false,before:true,after:true,subject:true});

 eq('конструктор счёта: поля с подписями счёта (Invoice date, Payment due, Amount due and due date), подпись клиента выключена, инструкции оплаты включены; свой набор сохраняется по умолчанию',await t.p.evaluate(()=>{
  const labels=docFieldsFor('invoice').filter(f=>['date','dueDate','payment'].includes(f.k)).map(f=>f.label),base=docDefaultOptions('invoice');
  const id=ivOrder();ivShip(id,shippingAvailable(salesRecord(id)));tab='sales';salesOrderEdit(id);docOpen('invoice');docTogglePanel();
  const panel=[...document.querySelectorAll('.doc-panel .doc-opt span')].map(s=>s.firstChild&&s.firstChild.textContent).filter(Boolean);
  docSetOption('notes',false);docSaveDefault();const saved=DB.documentSettings.invoice&&DB.documentSettings.invoice.notes===false;normalizeDocumentSettings();const kept=DB.documentSettings.invoice.notes===false;
  delete DB.documentSettings.invoice;docState=null;salesDraftDrop();tab='dashboard';render();
  return {labels,signature:base.signature,instructions:base.paymentInstructions,head:panel.includes('Invoice date')&&panel.includes('Payment due'),saved,kept};
 }),{labels:['Invoice date','Payment due','Amount due and due date'],signature:false,instructions:true,head:true,saved:true,kept:true});

 eq('QuickBooks: новый счёт выгружается строкой Invoice (условия, PO, сумма, срок); после выгрузки — нет, правка PO — «Corrected»; счета до 7.10.2026 не выгружаются',await t.p.evaluate(()=>{
  const id=ivOrder();ivShip(id,shippingAvailable(salesRecord(id)));const o=salesRecord(id);
  const pend=()=>finExportPending().filter(x=>x.kind==='invoice').map(x=>x.state);
  const first=pend(),csv=finMovementsCSV([],[],null,[o]).split('\r\n')[1];
  const out=finPersist(()=>finExportMark(finExportPending()));const after=pend();
  o.customerPo='SB-2207-A';const changed=pend();o.customerPo='SB-2207';
  const old=ivOrder();ivShip(old,shippingAvailable(salesRecord(old)));salesRecord(old).statusDates.done='2026-10-01T12:00:00.000Z';const before=finExportPending().filter(x=>x.kind==='invoice'&&x.x.id===old).length;
  return {first,ok:out.ok,after,changed,before,row:csv.includes(',Invoice,')&&csv.includes('Net 30 days')&&csv.includes('SB-2207')&&csv.includes('Due '+finAddDays(finToday(),30))};
 }),{first:['new'],ok:true,after:[],changed:['changed'],before:0,row:true});

 eq('Finance → Due dates: у выданного заказа кнопка Invoice открывает бланк счёта',await t.p.evaluate(()=>{
  const id=ivOrder();ivShip(id,shippingAvailable(salesRecord(id)));tab='finance';finSetTab('schedule');
  const btn=document.querySelector('[data-fin-invoice="'+salesRecord(id).businessNumber+'"]');if(!btn)return 'no button';btn.click();
  const out={tab,kind:docState&&docState.kind,order:soDraft&&soDraft.id===id};docState=null;salesDraftDrop();tab='dashboard';render();return out;
 }),{tab:'sales',kind:'invoice',order:true});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
