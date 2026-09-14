/* =====================================================================
   views/finance  ·  finance-1.0
   Экран Finance (Receipts, Customer accounts), зачёт депозита и полоса
   оплат в шапке заказа.
   IN : DB.receipt, DB.salesOrder, DB.customer
   OUT: квитанции, разнесение, CSV для QuickBooks
   Владелец, 14 сентября 2026: оплату вносят на отдельном экране Finance, в
   заказе видны Receipt total и Balance — «чтобы прежде чем выдать клиенту
   заказ, мы знали, нужно ли ему доплатить». Ошибочная оплата — Void.
   ===================================================================== */

let finTab='receipts',finSearch='',finMethod='',finFrom='',finTo='',finEdit=null,finDraft=null,finApply=null;

function finFmt(v){return v==null||!Number.isFinite(+v)?'—':(v<0?'−$':'$')+Math.abs(+v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function finCustomerName(c){return c?(c.displayName||c.legalName||c.code):'—';}
function finSetTab(t){finTab=t==='accounts'?'accounts':'receipts';finEdit=null;finDraft=null;render();}
function finSearchChange(el){
 finSearch=el.value;const pos=el.selectionStart;render();
 requestAnimationFrame(()=>{const e=document.getElementById('finSearch');if(e){e.focus();try{e.setSelectionRange(pos,pos);}catch(x){}}});
}

function viewFinance(){
 const tabs=[['receipts','Receipts'],['accounts','Customer accounts']].map(t=>`<button class="${finTab===t[0]?'on':''}" onclick="finSetTab('${t[0]}')">${t[1]}</button>`).join('');
 return `<div class="page-head"><div><h2>Finance</h2><p>Customer receipts, deposits on account and order balances. Receipts are entered here; QuickBooks gets them from the CSV export.</p></div></div>
 <div class="card fin-card"><div class="tabs">${tabs}</div>${finTab==='accounts'?finAccountsView():finEdit!==null?finReceiptForm():finReceiptsView()}</div>${finApplyModal()}`;
}

/* ------------------------------ Receipts ----------------------------- */
function finFilteredReceipts(){
 const q=finSearch.trim().toLowerCase();
 return (DB.receipt||[]).filter(r=>{
  if(finMethod&&r.method!==finMethod)return false;
  if(finFrom&&r.date<finFrom)return false;
  if(finTo&&r.date>finTo)return false;
  if(!q)return true;
  const c=salesFindCustomer(r.customerId)||{};
  return [r.number,r.reference,r.note,c.legalName,c.displayName,c.code].concat(r.allocations.map(a=>finOrderNumber(a.orderId))).join(' ').toLowerCase().includes(q);
 }).sort((a,b)=>(b.date+b.number).localeCompare(a.date+a.number));
}
function finReceiptsView(){
 const rows=finFilteredReceipts(),active=rows.filter(r=>!r.voided);
 const methods=[['','All']].concat(FIN_METHODS.map(m=>[m.k,m.label]));
 return `<div class="fin-toolbar"><input class="fin-search" id="finSearch" value="${esc(finSearch)}" placeholder="Search customer, order, cheque #…" oninput="finSearchChange(this)">
  <div class="fin-seg">${methods.map(m=>`<button type="button" class="${finMethod===m[0]?'on':''}" onclick="finMethod='${m[0]}';render()">${m[1]}</button>`).join('')}</div>
  <label class="fin-date">From <input type="date" value="${esc(finFrom)}" onchange="finFrom=this.value;render()"></label><label class="fin-date">To <input type="date" value="${esc(finTo)}" onchange="finTo=this.value;render()"></label>
  <span class="fin-spacer"></span><button type="button" onclick="finExportCsv()">Export CSV for QuickBooks</button><button type="button" class="pri" onclick="finNewReceipt()">+ New receipt</button></div>
 <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Method · reference</th><th class="n">Amount</th><th>Applied to orders</th><th class="n">On account</th><th></th></tr></thead>
 <tbody>${rows.map(finReceiptRow).join('')||'<tr><td colspan="8" class="empty">No receipts yet</td></tr>'}</tbody></table></div>
 ${active.length?`<div class="fin-total">${active.length} receipt${active.length===1?'':'s'} · <b>${finFmt(finMoney(active.reduce((s,r)=>s+r.amount,0)))}</b></div>`:''}`;
}
function finReceiptRow(r){
 const c=salesFindCustomer(r.customerId),free=finReceiptOnAccount(r);
 const applied=r.allocations.length?r.allocations.map(a=>`<div><span class="mono">${raw(finOrderNumber(a.orderId))}</span> · ${finFmt(a.amount)}</div>`).join(''):'<span class="mut">not applied</span>';
 return `<tr class="${r.voided?'fin-void':''}" data-receipt="${esc(r.id)}"><td><b class="mono">${raw(r.number)}</b>${r.voided?' <span class="pill bad">Void</span>':''}</td><td>${esc(r.date)}</td><td><b>${raw(finCustomerName(c))}</b></td>
  <td>${finMethodLabel(r.method)}${r.reference?` <span class="mut">${raw(r.reference)}</span>`:''}</td><td class="n"><b>${finFmt(r.amount)}</b></td>
  <td>${applied}${r.voided&&r.voidReason?`<div class="mut small">Void: ${raw(r.voidReason)}</div>`:''}</td>
  <td class="n">${free>0?`<b class="fin-deposit">${finFmt(free)}</b>`:'<span class="mut">—</span>'}</td>
  <td class="fin-actions"><button class="sm" onclick="finOpenReceipt('${esc(r.id)}')">Open</button></td></tr>`;
}
function finExportCsv(){
 const rows=finFilteredReceipts().slice().reverse();
 customerDownload('receipts'+(finFrom?'_from_'+finFrom:'')+(finTo?'_to_'+finTo:'')+'.csv',finReceiptsCsv(rows),'text/csv;charset=utf-8');
}

/* ------------------------------ Форма -------------------------------- */
function finNewReceipt(customerId){
 finTab='receipts';finEdit='new';
 finDraft={customerId:customerId&&salesFindCustomer(customerId)?customerId:'',date:finToday(),method:'cash',reference:'',amount:'',note:'',apply:{}};
 render();
}
function finOpenReceipt(id){
 const r=(DB.receipt||[]).find(x=>x.id===id);if(!r)return;
 finTab='receipts';finEdit=id;
 finDraft={customerId:r.customerId,date:r.date,method:r.method,reference:r.reference,amount:String(r.amount),note:r.note,apply:Object.fromEntries(r.allocations.map(a=>[a.orderId,String(a.amount)]))};
 render();
}
function finCloseReceipt(){finEdit=null;finDraft=null;render();}
/* Заказы клиента для разнесения: долг считается «до этой квитанции» — при
   правке уже разнесённая ею сумма возвращается в долг заказа. */
function finFormOrders(){
 const d=finDraft;if(!d||!d.customerId)return [];
 const own=finEdit!=='new'&&(DB.receipt||[]).find(x=>x.id===finEdit)||null;
 return (DB.salesOrder||[]).filter(o=>o.customerId===d.customerId&&finOrderCounts(o)).map(o=>{
  const b=finOrderBalance(o),mine=own&&!own.voided?((own.allocations.find(a=>a.orderId===o.id)||{}).amount||0):0;
  return {order:o,total:b.total,paid:finMoney(b.paid-mine),balance:b.balance==null?null:finMoney(b.balance+mine),status:b.status};
 }).filter(x=>x.balance!=null&&(x.balance>0||finMoney(d.apply[x.order.id]||0)>0))
  .sort((a,b)=>String(a.order.businessNumber).localeCompare(String(b.order.businessNumber)));
}
function finFormNoPrice(){
 const d=finDraft;if(!d||!d.customerId)return 0;
 return (DB.salesOrder||[]).filter(o=>o.customerId===d.customerId&&finOrderCounts(o)&&finOrderBalance(o).status==='incomplete').length;
}
function finSummaryHTML(amount,applied){
 const left=finMoney(amount-applied);
 return `<span>Receipt <b>${finFmt(amount)}</b></span><span>Applied <b>${finFmt(applied)}</b></span>${left<0?`<span class="fin-over">Applied more than received by <b>${finFmt(-left)}</b></span>`:`<span>Left on account (deposit) <b class="fin-deposit">${finFmt(left)}</b></span>`}`;
}
function finFormApplied(){return finMoney(finFormOrders().reduce((s,x)=>s+Math.max(0,finMoney(finDraft.apply[x.order.id]||0)),0));}
function finRefreshSummary(){const el=document.getElementById('finSummary');if(el&&finDraft)el.innerHTML=finSummaryHTML(finMoney(finDraft.amount),finFormApplied());}
function finApplyInput(orderId,value){if(!finDraft)return;finDraft.apply[orderId]=value;finRefreshSummary();}
/* Max: заказ оплачивается целиком. Сумма квитанции ещё не введена — она сама
   становится суммой разнесения; введена — в заказ идёт не больше остатка. */
function finApplyMax(orderId){
 const row=finFormOrders().find(x=>x.order.id===orderId);if(!row||!finDraft)return;
 const others=finMoney(finFormOrders().filter(x=>x.order.id!==orderId).reduce((s,x)=>s+Math.max(0,finMoney(finDraft.apply[x.order.id]||0)),0));
 const amount=finMoney(finDraft.amount);
 if(!(amount>0)){finDraft.apply[orderId]=row.balance.toFixed(2);finDraft.amount=finMoney(others+row.balance).toFixed(2);}
 else finDraft.apply[orderId]=Math.max(0,Math.min(row.balance,finMoney(amount-others))).toFixed(2);
 render();
}
function finReceiptForm(){
 const d=finDraft,r=finEdit!=='new'?(DB.receipt||[]).find(x=>x.id===finEdit):null,locked=!!(r&&r.voided),dis=locked?' disabled':'';
 const customers=(DB.customer||[]).filter(c=>c.status!=='archived'||c.id===d.customerId),rows=finFormOrders(),noPrice=finFormNoPrice();
 const ph=({cheque:'Cheque #',etransfer:'Transfer reference',card:'Last 4 digits or approval #'})[d.method]||'Optional';
 const table=!d.customerId?'<p class="mut">Select a customer to apply the receipt to orders.</p>':rows.length?`<h4 class="fin-h4">Apply to orders of this customer</h4>
  <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Order</th><th>Customer PO</th><th class="n">Order total</th><th class="n">Paid before</th><th class="n">Balance</th><th class="n">Apply now</th></tr></thead><tbody>${rows.map(x=>`<tr>
   <td><b class="mono">${raw(x.order.businessNumber||'draft')}</b></td><td>${raw(x.order.customerPo||'—')}</td><td class="n">${finFmt(x.total)}</td><td class="n">${finFmt(x.paid)}</td><td class="n"><b>${finFmt(x.balance)}</b></td>
   <td class="n fin-apply-cell"><input type="number" min="0" step="0.01" data-fin-apply="${esc(x.order.id)}"${dis} value="${esc(d.apply[x.order.id]||'')}" placeholder="0.00" oninput="finApplyInput('${esc(x.order.id)}',this.value)">${locked?'':`<button type="button" class="sm" onclick="finApplyMax('${esc(x.order.id)}')">Max</button>`}</td></tr>`).join('')}</tbody></table></div>`
  :'<p class="mut fin-apply-empty">This customer has no orders with a balance due — the whole amount stays on account as a deposit.</p>';
 return `<div class="fin-form"><div class="fin-form-head"><h3>${r?'Receipt '+raw(r.number):'New receipt'}</h3>${locked?`<span class="pill bad">Void</span><span class="mut">${raw(r.voidReason)}</span>`:''}</div>
 <div class="fin-grid">
  <div class="fin-span2"><label>Customer *</label><select${dis} onchange="finDraft.customerId=this.value;finDraft.apply={};render()"><option value="">— select customer —</option>${customers.map(c=>`<option data-raw value="${esc(c.id)}" ${c.id===d.customerId?'selected':''}>${esc(c.code||'')} · ${esc(finCustomerName(c))}</option>`).join('')}</select></div>
  <div><label>Date</label><input type="date"${dis} value="${esc(d.date)}" onchange="finDraft.date=this.value"></div>
  <div class="fin-span2"><label>Method</label><div class="fin-seg">${FIN_METHODS.map(m=>`<button type="button"${dis} data-fin-method="${m.k}" class="${d.method===m.k?'on':''}" onclick="finDraft.method='${m.k}';render()">${m.label}</button>`).join('')}</div></div>
  <div><label>Amount *</label><input type="number" min="0" step="0.01" id="finAmount"${dis} value="${esc(d.amount)}" oninput="finDraft.amount=this.value;finRefreshSummary()"></div>
  <div class="fin-span2"><label>Reference</label><input${dis} id="finReference" value="${esc(d.reference)}" placeholder="${ph}" oninput="finDraft.reference=this.value"></div>
  <div class="fin-span4"><label>Note</label><input${dis} id="finNote" value="${esc(d.note)}" oninput="finDraft.note=this.value"></div>
 </div>
 ${table}${noPrice?`<p class="mut small">${noPrice} order${noPrice===1?'':'s'} without a complete price ${noPrice===1?'is':'are'} not listed: its balance cannot be calculated.</p>`:''}
 <div class="fin-summary" id="finSummary">${finSummaryHTML(finMoney(d.amount),finFormApplied())}</div>
 <div class="err" id="e_fin"></div>
 <div class="fin-form-actions"><button type="button" onclick="finCloseReceipt()">${locked?'Back':'Cancel'}</button>${r&&!locked?'<button type="button" class="dl" onclick="finVoidCurrent()">Void receipt</button>':''}${locked?'':'<button type="button" class="pri" onclick="finSaveReceipt()">Save receipt</button>'}</div></div>`;
}
function finSaveReceipt(){
 const e=document.getElementById('e_fin');if(e)e.style.display='none';
 const d=finDraft;if(!d)return;
 const amount=finMoney(d.amount);
 if(!d.customerId||!salesFindCustomer(d.customerId))return fail(e,'Select a customer');
 if(!(amount>0))return fail(e,'Enter the amount received');
 const allocations=[];let applied=0;
 for(const x of finFormOrders()){
  const v=finMoney(d.apply[x.order.id]||0);
  if(v<0)return fail(e,'Amounts cannot be negative');
  if(!v)continue;
  if(v>x.balance)return fail(e,'Order '+(x.order.businessNumber||'draft')+': apply at most '+finFmt(x.balance));
  allocations.push({orderId:x.order.id,amount:v});applied=finMoney(applied+v);
 }
 if(applied>amount)return fail(e,'Applied '+finFmt(applied)+' is more than received '+finFmt(amount));
 const now=new Date().toISOString(),fields={date:d.date,customerId:d.customerId,method:d.method,reference:d.reference,amount,note:d.note,allocations,updatedAt:now};
 if(finEdit==='new')DB.receipt.push(normalizeReceipt(Object.assign({id:finUid(),number:finNextReceiptNumber(),createdAt:now},fields)));
 else{
  const i=DB.receipt.findIndex(x=>x.id===finEdit);if(i<0||DB.receipt[i].voided)return;
  DB.receipt[i]=normalizeReceipt(Object.assign({},DB.receipt[i],fields));
 }
 normalizeReceipts();touch();finCloseReceipt();
}
function finVoidCurrent(){
 const r=(DB.receipt||[]).find(x=>x.id===finEdit);if(!r)return;
 const reason=window.prompt('Void receipt '+r.number+'. Reason:','');
 if(reason===null)return;
 if(!String(reason).trim()){alert('Enter a reason to void the receipt.');return;}
 finVoidReceipt(r.id,reason);touch();finCloseReceipt();
}

/* -------------------------- Customer accounts ------------------------ */
function finAccountsView(){
 const list=(DB.customer||[]).filter(c=>c.status!=='archived').map(finCustomerAccount)
  .filter(a=>a.balanceDue>0||a.deposit>0||a.creditLimit!=null||a.incomplete||(DB.salesOrder||[]).some(o=>o.customerId===a.customer.id));
 return `<p class="mut">Balances come from saved orders and receipts. Terms and credit limit are set in the customer card.</p>
 <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Customer</th><th>Terms</th><th class="n">Credit limit</th><th class="n">Orders balance due</th><th class="n">Deposit on account</th><th class="n">Available credit</th><th></th></tr></thead><tbody>${list.map(a=>{const c=a.customer;return `<tr data-account="${esc(c.id)}">
  <td><b>${raw(finCustomerName(c))}</b><div class="mut small">${raw(c.code||'')}</div></td><td>${raw(a.terms)}</td>
  <td class="n">${a.creditLimit==null?'<span class="mut">—</span>':finFmt(a.creditLimit)}</td>
  <td class="n"><b class="${a.balanceDue>0?'fin-due':''}">${finFmt(a.balanceDue)}</b><div class="mut small">${a.dueOrders} order${a.dueOrders===1?'':'s'}${a.incomplete?' · '+a.incomplete+' without price':''}</div></td>
  <td class="n">${a.deposit>0?`<b class="fin-deposit">${finFmt(a.deposit)}</b>`:'<span class="mut">$0.00</span>'}</td>
  <td class="n">${a.creditLimit==null?'<span class="mut">—</span>':a.overLimit?`<span class="pill bad">Over limit ${finFmt(finMoney(a.balanceDue-a.creditLimit))}</span>`:`<b>${finFmt(a.available)}</b>`}</td>
  <td class="fin-actions">${a.deposit>0&&a.dueOrders?`<button class="sm" onclick="finOpenApply('${esc(c.id)}')">Apply deposit</button>`:''}<button class="sm" onclick="finShowCustomer('${esc(c.id)}')">Receipts</button><button class="sm" onclick="finNewReceipt('${esc(c.id)}')">+ Receipt</button></td></tr>`;}).join('')||'<tr><td colspan="7" class="empty">No customer balances yet</td></tr>'}</tbody></table></div>`;
}
function finShowCustomer(id){const c=salesFindCustomer(id);finTab='receipts';finEdit=null;finDraft=null;finSearch=c?(c.displayName||c.legalName||''):'';render();}
function finShowOrder(orderId){const o=(DB.salesOrder||[]).find(x=>x.id===orderId);tab='finance';subtab=null;finTab='receipts';finEdit=null;finDraft=null;finMethod='';finFrom='';finTo='';finSearch=o?(o.businessNumber||''):'';render();}

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
 const done=finApplyDeposit(finApply.customerId,finApply.orderId,finApply.amount);
 if(!(done>0))return fail(e,'Nothing applied: check the amount and the order balance.');
 touch();finApply=null;render();
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
function finBalancePill(b){
 return b.status==='due'?`<span class="pill bad">Balance due ${finFmt(b.balance)}</span>`:b.status==='paid'?'<span class="pill good">Paid</span>':b.status==='overpaid'?`<span class="pill info">Overpaid ${finFmt(-b.balance)}</span>`:b.status==='incomplete'&&b.paid>0?'<span class="pill warn">Price incomplete</span>':'';
}
function salesPaymentStrip(o){
 if(!salesOrderIsSaved(o))return '<div class="fin-strip fin-strip-new">Save the order to take payments</div>';
 /* Отменённый заказ не долг: его оплаты ушли на депозит клиента. */
 if(!finOrderCounts(o))return '<div class="fin-strip fin-strip-new">Cancelled — not counted in the customer balance</div>';
 const b=finOrderBalance(o);
 return `<div class="fin-strip">${finBalancePill(b)}<div><small>Order total</small><b>${finFmt(b.total)}</b></div><div><small>Receipt total</small><b>${finFmt(b.paid)}</b></div><div><small>Balance</small><b class="${b.status==='due'?'fin-due':b.status==='paid'?'fin-paid':''}">${finFmt(b.balance)}</b></div><button type="button" class="sm" onclick="finShowOrder('${esc(o.id)}')">Receipts</button></div>`;
}
function salesDepositHint(o){
 if(!salesOrderIsSaved(o)||!o.customerId||!finOrderCounts(o))return '';
 const saved=DB.salesOrder.find(x=>x.id===o.id),b=finOrderBalance(saved),dep=finCustomerDeposit(o.customerId),c=salesFindCustomer(o.customerId),out=[];
 if(dep>0&&b.status==='due')out.push(`<div class="fin-hint">${raw(finCustomerName(c))} has <b>${finFmt(dep)}</b> on account. <button type="button" class="sm" onclick="finOpenApply('${esc(o.customerId)}','${esc(o.id)}')">Apply deposit to this order</button></div>`);
 if(b.status==='overpaid')out.push(`<div class="fin-hint">Receipts exceed the saved order total by <b>${finFmt(-b.balance)}</b>. <button type="button" class="sm" onclick="finMoveOverpayment('${esc(o.id)}')">Move to deposit on account</button></div>`);
 return out.join('');
}
function finMoveOverpayment(orderId){const o=(DB.salesOrder||[]).find(x=>x.id===orderId);if(!o)return;if(finReleaseOverpayment(o)>0)touch();render();}
function salesListBalanceCells(o){
 if(!finOrderCounts(o)){const t=finOrderTotals(o);return `<td class="n mut">${finFmt(t.complete?finMoney(t.grand):null)}</td><td class="n mut">—</td><td class="n mut">—</td>`;}
 const b=finOrderBalance(o);
 return `<td class="n">${finFmt(b.total)}</td><td class="n">${finFmt(b.paid)}</td><td class="n">${b.status==='due'?`<span class="pill bad">${finFmt(b.balance)}</span>`:b.status==='paid'?'<span class="pill good">Paid</span>':b.status==='overpaid'?`<span class="pill info">Overpaid ${finFmt(-b.balance)}</span>`:'<span class="mut">—</span>'}</td>`;
}
