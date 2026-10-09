/* Office reverse passage, owner 9 October 2026.
   A target means waiting at that occurrence of the station. Not cut also
   releases the selected glass from its batches and requires Verify again.
   Actual assemblies travel together. Other units in a PS or scan action do
   not travel with them. History is retained; there is deliberately no Undo.
   IN: {orderId, lines:{lineId:qty|'all'}, codes:[], target, reason, stamp}
   OUT: preview / DB.productionUnbatch and the corrected production records. */
DEFAULT.productionUnbatch=[];
const PRODUCTION_UNBATCH_UNCUT='uncut';
function productionUnbatchAllowed(){return skipAllowed();}
function productionUnbatchCanOpen(o){return !!o&&!salesIsQuote(o)&&o.status!=='cancelled'&&(o.lines||[]).length>0;}
function productionUnbatchStamp(){return JSON.stringify(DB);}
/* A frozen route may visit the same machine twice. The occurrence, rather
   than the machine name alone, is the address of a reverse target. */
function productionUnbatchSteps(g){
 const seen=new Map();return stationRouteOf(g).codes.map((code,step)=>{const n=(seen.get(code)||0)+1;seen.set(code,n);return {id:code+'@'+n,code,n,step};});
}
function productionUnbatchStep(g,target){return target===PRODUCTION_UNBATCH_UNCUT?0:productionUnbatchSteps(g).find(x=>x.id===target)?.step??-1;}
function productionUnbatchTargetLabel(target){
 if(target===PRODUCTION_UNBATCH_UNCUT)return 'Not cut · To verify';
 const [code,n]=String(target).split('@');return (code===shippingStations().ship?'Shipping ready · ':'')+'Waiting at '+code+(+n>1?' · pass '+n:'');
}
/* Build units from real assembly/PS links before filling any open unit.
   Pairing by original G indices would cross already laminated/recut pairs. */
