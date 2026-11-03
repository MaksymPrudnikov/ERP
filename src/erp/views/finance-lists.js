/* =====================================================================
   views/finance-lists  ·  finance-1.2
   Три таблицы Finance — Accounts, Due dates, Payments — на движке списка
   Sales: фильтр и поиск в каждой колонке, сортировка, выбор колонок, итоги
   строкой внизу, блок дат над таблицей как у Sales. Общей строки поиска нет
   (владелец, 28 сентября 2026: «пусть будет точно так же, как в Sales, по
   колонкам с фильтром и поиском»). Настройки каждой таблицы — свои.
   IN : finance/data, finance/ledger; движок — views/sales-list-ui
   ===================================================================== */
let finAccountAll=false;

function finListScope(){
 if(finTab==='accounts')return finAccountId?'':'finAccounts';
 if(finTab==='schedule')return 'finDue';
 if(finTab==='receipts')return finEdit===null?'finPayments':'';
 return '';
}
/* Колонки собираются при первом вызове: движок Sales (пресеты сроков)
   подключается позже этого файла. */
let finListCatalogCache=null;
function finListCatalog(){return finListCatalogCache||(finListCatalogCache={
 finAccounts:[
  {k:'customer',label:'Customer',type:'text',def:true},
  {k:'code',label:'Account',type:'text'},
  {k:'terms',label:'Terms',type:'list',def:true},
  {k:'balance',label:'Balance',type:'number',money:true,sum:true,def:true},
  {k:'overdue',label:'Overdue',type:'number',money:true,sum:true,def:true},
  {k:'prepaid',label:'Prepaid',type:'number',money:true,sum:true,def:true},
  {k:'deposit',label:'On account',type:'number',money:true,sum:true,def:true},
  {k:'limit',label:'Credit limit',type:'number',money:true,def:true},
  {k:'orders',label:'Open orders',type:'number',sum:true},
  {k:'state',label:'Status',type:'list'}
 ],
 finDue:[
  {k:'due',label:'Due',type:'date',def:true,presets:SALES_LIST_DUE_PRESETS,range:[['overdue','Overdue'],['next7','7 days'],['next30','30 days'],['','All']]},
  {k:'days',label:'Days to due',type:'number'},
  {k:'customer',label:'Customer',type:'text',def:true},
  {k:'order',label:'Order',type:'text',def:true},
  {k:'po',label:'PO',type:'text',def:true},
  {k:'terms',label:'Terms',type:'list',def:true},
  {k:'billed',label:'Picked up',type:'date'},
  {k:'total',label:'Total',type:'number',money:true,sum:true,def:true},
  {k:'paid',label:'Paid',type:'number',money:true,sum:true,def:true},
  {k:'balance',label:'Outstanding',type:'number',money:true,sum:true,def:true},
  {k:'status',label:'Status',type:'list',def:true}
 ],
 finPayments:[
  {k:'date',label:'Date',type:'date',def:true,range:[['last7','7 days'],['last30','30 days'],['thisMonth','This month'],['lastMonth','Last month'],['','All time']]},
  {k:'number',label:'Receipt',type:'text',def:true},
  {k:'customer',label:'Customer',type:'text',def:true},
  {k:'method',label:'Method',type:'list',def:true},
  {k:'reference',label:'Reference',type:'text',def:true},
  {k:'amount',label:'Amount',type:'number',money:true,sum:true,def:true},
  {k:'orders',label:'Applied to orders',type:'text',tokens:true,def:true},
  {k:'onAccount',label:'On account',type:'number',money:true,sum:true,def:true},
  {k:'refunded',label:'Refunded',type:'number',money:true,sum:true},
  {k:'status',label:'Status',type:'list'},
  {k:'qb',label:'QuickBooks',type:'list'}
 ]
});}
/* Строки текущей таблицы до фильтров колонок — для галочек в меню фильтра. */
function finListInfos(){const k=salesListScope();return k==='finAccounts'?finAccountInfos():k==='finDue'?finDueInfos():k==='finPayments'?finPaymentInfos():[];}
function finListColumns(){return finListCatalog()[salesListScope()]||[];}
function finListDateColumn(){return {finDue:'due',finPayments:'date'}[salesListScope()]||'';}
function finListDefaultSort(){return {finAccounts:{k:'balance',dir:'desc'},finDue:{k:'due',dir:'asc'},finPayments:{k:'date',dir:'desc'}}[salesListScope()]||null;}
/* Оплаты открываются за последние 30 дней, как Sales — за 14. */
function finListDefaults(){return salesListScope()==='finPayments'?{date:{preset:'last30'}}:{};}
/* Перейти к таблице с готовым фильтром — так работают четыре цифры сверху. */
function finListFocus(tabKey,filters,all){
 if(!finCanLeave())return;
 finDraft=null;finEdit=null;finAction=null;finAccountId='';finCustomerFilter='';finOrderFilter='';finTab=tabKey;if(all!=null)finAccountAll=all;salesListMenu=null;
 const p=salesListLoadPrefs();p.filters={};
 Object.entries(filters||{}).forEach(([k,f])=>{const c=salesListCleanFilter(k,f);if(c&&salesListFilterActive(c))p.filters[k]=c;});
 salesListSavePrefs();render();
}
function finMoneyText(v){return v>0?finFmt(v):'<span class="mut">—</span>';}
function finListTh(c){return salesListHead(c);}
/* Итог внизу: число строк и суммы денежных колонок — только строкой.
   Аннулированный (Void) платёж в итог не входит — его денег нет (проход
   11.10.2026: подвал Payments расходился с плитками и Reports). */
