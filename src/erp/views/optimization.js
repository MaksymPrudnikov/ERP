/* =====================================================================
   view/optimization · optimization-queue-1.1
   Общий экран очередей: Optimization — проверка/батч; Shipping — выдача.
   IN : DB.salesOrder / customer / receipt, фильтр и выбранные ID
   OUT: HTML очереди и переходы через salesSetRecordStatus; черновик не сохраняет.
   Моста к Perfect Cut нет (владелец, 27.09.2026): фигуры, раскрой и файлы
   Maver / Disai ERP делает сама — см. views/cut-layout-ui.
   ===================================================================== */
const OPTIMIZATION_TABS=[['all','All'],['new','To verify'],['batch','To batch'],['production','Batches'],['stock','Stock'],['sheets','Sheets']];
let optimizationTab='new',optimizationSel=new Set(),optimizationNotice=null,optimizationScope='';
function orderQueueKey(){return tab==='shipping'?shippingTab:optimizationTab;}
function orderQueueTabs(){return tab==='shipping'?SHIPPING_TABS:OPTIMIZATION_TABS;}
/* Заказ одного склада после Verify ждёт выдачи в Shipping, а не батча. */
function optimizationMatches(o,key){
 if(!o||salesIsQuote(o)||salesIsDraft(o))return false;
 /* Строки без батча — только для To batch и Done: остальным вкладкам они не
    нужны, а на годе это 1,9 с на слабом ПК (числа на вкладках). */
 const fresh=()=>salesUnbatchedLines(o).length;
 return key==='all'?!['closed','cancelled'].includes(o.status):key==='new'?o.status==='new':key==='batch'?!salesStockOnly(o)&&(o.status==='verified'&&glassOrderNeedsCut(o)||(['batched','ready','shipping','done'].includes(o.status)&&fresh()>0)):
  key==='production'?o.status==='batched':key==='awaiting'?['verified','batched'].includes(o.status)&&!salesStockOnly(o):key==='ready'?shippingAvailable(o).length>0||salesStockOnly(o)&&o.status==='ready':key==='done'?o.status==='done'&&!fresh():false;
}
function optimizationTabCount(key){return key==='production'?(DB.glassBatch||[]).length:key==='stock'?(DB.stockOffcut||[]).filter(r=>r.status==='stock').length:key==='sheets'?sheetUsageRows().length:optimizationQueue(key).length;}
function optimizationQueue(key){return readMemo('optQueue:'+key,[DB.salesOrder,DB.shipment,DB.stationScan,DB.glassBatch],()=>(DB.salesOrder||[]).filter(o=>optimizationMatches(o,key)));}
function optimizationBase(){return optimizationQueue(orderQueueKey()).map(salesListInfo);}
function optimizationRows(){return salesListRows(optimizationBase()).map(info=>info.o);}
function optimizationBlocked(o){return o.onHold&&tab!=='shipping'&&['all','new','batch'].includes(orderQueueKey());}
function optimizationSetTab(key){
 if(!orderQueueTabs().some(t=>t[0]===key))return;
 if(tab==='shipping')shippingTab=key;else optimizationTab=key;
 optimizationSel.clear();optimizationNotice=null;salesListMenu=null;glassBatchSelection.clear();glassBatchOpenNumber='';glassBatchAnchor='';render();
}
function optimizationToggle(id,on){const o=salesRecord(id);if(!o||!optimizationRows().some(x=>x.id===id))return;if(on)optimizationSel.add(id);else optimizationSel.delete(id);render();}
function optimizationSelectAll(on){optimizationRows().filter(o=>!optimizationBlocked(o)).forEach(o=>{if(on)optimizationSel.add(o.id);else optimizationSel.delete(o.id);});render();}
function optimizationOpenOrder(id){
 if(soDraft&&soDraft.id===id){tab='sales';render();return;}
 salesLeaveDraft(()=>{tab='sales';salesOrderEdit(id);});
}
function optimizationAction(action,delivery){if(action==='select-glass')optimizationSetTab('batch');else if(action==='hold'){const ids=[...optimizationSel],orders=ids.map(salesRecord).filter(Boolean);if(orders.length&&orders.every(o=>o.onHold))salesReleaseHold(ids);else salesHoldOpen(ids);}else if(action==='unbatch')optimizationUnbatch([...optimizationSel]);else if(action==='delete')salesOrderDelete([...optimizationSel][0]);else optimizationRunOrders([...optimizationSel],action,{delivery});}
/* Все предупреждения группы проходят ДО записи. Back или Take payment
   прекращает весь переход; частично отправленного батча не возникает.
   Если данные изменились во время окна, пользователь проверяет их заново. */
