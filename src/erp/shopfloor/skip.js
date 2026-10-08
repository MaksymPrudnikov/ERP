/* =====================================================================
   erp/shopfloor/skip  ·  skip-1.0
   Skip — ручной проход стекла по станциям из офиса. Владелец, 7 октября
   2026: «клиенты приходят в субботу и забирают заказ, когда никто не
   выдаёт пакинг слип… координатор говорит: приходил ABS и забрал этот
   заказ — его нужно скипнуть от cutting по выдали»; «максимально
   флексибл: клиент может забрать одно стекло из большого заказа»; «от
   создания заказа до выдачи полностью»; «в субботу стекло могут порезать
   со стока и выдать клиенту». Делают только админ (раздел Users) и
   акаунтинг (раздел Finance).
   Каждая отметка — настоящая запись журнала станций: manual, «Skip · кто»,
   общий actionId — «где стекло» остаётся правдой. Picked up — PS
   самовывоза этим днём, выданный. Undo снимает весь Skip разом.
   IN : заказ; выбор — строки с количеством, Glass ID / U-, товар со склада;
        куда (Picked up или станция); день; причина; кто забрал
   OUT: DB.skip {id, orderId, at, date, to, reason, receivedBy, by, byId,
        actionId, pieces, shipments, status, eventId, undoneAt, undoneBy}
   ===================================================================== */
DEFAULT.skip=[];
const SKIP_PICKUP='pickup';
function skipAllowed(){return typeof accessCan==='function'&&(accessCan('users')||accessCan('finance'));}
function skipFind(id){return (DB.skip||[]).find(s=>s&&s.id===id)||null;}
function skipCanOpen(o){return !!o&&!salesIsQuote(o)&&!['closed','cancelled'].includes(o.status)&&!!salesRecord(o.id);}
function skipForOrder(orderId){return (DB.skip||[]).filter(s=>s&&s.orderId===orderId);}
/* Индексы на один расчёт: Skip смотрит на сотни стёкол заказа. */
function skipCtx(){
 const scans=new Map(),onPs=new Set();
 (DB.stationScan||[]).forEach(s=>{if(s.undoneAt)return;if(!scans.has(s.piece))scans.set(s.piece,[]);scans.get(s.piece).push(s);});
 (DB.shipment||[]).filter(shippingActive).forEach(s=>s.items.forEach(i=>i.pieces.forEach(p=>onPs.add(p))));
 return {index:stationPieceIndex(),batches:stationBatchIndex(),scans,onPs,used:new Set(),taken:new Map()};
}
/* Стекло, которое можно провести: живое, не уехало, не на другом PS. */
function skipPiece(id,ctx){
 const g=stationGlass(id,ctx.index,ctx.batches);if(!g||!g.c||g.c.missing||unitPieceCancelled(g)||ctx.onPs.has(id))return null;
 const p=stationPlace(g,ctx.scans.get(id)||[]);return p.broken||p.shipped?null:{id,g,p};
}
/* Свободные стёкла лайта строки, дальше всех прошедшие — первыми. */
function skipFree(o,l,key,ctx){
 const rec=glassPieceMap(o.id).get(key),ids=rec?rec.ids.concat(...Object.values(rec.extra||{})).filter(Boolean):[];
 return ids.map(id=>skipPiece(id,ctx)).filter(x=>x&&!ctx.used.has(x.id)).sort((a,b)=>b.p.far-a.p.far||a.id.localeCompare(b.id));
}
/* Открытая сборка стекла на станции слияния (LAM, IGU): её стёкла едут вместе. */
function skipOpenAsm(id,ctx){
 const s=(ctx.scans.get(id)||[]).find(x=>x.asm&&!x.unit&&!x.joined);if(!s)return [];
 return (DB.stationScan||[]).filter(x=>!x.undoneAt&&x.asm===s.asm&&x.piece!==id).map(x=>x.piece);
}
/* Юнит — стёкла всех лайтов (у ламината — обе плиты). Сначала собранные
   юниты, потом начатые сборки, потом — из отдельных стёкол. first — стекло,
   с которого юнит начинается (Glass ID из окна). */
