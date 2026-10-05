/* Shipping · office shipments, 5 October 2026.
   IN: actual assemblies/scans, saved orders; OUT: units and PS quantities.
   Owner: one PS per customer/address, no prices; Net after the last receipt.
   A unit is an actual assembly, never matching indices of its component Gs.
   Legacy manual Ready is test data: recalculate it from scans on import.
   Legacy done/closed without PS remains fulfilled. No invented shipments. */
DEFAULT.shipment=[];DEFAULT.shipmentSeq=0;
const SHIPPING_STATUSES=['planned','shipped','delivered','cancelled'];
const SHIPPING_ADDRESS_FIELDS=['label','addressee','address1','address2','address3','city','province','country','postalCode','contact','phone'];
function shippingClone(x){return JSON.parse(JSON.stringify(x));}
function shippingFind(id){return (DB.shipment||[]).find(s=>s.id===id||s.number===id)||null;}
function shippingOrderIds(s){return [...new Set((s.items||[]).concat(s.extras||[]).map(i=>i.orderId))];}
function shippingForOrder(id){return (DB.shipment||[]).filter(s=>shippingOrderIds(s).includes(id));}
function shippingActive(s){return s.status!=='cancelled';}
function shippingSent(s){return s.status==='shipped'||s.status==='delivered';}
function shippingLegacy(o){return !!o&&['done','closed'].includes(o.status)&&!shippingForOrder(o.id).length;}
function shippingStations(){const a=(DB.station||[]).filter(s=>s.always).sort((a,b)=>a.seq-b.seq);return {ready:a.length>1?a[a.length-2].code:'',ship:a.length>1?a[a.length-1].code:''};}
function shippingKey(i){return [i.orderId,i.lineId,i.unit].join('|');}
function shippingCount(n,word){return n+' '+word+(n===1?'':'s');}
function shippingLineQty(l){return Math.max(0,Number(l.qty)||0);}
function shippingAddress(a){const out={};SHIPPING_ADDRESS_FIELDS.forEach(k=>out[k]=String(a&&a[k]||'').trim().slice(0,300));return out;}
function shippingDefaultAddress(c){
 const a=(c&&c.addresses||[]).filter(a=>a.type==='delivery'),contact=(c&&c.contacts||[]).find(x=>x.isShipping)||(c&&c.contacts||[]).find(x=>x.isPrimary);
 return shippingAddress(Object.assign({},a.find(x=>x.isDefault)||a[0]||{},{contact:contact&&contact.name,phone:contact&&(contact.phone||contact.mobile)}));
}
function shippingDateValid(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;}
/* Индексы для расчёта готовности. Без них каждый заказ заново перебирал все
   стёкла, а каждое стекло — весь журнал сканов: на тысячах юнитов цеха
   (владелец: «в производстве 3000+ юнитов») экран Shipping вставал. Экран и
   пересчёт при загрузке строят индексы один раз (shippingWithCtx); команда
   вне экрана — один раз на вызов. Внутри shippingWithCtx базу не меняют. */
let shippingCtxNow=null;
function shippingCtx(){
 if(shippingCtxNow)return shippingCtxNow;
 const index=stationPieceIndex(),scans=new Map(),asm=new Map(),broken=new Set();
 (DB.stationScan||[]).forEach(s=>{
  if(s.undoneAt)return;
  if(!scans.has(s.piece))scans.set(s.piece,[]);scans.get(s.piece).push(s);
  if(s.broken)broken.add(s.piece);
  const hit=s.asm&&index.get(s.piece);if(!hit)return;
  const k=hit.orderId+'|'+hit.lineId;if(!asm.has(k))asm.set(k,[]);asm.get(k).push(s);
 });
 return {index,batches:stationBatchIndex(),scans,asm,broken};
}
function shippingWithCtx(fn){if(shippingCtxNow)return fn();shippingCtxNow=shippingCtx();try{return fn();}finally{shippingCtxNow=null;}}
/* Ready is physical readiness. Available additionally excludes another PS.
   Single-lite recuts fill free order slots; the chosen G is saved on the PS.
   An existing PS pins both slot and actual pieces until it is cancelled. */
