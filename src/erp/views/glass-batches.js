/* Очередь отдельных стёкол и реестр. Одна строка — одно стекло с Glass ID
   и местом «Unit 7 of 50». Общие фильтры колонок — из Sales; настройки трёх
   таблиц независимы. По умолчанию нет ограничения по стеклу или дате: малые
   остатки видны до решения оператора. Shift выбирает диапазон строк. */
let glassBatchSelection=new Set(),glassBatchOpenNumber='',glassBatchDetailTab='contents',glassBatchAnchor='';
function glassBatchViewScope(){return optimizationTab==='batch'?'glassQueue':optimizationTab==='production'?(glassBatchOpenNumber?'glassContents':'glassBatches'):'';}
function glassBatchColumns(){
 const col=(k,label,type,def)=>({k,label,type:type||'text',def:def!==false});
 if(glassBatchViewScope()==='glassBatches')return [col('number','Batch'),col('created','Created','date'),col('glass','Glass'),col('units','Qty','number'),col('orders','Orders','number'),col('status','Status','list')];
 return [col('piece','Glass ID'),col('number','Order'),col('customer','Customer'),col('line','Line','number'),col('unit','Unit'),col('lite','Lite'),col('glass','Glass'),col('width','Cut W · in','number'),col('height','Cut H · in','number'),col('shape','Shape','list'),col('due','Due','date',glassBatchViewScope()==='glassQueue'),col('status','Status','list'),col('priority','Priority','list',false),col('po','PO','text',false),col('created','Created','date',false),col('heat','Heat','list',false),col('coating','Coating surface','text',false),col('reason','Hold / review reason','text',false)];
}
function glassBatchActiveItems(b){return b.items.filter(i=>!i.releasedAt&&b.parts[i.part]);}
function glassBatchStatus(b){
 const a=glassBatchActiveItems(b);
 return !a.length?'Unbatched':a.some(i=>{const p=b.parts[i.part],l=((salesRecord(p.orderId)||{}).lines||[]).find(l=>l.id===p.lineId);return i.cutStartedAt||l&&l.cutStartedAt;})?'Cutting started':'Awaiting cutting';
}
function glassBatchInfo(r){
 const o=r.o;return {o,q:false,c:{},r,memo:{piece:r.piece||'—',number:o.businessNumber,customer:r.customer,line:r.line,unit:r.recut?'Recut '+r.recut+' · '+r.k+' of '+r.of:r.unit+' of '+r.of,lite:r.lite,glass:r.glass,width:r.width,height:r.height,shape:r.shapeLabel,units:1,due:o.dueDate,created:salesListIsoDay(o.createdAt),
  status:r.reason?(o.onHold||r.l.onHold?'On Hold':'Needs review'):'Waiting',priority:SALES_LIST_PRIORITY[o.priority]||'Normal',po:o.customerPo,heat:r.heat,coating:r.coating,reason:r.reason}};
}
function glassBatchInfos(){
 const scope=glassBatchViewScope();
 if(scope==='glassQueue')return glassBatchRows().map(glassBatchInfo);
 if(scope==='glassBatches')return (DB.glassBatch||[]).map(b=>{const a=glassBatchActiveItems(b);return {o:{createdAt:b.createdAt},b,memo:{number:b.number,created:salesListIsoDay(b.createdAt),glass:[...new Set(b.parts.map(p=>p.snapshot.glass))].join(' / '),units:a.length,orders:new Set(a.map(i=>b.parts[i.part].orderId)).size,status:glassBatchStatus(b)}};});
 const b=glassBatchFind(glassBatchOpenNumber);if(!b)return [];
 return b.items.map((item,index)=>({item,index})).filter(x=>b.parts[x.item.part]).map(({item,index})=>{
  const part=b.parts[item.part],s=part.snapshot,o=salesRecord(part.orderId)||{},l=(o.lines||[]).find(l=>l.id===part.lineId);
  return {o:{createdAt:item.at},b,item,index,part,memo:{piece:item.piece,number:s.order,customer:s.customer,line:s.line,unit:typeof item.unit==='string'?'Recut '+item.unit.split('.')[0]+' · '+item.unit.split('.')[1]+' of '+(s.of||'?'):item.unit+' of '+(s.of||(l?l.qty:'?')),lite:s.lite,glass:s.glass,width:s.width,height:s.height,shape:s.shape,units:1,due:o.dueDate||'',created:salesListIsoDay(item.at),
   status:item.releasedAt?'Unbatched':item.cutStartedAt||l&&l.cutStartedAt?'Cutting started':o.status==='cancelled'?'Order cancelled':'Batched',priority:SALES_LIST_PRIORITY[o.priority]||'Normal',po:o.customerPo||'',heat:s.heat,coating:s.coating,reason:''}};
 });
}
function glassBatchFiltered(){return salesListRows(glassBatchInfos());}
function glassBatchOpen(number){if(!glassBatchFind(number))return;tab='optimization';optimizationTab='production';glassBatchOpenNumber=number;glassBatchDetailTab='contents';glassBatchSelection.clear();glassBatchAnchor='';salesListMenu=null;render();}
function glassBatchPickable(i){
 if(i.r)return !i.r.reason;
 if(!i.item)return false;
 const o=salesRecord(i.part.orderId),l=o&&(o.lines||[]).find(l=>l.id===i.part.lineId);
 return !!l&&salesUnbatchEligible(o)&&!i.item.releasedAt&&!i.item.cutStartedAt&&!l.cutStartedAt;
}
function glassBatchRowKey(i){return i.r?i.r.slot:i.item?i.b.number+'#'+i.index:i.b.number;}
/* Клик — одно стекло; Shift — все доступные строки между прошлым кликом и этим. */
function glassBatchToggle(key,on,range){
 const rows=glassBatchFiltered(),keys=rows.map(glassBatchRowKey),at=keys.indexOf(key),from=range&&glassBatchAnchor?keys.indexOf(glassBatchAnchor):-1;
 if(at<0||!glassBatchPickable(rows[at]))return;
 rows.slice(from<0?at:Math.min(from,at),(from<0?at:Math.max(from,at))+1).filter(glassBatchPickable).forEach(i=>{const k=glassBatchRowKey(i);if(on)glassBatchSelection.add(k);else glassBatchSelection.delete(k);});
 glassBatchAnchor=key;render();
}
function glassBatchToggleAll(on){glassBatchFiltered().filter(glassBatchPickable).forEach(i=>{const k=glassBatchRowKey(i);if(on)glassBatchSelection.add(k);else glassBatchSelection.delete(k);});glassBatchAnchor='';render();}
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
  touch();glassBatchSelection.clear();glassBatchAnchor='';
  if(made.length===1)glassBatchOpen(made[0].number);else{glassBatchOpenNumber='';optimizationTab='production';salesListMenu=null;render();}
 };
 const check=i=>{if(i===orders.length){finish();return;}salesRunChecks(salesTransitionChecks(orders[i],'batched'),()=>check(i+1),amount=>salesTakeRecordPayment(orders[i].id,amount));};
 if(groups.size>1){salesDialogOpen({title:'Create '+groups.size+' batches?',rows:[...groups.values()].map(a=>[a[0].glass,a.length+' pcs']),note:'Each glass type gets its own batch. Unselected glass stays in the queue.',buttons:[{label:'Back'},{label:'Create batches',kind:'pri',run:()=>check(0)}]});}else check(0);
}
function glassBatchUnbatchSelected(){
 const selected=glassBatchFiltered().filter(i=>i.item&&glassBatchSelection.has(glassBatchRowKey(i))&&glassBatchPickable(i));if(!selected.length)return;
 const stamp=()=>JSON.stringify([DB.glassBatch,selected.map(i=>salesRecord(i.part.orderId))]),before=stamp();
 const lineChoices=selected.map(i=>({id:glassBatchRowKey(i),label:i.item.piece+' · Order '+i.memo.number+' · Line '+i.memo.line+' · Unit '+i.memo.unit+' · Lite '+i.memo.lite,detail:i.memo.glass}));
 salesDialogOpen({title:'Unbatch selected glass',lineChoices,checkedLines:lineChoices.map(x=>x.id),confirmed:false,note:'Only selected glass returns. Glass IDs stay the same. Other batches stay locked. Affected orders return to To verify before batching again. Confirm with the cutting table that cutting has not started.',buttons:[{label:'Back'},{label:'Unbatch selected glass',kind:'pri',requiresConfirmation:true,run:d=>{
  if(before!==stamp()){salesDialogOpen({title:'Batch changed',note:'Review the batch and try again.',buttons:[{label:'Back'}]});return;}
  if(glassBatchRelease(selected.filter(i=>d.checkedLines.includes(glassBatchRowKey(i))).map(i=>({batch:i.b,item:i.item})),{confirmed:d.confirmed})){glassBatchSelection.clear();glassBatchAnchor='';render();}
 }}]});
}
/* Unbatch целого заказа из Sales — редкое действие, только для заказа под
   правой кнопкой (владелец, 17 сентября 2026). Окно показывает батчи заказа
   без номеров стёкол: Glass ID — производственный номер, в Sales его нет. */
