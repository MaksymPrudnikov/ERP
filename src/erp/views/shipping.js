/* Shipping office · PR 1, 5 October 2026.
   Ready by scan, one customer/address per PS, partial dispatch and receipt.
   Uses the existing Sales column filters. PR 2, 6 October 2026: customer
   queue in Ready and the Loaded button (rules: erp/shipping/loading).
   No truck UI here. */
const SHIPPING_TABS=[['awaiting','Awaiting readiness'],['ready','Ready'],['shipments','Shipments'],['backorders','Backorders'],['done','Done']];
let shippingTab='ready',shippingNotice=null,shippingDraft=null,shippingOpenId='',shippingPreview=false;
let shippingSelection=new Set(),shippingCustomer='',shippingReceivedBy='',shippingReceivedOn='';
function shippingSetTab(key){shippingTab=key;shippingNotice=null;salesListMenu=null;render();}
/* Счётчики на вкладках — как были у очереди Shipping: заказы, у Shipments —
   открытые PS (planned и shipped). */
function shippingTabCount(key){
 if(key==='delivery')return (DB.shipment||[]).filter(s=>s.method==='delivery'&&s.date===finToday()&&(s.status==='planned'||s.status==='shipped')).length;
 if(key==='shipments')return (DB.shipment||[]).filter(s=>s.status==='planned'||s.status==='shipped').length;
 if(key==='ready')return shippingReadyOrders().length;
 if(key==='backorders')return shippingOrders().filter(o=>o.status==='shipping'&&shippingBackCount(o)>0).length;
 return (DB.salesOrder||[]).filter(o=>optimizationMatches(o,key)).length;
}
/* Delivery — свой экран, не очередь заказов: в SHIPPING_TABS (вкладки
   очереди, erp/views/optimization) он не входит. */
function shippingViewTabs(){const t=SHIPPING_TABS.slice();t.splice(t.findIndex(x=>x[0]==='shipments')+1,0,['delivery','Delivery']);return t;}
function shippingTabs(){return '<div class="oq-tabs" role="tablist">'+shippingViewTabs().map(([key,name])=>`<button type="button" role="tab" data-shipping-tab="${key}" aria-selected="${shippingTab===key}" class="${shippingTab===key?'on':''}" onclick="shippingSetTab('${key}')">${name} <b>${shippingTabCount(key)}</b></button>`).join('')+'</div>';}
function shippingOrders(){return (DB.salesOrder||[]).filter(o=>!salesIsQuote(o)&&!['cancelled','closed'].includes(o.status)&&!shippingLegacy(o)&&(o.status!=='new'||shippingAvailable(o).length>0));}
/* Ready — только то, что можно положить в PS: готовые юниты без PS и товары
   склада. Заказ, где готового нет, сюда не попадает (он в Awaiting). */
function shippingReadyExtras(o,q){return o.status!=='new'&&!o.onHold?q.extras.filter(e=>e.ready>0):[];}
function shippingReadyOrders(){return shippingOrders().filter(o=>{const q=shippingSummary(o);return q.ready>0||shippingReadyExtras(o,q).length>0;});}
function shippingSelect(customerId,labels,on){if(shippingCustomer!==customerId){shippingSelection.clear();shippingCustomer=customerId;}labels.forEach(id=>on?shippingSelection.add(id):shippingSelection.delete(id));render();}
function shippingSelectOrder(id,on){const o=salesRecord(id);shippingSelect(o.customerId,shippingAvailable(o).map(i=>i.label),on);}
function shippingSelectSkid(customerId,code,on){shippingSelect(customerId,shippingWithCtx(()=>shippingOrders().filter(o=>o.customerId===customerId).flatMap(shippingAvailable).filter(i=>i.skid===code).map(i=>i.label)),on);}
function shippingSelectQty(id,lineId,n){const o=salesRecord(id),units=shippingAvailable(o).filter(i=>i.lineId===lineId);if(shippingCustomer!==o.customerId){shippingSelection.clear();shippingCustomer=o.customerId;}units.forEach((i,k)=>k<Math.max(0,+n||0)?shippingSelection.add(i.label):shippingSelection.delete(i.label));render();}
/* Способ по умолчанию — из заказов в PS (Pickup / Delivery ставит продавец),
   у пустого рейса — из карточки клиента. */