function finListFooter(all,cols,noun){
 const rows=all.filter(r=>!(r.r&&r.r.voided)),voids=all.length-rows.length;
 const first=cols.findIndex(c=>c.sum),lead=first<0?cols.length:first;
 const sums=cols.slice(lead).map(c=>{
  if(!c.sum)return '<td></td>';
  const total=rows.reduce((s,r)=>{const v=salesListValue(r,c.k);return v==null||v===''?s:s+Number(v);},0);
  return `<td class="n" data-sum="${c.k}">${c.money?finFmt(finMoney(total)):total.toLocaleString('en-US')}</td>`;
 }).join('');
 const count=`<b>${rows.length} ${noun}${rows.length===1?'':'s'}</b>${voids?` <span class="mut" data-foot-void>· ${voids} void not counted</span>`:''}`;
 return `<tfoot><tr class="sl-foot">${lead?`<td colspan="${lead}" class="sl-foot-head" data-foot-count>${count}</td>`:''}${sums}<td${lead?'':' data-foot-count'}>${lead?'':count}</td></tr></tfoot>`;
}
/* Списки Finance — вид Sales (этап 6, 03.11.2026): галочка строки, действия
   строки — сверху в шапке для отмеченной (r.acts: [label, onclick, атрибуты]),
   шестерёнка слева, ширина и порядок колонок, итог. */
let finSel='';
function finSelect(id,on){finSel=on?id:'';render();}
function finListTable(infos,cell,rowAttrs,noun,empty){
 const p=salesListLoadPrefs(),rows=salesListRows(infos),cols=salesListColumns();
 if(finSel&&!rows.some(r=>r.o.id===finSel))finSel='';
 const body=rows.map(r=>{const on=finSel===r.o.id;return `<tr ${rowAttrs(r)}${on?' data-fin-sel':''}><td class="sl-check" onclick="event.stopPropagation()"><input type="checkbox" aria-label="Select ${esc(String(r.memo.number||r.memo.customer||r.o.id))}" ${on?'checked':''} onchange="finSelect('${esc(r.o.id)}',this.checked)"></td>${cols.map(c=>cell(r,c)).join('')}<td></td></tr>`;}).join('');
 const cw=salesListCwTable(cols.map(c=>c.k),[44],20),sel=rows.find(r=>r.o.id===finSel);
 const acts=(sel&&sel.acts||[]).map(([l,fn,attr])=>`<button type="button" class="sl-quiet" ${attr||''} onclick="${fn}">${l}</button>`).join('');
 return {rows,acts:sel?`<b class="oq-sel">1 selected</b>${acts}`:'',html:`${salesListFilterChips()}<div class="sales-table-wrap"><table class="sl-table fin-list${cw.cls}"${cw.attrs}>${cw.col}<thead><tr><th class="sl-check"><span class="sl-header-tools"><button type="button" class="sl-settings" data-columns-button title="Columns" aria-label="Columns" onclick="salesListOpenColumns(event)">${ico('settings')}</button></span></th>${cols.map(c=>finListTh(c,p)).join('')}<th></th></tr></thead><tbody>${body||`<tr><td colspan="${cols.length+2}" class="empty">${infos.length?'Nothing matches the filters.':empty}</td></tr>`}</tbody>${rows.length?finListFooter(rows,cols,noun):''}</table></div>${salesListMenuHTML(infos)}`};
}
/* Шапка, таблетки разделов и плитки — общие для трёх списков Finance. */
function finFrame(left,right,html){
 return `<div class="sales-toolbar">${left}<span class="sales-toolbar-sp"></span>${right}<button type="button" class="pri" data-fin-new onclick="finNewReceiptHere()">+ New receipt</button></div>${finPills()}<div class="fin-tiles-row">${finOverviewHTML()}</div>${html}`;
}
function finPills(){return `<div class="sl-filter-row"><div class="sl-quick" role="tablist" aria-label="Finance sections">${FIN_TABS.map(t=>`<button type="button" role="tab" aria-selected="${finTab===t[0]}" class="sl-quick-pill${finTab===t[0]?' on':''}" onclick="finSetTab('${t[0]}')">${t[1]}</button>`).join('')}</div></div>`;}
function finDateCell(v){return `<td>${v?esc(salesListShortDay(v)):'<span class="mut">—</span>'}</td>`;}

