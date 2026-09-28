/* =====================================================================
   views/finance-workspace  ·  finance-1.1
   Экран Finance. Сверху две цифры, по которым действуют: Overdue и деньги
   на счетах клиентов (On account). Три вкладки: Accounts, Due dates,
   Payments. Журнал изменений пишется всегда, а показывается там, где он
   нужен, — в оплате и в карточке клиента (владелец, 28 сентября 2026:
   «минималистично и эффективно»). Команды — в finance/ledger; экран денег
   не придумывает.
   ===================================================================== */
let finCustomerFilter='',finOrderFilter='',finAccountId='',finAccountQuery='',finAccountMode='open',finAccountPaid=false,finDraftBaseline='',finAction=null,finActionBaseline='',finPreview=null;
function finHasWork(){return !!(finDraft&&JSON.stringify(finDraft)!==finDraftBaseline||finAction&&JSON.stringify(finAction)!==finActionBaseline);}
function finCanLeave(){return !finHasWork()||confirm('Discard unsaved finance changes?');}
(window.NAV_GUARDS=window.NAV_GUARDS||[]).push(function(k,go){
 if(tab!=='finance')return false;if(!finCanLeave())return true;
 finDraft=null;finEdit=null;finAction=null;finApply=null;finPreview=null;return false;
});
window.addEventListener('beforeunload',function(e){if(!finHasWork())return;e.preventDefault();e.returnValue='';});
function finResetFilters(){finCustomerFilter='';finOrderFilter='';finSearch='';finFrom='';finTo='';render();}
function finFilterChips(){
 const c=salesFindCustomer(finCustomerFilter);
 return finCustomerFilter||finOrderFilter?`<div class="fin-scope"><span>${esc(c?finCustomerName(c):'Order '+finOrderNumber(finOrderFilter))}</span><button class="sm" onclick="finResetFilters()">Show all</button></div>`:'';
}
const FIN_TABS=[['accounts','Accounts'],['schedule','Due dates'],['receipts','Payments']];
function finWorkspaceHTML(){
 return `<div class="card fin-card"><div class="fin-workspace-head">${finOverviewHTML()}<button type="button" class="pri" onclick="finNewReceipt()">+ New receipt</button></div>
 <div class="tabs" role="tablist" aria-label="Finance sections">${FIN_TABS.map(t=>`<button role="tab" aria-selected="${finTab===t[0]}" class="${finTab===t[0]?'on':''}" onclick="finSetTab('${t[0]}')">${t[1]}</button>`).join('')}</div>
 ${finTab==='accounts'?(finAccountId?finAccountHTML():finAccountsWorkspace()):finTab==='schedule'?finScheduleHTML():finEdit!==null?finReceiptForm():finReceiptsView()}</div>${finApplyModal()}${finActionHTML()}${finPreviewHTML()}`;
}
/* Две цифры и переход к списку за ними — не статистика, а что делать. */
function finOverviewHTML(){
 const overdue=finMoney((DB.salesOrder||[]).filter(finOrderCounts).reduce((s,o)=>s+finOrderFinancial(o).overdue,0));
 const deposit=finMoney(finActiveReceipts().filter(r=>finCurrency(r)==='CAD').reduce((s,r)=>s+finReceiptOnAccount(r),0));
 return `<div class="fin-overview"><button type="button" class="fin-stat${overdue>0?' bad':''}" onclick="finGoOverdue()"><span>Overdue</span><strong>${finFmt(overdue)}</strong></button><button type="button" class="fin-stat" onclick="finGoDeposits()"><span>On account</span><strong>${finFmt(deposit)}</strong></button></div>`;
}
function finGoOverdue(){if(!finCanLeave())return;finDraft=null;finEdit=null;finAccountId='';finTab='schedule';finSchedule=Object.assign({},finSchedule,{period:'overdue'});render();}
function finGoDeposits(){if(!finCanLeave())return;finDraft=null;finEdit=null;finAccountId='';finTab='accounts';finAccountMode='deposit';render();}