function productionUnbatchUnits(o){
 const ctx=shippingCtx(),all=[...ctx.index].filter(([,h])=>h.orderId===o.id).map(([id])=>stationGlass(id,ctx.index,ctx.batches));
 const live=all.filter(g=>g.c&&!g.c.missing&&!unitPieceCancelled(g)&&!stationPlace(g,ctx.scans.get(g.id)||[]).broken),byId=new Map(live.map(g=>[g.id,g])),parent=new Map(live.map(g=>[g.id,g.id]));
 const root=id=>{let r=id;while(parent.get(r)!==r)r=parent.get(r);while(id!==r){const next=parent.get(id);parent.set(id,r);id=next;}return r;};
 const join=ids=>{ids=ids.filter(id=>byId.has(id));if(ids.length)ids.slice(1).forEach(id=>parent.set(root(id),root(ids[0])));};
 const asms=new Map();(DB.stationScan||[]).forEach(s=>{if(s.undoneAt||!s.asm||!byId.has(s.piece))return;if(!asms.has(s.asm))asms.set(s.asm,[]);asms.get(s.asm).push(s.piece);});
 asms.forEach(ids=>join(ids));
 (DB.shipment||[]).filter(shippingActive).forEach(s=>s.items.filter(i=>i.orderId===o.id).forEach(i=>join(i.pieces)));
 const groups=new Map();live.forEach(g=>{const k=root(g.id);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(g);});
 const out=[];
 (o.lines||[]).forEach(l=>{
  const keys=stationLineKeys(o,l),pool=[...groups.values()].filter(a=>a[0].l.id===l.id),mu=stationUnitMerge(o,l),assemblies=mu?stationAsms(o,l,mu,ctx.index):[];
  const score=a=>Math.max(...a.map(g=>stationPlace(g,ctx.scans.get(g.id)||[]).far));
  pool.sort((a,b)=>score(b)-score(a)||a[0].id.localeCompare(b[0].id));
  while(pool.length){
   const gs=pool.shift(),has=new Set(gs.map(g=>g.c.key));
   for(const key of keys){
    if(has.has(key))continue;
    const fits=a=>a.some(g=>g.c.key===key)&&a.every(g=>!has.has(g.c.key))&&a.every(g=>gs.every(h=>stationDrawingFits(o,l,g.c&&{key:g.c.key,unit:g.unit},{key:h.c.key,unit:h.unit})));
    const same=pool.findIndex(a=>a.some(g=>g.unit===gs[0].unit)&&fits(a)),i=same>=0?same:pool.findIndex(fits);
    if(i>=0)pool.splice(i,1)[0].forEach(g=>{gs.push(g);has.add(g.c.key);});
   }
   const pieces=gs.map(g=>g.id),asm=assemblies.find(a=>a.complete&&!a.broken&&[...a.lites.values()].every(id=>pieces.includes(id)));
   const ps=(DB.shipment||[]).filter(shippingActive).flatMap(s=>s.items).find(i=>i.orderId===o.id&&i.pieces.some(id=>pieces.includes(id)));
   out.push({lineId:l.id,pieces,label:ps?ps.label:asm?unitIdAt(o.id,l.id,asm.unit):pieces[0],far:score(gs)});
  }
 });
 return out;
}
function productionUnbatchPick(o,d,units){
 const picked=[],used=new Set(),problems=[],take=u=>{if(!used.has(u)){used.add(u);picked.push(u);}};
 (d.codes||[]).map(c=>stationCodeOf(c)).filter(Boolean).forEach(code=>{
  const u=units.find(u=>u.pieces.includes(code)||u.label===code);
  if(!u)problems.push(code+' is not available in this order');else take(u);
 });
 Object.entries(d.lines||{}).forEach(([lineId,value])=>{
  if(value===''||value==null||value===0)return;
  const list=units.filter(u=>u.lineId===lineId&&!used.has(u));
  const n=value==='all'?list.length:Number(value);
  if(!Number.isSafeInteger(n)||n<0||n>list.length)problems.push('Check the selected quantity');
  else list.slice(0,n).forEach(take);
 });
 return {units:picked,problems};
}
function productionUnbatchTargets(units){
 const ids=units.flatMap(u=>u.pieces);if(!ids.length)return [{id:PRODUCTION_UNBATCH_UNCUT,label:productionUnbatchTargetLabel(PRODUCTION_UNBATCH_UNCUT)}];
 const routes=ids.map(id=>productionUnbatchSteps(stationGlass(id))),first=routes[0];
 return [{id:PRODUCTION_UNBATCH_UNCUT,label:productionUnbatchTargetLabel(PRODUCTION_UNBATCH_UNCUT)},...first.filter(x=>x.code!==stationCutCode()&&routes.every(r=>r.some(y=>y.id===x.id))).map(x=>({id:x.id,label:productionUnbatchTargetLabel(x.id)+(first.filter(y=>y.code===x.code).length>1&&x.n===1?' · pass 1':'')}))];
}
/* Use recorded step numbers, with the same replay used by stationPlace for
   old scans. Backdated Skip timestamps are never used as undo dependencies. */
function productionUnbatchScanSteps(g,recs){
 const route=stationRouteOf(g).codes,steps=new Map();let far=-1;
 (recs||stationScansFor(g.id)).slice().sort((a,b)=>String(a.at).localeCompare(String(b.at))||a.id.localeCompare(b.id)).forEach(s=>{
  const step=Number.isInteger(s.step)&&route[s.step]===s.station?s.step:stationRouteStep(route,s.station,far);
  steps.set(s.id,step);if(!s.broken&&!s.park&&step>far)far=step;
 });return steps;
}
function productionUnbatchPreview(d){
 if(!productionUnbatchAllowed())return {error:'Only Users or Finance can unbatch.'};
 return productionUnbatchPlan(d);
}
/* forDelete: order Delete (erp/sales/orders) checks its own rights, and a
   cancelled order is returned as well. */