/* ------------------------------ Accounts ----------------------------- */
function finAccountState(c,a){return a.review?'Review required':c.status==='archived'?'Archived':c.onHold?'On hold':a.overLimit?'Over limit':'Active';}
function finAccountInfos(){
 return (DB.customer||[]).map(c=>{
  const m=finAccountMetrics(c),x=m.money,a=m.account;
  return {o:{id:c.id,createdAt:c.createdAt||''},c,m,memo:{customer:finCustomerName(c),code:c.code||'',terms:a.terms,balance:x.balance,overdue:x.overdue,prepaid:x.prepaid,deposit:x.deposit,limit:a.creditLimit,orders:x.orders,state:finAccountState(c,a)}};
 }).filter(i=>finAccountAll?i.c.status!=='archived'||finAccountOpen(i.m):finAccountOpen(i.m));
}
function finAccountCell(r,c){
 const v=salesListValue(r,c.k),x=r.m.money;
 switch(c.k){
  case 'customer':return `<td><button class="fin-link" onclick="finOpenAccount('${esc(r.c.id)}')">${raw(v)}</button>${x.review?'<span class="pill warn">Review required</span>':''}<div class="mut small">${raw(r.c.code||'')}${r.c.onHold?' · <b class="fin-due">On hold</b>':''}</div></td>`;
  case 'balance':return `<td class="n">${v>0?`<b>${finFmt(v)}</b>`:'<span class="mut">—</span>'}${x.incomplete?`<div class="mut small">${x.incomplete} not priced</div>`:''}</td>`;
  case 'overdue':return `<td class="n">${v>0?`<b class="fin-due">${finFmt(v)}</b>`:'<span class="mut">—</span>'}</td>`;
  case 'deposit':return `<td class="n">${v>0?`<span class="fin-deposit">${finFmt(v)}</span>`:'<span class="mut">—</span>'}</td>`;
  case 'prepaid':return `<td class="n">${finMoneyText(v)}</td>`;
  case 'limit':return `<td class="n">${v==null?'<span class="mut">—</span>':finFmt(v)}${r.m.account.overLimit?'<div><span class="pill bad">Over limit</span></div>':''}</td>`;
  case 'orders':return `<td class="n">${v||'<span class="mut">—</span>'}</td>`;
  case 'state':return `<td><span class="pill ${v==='Active'?'info':v==='Archived'?'':'bad'}">${esc(v)}</span></td>`;
  default:return `<td>${v==null||v===''?'<span class="mut">—</span>':raw(String(v))}</td>`;
 }
}
/* Строки таблицы Accounts после фильтров — для CSV, печати и тестов. */
function finAccountsList(){return salesListRows(finAccountInfos()).map(r=>({c:r.c,m:r.m}));}
function finAccountsWorkspace(){
 const infos=finAccountInfos();infos.forEach(r=>{r.acts=[['Open',`finOpenAccount('${esc(r.c.id)}')`]].concat(r.m.money.deposit>0&&r.m.money.balance>0?[['Apply deposit',`finOpenApply('${esc(r.c.id)}')`]]:[]);r.applyHint=r.m.money.deposit>0&&r.m.money.balance>0;});
 const t=finListTable(infos,finAccountCell,r=>`data-account="${esc(r.c.id)}"`,'customer',finAccountAll?'No customers yet':'No open balances');
 return finFrame(`<button type="button" class="sl-quiet${finAccountAll?'':' on'}" data-accounts="open" onclick="finAccountAll=false;render()">Open accounts</button><button type="button" class="sl-quiet${finAccountAll?' on':''}" data-accounts="all" onclick="finAccountAll=true;render()">All customers</button>${t.acts}`,`<button type="button" class="sl-quiet" onclick="finOpenStatements()" title="Statements for all customers for a month">Statements</button><button type="button" class="sl-quiet" ${t.rows.length?'':'disabled'} onclick="finBalancesExport()">CSV</button><button type="button" class="sl-quiet" ${t.rows.length?'':'disabled'} onclick="finOpenPreview('balances')">Print</button>`,t.html);
}

