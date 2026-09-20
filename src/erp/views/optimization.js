/* =====================================================================
   view/optimization · optimization-queue-1.1
   Общий экран очередей: Optimization — проверка/батч; Shipping — выдача.
   IN : DB.salesOrder / customer / receipt, фильтр и выбранные ID
   OUT: HTML очереди и переходы через salesSetRecordStatus; черновик не сохраняет.
   Perfect Cut остаётся неактивным прототипом. Обмен не имитируется.
   ===================================================================== */
const OPTIMIZATION_TABS=[['all','All'],['new','To verify'],['batch','To batch'],['production','Batches'],['stock','Stock']];
let optimizationTab='new',optimizationSel=new Set(),optimizationNotice=null,optimizationScope='';
function orderQueueKey(){return tab==='shipping'?shippingTab:optimizationTab;}
function orderQueueTabs(){return tab==='shipping'?SHIPPING_TABS:OPTIMIZATION_TABS;}
function optimizationMatches(o,key){
 if(!o||salesIsQuote(o))return false;
 const fresh=salesUnbatchedLines(o).length;
 return key==='all'?!['closed','cancelled'].includes(o.status):key==='new'?o.status==='new':key==='batch'?o.status==='verified'||(['batched','ready','done'].includes(o.status)&&fresh>0):
  key==='production'?o.status==='batched':key==='awaiting'?o.status==='batched'&&!fresh:key==='ready'?o.status==='ready'&&!fresh:key==='done'?o.status==='done'&&!fresh:false;
}
function optimizationTabCount(key){return key==='production'?(DB.glassBatch||[]).length:key==='stock'?(DB.stockOffcut||[]).filter(r=>r.status==='stock').length:(DB.salesOrder||[]).filter(o=>optimizationMatches(o,key)).length;}
function optimizationBase(){return (DB.salesOrder||[]).filter(o=>optimizationMatches(o,orderQueueKey())).map(salesListInfo);}
function optimizationRows(){return salesListRows(optimizationBase()).map(info=>info.o);}
function optimizationBlocked(o){return o.onHold&&tab!=='shipping'&&['all','new','batch'].includes(orderQueueKey());}
function optimizationSetTab(key){
 if(!orderQueueTabs().some(t=>t[0]===key))return;
 if(tab==='shipping')shippingTab=key;else optimizationTab=key;
 optimizationSel.clear();optimizationNotice=null;salesListMenu=null;glassBatchSelection.clear();glassBatchOpenNumber='';glassBatchAnchor='';render();
}
function optimizationToggle(id,on){const o=salesRecord(id);if(!o||!optimizationRows().some(x=>x.id===id)||optimizationBlocked(o))return;if(on)optimizationSel.add(id);else optimizationSel.delete(id);render();}
function optimizationSelectAll(on){optimizationRows().filter(o=>!optimizationBlocked(o)).forEach(o=>{if(on)optimizationSel.add(o.id);else optimizationSel.delete(o.id);});render();}
function optimizationOpenOrder(id){
 if(soDraft&&salesDraftHasWork()&&!confirm('Discard unsaved changes?'))return;
 tab='sales';salesOrderEdit(id);
}
function optimizationAction(action,delivery){if(action==='unbatch')optimizationUnbatch([...optimizationSel]);else optimizationRunOrders([...optimizationSel],action,{delivery});}
/* Все предупреждения группы проходят ДО записи. Back или Take payment
   прекращает весь переход; частично отправленного батча не возникает.
   Если данные изменились во время окна, пользователь проверяет их заново. */