function shippingUnits(o){
 if(!o||salesIsQuote(o)||['closed','cancelled'].includes(o.status)||shippingLegacy(o))return [];
 const ctx=shippingCtx(),index=ctx.index,batches=ctx.batches,stations=shippingStations(),out=[],scansOf=id=>ctx.scans.get(id)||[];
 const reserved=shippingForOrder(o.id).filter(shippingActive).flatMap(s=>s.items.map(i=>Object.assign({shipment:s},i)));
 (o.lines||[]).forEach(l=>{
  const fixed=reserved.filter(i=>i.lineId===l.id),taken=new Set(fixed.map(i=>i.unit)),labels=new Set(fixed.map(i=>i.label)),candidates=[];
  const mu=stationUnitMerge(o,l),keys=stationLineKeys(o,l);
  if(mu){stationAsms(o,l,mu,index,{scans:ctx.asm.get(o.id+'|'+l.id)||[],broken:ctx.broken}).filter(a=>a.complete&&!a.broken&&a.unit>0&&a.unit<=l.qty).forEach(a=>{
   if(keys.every(k=>a.lites.has(k)))candidates.push({unit:a.unit,label:unitIdAt(o.id,l.id,a.unit),pieces:[...a.lites.values()]});
  });}else if(keys.length===1){
   const rec=glassPieceMap(o.id).get(keys[0]);if(rec){
    rec.ids.forEach((id,n)=>{if(id)candidates.push({unit:n+1,label:id,pieces:[id]});});
    Object.values(rec.extra||{}).forEach(a=>a.forEach(id=>{if(id)candidates.push({unit:0,label:id,pieces:[id]});}));
   }
  }
  const inspect=i=>{
   const gs=i.pieces.map(id=>stationGlass(id,index,batches)),places=gs.map(g=>g&&stationPlace(g,scansOf(g.id)));
   const ready=!!stations.ship&&gs.length>0&&places.every(p=>p&&!p.broken&&!p.assembling&&p.waiting===stations.ship)&&!o.onHold&&!l.onHold;
   const ons=gs.map(g=>{const scans=g&&scansOf(g.id);return scans&&scans.length?scans[scans.length-1].on||'':'';});
   const on=ons.length&&ons.every(x=>x===ons[0])?ons[0]:'';
   /* Погружен: все стёкла прошли станцию отгрузки (скан погрузки, PR 2). */
   const loaded=gs.length>0&&places.every(p=>p&&!p.broken&&p.shipped);
   return Object.assign({orderId:o.id,lineId:l.id},i,{ready,loaded,on,skid:/^S[LA]-/.test(on)?on:'',broken:places.some(p=>!p||p.broken)});
  };
  fixed.forEach(i=>out.push(inspect(i)));
  const live=candidates.map(inspect).filter(i=>!labels.has(i.label)&&!i.broken);
  live.sort((a,b)=>Number(b.ready)-Number(a.ready)||Number(!a.unit)-Number(!b.unit)||a.unit-b.unit||a.label.localeCompare(b.label));
  live.forEach(i=>{
   let n=i.unit;
   if(mu&&taken.has(n))return;
   if(!n||taken.has(n)){n=1;while(taken.has(n)&&n<=l.qty)n++;}
   if(n>l.qty)return;taken.add(n);i.unit=n;out.push(i);
  });
 });
 return out;
}
/* Свой PS держит и то, что уже погружено: оно больше не «ждёт на станции». */
function shippingLoadedOn(i,id){return !!i.loaded&&!!i.shipment&&i.shipment.status==='planned'&&(!id||i.shipment.id===id);}
function shippingAvailable(o,exceptId){return shippingUnits(o).filter(i=>i.ready?!i.shipment||i.shipment.id===exceptId:!!exceptId&&shippingLoadedOn(i,exceptId));}
function shippingSummary(o){
 const legacy=shippingLegacy(o),ps=shippingForOrder(o.id),units=shippingUnits(o);
 const lines=(o.lines||[]).map(l=>{
  const sent=ps.filter(shippingSent).flatMap(s=>s.items).filter(i=>i.orderId===o.id&&i.lineId===l.id),received=ps.filter(s=>s.status==='delivered').flatMap(s=>s.items).filter(i=>i.orderId===o.id&&i.lineId===l.id);
  const ordered=shippingLineQty(l),shipped=legacy?ordered:sent.length,delivered=legacy?ordered:received.length;
  return {l,ordered,shipped,delivered,back:Math.max(0,ordered-shipped),ready:units.filter(i=>i.lineId===l.id&&i.ready&&!i.shipment).length,physicalReady:units.filter(i=>i.lineId===l.id&&(i.ready&&(!i.shipment||i.shipment.status==='planned')||shippingLoadedOn(i))).length};
 });
 const extras=(o.extraItems||[]).map(x=>{
  const count=filter=>ps.filter(filter).flatMap(s=>s.extras).filter(i=>i.orderId===o.id&&i.extraId===x.id).reduce((n,i)=>n+i.qty,0);
  const shipped=legacy?x.qty:count(shippingSent),delivered=legacy?x.qty:count(s=>s.status==='delivered');
  return {x,ordered:x.qty,shipped,delivered,back:Math.max(0,x.qty-shipped),ready:Math.max(0,x.qty-count(shippingActive))};
 });
 const sum=(a,k)=>a.reduce((n,x)=>n+x[k],0),all=lines.concat(extras);
 return {lines,extras,ordered:sum(all,'ordered'),shipped:sum(all,'shipped'),delivered:sum(all,'delivered'),back:sum(all,'back'),ready:sum(lines,'ready'),physicalReady:sum(lines,'physicalReady'),glass:sum(lines,'ordered'),ps};
}
/* Остаток по отгрузкам, без расчёта готовности: подпись статуса в списках
   (Partially shipped / Shipped) не должна перебирать стёкла каждой строки. */