function skipLineUnits(o,l,want,ctx,first){
 /* Не больше, чем штук в строке: стекла (с Recut) бывает больше, чем юнитов. */
 const ps=(DB.shipment||[]).filter(shippingActive).flatMap(s=>s.items).filter(i=>i.orderId===o.id&&i.lineId===l.id).length;
 want=Math.min(want,shippingLineQty(l)-ps-(ctx.taken.get(l.id)||0));
 const keys=stationLineKeys(o,l),units=[];if(!keys.length||want<1)return units;
 const mu=stationUnitMerge(o,l),take=u=>{u.pieces.forEach(id=>ctx.used.add(id));ctx.taken.set(l.id,(ctx.taken.get(l.id)||0)+1);units.push(u);};
 if(keys.length===1){
  (first?[first]:skipFree(o,l,keys[0],ctx)).some(x=>{if(units.length>=want)return true;take({lineId:l.id,pieces:[x.id]});return false;});
  return units;
 }
 /* Собранный юнит (U-) — целиком, если ни одно его стекло не уехало. */
 const whole=a=>{const ids=[...a.lites.values()];return ids.every(id=>!ctx.used.has(id)&&skipPiece(id,ctx))?{lineId:l.id,pieces:ids}:null;};
 const asms=mu?stationAsms(o,l,mu,ctx.index).filter(a=>a.complete&&!a.broken):[];
 const build=start=>{
  const u={lineId:l.id,pieces:[]},has=new Set(),add=x=>{if(!x||u.pieces.includes(x.id))return;u.pieces.push(x.id);has.add(x.g.c.key);skipOpenAsm(x.id,ctx).forEach(m=>{const y=skipPiece(m,ctx);if(y&&!ctx.used.has(y.id)&&!has.has(y.g.c.key)&&keys.includes(y.g.c.key)){u.pieces.push(y.id);has.add(y.g.c.key);}});};
  if(start)add(start);
  for(const k of keys){if(has.has(k))continue;const x=skipFree(o,l,k,ctx).find(x=>!u.pieces.includes(x.id)&&(typeof stationDrawingFits!=='function'||u.pieces.every(id=>{const h=ctx.index.get(id);return !h||stationDrawingFits(o,l,h,{key:k,unit:x.g.unit});})));if(!x)return null;add(x);}
  return keys.every(k=>has.has(k))?u:null;
 };
 if(first){
  const a=asms.find(a=>[...a.lites.values()].includes(first.id)),u=a?whole(a):build(first);if(u)take(u);return units;
 }
 asms.forEach(a=>{if(units.length>=want)return;const u=whole(a);if(u)take(u);});
 while(units.length<want){const u=build(null);if(!u)break;take(u);}
 return units;
}
/* Выбор из окна → юниты. d.lines {lineId: число | 'all'}, d.codes — G-/U-. */
function skipPick(o,d,ctx){
 const units=[],problems=[];
 (d.codes||[]).map(c=>String(c||'').trim().toUpperCase()).filter(Boolean).forEach(code=>{
  const hit=glassLookup(code);if(!hit||hit.orderId!==o.id){problems.push(code+' is not in this order');return;}
  const l=(o.lines||[]).find(x=>x.id===hit.lineId);if(!l){problems.push(code+' is not in this order');return;}
  if(hit.kind==='unit'){
   const mu=stationUnitMerge(o,l),a=mu&&stationAsms(o,l,mu,ctx.index).find(x=>x.unit===hit.unit&&!x.broken);
   const ids=a?[...a.lites.values()]:[];if(!ids.length||ids.some(id=>ctx.used.has(id)||!skipPiece(id,ctx))){problems.push(code+' is not assembled or already shipped');return;}
   ids.forEach(id=>ctx.used.add(id));units.push({lineId:l.id,pieces:ids});return;
  }
  const x=!ctx.used.has(code)&&skipPiece(code,ctx);if(!x){problems.push(code+' is shipped, broken or already picked');return;}
  const got=skipLineUnits(o,l,1,ctx,x);if(!got.length){problems.push(code+': its other lites are not available');return;}
  units.push(...got);
 });
 (o.lines||[]).forEach((l,i)=>{
  const v=d.lines&&d.lines[l.id];if(v==null||v===''||v===0)return;
  const want=v==='all'?Infinity:Math.floor(+v);if(!(want>0)){problems.push('Line '+(i+1)+': check the quantity');return;}
  const got=skipLineUnits(o,l,want,ctx);
  if(want!==Infinity&&got.length<want)problems.push('Line '+(i+1)+': only '+got.length+' of '+want+' can be skipped');
  units.push(...got);
 });
 return {units,problems};
}
/* Сколько юнитов строки ещё можно провести — для окна. */
function skipLineLeft(o,l){return skipLineUnits(o,l,Infinity,skipCtx()).length;}
/* Сборка на станции слияния: стекло встаёт к стёклам своего юнита. */
function skipWantAsm(u,g,station){
 const keys=stationAssemblyKeys(g,station),index=stationPieceIndex();
 for(const id of u.pieces){
  if(id===g.id)continue;
  const s=stationScansFor(id).find(x=>x.station===station&&x.asm&&!x.unit&&!x.joined),h=s&&index.get(id);
  if(h&&keys.includes(h.key))return s.asm;
 }
 return 'new';
}
/* Ручные отметки: по шагу маршрута за проход, пока стекло не дошло до
   target включительно. Сборка ждёт своих стёкол — следующий проход. */
