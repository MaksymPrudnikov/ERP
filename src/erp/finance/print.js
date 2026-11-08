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
/* Таблицы бланка: строка — одна линия текста, лист кончается между строками,
   на новом листе заголовок таблицы повторяется. Таблиц может быть несколько
   (m.sections) — у выписки это заказы и движение денег. */
function finDocLayout(m){
 const W=DOC_PAGE,C=DOC_COLOR,pages=[];let P=null,y=0,top=0,cur=null;
 const sections=m.sections||[{cols:m.cols,rows:m.rows,empty:m.empty}];
 const head=()=>{if(!cur||!cur.cols.length)return;cur.cols.forEach(c=>docLabel(P,c.x,y+6,c.label,{align:c.align||'left'}));P.line(W.left,y+11,W.right,y+11,{stroke:C.navy,lw:1.3});y+=16;};
 const start=()=>{P=docPage();pages.push(P);y=pages.length===1?docHeader(P,m):docContHeader(P,m);head();top=y;};
 start();
 sections.forEach((sec,si)=>{
  cur=null;if(y+(sec.title?22:0)+31>W.bottom&&y>top+1)start();
  if(sec.title){y+=si?10:0;P.text(W.left,y+11,sec.title,{size:9,bold:true,color:C.navy});y+=18;}
  cur=sec;head();
  sec.rows.forEach(r=>{
   const h=finDocRowH(r);if(y+h+(r.group?15:0)>W.bottom)start();
   finDocRow(P,sec,r,y);y+=h;
  });
  if(!sec.rows.length&&sec.empty){P.text(W.left,y+12,sec.empty,{size:7.8,color:C.mut});y+=18;}
 });
 cur=null;
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
/* Строка таблицы бланка. Обычная — ячейки по колонкам; group — заголовок
   месяца; sub — подытог (Due now) красным; total — итог месяца под чертой. */
function finDocRowH(r){return r.group?14:r.sub?12:r.total?16:15;}
function finDocRow(P,sec,r,y){
 const W=DOC_PAGE,C=DOC_COLOR;
 if(r.group){P.text(W.left,y+10,r.group,{size:7.2,bold:true,color:C.navy});return;}
 if(r.sub){P.text(W.left+16,y+8.5,r.sub,{size:6.6,bold:true,color:C.due});P.text(W.right,y+8.5,r.value,{size:6.6,bold:true,color:C.due,align:'right'});P.line(W.left,y+12,W.right,y+12,{stroke:C.line,lw:.5});return;}
 if(r.total){P.line(W.left,y+2,W.right,y+2,{stroke:C.navy,lw:.5});P.text(W.left,y+11.5,r.total,{size:6.8,bold:true,color:C.navy});P.text(W.right,y+11.5,r.value,{size:6.8,bold:true,color:C.navy,align:'right'});return;}
 r.cells.forEach((v,i)=>{const c=sec.cols[i];if(!c)return;P.text(c.x,y+10.5,docFit(String(v==null?'':v),7.8,!!(c.bold||r.bold),c.w),{size:7.8,bold:!!(c.bold||r.bold),align:c.align||'left',color:r.hi||r.due&&c.due?C.due:r.mut?C.mut:C.ink});});
 P.line(W.left,y+15,W.right,y+15,{stroke:C.line,lw:.5});
}
/* Таблицы квитанции и выписки на листах шаблона формы (erp/documents/
   order-form): те же места, что у finDocLayout; шапка, итоги и низ — из
   шаблона. */
function finDocTable(f,m){
 const W=DOC_PAGE,C=DOC_COLOR;let cur=null;
 const sections=m.sections||[{cols:m.cols,rows:m.rows,empty:m.empty}];
 const head=()=>{if(!cur||!cur.cols.length)return;cur.cols.forEach(c=>docLabel(f.P,c.x,f.y+6,c.label,{align:c.align||'left'}));f.P.line(W.left,f.y+11,W.right,f.y+11,{stroke:C.navy,lw:1.3});f.y+=16;};
 const start=()=>{f.page();head();f.top=f.y;};
 sections.forEach((sec,si)=>{
  cur=null;if(f.y+(sec.title?22:0)+31>f.bottom&&f.y>f.top+1)start();
  if(sec.title){f.y+=si?10:0;f.P.text(W.left,f.y+11,sec.title,{size:9,bold:true,color:C.navy});f.y+=18;}
  cur=sec;head();
  sec.rows.forEach(r=>{
   const h=finDocRowH(r);if(f.y+h+(r.group?15:0)>f.bottom)start();
   finDocRow(f.P,sec,r,f.y);f.y+=h;
  });
  if(!sec.rows.length&&sec.empty){f.P.text(W.left,f.y+12,sec.empty,{size:7.8,color:C.mut});f.y+=18;}
 });
}
/* Квитанция и выписка — из шаблона формы (Data → Company & print → Forms),
   внутренние списки — прежней раскладкой. */
function finDocPages(m){return DOC_FORM_FIN.includes(m.kind)?docFormPages(m):finDocLayout(m);}
function finDocText(pages){return (pages||[]).flatMap(p=>p.items.filter(x=>x.t==='text').map(x=>x.s)).join(' ');}

/* Оплачено по заказу на момент этой квитанции: более поздние оплаты в её
   «остаток после» не входят, иначе старая квитанция врала бы задним числом. */
function finOrderPaidThrough(orderId,receipt){
 return finMoney((DB.receipt||[]).filter(r=>(!r.voided||r.id===receipt.id)&&finCurrency(r)===finCurrency(receipt)&&finDocOrder(r,receipt)<=0)
  .reduce((s,r)=>s+r.allocations.filter(a=>a.orderId===orderId).reduce((t,a)=>t+a.amount,0),0));
}
function finReceiptDoc(id){const m=finReceiptModel(id);return m?finDocPages(m):[];}
function finReceiptModel(id){
 const r=(DB.receipt||[]).find(x=>x.id===id);if(!r)return null;
 const c=salesFindCustomer(r.customerId),refunded=finRefunded(r.id),money=docMoney;
 const m=finDocBase(r.voided?'VOID RECEIPT':'PAYMENT RECEIPT','Receipt',r.number,c);m.kind='receipt';
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
 return m;
}
/* Срок для клиента — без внутренних пометок вроде «Customer on hold». */
function finDueText(f){
 if(f.dueOn)return docDate(f.dueOn);
 const t=f.terms,w=f.handover||'pickup';return t.paymentMode==='credit'&&t.creditDays?'Net '+t.creditDays+' after '+w:'At '+w;
}
function finSigned(v){return v<0?'-'+docMoney(-v):docMoney(v);}
const FIN_MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
function finPeriodText(from,to){
 if(from&&to){const a=finMonthRange(0,from);if(a.from===from&&a.to===to)return FIN_MONTH_NAMES[+from.slice(5,7)-1]+' '+from.slice(0,4);}
 return (from?docDate(from):'Start')+' – '+docDate(to||finToday());
}
/* Заказы выписки: выданные за период, ещё не оплаченные, оплаченные в этом
   периоде и заказы в работе, по которым уже внесли деньги. */
function finStatementOrders(customerId,from,to,today){
 const inPeriod=d=>!!d&&(!from||d>=from)&&(!to||d<=to);
 const paidIn=new Set(finActiveReceipts().filter(r=>r.customerId===customerId&&inPeriod(r.date)).flatMap(r=>r.allocations.map(a=>a.orderId)));
 /* Ушедшие в архив (erp/archive) — оплачены целиком: в выписке, если выданы
    или оплачены в этом периоде. */
 const old=typeof archiveLedgerFor==='function'?archiveLedgerFor(customerId).filter(e=>e.order&&(inPeriod(e.order.billed)||paidIn.has(e.id)||e.order.paidOn.some(inPeriod)))
  .map(e=>({o:{id:e.id,businessNumber:e.order.number,customerPo:e.order.po},f:e.order.f,billed:e.order.billed,archived:true})):[];
 return (DB.salesOrder||[]).filter(o=>o.customerId===customerId&&finOrderCounts(o)&&finCurrency(o)==='CAD').map(o=>({o,f:finOrderFinancial(o,today),billed:finBillingDate(o)}))
  .filter(x=>x.f.b.total!=null&&(x.f.b.status==='review'||x.f.b.balance>0||paidIn.has(x.o.id)||inPeriod(x.billed)||!x.billed&&x.f.b.paid>0)).concat(old)
  .sort((a,b)=>(a.billed||'9999').localeCompare(b.billed||'9999')||String(a.o.businessNumber).localeCompare(String(b.o.businessNumber)));
}
/* Выписка за период — клиенту раз в месяц для его учёта: какие заказы и на
   сколько, что он заплатил, остаток на начало и на конец периода. */
function finStatementDoc(customerId,from,to,today,due,activity){const m=finStatementModel(customerId,from,to,today,due,activity);return m?finDocPages(m):[];}
/* Due now (владелец 06.11.2026): бухгалтер выбирает, что выставить к оплате —
   счета до даты (неделя, понедельник…) и галочки по одному; выделены
   жёлтым, их сумма — Due now, остальное — Current. Было — в Excel руками. */
function finStatementDueOpen(x){return !x.archived&&!!x.billed&&x.f.b.status!=='review'&&x.f.b.balance>0;}
function finStatementDuePick(x,due){if(!due||!finStatementDueOpen(x))return false;const p=due.pick&&due.pick[x.o.id];return p!=null?!!p:!!due.by&&x.billed<=due.by;}
/* Дни просрочки и «к оплате сейчас»: просроченный счёт — всегда (он не
   может быть Current), ещё не просроченный — если его выбрал бухгалтер. */
function finStatementLate(x,day){return x.f.dueOn&&x.f.dueOn<day?Math.floor((Date.parse(day)-Date.parse(x.f.dueOn))/864e5):0;}
function finStatementNow(x,day,due){return finStatementDueOpen(x)&&(finStatementLate(x,day)>0||finStatementDuePick(x,due));}
/* Строки счетов по месяцам: заголовок месяца, счета, подытог Due now после
   последнего счёта к оплате, итог месяца. Заказы в работе — группой In work.
   Красные строки — всё к оплате сейчас; в подытог Due now — то же, что в
   ячейку Due now внизу (без 60+ и 90+, у них свои ячейки): сумма подытогов
   месяцев равна ячейке (владелец 07.11.2026). */
function finStatementRows(orders,day,due){
 const money=docMoney,groups=[];
 orders.forEach(x=>{const k=x.billed?x.billed.slice(0,7):'';let g=groups[groups.length-1];if(!g||g.k!==k)groups.push(g={k,list:[]});g.list.push(x);});
 const plural=(n,w)=>n+' '+w+(n===1?'':'s'),bal=l=>finMoney(l.filter(x=>x.f.b.status!=='review').reduce((s,x)=>s+x.f.b.balance,0));
 return groups.flatMap(g=>{
  const name=g.k?FIN_MONTH_NAMES[+g.k.slice(5,7)-1]+' '+g.k.slice(0,4):'In work',now=g.list.filter(x=>finStatementNow(x,day,due)),sub=now.filter(x=>finStatementLate(x,day)<60),last=sub[sub.length-1],out=[{group:name}];
  g.list.forEach(x=>{
   const d=finStatementDueOpen(x)?finStatementLate(x,day):0;
   out.push({hi:now.includes(x),due:d>0,mut:!x.billed,cells:[x.o.businessNumber,x.billed?docDate(x.billed):'In work',x.o.customerPo||'—',d>0?d+' d':'',money(x.f.b.total),x.f.b.status==='review'?'Review required':finSigned(x.f.b.balance)]});
   if(x===last)out.push({sub:'Due now · '+plural(sub.length,'invoice'),value:money(bal(sub))});
  });
  out.push({total:name+' · '+plural(g.list.length,g.k?'invoice':'order'),value:finSigned(bal(g.list))});
  return out;
 });
}
function finStatementModel(customerId,from,to,today,due,activity){
 const c=salesFindCustomer(customerId);if(!c)return null;
 const day=today||finToday(),money=docMoney,company=DB.company||{},d=finStatementData(c.id,from,to);
 const m=finDocBase('STATEMENT','Statement',c.code||'—',c);m.numberLabel='Account';m.kind='statement';
 m.meta=[{label:'Period',value:finPeriodText(from,to)},{label:'Statement date',value:docDate(day)},{label:'Terms',value:paymentTermsLabel(paymentTermsFrom(c))},{label:'Currency',value:'CAD'}];
 const limit=finCustomerAccount(c).creditLimit;if(limit!=null)m.meta.push({label:'Credit limit',value:money(limit)});
 m.boxes=[{label:'Bill to',title:m.customerName||'—',lines:[finDocAddress(c)].filter(Boolean)}];
 const orders=finStatementOrders(c.id,from,to,day);
 m.sections=[
  /* Счета как в таблице Spiel (владелец 06.11.2026): каждый один раз;
     к оплате сейчас — красным, сроки — в итогах внизу. 07.11.2026 — по
     месяцам с итогом, подытог Due now и колонка Days late. */
  {title:'Invoices',empty:'No invoices in this period.',cols:[{label:'Invoice No',x:36,w:70,bold:true},{label:'Date',x:112,w:74},{label:'Reference',x:192,w:180},{label:'Days late',x:432,w:50,align:'right',bold:true,due:true},{label:'Amount',x:486,w:80,align:'right'},{label:'Balance',x:576,w:80,align:'right',bold:true}],
   rows:finStatementRows(orders,day,due)},
  activity&&{title:'Account activity',empty:'',cols:[{label:'Date',x:36,w:58},{label:'Document',x:98,w:52,bold:true},{label:'Description',x:154,w:204},{label:'Charges',x:418,w:58,align:'right'},{label:'Payments',x:494,w:58,align:'right'},{label:'Balance',x:576,w:66,align:'right',bold:true}],
   rows:[{mut:true,cells:[from?docDate(from):'','','Balance forward','','',finSigned(d.opening)]}].concat(d.rows.map(l=>({due:l.overdue,cells:[docDate(l.date),l.doc,l.text,l.charge?money(l.charge):'',l.payment?money(l.payment):'',finSigned(l.balance)]})))}
 ].filter(Boolean);
 const left=[];if(company.paymentInstructions)left.push({label:'Payment',text:company.paymentInstructions});
 const review=orders.some(x=>x.f.b.status==='review');
 if(review)left.push({label:'Review required',text:'Negative order totals need review. Please contact us to resolve them.'});
 if(orders.some(x=>!x.billed))left.push({label:'In work',text:'Orders not yet picked up are billed on pickup.'+(d.prepaid>0?' '+money(d.prepaid)+' already paid on them is in the balance.':'')});
 const rows=[{label:'Balance forward',value:finSigned(d.opening)},{label:'Orders billed',value:money(d.billed)},{label:'Payments received',value:d.paid>0?'-'+money(d.paid):money(0)}];
 if(d.refunded>0)rows.push({label:'Refunds',value:money(d.refunded)});
 m.end={left,rows,grand:review&&d.closing<0?{label:'Review required',value:finSigned(d.closing)}:d.closing>=0?{label:'Balance due',value:money(d.closing)}:{label:'Credit balance',value:money(-d.closing)},paid:d.overdue>0?[{label:'Overdue now',value:money(d.overdue),tone:'due'}]:null};
 /* Итоги по срокам (как у Spiel, вместе — весь долг по счетам): просрочка
    90+ и 60+ дней; Due now — просроченное моложе 60 дней и выбранное
    бухгалтером; Current — остальное. */
 const open=orders.filter(finStatementDueOpen),late=x=>finStatementLate(x,day);
 if(open.length){
  const o90=open.filter(x=>late(x)>=90),o60=open.filter(x=>late(x)>=60&&late(x)<90),young=open.filter(x=>late(x)<60),now=young.filter(x=>late(x)>0||finStatementDuePick(x,due));
  const cur=young.filter(x=>!now.includes(x)),C=DOC_COLOR,n=l=>finMoney(l.reduce((s,x)=>s+x.f.b.balance,0));
  /* Полоса сроков (владелец 07.11.2026): доли долга цветом, проценты под ней. */
  const parts=[['Overdue 90+ days',o90,C.due],['Overdue 60+ days',o60,C.adj],['Due now',now,C.warn],['Current',cur,C.paid]].map(([label,l,color])=>({label,n:n(l),color}));
  m.summary=parts.map(p=>({label:p.label,value:money(p.n),mark:p.color}));
  const all=parts.reduce((s,p)=>s+p.n,0);
  if(all>0)m.summaryBar={parts,text:parts.filter(p=>p.n>0).map(p=>p.label.replace(' days','')+' '+Math.round(100*p.n/all)+'%').join(' · ')};
 }
 m.footerRight=finPeriodText(from,to);
 return m;
}
/* То же для учёта клиента в таблице: движение денег с остатком. */
function finStatementCSV(customerId,from,to){
 const d=finStatementData(customerId,from,to),kind={order:'Order',payment:'Payment',refund:'Refund'};
 return [['Date','Document','Type','Description','Charges','Payments','Balance']].concat([[from||'','','Balance forward','','','',d.opening.toFixed(2)]],
  d.rows.map(l=>[l.date,l.doc,kind[l.kind],l.text,l.charge?l.charge.toFixed(2):'',l.payment?l.payment.toFixed(2):'',l.balance.toFixed(2)]),
  [[to||'','','Closing balance','','','',d.closing.toFixed(2)]]).map(row=>row.map(finCsvCell).join(',')).join('\r\n');
}
/* Внутренний список «кто и когда должен заплатить» — для обзвона. Строки —
   те, что сейчас видны в таблице Due dates после фильтров колонок. */
function finScheduleDoc(rows,selection){
 const day=finToday(),money=docMoney,m=finDocBase('PAYMENTS DUE','Payments due',docDate(day),null),total=finMoney(rows.reduce((s,x)=>s+x.f.b.balance,0)),customers=new Set(rows.map(x=>x.o.customerId)).size;
 m.numberLabel='';m.customerName=selection||'All unpaid';m.footerLeft='';
 m.meta=[{label:'Selection',value:m.customerName},{label:'Orders',value:String(rows.length)},{label:'Customers',value:String(customers)},{label:'Currency',value:'CAD'}];
 m.cols=[{label:'Due',x:36,w:62,due:true},{label:'Customer',x:104,w:124,bold:true},{label:'Order · PO',x:234,w:106},{label:'Terms',x:346,w:88},{label:'Timing',x:440,w:76,due:true},{label:'Outstanding',x:576,w:56,align:'right',bold:true}];
 m.rows=rows.map(x=>({due:x.days!=null&&x.days<0,cells:[x.f.dueOn?docDate(x.f.dueOn):finDueText(x.f),finCustomerName(x.c),x.o.businessNumber+(x.o.customerPo?' · '+x.o.customerPo:''),paymentTermsLabel(x.f.terms),finDueTiming(x),money(x.f.b.balance)]}));
 m.empty='No unpaid orders in this selection.';
 m.end={left:[],rows:[],grand:{label:'Outstanding',value:money(total)}};
 return finDocLayout(m);
}
/* Балансы всех клиентов (или отфильтрованных) — кто сколько должен и чьи
   деньги у нас: предоплата по заказам в работе и свободный депозит. */
function finBalancesDoc(list,selection){
 const day=finToday(),money=docMoney,m=finDocBase('CUSTOMER BALANCES','Customer balances',docDate(day),null);
 const sum=k=>finMoney(list.reduce((s,x)=>s+x.m.money[k],0)),dash=v=>v>0?money(v):'—';
 m.numberLabel='';m.customerName=selection||'';m.footerLeft='';
 m.meta=[{label:'Date',value:docDate(day)},{label:'Selection',value:selection||'All'},{label:'Customers',value:String(list.length)},{label:'Currency',value:'CAD'}];
 m.cols=[{label:'Customer',x:36,w:150,bold:true},{label:'Terms',x:192,w:80},{label:'Balance',x:340,w:62,align:'right',bold:true},{label:'Overdue',x:400,w:56,align:'right',due:true},{label:'Prepaid',x:460,w:56,align:'right'},{label:'On account',x:518,w:56,align:'right'},{label:'Credit limit',x:576,w:54,align:'right'}];
 m.rows=list.map(({c,m:x})=>({due:x.money.overdue>0,cells:[finCustomerName(c)+(c.code?' · '+c.code:''),x.account.terms,dash(x.money.balance),dash(x.money.overdue),dash(x.money.prepaid),dash(x.money.deposit),x.account.creditLimit==null?'—':money(x.account.creditLimit)]}));
 m.empty='No customers in this selection.';
 m.end={left:[],rows:[{label:'Prepaid · orders in work',value:money(sum('prepaid'))},{label:'On account · not applied',value:money(sum('deposit'))}],grand:{label:'Customers owe',value:money(sum('balance'))},paid:sum('overdue')>0?[{label:'Overdue',value:money(sum('overdue')),tone:'due'}]:null};
 return finDocLayout(m);
}