function shippingBackCount(o){
 if(!o||shippingLegacy(o))return 0;const sent=shippingForOrder(o.id).filter(shippingSent);
 const units=sent.flatMap(s=>s.items).filter(i=>i.orderId===o.id),extras=sent.flatMap(s=>s.extras).filter(i=>i.orderId===o.id);
 return (o.lines||[]).reduce((n,l)=>n+Math.max(0,shippingLineQty(l)-units.filter(i=>i.lineId===l.id).length),0)
  +(o.extraItems||[]).reduce((n,x)=>n+Math.max(0,x.qty-extras.filter(i=>i.extraId===x.id).reduce((a,i)=>a+i.qty,0)),0);
}
function shippingPrintedPiece(piece){return (DB.shipment||[]).some(s=>shippingActive(s)&&s.printedAt&&(s.printedItems||s.items).some(i=>(i.pieces||[]).includes(piece)));}
function shippingPrintedQty(o,l){return new Set(shippingForOrder(o.id).filter(s=>shippingActive(s)&&(s.printedAt||shippingSent(s))).flatMap(s=>s.printedItems||s.items).filter(i=>i.lineId===l.id).map(i=>i.unit)).size;}
function shippingHasSent(o){return shippingLegacy(o)||shippingForOrder(o.id).some(shippingSent);}
function shippingHasCommitment(o){return shippingForOrder(o.id).some(shippingActive);}
/* Recompute inside the caller's transaction, after the whole scan action.
   Creation/reservation never starts Net. Receipt of all stock items matters.
   A closed order stays closed unless its receipt is explicitly rolled back. */
