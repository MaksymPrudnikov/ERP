/* =====================================================================
   views/finance-workspace  ·  finance-1.1
   Экран Finance. Сверху две цифры, по которым действуют: Overdue и деньги
   на счетах клиентов (On account). Три вкладки: Accounts, Due dates,
   Payments. Журнал изменений пишется всегда, а показывается там, где он
   нужен, — в оплате и в карточке клиента (владелец, 28 сентября 2026:
   «минималистично и эффективно»). Команды — в finance/ledger; экран денег
   не придумывает.
   IN : erp/finance/ledger, erp/finance/data, views/finance-lists
   OUT: viewFinance — вкладки Accounts, Due dates, Payments, карточка клиента
   ===================================================================== */
let finCustomerFilter='',finOrderFilter='',finAccountId='',finAccountPaid=false,finDraftBaseline='',finAction=null,finActionBaseline='',finPreview=null,finStatements=null;
function finHasWork(){return !!(finDraft&&JSON.stringify(finDraft)!==finDraftBaseline||finAction&&JSON.stringify(finAction)!==finActionBaseline);}
function finCanLeave(){return !finHasWork()||confirm('Discard unsaved finance changes?');}
/* Начатая форма: новая версия ERP не перезагружает вкладку сама (erp/storage). */
(window.STORAGE_UNSAVED=window.STORAGE_UNSAVED||[]).push(finHasWork);
(window.NAV_GUARDS=window.NAV_GUARDS||[]).push(function(k,go){
 if(tab!=='finance')return false;if(!finCanLeave())return true;
 finDraft=null;finEdit=null;finAction=null;finApply=null;finAlloc=null;finPreview=null;finStatements=null;return false;
});
window.addEventListener('beforeunload',function(e){if(!finHasWork())return;e.preventDefault();e.returnValue='';});
function finResetFilters(){finCustomerFilter='';finOrderFilter='';render();}
function finFilterChips(){
 const c=salesFindCustomer(finCustomerFilter);
 return finCustomerFilter||finOrderFilter?`<div class="fin-scope"><span>${esc(c?finCustomerName(c):'Order '+finOrderNumber(finOrderFilter))}</span><button class="sm" onclick="finResetFilters()">Show all</button></div>`:'';
}
const FIN_TABS=[['accounts','Accounts'],['schedule','Due dates'],['receipts','Payments']];
function finWorkspaceHTML(){
 const list=finTab==='accounts'?!finAccountId:finTab==='schedule'||finEdit===null;
 /* Списки — вид Sales (finFrame); карточка клиента и форма оплаты — как были. */
 return (list?`<div class="card fin-card sales-list-card sl-foot-pin">${finTab==='accounts'?finAccountsWorkspace():finTab==='schedule'?finScheduleHTML():finReceiptsView()}</div>`:`<div class="card fin-card"><div class="fin-workspace-head">${finOverviewHTML()}<button type="button" class="pri" data-fin-new onclick="finNewReceiptHere()">+ New receipt</button></div>
 ${finPills()}
 ${finTab==='accounts'?finAccountHTML():finReceiptForm()}</div>`)+`${finApplyModal()}${finActionHTML()}${finStatementsHTML()}${finPreviewHTML()}`;
}
/* Четыре цифры по всем клиентам и переход к списку за каждой. Сколько
   должны нам, сколько из этого просрочено, и сколько денег клиентов у нас:
   предоплата по заказам в работе и свободный депозит. */
function finOverviewHTML(){
 const m=finAllMoney(),tile=(label,value,sub,go,tone)=>`<button type="button" class="fin-stat${tone?' '+tone:''}" onclick="${go}"><span>${label}</span><strong>${finFmt(value)}</strong><small>${sub}</small></button>`;
 return `<div class="fin-overview">${tile('Customers owe',m.balance,m.orders+(m.orders===1?' order':' orders'),"finGoAccounts('balance')")}${tile('Overdue',m.overdue,m.lateCustomers?m.lateCustomers+(m.lateCustomers===1?' customer':' customers'):'none','finGoOverdue()',m.overdue>0?'bad':'')}${tile('Prepaid',m.prepaid,'orders in work',"finGoAccounts('prepaid')")}${tile('On account',m.deposit,'not applied',"finGoAccounts('deposit')")}</div>`;
}
function finGoOverdue(){finListFocus('schedule',{due:{preset:'overdue'}});}
function finGoAccounts(col){finListFocus('accounts',{[col]:{conds:[{op:'gt',v:'0'}]}},false);}

