/* =====================================================================
   views/finance  ·  finance-1.1
   Вкладка Payments, форма оплаты, зачёт депозита и полоса оплат в шапке
   заказа. Остальной экран — views/finance-workspace.
   IN : DB.receipt, DB.salesOrder, DB.customer
   OUT: квитанции, разнесение, CSV для QuickBooks
   Владелец, 14 сентября 2026: оплату вносят на отдельном экране Finance, в
   заказе видны Receipt total и Balance — «чтобы прежде чем выдать клиенту
   заказ, мы знали, нужно ли ему доплатить». Ошибочная оплата — Void.
   ===================================================================== */

let finRecordBaseline='',finRecordBaselineId='';
let finTab='accounts',finEdit=null,finDraft=null,finApply=null;

function finFmt(v){return v==null||!Number.isFinite(+v)?'—':(v<0?'−$':'$')+Math.abs(+v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function finCustomerName(c){return c?(c.displayName||c.legalName||c.code):'—';}
function finSetTab(t){if(!finCanLeave())return;finTab=['accounts','schedule','receipts'].includes(t)?t:'accounts';finEdit=null;finDraft=null;finAction=null;finAccountId='';render();}
function viewFinance(){return finWorkspaceHTML();}

/* Таблица Payments — views/finance-lists (фильтры колонок как в Sales). */

/* ------------------------------ Форма -------------------------------- */
function finNewReceipt(customerId){
 if(!finCanLeave())return false;
 finRecordBaseline='';finRecordBaselineId='';finTab='receipts';finEdit='new';
 finDraft={customerId:customerId&&salesFindCustomer(customerId)?customerId:'',date:finToday(),method:'cash',reference:'',amount:'',note:'',apply:{},currency:'CAD',reason:'',duplicate:false};
 finDraftBaseline=JSON.stringify(finDraft);render();return true;
}
function finOpenReceipt(id){
 if(!finCanLeave())return;
 const r=(DB.receipt||[]).find(x=>x.id===id);if(!r)return;
 finRecordBaseline=JSON.stringify(r);finRecordBaselineId=id;finTab='receipts';finEdit=id;
 finDraft={customerId:r.customerId,date:r.date,method:r.method,reference:r.reference,amount:String(r.amount),note:r.note,apply:Object.fromEntries(r.allocations.map(a=>[a.orderId,String(a.amount)])),currency:finCurrency(r),reason:'',duplicate:false};
 finDraftBaseline=JSON.stringify(finDraft);render();
}
function finCloseReceipt(force){if(!force&&!finCanLeave())return;finEdit=null;finDraft=null;finDraftBaseline='';render();}
/* Заказы клиента для разнесения: долг считается «до этой квитанции» — при
   правке уже разнесённая ею сумма возвращается в долг заказа. */
function finFormOrders(){
 const d=finDraft;if(!d||!d.customerId)return [];
 const own=finEdit!=='new'&&(DB.receipt||[]).find(x=>x.id===finEdit)||null;
 return (DB.salesOrder||[]).filter(o=>o.customerId===d.customerId&&finOrderCounts(o)&&finCurrency(o)==='CAD').map(o=>{
  const b=finOrderBalance(o),mine=own&&!own.voided?((own.allocations.find(a=>a.orderId===o.id)||{}).amount||0):0;
  return {order:o,total:b.total,paid:finMoney(b.paid-mine),balance:b.balance==null?null:finMoney(b.balance+mine),status:b.status};
 }).filter(x=>x.balance!=null&&(x.balance>0||finMoney(d.apply[x.order.id]||0)>0))
  .sort((a,b)=>String(a.order.businessNumber).localeCompare(String(b.order.businessNumber)));
}
function finFormNoPrice(){
 const d=finDraft;if(!d||!d.customerId)return 0;
 return (DB.salesOrder||[]).filter(o=>o.customerId===d.customerId&&finOrderCounts(o)&&finOrderBalance(o).status==='incomplete').length;
}
/* Кредитка без сбора в заказе — цех платит процент сам. Подсказка стоит у
   заказа в форме оплаты и добавляет сбор одной кнопкой; дебет не трогаем. */
function finCardFeeTag(o){
 const c=o.orderCharges&&o.orderCharges.card;if(!c||c.enabled)return '';
 return `<div class="fin-card-fee">No card fee <button type="button" class="sm" onclick="finAddCardFee('${esc(o.id)}')">Add ${esc(c.rate)}%</button></div>`;
}
function finAddCardFee(orderId){
 const o=(DB.salesOrder||[]).find(x=>x.id===orderId),c=o&&o.orderCharges&&o.orderCharges.card;if(!c||c.enabled)return;
 const was=o.updatedAt;c.enabled=true;o.updatedAt=new Date().toISOString();
 if(touch()===false){c.enabled=false;o.updatedAt=was;alert('Not saved. Try again or export a backup.');return;}
 if(soDraft&&soDraft.id===orderId&&soDraft.orderCharges&&soDraft.orderCharges.card)soDraft.orderCharges.card.enabled=true;
 render();
}
function finSummaryHTML(amount,applied,refunded){
 refunded=refunded||0;const left=finMoney(amount-applied-refunded);
 return `<span>Receipt <b>${finFmt(amount)}</b></span><span>Applied <b>${finFmt(applied)}</b></span>${refunded?`<span>Refunded <b>${finFmt(refunded)}</b></span>`:''}${left<0?`<span class="fin-over">Applied more than received by <b>${finFmt(-left)}</b></span>`:`<span>Left on account (deposit) <b class="fin-deposit">${finFmt(left)}</b></span>`}`;
}
function finFormApplied(){return finMoney(finFormOrders().reduce((s,x)=>s+Math.max(0,finMoney(finDraft.apply[x.order.id]||0)),0));}
function finRefreshSummary(){const el=document.getElementById('finSummary');if(el&&finDraft)el.innerHTML=finReceiptSummary();}
function finApplyInput(orderId,value){if(!finDraft)return;finDraft.apply[orderId]=value;finRefreshSummary();}
/* Max: заказ оплачивается целиком. Сумма квитанции ещё не введена — она сама
   становится суммой разнесения; введена — в заказ идёт не больше остатка. */
function finApplyMax(orderId){
 const row=finFormOrders().find(x=>x.order.id===orderId);if(!row||!finDraft)return;
 const others=finMoney(finFormOrders().filter(x=>x.order.id!==orderId).reduce((s,x)=>s+Math.max(0,finMoney(finDraft.apply[x.order.id]||0)),0));
 const amount=finMoney(finDraft.amount)-(finEdit!=='new'?finRefunded(finEdit):0);
 if(!(amount>0)){finDraft.apply[orderId]=row.balance.toFixed(2);finDraft.amount=finMoney(others+row.balance).toFixed(2);}
 else finDraft.apply[orderId]=Math.max(0,Math.min(row.balance,finMoney(amount-others))).toFixed(2);
 render();
}
function finReceiptForm(){
 const d=finDraft,r=finEdit!=='new'?(DB.receipt||[]).find(x=>x.id===finEdit):null,locked=!!(r&&(r.voided||finCurrency(r)!=='CAD')),dis=locked?' disabled':'';
 const customers=(DB.customer||[]).filter(c=>c.status!=='archived'||c.id===d.customerId),rows=finFormOrders(),noPrice=finFormNoPrice();
 const ph=({cheque:'Cheque #',etransfer:'Transfer reference',debit:'Last 4 digits or approval #',creditcard:'Last 4 digits or approval #',card:'Last 4 digits or approval #'})[d.method]||'Optional';
 const table=!d.customerId?'<p class="mut">Select a customer to apply the receipt to orders.</p>':rows.length?`<h4 class="fin-h4">Apply to orders of this customer</h4>
  <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Order</th><th>Customer PO</th><th class="n">Order total</th><th class="n">Paid before</th><th class="n">Balance</th><th class="n">Apply now</th></tr></thead><tbody>${rows.map(x=>`<tr>
   <td><b class="mono">${raw(x.order.businessNumber||'draft')}</b>${!locked&&d.method==='creditcard'?finCardFeeTag(x.order):''}</td><td>${raw(x.order.customerPo||'—')}</td><td class="n">${finFmt(x.total)}</td><td class="n">${finFmt(x.paid)}</td><td class="n"><b>${finFmt(x.balance)}</b></td>
   <td class="n fin-apply-cell"><div><input type="number" min="0" step="0.01" data-fin-apply="${esc(x.order.id)}"${dis} value="${esc(d.apply[x.order.id]||'')}" placeholder="0.00" oninput="finApplyInput('${esc(x.order.id)}',this.value)">${locked?'':`<button type="button" class="sm" onclick="finApplyMax('${esc(x.order.id)}')">Max</button>`}</div></td></tr>`).join('')}</tbody></table></div>`
  :'<p class="mut fin-apply-empty">This customer has no orders with a balance due — the whole amount stays on account as a deposit.</p>';
 return `<div class="fin-form"><div class="fin-form-head"><h3>${r?'Receipt '+raw(r.number):'New receipt'}</h3>${locked?`<span class="pill bad">Void</span><span class="mut">${raw(r.voidReason)}</span>`:''}</div>
 <div class="fin-grid">
  <div class="fin-span2"><label>Customer *</label><select${r?' disabled':dis} aria-label="Payment customer" onchange="finDraft.customerId=this.value;finDraft.apply={};render()"><option value="">— select customer —</option>${customers.map(c=>`<option data-raw value="${esc(c.id)}" ${c.id===d.customerId?'selected':''}>${esc(c.code||'')} · ${esc(finCustomerName(c))}</option>`).join('')}</select>${!r&&d.customerId&&finCustomerDeposit(d.customerId)>0?`<div class="mut small">Already on account ${finFmt(finCustomerDeposit(d.customerId))}</div>`:''}</div>
  <div><label>Date</label><input type="date"${dis} value="${esc(d.date)}" onchange="finDraft.date=this.value"></div>
  <div class="fin-span2"><label>Method</label><div class="fin-seg">${finMethodChoices(d.method).map(m=>`<button type="button"${dis} data-fin-method="${m.k}" class="${d.method===m.k?'on':''}" onclick="finDraft.method='${m.k}';render()">${m.label}</button>`).join('')}</div></div>
  <div><label>Amount · CAD *</label><input type="number" min="0" step="0.01" id="finAmount"${dis} value="${esc(d.amount)}" oninput="finDraft.amount=this.value;finRefreshSummary()"></div>
  <div class="fin-span2"><label>Reference</label><input${dis} id="finReference" value="${esc(d.reference)}" placeholder="${ph}" oninput="finDraft.reference=this.value"></div>
  <div class="fin-span4"><label>Note</label><input${dis} id="finNote" value="${esc(d.note)}" oninput="finDraft.note=this.value"></div>
 </div>
 ${r?finReceiptTools(r):''}${table}${noPrice?`<p class="mut small">${noPrice} order${noPrice===1?'':'s'} without a complete price ${noPrice===1?'is':'are'} not listed: its balance cannot be calculated.</p>`:''}
 <div class="fin-summary" id="finSummary">${finReceiptSummary()}</div>
 ${r&&!locked?`<label>Correction reason *</label><input id="finCorrectionReason" value="${esc(d.reason||'')}" oninput="finDraft.reason=this.value" placeholder="Explain what changed and why">`:''}
 ${finReceiptDuplicates(d,finEdit==='new'?null:finEdit).length?`<label class="fin-duplicate"><input type="checkbox" ${d.duplicate?'checked':''} onchange="finDraft.duplicate=this.checked"> Same reference already exists. I reviewed the payment and intend to record another.</label>`:''}
 <div class="err" id="e_fin"></div>
 <div class="fin-form-actions"><button type="button" onclick="finCloseReceipt()">${locked?'Back':'Cancel'}</button>${r&&!locked?'<button type="button" class="dl" onclick="finVoidCurrent()">Void receipt</button>':''}${locked?'':'<button type="button" class="pri" onclick="finSaveReceipt()">Save receipt</button>'}</div>${r&&finHistoryFor(r.id).length?`<details class="fin-history-box"><summary>History · ${finHistoryFor(r.id).length}</summary>${finJournalTable(finHistoryFor(r.id))}</details>`:''}</div>`;
}
function finSaveReceipt(){
 const e=document.getElementById('e_fin');if(e)e.style.display='none';if(!finDraft)return;
 if(finEdit!=='new'&&finRecordBaselineId===finEdit&&JSON.stringify((DB.receipt||[]).find(r=>r.id===finEdit))!==finRecordBaseline){fail(e,'This payment changed elsewhere. Reopen it before correcting it; your draft is still available.');return false;}
 const d=Object.assign({},finDraft,{allocations:Object.entries(finDraft.apply).map(([orderId,amount])=>({orderId,amount:amount===''?0:amount}))});
 const out=finPersist(()=>finSaveReceiptRecord(d,finEdit==='new'?null:finEdit,d.reason,d.duplicate));
 if(!out.ok){if(/reference already exists/.test(out.error)){render();}return fail(document.getElementById('e_fin'),out.error);}
 finCloseReceipt(true);
}
function finVoidCurrent(){
 const r=(DB.receipt||[]).find(x=>x.id===finEdit);if(!r)return;
 const reason=window.prompt('Void receipt '+r.number+'. Reason:','');
 if(reason===null)return;
 if(!String(reason).trim()){alert('Enter a reason to void the receipt.');return;}
 const out=finPersist(()=>finVoidReceipt(r.id,reason));if(!out.ok)return fail(document.getElementById('e_fin'),finRefunded(r.id)>0?'Void the refund record first. A payment with an active refund cannot be voided.':out.error);finCloseReceipt(true);
}

/* --------------------- Переход к оплатам клиента/заказа --------------- */
/* Переход «все оплаты клиента / заказа»: фильтры колонок снимаются, иначе
   старая оплата спряталась бы за периодом по умолчанию. */
function finPaymentsClearFilters(){salesListMenu=null;const p=salesListLoadPrefs();p.filters={};salesListSavePrefs();}
function finShowCustomer(id){if(!finCanLeave())return;tab='finance';finTab='receipts';finEdit=null;finDraft=null;finCustomerFilter=id;finOrderFilter='';finPaymentsClearFilters();render();}
function finShowOrder(orderId){if(typeof salesLeaveDraft==='function'&&soDraft&&salesDraftHasWork()){salesLeaveDraft(()=>finShowOrder(orderId));return;}if(!finCanLeave())return;tab='finance';subtab=null;finTab='receipts';finEdit=null;finDraft=null;finCustomerFilter='';finOrderFilter=orderId;finPaymentsClearFilters();render();}

/* ---------------------------- Зачёт депозита -------------------------- */
function finDueOrders(customerId){
 return (DB.salesOrder||[]).filter(o=>o.customerId===customerId&&finOrderCounts(o)).map(o=>({order:o,b:finOrderBalance(o)})).filter(x=>x.b.status==='due').map(x=>({order:x.order,balance:x.b.balance}));
}
function finOpenApply(customerId,orderId){
 const orders=finDueOrders(customerId),dep=finCustomerDeposit(customerId),row=orders.find(x=>x.order.id===orderId)||orders[0];
 finApply={customerId,orderId:row?row.order.id:'',amount:row?Math.min(dep,row.balance).toFixed(2):''};
 render();
}
function finSetApplyOrder(orderId){
 if(!finApply)return;
 const row=finDueOrders(finApply.customerId).find(x=>x.order.id===orderId),dep=finCustomerDeposit(finApply.customerId);
 finApply.orderId=orderId;finApply.amount=row?Math.min(dep,row.balance).toFixed(2):'';render();
}
function finCloseApply(){finApply=null;render();}
function finConfirmApply(){
 const e=document.getElementById('e_fin_apply');if(!finApply)return;
 const out=finPersist(()=>{const done=finApplyDeposit(finApply.customerId,finApply.orderId,finApply.amount);finAssert(done>0,'Nothing applied: check the amount and the order balance.');return done;});
 if(!out.ok)return fail(e,out.error);finApply=null;render();
}
function finApplyModal(){
 if(!finApply)return '';
 const c=salesFindCustomer(finApply.customerId);if(!c)return '';
 const dep=finCustomerDeposit(c.id),orders=finDueOrders(c.id);
 return `<div class="sales-service-modal-back fin-modal-back" onclick="if(event.target===this)finCloseApply()"><div class="sales-service-modal fin-modal" role="dialog" aria-modal="true" aria-label="Apply deposit">
  <div class="sales-service-modal-head"><h3>Apply deposit · ${raw(finCustomerName(c))}</h3><button type="button" aria-label="Close" onclick="finCloseApply()">×</button></div>
  <div class="fin-modal-body"><p>On account: <b class="fin-deposit">${finFmt(dep)}</b></p>
  ${orders.length?`<div class="fin-grid"><div class="fin-span4"><label>Order</label><select id="finApplyOrder" onchange="finSetApplyOrder(this.value)">${orders.map(x=>`<option value="${esc(x.order.id)}" ${x.order.id===finApply.orderId?'selected':''}>${esc(x.order.businessNumber||'draft')} · balance ${finFmt(x.balance)}</option>`).join('')}</select></div><div class="fin-span2"><label>Amount</label><input type="number" min="0" step="0.01" id="finApplyAmount" value="${esc(finApply.amount)}" oninput="finApply.amount=this.value"></div></div>`:'<p class="mut">No orders with a balance due.</p>'}
  <div class="err" id="e_fin_apply"></div>
  <div class="fin-form-actions"><button type="button" onclick="finCloseApply()">Cancel</button>${orders.length?'<button type="button" class="pri" onclick="finConfirmApply()">Apply</button>':''}</div></div></div></div>`;
}

/* ------------------------- Оплаты в заказе ---------------------------- */
function salesOrderIsSaved(o){return !!o&&soEdit!=='new'&&(DB.salesOrder||[]).some(x=>x.id===o.id);}
/* Полоса в шапке заказа: красное — только когда надо действовать (просрочка,
   нет депозита, клиент на Hold). Долг Net-клиента до срока — обычная
   информация со сроком, а не тревога. */
function salesPaymentStrip(o){
 if(!salesOrderIsSaved(o))return '<div class="fin-strip fin-strip-new">Save the order to take payments</div>';
 /* Отменённый заказ не долг: его оплаты ушли на депозит клиента. */
 if(!finOrderCounts(o))return '<div class="fin-strip fin-strip-new">Cancelled — not counted in the customer balance</div>';
 const f=finOrderFinancial(o),b=f.b;
 return `<div class="fin-strip">${finStatusPill(f)}<div><small>Order total</small><b>${finFmt(b.total)}</b></div><div><small>Paid</small><b>${finFmt(b.paid)}</b></div><div><small>Balance</small><b class="${f.tone==='bad'?'fin-due':b.status==='paid'?'fin-paid':''}">${finFmt(b.balance)}</b></div><button type="button" class="sm" onclick="finShowOrder('${esc(o.id)}')">Payments</button></div>`;
}
function salesDepositHint(o){
 if(!salesOrderIsSaved(o)||!o.customerId||!finOrderCounts(o))return '';
 const saved=DB.salesOrder.find(x=>x.id===o.id),b=finOrderBalance(saved),dep=finCustomerDeposit(o.customerId),c=salesFindCustomer(o.customerId),out=[];
 if(dep>0&&b.status==='due')out.push(`<div class="fin-hint">${raw(finCustomerName(c))} has <b>${finFmt(dep)}</b> on account. <button type="button" class="sm" onclick="finOpenApply('${esc(o.customerId)}','${esc(o.id)}')">Apply deposit to this order</button></div>`);
 if(b.status==='overpaid')out.push(`<div class="fin-hint">Receipts exceed the saved order total by <b>${finFmt(-b.balance)}</b>. <button type="button" class="sm" onclick="finMoveOverpayment('${esc(o.id)}')">Move to deposit on account</button></div>`);
 return out.join('');
}
function finMoveOverpayment(orderId){const o=(DB.salesOrder||[]).find(x=>x.id===orderId);if(!o)return;const out=finPersist(()=>finReleaseOverpayment(o));if(!out.ok)alert(out.error);render();}
function salesListBalanceCells(o){
 if(!finOrderCounts(o)){const t=finOrderTotals(o);return `<td class="n mut">${finFmt(t.complete?finMoney(t.grand):null)}</td><td class="n mut">—</td><td class="n mut">—</td>`;}
 const f=finOrderFinancial(o),b=f.b;
 return `<td class="n">${finFmt(b.total)}</td><td class="n">${finFmt(b.paid)}</td><td class="n">${b.status==='due'?(f.tone==='bad'?`<span class="pill bad" title="${esc(f.status)}">${finFmt(b.balance)}</span>`:`<span title="${esc(f.status)}">${finFmt(b.balance)}</span>`):b.status==='paid'?'<span class="pill good">Paid</span>':b.status==='overpaid'?`<span class="pill info">Overpaid ${finFmt(-b.balance)}</span>`:'<span class="mut">—</span>'}</td>`;
}