function shippingOpen(customerId,id){
 shippingWithCtx(()=>{
  const s=id&&shippingFind(id),orders=shippingOrders().filter(o=>o.customerId===customerId),c=salesFindCustomer(customerId);
  const all=orders.flatMap(shippingAvailable),selected=all.filter(i=>shippingCustomer===customerId&&shippingSelection.has(i.label)),items=selected.length?selected:all;
  const planned=[...new Set(items.map(i=>i.orderId))].map(oid=>salesRecord(oid).delivery);
  const method=planned.length?(planned.every(d=>d==='pickup')?'pickup':'delivery'):String(c&&c.defaultDeliveryMethod||'').toLowerCase().includes('pickup')?'pickup':'delivery';
  shippingDraft=s?shippingClone(s):{customerId,method,shipTo:shippingDefaultAddress(c),date:finToday(),items:items.map(shippingItem),extras:orders.filter(o=>o.status!=='new'&&!o.onHold).flatMap(o=>shippingSummary(o).extras.filter(x=>x.ready>0).map(x=>({orderId:o.id,extraId:x.x.id,qty:x.ready}))),note:''};
  shippingDraft.error='';
 });
 render();
}
function shippingDraftQty(orderId,lineId,n){
 const d=shippingDraft,o=salesRecord(orderId);if(!d||!o)return;const available=shippingAvailable(o,d.id).filter(i=>i.lineId===lineId);
 available.sort((a,b)=>Number(!!b.loaded)-Number(!!a.loaded)||Number(d.items.some(i=>i.label===b.label))-Number(d.items.some(i=>i.label===a.label)));
 d.items=d.items.filter(i=>i.orderId!==orderId||i.lineId!==lineId).concat(available.slice(0,Math.max(0,Math.floor(+n)||0)).map(shippingItem));render();
}
function shippingDraftExtra(orderId,extraId,n){const d=shippingDraft;if(!d)return;d.extras=d.extras.filter(i=>i.orderId!==orderId||i.extraId!==extraId);if(+n>0)d.extras.push({orderId,extraId,qty:Math.floor(+n)});}
function shippingDraftAddress(id){const c=salesFindCustomer(shippingDraft.customerId),a=(c.addresses||[]).find(a=>a.id===id);shippingDraft.shipTo=a?shippingAddress(Object.assign({},a,{contact:shippingDraft.shipTo.contact,phone:shippingDraft.shipTo.phone})):shippingAddress({});render();}
function shippingSave(){
 const d=shippingDraft;if(!d)return;
 try{shippingValidateSelection(d,d.id);}catch(e){d.error=e.message;render();return;}
 shippingWithChecks(shippingOrderIds(d),d.method,false,()=>{
  const out=d.id?shippingUpdate(d.id,d):shippingCreate(d);if(!out.ok){d.error=out.error;render();return;}
  shippingDraft=null;shippingSelection.clear();shippingOpenId=out.value.id;shippingTab='shipments';shippingNotice={text:out.value.number+' saved'};render();
 });
}
function shippingResult(out){shippingNotice={error:!out.ok,text:out.ok?out.value.number+' · '+shippingStatus(out.value):out.error};render();}
function shippingStatus(s){return s.status==='delivered'?(s.method==='pickup'?'Picked up':'Delivered'):({planned:'Planned',shipped:'Shipped',cancelled:'Cancelled'})[s.status]||'';}
function shippingQueueChange(orderId,lineId,value){const out=shippingQueueSet(orderId,[lineId],value);shippingNotice=out.ok?null:{error:true,text:out.error};render();}
/* Loaded: едет то, что отсканировано на станции отгрузки; что остаётся в
   Ready — офис видит до записи. Ничего не сканировали — офис подтверждает
   весь PS сам, как раньше кнопкой Shipped. После записи — печать PS. */
