/* =====================================================================
   view/optimization · optimization-queue-1.0
   Очередь сохранённых заказов: проверки, общий батч, готовность и выдача.
   IN : DB.salesOrder / customer / receipt, фильтр и выбранные ID
   OUT: HTML очереди и переходы через salesSetRecordStatus; черновик не сохраняет.
   Perfect Cut остаётся неактивным прототипом. Обмен не имитируется.
   ===================================================================== */
const OPTIMIZATION_TABS=[['new','To verify'],['batch','To batch'],['production','In production'],['ready','Ready'],['done','Picked up / Delivered']];
let optimizationTab='new',optimizationSel=new Set(),optimizationSearch='',optimizationNotice=null;
function optimizationMatches(o,key){
 if(!o||salesIsQuote(o))return false;
 const fresh=salesUnbatchedLines(o).length;
 return key==='new'?o.status==='new':key==='batch'?o.status==='verified'||(['batched','ready','done'].includes(o.status)&&fresh>0):
  key==='production'?o.status==='batched'&&!fresh:key==='ready'?o.status==='ready'&&!fresh:key==='done'?o.status==='done'&&!fresh:false;
}
function optimizationRows(){
 const q=optimizationSearch.trim().toLowerCase();
 return (DB.salesOrder||[]).filter(o=>optimizationMatches(o,optimizationTab)).filter(o=>!q||[o.businessNumber,salesCustomerDisplay(o.customerId),o.customerPo,salesOrderBatchNumbers(o).join(' ')].join(' ').toLowerCase().includes(q))
  .sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||String(a.businessNumber).localeCompare(String(b.businessNumber),undefined,{numeric:true}));
}
function optimizationBlocked(o){return o.onHold&&['new','batch'].includes(optimizationTab);}
function optimizationSetTab(key){if(!OPTIMIZATION_TABS.some(t=>t[0]===key))return;optimizationTab=key;optimizationSel.clear();optimizationNotice=null;render();}
function optimizationToggle(id,on){const o=salesRecord(id);if(!o||!optimizationMatches(o,optimizationTab)||optimizationBlocked(o))return;if(on)optimizationSel.add(id);else optimizationSel.delete(id);render();}
function optimizationSelectAll(on){optimizationRows().filter(o=>!optimizationBlocked(o)).forEach(o=>{if(on)optimizationSel.add(o.id);else optimizationSel.delete(o.id);});render();}
function optimizationSearchInput(el){
 optimizationSearch=el.value;optimizationSel.clear();const pos=el.selectionStart;render();
 const input=document.getElementById('optimizationSearch');if(input){input.focus();input.setSelectionRange(pos,pos);}
}
function optimizationOpenOrder(id){
 if(soDraft&&salesDraftHasWork()&&!confirm('Open this order without saving the changes in the current editor?'))return;
 tab='sales';salesOrderEdit(id);
}
function optimizationAction(action,delivery){optimizationRunOrders([...optimizationSel],action,{delivery});}
/* Все предупреждения группы проходят ДО записи. Back или Take payment
   прекращает весь переход; частично отправленного батча не возникает.
   Если данные изменились во время окна, пользователь проверяет их заново. */
