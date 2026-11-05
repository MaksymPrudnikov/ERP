/* Shipping office · PR 1, 5 October 2026.
   Ready by scan, one customer/address per PS, partial dispatch and receipt.
   Uses the existing Sales column filters. PR 2, 6 October 2026: customer
   queue in Ready and the Loaded button (rules: erp/shipping/loading).
   No truck UI here. */
const SHIPPING_TABS=[['awaiting','Awaiting readiness'],['ready','Ready'],['shipments','Shipments'],['backorders','Backorders'],['done','Done']];
let shippingTab='ready',shippingNotice=null,shippingDraft=null,shippingOpenId='',shippingPreview=false;
/* Начатая форма: новая версия ERP не перезагружает вкладку сама (erp/storage). */
(window.STORAGE_UNSAVED=window.STORAGE_UNSAVED||[]).push(()=>!!shippingDraft);
let shippingSelection=new Set(),shippingCustomer='',shippingReceivedBy='',shippingReceivedOn='';
function shippingSetTab(key){shippingTab=key;shippingNotice=null;skidsNotice=null;salesListMenu=null;render();}
/* Счётчики на вкладках — как были у очереди Shipping: заказы, у Shipments —
   открытые PS (planned и shipped). */
function shippingTabCount(key){
 if(key==='skids')return skidsOut().size;
 if(key==='delivery')return (DB.shipment||[]).filter(s=>s.method==='delivery'&&s.date===finToday()&&(s.status==='planned'||s.status==='shipped')).length;
 if(key==='shipments')return (DB.shipment||[]).filter(s=>s.status==='planned'||s.status==='shipped').length;
 if(key==='ready')return shippingReadyOrders().length;
 if(key==='backorders')return shippingOrders().filter(o=>o.status==='shipping'&&shippingBackCount(o)>0).length;
 return optimizationQueue(key).length;
}
/* Delivery — свой экран, не очередь заказов: в SHIPPING_TABS (вкладки
   очереди, erp/views/optimization) он не входит. */
function shippingViewTabs(){const t=SHIPPING_TABS.slice();t.splice(t.findIndex(x=>x[0]==='shipments')+1,0,['delivery','Delivery'],['skids','Skids']);return t;}
/* Вкладки — таблетками в карточке списка, под рядом кнопок, как в Optimization
   (владелец, 05.11.2026: «зачем вверху линия — всё в одну таблицу»). */
function shippingTabs(){return '<div class="sl-filter-row"><div class="sl-quick" role="tablist" aria-label="Shipping">'+shippingViewTabs().map(([key,name])=>`<button type="button" role="tab" data-shipping-tab="${key}" aria-selected="${shippingTab===key}" class="sl-quick-pill${shippingTab===key?' on':''}" onclick="shippingSetTab('${key}')">${name} <b>${shippingTabCount(key)}</b></button>`).join('')+'</div></div>';}
function shippingOrders(){return readMemo('shippingOrders',[DB.salesOrder,DB.shipment,DB.stationScan],()=>(DB.salesOrder||[]).filter(o=>!salesIsQuote(o)&&!['cancelled','closed'].includes(o.status)&&!shippingLegacy(o)&&(o.status!=='new'||shippingAvailable(o).length>0)));}
/* Ready — только то, что можно положить в PS: готовые юниты без PS и товары
   склада. Заказ, где готового нет, сюда не попадает (он в Awaiting). */
function shippingReadyExtras(o,q){return o.status!=='new'&&!o.onHold?q.extras.filter(e=>e.ready>0):[];}
function shippingHasReady(o){
 const ps=shippingForOrder(o.id),full=()=>{const q=shippingSummary(o);return q.ready>0||shippingReadyExtras(o,q).length>0;};
 if(!shippingAllUnitsTaken(o,ps))return full();
 const has=shippingReadyExtras(o,{extras:shippingExtraRows(o,ps,shippingLegacy(o))}).length>0;
 if(typeof window!=='undefined'&&window.GF_SCOPE_CHECK&&has!==full())console.error('Stale ready: '+o.id);
 return has;
}
/* Стекло отменённых юнитов, которое забирает клиент, ждёт PS и у заказа,
   где отгружать больше нечего (аудит Shipping, Д2) — такой заказ тоже в Ready. */
function shippingTakesOrders(){return (DB.salesOrder||[]).filter(o=>!salesIsQuote(o)&&unitTakes(o).length>0);}
/* Один раз на отрисовку (erp/read-scope): число на вкладке Ready и сам
   список спрашивают одно и то же. */
function shippingReadyOrders(){return readMemo('shippingReady',[DB.salesOrder,DB.shipment,DB.stationScan],()=>{const own=shippingOrders().filter(shippingHasReady);return own.concat(shippingTakesOrders().filter(o=>!own.includes(o)));}).slice();}
function shippingSelect(customerId,labels,on){if(shippingCustomer!==customerId){shippingSelection.clear();shippingCustomer=customerId;}labels.forEach(id=>on?shippingSelection.add(id):shippingSelection.delete(id));render();}
/* Галочка заказа отмечает его готовые юниты; у заказа только с товаром
   склада юнитов нет — отмечается сам заказ (ключ «stock:»). */
function shippingOrderKeys(o){const units=shippingAvailable(o).map(i=>i.label);if(units.length)return units;if(shippingReadyExtras(o,shippingSummary(o)).length)return ['stock:'+o.id];return unitTakes(o).length?['takes:'+o.id]:[];}
function shippingSelectOrder(id,on){const o=salesRecord(id);shippingSelect(o.customerId,shippingOrderKeys(o),on);}
function shippingSelectSkid(customerId,code,on){shippingSelect(customerId,shippingWithCtx(()=>shippingOrders().filter(o=>o.customerId===customerId).flatMap(shippingAvailable).filter(i=>i.skid===code).map(i=>i.label)),on);}
function shippingSelectQty(id,lineId,n){const o=salesRecord(id),units=shippingAvailable(o).filter(i=>i.lineId===lineId);if(shippingCustomer!==o.customerId){shippingSelection.clear();shippingCustomer=o.customerId;}units.forEach((i,k)=>k<Math.max(0,+n||0)?shippingSelection.add(i.label):shippingSelection.delete(i.label));render();}
/* В PS — только отмеченные заказы: их юниты и их товар склада (владелец,
   6 октября 2026: клиент хранит заказы у нас и забирает только нужные).
   Ничего не отмечено — всё готовое клиента. Остальное добавляют в форме.
   Отмеченное ушло (PS в другой вкладке, Hold, отмена, поломка) — другие заказы
   не подставляем, а говорим (аудит Shipping, 6.10.2026).
   Способ по умолчанию — из заказов в PS (Pickup / Delivery ставит продавец),
   у пустого рейса — из карточки клиента. */