function optimizationRunOrders(ids,action,opts){
 opts=opts||{};ids=[...new Set(ids||[])];if(!ids.length||!action)return;
 const orders=ids.map(salesRecord),next=o=>action==='back'?SALES_PREV_STATUS[o.status]:action;
 const allowed=o=>salesRecordTransitionAllowed(o,next(o),{back:action==='back'});
 const held=orders.find(o=>o&&o.onHold&&['verified','batched'].includes(action));
 if(held){salesHoldBlocked(held.id);return;}
 if(orders.some(o=>!o||!allowed(o))){salesDialogOpen({title:'Selection has changed',note:'Some orders are not ready for this.',buttons:[{label:'Back'}]});return;}
 if(['verified','batched'].includes(action)){
  const invalid=orders.find(o=>!salesFindCustomer(o.customerId)||(o.lines||[]).some(l=>!l.width16||!l.height16));
  if(invalid){salesDialogOpen({title:'Check order '+invalid.businessNumber,note:'Check customer and sizes.',buttons:[{label:'Back'}]});return;}
 }
 const stamp=()=>JSON.stringify([ids.map(salesRecord),DB.customer,DB.receipt]),before=stamp();
 const finish=()=>{
  if(before!==stamp()||ids.some(id=>!allowed(salesRecord(id)))){salesDialogOpen({title:'Orders changed during confirmation',note:'Nothing changed. Try again.',buttons:[{label:'Back'}]});return;}
  const now=new Date().toISOString(),batchNo=action==='batched'&&orders.some(o=>salesBatchableLines(o).length)?salesNextBatchNumber():'';
  orders.forEach(o=>salesSetRecordStatus(o.id,next(o),{back:action==='back',delivery:opts.delivery,batchNo,now,deferTouch:true}));
  touch();optimizationSel.clear();
  optimizationNotice={title:batchNo?'Batch created · '+batchNo:action==='cancelled'?'Orders cancelled':action==='back'?'Orders moved back':'Orders updated',
   detail:orders.map(o=>o.businessNumber+' · '+salesStatusLabel(o)).join(', ')};
  render();
 };
 if(action==='back'||action==='cancelled'){
  const cancel=action==='cancelled';
  salesDialogOpen({title:cancel?'Cancel '+orders.length+' order'+(orders.length===1?'':'s')+'?':'Move '+orders.length+' order'+(orders.length===1?'':'s')+' back?',
   rows:orders.map(o=>[o.businessNumber+' · '+salesCustomerDisplay(o.customerId),cancel?finFmt(finOrderPaid(o.id).paid)+' to deposit':salesStatusLabel(o)+' → '+salesStatusLabel(o,next(o))]),
   note:cancel?'Payments → customer deposit.':'Locks stay.',
   buttons:[{label:'Back'},{label:cancel?'Cancel orders':'Move back',kind:cancel?'dl':'pri',run:finish}]});return;
 }
 const checkOrder=i=>{
  if(i===orders.length){finish();return;}
  const o=orders[i],forChecks=action==='done'&&opts.delivery?Object.assign({},o,{delivery:opts.delivery}):o;
  salesRunChecks(salesTransitionChecks(forChecks,action),()=>checkOrder(i+1),amount=>salesTakeRecordPayment(o.id,amount));
 };
 checkOrder(0);
}
/* Снятие батча — отдельное действие, обычный Back замок не снимает. */
function optimizationUnbatch(ids){
 const orders=[...new Set(ids||[])].map(salesRecord);
 if(!orders.length||orders.some(o=>!salesCanUnbatch(o)))return;
 const stamp=()=>JSON.stringify(orders.map(o=>salesRecord(o.id))),before=stamp();
 const lineChoices=orders.flatMap(o=>o.lines.filter(salesLineLocked).map((l,i)=>({id:l.id,orderId:o.id,disabled:!!l.cutStartedAt,
  label:'Order '+o.businessNumber+' · '+(l.mark||'Line '+(i+1)),detail:(l.width16/16)+' × '+(l.height16/16)+' in · Qty '+l.qty+' · '+(l.batchNo||'Batched')})));
 salesDialogOpen({title:'Unbatch — release uncut lines',sub:'Uncheck cut lines.',lineChoices,checkedLines:lineChoices.filter(l=>!l.disabled).map(l=>l.id),confirmed:false,
  note:'Lines unlock · order → To verify.',
  buttons:[{label:'Back'},{label:'Unbatch selected lines',kind:'pri',requiresConfirmation:true,run:d=>{
   if(before!==stamp()){salesDialogOpen({title:'Orders changed during confirmation',note:'Try again.',buttons:[{label:'Back'}]});return;}
   const chosen=new Set(d.checkedLines),affected=orders.map(o=>({o,ids:o.lines.filter(l=>chosen.has(l.id)).map(l=>l.id)})).filter(x=>x.ids.length);
   if(!d.confirmed||!affected.length||affected.some(x=>!salesUnbatchEligible(x.o)||x.ids.some(id=>{const l=x.o.lines.find(l=>l.id===id);return !l||!salesLineLocked(l)||!!l.cutStartedAt;})))return;
   const now=new Date().toISOString();affected.forEach(x=>salesUnbatchRecord(x.o.id,x.ids,{confirmed:true,now,deferTouch:true}));touch();optimizationSel.clear();
   optimizationNotice={title:'Lines unbatched · verification required',detail:affected.map(x=>x.o.businessNumber+' · '+x.ids.length+' line(s)').join(', ')};render();
  }}]});
}
function viewOptimization(){return ['batch','production'].includes(optimizationTab)?viewGlassBatches():optimizationTab==='stock'?viewStockList():viewOrderQueue(false);}
function viewOrderQueue(shipping){
 if(optimizationScope!==tab){optimizationScope=tab;optimizationSel.clear();optimizationNotice=null;salesListMenu=null;}
 const key=orderQueueKey(),infos=optimizationBase(),filtered=salesListRows(infos),rows=filtered.map(i=>i.o),cols=salesListColumns(),selectable=rows.filter(o=>!optimizationBlocked(o));
 optimizationSel=new Set([...optimizationSel].filter(id=>selectable.some(o=>o.id===id)));
 const selected=rows.filter(o=>optimizationSel.has(o.id)),n=selected.length,all=selectable.length>0&&n===selectable.length;
 const can=act=>n>0&&selected.every(o=>salesRecordTransitionAllowed(o,act==='back'?SALES_PREV_STATUS[o.status]:act,{back:act==='back'}));
 const button=(act,label,cls,enabled,delivery)=>`<button type="button" class="${cls||''}" data-queue-action="${delivery||act}" ${enabled?'':'disabled'} onclick="optimizationAction('${act}'${delivery?",'"+delivery+"'":''})">${label}</button>`;
 let actions='';
 if(shipping){
  if(key==='awaiting')actions=button('ready','Mark ready','pri',can('ready'));
  if(key==='ready')actions=button('done','Mark picked up','pri',can('done'),'pickup')+button('done','Mark delivered','go',can('done'),'delivery');
  if(key==='done')actions=button('closed','Close order','pri',can('closed'));
 }else{
  if(key==='all'||key==='new')actions+=button('verified','Verify','pri',can('verified'));
  if(key==='all')actions+='<button type="button" onclick="optimizationSetTab(\'batch\')">Select glass</button>';
  actions+=button('unbatch','Unbatch','',n>0&&selected.every(salesCanUnbatch));
 }
 const tabs=orderQueueTabs().map(t=>`<button type="button" role="tab" aria-selected="${key===t[0]}" data-queue-tab="${t[0]}" class="${key===t[0]?'on':''}" onclick="optimizationSetTab('${t[0]}')">${t[1]} <b>${optimizationTabCount(t[0])}</b></button>`).join('');
 const th=c=>{const f=salesListLoadPrefs().filters[c.k],active=salesListFilterActive(f);return `<th class="${c.type==='number'?'n':''}" data-col="${c.k}"><span class="sl-th">${esc(c.label)}<button type="button" class="sl-fbtn${active?' on':''}" data-filter-col="${c.k}" aria-label="Filter and sort ${esc(c.label)}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span></th>`;};
 const body=filtered.map(info=>{
  const o=info.o,blocked=optimizationBlocked(o),chosen=optimizationSel.has(o.id);
  const cell=c=>c.k==='batch'?`<td class="oq-batches">${salesOrderBatchNumbers(o).map(v=>`<span class="pill">${esc(v)}</span>`).join(' ')||'—'}</td>`:c.k==='newLines'?`<td class="n">${salesUnbatchedLines(o).length}</td>`:salesListCell(info,c);
  return `<tr data-queue-order="${esc(o.id)}" class="${o.onHold?'oq-hold':chosen?'oq-selected':''}"><td><input type="checkbox" data-queue-check aria-label="Select order ${esc(o.businessNumber)}" ${chosen?'checked':''} ${blocked?'disabled':''} onchange="optimizationToggle('${esc(o.id)}',this.checked)"></td>${cols.map(cell).join('')}
   <td class="oq-actions"><button type="button" class="sm" data-queue-open onclick="optimizationOpenOrder('${esc(o.id)}')">Open</button>${o.onHold?`<button type="button" class="sm" data-queue-release onclick="salesReleaseHold(['${esc(o.id)}'])">Release</button>`:''}</td></tr>`;
 }).join('');
 return `<section class="optimization-queue ${shipping?'shipping-queue':''}"><div class="page-head"><div><h2>${shipping?'Shipping':'Order queue'}</h2></div></div>
  <div class="oq-tabs" role="tablist" aria-label="Order queues">${tabs}</div>
  <div class="card oq-card"><div class="oq-toolbar"><b data-queue-selection>${n} order${n===1?'':'s'} selected</b>${actions}
   ${button('back','← Back','',can('back'))}${button('cancelled','Cancel order','dl',can('cancelled'))}<span class="sp"></span><button type="button" data-columns-button onclick="salesListOpenColumns(event)">Columns</button></div>
   ${salesListFilterChips()}<div class="oq-table-wrap sales-table-wrap"><table class="sl-table"><thead><tr><th><input type="checkbox" data-queue-all aria-label="Select all eligible orders" ${all?'checked':''} ${selectable.length?'':'disabled'} onchange="optimizationSelectAll(this.checked)"></th>${cols.map(th).join('')}<th>Action</th></tr></thead><tbody>${body||`<tr><td colspan="${cols.length+2}" class="empty">No orders match this queue and its filters.</td></tr>`}</tbody>${rows.length?salesListFooter(filtered,cols):''}</table></div>
   ${optimizationNotice?`<div class="oq-notice" role="status"><b>${esc(optimizationNotice.title)}</b><span>${esc(optimizationNotice.detail)}</span><button type="button" class="sm" aria-label="Dismiss update" onclick="optimizationNotice=null;render()">×</button></div>`:''}
  </div>
  ${shipping?'':`<div class="card oq-bridge"><div class="section-title"><h3>Perfect Cut bridge</h3><span class="pill warn">connection not configured</span></div><p class="mut">Not connected yet.</p><button disabled>${ico('link','icon-inline')}Send batch</button></div>`}
  ${salesListMenuHTML(infos)}${salesDialogHTML()}</section>`;
}