function shippingLoaded(id){
 const s=shippingFind(id);if(!s)return;
 const state=()=>{const now=shippingFind(id);return now&&shippingWithCtx(()=>shippingLoadState(now));},st=state();
 const stamp=()=>{const now=state();return JSON.stringify([shippingFind(id),now&&now.loaded.map(u=>u.label)]);},before=stamp();
 const run=mode=>{
  if(stamp()!==before){shippingNotice={error:true,text:'Packing slip changed. Try again.'};render();return;}
  const out=shippingMarkShipped(id,mode);shippingResult(out);if(out.ok)shippingPrint(id);
 };
 if(!st.units.length||st.loaded.length===st.units.length){run(st.units.length?'loaded':'');return;}
 if(!st.loaded.length){salesDialogOpen({title:'Nothing scanned at '+shippingStations().ship,note:'Ship all '+shippingLoadPart(st.units)+' on '+s.number+'?',buttons:[{label:'Back'},{label:'Ship all',kind:'pri',run:()=>run('')}]});return;}
 salesDialogOpen({title:s.number+' · '+shippingLoadPart(st.loaded)+' loaded',note:shippingLoadPart(st.rest)+' not loaded — back to Ready for the next trip.',buttons:[{label:'Back'},{label:'Loaded',kind:'pri',run:()=>run('loaded')}]});
}
function shippingReceive(id){shippingResult(shippingMarkDelivered(id,shippingReceivedBy,shippingReceivedOn||finToday()));}
function shippingSigned(raw){const out=shippingScanSigned(raw,shippingReceivedBy,shippingReceivedOn||finToday());if(out.ok)shippingOpenId=out.value.id;shippingResult(out);shippingFocus();}
function shippingUndo(id,action){
 const s=shippingFind(id);if(!s)return;const before=JSON.stringify(s),verb=action==='cancel'?'Cancel packing slip':action==='receipt'?'Undo receipt':'Undo dispatch';
 salesDialogOpen({title:verb+' '+s.number+'?',note:'The order quantities and dates will be recalculated.',buttons:[{label:'Back'},{label:verb,kind:'dl',run:()=>{
  if(JSON.stringify(shippingFind(id))!==before){shippingNotice={error:true,text:'Packing slip changed. Try again.'};render();return;}shippingResult(shippingRevert(id,action));
 }}]});
}
function shippingGo(id){salesLeaveDraft(()=>{shippingTab='shipments';shippingOpenId=id;shippingPreview=false;tab='shipping';render();});}
function shippingOrderStrip(o){
 if(salesIsQuote(o))return '';const q=shippingSummary(salesRecord(o.id)||o);if(!q.ps.length)return '';
 return `<div class="shipping-order-strip"><b>Shipped ${q.shipped} / ${q.ordered} · Back order ${q.back}</b>${q.ps.map(s=>`<button type="button" class="sm" onclick="shippingGo('${esc(s.id)}')">${esc(s.number)} · ${shippingStatus(s)}</button>`).join('')}${q.shipped?'<span class="mut">Cancel remaining units</span>':''}</div>`;
}
/* Строки — только с готовыми юнитами: остальное видно итогом в строке заказа.
   Back order — только когда по заказу уже что-то уехало: до первой отгрузки
   «бэкордер = весь заказ» путал (ревью Claude, 05.10.2026). */