/* ------------------------------ Due dates ---------------------------- */
/* Все неоплаченные заказы с полной ценой; без цены суммы не выдумываются —
   такие заказы только считаются. */
function finDueGroup(f){return f.overdue?'Overdue':f.status==='Customer on hold'||f.status==='Deposit due'||f.status==='Net days not set'?f.status:f.dueOn?'Due':'Before pickup';}
function finDueInfos(today){
 today=today||finToday();let review=0;
 const infos=(DB.salesOrder||[]).filter(finOrderCounts).map(o=>{
  const c=salesFindCustomer(o.customerId),f=finOrderFinancial(o,today);
  if(f.b.total==null){review++;return null;}
  if(!(f.b.balance>0))return null;
  const days=f.dueOn?finDueDayDiff(f.dueOn,today):null;
  return {o,c,f,days,memo:{due:f.dueOn||'',days,customer:finCustomerName(c),order:o.businessNumber||'',po:o.customerPo||'',terms:paymentTermsLabel(f.terms),billed:finBillingDate(o),total:f.b.total,paid:f.b.paid,balance:f.b.balance,status:finDueGroup(f)}};
 }).filter(Boolean);
 infos.review=review;return infos;
}
function finDueCell(r,c){
 const v=salesListValue(r,c.k);
 switch(c.k){
  case 'due':return `<td><b>${esc(v?salesListShortDay(v):'—')}</b><div class="small ${r.days<0?'fin-due':'mut'}">${esc(finDueTiming(r))}</div></td>`;
  case 'customer':return `<td><button class="fin-link" onclick="finOpenAccount('${esc(r.o.customerId)}')">${raw(v)}</button>${r.c&&r.c.status==='archived'?'<span class="mut small"> · Archived</span>':''}</td>`;
  case 'order':return `<td><button class="fin-link mono" onclick="finOpenSales('${esc(r.o.id)}')">${esc(v)}</button></td>`;
  case 'billed':return finDateCell(v);
  case 'days':return `<td class="n">${v==null?'<span class="mut">—</span>':v}</td>`;
  case 'total':case 'paid':return `<td class="n">${finFmt(v)}</td>`;
  case 'balance':return `<td class="n"><b>${finFmt(v)}</b></td>`;
  case 'status':return `<td>${finStatusPill(r.f)}</td>`;
  default:return `<td>${v==null||v===''?'<span class="mut">—</span>':raw(String(v))}</td>`;
 }
}
function finDueFiltered(){return salesListRows(finDueInfos());}
function finScheduleHTML(){
 const infos=finDueInfos();infos.forEach(r=>{r.acts=[['Open order',`optimizationOpenOrder('${esc(r.o.id)}')`]].concat(finInvoiceDate(r.o)?[['Invoice',`finOpenInvoice('${esc(r.o.id)}')`,`data-fin-invoice="${esc(r.o.businessNumber)}"`]]:[]).concat([['Terms',`finEditTerms('${esc(r.o.id)}')`]]);});
 const t=finListTable(infos,finDueCell,r=>`data-due-order="${esc(r.o.id)}"`,'order','Nothing unpaid.');
 return finFrame(t.acts,`${salesListDateButton('due')}<button type="button" class="sl-quiet" ${t.rows.length?'':'disabled'} onclick="finDueExport()">CSV</button><button type="button" class="sl-quiet" ${t.rows.length?'':'disabled'} onclick="finOpenPreview('schedule')">Print</button>`,t.html)+`${infos.review?`<p class="mut small">${infos.review} not priced — not in totals.</p>`:''}`;
}
function finDueExport(){const rows=finDueFiltered();if(!rows.length)return;customerDownload('payments-due.csv',finDueCSV(rows),'text/csv;charset=utf-8');}

