/* Очередь отдельных стёкол и реестр. Общие фильтры колонок — из Sales;
   настройки трёх таблиц независимы. По умолчанию нет ограничения по стеклу
   или дате: малые остатки видны до решения оператора. */
let glassBatchSelection=new Set(),glassBatchOpenNumber='',glassBatchDetailTab='contents';
function glassBatchViewScope(){return optimizationTab==='batch'?'glassQueue':optimizationTab==='production'?(glassBatchOpenNumber?'glassContents':'glassBatches'):'';}
function glassBatchColumns(){
 const col=(k,label,type,def)=>({k,label,type:type||'text',def:def!==false});
 if(glassBatchViewScope()==='glassBatches')return [col('number','Batch'),col('created','Created','date'),col('glass','Glass'),col('units','Qty','number'),col('orders','Orders','number'),col('status','Status','list')];
 return [col('number','Order'),col('customer','Customer'),col('line','Line','number'),col('lite','Lite'),col('glass','Glass'),col('width','Cut W · in','number'),col('height','Cut H · in','number'),col('shape','Shape','list'),col('units','Qty','number'),col('due','Due','date',glassBatchViewScope()==='glassQueue'),col('status','Status','list'),col('priority','Priority','list',false),col('po','PO','text',false),col('created','Created','date',false),col('heat','Heat','list',false),col('coating','Coating surface','text',false),col('reason','Hold / review reason','text',false)];
}
function glassBatchStatus(b){const a=b.items.filter(i=>!i.releasedAt);return !a.length?'Unbatched':a.some(i=>i.cutStartedAt||((salesRecord(i.orderId)||{}).lines||[]).some(l=>l.id===i.lineId&&l.cutStartedAt))?'Cutting started':'Awaiting cutting';}
function glassBatchInfo(r){
 const o=r.o;return {o,q:false,c:{},r,memo:{number:o.businessNumber,customer:r.customer,line:r.line,lite:r.lite,glass:r.glass,width:r.width,height:r.height,shape:r.shapeLabel,units:r.remaining,due:o.dueDate,created:salesListIsoDay(o.createdAt),status:r.reason?(o.onHold||r.l.onHold?'On Hold':'Needs review'):'Waiting',priority:SALES_LIST_PRIORITY[o.priority]||'Normal',po:o.customerPo,heat:r.heat,coating:r.coating,reason:r.reason}};
}
function glassBatchInfos(){
 const scope=glassBatchViewScope();
 if(scope==='glassQueue')return glassBatchRows().map(glassBatchInfo);
 if(scope==='glassBatches')return (DB.glassBatch||[]).map(b=>{const a=b.items.filter(i=>!i.releasedAt);return {o:{createdAt:b.createdAt},b,memo:{number:b.number,created:salesListIsoDay(b.createdAt),glass:[...new Set(b.items.map(i=>i.snapshot.glass))].join(' / '),units:a.reduce((n,i)=>n+i.qty,0),orders:new Set(a.map(i=>i.orderId)).size,status:glassBatchStatus(b)}};});
 const b=glassBatchFind(glassBatchOpenNumber);return b?b.items.map(i=>{const s=i.snapshot,o=salesRecord(i.orderId)||{},l=(o.lines||[]).find(l=>l.id===i.lineId);return {o:{createdAt:i.at},b,item:i,memo:{number:s.order,customer:s.customer,line:s.line,lite:s.lite,glass:s.glass,width:s.width,height:s.height,shape:s.shape,units:i.qty,due:o.dueDate||'',created:salesListIsoDay(i.at),status:i.releasedAt?'Unbatched':i.cutStartedAt||l&&l.cutStartedAt?'Cutting started':o.status==='cancelled'?'Order cancelled':'Batched',priority:SALES_LIST_PRIORITY[o.priority]||'Normal',po:o.customerPo||'',heat:s.heat,coating:s.coating,reason:''}};}):[];
}
function glassBatchFiltered(){return salesListRows(glassBatchInfos());}
function glassBatchOpen(number){if(!glassBatchFind(number))return;tab='optimization';optimizationTab='production';glassBatchOpenNumber=number;glassBatchDetailTab='contents';glassBatchSelection.clear();salesListMenu=null;render();}
function glassBatchPickable(i){
 if(i.r)return !i.r.reason;
 if(!i.item)return false;
 const o=salesRecord(i.item.orderId),l=o&&(o.lines||[]).find(l=>l.id===i.item.lineId);
 return !!l&&salesUnbatchEligible(o)&&!i.item.releasedAt&&!i.item.cutStartedAt&&!l.cutStartedAt;
}
function glassBatchRowKey(i){return i.r?i.r.key:i.item?i.item.id:i.b.number;}
function glassBatchToggle(key,on){if(!glassBatchFiltered().some(i=>glassBatchRowKey(i)===key&&glassBatchPickable(i)))return;if(on)glassBatchSelection.add(key);else glassBatchSelection.delete(key);render();}
function glassBatchToggleAll(on){glassBatchFiltered().filter(glassBatchPickable).forEach(i=>{const k=glassBatchRowKey(i);if(on)glassBatchSelection.add(k);else glassBatchSelection.delete(k);});render();}
function glassBatchMaterial(id){salesListSetFilter('glass',id?{values:[id]}:null);}
function glassBatchCreateSelected(){
 const rows=glassBatchFiltered().filter(i=>glassBatchSelection.has(glassBatchRowKey(i))&&glassBatchPickable(i)).map(i=>i.r);if(!rows.length)return;
 const before=glassBatchSelectionStamp(rows),groups=new Map();rows.forEach(r=>{if(!groups.has(r.glassId))groups.set(r.glassId,[]);groups.get(r.glassId).push(r);});
 const orders=[...new Set(rows.map(r=>r.orderId))].map(salesRecord);
 const finish=()=>{
  if(before!==glassBatchSelectionStamp(rows)){salesDialogOpen({title:'Selection changed',note:'Review the glass queue and select the pieces again. No batch was created.',buttons:[{label:'Back'}]});return;}
  const list=[...groups.values()];
  if(list.some(g=>!glassBatchAssign(g,{dryRun:true}))){salesDialogOpen({title:'Selection changed',note:'Review the glass queue and select the pieces again. No batch was created.',buttons:[{label:'Back'}]});return;}
  const now=new Date().toISOString(),made=list.map(g=>glassBatchAssign(g,{now,deferTouch:true})).filter(Boolean);
  touch();glassBatchSelection.clear();
  if(made.length===1)glassBatchOpen(made[0].number);else{glassBatchOpenNumber='';optimizationTab='production';salesListMenu=null;render();}
 };
 const check=i=>{if(i===orders.length){finish();return;}salesRunChecks(salesTransitionChecks(orders[i],'batched'),()=>check(i+1),amount=>salesTakeRecordPayment(orders[i].id,amount));};
 if(groups.size>1){salesDialogOpen({title:'Create '+groups.size+' batches?',rows:[...groups.values()].map(a=>[a[0].glass,a.reduce((n,r)=>n+r.remaining,0)+' pcs']),note:'Each glass type gets its own batch. Unselected glass stays in the queue.',buttons:[{label:'Back'},{label:'Create batches',kind:'pri',run:()=>check(0)}]});}else check(0);
}
function glassBatchUnbatchSelected(){
 const selected=glassBatchFiltered().filter(i=>i.item&&glassBatchSelection.has(i.item.id)&&glassBatchPickable(i));if(!selected.length)return;
 const entries=selected.map(i=>({batch:i.b,item:i.item})),stamp=()=>JSON.stringify([DB.glassBatch,entries.map(x=>salesRecord(x.item.orderId))]),before=stamp();
 const lineChoices=selected.map(i=>({id:i.item.id,label:'Order '+i.memo.number+' · Line '+i.memo.line+' · Lite '+i.memo.lite,detail:i.memo.glass+' · '+i.item.qty+' pcs'}));
 salesDialogOpen({title:'Unbatch selected glass',lineChoices,checkedLines:lineChoices.map(x=>x.id),confirmed:false,note:'Only selected glass returns. Other batches stay locked. Affected orders return to To verify before batching again. Confirm with the cutting table that cutting has not started.',buttons:[{label:'Back'},{label:'Unbatch selected glass',kind:'pri',requiresConfirmation:true,run:d=>{
  if(before!==stamp()){salesDialogOpen({title:'Batch changed',note:'Review the batch and try again.',buttons:[{label:'Back'}]});return;}
  if(glassBatchRelease(entries.filter(x=>d.checkedLines.includes(x.item.id)),{confirmed:d.confirmed})){glassBatchSelection.clear();render();}
 }}]});
}
function glassBatchTabs(){return OPTIMIZATION_TABS.map(([k,label])=>`<button type="button" role="tab" data-queue-tab="${k}" aria-selected="${optimizationTab===k}" class="${optimizationTab===k?'on':''}" onclick="optimizationSetTab('${k}')">${label} <b>${optimizationTabCount(k)}</b></button>`).join('');}
/* Что ещё ждёт резки в заказах открытого батча — по типам стекла. */
function glassBatchStillWaiting(b){
 const orders=[...new Set(b.items.filter(i=>!i.releasedAt).map(i=>i.orderId))].map(salesRecord).filter(Boolean),m=new Map();
 glassBatchRows(orders).forEach(r=>m.set(r.glass,(m.get(r.glass)||0)+r.remaining));
 return [...m].sort((a,b)=>a[0].localeCompare(b[0]));
}
function glassBatchHeader(c){const active=salesListFilterActive(salesListLoadPrefs().filters[c.k]);return `<th><span class="sl-th">${esc(c.label)}<button type="button" class="sl-fbtn${active?' on':''}" data-filter-col="${c.k}" aria-label="Filter and sort ${esc(c.label)}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span></th>`;}
function glassBatchCell(i,c){
 const v=salesListValue(i,c.k);let text=v==null||v===''?'—':c.type==='date'?salesListShortDay(v):['width','height'].includes(c.k)?dimIn16(v):String(v);
 if(c.k==='number')return `<td><button class="gb-link" onclick="${i.b&&!i.item?`glassBatchOpen('${i.b.number}')`:`optimizationOpenOrder('${i.r?i.r.orderId:i.item.orderId}')`}">${esc(text)}</button></td>`;
 if(c.k==='status')return `<td><span class="gb-state ${text==='On Hold'||text==='Needs review'||text==='Order cancelled'?'held':text==='Unbatched'?'released':''}" title="${esc(i.r?i.r.reason:'')}">${esc(text)}</span></td>`;
 return `<td class="${c.type==='number'?'n':''}" title="${esc(text)}">${esc(text)}</td>`;
}
function viewGlassBatches(){
 if(optimizationScope!==tab){optimizationScope=tab;optimizationSel.clear();glassBatchSelection.clear();salesListMenu=null;}
 let scope=glassBatchViewScope(),b=glassBatchOpenNumber&&glassBatchFind(glassBatchOpenNumber);
 if(scope==='glassContents'&&!b){glassBatchOpenNumber='';scope='glassBatches';}
 const infos=glassBatchInfos(),rows=salesListRows(infos),cols=salesListColumns(),pickable=rows.filter(glassBatchPickable),keys=new Set(pickable.map(glassBatchRowKey));
 glassBatchSelection=new Set([...glassBatchSelection].filter(k=>keys.has(k)));const selected=rows.filter(i=>glassBatchSelection.has(glassBatchRowKey(i))),n=selected.length,qty=selected.reduce((n,i)=>n+i.memo.units,0),registry=scope==='glassBatches';
 const title=scope==='glassQueue'?'Glass queue':b?'Batch '+b.number:'Batches';
 const batchesTabs=b?`<div class="gb-detail-tabs"><button class="${glassBatchDetailTab==='contents'?'on':''}" onclick="glassBatchDetailTab='contents';render()">Contents</button><button class="${glassBatchDetailTab==='history'?'on':''}" onclick="glassBatchDetailTab='history';render()">History</button><button disabled title="Cutting layouts are not available yet">Optimization</button></div>`:'';
 const materials=new Map();if(scope==='glassQueue')infos.forEach(i=>materials.set(i.memo.glass,(materials.get(i.memo.glass)||0)+i.memo.units));
 const filter=salesListLoadPrefs().filters.glass,chosen=filter&&filter.values&&filter.values.length===1?filter.values[0]:'';
 const materialSelect=scope==='glassQueue'?`<label class="gb-material">Glass <select data-glass-material aria-label="Filter glass type" onchange="glassBatchMaterial(this.value)"><option value="">${filter?'Custom filter':'All'} · ${infos.reduce((n,i)=>n+i.memo.units,0)} pcs</option>${[...materials].sort((a,b)=>a[0].localeCompare(b[0])).map(([g,n])=>`<option value="${esc(g)}" ${chosen===g?'selected':''}>${esc(g)} · ${n} pcs</option>`).join('')}</select></label>`:'';
 const settings=`<button type="button" class="gb-settings" data-columns-button title="Columns" aria-label="Columns" onclick="salesListOpenColumns(event)">${ico('settings')}</button>`;
 const table=`<div class="sales-table-wrap"><table class="sl-table gb-table"><thead><tr><th><span class="sl-header-tools">${registry?'':`<input type="checkbox" data-glass-all aria-label="Select all eligible glass" ${n&&n===pickable.length?'checked':''} ${pickable.length?'':'disabled'} onchange="glassBatchToggleAll(this.checked)">`}${settings}</span></th>${cols.map(glassBatchHeader).join('')}</tr></thead><tbody>${rows.map(i=>{const k=glassBatchRowKey(i),on=glassBatchSelection.has(k),held=i.r&&i.r.reason;return `<tr data-glass-row="${esc(k)}" class="${held?'gb-held':on?'gb-selected':i.item&&i.item.releasedAt?'gb-released':''}"><td>${registry?'':`<input type="checkbox" data-glass-check aria-label="Select ${esc(i.memo.number+' line '+i.memo.line+' lite '+i.memo.lite)}" ${on?'checked':''} ${glassBatchPickable(i)?'':'disabled'} onchange="glassBatchToggle('${esc(k)}',this.checked)">`}</td>${cols.map(c=>glassBatchCell(i,c)).join('')}</tr>`;}).join('')||`<tr><td colspan="${cols.length+1}" class="empty">${scope==='glassQueue'?'No glass waiting in this view.':'No batches or items match this view.'}</td></tr>`}</tbody></table></div>`;
 const orderNumbers=ids=>[...new Set(b.items.filter(i=>!ids||ids.includes(i.id)).map(i=>i.snapshot.order).filter(Boolean))];
 const active=b?b.items.filter(i=>!i.releasedAt):[],activeOrders=new Set(active.map(i=>i.orderId)).size,status=b?glassBatchStatus(b):'';
 const history=b?`<div class="gb-history">${b.history.map(h=>`<div><time>${esc(salesShortDate(h.at))}</time><b>${esc(h.action)}</b><span>${h.qty} pcs</span><span class="gb-orders">${esc(orderNumbers(h.itemIds).map(n=>'Order '+n).join(', '))}</span></div>`).join('')||'<p class="mut">No events.</p>'}</div>`:'';
 const waiting=b?glassBatchStillWaiting(b):[];
 const head=b?`<p>${esc([...new Set(b.items.map(i=>i.snapshot.glass))].join(' / '))} · ${active.reduce((n,i)=>n+i.qty,0)} pcs · ${activeOrders} order${activeOrders===1?'':'s'} · Created ${esc(salesShortDate(b.createdAt))}</p>`:`<p>${scope==='glassQueue'?'Verified glass waiting for cutting. Filter only when you need to.':'Batch contents and history.'}</p>`;
 const footer=scope==='glassContents'?`${rows.filter(i=>!i.item.releasedAt).reduce((n,i)=>n+i.memo.units,0)} pcs · ${new Set(rows.filter(i=>!i.item.releasedAt).map(i=>i.item.orderId)).size} orders`:
  `${rows.length} ${registry?'batches':'rows'} · ${rows.filter(i=>!i.item||!i.item.releasedAt).reduce((n,i)=>n+(i.memo.units||0),0)} pcs${scope==='glassQueue'?' waiting · '+materials.size+' glass types':''}`;
 return `<section class="optimization-queue glass-batches"><div class="page-head"><div>${b?'<button type="button" class="gb-link" onclick="optimizationSetTab(\'production\')">‹ Batches</button>':''}<h2>${esc(title)}</h2>${head}</div>${b?`<span class="gb-status ${status==='Awaiting cutting'?'wait':status==='Cutting started'?'cut':'off'}" data-batch-status>${esc(status)}</span>`:''}</div>
 ${b?batchesTabs:`<div class="oq-tabs" role="tablist">${glassBatchTabs()}</div>`}
 <div class="card oq-card">${b&&glassBatchDetailTab==='history'?history:`<div class="oq-toolbar">${materialSelect}<span class="sp"></span>${registry?'':`<b>${qty} pcs selected</b><button type="button" class="${scope==='glassQueue'?'pri':''}" data-glass-action="${scope==='glassQueue'?'create':'unbatch'}" ${n?'':'disabled'} onclick="${scope==='glassQueue'?'glassBatchCreateSelected()':'glassBatchUnbatchSelected()'}">${scope==='glassQueue'?'Create batch':'Unbatch selected'}</button>`}</div>${salesListFilterChips()}${table}<div class="gb-footer">${footer}</div>`}
 ${b?'<p class="gb-note">Unbatch is available only before cutting starts. Cutting layouts are not available yet.</p>':''}</div>
 ${b&&glassBatchDetailTab==='contents'?`<div class="card gb-waiting" data-still-waiting><h3>Still waiting in these orders</h3><p>${waiting.length?waiting.map(([g,n])=>esc(g)+': '+n+' pcs').join(' · '):'Nothing else is waiting in these orders.'}</p><button type="button" class="gb-link" onclick="optimizationSetTab('batch')">Back to glass queue</button></div>`:''}
 ${salesListMenuHTML(infos)}${salesDialogHTML()}</section>`;
}