function shippingReadyHTML(){
 const orders=shippingReadyOrders(),customers=[...new Set(orders.map(o=>o.customerId))];
 return customers.map(id=>{
  const os=orders.filter(o=>o.customerId===id),summaries=os.map(o=>({o,q:shippingSummary(o)})),units=os.flatMap(shippingUnits),free=units.filter(i=>i.ready&&!i.shipment);
  const c=salesFindCustomer(id),skids=[...new Set(units.filter(i=>i.ready&&i.skid).map(i=>i.skid))],loose=free.filter(i=>!i.skid).length;
  const skidHTML=skids.map(code=>{const all=units.filter(i=>i.ready&&i.skid===code),a=all.filter(i=>!i.shipment),counts=new Map();all.forEach(i=>counts.set(i.orderId,(counts.get(i.orderId)||0)+1));return `<div class="shipping-skid"><label><input type="checkbox" ${a.length?'':'disabled'} ${a.length&&a.every(i=>shippingSelection.has(i.label))?'checked':''} onchange="shippingSelectSkid('${esc(id)}','${code}',this.checked)"><b>${code}</b></label><span>${shippingCount(all.length,'unit')} · ${[...counts].map(([oid,n])=>esc(salesRecord(oid).businessNumber)+' ×'+n).join(', ')}${all.length>a.length?' · '+(all.length-a.length)+' on PS':''}</span><button class="sm" onclick="shippingPrintSkid('${esc(id)}','${code}')">Skid sheet</button></div>`;}).join('');
  const rows=summaries.map(({o,q})=>{
   const avail=free.filter(i=>i.orderId===o.id),back=v=>q.shipped?v:'—';
   return `<tr class="shipping-order-row"><td colspan="3"><label><input type="checkbox" ${avail.length?'':'disabled'} ${avail.length&&avail.every(i=>shippingSelection.has(i.label))?'checked':''} onchange="shippingSelectOrder('${esc(o.id)}',this.checked)"><button class="sm" onclick="optimizationOpenOrder('${esc(o.id)}')">Order ${esc(o.businessNumber)}</button></label>${o.customerPo?' · PO '+esc(o.customerPo):''}</td><td>${q.ready}</td><td>${Math.max(0,q.glass-q.physicalReady-q.lines.reduce((n,l)=>n+l.shipped,0))}</td><td>${back(q.back)}</td><td></td><td></td></tr>`
    +q.lines.map((r,n)=>({r,n})).filter(x=>x.r.ready>0).map(({r,n})=>`<tr data-ready-line="${esc(r.l.id)}"><td>${n+1}${r.l.mark?' · '+esc(r.l.mark):''}</td><td>${esc(docSize(r.l))}</td><td>${esc(salesMakeupSummary(salesMakeupById(o,r.l.makeupId)))}</td><td>${r.ready}</td><td>${Math.max(0,r.ordered-r.physicalReady-r.shipped)}</td><td>${back(r.back)}</td><td><input class="shipping-queue" aria-label="Queue for order ${esc(o.businessNumber)} line ${n+1}" type="number" min="1" max="999" value="${shippingQueueOf(r.l)||''}" onchange="shippingQueueChange('${esc(o.id)}','${esc(r.l.id)}',this.value)"></td><td><input aria-label="Select quantity for order ${esc(o.businessNumber)} line ${n+1}" type="number" min="0" max="${r.ready}" value="${free.filter(i=>i.lineId===r.l.id&&shippingSelection.has(i.label)).length}" onchange="shippingSelectQty('${esc(o.id)}','${esc(r.l.id)}',this.value)"></td></tr>`).join('')
    +shippingReadyExtras(o,q).map(e=>`<tr><td colspan="3">From stock · ${esc(salesExtraItemName(e.x))}</td><td>${e.ready}</td><td>—</td><td>${back(e.back)}</td><td></td><td>In PS form</td></tr>`).join('');
  }).join('');
  return `<section class="card shipping-customer"><div class="shipping-customer-head"><div><h3>${esc(salesCustomerDisplay(id))}</h3><span class="mut">${esc(docAddressText(shippingDefaultAddress(c)))||'Choose an address or pickup'}</span></div><button class="pri" data-create-ps="${esc(id)}" onclick="shippingOpen('${esc(id)}')">Create packing slip</button></div>${skidHTML}${loose?`<p class="mut">Without a skid · ${shippingCount(loose,'unit')}</p>`:''}<div class="sales-table-wrap"><table class="sl-table shipping-ready-table"><thead><tr><th>Line / Mark</th><th>Size</th><th>Makeup</th><th>Ready</th><th>Not ready</th><th>Back order</th><th>Queue</th><th>Select qty</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
 }).join('')||'<div class="card empty">No units ready for a packing slip.</div>';
}
function shippingListScope(){return shippingTab==='shipments'?'shippingPS':shippingTab==='awaiting'?'shippingAwaiting':shippingTab==='done'?'shippingDone':'';}
function shippingListColumns(){return [{k:'number',label:'Packing slip',type:'text'},{k:'customer',label:'Customer',type:'text'},{k:'date',label:'Date',type:'date'},{k:'method',label:'Method',type:'list'},{k:'skids',label:'Skids',type:'text',tokens:true},{k:'units',label:'Units',type:'number'},{k:'status',label:'Status',type:'list'}].map(c=>Object.assign({def:true},c));}
function shippingListInfos(){return (DB.shipment||[]).map(s=>({o:s,memo:{number:s.number,customer:salesCustomerDisplay(s.customerId),date:s.date,method:s.method==='pickup'?'Pickup':'Delivery',skids:[...new Set(s.items.map(i=>i.skid).filter(Boolean))].join(', '),units:s.items.length+s.extras.reduce((n,i)=>n+i.qty,0),status:shippingStatus(s)}}));}
function shippingListHTML(){
 const infos=shippingListInfos(),cols=shippingListColumns(),rows=salesListRows(infos);
 const th=c=>`<th><span class="sl-th">${c.label}<button class="sl-fbtn${salesListFilterActive(salesListLoadPrefs().filters[c.k])?' on':''}" aria-label="Filter ${c.label}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span></th>`;
 return `<div class="card"><div class="shipping-scan"><label>Signed packing slip<input id="shippingSigned" data-signed-ps placeholder="Scan PS-0001" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();shippingSigned(this.value)}"></label><label>Received by<input id="shippingReceiver" value="${esc(shippingReceivedBy)}" placeholder="Optional" oninput="shippingReceivedBy=this.value"></label><label>Received on<input id="shippingReceivedOn" type="date" value="${shippingReceivedOn||finToday()}" max="${finToday()}" onchange="shippingReceivedOn=this.value"></label></div>${salesListFilterChips()}<div class="sales-table-wrap"><table class="sl-table"><thead><tr>${cols.map(th).join('')}<th></th></tr></thead><tbody>${rows.map(i=>`<tr data-ps="${esc(i.o.number)}" class="${i.o.id===shippingOpenId?'shipping-selected':''}">${cols.map(c=>`<td>${c.k==='number'?`<button class="sm" onclick="shippingOpenId='${esc(i.o.id)}';shippingPreview=false;render()">${esc(i.memo[c.k])}</button>`:esc(i.memo[c.k])}${c.k==='status'&&shippingNeedsReprint(i.o)?' <span class="shipping-reprint">reprint</span>':''}</td>`).join('')}<td><button class="sm" ${i.o.status==='cancelled'?'disabled':''} onclick="shippingPrint('${esc(i.o.id)}')">Print</button></td></tr>`).join('')||'<tr><td colspan="8" class="empty">No packing slips.</td></tr>'}</tbody></table></div>${salesListMenuHTML(infos)}</div>${shippingDetailHTML()}`;
}
function shippingDetailHTML(){
 const s=shippingFind(shippingOpenId);if(!s)return '';const d=shippingDocument(s),loaded=s.status==='planned'?shippingLoadText(shippingLoadState(s)):'';
 const action=(label,fn)=>`<button type="button" onclick="${fn}">${label}</button>`;
 return `<div class="card shipping-detail"><div class="shipping-customer-head"><h3>${esc(s.number)} · ${esc(salesCustomerDisplay(s.customerId))}</h3><span class="pill">${shippingStatus(s)}</span></div><p>${esc(docAddressText(s.shipTo))||'Pickup'} · ${esc(docDate(s.date))}</p>${loaded?`<p class="shipping-loaded" data-ps-loaded>${esc(loaded)}</p>`:''}<div class="row">${s.status==='planned'?action('Edit',`shippingOpen('${esc(s.customerId)}','${esc(s.id)}')`)+action('Loaded',`shippingLoaded('${esc(s.id)}')`)+action('Cancel',`shippingUndo('${esc(s.id)}','cancel')`):s.status==='shipped'?action(s.method==='pickup'?'Picked up':'Delivered',`shippingReceive('${esc(s.id)}')`)+action('Undo dispatch',`shippingUndo('${esc(s.id)}','dispatch')`):s.status==='delivered'?action('Undo receipt',`shippingUndo('${esc(s.id)}','receipt')`):''}${s.status!=='cancelled'?action('Print',`shippingPrint('${esc(s.id)}')`):''}${action(shippingPreview?'Hide preview':'Preview','shippingPreview=!shippingPreview;render()')}</div>${d.orders.map(o=>`<div class="shipping-detail-order"><b>Order ${esc(o.number)}${o.po?' · PO '+esc(o.po):''}</b>${o.rows.map(r=>`<div>Line ${r.line} · ${esc(r.size)} · ${esc(r.makeup)} <b>× ${r.now}</b> · ${esc(r.skids)||'No skid'} <span class="mut">Before ${r.before} · Back order ${r.back}</span></div>`).join('')}${o.extras.map(x=>`<div>From stock · ${esc(x.name)} × ${x.now}</div>`).join('')}</div>`).join('')||'<p class="mut">Open trip · no items selected</p>'}${shippingPreview?'<div class="shipping-preview">'+shippingPages(d).map(docPageSVG).join('')+'</div>':''}</div>`;
}
function shippingBackordersHTML(){
 const board=prodBoard();return shippingOrders().map(o=>({o,q:shippingSummary(o)})).filter(x=>x.o.status==='shipping'&&x.q.back>0).map(({o,q})=>{
  const prod=board.find(p=>p.o.id===o.id);
  return `<div class="card shipping-customer"><h3><button onclick="optimizationOpenOrder('${esc(o.id)}')">Order ${esc(o.businessNumber)}</button> · ${esc(salesCustomerDisplay(o.customerId))}</h3><div class="sales-table-wrap"><table class="sl-table"><thead><tr><th>Line / Mark</th><th>Size</th><th>Ordered</th><th>Shipped</th><th>Remaining</th><th>In the shop</th></tr></thead><tbody>${q.lines.filter(r=>r.back>0).map(r=>{const n=o.lines.indexOf(r.l)+1,p=prod&&prod.lines.find(x=>x.no===n);const where=p?p.lites.map(l=>l.glass+': '+Object.entries(l.counts).filter(([k,n])=>n>0).map(([k,n])=>(k==='queue'?'To batch':k)+' '+n).join(', ')+(l.on.length?' · '+l.on.join(', '):'')).join(' / '):'Awaiting production';return `<tr><td>${n} · ${esc(r.l.mark)}</td><td>${esc(docSize(r.l))}</td><td>${r.ordered}</td><td>${r.shipped}</td><td><b>${r.back}</b></td><td>${esc(where)}</td></tr>`;}).join('')}${q.extras.filter(r=>r.back>0).map(r=>`<tr><td colspan="2">From stock · ${esc(salesExtraItemName(r.x))}</td><td>${r.ordered}</td><td>${r.shipped}</td><td>${r.back}</td><td>From stock</td></tr>`).join('')}</tbody></table></div></div>`;
 }).join('')||'<div class="card empty">No backorders.</div>';
}
function shippingDraftHTML(){
 const d=shippingDraft;if(!d)return '';const c=salesFindCustomer(d.customerId),os=shippingOrders().filter(o=>o.customerId===d.customerId);
 const field=(key,label)=>`<label>${label}<input value="${esc(d.shipTo[key])}" oninput="shippingDraft.shipTo.${key}=this.value"></label>`;
 const rows=os.map(o=>{
  const a=shippingAvailable(o,d.id),q=shippingSummary(o);return `<h4>Order ${esc(o.businessNumber)}${o.customerPo?' · PO '+esc(o.customerPo):''}</h4>`+(o.lines||[]).map((l,n)=>{const max=a.filter(i=>i.lineId===l.id).length,qty=d.items.filter(i=>i.orderId===o.id&&i.lineId===l.id).length;if(!max&&!qty)return '';return `<label class="shipping-pick"><span>Line ${n+1} · ${esc(docSize(l))} · ${esc(l.mark)}<small>${esc(salesMakeupSummary(salesMakeupById(o,l.makeupId)))}</small></span><input type="number" aria-label="PS quantity line ${n+1}" min="0" max="${max}" value="${qty}" onchange="shippingDraftQty('${esc(o.id)}','${esc(l.id)}',this.value)"><span>of ${max} ready</span></label>`;}).join('')+q.extras.filter(()=>o.status!=='new'&&!o.onHold).map(r=>{const current=d.extras.find(i=>i.extraId===r.x.id),original=d.id&&shippingFind(d.id).extras.find(i=>i.extraId===r.x.id),max=r.ready+(original?original.qty:0);return `<label class="shipping-pick"><span>From stock · ${esc(salesExtraItemName(r.x))}</span><input type="number" min="0" max="${max}" value="${current?current.qty:0}" onchange="shippingDraftExtra('${esc(o.id)}','${esc(r.x.id)}',this.value)"><span>of ${max}</span></label>`;}).join('');
 }).join('');
 return `<div class="sales-service-modal-back"><div class="sales-service-modal shipping-modal" role="dialog" aria-modal="true" aria-label="Packing slip"><div class="sales-service-modal-head"><h3>${d.id?'Edit '+esc(d.number):'Create packing slip'} · ${esc(salesCustomerDisplay(d.customerId))}</h3><button aria-label="Close" onclick="shippingDraft=null;render()">×</button></div><div class="shipping-form"><div class="shipping-form-fields"><label>Method<select aria-label="Method" onchange="shippingDraft.method=this.value;render()"><option value="delivery" ${d.method==='delivery'?'selected':''}>Delivery</option><option value="pickup" ${d.method==='pickup'?'selected':''}>Pickup</option></select></label><label>Date<input type="date" value="${d.date}" onchange="shippingDraft.date=this.value"></label></div>${d.method==='delivery'?`<label>Delivery address<select onchange="shippingDraftAddress(this.value)"><option value="">Job site / custom address</option>${(c.addresses||[]).filter(a=>a.type==='delivery').map(a=>`<option value="${esc(a.id)}" ${a.address1===d.shipTo.address1?'selected':''}>${esc(a.label||docAddressText(a))}</option>`).join('')}</select></label><div class="shipping-form-fields">${field('addressee','Ship to')}${field('address1','Address')}${field('address2','Address line 2')}${field('address3','Address line 3')}${field('city','City')}${field('province','Province')}${field('postalCode','Postal code')}${field('contact','Contact')}${field('phone','Phone')}</div>`:''}${rows}<label>Note<textarea oninput="shippingDraft.note=this.value">${esc(d.note)}</textarea></label>${d.error?'<p class="err" role="alert" style="display:block">'+esc(d.error)+'</p>':''}</div><div class="sales-dialog-actions"><button onclick="shippingDraft=null;render()">Back</button><button class="pri" data-save-ps onclick="shippingSave()">${d.id?'Save':'Create packing slip'}</button></div></div></div>`;
}
function shippingFocus(){if(tab!=='shipping'||shippingTab!=='shipments'||shippingDraft||salesDialog||salesListMenu)return;const a=document.activeElement;if(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&a.id!=='shippingSigned')return;const e=document.getElementById('shippingSigned');if(e)e.focus();}
function viewShipping(){
 if(shippingTab==='shipments')setTimeout(shippingFocus,0);
 return shippingWithCtx(()=>{
 const body=shippingTab==='ready'?shippingReadyHTML():shippingTab==='shipments'?shippingListHTML():shippingTab==='delivery'?deliveryHTML():shippingTab==='backorders'?shippingBackordersHTML():viewOrderQueue(true),lookup=shippingLookupHTML();
 return `<section class="shipping-workspace">${shippingTabs()}<div class="shipping-top">${lookup.field}<label>Open a trip<select aria-label="Customer for new trip" onchange="if(this.value)shippingOpen(this.value)"><option value="">Choose customer</option>${(DB.customer||[]).filter(c=>c.status!=='archived').map(c=>`<option value="${esc(c.id)}">${esc(c.displayName||c.legalName)}</option>`).join('')}</select></label></div>${shippingNotice?`<div class="shipping-notice ${shippingNotice.error?'bad':''}" role="${shippingNotice.error?'alert':'status'}">${esc(shippingNotice.text)}</div>`:''}${lookup.card}${body}${shippingDraftHTML()}</section>`;
 });
}
document.addEventListener('focusout',()=>{if(tab==='shipping')setTimeout(shippingFocus,150);});
