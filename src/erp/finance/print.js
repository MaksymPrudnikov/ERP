/* =====================================================================
   erp/finance/print  ·  finance-1.1
   Бланки денег: квитанция клиенту, выписка по счёту клиента и внутренний
   список сроков оплаты. Те же листы Letter, что Proforma: шапка компании,
   ячейки, таблица, итог справа — из них и печать, и PDF для письма.
   IN : DB.receipt, DB.refund, DB.salesOrder, DB.customer, DB.company
   OUT: листы (docPage) для docPageSVG / docPdfBytes
   Правило: сумм здесь не считают — только читают finance/data и ledger.
   ===================================================================== */

function finDocBase(title,docName,number,c){
 const company=DB.company||{};
 return {company:docCompanyBlock(),title,docName,number,customerName:c?(c.legalName||c.displayName||''):'',po:'',meta:[],boxes:[],cols:[],rows:[],empty:'',end:null,
  footerLeft:company.footerText||'',footerRight:''};
}
function finDocAddress(c){return c?docAddressText(customerAddressByType(c,'billing')):'';}
/* Таблица бланка: строка — одна линия текста, лист кончается между строками. */
function finDocLayout(m){
 const W=DOC_PAGE,C=DOC_COLOR,pages=[];let P=null,y=0,top=0;
 const head=()=>{m.cols.forEach(c=>docLabel(P,c.x,y+6,c.label,{align:c.align||'left'}));P.line(W.left,y+11,W.right,y+11,{stroke:C.navy,lw:1.3});y+=16;};
 const start=()=>{P=docPage();pages.push(P);y=pages.length===1?docHeader(P,m):docContHeader(P,m);if(m.cols.length)head();top=y;};
 start();
 m.rows.forEach(r=>{
  const h=15;if(y+h>W.bottom&&y>top+1)start();
  r.cells.forEach((v,i)=>{const c=m.cols[i];if(!c)return;P.text(c.x,y+10.5,docFit(String(v==null?'':v),7.8,!!c.bold,c.w),{size:7.8,bold:!!c.bold,align:c.align||'left',color:r.due&&c.due?C.due:C.ink});});
  P.line(W.left,y+h,W.right,y+h,{stroke:C.line,lw:.5});y+=h;
 });
 if(!m.rows.length&&m.empty){P.text(W.left,y+12,m.empty,{size:7.8,color:C.mut});y+=18;}
 if(m.end){const b=docEndBlock(m);if(y+b.h>W.bottom&&y>top+1)start();b.draw(P,y);y+=b.h;}
 const N=pages.length;
 pages.forEach((pg,i)=>{
  const label='Page '+(i+1)+' of '+N;
  pg.items.forEach(x=>{if(x.pageLabel)x.s=label;});
  pg.line(W.left,W.footer-9,W.right,W.footer-9,{stroke:C.line,lw:.5});
  if(m.footerLeft)pg.text(W.left,W.footer,docFit(m.footerLeft,6.8,false,240),{size:6.8,color:C.faint});
  pg.text(W.right,W.footer,[m.footerRight,label].filter(Boolean).join(' · '),{size:6.8,color:C.faint,align:'right'});
 });
 return pages;
}
function finDocText(pages){return (pages||[]).flatMap(p=>p.items.filter(x=>x.t==='text').map(x=>x.s)).join(' ');}

/* Оплачено по заказу на момент этой квитанции: более поздние оплаты в её
   «остаток после» не входят, иначе старая квитанция врала бы задним числом. */
function finOrderPaidThrough(orderId,receipt){
 const key=r=>r.date+'|'+r.number,upTo=key(receipt);
 return finMoney((DB.receipt||[]).filter(r=>(!r.voided||r.id===receipt.id)&&finCurrency(r)===finCurrency(receipt)&&key(r)<=upTo)
  .reduce((s,r)=>s+r.allocations.filter(a=>a.orderId===orderId).reduce((t,a)=>t+a.amount,0),0));
}
function finReceiptDoc(id){
 const r=(DB.receipt||[]).find(x=>x.id===id);if(!r)return [];
 const c=salesFindCustomer(r.customerId),refunded=finRefunded(r.id),money=docMoney;
 const m=finDocBase(r.voided?'VOID RECEIPT':'PAYMENT RECEIPT','Receipt',r.number,c);
 m.meta=[{label:'Date',value:docDate(r.date)},{label:'Method',value:finMethodLabel(r.method)},{label:'Reference',value:r.reference||'—'},{label:'Account',value:c&&c.code||'—'},{label:'Currency',value:finCurrency(r)}];
 m.boxes=[{label:'Received from',title:m.customerName||'—',lines:[finDocAddress(c)].filter(Boolean)}];
 m.cols=[{label:'Order',x:36,w:80,bold:true},{label:'Customer PO',x:124,w:150},{label:'Order total',x:372,w:90,align:'right'},{label:'This payment',x:474,w:90,align:'right'},{label:'Balance after',x:576,w:90,align:'right'}];
 m.rows=r.allocations.map(a=>{
  const o=(DB.salesOrder||[]).find(x=>x.id===a.orderId),total=o?finOrderBalance(o).total:null;
  return {cells:[finOrderNumber(a.orderId),o&&o.customerPo||'—',money(total),money(a.amount),total==null?'—':money(Math.max(0,finMoney(total-finOrderPaidThrough(a.orderId,r))))]};
 });
 m.empty='Not applied to an order: kept on account.';
 const rows=[{label:'Applied to orders',value:money(finReceiptApplied(r))}];
 if(refunded>0)rows.push({label:'Refunded',value:money(refunded)});
 if(!r.voided)rows.push({label:'Kept on account',value:money(finReceiptOnAccount(r))});
 m.end={left:[r.voided?{label:'Void',text:r.voidReason||'Void'}:null,r.note?{label:'Note',text:r.note}:null].filter(Boolean),rows,grand:{label:'Amount received',value:money(r.amount)}};
 return finDocLayout(m);
}
/* Срок для клиента — без внутренних пометок вроде «Customer on hold». */
function finDueText(f){
 if(f.dueOn)return docDate(f.dueOn);
 const t=f.terms;return t.paymentMode==='credit'&&t.creditDays?'Net '+t.creditDays+' after pickup':'At pickup';
}
/* Выписка: открытые заказы и деньги на счёте. Свободный депозит здесь
   уменьшает итог — клиенту важна одна сумма, которую он должен. */
