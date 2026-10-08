/* =====================================================================
   views/finance-workspace  ·  finance-1.1
   Экран Finance. Сверху две цифры, по которым действуют: Overdue и деньги
   на счетах клиентов (On account). Три вкладки: Accounts, Due dates,
   Payments. Журнал изменений пишется всегда, а показывается там, где он
   нужен, — в оплате и в карточке клиента (владелец, 28 сентября 2026:
   «минималистично и эффективно»). Команды — в finance/ledger; экран денег
   не придумывает.
   ===================================================================== */
let finCustomerFilter='',finOrderFilter='',finAccountId='',finAccountPaid=false,finDraftBaseline='',finAction=null,finActionBaseline='',finPreview=null,finStatements=null;
function finHasWork(){return !!(finDraft&&JSON.stringify(finDraft)!==finDraftBaseline||finAction&&JSON.stringify(finAction)!==finActionBaseline);}
function finCanLeave(){return !finHasWork()||confirm('Discard unsaved finance changes?');}
(window.NAV_GUARDS=window.NAV_GUARDS||[]).push(function(k,go){
 if(tab!=='finance')return false;if(!finCanLeave())return true;
 finDraft=null;finEdit=null;finAction=null;finApply=null;finPreview=null;finStatements=null;finRangeMenu=null;return false;
});
window.addEventListener('beforeunload',function(e){if(!finHasWork())return;e.preventDefault();e.returnValue='';});
function finResetFilters(){finCustomerFilter='';finOrderFilter='';render();}
function finFilterChips(){
 const c=salesFindCustomer(finCustomerFilter);
 return finCustomerFilter||finOrderFilter?`<div class="fin-scope"><span>${esc(c?finCustomerName(c):'Order '+finOrderNumber(finOrderFilter))}</span><button class="sm" onclick="finResetFilters()">Show all</button></div>`:'';
}
const FIN_TABS=[['accounts','Accounts'],['schedule','Due dates'],['receipts','Payments']];
function finWorkspaceHTML(){
 return `<div class="card fin-card"><div class="fin-workspace-head">${finOverviewHTML()}<button type="button" class="pri" data-fin-new onclick="finNewReceiptHere()">+ New receipt</button></div>
 <div class="tabs" role="tablist" aria-label="Finance sections">${FIN_TABS.map(t=>`<button role="tab" aria-selected="${finTab===t[0]}" class="${finTab===t[0]?'on':''}" onclick="finSetTab('${t[0]}')">${t[1]}</button>`).join('')}</div>
 ${finTab==='accounts'?(finAccountId?finAccountHTML():finAccountsWorkspace()):finTab==='schedule'?finScheduleHTML():finEdit!==null?finReceiptForm():finReceiptsView()}</div>${finApplyModal()}${finActionHTML()}${finStatementsHTML()}${finPreviewHTML()}${finRangeMenuHTML()}`;
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
function finBalancesCSV(list){return [['Customer','Account','Terms','Balance','Overdue','Prepaid','On account','Credit limit','Over limit','Orders not priced']].concat(list.map(({c,m})=>[finCustomerName(c),c.code||'',m.account.terms,m.money.balance.toFixed(2),m.money.overdue.toFixed(2),m.money.prepaid.toFixed(2),m.money.deposit.toFixed(2),m.account.creditLimit==null?'':m.account.creditLimit.toFixed(2),m.account.overLimit?'Yes':'',m.money.incomplete||''])).map(row=>row.map(finCsvCell).join(',')).join('\r\n');}
function finBalancesExport(){const list=finAccountsList();if(!list.length)return;customerDownload('customer-balances_'+finToday()+'.csv',finBalancesCSV(list),'text/csv;charset=utf-8');}
function finListDescription(){
 const p=salesListLoadPrefs(),parts=Object.keys(p.filters).filter(k=>salesListColumn(k)&&salesListFilterActive(p.filters[k])).map(k=>salesListFilterSummary(salesListColumn(k),p.filters[k]));
 return parts.join(' · ');
}
function finOpenAccount(id){if(!finCanLeave())return;finDraft=null;finEdit=null;finAction=null;tab='finance';finTab='accounts';finAccountId=id;finAccountPaid=false;render();}
function finStatusPill(f){return `<span class="pill ${f.tone}">${esc(f.status)}</span>`;}
function finAccountHTML(){
 const c=salesFindCustomer(finAccountId);if(!c)return '<p>Customer not found.</p>';
 const m=finAccountMetrics(c),a=m.account,x=m.money,open=m.rows.filter(x=>x.f.b.balance!==0),paid=m.rows.length-open.length,rows=finAccountPaid?m.rows:open;
 const receipts=DB.receipt.filter(r=>r.customerId===c.id).sort((x,y)=>(y.date+y.number).localeCompare(x.date+x.number)),refunds=DB.refund.filter(r=>r.customerId===c.id).sort((x,y)=>(y.date+y.number).localeCompare(x.date+x.number)),events=DB.financeEvent.filter(e=>e.customerId===c.id);
 return `<div class="fin-account-head"><div><button class="sm" onclick="finAccountId='';render()">← Accounts</button><h3>${raw(finCustomerName(c))}</h3><span class="mut">${raw(c.code)} · ${esc(a.terms)}${c.status==='archived'?' · Archived':''}${c.onHold?' · <b class="fin-due">On hold</b>':''}</span></div><div class="row"><button onclick="finOpenStatement('${esc(c.id)}')">Statement</button><button class="pri" onclick="finNewReceipt('${esc(c.id)}')">+ Receipt</button></div></div>
 <div class="fin-account-totals"><span>Balance <b>${finFmt(x.balance)}</b></span><span>Overdue <b class="${x.overdue>0?'fin-due':''}">${finFmt(x.overdue)}</b></span><span>Prepaid <b>${finFmt(x.prepaid)}</b></span><span>On account <b class="fin-deposit">${finFmt(x.deposit)}</b>${x.deposit>0&&x.balance>0?`<button class="sm" onclick="finOpenApply('${esc(c.id)}')">Apply</button>`:''}</span>${a.creditLimit!=null?`<span>Credit limit <b class="${a.overLimit?'fin-due':''}">${finFmt(a.creditLimit)}</b></span>`:''}</div>
 <h4>Orders</h4><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Order / PO</th><th>Billed</th><th>Due</th><th class="n">Total</th><th class="n">Paid</th><th class="n">Balance</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(({o,f})=>`<tr data-order="${esc(o.id)}"><td><button class="fin-link" onclick="finOpenSales('${esc(o.id)}')">${esc(o.businessNumber)}</button><div class="mut small">${raw(o.customerPo||'—')}</div></td><td>${esc(finBillingDate(o)?finShortDate(finBillingDate(o)):'—')}</td><td class="${f.overdue?'fin-due':''}">${esc(f.dueOn?finShortDate(f.dueOn):'—')}</td><td class="n">${finFmt(f.b.total)}</td><td class="n">${finFmt(f.b.paid)}</td><td class="n"><b>${finFmt(f.b.balance)}</b></td><td>${finStatusPill(f)}</td><td class="fin-actions">${finInvoiceDate(o)?`<button class="sm" data-fin-invoice="${esc(o.businessNumber)}" onclick="finOpenInvoice('${esc(o.id)}')">Invoice</button> `:''}<button class="sm" onclick="finEditTerms('${esc(o.id)}')">Terms</button></td></tr>`).join('')||`<tr><td colspan="8" class="empty">No open orders</td></tr>`}</tbody></table></div>
 ${paid?`<button class="sm fin-more" onclick="finAccountPaid=!finAccountPaid;render()">${finAccountPaid?'Hide paid orders':'Show paid orders ('+paid+')'}</button>`:''}
 <h4>Payments</h4><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Receipt</th><th>Date</th><th>Method · reference</th><th class="n">Amount</th><th class="n">Applied</th><th class="n">Refunded</th><th class="n">On account</th></tr></thead><tbody>${receipts.map(r=>`<tr class="${r.voided?'fin-void':''}"><td><button class="fin-link" onclick="finOpenReceipt('${esc(r.id)}')">${esc(r.number)}</button>${r.voided?' <span class="pill bad">Void</span>':''}</td><td>${esc(r.date)}</td><td>${esc(finMethodLabel(r.method))}${r.reference?` <span class="mut">${raw(r.reference)}</span>`:''}</td><td class="n"><b>${finFmt(r.amount)}</b></td><td class="n">${finFmt(finReceiptApplied(r))}</td><td class="n">${finRefunded(r.id)>0?finFmt(finRefunded(r.id)):'<span class="mut">—</span>'}</td><td class="n">${finReceiptOnAccount(r)>0?`<span class="fin-deposit">${finFmt(finReceiptOnAccount(r))}</span>`:'<span class="mut">—</span>'}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">No payments yet</td></tr>'}</tbody></table></div>
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
function finRefundTable(rows){return `<div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Refund</th><th>Date</th><th>Payment</th><th class="n">Amount</th><th>Method · reference</th><th>Reason</th><th></th></tr></thead><tbody>${rows.map(r=>{const p=DB.receipt.find(p=>p.id===r.receiptId);return `<tr class="${r.voided?'fin-void':''}"><td><b>${esc(r.number)}</b>${r.voided?' <span class="pill bad">Void</span>':''}</td><td>${esc(r.date)}</td><td><button class="fin-link" onclick="finOpenReceipt('${esc(r.receiptId)}')">${esc(p?p.number:r.receiptId)}</button></td><td class="n">${finFmt(r.amount)}</td><td>${esc(finMethodLabel(r.method))}${r.reference?` <span class="mut">${raw(r.reference)}</span>`:''}</td><td>${raw(r.voided?r.voidReason:r.reason)}</td><td class="fin-actions">${r.voided?'':`<button class="sm" onclick="finVoidRefundUI('${esc(r.id)}')">Void</button>`}</td></tr>`;}).join('')}</tbody></table></div>`;}
function finVoidRefundUI(id){const reason=prompt('Void this refund record. Reason:','');if(reason===null)return;const out=finPersist(()=>finVoidRefund(id,reason));if(!out.ok)return alert(out.error);render();}

/* ------------------------------ Журнал ------------------------------- */
function finSnapshotHTML(r,entity,orders){if(!r)return '<span class="mut">—</span>';const fields=entity==='terms'?[['Terms',paymentTermsLabel(r)],['Billing date',r.issuedOn||'Pickup day'],['Due date',r.dueOn||'By terms']]:[['Amount',finFmt(r.amount)+' '+finCurrency(r)],['Date',r.date],['Method',finMethodLabel(r.method)],['Reference',r.reference||'—'],['Status',r.voided?'Void':'Active'],['Note / reason',r.note||r.reason||r.voidReason||'—'],['Applied',(r.allocations||[]).map(a=>(((orders||[]).find(o=>o.id===a.orderId)||{}).number||finOrderNumber(a.orderId))+': '+finFmt(a.amount)).join('; ')||'—']];return `<dl>${fields.map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;}
function finJournalTable(rows){return `<div class="fin-history">${rows.slice().sort((a,b)=>b.seq-a.seq).map(e=>`<details class="fin-event"><summary><span class="fin-event-no">#${e.seq}</span><span><b>${esc(FIN_EVENT_LABELS[e.kind]||e.kind)}</b> · ${esc(e.number)}${e.reason?`<small>${esc(e.reason)}</small>`:''}</span><span class="fin-event-time">${esc(new Date(e.at).toLocaleString('en-CA'))}${e.actor&&e.actor!=='Not specified'?`<small>${esc(e.actor)}</small>`:''}</span></summary><div class="fin-event-diff"><section><h5>Before</h5>${finSnapshotHTML(e.before,e.entity,e.orders)}</section><section><h5>After</h5>${finSnapshotHTML(e.after,e.entity,e.orders)}</section></div></details>`).join('')}</div>`;}

/* ------------------------- Бланки: просмотр -------------------------- */
/* Квитанция, выписка и списки открываются как в Documents: лист на экране,
   Print и Email PDF (PDF в Загрузки + Gmail с готовым адресом и текстом).
   У выписки сверху период: прошлый месяц, этот месяц или свои даты. */
function finOpenPreview(kind,id){finPreview={kind,id:id||'',status:''};render();}
function finOpenStatement(id,range){const r=range||finMonthRange(-1);finPreview={kind:'statement',id,from:r.from,to:r.to,status:''};render();}
function finClosePreview(){finPreview=null;render();}
function finPeriodError(p){return p.from&&!finDateValid(p.from)||p.to&&!finDateValid(p.to)||p.from&&p.to&&p.from>p.to?'From must be on or before To.':'';}
function finPreviewPages(){
 const p=finPreview;if(!p)return [];
 if(p.kind==='receipt')return finReceiptDoc(p.id);
 if(p.kind==='statement')return finPeriodError(p)?[]:finStatementDoc(p.id,p.from,p.to);
 if(p.kind==='balances')return finBalancesDoc(finAccountsList(),[finAccountAll?'All customers':'Open accounts',finListDescription()].filter(Boolean).join(' · '));
 return finScheduleDoc(finDueFiltered(),finListDescription()||'All unpaid');
}
function finStatementMail(id,from,to){
 const d=finStatementData(id,from,to),lines=['Please find attached your statement for '+finPeriodText(from,to)+'.',''];
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
  body:finStatementMail(p.id,p.from,p.to)};}
 if(p.kind==='balances')return {title:'Customer balances',c:null,file:'Customer_balances_'+finToday()};
 return {title:'Payments due',c:null,file:'Payments_due_'+finToday()};
}
function finStatementControls(p){
 const err=finPeriodError(p),skipped=err?[]:finStatementData(p.id,p.from,p.to).skipped;
 return `<div class="sales-toolbar fin-preview-period">${finRangeButton('preview')}<span class="sales-toolbar-sp"></span><button type="button" ${err?'disabled':''} onclick="finStatementExport()" title="Account activity for the customer's books">CSV</button></div>
 ${err?`<p role="alert" class="fin-due fin-preview-note">${esc(err)}</p>`:''}${skipped.length?`<p class="fin-hint fin-preview-note">Not priced, left out: ${esc(skipped.map(o=>o.businessNumber).join(', '))}</p>`:''}`;
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
function finOpenStatements(){const r=finMonthRange(-1);finStatements={from:r.from,to:r.to,sent:{}};render();}
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
 <div class="fin-modal-body"><div class="sales-toolbar">${finRangeButton('statements')}</div>
 ${err?`<p role="alert" class="fin-due">${esc(err)}</p>`:''}
 <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Customer</th><th>Email</th><th class="n">Balance forward</th><th class="n">Billed</th><th class="n">Paid</th><th class="n">Balance</th><th></th></tr></thead><tbody>${list.map(({c,d})=>{const to=finEmailTo(c,'statement');return `<tr data-statement="${esc(c.id)}"><td><b>${raw(finCustomerName(c))}</b><div class="mut small">${raw(c.code)}</div></td><td>${to?esc(to):'<span class="mut">no email</span>'}</td><td class="n">${finSigned(d.opening)}</td><td class="n">${d.billed?finFmt(d.billed):'<span class="mut">—</span>'}</td><td class="n">${d.paid?finFmt(d.paid):'<span class="mut">—</span>'}</td><td class="n"><b>${finSigned(d.closing)}</b></td><td class="fin-actions">${p.sent[c.id]?'<span class="pill good">Emailed</span> ':''}<button class="sm" onclick="finOpenStatement('${esc(c.id)}',{from:finStatements.from,to:finStatements.to})">View</button><button class="sm pri" onclick="finStatementsEmail('${esc(c.id)}')">Email PDF</button></td></tr>`;}).join('')||`<tr><td colspan="7" class="empty">${err?'Correct the dates.':'No activity in this period.'}</td></tr>`}</tbody></table></div>
 ${Object.keys(p.sent).length?'<p class="mut small">PDFs are in Downloads — drag each into its Gmail message.</p>':''}</div></div></div>`;
}

/* ----------------------- Период: блок дат как у Sales ------------------ */
/* Выписке нужен закрытый период, поэтому быстрые кнопки — месяцы; вид и
   поведение — как блок Created в Sales. */
let finRangeMenu=null;
const FIN_STATEMENT_RANGE=[['lastMonth','Last month'],['thisMonth','This month'],['thisYear','This year']];
function finRangeState(target){return target==='statements'?finStatements:finPreview;}
function finRangeLabel(s){const k=FIN_STATEMENT_RANGE.find(x=>{const r=salesListPresetRange(x[0]);return r&&r[0]===s.from&&r[1]===s.to;});return k?k[1]:s.from&&s.to?salesListShortDay(s.from)+' – '+salesListShortDay(s.to):'Choose dates';}
function finRangeButton(target){const s=finRangeState(target);return s?`<button type="button" class="sl-quiet sl-date-toggle" data-period="${target}" aria-haspopup="dialog" onclick="finRangeOpen(event,'${target}')">Period: ${esc(finRangeLabel(s))}<span class="sl-disclosure" aria-hidden="true">▾</span></button>`:'';}
function finRangeOpen(e,target){const s=finRangeState(target);if(!s)return;finRangeMenu=Object.assign({target,from:s.from,to:s.to,error:''},salesListAt(e,340));render();}
function finRangePreset(k){const r=salesListPresetRange(k);if(!finRangeMenu||!r)return;Object.assign(finRangeMenu,{from:r[0],to:r[1],error:''});render();}
function finRangeInput(k,v){if(finRangeMenu){finRangeMenu[k]=v;finRangeMenu.error='';}}
function finRangeApply(){
 const m=finRangeMenu,s=m&&finRangeState(m.target);if(!s)return;
 if(!m.from||!m.to||!salesListValidDay(m.from)||!salesListValidDay(m.to)||m.from>m.to){m.error='Choose a valid range. From must not be after To.';render();return;}
 s.from=m.from;s.to=m.to;if('status' in s)s.status='';finRangeMenu=null;render();
}
function finRangeClose(){finRangeMenu=null;render();}
function finRangeMenuHTML(){
 const m=finRangeMenu;if(!m||!finRangeState(m.target))return '';
 const top=Math.max(8,Math.min(m.y,window.innerHeight-80)),style=`left:${Math.max(8,Math.min(m.x,window.innerWidth-(m.w||340)-8))}px;top:${top}px`;
 return `<div class="sl-backdrop fin-range-back" onclick="finRangeClose()"></div><div class="sl-menu sl-date-menu fin-range-menu" style="${style}" role="dialog" aria-label="Statement period"><div class="sl-date-presets">${FIN_STATEMENT_RANGE.map(([k,v])=>{const r=salesListPresetRange(k),on=r&&r[0]===m.from&&r[1]===m.to;return `<button type="button" class="sl-btn${on?' on':''}" data-range-preset="${k}" onclick="finRangePreset('${k}')">${v}</button>`;}).join('')}</div>
  <div class="sl-date-inputs"><label>From<input type="date" data-range-from value="${esc(m.from)}" oninput="finRangeInput('from',this.value)"></label><label>To<input type="date" data-range-to value="${esc(m.to)}" oninput="finRangeInput('to',this.value)"></label></div>
  ${m.error?`<p class="sl-range-error" role="alert">${esc(m.error)}</p>`:''}<div class="sl-date-actions"><span class="sp"></span><button type="button" class="pri" data-range-apply onclick="finRangeApply()">Apply</button></div></div>`;
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&finRangeMenu){e.preventDefault();finRangeClose();}});

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