function skipRecord(units,target,at,who,skip){
 const lam=salesRouteStationOf('lamination','LAM');
 for(let pass=0;pass<200;pass++){
  let moved=false;
  units.forEach(u=>u.pieces.forEach(id=>{
   const g=stationGlass(id);if(!g||!g.c)return;const p=stationPlace(g);
   if(p.broken||p.shipped||!p.waiting||p.assembling)return;
   const ti=p.route.lastIndexOf(target),wi=p.route.indexOf(p.waiting,p.far+1);if(ti<0||wi<0||wi>ti)return;
   const st=p.waiting,mu=stationUnitMerge(g.o,g.l),merge=st===mu||st===lam&&!!g.c.ply;
   const rec=stationRecordCommand(st,{kind:'ok',code:id,g},who,{deferTouch:true,manual:true,now:at,actionId:skip.actionId||undefined,asm:merge?skipWantAsm(u,g,st):undefined});
   if(!rec)throw new Error('Skip was not recorded.');
   if(!skip.actionId)skip.actionId=rec.actionId;moved=true;
  }));
  if(!moved)break;
 }
 const stuck=units.filter(u=>u.pieces.some(id=>{const g=stationGlass(id),p=g&&stationPlace(g);if(!p||p.broken)return true;const ti=p.route.lastIndexOf(target);return ti>=0&&!p.shipped&&p.far<ti;}));
 if(stuck.length)throw new Error(shippingCount(stuck.length,'unit')+' could not be moved to '+target+'.');
}
function skipAt(date){return date===finToday()?new Date().toISOString():new Date(date+'T12:00:00').toISOString();}
/* d: {orderId, lines, codes, extras {extraId: qty}, to, date, reason, receivedBy}. */
function skipRun(d){
 if(!skipAllowed())return {error:'Only Users or Finance can skip.'};
 const out=storageCommand(()=>skipCommand(d));
 return out.ok?out.value:{error:out.error};
}
function skipCommand(d){
 const o=salesRecord(d&&d.orderId);shippingAssert(skipCanOpen(o),'Skip is not available for this order.');
 shippingAssert(!o.onHold,'Order is On Hold. Release it first.');
 const date=String(d.date||finToday());shippingAssert(shippingDateValid(date)&&date<=finToday(),'Check the date.');
 const stations=shippingStations(),to=d.to===SKIP_PICKUP||!d.to?SKIP_PICKUP:sfCode(d.to),target=to===SKIP_PICKUP?stations.ready:to;
 shippingAssert(target&&(DB.station||[]).some(s=>s.code===target),'Choose where to skip to.');
 const ctx=skipCtx(),pick=skipPick(o,d,ctx),extras=Object.keys(d.extras||{}).map(extraId=>({orderId:o.id,extraId,qty:Math.floor(+d.extras[extraId])})).filter(x=>x.qty>0);
 shippingAssert(!pick.problems.length,pick.problems.join('. ')+'.');
 shippingAssert(pick.units.length||to===SKIP_PICKUP&&extras.length,'Choose what to skip.');
 shippingAssert(!extras.length||to===SKIP_PICKUP,'Stock items can only be picked up.');
 pick.units.forEach(u=>{const l=(o.lines||[]).find(x=>x.id===u.lineId);shippingAssert(l&&!l.onHold&&!u.pieces.some(id=>unitPieceHold(stationGlass(id))),'Line '+((o.lines||[]).indexOf(l)+1)+' is On Hold. Release it first.');});
 const at=skipAt(date),pieces=pick.units.flatMap(u=>u.pieces);
 /* Отметка не может стать раньше уже сделанного скана этого стекла. */
 const late=pieces.find(id=>(ctx.scans.get(id)||[]).some(s=>String(s.at)>at));
 shippingAssert(!late,'Glass '+(late||'')+' was scanned after this date. Pick a later date.');
 const actor=orderLogActor(),who={id:actor.byId,name:('Skip · '+(actor.by||'Office')).slice(0,80)};
 const skip={id:salesUid('SK'),orderId:o.id,at:new Date().toISOString(),date,to,reason:String(d.reason||'').trim().slice(0,200),receivedBy:String(d.receivedBy||'').trim().slice(0,100),
  by:actor.by||'',byId:actor.byId||'',actionId:'',pieces,shipments:[],status:o.status,eventId:'',undoneAt:'',undoneBy:''};
 /* «От создания заказа»: Skip сам себе Verify. */
 if(o.status==='new'){o.status='verified';o.statusDates=Object.assign({},o.statusDates,{verified:at});salesSyncRecordLifecycle(o);}
 skipRecord(pick.units,target,at,who,skip);
 if(to===SKIP_PICKUP){
  const sel=new Set(pieces),items=shippingAvailable(o).filter(i=>i.pieces.length&&i.pieces.every(p=>sel.has(p))).map(shippingItem);
  shippingAssert(items.length===pick.units.length,'Some units are not ready to pick up.');
  const made=shippingCreate({customerId:o.customerId,method:'pickup',shipTo:{},date,items,extras,note:('Skip'+(skip.reason?' · '+skip.reason:'')).slice(0,1000)});shippingAssert(made.ok,made.error);
  const s=made.value;s.skip=skip.id;skip.shipments.push(s.id);
  const sent=shippingMarkShipped(s.id,undefined,at);shippingAssert(sent.ok,sent.error);
  /* Отметки SHIP этого PS — тоже Skip, а не скан у ворот. */
  (s.scanIds||[]).forEach(sid=>{const r=(DB.stationScan||[]).find(x=>x.id===sid);if(r)r.by=who.name;});
  const got=shippingMarkDelivered(s.id,skip.receivedBy,date);shippingAssert(got.ok,got.error);
 }
 shippingSyncOrder(o,at);
 const ps=skip.shipments.map(id=>shippingFind(id)).filter(Boolean).map(s=>s.number);
 const e=orderLogPush(o,'Skipped',[pieces.length+' glass','→ '+(to===SKIP_PICKUP?'Picked up':to),date,skip.reason,skip.receivedBy?'by '+skip.receivedBy:'',ps.join(', ')].filter(Boolean).join(' · '));
 skip.eventId=e?e.id:'';
 (DB.skip||(DB.skip=[])).push(skip);
 return skip;
}
/* Undo — весь Skip разом: его PS назад (выдан → отгружен → отменён), его
   отметки станций сняты, заказ — в прежний статус, если он был New. */
