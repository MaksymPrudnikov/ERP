/* Shipping · заказ по номеру у стойки (6 октября 2026).
   Владелец: клиент приходит — «заказ 8000, я забрать»; пара стёкол, сразу
   везёт ставить. Номер набирают руками, штрихкода у клиента нет. PS — на
   один этот заказ: «можем выдать отдельную бумажку на каждый заказ, парни
   на шипинге найдут 2–3–4 заказа быстро».
   Карточка: сколько готово, на какой таре лежит, что ещё в цеху, долг.
   Кнопка создаёт PS самовывоза на всё готовое по заказу и печатает его;
   долг проверяется один раз — до записи (Take payment / Print anyway). */
let shippingLookupId='',shippingLookupText='',shippingLookupMiss='';
function shippingLookupGo(raw){
 const text=String(raw||'').trim();shippingLookupText=text;shippingLookupId='';shippingLookupMiss='';
 if(text){const o=(DB.salesOrder||[]).find(o=>!salesIsQuote(o)&&String(o.businessNumber||'').trim().toLowerCase()===text.toLowerCase());if(o)shippingLookupId=o.id;else shippingLookupMiss=text;}
 render();
}
function shippingLookupClose(){shippingLookupId='';shippingLookupText='';shippingLookupMiss='';render();}
function shippingLookupModel(o){
 const q=shippingSummary(o),free=shippingUnits(o).filter(u=>u.ready&&!u.shipment),sent=q.lines.reduce((n,r)=>n+r.shipped,0),ctx=shippingCtx(),ship=shippingStations().ship;
 const where=new Map(),shop=new Map();free.forEach(u=>where.set(u.on||'',(where.get(u.on||'')||0)+1));
 /* Что ещё в цеху: стёкла заказа по станциям, где они ждут. */
 ctx.index.forEach((h,piece)=>{
  if(h.orderId!==o.id)return;const g=stationGlass(piece,ctx.index,ctx.batches),scans=ctx.scans.get(piece)||[];if(!g)return;
  const p=stationPlace(g,scans);if(p.broken||p.shipped||!p.waiting||p.waiting===ship)return;
  const k=!g.entry&&!scans.length?'To batch':p.waiting;shop.set(k,(shop.get(k)||0)+1);
 });
 const seq=code=>{const s=(DB.station||[]).find(x=>x.code===code);return s?s.seq:-1;};
 return {q,free,left:Math.max(0,q.glass-sent),where:[...where].sort((a,b)=>String(a[0]||'~').localeCompare(String(b[0]||'~'),undefined,{numeric:true})),shop:[...shop].sort((a,b)=>seq(a[0])-seq(b[0])),
  extras:o.status!=='new'&&!o.onHold?q.extras.filter(e=>e.ready>0):[],ps:q.ps.filter(shippingActive),due:shippingBalanceDue(o)?finOrderBalance(o).balance:0};
}
function shippingLookupPickup(id){
 const o=salesRecord(id);if(!o)return;
 shippingWithChecks([id],'pickup',true,()=>{
  const m=shippingWithCtx(()=>shippingLookupModel(salesRecord(id)));
  const out=shippingCreate({customerId:o.customerId,method:'pickup',shipTo:shippingDefaultAddress(salesFindCustomer(o.customerId)),date:finToday(),items:m.free.map(shippingItem),extras:m.extras.map(e=>({orderId:id,extraId:e.x.id,qty:e.ready})),note:''});
  if(!out.ok){shippingNotice={error:true,text:out.error};render();return;}
  shippingLookupId='';shippingLookupText='';shippingSelection.clear();shippingOpenId=out.value.id;shippingPreview=false;shippingTab='shipments';shippingNotice={text:out.value.number+' saved'};render();
  shippingPrint(out.value.id,true);
 });
}
function shippingLookupHTML(){
 const field=`<label class="shipping-lookup-field">Order<input data-order-lookup value="${esc(shippingLookupText)}" placeholder="Order number" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();shippingLookupGo(this.value)}"></label>`;
 const o=shippingLookupId&&salesRecord(shippingLookupId);
 if(!o)return {field,card:shippingLookupMiss?`<div class="shipping-notice bad" role="alert" data-lookup-miss>Order ${esc(shippingLookupMiss)} not found</div>`:''};
 const m=shippingLookupModel(o),count=n=>shippingCount(n,'unit'),open=!['done','closed','cancelled'].includes(o.status)&&!shippingLegacy(o);
 const pill=open&&m.left?`<span class="pill ${m.q.physicalReady===m.left?'ok':''}" data-lookup-ready>${m.q.physicalReady} / ${m.left} ready</span>`:`<span class="pill" data-lookup-ready>${esc(salesStatusLabel(o))}</span>`;
 const where=m.where.map(([code,n])=>`<span class="shipping-lookup-where"><b>${esc(code||'No skid')}</b>${count(n)}</span>`).join('');
 const can=open&&(m.free.length>0||m.extras.length>0);
 return {field,card:`<section class="card shipping-customer shipping-lookup" data-lookup-card><div class="shipping-customer-head"><div><h3>Order ${esc(o.businessNumber)} · ${esc(salesCustomerDisplay(o.customerId))}</h3><span class="mut">${o.delivery==='delivery'?'Delivery':'Pickup'}${o.customerPo?' · PO '+esc(o.customerPo):''}</span></div>${pill}</div>`
  +(o.onHold?`<p class="shipping-lookup-bad">On hold${o.holdReason?' · '+esc(o.holdReason):''}</p>`:'')
  +(where?`<div class="shipping-lookup-row">${where}</div>`:'')
  +(m.extras.length?`<p class="mut">From stock · ${m.extras.map(e=>esc(salesExtraItemName(e.x))+' ×'+e.ready).join(', ')}</p>`:'')
  +(open&&m.shop.length?`<p class="mut" data-lookup-shop>In the shop · ${m.shop.map(([k,n])=>esc(k)+' '+n).join(' · ')} glass</p>`:'')
  +(m.due?`<p class="shipping-lookup-bad" data-lookup-due>Balance due ${esc(finFmt(m.due))}</p>`:'')
  +`<div class="row">${m.ps.map(s=>`<button type="button" class="sm" data-lookup-ps onclick="shippingLookupId='';shippingGo('${esc(s.id)}')">${esc(s.number)} · ${shippingStatus(s)}</button>`).join('')}<span class="sp"></span><button type="button" onclick="optimizationOpenOrder('${esc(o.id)}')">Open order</button>${can?`<button type="button" class="pri" data-lookup-pickup onclick="shippingLookupPickup('${esc(o.id)}')">Pickup packing slip${m.free.length?' · '+count(m.free.length):''}</button>`:''}<button type="button" aria-label="Close" onclick="shippingLookupClose()">×</button></div></section>`};
}