function optimizationRunOrders(ids,action,opts){
 opts=opts||{};ids=[...new Set(ids||[])];if(!ids.length||!action)return;
 const orders=ids.map(salesRecord),next=o=>action==='back'?salesPrevStatus(o):action;
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
  const saved=storageCommand(()=>{
   orders.forEach(o=>{if(!salesSetRecordStatus(o.id,next(o),{back:action==='back',delivery:opts.delivery,batchNo,now,deferTouch:true}))throw new Error('An order could not be updated.');});
   return true;
  });
  if(!saved.ok){optimizationNotice={title:'Not saved',detail:saved.error+' The orders are still selected; retry the action.',error:true};render();return;}
  optimizationSel.clear();
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
 const list=orders.map(o=>{const forChecks=action==='done'&&opts.delivery?Object.assign({},o,{delivery:opts.delivery}):o;return {o,checks:salesTransitionChecks(forChecks,action),take:amount=>salesTakeRecordPayment(o.id,amount)};});
 salesRunChecksMany(list,finish,action==='verified'?'Verify anyway':action==='batched'?'Send anyway':'Continue anyway');
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
   const now=new Date().toISOString(),saved=storageCommand(()=>{
    affected.forEach(x=>{if(!salesUnbatchRecord(x.o.id,x.ids,{confirmed:true,now,deferTouch:true}))throw new Error('Glass could not be unbatched.');});
    return true;
   });
   if(!saved.ok){optimizationNotice={title:'Not saved',detail:saved.error+' The orders are still selected; retry the action.',error:true};render();return;}
   optimizationSel.clear();
   optimizationNotice={title:'Lines unbatched · verification required',detail:affected.map(x=>x.o.businessNumber+' · '+x.ids.length+' line(s)').join(', ')};render();
  }}]});
}
function viewOptimization(){return ['batch','production'].includes(optimizationTab)?viewGlassBatches():optimizationTab==='stock'?viewStockList():optimizationTab==='sheets'?viewSheetUsage():viewOrderQueue(false);}
/* Действия над отмеченными заказами: одни и те же в строке над таблицей и в
   меню правой кнопки (владелец, 03.11.2026). */