/* ------------------------------ Payments ----------------------------- */
function finPaymentInfos(){
 return (DB.receipt||[]).filter(r=>(!finCustomerFilter||r.customerId===finCustomerFilter)&&(!finOrderFilter||r.allocations.some(a=>a.orderId===finOrderFilter)||finHistoryFor(r.id).some(e=>(e.orders||[]).some(o=>o.id===finOrderFilter))))
  .map(r=>{const c=salesFindCustomer(r.customerId),orders=r.allocations.map(a=>finOrderNumber(a.orderId));
   return {o:{id:r.id,createdAt:r.date+' '+r.number},r,c,tokens:{orders},memo:{date:r.date,number:r.number,customer:finCustomerName(c),method:finMethodLabel(r.method),reference:r.reference||'',amount:r.amount,orders:orders.join(', '),onAccount:finReceiptOnAccount(r),refunded:finRefunded(r.id),status:r.voided?'Void':'Active',qb:FIN_EXPORT_LABELS[finExportState('receipt',r)]}};});
}
function finPaymentCell(r,c){
 const v=salesListValue(r,c.k),x=r.r;
 switch(c.k){
  case 'date':return finDateCell(v);
  case 'number':return `<td><button type="button" class="fin-link mono" onclick="event.stopPropagation();finOpenReceipt('${esc(x.id)}')">${raw(v)}</button>${x.voided?' <span class="pill bad">Void</span>':''}</td>`;
  case 'customer':return `<td><b>${raw(v)}</b></td>`;
  case 'amount':return `<td class="n"><b>${finFmt(v)}</b>${finCurrency(x)!=='CAD'?` <span class="mut small">${esc(finCurrency(x))}</span>`:''}</td>`;
  case 'orders':return `<td>${x.allocations.length?x.allocations.map(a=>`<div><span class="mono">${raw(finOrderNumber(a.orderId))}</span> · ${finFmt(a.amount)}</div>`).join(''):'<span class="mut">—</span>'}${x.voided&&x.voidReason?`<div class="mut small">Void: ${raw(x.voidReason)}</div>`:''}</td>`;
  case 'onAccount':return `<td class="n">${v>0?`<b class="fin-deposit">${finFmt(v)}</b>`:'<span class="mut">—</span>'}</td>`;
  case 'refunded':return `<td class="n">${finMoneyText(v)}</td>`;
  case 'status':return `<td>${x.voided?'<span class="pill bad">Void</span>':'<span class="pill info">Active</span>'}</td>`;
  default:return `<td>${v==null||v===''?'<span class="mut">—</span>':raw(String(v))}</td>`;
 }
}
function finFilteredReceipts(){return salesListRows(finPaymentInfos()).map(i=>i.r);}
function finReceiptsView(){
 const infos=finPaymentInfos();infos.forEach(r=>{r.acts=[['Open',`finOpenReceipt('${esc(r.r.id)}')`]];});
 const t=finListTable(infos,finPaymentCell,r=>`class="fin-row${r.r.voided?' fin-void':''}" data-receipt="${esc(r.r.id)}" onclick="finOpenReceipt('${esc(r.r.id)}')"`,'payment','No payments yet');
 return finFrame(t.acts,`${salesListDateButton('date')}<button type="button" class="sl-quiet" onclick="finExportCsv()" title="Payments and refunds in this list">CSV</button>${finExportButtonHTML()}`,finFilterChips()+t.html);
}
/* Возвраты в CSV — за тот же клиент/заказ и тот же период, что оплаты. */
function finExportCsv(){
 const rows=finFilteredReceipts(),f=salesListLoadPrefs().filters.date,col=salesListColumn('date');
 const refunds=DB.refund.filter(x=>(!finCustomerFilter||x.customerId===finCustomerFilter)&&(!finOrderFilter||rows.some(r=>r.id===x.receiptId))&&(!f||salesListFilterTest(col,f,{o:{},memo:{date:x.date}})));
 customerDownload('payments_'+finToday()+'.csv',finMovementsCSV(rows,refunds),'text/csv;charset=utf-8');
}