function glassBatchOrderReleasable(o){
 return glassBatchEntries(o.id).filter(x=>{if(x.item.releasedAt||x.item.cutStartedAt)return false;const l=(o.lines||[]).find(l=>l.id===x.part.lineId);return !!l&&!l.cutStartedAt;});
}
function glassBatchCanUnbatchOrder(o){return !!o&&!salesIsQuote(o)&&salesUnbatchEligible(o)&&glassBatchOrderReleasable(o).length>0;}
function glassBatchUnbatchOrder(orderId){
 const o=salesRecord(orderId);if(!glassBatchCanUnbatchOrder(o))return;
 const free=glassBatchOrderReleasable(o),cut=glassBatchEntries(o.id).filter(x=>!x.item.releasedAt).length-free.length,groups=new Map(),p=glassBatchProgress(o);
 free.forEach(x=>{const k=x.batch.number;if(!groups.has(k))groups.set(k,{glass:new Set(),n:0});groups.get(k).glass.add(x.part.snapshot.glass);groups.get(k).n++;});
 const stamp=()=>JSON.stringify([DB.glassBatch,salesRecord(orderId)]),before=stamp(),lineChoices=[...groups].map(([k,g])=>({id:k,label:k+' · '+[...g.glass].join(' / '),detail:g.n+' pcs'}));
 salesDialogOpen({title:'Unbatch order '+o.businessNumber+'?',sub:salesCustomerDisplay(o.customerId)+' · '+p.assigned+' of '+p.total+' pcs in batches',lineChoices,checkedLines:lineChoices.map(x=>x.id),confirmed:false,
  confirmLabel:'I confirm cutting has not started for this order.',
  note:'Glass of this order in the selected batches returns to the glass queue. Other orders in these batches stay batched. The order returns to To verify.'+(cut?' '+cut+' pcs with cutting started stay in their batch.':''),
  buttons:[{label:'Back'},{label:'Unbatch order',kind:'pri',requiresConfirmation:true,run:d=>{
   if(before!==stamp()){salesDialogOpen({title:'Order changed',note:'Review the order and try Unbatch again.',buttons:[{label:'Back'}]});return;}
   const chosen=new Set(d.checkedLines);glassBatchRelease(glassBatchOrderReleasable(salesRecord(orderId)).filter(x=>chosen.has(x.batch.number)).map(x=>({batch:x.batch,item:x.item})),{confirmed:d.confirmed});render();
  }}]});
}
function glassBatchTabs(){return OPTIMIZATION_TABS.map(([k,label])=>`<button type="button" role="tab" data-queue-tab="${k}" aria-selected="${optimizationTab===k}" class="${optimizationTab===k?'on':''}" onclick="optimizationSetTab('${k}')">${label} <b>${optimizationTabCount(k)}</b></button>`).join('');}
/* Что ещё ждёт резки в заказах открытого батча — по типам стекла. */
function glassBatchStillWaiting(b){
 const orders=[...new Set(glassBatchActiveItems(b).map(i=>b.parts[i.part].orderId))].map(salesRecord).filter(Boolean),m=new Map();
 glassBatchRows(orders).forEach(r=>m.set(r.glass,(m.get(r.glass)||0)+1));
 return [...m].sort((a,b)=>a[0].localeCompare(b[0]));
}
function glassBatchHeader(c){const active=salesListFilterActive(salesListLoadPrefs().filters[c.k]);return `<th><span class="sl-th">${esc(c.label)}<button type="button" class="sl-fbtn${active?' on':''}" data-filter-col="${c.k}" aria-label="Filter and sort ${esc(c.label)}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span></th>`;}
function glassBatchCell(i,c){
 const v=salesListValue(i,c.k);let text=v==null||v===''?'—':c.type==='date'?salesListShortDay(v):['width','height'].includes(c.k)?dimIn16(v):String(v);
 if(c.k==='number')return `<td><button type="button" class="gb-link" onclick="${i.b&&!i.item?`glassBatchOpen('${i.b.number}')`:`optimizationOpenOrder('${esc(i.r?i.r.orderId:i.part.orderId)}')`}">${esc(text)}</button></td>`;
 if(c.k==='piece')return `<td class="gb-piece">${esc(text)}</td>`;
 if(c.k==='status')return `<td><span class="gb-state ${text==='On Hold'||text==='Needs review'||text==='Order cancelled'?'held':text==='Unbatched'?'released':''}" title="${esc(i.r?i.r.reason:'')}">${esc(text)}</span></td>`;
 return `<td class="${c.type==='number'?'n':''}" title="${esc(text)}">${esc(text)}</td>`;
}
function viewGlassBatches(){
 if(optimizationScope!==tab){optimizationScope=tab;optimizationSel.clear();glassBatchSelection.clear();glassBatchAnchor='';salesListMenu=null;}
 let scope=glassBatchViewScope(),b=glassBatchOpenNumber&&glassBatchFind(glassBatchOpenNumber);
 if(scope==='glassContents'&&!b){glassBatchOpenNumber='';scope='glassBatches';}
 /* Страховка: проверенный заказ без номеров стёкол получает их до показа очереди. */
 if(scope==='glassQueue'&&(DB.salesOrder||[]).reduce((changed,o)=>glassPieceEnsure(o)||changed,false))touch();
 const infos=glassBatchInfos(),rows=salesListRows(infos),cols=salesListColumns(),pickable=rows.filter(glassBatchPickable),keys=new Set(pickable.map(glassBatchRowKey));
 glassBatchSelection=new Set([...glassBatchSelection].filter(k=>keys.has(k)));const n=rows.filter(i=>glassBatchSelection.has(glassBatchRowKey(i))).length,registry=scope==='glassBatches';
 const title=scope==='glassQueue'?'Glass queue':b?'Batch '+b.number:'Batches';
 const batchesTabs=b?`<div class="gb-detail-tabs"><button type="button" class="${glassBatchDetailTab==='contents'?'on':''}" onclick="glassBatchDetailTab='contents';render()">Contents</button><button type="button" class="${glassBatchDetailTab==='history'?'on':''}" onclick="glassBatchDetailTab='history';render()">History</button><button type="button" disabled title="Cutting layouts are not available yet">Optimization</button></div>`:'';
 const materials=new Map();if(scope==='glassQueue')infos.forEach(i=>materials.set(i.memo.glass,(materials.get(i.memo.glass)||0)+1));
 const filter=salesListLoadPrefs().filters.glass,chosen=filter&&filter.values&&filter.values.length===1?filter.values[0]:'';
 const materialSelect=scope==='glassQueue'?`<label class="gb-material">Glass <select data-glass-material aria-label="Filter glass type" onchange="glassBatchMaterial(this.value)"><option value="">${filter?'Custom filter':'All'} · ${infos.length} pcs</option>${[...materials].sort((a,b)=>a[0].localeCompare(b[0])).map(([g,c])=>`<option value="${esc(g)}" ${chosen===g?'selected':''}>${esc(g)} · ${c} pcs</option>`).join('')}</select></label>`:'';
 const settings=`<button type="button" class="gb-settings" data-columns-button title="Columns" aria-label="Columns" onclick="salesListOpenColumns(event)">${ico('settings')}</button>`;
 const table=`<div class="sales-table-wrap"><table class="sl-table gb-table"><thead><tr><th><span class="sl-header-tools">${registry?'':`<input type="checkbox" data-glass-all aria-label="Select all eligible glass" ${n&&n===pickable.length?'checked':''} ${pickable.length?'':'disabled'} onchange="glassBatchToggleAll(this.checked)">`}${settings}</span></th>${cols.map(glassBatchHeader).join('')}</tr></thead><tbody>${rows.map(i=>{const k=glassBatchRowKey(i),on=glassBatchSelection.has(k),held=i.r&&i.r.reason;return `<tr data-glass-row="${esc(k)}" data-glass-id="${esc(i.memo.piece||'')}" class="${held?'gb-held':on?'gb-selected':i.item&&i.item.releasedAt?'gb-released':''}"><td>${registry?'':`<input type="checkbox" data-glass-check aria-label="Select ${esc(i.memo.piece+' order '+i.memo.number+' line '+i.memo.line+' unit '+i.memo.unit+' lite '+i.memo.lite)}" ${on?'checked':''} ${glassBatchPickable(i)?'':'disabled'} onclick="glassBatchToggle('${esc(k)}',this.checked,event.shiftKey)">`}</td>${cols.map(c=>glassBatchCell(i,c)).join('')}</tr>`;}).join('')||`<tr><td colspan="${cols.length+1}" class="empty">${scope==='glassQueue'?'No glass waiting in this view.':'No batches or glass match this view.'}</td></tr>`}</tbody></table></div>`;
 const pieceOrder=new Map();if(b)b.items.forEach(i=>{const p=b.parts[i.part];if(p)pieceOrder.set(i.piece,p.snapshot.order);});
 const orderNumbers=pieces=>[...new Set((pieces||[]).map(id=>pieceOrder.get(id)).filter(Boolean))];
 const active=b?glassBatchActiveItems(b):[],activeOrders=new Set(active.map(i=>b.parts[i.part].orderId)).size,status=b?glassBatchStatus(b):'';
 const history=b?`<div class="gb-history">${b.history.map(h=>`<div><time>${esc(salesShortDate(h.at))}</time><b>${esc(h.action)}</b><span>${h.qty} pcs</span><span class="gb-orders">${esc(orderNumbers(h.pieces).map(n=>'Order '+n).join(', '))}</span><span class="gb-orders" data-history-pieces>${esc((h.pieces||[]).length<=6?(h.pieces||[]).join(', '):h.pieces[0]+' … '+h.pieces[h.pieces.length-1])}</span></div>`).join('')||'<p class="mut">No events.</p>'}</div>`:'';
 const waiting=b?glassBatchStillWaiting(b):[],plural=(c,w)=>c+' '+w+(c===1?'':'s');
 const head=b?`<p>${esc([...new Set(b.parts.map(p=>p.snapshot.glass))].join(' / '))} · ${active.length} pcs · ${plural(activeOrders,'order')} · Created ${esc(salesShortDate(b.createdAt))}</p>`:`<p>${scope==='glassQueue'?'Verified glass waiting for cutting. Each row is one glass. Filter only when you need to.':'Batch contents and history.'}</p>`;
 const live=rows.filter(i=>!i.item||!i.item.releasedAt);
 const footer=scope==='glassContents'?`${live.length} pcs · ${plural(new Set(live.map(i=>i.part.orderId)).size,'order')}`:registry?`${plural(rows.length,'batch').replace('batchs','batches')} · ${rows.reduce((c,i)=>c+i.memo.units,0)} pcs`:`${rows.length} pcs waiting · ${plural(materials.size,'glass type')}`;
 return `<section class="optimization-queue glass-batches"><div class="page-head"><div>${b?'<button type="button" class="gb-link" onclick="optimizationSetTab(\'production\')">‹ Batches</button>':''}<h2>${esc(title)}</h2>${head}</div>${b?`<span class="gb-status ${status==='Awaiting cutting'?'wait':status==='Cutting started'?'cut':'off'}" data-batch-status>${esc(status)}</span>`:''}</div>
 ${b?batchesTabs:`<div class="oq-tabs" role="tablist">${glassBatchTabs()}</div>`}
 <div class="card oq-card">${b&&glassBatchDetailTab==='history'?history:`<div class="oq-toolbar">${materialSelect}<span class="sp"></span>${registry?'':`<b data-glass-selected>${n} pcs selected</b><button type="button" class="${scope==='glassQueue'?'pri':''}" data-glass-action="${scope==='glassQueue'?'create':'unbatch'}" ${n?'':'disabled'} onclick="${scope==='glassQueue'?'glassBatchCreateSelected()':'glassBatchUnbatchSelected()'}">${scope==='glassQueue'?'Create batch':'Unbatch selected'}</button>`}</div>${salesListFilterChips()}${table}<div class="gb-footer">${footer}</div>`}
 ${b?'<p class="gb-note">Unbatch is available only before cutting starts. Cutting layouts are not available yet.</p>':registry?'':'<p class="gb-note">Shift-click selects a range of glass.</p>'}</div>
 ${b&&glassBatchDetailTab==='contents'?`<div class="card gb-waiting" data-still-waiting><h3>Still waiting in these orders</h3><p>${waiting.length?waiting.map(([g,c])=>esc(g)+': '+c+' pcs').join(' · '):'Nothing else is waiting in these orders.'}</p><button type="button" class="gb-link" onclick="optimizationSetTab('batch')">Back to glass queue</button></div>`:''}
 ${salesListMenuHTML(infos)}${salesDialogHTML()}</section>`;
}