function productionUnbatchPlan(d,forDelete){
 const o=salesRecord(d&&d.orderId);if(!(forDelete?!!o&&!salesIsQuote(o):productionUnbatchCanOpen(o)))return {error:'Unbatch is not available for this order.'};
 const catalog=productionUnbatchUnits(o),pick=productionUnbatchPick(o,d,catalog),target=d.target||PRODUCTION_UNBATCH_UNCUT,targets=productionUnbatchTargets(pick.units);
 if(pick.problems.length)return {error:pick.problems.join('. ')+'.',catalog,targets};
 if(!pick.units.length)return {error:'Choose what to unbatch.',catalog,targets};
 if(!targets.some(t=>t.id===target))return {error:'Choose a station on every selected route.',catalog,targets};
 const pieces=[],scanIds=[],batchNumbers=new Set(),asmIds=new Set(),unchanged=[],byPiece=new Map();
 (DB.stationScan||[]).forEach(s=>{if(s.undoneAt)return;if(!byPiece.has(s.piece))byPiece.set(s.piece,[]);byPiece.get(s.piece).push(s);});
 pick.units.forEach(u=>{
  let changed=false;
  u.pieces.forEach(id=>{
   const g=stationGlass(id),step=productionUnbatchStep(g,target),recs=byPiece.get(id)||[],steps=productionUnbatchScanSteps(g,recs);
   const scans=recs.filter(s=>!s.broken&&(target===PRODUCTION_UNBATCH_UNCUT||steps.get(s.id)>=step));
   scans.forEach(s=>{scanIds.push(s.id);if(s.asm)asmIds.add(s.asm);});
   if(scans.length||target===PRODUCTION_UNBATCH_UNCUT&&g.entry){changed=true;if(g.entry)batchNumbers.add(g.entry.batch.number);}
  });
  const onPs=(DB.shipment||[]).some(s=>shippingActive(s)&&s.items.some(i=>i.pieces.some(p=>u.pieces.includes(p))));
  if(changed||onPs)pieces.push(...u.pieces);else unchanged.push(u.label);
 });
 const sel=new Set(pieces),shipments=(DB.shipment||[]).filter(s=>shippingActive(s)&&s.items.some(i=>i.pieces.some(p=>sel.has(p))));
 return {orderId:o.id,target,units:pick.units.filter(u=>u.pieces.some(p=>sel.has(p))),pieces,scanIds:[...new Set(scanIds)],batchNumbers:[...batchNumbers],asmIds:[...asmIds],shipments:shipments.map(s=>({id:s.id,number:s.number,qty:s.items.filter(i=>i.pieces.some(p=>sel.has(p))).length})),unchanged,catalog,targets};
}
function productionUnbatchRun(d){
 if(!productionUnbatchAllowed())return {error:'Only Users or Finance can unbatch.'};
 const out=storageCommand(()=>productionUnbatchCommand(d));return out.ok?out.value:{error:out.error};
}
function productionUnbatchCommand(d,forDelete){
 if(!forDelete)shippingAssert(d&&typeof d.stamp==='string'&&d.stamp===productionUnbatchStamp(),'Data changed. Review and try again.');
 const plan=forDelete?productionUnbatchPlan(d,true):productionUnbatchPreview(d);shippingAssert(!plan.error,plan.error);shippingAssert(plan.pieces.length,'The selected glass does not need to move back.');
 const o=salesRecord(plan.orderId),now=new Date().toISOString(),who=orderLogActor(),sel=new Set(plan.pieces),scans=new Set(plan.scanIds);
 const record={id:salesUid('PU'),orderId:o.id,at:now,target:plan.target,reason:String(d.reason||'').trim().slice(0,200),by:who.by||'Office',byId:who.byId||'',pieces:plan.pieces,scanIds:plan.scanIds,batchNumbers:plan.batchNumbers,shipments:plan.shipments,skipIds:(DB.skip||[]).filter(k=>!k.undoneAt&&k.pieces.some(p=>sel.has(p))).map(k=>k.id)};
 /* s.items is the effective composition. Excluded items retain their whole
    identity and correction link separately; the frozen PS is not rewritten. */
 plan.shipments.forEach(p=>{
  const s=shippingFind(p.id),removed=s.items.filter(i=>i.pieces.some(id=>sel.has(id)));
  shippingAssert(removed.every(i=>i.pieces.every(id=>sel.has(id))),'Return the whole assembled unit.');
  if(!s.document)s.unbatchOriginalDocument=shippingDocument(s);
  s.unbatchedItems=(s.unbatchedItems||[]).concat(removed.map(i=>Object.assign(shippingClone(i),{unbatchId:record.id})));
  s.items=s.items.filter(i=>!removed.includes(i));shippingUnprint(s,removed);
  s.scanIds=(s.scanIds||[]).filter(id=>!scans.has(id));
  if(!s.items.length&&!s.extras.length&&!(s.takes||[]).length){s.status='cancelled';if(!s.document)s.document=s.unbatchOriginalDocument;}
  if(Array.isArray(s.skidsOut))s.skidsOut=s.skidsOut.filter(code=>s.items.some(i=>i.skid===code));
  orderLogPush(o,'Packing slip corrected',s.number+' · '+shippingCount(removed.length,'unit')+' unbatched');
 });
 (DB.stationScan||[]).filter(s=>scans.has(s.id)).sort((a,b)=>+b.id.slice(3)-+a.id.slice(3)).forEach(s=>{s.undoneAt=now;s.undoneBy=('Unbatch · '+record.by).slice(0,80);stationAsmReopen(s);});
 const lines=new Set(),batches=new Map();
 plan.pieces.forEach(id=>{
  const g=stationGlass(id);lines.add(g.l);
  if(g.entry){
   if(!stationScansFor(id).some(s=>s.station===stationCutCode()&&!s.park))g.entry.item.cutStartedAt='';
   if(plan.target===PRODUCTION_UNBATCH_UNCUT){
    g.entry.item.releasedAt=now;if(!batches.has(g.entry.batch))batches.set(g.entry.batch,[]);batches.get(g.entry.batch).push(id);
   }
  }
 });
 batches.forEach((pieces,b)=>b.history.push({at:now,action:'Unbatched',pieces,qty:pieces.length,productionUnbatch:record.id}));
 lines.forEach(l=>glassBatchSyncLine(o,l));
 const locked=(o.lines||[]).filter(salesLineLocked);o.batchNo=locked.length?locked[locked.length-1].batchNo:'';
 if(plan.target===PRODUCTION_UNBATCH_UNCUT){
  o.productionUnbatchVerify=true;o.status='new';o.statusDates=Object.assign({},o.statusDates,{new:now});delete o.statusDates.verified;
  o.unbatchHistory=(o.unbatchHistory||[]).concat({at:now,batchNumbers:plan.batchNumbers,lineIds:[...lines].map(l=>l.id)});
 }
 /* The shipping calculation reopens Closed and keeps issued quantities of
    every other unit. Pending Verify wins over the derived aggregate status. */
 shippingSyncOrder(o,now,{reopen:true});o.updatedAt=now;salesSyncRecordLifecycle(o);
 (DB.productionUnbatch||(DB.productionUnbatch=[])).push(record);
 orderLogPush(o,'Production unbatched',[shippingCount(plan.units.length,'unit'),shippingCount(plan.pieces.length,'glass piece'),'→ '+productionUnbatchTargetLabel(plan.target),plan.shipments.map(s=>s.number).join(', '),record.reason].filter(Boolean).join(' · '));
 return record;
}
/* Order Delete at any stage (owner, 9 October 2026: a mistaken Skip is
   deleted together with its packing slip). All glass returns as Unbatch to
   Not cut; what Unbatch leaves (broken glass, cancelled units) also leaves
   its batches. Runs inside the Delete storageCommand. */