/* ------------------------------ Accounts ----------------------------- */
const FIN_ACCOUNT_MODES=[['open','Open accounts'],['overdue','Overdue'],['deposit','Money on account'],['all','All customers']];
function finAccountMetrics(c){
 const rows=(DB.salesOrder||[]).filter(o=>o.customerId===c.id&&finOrderCounts(o)).map(o=>({o,f:finOrderFinancial(o)}));
 return {rows,account:finCustomerAccount(c),overdue:finMoney(rows.reduce((s,x)=>s+x.f.overdue,0))};
}
function finAccountOpen(m){const a=m.account;return a.balanceDue>0||a.deposit>0||a.incomplete>0;}
function finAccountsList(){
 const q=finAccountQuery.trim().toLowerCase();
 return (DB.customer||[]).map(c=>({c,m:finAccountMetrics(c)})).filter(({c,m})=>{
  if(q&&![c.code,c.legalName,c.displayName].join(' ').toLowerCase().includes(q))return false;
  if(finAccountMode==='overdue')return m.overdue>0;
  if(finAccountMode==='deposit')return m.account.deposit>0;
  if(finAccountMode==='all')return c.status!=='archived'||finAccountOpen(m);
  return finAccountOpen(m);
 }).sort((x,y)=>y.m.overdue-x.m.overdue||y.m.account.balanceDue-x.m.account.balanceDue||finCustomerName(x.c).localeCompare(finCustomerName(y.c)));
}
function finAccountsWorkspace(){
 const list=finAccountsList();
 return `<div class="fin-toolbar"><input id="finAccountSearch" aria-label="Search customer accounts" placeholder="Search customer…" value="${esc(finAccountQuery)}" oninput="finAccountQuery=this.value;finRerenderInput('finAccountSearch')"><select aria-label="Account filter" onchange="finAccountMode=this.value;render()">${FIN_ACCOUNT_MODES.map(([k,v])=>`<option value="${k}" ${finAccountMode===k?'selected':''}>${v}</option>`).join('')}</select></div>
 <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Customer</th><th>Terms</th><th class="n">Balance</th><th class="n">Overdue</th><th class="n">On account</th><th class="n">Credit limit</th><th></th></tr></thead><tbody>${list.map(({c,m})=>{const a=m.account;return `<tr data-account="${esc(c.id)}"><td><button class="fin-link" onclick="finOpenAccount('${esc(c.id)}')">${raw(finCustomerName(c))}</button><div class="mut small">${raw(c.code)}${c.status==='archived'?' · Archived':''}</div></td><td>${esc(a.terms)}</td><td class="n"><b>${finFmt(a.balanceDue)}</b>${a.incomplete?`<div class="mut small">${a.incomplete} not priced</div>`:''}</td><td class="n">${m.overdue>0?`<b class="fin-due">${finFmt(m.overdue)}</b>`:'<span class="mut">—</span>'}</td><td class="n">${a.deposit>0?`<span class="fin-deposit">${finFmt(a.deposit)}</span>`:'<span class="mut">—</span>'}</td><td class="n">${a.creditLimit==null?'<span class="mut">—</span>':finFmt(a.creditLimit)}${a.overLimit?'<div><span class="pill bad">Over limit</span></div>':''}</td><td class="fin-actions">${a.deposit>0&&a.balanceDue>0?`<button class="sm" onclick="finOpenApply('${esc(c.id)}')">Apply deposit</button>`:''}</td></tr>`;}).join('')||`<tr><td colspan="7" class="empty">${finAccountMode==='open'&&!finAccountQuery?'No open balances':'No accounts match'}</td></tr>`}</tbody></table></div>`;
}
function finRerenderInput(id){const el=document.getElementById(id),pos=el&&el.selectionStart;render();const next=document.getElementById(id);if(next){next.focus();if(pos!=null)next.setSelectionRange(pos,pos);}}
function finOpenAccount(id){if(!finCanLeave())return;finDraft=null;finEdit=null;finAction=null;tab='finance';finTab='accounts';finAccountId=id;finAccountPaid=false;render();}
function finStatusPill(f){return `<span class="pill ${f.tone}">${esc(f.status)}</span>`;}
function finAccountHTML(){
 const c=salesFindCustomer(finAccountId);if(!c)return '<p>Customer not found.</p>';
 const m=finAccountMetrics(c),a=m.account,open=m.rows.filter(x=>x.f.b.balance!==0),paid=m.rows.length-open.length,rows=finAccountPaid?m.rows:open;
 const receipts=DB.receipt.filter(r=>r.customerId===c.id).sort((x,y)=>(y.date+y.number).localeCompare(x.date+x.number)),refunds=DB.refund.filter(r=>r.customerId===c.id).sort((x,y)=>(y.date+y.number).localeCompare(x.date+x.number)),events=DB.financeEvent.filter(e=>e.customerId===c.id);
 return `<div class="fin-account-head"><div><button class="sm" onclick="finAccountId='';render()">← Accounts</button><h3>${raw(finCustomerName(c))}</h3><span class="mut">${raw(c.code)} · ${esc(a.terms)}${c.status==='archived'?' · Archived':''}${c.onHold?' · <b class="fin-due">On hold</b>':''}</span></div><div class="row"><button onclick="finOpenPreview('statement','${esc(c.id)}')">Statement</button><button class="pri" onclick="finNewReceipt('${esc(c.id)}')">+ Receipt</button></div></div>
 <div class="fin-account-totals"><span>Balance <b>${finFmt(a.balanceDue)}</b></span><span>Overdue <b class="${m.overdue>0?'fin-due':''}">${finFmt(m.overdue)}</b></span><span>On account <b class="fin-deposit">${finFmt(a.deposit)}</b>${a.deposit>0&&a.balanceDue>0?`<button class="sm" onclick="finOpenApply('${esc(c.id)}')">Apply</button>`:''}</span>${a.creditLimit!=null?`<span>Credit limit <b class="${a.overLimit?'fin-due':''}">${finFmt(a.creditLimit)}</b></span>`:''}</div>
 <h4>Orders</h4><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Order / PO</th><th>Billed</th><th>Due</th><th class="n">Total</th><th class="n">Paid</th><th class="n">Balance</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(({o,f})=>`<tr data-order="${esc(o.id)}"><td><button class="fin-link" onclick="finOpenSales('${esc(o.id)}')">${esc(o.businessNumber)}</button><div class="mut small">${raw(o.customerPo||'—')}</div></td><td>${esc(finBillingDate(o)?finShortDate(finBillingDate(o)):'—')}</td><td class="${f.overdue?'fin-due':''}">${esc(f.dueOn?finShortDate(f.dueOn):'—')}</td><td class="n">${finFmt(f.b.total)}</td><td class="n">${finFmt(f.b.paid)}</td><td class="n"><b>${finFmt(f.b.balance)}</b></td><td>${finStatusPill(f)}</td><td class="fin-actions"><button class="sm" onclick="finEditTerms('${esc(o.id)}')">Terms</button></td></tr>`).join('')||`<tr><td colspan="8" class="empty">No open orders</td></tr>`}</tbody></table></div>
 ${paid?`<button class="sm fin-more" onclick="finAccountPaid=!finAccountPaid;render()">${finAccountPaid?'Hide paid orders':'Show paid orders ('+paid+')'}</button>`:''}
 <h4>Payments</h4><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Receipt</th><th>Date</th><th>Method · reference</th><th class="n">Amount</th><th class="n">Applied</th><th class="n">Refunded</th><th class="n">On account</th></tr></thead><tbody>${receipts.map(r=>`<tr class="${r.voided?'fin-void':''}"><td><button class="fin-link" onclick="finOpenReceipt('${esc(r.id)}')">${esc(r.number)}</button>${r.voided?' <span class="pill bad">Void</span>':''}</td><td>${esc(r.date)}</td><td>${esc(finMethodLabel(r.method))}${r.reference?` <span class="mut">${raw(r.reference)}</span>`:''}</td><td class="n"><b>${finFmt(r.amount)}</b></td><td class="n">${finFmt(finReceiptApplied(r))}</td><td class="n">${finRefunded(r.id)>0?finFmt(finRefunded(r.id)):'<span class="mut">—</span>'}</td><td class="n">${finReceiptOnAccount(r)>0?`<span class="fin-deposit">${finFmt(finReceiptOnAccount(r))}</span>`:'<span class="mut">—</span>'}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">No payments yet</td></tr>'}</tbody></table></div>
 ${refunds.length?'<h4>Refunds</h4>'+finRefundTable(refunds):''}
 ${events.length?`<details class="fin-history-box"><summary>History · ${events.length}</summary>${finJournalTable(events)}</details>`:''}`;
}
function finOpenSales(id){if(!finCanLeave())return;const go=()=>{finDraft=null;finEdit=null;tab='sales';salesOrderEdit(id);};if(soDraft&&salesDraftHasWork())salesLeaveDraft(go);else go();}

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
 `<p>Available <b>${finFmt(r?finReceiptOnAccount(r):0)}</b></p><div class="fin-grid"><label class="fin-span3">Amount · CAD<input id="finRefundAmount" type="number" min="0.01" step="0.01" value="${esc(d.amount)}" oninput="finAction.amount=this.value"></label><label class="fin-span3">Date<input type="date" value="${esc(d.date)}" onchange="finAction.date=this.value"></label><label class="fin-span3">Method<select onchange="finAction.method=this.value">${FIN_METHODS.map(m=>`<option value="${m.k}" ${d.method===m.k?'selected':''}>${m.label}</option>`).join('')}</select></label><label class="fin-span3">Reference<input value="${esc(d.reference)}" oninput="finAction.reference=this.value"></label></div><label>Reason *<input id="finActionReason" value="${esc(d.reason)}" oninput="finAction.reason=this.value"></label>`}
 <div class="err" id="e_fin_action"></div><div class="fin-form-actions"><button onclick="finCloseAction()">Cancel</button><button class="pri" onclick="finSaveAction()">${terms?'Save terms':'Record refund'}</button></div></div></div></div>`;
}
function finSaveAction(){if(!finAction)return;const d=finCopy(finAction),out=finPersist(()=>d.type==='terms'?finSaveTerms(d.orderId,d,d.reason):finCreateRefund(d));if(!out.ok)return fail(document.getElementById('e_fin_action'),out.error);finAction=null;render();}
function finRefundTable(rows){return `<div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Refund</th><th>Date</th><th>Payment</th><th class="n">Amount</th><th>Method · reference</th><th>Reason</th><th></th></tr></thead><tbody>${rows.map(r=>{const p=DB.receipt.find(p=>p.id===r.receiptId);return `<tr class="${r.voided?'fin-void':''}"><td><b>${esc(r.number)}</b>${r.voided?' <span class="pill bad">Void</span>':''}</td><td>${esc(r.date)}</td><td><button class="fin-link" onclick="finOpenReceipt('${esc(r.receiptId)}')">${esc(p?p.number:r.receiptId)}</button></td><td class="n">${finFmt(r.amount)}</td><td>${esc(finMethodLabel(r.method))}${r.reference?` <span class="mut">${raw(r.reference)}</span>`:''}</td><td>${raw(r.voided?r.voidReason:r.reason)}</td><td class="fin-actions">${r.voided?'':`<button class="sm" onclick="finVoidRefundUI('${esc(r.id)}')">Void</button>`}</td></tr>`;}).join('')}</tbody></table></div>`;}
function finVoidRefundUI(id){const reason=prompt('Void this refund record. Reason:','');if(reason===null)return;const out=finPersist(()=>finVoidRefund(id,reason));if(!out.ok)return alert(out.error);render();}