function optimizationRunOrders(ids,action,opts){
 opts=opts||{};ids=[...new Set(ids||[])];if(!ids.length||!action)return;
 const orders=ids.map(salesRecord),next=o=>action==='back'?SALES_PREV_STATUS[o.status]:action;
 const allowed=o=>salesRecordTransitionAllowed(o,next(o),{back:action==='back'});
 const held=orders.find(o=>o&&o.onHold&&['verified','batched'].includes(action));
 if(held){salesHoldBlocked(held.id);return;}
 if(orders.some(o=>!o||!allowed(o))){salesDialogOpen({title:'Selection has changed',note:'Select orders that are ready for this action. New lines must go to batch before the order can be marked ready, handed over or closed.',buttons:[{label:'Back'}]});return;}
 if(['verified','batched'].includes(action)){
  const invalid=orders.find(o=>!salesFindCustomer(o.customerId)||(o.lines||[]).some(l=>!l.width16||!l.height16));
  if(invalid){salesDialogOpen({title:'Check order '+invalid.businessNumber,note:'Open the order and check its customer and line dimensions before continuing.',buttons:[{label:'Back'}]});return;}
 }
 const stamp=()=>JSON.stringify([ids.map(salesRecord),DB.customer,DB.receipt]),before=stamp();
 const finish=()=>{
  if(before!==stamp()||ids.some(id=>!allowed(salesRecord(id)))){salesDialogOpen({title:'Orders changed during confirmation',note:'No orders were changed by this action. Review the selection and try again.',buttons:[{label:'Back'}]});return;}
  const now=new Date().toISOString(),batchNo=action==='batched'&&orders.some(o=>salesUnbatchedLines(o).length)?salesNextBatchNumber():'';
  orders.forEach(o=>salesSetRecordStatus(o.id,next(o),{back:action==='back',delivery:opts.delivery,batchNo,now,deferTouch:true}));
  touch();optimizationSel.clear();
  optimizationNotice={title:batchNo?'Batch created · '+batchNo:action==='cancelled'?'Orders cancelled':action==='back'?'Orders moved back':'Orders updated',
   detail:orders.map(o=>o.businessNumber+' · '+salesStatusLabel(o)).join(', ')};
  render();
 };
 if(action==='back'||action==='cancelled'){
  const cancel=action==='cancelled',unlock=!cancel&&orders.some(o=>o.status==='batched');
  salesDialogOpen({title:cancel?'Cancel '+orders.length+' order'+(orders.length===1?'':'s')+'?':'Move '+orders.length+' order'+(orders.length===1?'':'s')+' back?',
   rows:orders.map(o=>[o.businessNumber+' · '+salesCustomerDisplay(o.customerId),cancel?finFmt(finOrderPaid(o.id).paid)+' to deposit':salesStatusLabel(o)+' → '+salesStatusLabel(o,next(o))]),
   note:cancel?'Allocated receipts return to each customer’s deposit on account. Batched lines stay locked.':unlock?'The glass may already be cut. Moving back from Batched unlocks all lines in those orders.':'The current step date is removed. Earlier production locks remain.',
   buttons:[{label:'Back'},{label:cancel?'Cancel orders':'Move back',kind:cancel?'dl':'pri',run:finish}]});return;
 }
 const checkOrder=i=>{
  if(i===orders.length){finish();return;}
  const o=orders[i],forChecks=action==='done'&&opts.delivery?Object.assign({},o,{delivery:opts.delivery}):o;
  salesRunChecks(salesTransitionChecks(forChecks,action),()=>checkOrder(i+1),amount=>salesTakeRecordPayment(o.id,amount));
 };
 checkOrder(0);
}
function viewOptimization(){
 const rows=optimizationRows(),selectable=rows.filter(o=>!optimizationBlocked(o));
 optimizationSel=new Set([...optimizationSel].filter(id=>selectable.some(o=>o.id===id)));
 const selected=rows.filter(o=>optimizationSel.has(o.id)),n=selected.length,all=selectable.length>0&&n===selectable.length;
 const action=({new:['verified','Verify'],batch:['batched','Send to batch'],production:['ready','Mark ready'],ready:['done','Mark picked up'],done:['closed','Close order']})[optimizationTab];
 const button=(act,label,cls,enabled,delivery)=>`<button type="button" class="${cls||''}" data-queue-action="${delivery||act}" ${enabled?'':'disabled'} onclick="optimizationAction('${act}'${delivery?",'"+delivery+"'":''})">${label}</button>`;
 const tabs=OPTIMIZATION_TABS.map(t=>`<button type="button" role="tab" aria-selected="${optimizationTab===t[0]}" data-queue-tab="${t[0]}" class="${optimizationTab===t[0]?'on':''}" onclick="optimizationSetTab('${t[0]}')">${t[1]} <b>${(DB.salesOrder||[]).filter(o=>optimizationMatches(o,t[0])).length}</b></button>`).join('');
 const body=rows.map(o=>{
  const blocked=optimizationBlocked(o),fresh=salesUnbatchedLines(o).length,b=finOrderBalance(o),batch=salesOrderBatchNumbers(o),chosen=optimizationSel.has(o.id);
  return `<tr data-queue-order="${esc(o.id)}" class="${o.onHold?'oq-hold':chosen?'oq-selected':''}"><td><input type="checkbox" data-queue-check aria-label="Select order ${esc(o.businessNumber)}" ${chosen?'checked':''} ${blocked?'disabled':''} onchange="optimizationToggle('${esc(o.id)}',this.checked)"></td>
   <td><b class="mono">${raw(o.businessNumber)}</b></td><td><b>${raw(salesCustomerDisplay(o.customerId)||'—')}</b>${o.customerPo?`<small>PO ${raw(o.customerPo)}</small>`:''}</td><td>${o.dueDate?esc(salesShortDate(o.dueDate)):'—'}</td>
   <td>${salesStatusPill(o)}${o.onHold?` <span class="pill hold" title="${esc(o.holdReason)}">On Hold</span>`:''}</td>
   <td class="n">${fresh}${fresh&&['batched','ready','done'].includes(o.status)?'<small>added after batch</small>':''}</td><td class="oq-batches">${batch.length?batch.map(v=>`<span class="pill">${esc(v)}</span>`).join(' '):'—'}</td>
   <td class="n${b.balance>0?' oq-due':''}">${finFmt(b.balance)}</td><td class="oq-actions"><button type="button" class="sm" data-queue-open onclick="optimizationOpenOrder('${esc(o.id)}')">Open</button>${o.onHold?`<button type="button" class="sm" data-queue-release onclick="salesReleaseHold(['${esc(o.id)}'])">Release</button>`:''}</td></tr>`;
 }).join('');
 return `<section class="optimization-queue"><div class="page-head"><div><h2>Order queue</h2><p>Verify, batch and track order fulfilment.</p></div></div>
  <div class="oq-tabs" role="tablist" aria-label="Order queues">${tabs}</div>
  <div class="card oq-card"><div class="oq-toolbar"><b data-queue-selection>${n} order${n===1?'':'s'} selected</b>
   ${button(action[0],action[1],'pri',n>0,optimizationTab==='ready'?'pickup':'')}${optimizationTab==='ready'?button('done','Mark delivered','go',n>0,'delivery'):''}
   ${button('back','← Back','',n>0&&selected.every(o=>!!SALES_PREV_STATUS[o.status]))}${button('cancelled','Cancel order','dl',n>0)}
   <span class="sp"></span><input type="search" id="optimizationSearch" aria-label="Search orders or customers" placeholder="Search orders or customers" value="${esc(optimizationSearch)}" oninput="optimizationSearchInput(this)"></div>
   <div class="oq-table-wrap"><table><thead><tr><th><input type="checkbox" data-queue-all aria-label="Select all eligible orders" ${all?'checked':''} ${selectable.length?'':'disabled'} onchange="optimizationSelectAll(this.checked)"></th><th>Order</th><th>Customer</th><th>Due date</th><th>Status</th><th class="n">New lines</th><th>Batch</th><th class="n">Balance</th><th>Action</th></tr></thead><tbody>${body||'<tr><td colspan="9" class="empty">No orders in this queue'+(optimizationSearch?' match the search.':'.')+'</td></tr>'}</tbody></table></div>
   ${optimizationTab==='batch'?`<div class="oq-hint">${n?'Selected orders will share batch '+esc(salesNextBatchNumber())+'. ':''}Only new lines go to batch. Batched lines stay locked.</div>`:''}
   ${optimizationNotice?`<div class="oq-notice" role="status"><b>${esc(optimizationNotice.title)}</b><span>${esc(optimizationNotice.detail)}</span><button type="button" class="sm" aria-label="Dismiss update" onclick="optimizationNotice=null;render()">×</button></div>`:''}
  </div>
  <div class="card oq-bridge"><div class="section-title"><h3>Perfect Cut bridge</h3><span class="pill warn">connection not configured</span></div><p class="mut">Prototype · cutting layouts and machine exchange are not available yet.</p><button disabled>${ico('link','icon-inline')}Send batch</button></div>
  ${salesDialogHTML()}</section>`;
}