function skipUndo(id){
 if(!skipAllowed())return {error:'Only Users or Finance can undo a skip.'};
 const out=storageCommand(()=>skipUndoCommand(id));
 return out.ok?out.value:{error:out.error};
}
function skipUndoCommand(id){
 const k=skipFind(id);shippingAssert(k&&!k.undoneAt,'Skip not found.');
 const o=salesRecord(k.orderId);shippingAssert(o,'Order not found.');
 k.shipments.slice().reverse().forEach(sid=>{
  const s=shippingFind(sid);if(!s||s.status==='cancelled')return;
  [['delivered','receipt'],['shipped','dispatch'],['planned','cancel']].forEach(([st,action])=>{if(s.status!==st)return;const r=shippingRevert(s.id,action);shippingAssert(r.ok,r.error);});
 });
 const group=(DB.stationScan||[]).filter(s=>k.actionId&&s.actionId===k.actionId&&!s.undoneAt);
 const later=group.find(r=>stationScansFor(r.piece).some(s=>!group.includes(s)&&String(s.at)>=String(r.at)&&String(s.id)>String(r.id)));
 shippingAssert(!later,'Glass '+(later?later.piece:'')+' has moved on. Undo the later scans first.');
 const now=new Date().toISOString(),cut=stationCutCode(),who=orderLogActor();
 group.forEach(r=>{
  r.undoneAt=now;r.undoneBy=('Undo skip · '+(who.by||'Office')).slice(0,80);stationAsmReopen(r);
  if(r.station===cut&&!stationScansFor(r.piece).some(s=>s.station===cut)){
   const e=stationBatchIndex().get(r.piece);
   if(e&&e.item.cutStartedAt===r.at){e.item.cutStartedAt='';const oo=salesRecord(e.part.orderId),l=oo&&(oo.lines||[]).find(x=>x.id===e.part.lineId);if(oo&&l)glassBatchSyncLine(oo,l);}
  }
 });
 shippingSyncOrder(o,now,{reopen:true});
 if(k.status==='new'&&o.status==='verified'){o.status='new';o.statusDates={new:(o.statusDates||{}).new||o.createdAt||now};o.updatedAt=now;salesSyncRecordLifecycle(o);}
 k.undoneAt=now;k.undoneBy=who.by||'Office';
 orderLogPush(o,'Skip undone',[shippingCount(group.length,'mark'),k.date].join(' · '));
 return k;
}
function normalizeSkips(){
 if(!Array.isArray(DB.skip))DB.skip=[];
 const ids=new Set(),s=v=>typeof v==='string'?v:'';
 DB.skip=DB.skip.filter(k=>k&&typeof k==='object'&&salesRefId(k.id)&&!ids.has(k.id)&&salesRefId(k.orderId)&&(ids.add(k.id),true)).map(k=>({id:k.id,orderId:k.orderId,at:s(k.at),date:s(k.date),to:s(k.to)||SKIP_PICKUP,reason:s(k.reason).slice(0,200),receivedBy:s(k.receivedBy).slice(0,100),
  by:s(k.by).slice(0,80),byId:s(k.byId),actionId:STATION_SCAN_ID_RE.test(s(k.actionId))?k.actionId:'',pieces:(Array.isArray(k.pieces)?k.pieces:[]).filter(glassPieceValid),shipments:(Array.isArray(k.shipments)?k.shipments:[]).filter(salesRefId),
  status:s(k.status),eventId:s(k.eventId),undoneAt:s(k.undoneAt),undoneBy:s(k.undoneBy).slice(0,80)}));
}
function validateSkipPayload(src){
 if(src.skip==null)return;
 if(!Array.isArray(src.skip))throw new Error('The "skip" field must be an array.');
 const ids=new Set();src.skip.forEach(k=>{if(!k||typeof k!=='object'||!salesRefId(k.id)||ids.has(k.id)||!salesRefId(k.orderId))throw new Error('Invalid skip record.');ids.add(k.id);});
}