function productionUnbatchDeleteDraft(o){return {orderId:o.id,lines:Object.fromEntries((o.lines||[]).map(l=>[l.id,'all'])),target:PRODUCTION_UNBATCH_UNCUT,reason:'Order deleted'};}
function productionUnbatchDeleteBatches(o){return [...new Set((DB.glassBatch||[]).filter(b=>b.items.some(i=>!i.releasedAt&&(b.parts[i.part]||{}).orderId===o.id)).map(b=>b.number))];}
function productionUnbatchForDelete(o){
 const d=productionUnbatchDeleteDraft(o),plan=productionUnbatchPlan(d,true);
 if(!plan.error&&plan.pieces.length)productionUnbatchCommand(d,true);
 const now=new Date().toISOString();
 (DB.glassBatch||[]).forEach(b=>{
  const off=b.items.filter(i=>!i.releasedAt&&(b.parts[i.part]||{}).orderId===o.id);if(!off.length)return;
  off.forEach(i=>{i.releasedAt=now;});b.history.push({at:now,action:'Order deleted',pieces:off.map(i=>i.piece).filter(Boolean),qty:off.length});
 });
}
function productionUnbatchSkipPieces(k){return [...new Set((DB.productionUnbatch||[]).filter(u=>u.skipIds.includes(k.id)).flatMap(u=>u.pieces).filter(p=>k.pieces.includes(p)))];}
function normalizeProductionUnbatches(){if(!Array.isArray(DB.productionUnbatch))DB.productionUnbatch=[];}
function validateProductionUnbatchPayload(src){
 if(src.productionUnbatch==null){if((src.shipment||[]).some(s=>s.unbatchedItems?.length))throw new Error('Unbatch history is missing.');return;}
 if(!Array.isArray(src.productionUnbatch))throw new Error('The "productionUnbatch" field must be an array.');
 const ids=new Set(),records=new Map(),scans=new Map((src.stationScan||[]).filter(s=>s&&s.id).map(s=>[s.id,s])),iso=v=>typeof v==='string'&&!isNaN(Date.parse(v));
 src.productionUnbatch.forEach(r=>{
  if(!r||!salesRefId(r.id)||ids.has(r.id)||!salesRefId(r.orderId)||!iso(r.at)||typeof r.target!=='string'||!(r.target===PRODUCTION_UNBATCH_UNCUT||/^.+@\d+$/.test(r.target))||typeof r.by!=='string'||typeof r.byId!=='string'||typeof r.reason!=='string'||!Array.isArray(r.pieces)||!r.pieces.length||!r.pieces.every(glassPieceValid)||new Set(r.pieces).size!==r.pieces.length||!Array.isArray(r.scanIds)||!r.scanIds.every(s=>STATION_SCAN_ID_RE.test(s))||!Array.isArray(r.batchNumbers)||!r.batchNumbers.every(s=>salesBatchNumber(s)===s)||!Array.isArray(r.shipments)||!r.shipments.every(s=>s&&salesRefId(s.id)&&typeof s.number==='string'&&Number.isSafeInteger(s.qty)&&s.qty>0)||!Array.isArray(r.skipIds)||!r.skipIds.every(salesRefId))throw new Error('Invalid production unbatch record.');
  /* Fully returned orders may be deleted; their existing Deleted event keeps
     the order identity while the PS and Unbatch journal remain historical. */
  if(Array.isArray(src.salesOrder)&&!src.salesOrder.some(o=>o.id===r.orderId)&&!(src.orderEvent||[]).some(e=>e&&e.orderId===r.orderId&&e.what==='Deleted'&&iso(e.at)&&e.at>=r.at))throw new Error('Unbatch order not found.');
  if(r.scanIds.some(id=>{const s=scans.get(id);return !s||!s.undoneAt||!r.pieces.includes(s.piece);} ))throw new Error('Unbatch scan not found.');
  ids.add(r.id);records.set(r.id,r);
 });
 (src.shipment||[]).forEach(s=>{
  if(s.unbatchedItems!=null&&!Array.isArray(s.unbatchedItems))throw new Error('Invalid unbatched shipment items.');
  (s.unbatchedItems||[]).forEach(i=>{const r=i&&records.get(i.unbatchId);if(!r||!Array.isArray(i.pieces)||!i.pieces.length||!i.pieces.every(p=>r.pieces.includes(p))||!r.shipments.some(p=>p.id===s.id)||i.orderId!==r.orderId||!salesRefId(i.lineId)||!Number.isSafeInteger(i.unit)||i.unit<1||!glassPieceValid(i.label)&&!unitIdValid(i.label))throw new Error('Invalid unbatched shipment item.');});
 });
}