/* ------------------------------ Accounts ----------------------------- */
/* Таблица Accounts — views/finance-lists. Здесь цифры клиента и карточка. */
function finAccountMetrics(c){
 const rows=(DB.salesOrder||[]).filter(o=>o.customerId===c.id&&finOrderCounts(o)).map(o=>({o,f:finOrderFinancial(o)}));
 return {rows,account:finCustomerAccount(c),money:finCustomerMoney(c.id)};
}
function finAccountOpen(m){const x=m.money;return x.balance>0||x.deposit>0||x.prepaid>0||x.incomplete>0||x.review>0;}
function finBalancesCSV(list){return [['Customer','Account','Terms','Balance','Overdue','Prepaid','On account','Credit limit','Over limit','Orders not priced','Orders needing review']].concat(list.map(({c,m})=>[finCustomerName(c),c.code||'',m.account.terms,m.money.balance.toFixed(2),m.money.overdue.toFixed(2),m.money.prepaid.toFixed(2),m.money.deposit.toFixed(2),m.account.creditLimit==null?'':m.account.creditLimit.toFixed(2),m.account.overLimit?'Yes':'',m.money.incomplete||'',m.money.review||''])).map(row=>row.map(finCsvCell).join(',')).join('\r\n');}
function finBalancesExport(){const list=finAccountsList();if(!list.length)return;customerDownload('customer-balances_'+finToday()+'.csv',finBalancesCSV(list),'text/csv;charset=utf-8');}
function finListDescription(){
 const p=salesListLoadPrefs(),parts=Object.keys(p.filters).filter(k=>salesListColumn(k)&&salesListFilterActive(p.filters[k])).map(k=>salesListFilterSummary(salesListColumn(k),p.filters[k]));
 return parts.join(' · ');
}
function finOpenAccount(id){if(!finCanLeave())return;finAlloc=null;finDraft=null;finEdit=null;finAction=null;tab='finance';finTab='accounts';finAccountId=id;finAccountPaid=false;render();}
function finStatusPill(f){return `<span class="pill ${f.tone}">${esc(f.status)}</span>`;}
function finAccountHTML(){
 if(finAllocOn())return finAllocHTML();
 const c=salesFindCustomer(finAccountId);if(!c)return '<p>Customer not found.</p>';
 const m=finAccountMetrics(c),a=m.account,x=m.money,open=m.rows.filter(x=>x.f.b.balance!==0),paid=m.rows.length-open.length,rows=finAccountPaid?m.rows:open;
 const receipts=DB.receipt.filter(r=>r.customerId===c.id).sort((x,y)=>finDocOrder(y,x)),refunds=DB.refund.filter(r=>r.customerId===c.id).sort((x,y)=>finDocOrder(y,x)),events=DB.financeEvent.filter(e=>e.customerId===c.id);
 return `<div class="fin-account-head"><div><button class="sm" onclick="finAccountId='';render()">← Accounts</button><h3>${raw(finCustomerName(c))}</h3><span class="mut">${raw(c.code)} · ${esc(a.terms)}${c.status==='archived'?' · Archived':''}${c.onHold?' · <b class="fin-due">On hold</b>':''}</span></div><div class="row"><button data-fin-open-allocate onclick="finOpenAllocate('${esc(c.id)}')">Allocate</button><button onclick="finOpenStatement('${esc(c.id)}')">Statement</button><button class="pri" onclick="finNewReceipt('${esc(c.id)}')">+ Receipt</button></div></div>
 <div class="fin-account-totals"><span>Balance <b>${finFmt(x.balance)}</b></span><span>Overdue <b class="${x.overdue>0?'fin-due':''}">${finFmt(x.overdue)}</b></span><span>Prepaid <b>${finFmt(x.prepaid)}</b></span><span>On account <b class="fin-deposit">${finFmt(x.deposit)}</b>${x.deposit>0&&x.balance>0?`<button class="sm" onclick="finOpenApply('${esc(c.id)}')">Apply</button>`:''}</span>${a.creditLimit!=null?`<span>Credit limit <b class="${a.overLimit?'fin-due':''}">${finFmt(a.creditLimit)}</b></span>`:''}</div>
 <h4>Orders</h4>${finStaticTable('finAccOrders',[['order','Order / PO'],['billed','Billed'],['due','Due'],['total','Total','n'],['paid','Paid','n'],['balance','Balance','n'],['status','Status'],['act','']],rows.map(({o,f})=>`<tr data-order="${esc(o.id)}"><td><button class="fin-link" onclick="finOpenSales('${esc(o.id)}')">${esc(o.businessNumber)}</button><div class="mut small">${raw(o.customerPo||'—')}</div></td><td>${esc(finBillingDate(o)?finShortDate(finBillingDate(o)):'—')}</td><td class="${f.overdue?'fin-due':''}">${esc(f.dueOn?finShortDate(f.dueOn):'—')}</td><td class="n">${finFmt(f.b.total)}</td><td class="n">${finFmt(f.b.paid)}</td><td class="n"><b>${finFmt(f.b.balance)}</b></td><td>${finStatusPill(f)}</td><td class="fin-actions">${finInvoiceDate(o)?`<button class="sm" data-fin-invoice="${esc(o.businessNumber)}" onclick="finOpenInvoice('${esc(o.id)}')">Invoice</button> `:''}<button class="sm" onclick="finEditTerms('${esc(o.id)}')">Terms</button></td></tr>`).join('')||`<tr><td colspan="8" class="empty">No open orders</td></tr>`)}
 ${paid?`<button class="sm fin-more" onclick="finAccountPaid=!finAccountPaid;render()">${finAccountPaid?'Hide paid orders':'Show paid orders ('+paid+')'}</button>`:''}
 <h4>Payments</h4>${finStaticTable('finAccPayments',[['receipt','Receipt'],['date','Date'],['method','Method · reference'],['amount','Amount','n'],['applied','Applied','n'],['refunded','Refunded','n'],['onAccount','On account','n']],receipts.map(r=>`<tr class="${r.voided?'fin-void':''}"><td><button class="fin-link" onclick="finOpenReceipt('${esc(r.id)}')">${esc(r.number)}</button>${r.voided?' <span class="pill bad">Void</span>':''}</td><td>${esc(r.date)}</td><td>${esc(finMethodLabel(r.method))}${r.reference?` <span class="mut">${raw(r.reference)}</span>`:''}</td><td class="n"><b>${finFmt(r.amount)}</b></td><td class="n">${finFmt(finReceiptApplied(r))}</td><td class="n">${finRefunded(r.id)>0?finFmt(finRefunded(r.id)):'<span class="mut">—</span>'}</td><td class="n">${finReceiptOnAccount(r)>0?`<span class="fin-deposit">${finFmt(finReceiptOnAccount(r))}</span>`:'<span class="mut">—</span>'}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">No payments yet</td></tr>')}
 ${refunds.length?'<h4>Refunds</h4>'+finRefundTable(refunds):''}
 ${events.length?`<details class="fin-history-box"><summary>History · ${events.length}</summary>${finJournalTable(events)}</details>`:''}`;
}
function finOpenSales(id){if(!finCanLeave())return;const go=()=>{finDraft=null;finEdit=null;tab='sales';salesOrderEdit(id);};if(soDraft&&salesDraftHasWork())salesLeaveDraft(go);else go();}
/* Счёт выданного заказа — сразу бланком Invoice: печать, PDF и Gmail.
   Кнопка — в Due dates и в счёте клиента (Accounts → заказы): там видны и
   оплаченные, например PAID наличного клиента. */
function finOpenInvoice(id){if(!finCanLeave())return;const go=()=>{finDraft=null;finEdit=null;tab='sales';salesOrderEdit(id);if(soDraft&&soDraft.id===id)docOpen('invoice');};if(soDraft&&soDraft.id!==id&&salesDraftHasWork())salesLeaveDraft(go);else go();}

/* --------------------------- Оплата: форма --------------------------- */
function finReceiptSummary(){return finSummaryHTML(finMoney(finDraft.amount),finFormApplied(),finEdit!=='new'?finRefunded(finEdit):0);}
function finReceiptTools(r){
 const refunds=DB.refund.filter(x=>x.receiptId===r.id);
 return `<div class="fin-receipt-tools"><button type="button" onclick="finOpenPreview('receipt','${esc(r.id)}')">Print / email receipt</button>${!r.voided&&finReceiptOnAccount(r)>0&&finCurrency(r)==='CAD'?`<button type="button" onclick="finOpenRefund('${esc(r.id)}')">Refund</button>`:''}</div>${refunds.length?finRefundTable(refunds):''}`;
}
function finOpenRefund(id){const r=DB.receipt.find(r=>r.id===id);if(!r||!finCanLeave())return;if(finDraft){finDraft=null;finEdit=null;finOpenReceipt(id);}finAction={type:'refund',receiptId:id,date:finToday(),amount:'',method:r.method,reference:'',reason:''};finActionBaseline=JSON.stringify(finAction);render();}
function finEditTerms(orderId){const o=DB.salesOrder.find(o=>o.id===orderId);if(!o)return;finAction=Object.assign({type:'terms',reason:''},finTermsFor(o));finActionBaseline=JSON.stringify(finAction);render();}
function finCloseAction(){if(finAction&&JSON.stringify(finAction)!==finActionBaseline&&!confirm('Discard unsaved finance changes?'))return;finAction=null;render();}
function finActionHTML(){
 if(!finAction)return '';const d=finAction,r=DB.receipt.find(r=>r.id===d.receiptId),terms=d.type==='terms',o=terms&&DB.salesOrder.find(x=>x.id===d.orderId);
 const auto=o?finLocalDate(o.statusDates&&o.statusDates.done):'';
 return `<div class="sales-service-modal-back fin-modal-back"><div class="sales-service-modal fin-modal" role="dialog" aria-modal="true" aria-label="${terms?'Payment terms':'Record refund'}"><div class="sales-service-modal-head"><h3>${terms?'Terms · '+esc(finOrderNumber(d.orderId)):'Refund · '+esc(r&&r.number||'')}</h3><button aria-label="Close" onclick="finCloseAction()">×</button></div><div class="fin-modal-body">
 ${terms?`<div class="fin-grid"><label class="fin-span3">Payment terms<select onchange="finAction.paymentMode=this.value;render()"><option value="cash" ${d.paymentMode==='cash'?'selected':''}>Cash / deposit</option><option value="credit" ${d.paymentMode==='credit'?'selected':''}>Credit</option></select></label>${d.paymentMode==='cash'?`<label class="fin-span3">Deposit %<input type="number" min="0" max="100" value="${esc(d.depositPercent)}" oninput="finAction.depositPercent=this.value"></label>`:`<label class="fin-span3">Net days<input type="number" min="0" max="365" value="${d.creditDays==null?'':esc(d.creditDays)}" oninput="finAction.creditDays=this.value"></label>`}<label class="fin-span3">Billing date<input type="date" value="${esc(d.issuedOn)}" onchange="finAction.issuedOn=this.value"><small class="mut">${auto?'Blank = pickup '+esc(finShortDate(auto)):'Blank = pickup day'}</small></label><label class="fin-span3">Due date<input type="date" value="${esc(d.dueOn)}" onchange="finAction.dueOn=this.value"><small class="mut">Blank = by terms</small></label></div><label>Note<input value="${esc(d.reason)}" oninput="finAction.reason=this.value"></label>`:
 `<p>Available <b>${finFmt(r?finReceiptOnAccount(r):0)}</b></p><div class="fin-grid"><label class="fin-span3">Amount · CAD<input id="finRefundAmount" type="number" min="0.01" step="0.01" value="${esc(d.amount)}" oninput="finAction.amount=this.value"></label><label class="fin-span3">Date<input type="date" value="${esc(d.date)}" onchange="finAction.date=this.value"></label><label class="fin-span3">Method<select onchange="finAction.method=this.value">${finMethodChoices(d.method).map(m=>`<option value="${m.k}" ${d.method===m.k?'selected':''}>${m.label}</option>`).join('')}</select></label><label class="fin-span3">Reference<input value="${esc(d.reference)}" oninput="finAction.reference=this.value"></label></div><label>Reason *<input id="finActionReason" value="${esc(d.reason)}" oninput="finAction.reason=this.value"></label>`}
 <div class="err" id="e_fin_action"></div><div class="fin-form-actions"><button onclick="finCloseAction()">Cancel</button><button class="pri" onclick="finSaveAction()">${terms?'Save terms':'Record refund'}</button></div></div></div></div>`;
}
function finSaveAction(){if(!finAction)return;const d=finCopy(finAction),out=finPersist(()=>d.type==='terms'?finSaveTerms(d.orderId,d,d.reason):finCreateRefund(d));if(!out.ok)return fail(document.getElementById('e_fin_action'),out.error);finAction=null;render();}
/* Таблицы карточки клиента — вид Sales: ширина колонок мышью (этап 6;
   порядок постоянный, как в окнах). */
/* Таблицы карточки клиента — вид Sales (владелец 07.11.2026): фильтр, сортировка, ширина, порядок. */
function finStaticTable(id,head,body){return `<div class="fin-table-wrap">${slHtmlTable(id,head,body,{cls:'fin-table',acts:head.length&&!head[head.length-1][1]?120:20})}</div>`;}
function finRefundTable(rows){return finStaticTable('finAccRefunds',[['refund','Refund'],['date','Date'],['payment','Payment'],['amount','Amount','n'],['method','Method · reference'],['reason','Reason'],['act','']],rows.map(r=>{const p=DB.receipt.find(p=>p.id===r.receiptId);return `<tr class="${r.voided?'fin-void':''}"><td><b>${esc(r.number)}</b>${r.voided?' <span class="pill bad">Void</span>':''}</td><td>${esc(r.date)}</td><td><button class="fin-link" onclick="finOpenReceipt('${esc(r.receiptId)}')">${esc(p?p.number:r.receiptId)}</button></td><td class="n">${finFmt(r.amount)}</td><td>${esc(finMethodLabel(r.method))}${r.reference?` <span class="mut">${raw(r.reference)}</span>`:''}</td><td>${raw(r.voided?r.voidReason:r.reason)}</td><td class="fin-actions">${r.voided?'':`<button class="sm" onclick="finVoidRefundUI('${esc(r.id)}')">Void</button>`}</td></tr>`;}).join(''));}
function finVoidRefundUI(id){const reason=prompt('Void this refund record. Reason:','');if(reason===null)return;const out=finPersist(()=>finVoidRefund(id,reason));if(!out.ok)return alert(out.error);render();}

/* ------------------------------ Журнал ------------------------------- */
function finSnapshotHTML(r,entity,orders){if(!r)return '<span class="mut">—</span>';const fields=entity==='terms'?[['Terms',paymentTermsLabel(r)],['Billing date',r.issuedOn||'Pickup day'],['Due date',r.dueOn||'By terms']]:[['Amount',finFmt(r.amount)+' '+finCurrency(r)],['Date',r.date],['Method',finMethodLabel(r.method)],['Reference',r.reference||'—'],['Status',r.voided?'Void':'Active'],['Note / reason',r.note||r.reason||r.voidReason||'—'],['Applied',(r.allocations||[]).map(a=>(((orders||[]).find(o=>o.id===a.orderId)||{}).number||finOrderNumber(a.orderId))+': '+finFmt(a.amount)).join('; ')||'—']];return `<dl>${fields.map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;}
function finJournalTable(rows){return `<div class="fin-history">${rows.slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))||b.seq-a.seq).map(e=>`<details class="fin-event"><summary><span class="fin-event-no">#${e.seq}</span><span><b>${esc(FIN_EVENT_LABELS[e.kind]||e.kind)}</b> · ${esc(e.number)}${e.reason?`<small>${esc(e.reason)}</small>`:''}</span><span class="fin-event-time">${esc(new Date(e.at).toLocaleString('en-CA'))}${e.actor&&e.actor!=='Not specified'?`<small>${esc(e.actor)}</small>`:''}</span></summary><div class="fin-event-diff"><section><h5>Before</h5>${finSnapshotHTML(e.before,e.entity,e.orders)}</section><section><h5>After</h5>${finSnapshotHTML(e.after,e.entity,e.orders)}</section></div></details>`).join('')}</div>`;}

/* ------------------------- Бланки: просмотр -------------------------- */
/* Квитанция, выписка и списки открываются как в Documents: лист на экране,
   Print и Email PDF (PDF в Загрузки + Gmail с готовым адресом и текстом).
   У выписки сверху период — две даты From и To (владелец 07.11.2026: «окно
   периода С По, а не набор слов»; To — сегодня, From — любая прошлая). */
function finOpenPreview(kind,id){finPreview={kind,id:id||'',status:''};render();}
function finStatementRange(){return {from:finMonthRange(-1).from,to:finToday()};}
function finOpenStatement(id,range){const r=range||finStatementRange();finPreview={kind:'statement',id,from:r.from,to:r.to,status:''};render();}
function finClosePreview(){finPreview=null;render();}
function finPeriodError(p){return p.from&&!finDateValid(p.from)||p.to&&!finDateValid(p.to)||p.from&&p.to&&p.from>p.to?'From must be on or before To.':'';}
function finPreviewPages(){
 const p=finPreview;if(!p)return [];
 if(p.kind==='receipt')return finReceiptDoc(p.id);
 if(p.kind==='statement'){
  if(finPeriodError(p))return [];
  const pages=finStatementDoc(p.id,p.from,p.to,undefined,finStatementDue(p),!!p.activity);if(!p.invoices)return pages;
  const key=p.id+'|'+p.from+'|'+p.to;if(p.invoiceKey!==key){p.invoiceKey=key;p.invoicePages=null;setTimeout(()=>finStatementInvoiceBuild(p,key),0);}
  /* Пока счета собираются, Print и Email PDF ждут — иначе ушла бы одна выписка. */
  return p.invoicePages?pages.concat(p.invoicePages):[];
 }
 if(p.kind==='balances')return finBalancesDoc(finAccountsList(),[finAccountAll?'All customers':'Open accounts',finListDescription()].filter(Boolean).join(' · '));
 return finScheduleDoc(finDueFiltered(),finListDescription()||'All unpaid');
}
function finStatementMail(id,from,to,invoices){
 const d=finStatementData(id,from,to),lines=['Please find attached your statement for '+finPeriodText(from,to)+(invoices?' and '+invoices+' invoice'+(invoices===1?'':'s')+' for the period':'')+'.',''];
 lines.push('Orders billed: '+docMoney(d.billed)+'.','Payments received: '+docMoney(d.paid)+'.');
 lines.push(d.closing>=0?'Balance due: '+docMoney(d.closing)+'.':'Credit balance: '+docMoney(-d.closing)+'.');
 if(d.overdue>0)lines.push('Overdue now: '+docMoney(d.overdue)+'.');
 return lines.join('\n');
}
function finPreviewInfo(){
 const p=finPreview,company=(DB.company||{}).legalName||'';
 if(p.kind==='receipt'){const r=DB.receipt.find(x=>x.id===p.id)||{},c=salesFindCustomer(r.customerId);return {title:'Receipt '+(r.number||''),c,file:'Receipt_'+(r.number||''),subject:['Payment receipt '+(r.number||''),company].filter(Boolean).join(' · '),
  body:'Thank you for your payment of '+docMoney(r.amount)+' received on '+docDate(r.date)+'. Receipt '+r.number+' is attached.'};}
 if(p.kind==='statement'){const c=salesFindCustomer(p.id);return {title:'Statement · '+finCustomerName(c),c,mail:'statement',file:'Statement_'+((c&&c.code)||'account')+'_'+(p.from||'start')+'_'+(p.to||finToday()),subject:['Statement '+finPeriodText(p.from,p.to),company].filter(Boolean).join(' · '),
  body:finStatementMail(p.id,p.from,p.to,p.invoices&&p.invoicePages?p.invoiceCount:0)};}
 if(p.kind==='balances')return {title:'Customer balances',c:null,file:'Customer_balances_'+finToday()};
 return {title:'Payments due',c:null,file:'Payments_due_'+finToday()};
}
function finStatementControls(p){
 const err=finPeriodError(p),skipped=err?[]:finStatementData(p.id,p.from,p.to).skipped;
 return `<div class="sales-toolbar fin-preview-period">${finPeriodInputs('preview')}<label class="chk" title="Every charge and payment by date"><input type="checkbox" data-statement-activity ${p.activity?'checked':''} onchange="finPreview.activity=this.checked;render()"> Account activity</label><label class="chk fin-statement-invoices" title="Invoices for the period after the statement"><input type="checkbox" data-statement-invoices ${p.invoices?'checked':''} onchange="finStatementInvoices(this.checked)"> Invoices</label><span class="sales-toolbar-sp"></span><button type="button" ${err?'disabled':''} onclick="finStatementExport()" title="Account activity for the customer's books">CSV</button></div>${err?'':finStatementDueHTML(p)}
 ${err?`<p role="alert" class="fin-due fin-preview-note">${esc(err)}</p>`:''}${skipped.length?`<p class="fin-hint fin-preview-note">Not priced, left out: ${esc(skipped.map(o=>o.businessNumber).join(', '))}</p>`:''}${p.invoices&&!err?`<p class="fin-hint fin-preview-note" data-statement-invoices-note>${p.invoicePages?p.invoiceCount?p.invoiceCount+' invoice'+(p.invoiceCount===1?'':'s')+' after the statement':'No invoices in this period':'Preparing invoices…'}</p>`:''}`;
}
/* Счета за период к выписке (владелец, 22.10.2026: «выслать клиенту все
   инвойсы, информацию за год»): Invoice каждого заказа, выданного в
   периоде, — после выписки, одним PDF. Ушедшие в архив читаются с диска на
   время сборки (archiveWith). */
/* Due now: дата «up to» отмечает счета до неё, галочки — по одному
   (finStatementDuePick). Просроченный счёт к оплате всегда — его галочка
   стоит и не снимается (владелец 07.11.2026: просрочка не может быть
   Current). Кнопок Last Monday / Last Friday / Today нет: дата и так есть. */
function finStatementDue(p){return p&&(p.dueBy||Object.keys(p.duePick||{}).length)?{by:p.dueBy||'',pick:p.duePick||{}}:null;}
function finStatementDueBy(v){const p=finPreview;if(!p)return;p.dueBy=finDateValid(v)?v:'';p.duePick={};p.status='';render();}
function finStatementDueToggle(id,on){const p=finPreview;if(!p)return;p.duePick=Object.assign({},p.duePick,{[id]:!!on});p.status='';render();}
function finStatementDueHTML(p){
 const due=finStatementDue(p),day=finToday(),open=finStatementOrders(p.id,p.from,p.to,day).filter(finStatementDueOpen);if(!open.length)return '';
 const picks=open.map(x=>{const late=finStatementLate(x,day)>0,on=late||finStatementDuePick(x,due);return `<label class="chk${late?' fin-due':''}"${late?' title="Overdue · always due"':''}><input type="checkbox" data-statement-due-pick="${esc(x.o.id)}" ${on?'checked':''} ${late?'disabled':''} onchange="finStatementDueToggle('${esc(x.o.id)}',this.checked)"> ${esc(x.o.businessNumber)} · ${esc(docDate(x.billed))} · ${esc(docMoney(x.f.b.balance))}</label>`;}).join('');
 return `<div class="sales-toolbar fin-preview-period fin-due-now"><b>Due now</b><label class="fin-date-field">up to <input type="date" data-statement-due value="${esc(p.dueBy||'')}" max="${esc(day)}" onchange="finStatementDueBy(this.value)"></label>${due?'<button type="button" data-statement-due-clear onclick="finStatementDueBy(\'\')">Clear</button>':''}<div class="fin-due-picks" data-statement-due-picks>${picks}</div></div>`;
}
function finStatementInvoices(on){const p=finPreview;if(!p)return;p.invoices=!!on;p.status='';render();}
async function finStatementInvoiceBuild(p,key){
 const inPeriod=d=>!!d&&(!p.from||d>=p.from)&&(!p.to||d<=p.to),list=finStatementOrders(p.id,p.from,p.to).filter(x=>inPeriod(x.billed)),old=list.filter(x=>x.archived).map(x=>x.o.id);
 const build=()=>list.flatMap(x=>{const o=salesRecord(x.o.id);return o?docPages(docBuildModel('invoice',o,docDefaultOptions('invoice'))):[];});
 let pages=[];try{pages=old.length&&typeof archiveWith==='function'?await archiveWith(old,build):build();}catch(e){if(finPreview===p)p.status='Invoices could not be prepared: '+(e&&e.message||e);}
 if(finPreview!==p||p.invoiceKey!==key)return;
 p.invoicePages=pages;p.invoiceCount=list.length;render();
}
function finStatementExport(){const p=finPreview;if(!p||finPeriodError(p))return;const c=salesFindCustomer(p.id);customerDownload('Statement_'+((c&&c.code)||'account').replace(/[^A-Za-z0-9-]+/g,'_')+'_'+(p.from||'start')+'_'+(p.to||finToday())+'.csv',finStatementCSV(p.id,p.from,p.to),'text/csv;charset=utf-8');}
function finPreviewHTML(){
 if(!finPreview)return '';let pages=[],error='';
 try{pages=finPreviewPages();}catch(e){error=e&&e.message||String(e);}
 const info=finPreviewInfo();
 return `<div class="sales-service-modal-back fin-modal-back fin-preview-back" onclick="if(event.target===this)finClosePreview()"><div class="sales-service-modal fin-preview" role="dialog" aria-modal="true" aria-label="${esc(info.title)}"><div class="sales-service-modal-head"><h3>${esc(info.title)}</h3><div class="fin-preview-actions"><button type="button" ${pages.length?'':'disabled'} onclick="finPrintPreview()">Print</button>${info.c?`<button type="button" class="pri" ${pages.length?'':'disabled'} onclick="finEmailPreview()">Email PDF</button>`:''}</div><button type="button" aria-label="Close" onclick="finClosePreview()">×</button></div>
 ${finPreview.kind==='statement'?finStatementControls(finPreview):''}${finPreview.status?`<div class="fin-hint fin-preview-note">${esc(finPreview.status)}</div>`:''}<div class="doc-pages">${error?`<div class="err" style="display:block">${esc(error)}</div>`:pages.map(pg=>`<div class="doc-sheet">${docPageSVG(pg)}</div>`).join('')}</div></div></div>`;
}
function finPrintDoc(pages){
 if(!pages||!pages.length)return false;
 const host=docPrintHost();host.innerHTML=pages.map(pg=>`<div class="doc-print-page">${docPageSVG(pg)}</div>`).join('');
 document.body.classList.add('doc-printing');
 window.addEventListener('afterprint',docPrintCleanup,{once:true});setTimeout(docPrintCleanup,60000);
 try{window.print();}catch(e){docPrintCleanup();}
 return true;
}
function finPrintPreview(){try{finPrintDoc(finPreviewPages());}catch(e){alert('The document could not be prepared: '+(e&&e.message||e));}}
/* PDF в Загрузки и письмо в Gmail с адресом клиента — как у Proforma:
   программа с диска не может вложить файл в чужую вкладку сама. */
/* Выписка — на Statement Email, остальное — на Invoice Email; пусто — на
   основной контакт (аудит 05.10.2026: выписка уходила на Invoice Email). */
function finEmailTo(c,mail){return c?(mail==='statement'&&c.statementEmail||c.invoiceEmail||customerPrimaryContact(c).email||''):'';}
function finEmailDoc(info,pages){
 const bytes=docPdfBytes(pages,{title:info.title});
 const file=info.file.replace(/[^A-Za-z0-9-]+/g,'_')+'.pdf',to=finEmailTo(info.c,info.mail),first=String(customerPrimaryContact(info.c).name||'').trim().split(/\s+/)[0];
 docDownload(file,bytes);
 const win=window.open(docGmailUrl(to,info.subject,['Hello'+(first?' '+first:'')+',','',info.body,'',(DB.company||{}).legalName||''].join('\n')),'_blank');
 return 'PDF saved to Downloads as '+file+' — drag it into the Gmail message.'+(to?'':' No email for this customer.')+(win?'':' Allow pop-ups for Gmail.');
}
function finEmailPreview(){
 const info=finPreviewInfo();if(!info.c)return;
 try{finPreview.status=finEmailDoc(info,finPreviewPages());}catch(e){alert('The PDF could not be prepared: '+(e&&e.message||e));return;}
 render();
}

/* ----------------------- Выписки за месяц всем ---------------------- */
/* Раз в месяц: список клиентов, у которых было движение или есть остаток,
   с суммами периода; у каждого — посмотреть и отправить PDF. */
function finOpenStatements(){const r=finStatementRange();finStatements={from:r.from,to:r.to,sent:{}};render();}
function finCloseStatements(){finStatements=null;render();}
function finStatementsList(){
 const p=finStatements;if(!p||finPeriodError(p))return [];
 return (DB.customer||[]).map(c=>({c,d:finStatementData(c.id,p.from,p.to)})).filter(x=>x.d.rows.length||x.d.opening!==0||x.d.closing!==0)
  .sort((a,b)=>finCustomerName(a.c).localeCompare(finCustomerName(b.c)));
}
function finStatementsEmail(id){
 const p=finStatements,c=salesFindCustomer(id);if(!p||!c)return;
 try{finEmailDoc({title:'Statement · '+finCustomerName(c),c,mail:'statement',file:'Statement_'+(c.code||'account')+'_'+p.from+'_'+p.to,subject:['Statement '+finPeriodText(p.from,p.to),(DB.company||{}).legalName||''].filter(Boolean).join(' · '),body:finStatementMail(id,p.from,p.to)},finStatementDoc(id,p.from,p.to));}
 catch(e){alert('The PDF could not be prepared: '+(e&&e.message||e));return;}
 p.sent[id]=true;render();
}
function finStatementsHTML(){
 const p=finStatements;if(!p)return '';const err=finPeriodError(p),list=finStatementsList();
 return `<div class="sales-service-modal-back fin-modal-back" onclick="if(event.target===this)finCloseStatements()"><div class="sales-service-modal fin-statements" role="dialog" aria-modal="true" aria-label="Statements"><div class="sales-service-modal-head"><h3>Statements · ${esc(err?'':finPeriodText(p.from,p.to))}</h3><button type="button" aria-label="Close" onclick="finCloseStatements()">×</button></div>
 <div class="fin-modal-body"><div class="sales-toolbar">${finPeriodInputs('statements')}</div>
 ${err?`<p role="alert" class="fin-due">${esc(err)}</p>`:''}
 <div class="fin-table-wrap">${slFromTable('finStatementsList',`<table class="fin-table"><thead><tr><th>Customer</th><th>Email</th><th class="n">Balance forward</th><th class="n">Billed</th><th class="n">Paid</th><th class="n">Balance</th><th></th></tr></thead><tbody>${list.map(({c,d})=>{const to=finEmailTo(c,'statement');return `<tr data-statement="${esc(c.id)}"><td><b>${raw(finCustomerName(c))}</b><div class="mut small">${raw(c.code)}</div></td><td>${to?esc(to):'<span class="mut">no email</span>'}</td><td class="n">${finSigned(d.opening)}</td><td class="n">${d.billed?finFmt(d.billed):'<span class="mut">—</span>'}</td><td class="n">${d.paid?finFmt(d.paid):'<span class="mut">—</span>'}</td><td class="n"><b>${finSigned(d.closing)}</b></td><td class="fin-actions">${p.sent[c.id]?'<span class="pill good">Emailed</span> ':''}<button class="sm" onclick="finOpenStatement('${esc(c.id)}',{from:finStatements.from,to:finStatements.to})">View</button><button class="sm pri" onclick="finStatementsEmail('${esc(c.id)}')">Email PDF</button></td></tr>`;}).join('')||`<tr><td colspan="7" class="empty">${err?'Correct the dates.':'No activity in this period.'}</td></tr>`}</tbody></table>`)}</div>
 ${Object.keys(p.sent).length?'<p class="mut small">PDFs are in Downloads — drag each into its Gmail message.</p>':''}</div></div></div>`;
}

/* ----------------------- Период: From и To ------------------------- */
/* Две даты прямо в строке, без меню и слов (владелец 07.11.2026). Ошибка
   «From после To» — строкой под ней (finPeriodError), лист не строится. */
function finRangeState(target){return target==='statements'?finStatements:finPreview;}
function finPeriodInputs(target){
 const s=finRangeState(target);if(!s)return '';const day=finToday();
 const field=(k,label)=>`<label class="fin-date-field">${label} <input type="date" data-period-${k}="${target}" value="${esc(s[k]||'')}" max="${esc(day)}" aria-label="${label}" onchange="finPeriodSet('${target}','${k}',this.value)"></label>`;
 return `<span class="fin-period" data-period="${target}">${field('from','From')}${field('to','To')}</span>`;
}
function finPeriodSet(target,k,v){const s=finRangeState(target);if(!s)return;s[k]=finDateValid(v)?v:'';if('status' in s)s.status='';render();}

/* -------------------------------- CSV -------------------------------- */
/* Движение денег для переноса в QuickBooks: оплаты и возвраты одной
   таблицей по дате, возврат — минусом. Колонка QuickBooks: для выгрузки
   «только новое» — New / Corrected / Voided, для обычной — выгружено ли. */
function finMovementsCSV(receipts,refunds,states,invoices){
 const who=id=>{const c=salesFindCustomer(id)||{};return [finCustomerName(c),c.code||''];};
 const qb=(kind,x)=>{if(states&&states.has(x.id))return FIN_EXPORT_LABELS[states.get(x.id)];const e=finExportRecord(x.id);return e?'Exported '+finLocalDate(e.at):'';};
 const rows=receipts.map(r=>[r.date,r.number,'Payment',...who(r.customerId),finMethodLabel(r.method),r.reference,r.amount.toFixed(2),finCurrency(r),r.allocations.map(a=>finOrderNumber(a.orderId)+': '+a.amount.toFixed(2)).join('; '),r.voided?'Void':'Active',r.voided?r.voidReason:r.note,qb('receipt',r)])
  .concat(refunds.map(x=>[x.date,x.number,'Refund',...who(x.customerId),finMethodLabel(x.method),x.reference,(-x.amount).toFixed(2),x.currency,'Payment '+((DB.receipt.find(r=>r.id===x.receiptId)||{}).number||''),x.voided?'Void':'Active',x.voided?x.voidReason:x.reason,qb('refund',x)]))
  /* Счёт: Method — условия оплаты, Reference — PO, Status — срок или Paid. */
  .concat((invoices||[]).map(o=>finInvoiceExportRow(o,(states&&states.get(o.id)||finExportState('invoice',o))==='voided').concat(qb('invoice',o))))
  .sort((a,b)=>(a[0]+a[1]).localeCompare(b[0]+b[1]));
 return [['Date','Document','Type','Customer','Account','Method','Reference','Amount','Currency','Applied to orders','Status','Note','QuickBooks']].concat(rows).map(row=>row.map(finCsvCell).join(',')).join('\r\n');
}
function finExportFile(list,batch){
 const file=(DB.financeExportBatch||[]).find(x=>x.batch===batch);
 if(!file){alert('The original CSV is unavailable for this older export. Export corrected entries as a new file.');return false;}
 customerDownload(file.name,file.csv,'text/csv;charset=utf-8');return true;
}
/* Кнопка QuickBooks: файл только с тем, чего в QuickBooks ещё нет или что
   изменилось после выгрузки; после записи они считаются выгруженными. */
function finExportQuickBooks(){
 const list=finExportPending();if(!list.length)return;
 const out=finPersist(()=>finExportMark(list));if(!out.ok)return alert(out.error);
 finExportFile(list,out.value);render();
}
/* Тот же файл ещё раз — если прошлый потерялся. Суммы и подписи — сохранённый оригинал. */
function finExportAgain(){
 const batch=finExportLastBatch();if(!batch)return;
 finExportFile(null,batch);
}
function finExportButtonHTML(){
 const n=finExportPending().length,batch=finExportLastBatch(),last=batch?(DB.financeExportBatch||[]).filter(e=>e.batch===batch).concat(DB.financeExport.filter(e=>e.batch===batch)):[];
 return `<button type="button" class="${n?'pri':''}" ${n?'':'disabled'} onclick="finExportQuickBooks()" title="CSV of new or corrected invoices, payments and refunds; import it into QuickBooks">${n?'QuickBooks · '+n+' new':batch?'QuickBooks · CSV exported':'QuickBooks · no new entries'}</button>${last.length?`<button type="button" class="fin-link fin-export-last" onclick="finExportAgain()" title="Download the last QuickBooks file again">Last file · ${esc(finShortDate(finLocalDate(last[0].at)))}</button>`:''}`;
}

/* ------------------------- Карточка клиента ------------------------- */
/* Одна строка денег в карточке клиента (раздел Customers) и переход в его
   счёт в Finance. */
function finCustomerStrip(customerId){
 const c=salesFindCustomer(customerId);if(!c)return '';
 const x=finCustomerMoney(c.id);
 return `<div class="fin-customer-strip"><span>Balance <b>${finFmt(x.balance)}</b></span><span>Overdue <b class="${x.overdue>0?'fin-due':''}">${finFmt(x.overdue)}</b></span><span>Prepaid <b>${finFmt(x.prepaid)}</b></span><span>On account <b class="fin-deposit">${finFmt(x.deposit)}</b></span><button type="button" class="sm" onclick="finOpenAccount('${esc(c.id)}')">Finance account</button></div>`;
}
