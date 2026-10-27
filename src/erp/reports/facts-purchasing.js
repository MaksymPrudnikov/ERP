/* =====================================================================
   reports/facts-purchasing  ·  facts-1.0
   Закупки в отчётах: строки PO, приёмки от поставщиков, счета и оплаты
   поставщикам.
   IN : DB.purchaseOrder, DB.purchaseReceipt, DB.purchaseInvoice,
        DB.purchasePayment, DB.supplier (erp/purchasing)
   OUT: repPurLineFacts · repPurReceiptFacts · repPurBillFacts
   Правило: файл ничего не рисует.

   План отчётов, часть «закупки» (владелец, 26.10.2026). Источники видит
   только тот, у кого в Users галочка Purchasing; цены видны.
   · Деньги — в валюте документа: CAD и USD не складываются (unitBy
     currency), разрез «Account» — поставщик · валюта.
   · Приёмка: бой — один раз, в строке приёмки, где его записали (у блока —
     в листах); замена (Replacement) — своя строка, новым приходом не
     считается. Опоздание — день приёмки против ожидаемой даты строки PO,
     потом самого PO.
   · Счёт — одна строка, сколько бы PO в нём ни было (PO — текстом), оплата
     — своя строка: сумма Balance по поставщику и валюте — его долг, как в
     Purchasing → Invoices.
   ===================================================================== */
let repPurCache={stamp:'',lines:null,receipts:null,bills:null};
function repPurStamp(){
 const t=a=>(a||[]).map(x=>x.id+':'+x.rev).join(',');
 return [finToday(),t(DB.purchaseOrder),t(DB.purchaseReceipt),t(DB.purchaseInvoice),t(DB.purchasePayment),t(DB.supplier)].join('|');
}
function repPur(){
 const stamp=readMemo('repPurStamp',[DB.purchaseOrder,DB.purchaseReceipt,DB.purchaseInvoice,DB.purchasePayment,DB.supplier],repPurStamp);
 if(repPurCache.stamp!==stamp)repPurCache={stamp,lines:null,receipts:null,bills:null};
 return repPurCache;
}
const REP_PUR_KINDS={glass:'Glass',sheet:'Glass',order:'For customer order',stock:'Material',other:'Other'};
function repPurUnit(u){const c=purUnit(u);if(!c)return '';if(c==='sqft')return 'ft²';const m=typeof mdUnit==='function'?mdUnit(c):null;return m?m.nameEn:c;}
/* Что куплено: стекло — из каталога, материал — его группа и имя. */
function repPurItem(l){
 const g=['glass','sheet'].includes(l.kind)?purGlassProduct(l):null,m=l.kind==='stock'?PUR_MATERIAL_TABLES.find(t=>t[0]===l.table):null;
 return {kind:REP_PUR_KINDS[l.kind]||'Other',group:g?'Glass':m?m[1]:REP_PUR_KINDS[l.kind]||'Other',item:g?g.name:l.description||'—',glass:g?g.code:'',mm:g&&g.thicknessMm||null,
  size:l.widthIn>0&&l.heightIn>0?l.widthIn+' × '+l.heightIn:''};
}
/* Листы строки: лист — штукой, блок — листами в блоке (если указано). */
function repPurSheets(unit,qty,perBlock){
 if(qty==null)return null;const u=purUnit(unit);
 return u==='sheet'?qty:u==='block'&&perBlock>0?qty*perBlock:null;
}
function repPurArea(sheets,w,h){return sheets!=null&&w>0&&h>0?sheets*w*h/144:null;}