function shippingOpen(customerId,id){
 shippingWithCtx(()=>{
  const s=id&&shippingFind(id),own=shippingOrders().filter(o=>o.customerId===customerId),c=salesFindCustomer(customerId),mine=shippingCustomer===customerId;
  const orders=own.concat(shippingTakesOrders().filter(o=>o.customerId===customerId&&!own.includes(o)));
  const all=orders.flatMap(shippingAvailable),selected=all.filter(i=>mine&&shippingSelection.has(i.label));
  const chosen=new Set(selected.map(i=>i.orderId).concat(orders.filter(o=>mine&&(shippingSelection.has('stock:'+o.id)||shippingSelection.has('takes:'+o.id))).map(o=>o.id)));
  const picked=s||!mine?[]:[...shippingSelection].filter(k=>!/^(stock|takes):/.test(k)),lost=picked.filter(k=>!selected.some(i=>i.label===k)).length;
  if(!s&&mine&&shippingSelection.size&&!chosen.size){shippingSelection.clear();shippingNotice={error:true,text:'The selected glass is no longer ready. Select again.'};return;}
  const items=chosen.size?selected:all,inPS=o=>!chosen.size||chosen.has(o.id);
  const planned=(chosen.size?[...chosen]:[...new Set(items.map(i=>i.orderId))]).map(oid=>salesRecord(oid).delivery);
  const method=planned.length?(planned.every(d=>d==='pickup')?'pickup':'delivery'):String(c&&c.defaultDeliveryMethod||'').toLowerCase().includes('pickup')?'pickup':'delivery';
  shippingDraft=s?shippingClone(s):{customerId,method,shipTo:shippingDefaultAddress(c),date:finToday(),items:items.map(shippingItem),extras:own.filter(o=>o.status!=='new'&&!o.onHold&&inPS(o)).flatMap(o=>shippingSummary(o).extras.filter(x=>x.ready>0).map(x=>({orderId:o.id,extraId:x.x.id,qty:x.ready}))),note:''};
  if(!s){const takes=orders.filter(o=>inPS(o)&&unitTakes(o).length).map(o=>o.id);if(takes.length)shippingDraft.takes=takes;}
  /* Отмеченное на экране — всё, что показывает окно (владелец, 02.11.2026):
     выбор уже сделан, длинный список остальных заказов не нужен. */
  if(!s&&chosen.size)shippingDraft.only=new Set(items.map(i=>i.orderId+'|'+i.lineId).concat(shippingDraft.extras.map(x=>x.orderId+'|'+x.extraId)));
  shippingDraft.error=lost?shippingCount(lost,'selected unit')+' no longer ready.':'';
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
/* Последний юнит у клиента — счёт готов: строка говорит, какой (Finance →
   Due dates → Invoice, или в заказе → Documents). */
function shippingResult(out){
 const bills=out.ok&&out.value.status==='delivered'?shippingOrderIds(out.value).map(salesRecord).filter(o=>o&&finInvoiceDate(o)).map(o=>o.businessNumber):[];
 shippingNotice={error:!out.ok,text:out.ok?out.value.number+' · '+shippingStatus(out.value)+(bills.length?' · Invoice '+bills.join(', ')+' ready':''):out.error};render();
}
function shippingStatus(s){return s.status==='delivered'?(s.method==='pickup'?'Picked up':'Delivered'):({planned:'Planned',shipped:'Shipped',cancelled:'Cancelled'})[s.status]||'';}
/* Статус PS — цветной таблеткой тех же классов, что статус заказа в Sales. */
/* Статус и «Balance due» — одним блоком: в шапке PS они не разъезжаются. */
function shippingStatusPill(s){return `<span class="shipping-pills"><span class="pill st-${({planned:'new',shipped:'shipping',delivered:'done',cancelled:'cancelled'})[s.status]||'new'}">${shippingStatus(s)}</span>${shippingBalancePill(s)}</span>`;}
/* Подсветка: в PS заказ cash-клиента с долгом — деньги взять до выдачи. */
function shippingBalancePill(s){
 const orders=shippingOrderIds(s).map(salesRecord).filter(Boolean),review=orders.some(o=>finOrderBalance(o).status==='review');
 return (review?' <span class="pill warn" data-ps-review>Review required</span>':'')+(['planned','shipped'].includes(s.status)&&orders.some(shippingBalanceDue)?' <span class="pill bad" data-ps-balance>Balance due</span>':'');
}
function shippingQueueChange(orderId,lineId,value){const out=shippingQueueSet(orderId,[lineId],value);shippingNotice=out.ok?null:{error:true,text:out.error};render();}
/* Loaded: едет то, что отсканировано на станции отгрузки; что остаётся в
   Ready — офис видит до записи. Ничего не сканировали — офис подтверждает
   весь PS сам, как раньше кнопкой Shipped. После записи — печать PS. */
/* Деньги до отгрузки у cash-клиента (владелец, 7.10.2026: «нужно сначала
   взять деньги, если у клиента не кредитование — пусть будет окно и
   подсветка; кредит и лимиты — дело бухгалтерии»). Окно на каждый заказ
   PS с долгом: Back · Ship anyway · Take payment (после оплаты — обратно
   сюда). Кредитных не спрашиваем. */
function shippingCashFirst(s,done){
 const ids=shippingOrderIds(s).filter(oid=>{const o=salesRecord(oid);return o&&shippingBalanceDue(o);});
 const run=n=>{
  if(n===ids.length){done();return;}
  const o=salesRecord(ids[n]),checks=salesTransitionChecks(Object.assign({},o,{delivery:s.method}),'done').filter(c=>c.pay!=null).map(c=>Object.assign({},c,{anyway:'Ship anyway'}));
  salesRunChecks(checks,()=>run(n+1),amount=>salesTakeRecordPayment(o.id,amount));
 };run(0);
}
/* Заказ на Hold в накладной. Его стекло уже погрузили на SHIP — только
   предупреждение («ничего не блокировать, а только уведомить», владелец
   11.10.2026). Не грузили — стекло остаётся в цеху, и окно говорит это
   прямо (владелец: «понятно сказать, не отпускать»; раньше было
   «The selected glass is no longer available»). */
function shippingHoldFirst(s,done){
 const held=shippingOrderIds(s).map(salesRecord).filter(o=>o&&o.onHold);if(!held.length){done();return;}
 const loaded=new Set(shippingWithCtx(()=>shippingLoadState(s)).loaded.map(u=>u.orderId)),stay=held.filter(o=>!loaded.has(o.id));
 const sub=salesCustomerDisplay(s.customerId)+' · '+s.number,rows=list=>list.map(o=>['Order '+o.businessNumber,o.holdReason||'On hold',true]);
 const title=list=>list.length===1?'Order '+list[0].businessNumber+' is On Hold':list.length+' orders are On Hold';
 if(stay.length){salesDialogOpen({title:title(stay),sub,rows:rows(stay),note:'Its glass stays in the shop. Release the hold, or take the order off this packing slip.',
  buttons:[{label:'Back'},{label:'Edit packing slip',kind:'pri',run:()=>shippingOpen(s.customerId,s.id)}]});return;}
 salesDialogOpen({title:title(held),sub,rows:rows(held),note:'Already loaded. The customer asked to stop — check before the truck leaves.',
  buttons:[{label:'Back'},{label:'Ship anyway',kind:'pri',run:done}]});
}
function shippingLoaded(id){
 const s=shippingFind(id);if(!s)return;
 shippingHoldFirst(s,()=>shippingCashFirst(s,()=>shippingLoadedGo(id)));
}
function shippingLoadedGo(id){
 const s=shippingFind(id);if(!s)return;
 const state=()=>{const now=shippingFind(id);return now&&shippingWithCtx(()=>shippingLoadState(now));},st=state();
 const stamp=()=>{const now=state();return JSON.stringify([shippingFind(id),now&&now.loaded.map(u=>u.label)]);},before=stamp();
 const run=(mode,reserved)=>{
  if(stamp()!==before){shippingNotice={error:true,text:'Packing slip changed. Try again.'};render();return;}
  const need={scan:(s.items||[]).reduce((n,i)=>n+i.pieces.length,0)};
  if(!reserved&&typeof cloudNumbersShort==='function'&&cloudNumbersShort(need)){cloudNumbersReserve(need).catch(e=>console.warn('Numbers were not reserved:',e.message)).then(()=>run(mode,true));return;}
  const out=shippingMarkShipped(id,mode);shippingResult(out);if(out.ok)shippingPrint(id,true);
 };
 if(!st.units.length||st.loaded.length===st.units.length){run(st.units.length?'loaded':'');return;}
 if(!st.loaded.length){salesDialogOpen({title:'Nothing scanned at '+shippingStations().ship,note:'Ship all '+shippingLoadPart(st.units)+' on '+s.number+'?',buttons:[{label:'Back'},{label:'Ship all',kind:'pri',run:()=>run('')}]});return;}
 salesDialogOpen({title:s.number+' · '+shippingLoadPart(st.loaded)+' loaded',note:shippingLoadPart(st.rest)+' not loaded — back to Ready for the next trip.',buttons:[{label:'Back'},{label:'Ship',kind:'pri',run:()=>run('loaded')}]});
}
/* «Received by» — имя одного получателя: после принятой накладной поле
   пустеет, иначе оно молча уходило в следующий PS стопки (проход 11.10.2026). */
function shippingReceive(id){const out=shippingMarkDelivered(id,shippingReceivedBy,shippingReceivedOn||finToday());if(out.ok)shippingReceivedBy='';shippingResult(out);}
function shippingSigned(raw){const out=shippingScanSigned(raw,shippingReceivedBy,shippingReceivedOn||finToday());if(out.ok){shippingOpenId=out.value.id;shippingReceivedBy='';}shippingResult(out);shippingFocus();}
function shippingUndo(id,action){
 const s=shippingFind(id);if(!s)return;const before=JSON.stringify(s),verb=action==='cancel'?'Cancel packing slip':action==='receipt'?'Undo receipt':'Undo dispatch';
 salesDialogOpen({title:verb+' '+s.number+'?',note:'The order quantities and dates will be recalculated.',buttons:[{label:'Back'},{label:verb,kind:'dl',run:()=>{
  if(JSON.stringify(shippingFind(id))!==before){shippingNotice={error:true,text:'Packing slip changed. Try again.'};render();return;}shippingResult(shippingRevert(id,action));
 }}]});
}
/* Карточка PS рисуется под списком: номер открывает её и прокручивает к
   ней (аудит 19.10.2026, F04). */
/* Просмотр PS — окно поверх списка (владелец, 02.11.2026): раньше он стоял под
   всей таблицей и бросал вниз. Закрыли — тот же лист списка. */
function shippingShow(id){shippingOpenId=id;shippingPreview=false;render();}
function shippingHide(){shippingOpenId='';shippingPreview=false;render();}
function shippingGo(id){salesLeaveDraft(()=>{shippingTab='shipments';tab='shipping';shippingShow(id);});}
/* Без раздела Shipping номер PS — просто текст (F06). */
function shippingOrderStrip(o){
 if(salesIsQuote(o))return '';const q=shippingSummary(salesRecord(o.id)||o);if(!q.ps.length)return '';
 const ps=s=>accessCan('shipping')?`<button type="button" class="sm" onclick="shippingGo('${esc(s.id)}')">${esc(s.number)} · ${shippingStatus(s)}</button>`:`<span data-order-ps>${esc(s.number)} · ${shippingStatus(s)}</span>`;
 return `<div class="shipping-order-strip"><b>Shipped ${q.shipped} / ${q.ordered} · Back order ${q.back}</b>${q.ps.map(ps).join('')}${q.shipped?'<span class="mut">Cancel remaining units</span>':''}</div>`;
}
/* Строки — только с готовыми юнитами: остальное видно итогом в строке заказа.
   Back order — только когда по заказу уже что-то уехало: до первой отгрузки
   «бэкордер = весь заказ» путал (ревью Claude, 05.10.2026). */
/* Ready — один список вида Sales (этап 6, владелец 03.11.2026): строка
   клиента с адресом и скидами, под ней заказы и строки. Create packing slip
   сверху — для клиента отмеченного (галочка клиента отмечает всё его). */
function shippingSelectCustomer(id,on){shippingSelect(id,shippingReadyOrders().filter(o=>o.customerId===id).flatMap(shippingOrderKeys),on);}
function shippingReadyHTML(){
 const orders=shippingReadyOrders(),customers=[...new Set(orders.map(o=>o.customerId))],cur=shippingSelection.size?shippingCustomer:'';
 let sumReady=0,sumLeft=0;
 const body=customers.map(id=>{
  const os=orders.filter(o=>o.customerId===id),summaries=os.map(o=>({o,q:shippingSummary(o)})),units=os.flatMap(shippingUnits),free=units.filter(i=>i.ready&&!i.shipment);
  const c=salesFindCustomer(id),skids=[...new Set(units.filter(i=>i.ready&&i.skid).map(i=>i.skid))],loose=free.filter(i=>!i.skid).length,keys=os.flatMap(shippingOrderKeys);
  const skidHTML=skids.map(code=>{const all=units.filter(i=>i.ready&&i.skid===code),a=all.filter(i=>!i.shipment),counts=new Map();all.forEach(i=>counts.set(i.orderId,(counts.get(i.orderId)||0)+1));return `<span class="shipping-skid"><label><input type="checkbox" ${a.length?'':'disabled'} ${a.length&&a.every(i=>shippingSelection.has(i.label))?'checked':''} onchange="shippingSelectSkid('${esc(id)}','${code}',this.checked)"></label><button type="button" class="gb-link" data-skid-sheet="${code}" title="Skid sheet" onclick="carrierWinOpen('${code}')">${code}</button><span class="mut small">${shippingCount(all.length,'unit')} · ${[...counts].map(([oid,n])=>esc(salesRecord(oid).businessNumber)+' ×'+n).join(', ')}${all.length>a.length?' · '+(all.length-a.length)+' on PS':''}</span></span>`;}).join('');
  const head=`<tr class="shipping-customer" data-ready-customer="${esc(id)}" oncontextmenu="event.preventDefault();shippingSelectCustomer('${esc(id)}',true)"><td class="sl-check"><input type="checkbox" aria-label="Select ${esc(salesCustomerDisplay(id))}" ${keys.length?'':'disabled'} ${keys.length&&keys.every(k=>shippingSelection.has(k))?'checked':''} onchange="shippingSelectCustomer('${esc(id)}',this.checked)"></td><td colspan="9"><div class="shipping-customer-head"><b>${esc(salesCustomerDisplay(id))}</b><span class="mut">${esc(docAddressText(shippingDefaultAddress(c)))||'Choose an address or pickup'}</span>${skidHTML}${loose?`<span class="shipping-noskid mut small" data-no-skid>Without a skid · ${shippingCount(loose,'unit')}</span>`:''}</div></td></tr>`;
  const rows=summaries.map(({o,q})=>{
   const ok=shippingOrderKeys(o),back=v=>q.shipped?v:'—',left=Math.max(0,q.glass-q.physicalReady-q.lines.reduce((n,l)=>n+l.shipped,0));sumReady+=q.ready;sumLeft+=left;
   return `<tr class="shipping-order-row"><td class="sl-check"><input type="checkbox" aria-label="Select order ${esc(o.businessNumber)}" ${ok.length?'':'disabled'} ${ok.length&&ok.every(k=>shippingSelection.has(k))?'checked':''} onchange="shippingSelectOrder('${esc(o.id)}',this.checked)"></td><td colspan="4"><button type="button" class="gb-link" onclick="optimizationOpenOrder('${esc(o.id)}')">Order ${esc(o.businessNumber)}</button>${o.customerPo?' · PO '+esc(o.customerPo):''}</td><td class="n">${q.ready}</td><td class="n">${left}</td><td class="n">${back(q.back)}</td><td></td><td></td></tr>`
    +q.lines.map((r,n)=>({r,n})).filter(x=>x.r.ready>0).map(({r,n})=>`<tr data-ready-line="${esc(r.l.id)}"><td></td><td></td><td>${n+1}${r.l.mark?' · '+esc(r.l.mark):''}</td><td>${esc(docSize(r.l))}</td><td>${esc(salesMakeupSummary(salesMakeupById(o,r.l.makeupId)))}</td><td class="n">${r.ready}</td><td class="n">${Math.max(0,r.ordered-r.physicalReady-r.shipped)}</td><td class="n">${back(r.back)}</td><td><input class="shipping-queue" aria-label="Queue for order ${esc(o.businessNumber)} line ${n+1}" type="number" min="1" max="999" value="${shippingQueueOf(r.l)||''}" onchange="shippingQueueChange('${esc(o.id)}','${esc(r.l.id)}',this.value)"></td><td><input aria-label="Select quantity for order ${esc(o.businessNumber)} line ${n+1}" type="number" min="0" max="${r.ready}" value="${free.filter(i=>i.lineId===r.l.id&&shippingSelection.has(i.label)).length}" onchange="shippingSelectQty('${esc(o.id)}','${esc(r.l.id)}',this.value)"></td></tr>`).join('')
    +shippingReadyExtras(o,q).map(e=>`<tr><td></td><td></td><td colspan="3">From stock · ${esc(salesExtraItemName(e.x))}</td><td class="n">${e.ready}</td><td class="n">—</td><td class="n">${back(e.back)}</td><td></td><td>In PS form</td></tr>`).join('')
    +unitTakes(o).map(x=>`<tr data-ready-takes><td></td><td></td><td colspan="3">Cancelled · customer takes · line ${x.line} · ${esc(docSize(x.l))}</td><td class="n">${x.pieces} glass</td><td class="n">—</td><td class="n">—</td><td></td><td>In PS form</td></tr>`).join('');
  }).join('');
  return head+rows;
 }).join('');
 const bar=`<div class="sales-toolbar"><button type="button" class="sl-quiet" data-create-ps="${esc(cur)}" ${cur?'':'disabled'} title="${cur?'':'Tick a customer, order or skid'}" onclick="shippingOpen(shippingCustomer)">Create packing slip</button>${cur?`<b class="oq-sel" title="${esc(salesCustomerDisplay(cur))}">${shippingSelection.size} selected</b>`:''}<span class="sales-toolbar-sp"></span>${shippingBarRight()}</div>`;
 const foot=customers.length?`<tfoot><tr class="sl-foot"><td></td><td colspan="4"><b>${customers.length} customer${customers.length===1?'':'s'} · ${orders.length} order${orders.length===1?'':'s'}</b></td><td class="n"><b>${sumReady}</b></td><td class="n"><b>${sumLeft}</b></td><td></td><td></td><td></td></tr></tfoot>`:'';
 return `<div class="card sales-list-card sl-foot-pin">${bar}${shippingTabs()}<div class="sales-table-wrap">${(t=>`<table class="sl-table shipping-ready-table${t.cls}"${t.attrs}>${t.col}<thead><tr><th class="sl-check"></th>${t.head}</tr></thead>`)(cwStaticTable('shippingReady',[['order','Order'],['line','Line / Mark'],['size','Size'],['makeup','Makeup'],['ready','Ready','n'],['left','Not ready','n'],['back','Back order','n'],['queue','Queue'],['qty','Select qty']],[44]))}<tbody>${body||'<tr><td colspan="10" class="empty">No units ready for a packing slip.</td></tr>'}</tbody>${foot}</table></div></div>`;
}
/* Поиск заказа и «Open a trip» — справа в шапке списка каждой вкладки Shipping. */
function shippingBarRight(){return shippingLookupHTML().field+shippingTripHTML();}
function shippingListScope(){return shippingTab==='shipments'?'shippingPS':shippingTab==='awaiting'?'shippingAwaiting':shippingTab==='done'?'shippingDone':shippingTab==='skids'?'shippingSkids':shippingTab==='backorders'?'shippingBackorders':shippingTab==='delivery'?'shippingDelivery':'';}
function shippingListColumns(){return [{k:'number',label:'Packing slip',type:'text'},{k:'customer',label:'Customer',type:'text'},{k:'date',label:'Date',type:'date',range:[['today','Today'],['thisWeek','This week'],['last30','30 days'],['','All time']]},{k:'method',label:'Method',type:'list'},{k:'skids',label:'Skids',type:'text',tokens:true},{k:'units',label:'Units',type:'number',sum:true},{k:'area',label:'ft²',type:'number',sum:true,digits:1},{k:'kg',label:'Weight kg',type:'number',sum:true,digits:1},{k:'glass',label:'Glass',type:'text',tokens:true},{k:'balance',label:'Balance',type:'number',sum:true,money:true},{k:'status',label:'Status',type:'list'}].map(c=>Object.assign({def:true},c));}
/* Площадь, вес, стекло и баланс заказов PS — колонки списка Shipments (владелец, 03.11.2026). */
function shippingListExtra(s){
 const orders=[...new Set(s.items.map(i=>i.orderId))].map(salesRecord).filter(Boolean);let area=0;
 s.items.forEach(i=>{const o=salesRecord(i.orderId),l=o&&(o.lines||[]).find(x=>x.id===i.lineId);if(l)area+=salesLineAreaFt2(l);});
 const bal=orders.map(o=>finOrderBalance(o).balance).filter(v=>v!=null);
 return {area:Math.round(area*10)/10,kg:Math.round(deliveryLoad(s).kg*10)/10,glass:[...new Set(orders.map(o=>salesListGlass(o,true)).join(' · ').split(/\s*·\s*/).filter(Boolean))].join(' · '),balance:bal.length?finMoney(bal.reduce((n,v)=>n+v,0)):null};
}
function shippingListInfos(){return (DB.shipment||[]).map(s=>({o:s,memo:Object.assign(shippingListExtra(s),{number:s.number,customer:salesCustomerDisplay(s.customerId),date:s.date,method:s.method==='pickup'?'Pickup':'Delivery',skids:(Array.isArray(s.skidsOut)?s.skidsOut:[...new Set(s.items.map(i=>i.skid).filter(Boolean))]).join(', '),units:s.items.length+s.extras.reduce((n,i)=>n+i.qty,0),status:shippingStatus(s)})}));}
/* Список PS (владелец, 02.11.2026, вариант 3): слева дни, справа листы дня; шапка и
   таблица — блоки Sales. День — фильтр колонки Date, поэтому та же кнопка Date, чипы
   и меню колонки. Быстрый вид вне All смотрит поверх дней, как в Sales. */
const SHIPPING_LIST_STATUSES=['Planned','Shipped','Delivered','Picked up','Cancelled'],SHIPPING_DAYS_SHOWN=12;
let shippingStatusKey='';
function shippingDayFilter(day){return salesListCleanFilter('date',{conds:[{op:'between',v:day,v2:day}]});}
function shippingCurrentDay(){const d=salesListDateParts(salesListLoadPrefs().filters.date);return d.simple&&d.from&&d.from===d.to?d.from:'';}
function shippingSetDay(day){
 const p=salesListLoadPrefs();
 if(day)p.filters.date=shippingDayFilter(day);else delete p.filters.date;
 p.quick='all';salesListMenu=null;salesListSavePrefs();render();
}
/* Первый вход: сегодня, нет — ближайший прошлый день с PS, нет прошлых — самый ранний. */
function shippingDayDefault(infos){
 const days=[...new Set(infos.map(i=>i.o.date).filter(Boolean))].sort(),today=finToday(),past=days.filter(d=>d<=today);
 return past.length?past[past.length-1]:days[0]||'';
}
function shippingAttention(s){return ['planned','shipped'].includes(s.status)&&s.date<finToday()||shippingNeedsReprint(s);}
function shippingQuickTest(key,info){
 if(key==='all')return true;
 const s=info.o;
 if(key==='today')return s.date===finToday();
 if(key==='week'){const w=salesListPresetRange('thisWeek');return s.date>=w[0]&&s.date<=w[1];}
 return shippingAttention(s);
}
function shippingQuickName(label){return label==='Due this week'?'This week':label;}
/* Один All, как в Sales: снимает быстрый вид и статус, снимать нечего — прячет ряд статусов. */
function shippingQuickPick(key){
 const p=salesListLoadPrefs();
 if(key==='all'){
  if(p.quick==='all'&&!shippingStatusKey)p.statusHidden=!p.statusHidden;
  shippingStatusKey='';p.quick='all';
 }else p.quick=SALES_QUICK.some(q=>q[0]===key)?key:'all';
 salesListSavePrefs();render();
}
function shippingStatusPick(key){shippingStatusKey=shippingStatusKey===key?'':key;render();}
function shippingStatusPills(rows){
 if(salesListLoadPrefs().statusHidden)return '';
 const n={};rows.forEach(r=>{n[r.memo.status]=(n[r.memo.status]||0)+1;});
 return `<span class="sl-filter-sep" aria-hidden="true"></span>${SHIPPING_LIST_STATUSES.map(k=>`<button type="button" class="sl-quick-pill sl-status-pill${k===shippingStatusKey?' on':''}" aria-pressed="${k===shippingStatusKey}" data-status-chip="${esc(k)}" onclick="shippingStatusPick(${esc(JSON.stringify(k))})">${k}<b>${(n[k]||0).toLocaleString('en-US')}</b></button>`).join('')}`;
}
function shippingDaysHTML(anyDay,quick){
 const counts=new Map();anyDay.forEach(i=>counts.set(i.o.date,(counts.get(i.o.date)||0)+1));
 const cur=quick==='all'?shippingCurrentDay():'',all=[...counts.keys()].sort().reverse();
 let at=all.findIndex(d=>d<=finToday());if(at<0)at=all.length;
 const days=all.slice(Math.max(0,at-3)).slice(0,SHIPPING_DAYS_SHOWN);
 if(cur&&!days.includes(cur))days.push(cur),days.sort().reverse();
 const none=quick==='all'&&!salesListFilterActive(salesListLoadPrefs().filters.date);
 return `<aside class="ship-days" aria-label="Days"><h5>Days</h5>${days.map(d=>`<button type="button" class="ship-day${d===cur?' on':''}" data-day="${d}" onclick="shippingSetDay('${d}')"><span>${esc(salesListShortDay(d))}</span><b>${counts.get(d)||0}</b></button>`).join('')||'<p class="mut">No packing slips.</p>'}<h5>Other</h5><button type="button" class="ship-day" data-day-pick onclick="salesListOpenDate(event,'date')"><span>Pick a date…</span></button><button type="button" class="ship-day${none?' on':''}" data-day-all onclick="shippingSetDay('')"><span>All time</span><b>${anyDay.length}</b></button></aside>`;
}
function shippingTripHTML(){return `<select aria-label="Customer for new trip" onchange="if(this.value)shippingOpen(this.value)"><option value="">Open a trip · customer</option>${(DB.customer||[]).filter(c=>c.status!=='archived').map(c=>`<option value="${esc(c.id)}">${esc(c.displayName||c.legalName)}</option>`).join('')}</select>`;}
function shippingTopHTML(lookupField){
 return `<div class="ship-top shipping-scan"><label>Signed packing slip<input id="shippingSigned" data-signed-ps placeholder="PS number" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();shippingSigned(this.value)}"></label><input id="shippingReceiver" aria-label="Received by" value="${esc(shippingReceivedBy)}" placeholder="Received by" oninput="shippingReceivedBy=this.value"><input id="shippingReceivedOn" type="date" aria-label="Received on" title="Received on" value="${shippingReceivedOn||finToday()}" max="${finToday()}" onchange="shippingReceivedOn=this.value"><span class="sales-toolbar-sp"></span>${lookupField}${shippingTripHTML()}</div>`;
}
function shippingListFooter(rows,cols){
 const n={};rows.forEach(r=>{n[r.memo.status]=(n[r.memo.status]||0)+1;});
 const detail=SHIPPING_LIST_STATUSES.filter(k=>n[k]).map(k=>k+' '+n[k]).join(' · '),first=cols.findIndex(c=>salesListCalc(c)!=='none'),lead=first<0?cols.length:first;
 return `<tfoot><tr class="sl-foot"><td colspan="${lead+1}" class="sl-foot-head" data-foot-count><b>${rows.length.toLocaleString('en-US')} packing slip${rows.length===1?'':'s'}</b>${detail?`<small>${esc(detail)}</small>`:''}</td>${cols.slice(lead).map(c=>salesListCalcCell(c,rows)).join('')}<td></td></tr></tfoot>`;
}
function shippingListHTML(lookupField){
 const infos=shippingListInfos(),p=salesListLoadPrefs();
 if(!p.dayInit&&infos.length){p.dayInit=true;const d=!p.filters.date&&shippingDayDefault(infos);if(d)p.filters.date=shippingDayFilter(d);salesListSavePrefs();}
/* PS открыли из заказа, по скану или после сохранения: его день должен быть виден в списке. */
 const open=shippingOpenId&&infos.find(i=>i.o.id===shippingOpenId);
 if(open&&p.filters.date&&!salesListFilterTest(salesListColumn('date'),p.filters.date,open)){p.filters.date=shippingDayFilter(open.o.date);p.quick='all';salesListSavePrefs();}
 const cols=salesListColumns(),quick=p.quick||'all',box=document.querySelector('#app .sl-wide');salesListScrollKeep=box?{x:box.scrollLeft,y:box.scrollTop}:null;
 const filtered=salesListRows(infos),anyDay=salesListRows(infos,['date']),shown=quick==='all'?filtered:anyDay.filter(i=>shippingQuickTest(quick,i)),rows=shippingStatusKey?shown.filter(i=>i.memo.status===shippingStatusKey):shown;
 const th=c=>{const f=p.filters[c.k],on=!!f&&salesListFilterActive(f);return `<th class="${c.type==='number'?'n':''}" data-col="${c.k}" data-cw-key="${c.k}"><span class="sl-th"><span data-cw-label>${c.label}</span><button type="button" class="sl-fbtn${on?' on':''}" data-filter-col="${c.k}" aria-label="Filter and sort ${c.label}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span>${cwGrip()}</th>`;};
 const cell=(i,c)=>c.k==='number'?`<button class="sm" onclick="shippingShow('${esc(i.o.id)}')">${esc(i.memo.number)}</button>`:c.k==='customer'?`<b>${esc(i.memo.customer)}</b>`:c.k==='date'?esc(salesListShortDay(i.memo.date)):c.k==='status'?shippingStatusPill(i.o)+(i.o.status==='planned'?(t=>t?` <span class="mut small" data-ps-list-loaded>${esc(t)}</span>`:'')(shippingWithCtx(()=>shippingLoadText(shippingLoadState(i.o)))):'')+(shippingNeedsReprint(i.o)?' <span class="pill st-batched">Reprint</span>':''):c.k==='balance'?(i.memo.balance==null?'<span class="mut">—</span>':`<span class="${i.memo.balance>0?'pill bad':''}">${finFmt(i.memo.balance)}</span>`):c.k==='area'||c.k==='kg'?esc(chNum(i.memo[c.k],1)):esc(i.memo[c.k])||'<span class="mut">—</span>';
 const body=listWindowBody(rows,i=>`<tr data-ps="${esc(i.o.number)}" class="${i.o.id===shippingOpenId?'shipping-selected':''}"><td class="sl-check"></td>${cols.map(c=>`<td${c.type==='number'?' class="n"':''}>${cell(i,c)}</td>`).join('')}<td class="sales-row-actions"><button class="sm" ${i.o.status==='cancelled'&&!i.o.unbatchedItems?.length?'disabled':''} onclick="shippingPrint('${esc(i.o.id)}')">Print</button></td></tr>`,cols.length+2,{table:'.shipping-ps-table'});
 const keys=cols.map(c=>c.k);
 const table=`<div class="sales-table-wrap"><table class="sl-table shipping-ps-table${cwTableClass('shipments')}"${cwTableAttrs('shipments',keys)}>${cwColgroup('shipments',keys)}<thead><tr><th class="sl-check"><span class="sl-header-tools"><button type="button" class="sl-settings" data-columns-button title="Columns" aria-label="Columns" onclick="salesListOpenColumns(event)">${ico('settings')}</button></span></th>${cols.map(th).join('')}<th></th></tr></thead><tbody>${body||`<tr><td colspan="${cols.length+2}" class="empty">${infos.length?'No packing slips match.':'No packing slips.'}</td></tr>`}</tbody>${rows.length?shippingListFooter(rows,cols):''}</table></div>`;
 return `<div class="card sales-list-card shipping-list-card sl-foot-pin">${shippingTopHTML(lookupField)}${shippingTabs()}<div class="ship-split">${shippingDaysHTML(anyDay,quick)}<div class="ship-split-main"><div class="sl-filter-row">${salesQuickHTML(anyDay,anyDay,{cur:shippingStatusKey?'-':quick,set:'shippingQuickPick',test:shippingQuickTest,name:shippingQuickName})}${shippingStatusPills(shown)}<span class="sales-toolbar-sp"></span>${salesListDateButton('date')}</div>${salesListFilterChips()}${table}</div></div>${salesListMenuHTML(infos)}</div>${shippingDetailHTML()}`;
}
function shippingDetailHTML(){
 const s=shippingFind(shippingOpenId);if(!s)return '';const d=shippingDocument(s),loaded=s.status==='planned'?shippingLoadText(shippingLoadState(s)):'';
 const action=(label,fn,kind)=>`<button type="button"${kind?` class="${kind}"`:''} onclick="${fn}">${label}</button>`,id=esc(s.id);
 /* Главное действие статуса — справа и выделено, как + New Sales Order. */
 /* «Ship» — машина уехала (проход 11.10.2026: кнопка звалась «Loaded»,
    а ставила Shipped; погрузку пишет станция SHIP). */
 const main=s.status==='planned'?action('Ship',`shippingLoaded('${id}')`,'pri'):s.status==='shipped'?action(s.method==='pickup'?'Picked up':'Delivered',`shippingReceive('${id}')`,'pri'):'';
 const rest=(s.status==='planned'?action('Edit',`shippingOpen('${esc(s.customerId)}','${id}')`)+action('Cancel',`shippingUndo('${id}','cancel')`):s.status==='shipped'?action('Undo dispatch',`shippingUndo('${id}','dispatch')`):s.status==='delivered'?action('Undo receipt',`shippingUndo('${id}','receipt')`):'')+(s.status!=='cancelled'||s.unbatchedItems?.length?action('Print',`shippingPrint('${id}')`):'')+action(shippingPreview?'Hide preview':'Preview','shippingPreview=!shippingPreview;render()');
 const rows=d.orders.map(o=>`<tr class="shipping-order-row"><td colspan="7"><b>Order ${esc(o.number)}</b>${o.po?' · PO '+esc(o.po):''}</td></tr>`+o.rows.map(r=>`<tr><td>${r.line}${r.mark?' · '+esc(r.mark):''}</td><td>${esc(r.size)}</td><td>${esc(r.makeup)}</td><td>${esc(r.skids)||'<span class="mut">—</span>'}</td><td class="n"><b>${r.now}</b></td><td class="n">${r.before}</td><td class="n">${r.back}</td></tr>`+(r.note?`<tr class="shipping-cancel-note" data-ps-cancel-note><td colspan="7">${esc(r.note)}</td></tr>`:'')).join('')+(o.takes||[]).map(x=>`<tr data-ps-takes><td colspan="4">Cancelled · customer takes · line ${x.line} · ${esc(x.size)}</td><td class="n"><b>${x.pieces}</b> glass</td><td></td><td></td></tr>`).join('')+o.extras.map(x=>`<tr><td colspan="3">From stock · ${esc(x.name)}</td><td><span class="mut">—</span></td><td class="n"><b>${x.now}</b></td><td class="n">${x.before}</td><td class="n">${x.back}</td></tr>`).join('')).join('');
 return `<div class="sales-service-modal-back shipping-detail-back"><div class="sales-service-modal shipping-detail-window" role="dialog" aria-modal="true" aria-label="Packing slip ${esc(s.number)}"><button type="button" class="shipping-detail-close" aria-label="Close" onclick="shippingHide()">×</button><div class="card shipping-detail"><div class="shipping-customer-head"><div><h3>${esc(s.number)} · ${esc(salesCustomerDisplay(s.customerId))}</h3><span class="mut">${esc(docAddressText(s.shipTo))||'Pickup'} · ${esc(salesListShortDay(s.date))}</span></div>${shippingStatusPill(s)}</div>${(d.corrections||[]).map(text=>`<p class="shipping-loaded" data-ps-unbatch>${esc(text)}</p>`).join('')}${loaded?`<p class="shipping-loaded" data-ps-loaded>${esc(loaded)}</p>`:''}${s.status==='delivered'?`<p class="shipping-loaded" data-ps-received>${esc('Received '+salesListShortDay(salesListIsoDay(s.deliveredAt))+(s.receivedBy?' · '+s.receivedBy:''))}</p>`:''}<div class="sales-toolbar">${rest}<span class="sales-toolbar-sp"></span>${main}</div>${rows?`<div class="sales-table-wrap"><table class="sl-table"><thead><tr><th>Line / Mark</th><th>Size</th><th>Makeup</th><th>Skids</th><th class="n">Qty</th><th class="n">Before</th><th class="n">Back order</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="mut">Open trip · no items selected</p>'}${shippingPreview?'<div class="shipping-preview">'+shippingPages(d).map(docPageSVG).join('')+'</div>':''}</div></div></div>`;
}
/* Backorders — список вида Sales: строка — остаток строки заказа; заказ и
   клиент в своих колонках, повтор ниже бледный; Columns, фильтры, итог. */
function shippingBackorderColumns(){return [{k:'order',label:'Order',type:'text'},{k:'customer',label:'Customer',type:'text'},{k:'po',label:'PO',type:'text',def:false},{k:'due',label:'Due',type:'date',def:false},{k:'line',label:'Line / Mark',type:'text'},{k:'size',label:'Size',type:'text'},{k:'items',label:'Order Items',type:'text'},{k:'ordered',label:'Ordered',type:'number',sum:true},{k:'shipped',label:'Shipped',type:'number',sum:true},{k:'left',label:'Remaining',type:'number',sum:true},{k:'where',label:'In the shop',type:'text'}].map(c=>Object.assign({def:true},c));}
/* Order Items остатка строки — стекло и штуки, как колонка Order Items в Sales. */
function shippingBackorderItems(o,l,n){
 const sum=new Map();glassBatchComponents(o,l).forEach(c=>{const g=glassProductById(c.glassId),k=g?glassShortName(g):'Unknown glass';sum.set(k,(sum.get(k)||0)+n);});
 return [...sum].map(([k,v])=>k+': '+v).join(' | ');
}
function shippingBackorderInfos(){
 const board=prodBoard(),out=[];
 shippingOrders().map(o=>({o,q:shippingSummary(o)})).filter(x=>x.o.status==='shipping'&&x.q.back>0).forEach(({o,q})=>{
  const prod=board.find(p=>p.o.id===o.id),base={order:o.businessNumber,customer:salesCustomerDisplay(o.customerId),po:o.customerPo||'',due:o.dueDate||''};
  q.lines.filter(r=>r.back>0).forEach(r=>{const n=o.lines.indexOf(r.l)+1,p=prod&&prod.lines.find(x=>x.no===n);const where=p?p.lites.map(l=>l.glass+': '+Object.entries(l.counts).filter(([k,n])=>n>0).map(([k,n])=>(k==='queue'?'To batch':k)+' '+n).join(', ')+(l.on.length?' · '+l.on.join(', '):'')).join(' / '):'Awaiting production';out.push({o:{id:o.id+'|'+r.l.id},order:o,memo:Object.assign({line:n+(r.l.mark?' · '+r.l.mark:''),size:docSize(r.l),items:shippingBackorderItems(o,r.l,r.back),ordered:r.ordered,shipped:r.shipped,left:r.back,where},base)});});
  q.extras.filter(r=>r.back>0).forEach(r=>out.push({o:{id:o.id+'|'+r.x.id},order:o,memo:Object.assign({line:'From stock · '+salesExtraItemName(r.x),size:'',items:salesExtraItemName(r.x)+': '+r.back,ordered:r.ordered,shipped:r.shipped,left:r.back,where:'From stock'},base)}));
 });
 return out;
}
function shippingBackordersHTML(){
 const infos=shippingBackorderInfos(),rows=salesListRows(infos);
 const cell=(i,c,prev)=>{const v=i.memo[c.k],same=prev&&prev.order.id===i.order.id;switch(c.k){
  case 'order':return `<td${same?' class="sl-rep"':''}>${same?'Order '+esc(v):`<button type="button" class="gb-link" onclick="optimizationOpenOrder('${esc(i.order.id)}')">Order ${esc(v)}</button>`}</td>`;
  case 'customer':return `<td${same?' class="sl-rep"':''}>${same?esc(v):'<b>'+esc(v)+'</b>'}</td>`;
  case 'due':return `<td>${v?esc(salesListShortDay(v)):'<span class="mut">—</span>'}</td>`;
  case 'left':return `<td class="n"><b>${v}</b></td>`;
  case 'items':return `<td><span class="sl-glass" title="${esc(v)}">${v?esc(v):'—'}</span></td>`;
  default:return `<td${c.type==='number'?' class="n"':''}>${v===''||v==null?'<span class="mut">—</span>':esc(String(v))}</td>`;}};
 return `<div class="card sales-list-card sl-foot-pin"><div class="sales-toolbar"><span class="sales-toolbar-sp"></span>${shippingBarRight()}</div>${shippingTabs()}${salesListTableHTML({infos,rows,cell,row:(i,k)=>({attrs:k&&rows[k-1].order.id===i.order.id?'':' class="shipping-customer"'}),noun:r=>{const n=new Set(r.map(i=>i.order.id)).size;return n+' order'+(n===1?'':'s');},empty:infos.length?'No backorders match.':'No backorders.'})}</div>`;
}
function shippingDraftHTML(){
 const d=shippingDraft;if(!d)return '';const c=salesFindCustomer(d.customerId),os=shippingOrders().filter(o=>o.customerId===d.customerId);
 const field=(key,label)=>`<label>${label}<input value="${esc(d.shipTo[key])}" oninput="shippingDraft.shipTo.${key}=this.value"></label>`;
 const rows=os.map(o=>{
  const a=shippingAvailable(o,d.id),q=shippingSummary(o),shown=k=>!d.only||d.only.has(o.id+'|'+k);const body=(o.lines||[]).map((l,n)=>{const max=a.filter(i=>i.lineId===l.id).length,qty=d.items.filter(i=>i.orderId===o.id&&i.lineId===l.id).length;if(!max&&!qty||!shown(l.id))return '';return `<label class="shipping-pick"><span>Line ${n+1} · ${esc(docSize(l))} · ${esc(l.mark)}<small>${esc(salesMakeupSummary(salesMakeupById(o,l.makeupId)))}</small></span><input type="number" aria-label="PS quantity line ${n+1}" min="0" max="${max}" step="1" inputmode="numeric" value="${qty}" onchange="shippingDraftQty('${esc(o.id)}','${esc(l.id)}',this.value)"><span>of ${max} ready</span></label>`;}).join('')+q.extras.filter(r=>o.status!=='new'&&!o.onHold&&shown(r.x.id)).map(r=>{const current=d.extras.find(i=>i.extraId===r.x.id),original=d.id&&shippingFind(d.id).extras.find(i=>i.extraId===r.x.id),max=r.ready+(original?original.qty:0);return `<label class="shipping-pick"><span>From stock · ${esc(salesExtraItemName(r.x))}</span><input type="number" min="0" max="${max}" step="1" inputmode="numeric" value="${current?current.qty:0}" onchange="shippingDraftExtra('${esc(o.id)}','${esc(r.x.id)}',this.value)"><span>of ${max}</span></label>`;}).join('');
  return body?`<h4>Order ${esc(o.businessNumber)}${o.customerPo?' · PO '+esc(o.customerPo):''}</h4>`+body:'';
 }).join('');
 return `<div class="sales-service-modal-back"><div class="sales-service-modal shipping-modal" role="dialog" aria-modal="true" aria-label="Packing slip"><div class="sales-service-modal-head"><h3>${d.id?'Edit '+esc(d.number):'Create packing slip'} · ${esc(salesCustomerDisplay(d.customerId))}</h3><button aria-label="Close" onclick="shippingDraft=null;render()">×</button></div><div class="shipping-form"><div class="shipping-form-fields"><label>Method<select aria-label="Method" onchange="shippingDraft.method=this.value;render()"><option value="delivery" ${d.method==='delivery'?'selected':''}>Delivery</option><option value="pickup" ${d.method==='pickup'?'selected':''}>Pickup</option></select></label><label>Date<input type="date" value="${d.date}" onchange="shippingDraft.date=this.value"></label></div>${d.method==='delivery'?`<label>Delivery address<select onchange="shippingDraftAddress(this.value)"><option value="">Job site / custom address</option>${(c.addresses||[]).filter(a=>a.type==='delivery').map(a=>`<option value="${esc(a.id)}" ${a.address1===d.shipTo.address1?'selected':''}>${esc(a.label||docAddressText(a))}</option>`).join('')}</select></label><div class="shipping-form-fields">${field('addressee','Ship to')}${field('address1','Address')}${field('address2','Address line 2')}${field('address3','Address line 3')}${field('city','City')}${field('province','Province')}${field('postalCode','Postal code')}${field('contact','Contact')}${field('phone','Phone')}</div>`:''}${rows}${(d.takes||[]).map(salesRecord).filter(Boolean).map(o=>unitTakes(o).map(x=>`<div class="shipping-pick" data-draft-takes><span>Order ${esc(o.businessNumber)} · cancelled · customer takes · line ${x.line} · ${esc(docSize(x.l))}</span><span>${x.pieces} glass</span></div>`).join('')).join('')}<label>Note<textarea oninput="shippingDraft.note=this.value">${esc(d.note)}</textarea></label>${d.error?'<p class="err" role="alert" style="display:block">'+esc(d.error)+'</p>':''}</div><div class="sales-dialog-actions"><button onclick="shippingDraft=null;render()">Back</button><button class="pri" data-save-ps onclick="shippingSave()">${d.id?'Save':'Create packing slip'}</button></div></div></div>`;
}
function shippingFocus(){if(tab!=='shipping'||shippingTab!=='shipments'||shippingDraft||salesDialog||salesListMenu)return;const a=document.activeElement;if(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&a.id!=='shippingSigned')return;const e=document.getElementById('shippingSigned');if(e)e.focus({preventScroll:true});}
function viewShipping(){
 if(shippingTab==='shipments')setTimeout(shippingFocus,0);
 return shippingWithCtx(()=>{
 const lookup=shippingLookupHTML(),list=shippingTab==='shipments';
 const body=list?shippingListHTML(lookup.field):shippingTab==='ready'?shippingReadyHTML():shippingTab==='delivery'?deliveryHTML():shippingTab==='skids'?skidsHTML():shippingTab==='backorders'?shippingBackordersHTML():viewOrderQueue(true);
 return `<section class="shipping-workspace">${shippingNotice?`<div class="shipping-notice ${shippingNotice.error?'bad':''}" role="${shippingNotice.error?'alert':'status'}">${esc(shippingNotice.text)}</div>`:''}${lookup.card}${body}${shippingDraftHTML()}</section>`;
 });
}
document.addEventListener('focusout',()=>{if(tab==='shipping')setTimeout(shippingFocus,150);});