/* ------------------------------ Журнал ------------------------------- */
function finSnapshotHTML(r,entity,orders){if(!r)return '<span class="mut">—</span>';const fields=entity==='terms'?[['Terms',paymentTermsLabel(r)],['Billing date',r.issuedOn||'Pickup day'],['Due date',r.dueOn||'By terms']]:[['Amount',finFmt(r.amount)+' '+finCurrency(r)],['Date',r.date],['Method',finMethodLabel(r.method)],['Reference',r.reference||'—'],['Status',r.voided?'Void':'Active'],['Note / reason',r.note||r.reason||r.voidReason||'—'],['Applied',(r.allocations||[]).map(a=>(((orders||[]).find(o=>o.id===a.orderId)||{}).number||finOrderNumber(a.orderId))+': '+finFmt(a.amount)).join('; ')||'—']];return `<dl>${fields.map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;}
function finJournalTable(rows){return `<div class="fin-history">${rows.slice().sort((a,b)=>b.seq-a.seq).map(e=>`<details class="fin-event"><summary><span class="fin-event-no">#${e.seq}</span><span><b>${esc(FIN_EVENT_LABELS[e.kind]||e.kind)}</b> · ${esc(e.number)}${e.reason?`<small>${esc(e.reason)}</small>`:''}</span><span class="fin-event-time">${esc(new Date(e.at).toLocaleString('en-CA'))}${e.actor&&e.actor!=='Not specified'?`<small>${esc(e.actor)}</small>`:''}</span></summary><div class="fin-event-diff"><section><h5>Before</h5>${finSnapshotHTML(e.before,e.entity,e.orders)}</section><section><h5>After</h5>${finSnapshotHTML(e.after,e.entity,e.orders)}</section></div></details>`).join('')}</div>`;}

/* ------------------------- Бланки: просмотр -------------------------- */
/* Квитанция, выписка и список сроков открываются как в Documents: лист на
   экране, Print и Email PDF (Gmail с готовым адресом и текстом). */
function finOpenPreview(kind,id){finPreview={kind,id:id||'',status:''};render();}
function finClosePreview(){finPreview=null;render();}
function finPreviewPages(){
 const p=finPreview;if(!p)return [];
 if(p.kind==='receipt')return finReceiptDoc(p.id);
 if(p.kind==='statement')return finStatementDoc(p.id);
 return finScheduleDoc(finDueRows(finSchedule),finSchedule);
}
function finPreviewInfo(){
 const p=finPreview,company=(DB.company||{}).legalName||'';
 if(p.kind==='receipt'){const r=DB.receipt.find(x=>x.id===p.id)||{},c=salesFindCustomer(r.customerId);return {title:'Receipt '+(r.number||''),c,file:'Receipt_'+(r.number||''),subject:['Payment receipt '+(r.number||''),company].filter(Boolean).join(' · '),
  body:'Thank you for your payment of '+docMoney(r.amount)+' received on '+docDate(r.date)+'. Receipt '+r.number+' is attached.'};}
 if(p.kind==='statement'){const c=salesFindCustomer(p.id);return {title:'Statement · '+finCustomerName(c),c,file:'Statement_'+((c&&c.code)||'account')+'_'+finToday(),subject:['Account statement',company].filter(Boolean).join(' · '),
  body:'Please find attached your account statement as of '+docDate(finToday())+'.'};}
 return {title:'Payments due',c:null,file:'Payments_due_'+finToday()};
}
function finPreviewHTML(){
 if(!finPreview)return '';let pages=[],error='';
 try{pages=finPreviewPages();}catch(e){error=e&&e.message||String(e);}
 const info=finPreviewInfo();
 return `<div class="sales-service-modal-back fin-modal-back" onclick="if(event.target===this)finClosePreview()"><div class="sales-service-modal fin-preview" role="dialog" aria-modal="true" aria-label="${esc(info.title)}"><div class="sales-service-modal-head"><h3>${esc(info.title)}</h3><div class="fin-preview-actions"><button type="button" ${pages.length?'':'disabled'} onclick="finPrintPreview()">Print</button>${info.c?`<button type="button" class="pri" ${pages.length?'':'disabled'} onclick="finEmailPreview()">Email PDF</button>`:''}</div><button type="button" aria-label="Close" onclick="finClosePreview()">×</button></div>
 ${finPreview.status?`<div class="fin-hint">${esc(finPreview.status)}</div>`:''}<div class="doc-pages">${error?`<div class="err" style="display:block">${esc(error)}</div>`:pages.map(pg=>`<div class="doc-sheet">${docPageSVG(pg)}</div>`).join('')}</div></div></div>`;
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
function finEmailPreview(){
 const info=finPreviewInfo();if(!info.c)return;let bytes;
 try{bytes=docPdfBytes(finPreviewPages(),{title:info.title});}catch(e){alert('The PDF could not be prepared: '+(e&&e.message||e));return;}
 const file=info.file.replace(/[^A-Za-z0-9-]+/g,'_')+'.pdf',to=info.c.invoiceEmail||customerPrimaryContact(info.c).email||'',first=String(customerPrimaryContact(info.c).name||'').trim().split(/\s+/)[0];
 docDownload(file,bytes);
 const win=window.open(docGmailUrl(to,info.subject,['Hello'+(first?' '+first:'')+',','',info.body,'',(DB.company||{}).legalName||''].join('\n')),'_blank');
 finPreview.status='PDF saved to Downloads as '+file+' — drag it into the Gmail message.'+(to?'':' No email for this customer.')+(win?'':' Allow pop-ups for Gmail.');
 render();
}

/* -------------------------------- CSV -------------------------------- */
/* Движение денег за период для переноса в QuickBooks: оплаты и возвраты
   одной таблицей, возврат — минусом. Импорта в QuickBooks нет. */
function finMovementsCSV(receipts,refunds){
 const who=id=>{const c=salesFindCustomer(id)||{};return [finCustomerName(c),c.code||''];};
 const rows=receipts.map(r=>[r.date,r.number,'Payment',...who(r.customerId),finMethodLabel(r.method),r.reference,r.amount.toFixed(2),finCurrency(r),r.allocations.map(a=>finOrderNumber(a.orderId)+': '+a.amount.toFixed(2)).join('; '),r.voided?'Void':'Active',r.voided?r.voidReason:r.note])
  .concat(refunds.map(x=>[x.date,x.number,'Refund',...who(x.customerId),finMethodLabel(x.method),x.reference,(-x.amount).toFixed(2),x.currency,'Payment '+((DB.receipt.find(r=>r.id===x.receiptId)||{}).number||''),x.voided?'Void':'Active',x.voided?x.voidReason:x.reason]))
  .sort((a,b)=>(a[0]+a[1]).localeCompare(b[0]+b[1]));
 return [['Date','Document','Type','Customer','Account','Method','Reference','Amount','Currency','Applied to orders','Status','Note']].concat(rows).map(row=>row.map(finCsvCell).join(',')).join('\r\n');
}