/* Строка PO: заказано, пришло, осталось, сумма в валюте PO. */
function repPurLineFacts(){
 const c=repPur();if(c.lines)return c.lines;
 const today=finToday(),rows=[];
 (DB.purchaseOrder||[]).forEach(p=>{
  if(p.deletedAt)return;
  const supplier=purSupplierDisplay(p)||'Supplier not set',status=purOrderStatus(p),date=p.date||repDay(p.createdAt),open=!['Closed','Cancelled'].includes(status);
  p.lines.forEach(l=>{
   const b=purReceived(p,l),it=repPurItem(l),unit=repPurUnit(l.unit),expected=l.expectedDate||p.expectedDate||'';
   const remaining=open&&b.remaining!=null?Math.max(0,b.remaining):null,sheets=repPurSheets(l.unit,l.qty,l.sheetsPerBlock);
   rows.push(Object.assign({id:p.id+'|'+l.id,po:p.number,supplierId:p.supplierId,supplier,currency:p.currency,account:supplier+' · '+p.currency,status,date,expected,sent:repDay(p.sentAt),
    held:l.held?'Held at supplier':'Delivered to us',unit,price:l.price,priceUnit:repPurUnit(l.priceUnit||l.unit),
    qty:l.qty,received:b.unknown?null:b.received,remaining,waiting:remaining>0?1:0,overdue:remaining>0&&expected&&expected<today?1:0,
    replaceLeft:b.replaceLeft||0,amount:purLineTotal(l),unpriced:purLineTotal(l)==null?1:0,sheets,sheetFt2:repPurArea(sheets,l.widthIn,l.heightIn)},it));
  });
 });
 return c.lines=rows;
}
/* Строка приёмки: что пришло, бой, опоздание к ожидаемой дате. */
function repPurReceiptFacts(){
 const c=repPur();if(c.receipts)return c.receipts;
 const rows=[];
 (DB.purchaseReceipt||[]).forEach(r=>{
  if(r.voidAt)return;
  const p=r.poId?purOrderFind(r.poId):null,supplier=purSupplierDisplay(r)||(p&&purSupplierDisplay(p))||'Supplier not set',day=r.date||repDay(r.createdAt);
  r.lines.forEach(l=>{
   const pl=p&&p.lines.find(x=>x.id===l.poLineId),expected=pl&&pl.expectedDate||p&&p.expectedDate||r.expectedDate||'';
   const late=expected&&day?Math.max(0,repDaysBetween(expected,day)):null,state=!expected?'No expected date':late>0?'Late':'On time';
   const block=purUnit(l.unit)==='block',broken=block?l.damagedSheets:l.damaged!=null?l.damaged:l.damagedSheets,it=repPurItem(Object.assign({},pl||{},l));
   const sheets=l.actualSheets!=null?l.actualSheets:repPurSheets(l.unit,l.qty,pl&&pl.sheetsPerBlock),w=l.widthIn||pl&&pl.widthIn,h=l.heightIn||pl&&pl.heightIn;
   rows.push(Object.assign({id:r.id+'|'+l.id,receipt:r.number,po:p?p.number:'',supplierId:r.supplierId,supplier,at:day,expected,receivedBy:r.receivedBy||'',slip:r.packingSlip||'',
    unit:repPurUnit(l.unit),brokenUnit:repPurUnit(block?'sheet':l.unit),qty:l.qty,broken:broken||0,brokenLines:broken>0?1:0,reason:broken>0?l.reason||'No reason':'',resolution:broken>0?l.resolution||'Not set':'',
    arrival:l.replacement?'Replacement':'New',state,late:state==='Late'?1:0,onTimeN:state==='On time'?1:0,judgedN:expected?1:0,daysLate:late,
    sheets,sheetFt2:repPurArea(sheets,w,h)},it,{size:w>0&&h>0?w+' × '+h:it.size}));
  });
 });
 return c.receipts=rows;
}
/* Счёт поставщика и оплата — по строке. Balance счёта — его остаток;
   Net: счёт +, оплата − (сумма по поставщику и валюте — долг). */
function repPurBillFacts(){
 const c=repPur();if(c.bills)return c.bills;
 const today=finToday(),rows=[],name=d=>{const s=purSupplierFind(d.supplierId);return s?s.name:d.supplierName||'Supplier not set';},pos=ids=>ids.map(id=>{const p=purOrderFind(id);return p?p.number:'';}).filter(Boolean).join(', ');
 (DB.purchaseInvoice||[]).forEach(d=>{
  if(d.voidAt)return;
  const b=purInvoiceBalance(d),supplier=name(d),due=d.dueDate||purInvoiceDue(d.date,d.paymentDays),overdue=due&&due<today&&b.balance>0?b.balance:0;
  rows.push({id:d.id,kind:'Invoice',doc:(d.invoiceNumber||d.number)+' · '+supplier,number:d.number,supplierId:d.supplierId,supplier,currency:d.currency,account:supplier+' · '+d.currency,status:purInvoiceStatus(d),
   date:d.date||repDay(d.createdAt),due,pos:pos(d.poIds),poCount:d.poIds.length,method:'',invoiced:d.amount,paid:null,net:d.amount,balance:b.balance,overdue,overdueN:overdue>0?1:0,
   daysOverdue:overdue>0?repDaysBetween(due,today):null,daysToPay:null,amountNeeded:d.amount==null?1:0,invoices:1});
 });
 (DB.purchasePayment||[]).forEach(d=>{
  if(d.voidAt)return;
  const inv=d.invoiceId?purMoneyFind('invoice',d.invoiceId):null,supplier=name(d),day=d.date||repDay(d.createdAt);
  rows.push({id:d.id,kind:'Payment',doc:(d.reference||d.number)+' · '+supplier,number:d.number,supplierId:d.supplierId,supplier,currency:d.currency,account:supplier+' · '+d.currency,status:inv&&!inv.voidAt?'For an invoice':'On account',
   date:day,due:'',pos:inv?pos(inv.poIds):'',poCount:0,method:d.method||'',invoiced:null,paid:d.amount,net:d.amount==null?null:-d.amount,balance:null,overdue:0,overdueN:0,daysOverdue:null,
   daysToPay:inv&&inv.date&&day?repDaysBetween(inv.date,day):null,amountNeeded:d.amount==null?1:0,invoices:0});
 });
 return c.bills=rows;
}