function shippingSyncOrder(o,now,opts){
 if(!o||salesIsQuote(o)||o.status==='cancelled'||shippingLegacy(o))return;
 opts=opts||{};if(o.status==='closed'&&!opts.reopen)return;
 const q=shippingSummary(o),old=o.status;now=now||new Date().toISOString();o.statusDates=o.statusDates||{};
 let next=old;
 if(q.ordered>0&&q.delivered>=q.ordered){
  next='done';const last=q.ps.filter(s=>s.status==='delivered').sort((a,b)=>a.deliveredAt.localeCompare(b.deliveredAt)).pop();
  o.statusDates.done=last.deliveredAt;
 }else{
  delete o.statusDates.done;delete o.statusDates.closed;
  if(q.shipped>0){next='shipping';if(q.back>0&&!o.statusDates.shipping)o.statusDates.shipping=now;}
  else if((q.glass>0&&q.physicalReady===q.glass)||(salesStockOnly(o)&&old!=='new'))next='ready';
  else if(['ready','shipping','done','closed'].includes(old))next=(o.lines||[]).some(salesLineLocked)?'batched':'verified';
 }
 const last=q.ps.filter(shippingSent).sort((a,b)=>a.shippedAt.localeCompare(b.shippedAt)).pop();o.fulfilledVia=last?last.method:'';
 if(next!=='ready'&&!q.shipped)delete o.statusDates.ready;
 if(next==='ready'&&!o.statusDates.ready)o.statusDates.ready=now;
 if(next!==old){o.status=next;o.updatedAt=now;}
 salesSyncRecordLifecycle(o);
}
function shippingSyncOrders(ids,now,opts){[...new Set(ids)].forEach(id=>shippingSyncOrder(salesRecord(id),now,opts));}
function shippingSaveGuard(draft,saved){
 if(!saved)return '';
 const ps=shippingForOrder(saved.id).filter(shippingActive);if(!ps.length)return '';
 if(saved.customerId!==draft.customerId)return 'This order has packing slips. Its customer cannot change.';
 for(const l of saved.lines||[]){if(!ps.some(s=>s.items.some(i=>i.lineId===l.id)))continue;
  const n=draft.lines.find(x=>x.id===l.id);if(!n||salesLockedLineSnapshot(draft,n)!==salesLockedLineSnapshot(saved,l))return 'Glass on a packing slip cannot change. Cancel the planned packing slip first.';
 }
 for(const x of saved.extraItems||[]){const reserved=ps.flatMap(s=>s.extras).filter(i=>i.orderId===saved.id&&i.extraId===x.id).reduce((n,i)=>n+i.qty,0);if(!reserved)continue;
  const n=(draft.extraItems||[]).find(i=>i.id===x.id);if(!n||n.qty<reserved||n.table!==x.table||n.itemId!==x.itemId)return 'Stock items on a packing slip cannot be removed or reduced below its quantity.';
 }
 return '';
}
function normalizeShipments(){
 if(!Array.isArray(DB.shipment))DB.shipment=[];
 DB.shipment.forEach(s=>{s.shipTo=shippingAddress(s.shipTo);s.items=s.items||[];s.extras=s.extras||[];s.scanIds=s.scanIds||[];});
 DB.shipmentSeq=Math.max(Number(DB.shipmentSeq)||0,...DB.shipment.map(s=>Number(String(s.number).slice(3))||0));
 shippingWithCtx(()=>(DB.salesOrder||[]).filter(o=>['ready','shipping'].includes(o.status)).forEach(o=>shippingSyncOrder(o,o.updatedAt)));
}
function validateShipmentPayload(src){
 if(src.shipment==null)return;
 if(!Array.isArray(src.shipment))throw new Error('Shipments must be an array.');
 const ids=new Set(),numbers=new Set(),slots=new Set(),labels=new Set(),pieces=new Set(),extraTotals=new Map();
 const iso=s=>typeof s==='string'&&!isNaN(Date.parse(s));
 src.shipment.forEach(s=>{
  if(!s||typeof s!=='object'||!salesRefId(s.id)||ids.has(s.id)||!/^PS-\d{4,}$/.test(s.number)||numbers.has(s.number)||!SHIPPING_STATUSES.includes(s.status)||!['delivery','pickup'].includes(s.method)||!shippingDateValid(s.date)||!salesRefId(s.customerId)||!Array.isArray(s.items)||!Array.isArray(s.extras)||!s.shipTo||typeof s.shipTo!=='object')throw new Error('Invalid or duplicate packing slip.');
  ids.add(s.id);numbers.add(s.number);
  if(shippingSent(s)&&(!iso(s.shippedAt)||!s.items.length&&!s.extras.length)||s.status==='delivered'&&!iso(s.deliveredAt))throw new Error('Invalid shipment dates or empty shipment.');
  const own=new Set();s.items.forEach(i=>{
   const k=shippingKey(i);if(!salesRefId(i.orderId)||!salesRefId(i.lineId)||!Number.isSafeInteger(i.unit)||i.unit<1||!glassPieceValid(i.label)&&!unitIdValid(i.label)||!Array.isArray(i.pieces)||!i.pieces.length||!i.pieces.every(glassPieceValid)||own.has(k))throw new Error('Invalid or duplicate shipment unit.');
   own.add(k);if(shippingActive(s)){if(i.pieces.some(p=>pieces.has(p))||new Set(i.pieces).size!==i.pieces.length)throw new Error('Glass is on more than one shipment unit.');i.pieces.forEach(p=>pieces.add(p));if(slots.has(k)||labels.has(i.label))throw new Error('A unit is on more than one packing slip.');slots.add(k);labels.add(i.label);}
  });
  const extra=new Set();s.extras.forEach(i=>{const k=i.orderId+'|'+i.extraId;if(!salesRefId(i.orderId)||!salesRefId(i.extraId)||!Number.isSafeInteger(i.qty)||i.qty<1||extra.has(k))throw new Error('Invalid shipment stock quantity.');extra.add(k);if(shippingActive(s))extraTotals.set(k,(extraTotals.get(k)||0)+i.qty);});
  if(Array.isArray(src.salesOrder)&&shippingActive(s)){
   const checkOrder=i=>{const o=src.salesOrder.find(o=>o.id===i.orderId);if(!o||o.customerId!==s.customerId)throw new Error('Shipment customer does not match its order.');return o;};
   s.items.forEach(i=>{const o=checkOrder(i),l=(o.lines||[]).find(l=>l.id===i.lineId);if(!l||i.unit>l.qty)throw new Error('Shipment line or unit no longer exists.');});
   s.extras.forEach(i=>{const o=checkOrder(i),x=(o.extraItems||[]).find(x=>x.id===i.extraId);if(!x||(extraTotals.get(i.orderId+'|'+i.extraId)||0)>x.qty)throw new Error('Shipment stock quantity exceeds the order.');});
  }
 });
}