function optimizationCan(selected,act){return selected.length>0&&selected.every(o=>salesRecordTransitionAllowed(o,act==='back'?salesPrevStatus(o):act,{back:act==='back'}));}
function optimizationActions(shipping,key,selected){
 const n=selected.length,item=(act,label,enabled,cls)=>({act,label,enabled,cls});
 if(shipping)return (key==='done'?[item('closed','Close order',optimizationCan(selected,'closed'))]:[]).concat([item('cancelled','Cancel order',optimizationCan(selected,'cancelled'),'sl-delete-quiet')]);
 const held=n>0&&selected.every(o=>o.onHold),out=[];
 if(key==='all'||key==='new')out.push(item('verified','Verify',optimizationCan(selected,'verified')));
 if(key==='all')out.push(item('select-glass','Select glass',true));
 out.push(item('unbatch','Unbatch',n>0&&selected.every(salesCanUnbatch)));
 out.push(item('back','Move back',optimizationCan(selected,'back')));
 out.push(item('hold',held?'Release':'On Hold',n>0));
 out.push(item('cancelled','Cancel order',optimizationCan(selected,'cancelled'),'sl-delete-quiet'));
 out.push(item('delete','Delete',n===1&&salesDeleteAllowed(),'sl-delete-quiet'));
 return out;
}
function optimizationContext(e,id){
 if(e){e.preventDefault();e.stopPropagation();}
 const o=salesRecord(id);if(!o)return;
 if(!optimizationSel.has(id))optimizationSel=new Set([id]);
 salesListMenu={kind:'oq-context',id,x:(e&&e.clientX)||40,y:(e&&e.clientY)||40,w:220};render();
}
function optimizationContextHTML(m,style){
 const o=salesRecord(m.id);if(!o)return '';
 const selected=optimizationRows().filter(x=>optimizationSel.has(x.id)),shipping=tab==='shipping',key=orderQueueKey();
 const item=(act,label,cls)=>`<button type="button" role="menuitem" class="${cls||''}" data-menu="${act}" onclick="optimizationContextRun('${act}')">${label}</button>`;
 const list=optimizationActions(shipping,key,selected).filter(x=>x.enabled).map(x=>item(x.act,x.label,x.cls?'dl':''));
 return `<div class="sl-ctx" style="${style}" role="menu">${item('open-one','Open')}${list.length?'<hr>'+list.join(''):''}</div>`;
}
function optimizationContextRun(act){
 const m=salesListMenu;salesListMenu=null;
 if(act==='open-one'&&m)optimizationOpenOrder(m.id);

 else optimizationAction(act);
 render();
}
function viewOrderQueue(shipping){
 if(optimizationScope!==tab){optimizationScope=tab;optimizationSel.clear();optimizationNotice=null;salesListMenu=null;}
 const key=orderQueueKey(),infos=optimizationBase(),filtered=salesListRows(infos),rows=filtered.map(i=>i.o),cols=salesListColumns(),selectable=rows.filter(o=>!optimizationBlocked(o));
 optimizationSel=new Set([...optimizationSel].filter(id=>rows.some(o=>o.id===id)));
 const selected=rows.filter(o=>optimizationSel.has(o.id)),n=selected.length,all=selectable.length>0&&n===selectable.length;
 const acts=optimizationActions(shipping,key,selected);
 const only=n===1?selected[0]:null;
 const bar=acts.map(x=>`<button type="button" class="sl-quiet${x.cls?' '+x.cls:''}" data-queue-action="${x.delivery||x.act}" ${x.enabled?'':'disabled'} onclick="optimizationAction('${x.act}'${x.delivery?",'"+x.delivery+"'":''})">${x.label}</button>`).join('');
 const tabs=orderQueueTabs().map(t=>`<button type="button" role="tab" aria-selected="${key===t[0]}" data-queue-tab="${t[0]}" class="sl-quick-pill${key===t[0]?' on':''}" onclick="optimizationSetTab('${t[0]}')">${t[1]} <b>${optimizationTabCount(t[0])}</b></button>`).join('');
 const cwId=salesListCwId(),keys=cols.map(c=>c.k);
 const th=c=>{const f=salesListLoadPrefs().filters[c.k],active=salesListFilterActive(f);return `<th class="${c.type==='number'?'n':''}" data-col="${c.k}" data-cw-key="${c.k}"><span class="sl-th"><span data-cw-label>${esc(c.label)}</span><button type="button" class="sl-fbtn${active?' on':''}" data-filter-col="${c.k}" aria-label="Filter and sort ${esc(c.label)}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span>${cwGrip()}</th>`;};
 const body=filtered.map(info=>{
  const o=info.o,chosen=optimizationSel.has(o.id);
  const cell=c=>c.k==='readyQty'?`<td>${shippingSummary(o).physicalReady} / ${shippingSummary(o).glass}</td>`:c.k==='batch'?`<td class="oq-batches">${salesOrderBatchNumbers(o).map(v=>`<span class="pill">${esc(v)}</span>`).join(' ')||'—'}</td>`:c.k==='newLines'?`<td class="n">${salesUnbatchedLines(o).length}</td>`:salesListCell(info,c);
  return `<tr data-queue-order="${esc(o.id)}" class="${o.onHold?'oq-hold':chosen?'oq-selected':''}" oncontextmenu="optimizationContext(event,'${esc(o.id)}')"><td><input type="checkbox" data-queue-check aria-label="Select order ${esc(o.businessNumber)}" ${chosen?'checked':''} onchange="optimizationToggle('${esc(o.id)}',this.checked)"></td>${cols.map(cell).join('')}
   <td></td></tr>`;
 }).join('');
 return `<section class="optimization-queue ${shipping?'shipping-queue':''}">
  <div class="card sales-list-card oq-card sl-foot-pin"><div class="sales-toolbar"><button type="button" class="sl-quiet" data-queue-open-order ${only?'':'disabled'} onclick="optimizationOpenOrder('${only?esc(only.id):''}')">Open</button>${n?`<b class="oq-sel" data-queue-selection>${n} selected</b>${bar}`:`<b class="oq-sel" data-queue-selection hidden>0 selected</b>`}</div>
  ${shipping?'':`<div class="sl-filter-row"><div class="sl-quick" role="tablist" aria-label="Order queues">${tabs}</div></div>`}
   ${salesListFilterChips()}<div class="oq-table-wrap sales-table-wrap"><table class="sl-table${cwTableClass(cwId)}"${cwTableAttrs(cwId,keys)}>${cwColgroup(cwId,keys)}<thead><tr><th class="sl-check"><span class="sl-header-tools"><input type="checkbox" data-queue-all aria-label="Select all eligible orders" ${all?'checked':''} ${selectable.length?'':'disabled'} onchange="optimizationSelectAll(this.checked)"><button type="button" class="sl-settings" data-columns-button title="Columns" aria-label="Columns" onclick="salesListOpenColumns(event)">${ico('settings')}</button></span></th>${cols.map(th).join('')}<th></th></tr></thead><tbody>${body||`<tr><td colspan="${cols.length+2}" class="empty">No orders match this queue and its filters.</td></tr>`}</tbody>${rows.length?salesListFooter(filtered,cols):''}</table></div>
   ${optimizationNotice?`<div class="oq-notice${optimizationNotice.error?' bad':''}" role="${optimizationNotice.error?'alert':'status'}"><b>${esc(optimizationNotice.title)}</b><span>${esc(optimizationNotice.detail)}</span><button type="button" class="sm" aria-label="Dismiss update" onclick="optimizationNotice=null;render()">×</button></div>`:''}
  </div>
  ${salesListMenuHTML(infos)}${salesHoldDialogHTML()}</section>`;
}
