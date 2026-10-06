/* Shipping · заказ по номеру у стойки (6 октября 2026).
   Владелец: клиент приходит — «заказ 8000, я забрать»; пара стёкол, сразу
   везёт ставить. Номер набирают руками, штрихкода у клиента нет. PS — на
   один этот заказ: «можем выдать отдельную бумажку на каждый заказ, парни
   на шипинге найдут 2–3–4 заказа быстро».
   Карточка: сколько готово, на какой таре лежит, что ещё в цеху, долг.
   Кнопка создаёт PS самовывоза на всё готовое по заказу и печатает его;
   долг проверяется один раз — до записи (Take payment / Print anyway).
   Владелец, 6 октября 2026: клиент хранит заказы у нас и называет номер
   заказа или свой PO. Ищут раздельно, переключателем Order | PO: номер
   заказа бывает таким же, как чужой PO, в одном поле один спрятал бы
   другой. Номер — точно. PO — по части текста: у PO бывают приставки
   («OAI 77224»), на один PO — несколько заказов, тогда список на выбор. */
const SHIPPING_LOOKUP_MAX=12;
let shippingLookupId='',shippingLookupText='',shippingLookupMiss='',shippingLookupIds=[],shippingLookupBy='order';
function shippingLookupOpen(o){return !['done','closed','cancelled'].includes(o.status)&&!shippingLegacy(o);}
function shippingLookupFind(text){
 const t=text.toLowerCase(),orders=(DB.salesOrder||[]).filter(o=>!salesIsQuote(o));
 return shippingLookupBy==='po'?orders.filter(o=>String(o.customerPo||'').toLowerCase().includes(t)).sort((a,b)=>shippingLookupOpen(b)-shippingLookupOpen(a)):orders.filter(o=>String(o.businessNumber||'').trim().toLowerCase()===t);
}
/* Переключили — тот же текст ищется заново, набирать второй раз не надо. */
function shippingLookupSetBy(v){const e=document.querySelector('[data-order-lookup]');shippingLookupBy=v==='po'?'po':'order';shippingLookupGo(e?e.value:shippingLookupText);}
function shippingLookupReset(){shippingLookupId='';shippingLookupText='';shippingLookupMiss='';shippingLookupIds=[];}
function shippingLookupGo(raw){
 const text=String(raw||'').trim(),found=text?shippingLookupFind(text):[];shippingLookupReset();
 shippingLookupText=text;shippingLookupIds=found.map(o=>o.id);if(found.length===1)shippingLookupId=found[0].id;if(text&&!found.length)shippingLookupMiss=text;
 render();
}
/* Карточка, открытая из списка, закрывается обратно в список. */
function shippingLookupClose(){if(shippingLookupId&&shippingLookupIds.length>1)shippingLookupId='';else shippingLookupReset();render();}
function shippingLookupPill(o,q){
 const left=Math.max(0,q.glass-q.lines.reduce((n,r)=>n+r.shipped,0));
 return shippingLookupOpen(o)&&left?`<span class="pill ${q.physicalReady===left?'ok':''}" data-lookup-ready>${q.physicalReady} / ${left} ready</span>`:`<span class="pill" data-lookup-ready>${esc(salesStatusLabel(o))}</span>`;
}
function shippingLookupModel(o){
 const q=shippingSummary(o),free=shippingUnits(o).filter(u=>u.ready&&!u.shipment),ctx=shippingCtx(),ship=shippingStations().ship;
 const where=new Map(),shop=new Map(),gone=unitCancelledSet(o);free.forEach(u=>where.set(u.on||'',(where.get(u.on||'')||0)+1));
 /* Что ещё в цеху: стёкла заказа по станциям, где они ждут. Отменённое —
    история, не остаток (аудит Shipping, F8). */
 ctx.index.forEach((h,piece)=>{
  if(h.orderId!==o.id||gone.has(piece))return;const g=stationGlass(piece,ctx.index,ctx.batches),scans=ctx.scans.get(piece)||[];if(!g)return;
  const p=stationPlace(g,scans);if(p.broken||p.shipped||!p.waiting||p.waiting===ship)return;
  const k=g.o.onHold||g.l.onHold||unitPieceHold(g)?'On hold':!g.entry&&!scans.length?'To batch':p.waiting;shop.set(k,(shop.get(k)||0)+1);
 });
 const seq=code=>{const s=(DB.station||[]).find(x=>x.code===code);return s?s.seq:-1;};
 return {q,free,where:[...where].sort((a,b)=>String(a[0]||'~').localeCompare(String(b[0]||'~'),undefined,{numeric:true})),shop:[...shop].sort((a,b)=>seq(a[0])-seq(b[0])),
  extras:o.status!=='new'&&!o.onHold?q.extras.filter(e=>e.ready>0):[],takes:unitTakes(o),ps:q.ps.filter(shippingActive),due:shippingBalanceDue(o)?finOrderBalance(o).balance:0};
}
function shippingLookupPickup(id){
 const o=salesRecord(id);if(!o)return;
 shippingWithChecks([id],'pickup',true,()=>{
  const m=shippingWithCtx(()=>shippingLookupModel(salesRecord(id)));
  const out=shippingCreate(Object.assign({customerId:o.customerId,method:'pickup',shipTo:shippingDefaultAddress(salesFindCustomer(o.customerId)),date:finToday(),items:m.free.map(shippingItem),extras:m.extras.map(e=>({orderId:id,extraId:e.x.id,qty:e.ready})),note:''},m.takes.length?{takes:[id]}:{}));
  if(!out.ok){shippingNotice={error:true,text:out.error};render();return;}
  shippingLookupReset();shippingSelection.clear();shippingOpenId=out.value.id;shippingPreview=false;shippingTab='shipments';shippingNotice={text:out.value.number+' saved'};render();
  shippingPrint(out.value.id,true);
 });
}
function shippingLookupHTML(){
 const po=shippingLookupBy==='po';
 const field=`<div class="shipping-lookup-field"><select aria-label="Search by" data-lookup-by onchange="shippingLookupSetBy(this.value)"><option value="order" ${po?'':'selected'}>Order</option><option value="po" ${po?'selected':''}>PO</option></select><input data-order-lookup aria-label="${po?'Customer PO':'Order number'}" value="${esc(shippingLookupText)}" placeholder="${po?'Part of the PO':'Order number'}" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();shippingLookupGo(this.value)}"></div>`;
 const o=shippingLookupId&&salesRecord(shippingLookupId);
 if(!o){
  const list=shippingLookupIds.map(salesRecord).filter(Boolean),more=list.length-SHIPPING_LOOKUP_MAX;
  if(list.length<2)return {field,card:shippingLookupMiss?`<div class="shipping-notice bad" role="alert" data-lookup-miss>${po?'No order with PO':'Order'} ${esc(shippingLookupMiss)}${po?'':' not found'}</div>`:''};
  return {field,card:`<section class="card shipping-customer shipping-lookup" data-lookup-list><div class="shipping-customer-head"><h3>PO ${esc(shippingLookupText)} · ${list.length} orders</h3><button type="button" aria-label="Close" onclick="shippingLookupClose()">×</button></div><div class="sales-table-wrap"><table class="sl-table"><thead><tr><th>Order</th><th>Customer</th><th>PO</th><th>Status</th></tr></thead><tbody>${list.slice(0,SHIPPING_LOOKUP_MAX).map(x=>`<tr><td><button type="button" class="sm" data-lookup-open onclick="shippingLookupId='${esc(x.id)}';render()">${esc(x.businessNumber)}</button></td><td><b>${esc(salesCustomerDisplay(x.customerId))}</b></td><td>${esc(x.customerPo)}</td><td>${shippingLookupPill(x,shippingSummary(x))}</td></tr>`).join('')}</tbody></table></div>${more>0?`<p class="mut">${more} more · type more of the PO</p>`:''}</section>`};
 }
 const m=shippingLookupModel(o),count=n=>shippingCount(n,'unit'),open=shippingLookupOpen(o),pill=shippingLookupPill(o,m.q);
 const where=m.where.map(([code,n])=>`<div class="shipping-skid shipping-lookup-where"><b>${esc(code||'No skid')}</b><span>${count(n)}</span></div>`).join('');
 const can=open&&(m.free.length>0||m.extras.length>0)||m.takes.length>0;
 return {field,card:`<section class="card shipping-customer shipping-lookup" data-lookup-card><div class="shipping-customer-head"><div><h3>Order ${esc(o.businessNumber)} · ${esc(salesCustomerDisplay(o.customerId))}</h3><span class="mut">${o.delivery==='delivery'?'Delivery':'Pickup'}${o.customerPo?' · PO '+esc(o.customerPo):''}</span></div>${pill}</div>`
  +(o.onHold?`<p class="shipping-lookup-bad">On hold${o.holdReason?' · '+esc(o.holdReason):''}</p>`:'')
  +where
  +(m.extras.length?`<p class="mut">From stock · ${m.extras.map(e=>esc(salesExtraItemName(e.x))+' ×'+e.ready).join(', ')}</p>`:'')
  +(m.takes.length?`<p class="mut" data-lookup-takes>Cancelled · customer takes · ${m.takes.map(x=>'line '+x.line+' · '+x.pieces+' glass').join(', ')}</p>`:'')
  +(open&&m.shop.length?`<p class="mut" data-lookup-shop>In the shop · ${m.shop.map(([k,n])=>esc(k)+' '+n).join(' · ')} glass</p>`:'')
  +(m.due?`<p class="shipping-lookup-bad" data-lookup-due>Balance due ${esc(finFmt(m.due))}</p>`:'')
  +`<div class="sales-toolbar">${m.ps.map(s=>`<button type="button" class="sm" data-lookup-ps onclick="shippingLookupReset();shippingGo('${esc(s.id)}')">${esc(s.number)} · ${shippingStatus(s)}</button>`).join('')}<span class="sales-toolbar-sp"></span><button type="button" onclick="optimizationOpenOrder('${esc(o.id)}')">Open order</button>${can?`<button type="button" class="pri" data-lookup-pickup onclick="shippingLookupPickup('${esc(o.id)}')">Pickup packing slip${m.free.length?' · '+count(m.free.length):''}</button>`:''}<button type="button" aria-label="Close" onclick="shippingLookupClose()">×</button></div></section>`};
}