function finStatementDoc(customerId,today){
 const c=salesFindCustomer(customerId);if(!c)return [];
 const day=today||finToday(),money=docMoney,company=DB.company||{};
 const rows=(DB.salesOrder||[]).filter(o=>o.customerId===c.id&&finOrderCounts(o)).map(o=>({o,f:finOrderFinancial(o,day)})).filter(x=>x.f.b.balance>0)
  .sort((a,b)=>(a.f.dueOn||'9999').localeCompare(b.f.dueOn||'9999')||String(a.o.businessNumber).localeCompare(String(b.o.businessNumber)));
 const open=finMoney(rows.reduce((s,x)=>s+x.f.b.balance,0)),overdue=finMoney(rows.reduce((s,x)=>s+x.f.overdue,0)),dep=finCustomerDeposit(c.id),net=finMoney(open-dep);
 const m=finDocBase('STATEMENT','Statement',c.code||'—',c);m.numberLabel='Account';
 m.meta=[{label:'Statement date',value:docDate(day)},{label:'Terms',value:paymentTermsLabel(paymentTermsFrom(c))},{label:'Currency',value:'CAD'}];
 const limit=finCustomerAccount(c).creditLimit;if(limit!=null)m.meta.push({label:'Credit limit',value:money(limit)});
 m.boxes=[{label:'Bill to',title:m.customerName||'—',lines:[finDocAddress(c)].filter(Boolean)}];
 m.cols=[{label:'Order',x:36,w:58,bold:true},{label:'Customer PO',x:100,w:92},{label:'Billed',x:198,w:62},{label:'Due',x:266,w:100,due:true},{label:'Total',x:430,w:66,align:'right'},{label:'Paid',x:503,w:66,align:'right'},{label:'Balance',x:576,w:66,align:'right',bold:true,due:true}];
 m.rows=rows.map(({o,f})=>({due:f.overdue>0,cells:[o.businessNumber,o.customerPo||'—',docDate(finBillingDate(o))||'Not picked up',finDueText(f)+(f.overdue?' · overdue':''),money(f.b.total),money(f.b.paid),money(f.b.balance)]}));
 m.empty='No open orders.';
 const er=[{label:'Open orders',value:money(open)}];if(dep>0)er.push({label:'Payments on account',value:'-'+money(dep)});
 m.end={left:company.paymentInstructions?[{label:'Payment',text:company.paymentInstructions}]:[],rows:er,
  grand:net>=0?{label:'Balance due',value:money(net)}:{label:'Credit on account',value:money(-net)},paid:overdue>0?[{label:'Overdue',value:money(overdue),tone:'due'}]:null};
 return finDocLayout(m);
}
/* Внутренний список «кто и когда должен заплатить» — для обзвона. */
function finScheduleDoc(result,filter){
 const day=finToday(),money=docMoney,m=finDocBase('PAYMENTS DUE','Payments due',docDate(day),null);
 m.numberLabel='';m.customerName=finDueDescription(filter,result.range);m.footerLeft='';
 m.meta=[{label:'Selection',value:m.customerName},{label:'Orders',value:String(result.rows.length)},{label:'Customers',value:String(result.customers)},{label:'Currency',value:'CAD'}];
 m.cols=[{label:'Due',x:36,w:62,due:true},{label:'Customer',x:104,w:124,bold:true},{label:'Order · PO',x:234,w:106},{label:'Terms',x:346,w:88},{label:'Timing',x:440,w:76,due:true},{label:'Outstanding',x:576,w:56,align:'right',bold:true}];
 m.rows=result.rows.map(x=>({due:x.days!=null&&x.days<0,cells:[x.f.dueOn?docDate(x.f.dueOn):finDueText(x.f),finCustomerName(x.c),x.o.businessNumber+(x.o.customerPo?' · '+x.o.customerPo:''),paymentTermsLabel(x.f.terms),finDueTiming(x),money(x.f.b.balance)]}));
 m.empty='No unpaid orders in this selection.';
 m.end={left:[],rows:[],grand:{label:'Outstanding',value:money(result.total)}};
 return finDocLayout(m);
}
