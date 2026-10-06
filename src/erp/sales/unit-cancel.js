/* =====================================================================
   erp/sales/unit-cancel  ·  Shipping PR 5, 6 октября 2026
   Hold units и Cancel units: клиент отказывается от части позиции.
   IN : заказ и строка в цеху · журнал сканов · цена строки (line-metrics)
   OUT: line.heldUnits [{id, pieces, at, reason}] · line.cancelledUnits (число)
        · o.cancellations [{id, at, by, lineId, reason, units:[{pieces, stage,
        heldAt, charge, glass, takenPs?, off?}], charge, chargeOverride}]
   Владелец, 5.10.2026: «линия 1 имеет 21 панель, клиент спустя 2 дня говорит:
   я не хочу 6 из них… за те, что только порезались, чарджим только за стекло
   и тот сервис, который был проделан; если стекло было закалено — он платит за
   весь путь и закалку; если это IGU — не платит за распорку и силикон».
   Не порезано — $0, и за стекло тоже. Цена — по работе ДО Hold: клиент сказал
   «стоп» во вторник, порезали в среду — платим мы.
   Какие юниты — выбирает система: непорезанные, потом те, что прошли меньше
   работ, закалённые, собранные — последними.
   qty строки не меняется и номера стёкол не перекладываются: заказано =
   qty − cancelledUnits. Юнит здесь — набор стёкол: собранный на станции
   слияния — как собран, несобранные лайты — по одному на лайт, от наименее
   продвинутых.
   ===================================================================== */
function unitAssert(ok,message){if(!ok)throw new Error(message);}
function unitCancelled(l){return Number.isSafeInteger(l&&l.cancelledUnits)&&l.cancelledUnits>0?l.cancelledUnits:0;}
function unitHeldSet(l){const s=new Set();(l&&l.heldUnits||[]).forEach(h=>(h.pieces||[]).forEach(p=>s.add(p)));return s;}
function unitCancelledSet(o){const s=new Set();(o&&o.cancellations||[]).forEach(c=>(c.units||[]).forEach(u=>(u.pieces||[]).forEach(p=>s.add(p))));return s;}
/* Стекло на станции: на Hold (возвращает запись) / отменено. */
function unitPieceHold(g){return g&&g.l&&(g.l.heldUnits||[]).find(h=>h.pieces.includes(g.id))||null;}
function unitPieceCancelled(g){return !!g&&!!g.o&&(g.o.cancellations||[]).some(c=>c.units.some(u=>u.pieces.includes(g.id)));}
function unitHeatStations(){return [salesRouteStationOf('tempering','HEAT'),salesRouteStationOf('heat_strengthening','HEAT')];}
const UNIT_STAGES=['uncut','cut','tempered','assembled'];
const UNIT_STAGE_LABEL={uncut:'Not cut',cut:'Cut',tempered:'Tempered',assembled:'Assembled'};
/* Свободные юниты строки — те, что ещё можно остановить или отменить: не
   отгружены, не в PS, не отменены и не на Hold. Порядок — решение 15.
   Стёкла на Hold в подбор пар не идут: иначе остановленный лайт вставал в
   пару к непорезанному соседу, и тот пропадал из выбора (найдено прогоном
   полного пути 6.10.2026 — вместо непорезанного юнита отменялся порезанный). */
function unitList(o,l){
 const comps=glassBatchComponents(o,l).filter(c=>!c.missing),map=glassPieceMap(o.id),index=stationPieceIndex(),batches=stationBatchIndex(),heat=unitHeatStations(),held=unitHeldSet(l);
 const gone=unitCancelledSet(o),onPs=new Set((DB.shipment||[]).filter(shippingActive).flatMap(s=>s.items).filter(i=>i.orderId===o.id&&i.lineId===l.id).flatMap(i=>i.pieces));
 const far=new Map(),live=id=>{
  if(!id||gone.has(id)||onPs.has(id)||held.has(id))return false;const g=stationGlass(id,index,batches);if(!g)return false;
  const p=stationPlace(g);if(p.broken||p.shipped)return false;far.set(id,p.far);return true;
 };
 const mu=stationUnitMerge(o,l),units=[],used=new Set();
 if(mu)stationAsms(o,l,mu,index).filter(a=>a.complete&&!a.broken).forEach(a=>{const pieces=[...a.lites.values()];pieces.forEach(p=>used.add(p));if(pieces.every(live))units.push({pieces,assembled:true});});
 const pools=comps.map(c=>{const rec=map.get(c.key),ids=rec?rec.ids.concat(...Object.values(rec.extra||{})).filter(Boolean):[];return ids.filter(id=>!used.has(id)&&live(id)).sort((a,b)=>far.get(a)-far.get(b)||a.localeCompare(b));});
 for(let k=0,n=Math.max(0,...pools.map(p=>p.length));k<n;k++){const pieces=pools.map(p=>p[k]).filter(Boolean);if(pieces.length)units.push({pieces,assembled:false});}
 units.forEach(u=>{
  const st=u.pieces.map(p=>{const sc=stationScansFor(p);return {n:sc.length,t:sc.some(s=>heat.includes(s.station))};});
  u.stage=u.assembled?'assembled':st.some(x=>x.t)?'tempered':st.some(x=>x.n)?'cut':'uncut';u.work=st.reduce((n,x)=>n+x.n,0);
 });
 return units.sort((a,b)=>UNIT_STAGES.indexOf(a.stage)-UNIT_STAGES.indexOf(b.stage)||a.work-b.work||a.pieces[0].localeCompare(b.pieces[0]));
}
/* Станция работы строки по ключу её начисления. Пусто — неизвестна: такую
   работу считаем только у закалённого или собранного стекла (в пользу клиента). */
function unitRowStation(row){
 const p=String(row&&row.key||'').split(':');
 if(p[0]==='EDGE')return salesRouteStationOf(p[1]==='bevel'?'bevel:'+p[2]:p[1],'');
 if(p[0]==='MI')return p[1]==='hole'?salesRouteStationOf('hole:'+p[2],''):salesRouteStationOf(p[1],salesRouteStationOf('hinge',''));
 if(p[0]==='FEATURE'){const k=String(p[1]||'');return k==='radius'?salesRouteStationOf('radiusCorner',''):k==='cutout'?salesRouteStationOf('cutout',''):k==='notch-cnc'?salesRouteStationOf('notchCnc',''):k==='notch-hand'?salesRouteStationOf('notchHand',''):k.indexOf('sandblast')===0?salesRouteStationOf('sandblasting',''):'';}
 if(p[0]==='HEATSOAK')return salesRouteStationOf('heat_soak','');
 return '';
}
/* Сколько стоит отменить юнит: работа по сканам до at. charge null — цена
   строки неполная, сумму вводит продавец. */
function unitCharge(o,l,u,at){return finWithOrder(o,()=>{
 const p=salesLineCommercialPrice(l,o),heat=unitHeatStations(),index=stationPieceIndex(),comps=glassBatchComponents(o,l).filter(c=>!c.missing);
 const seen=u.pieces.map(id=>{const all=stationScansFor(id),before=all.filter(s=>!at||s.at<=at);return {id,c:comps.find(c=>c.key===(index.get(id)||{}).key)||null,scans:before,after:all.length>before.length,tempered:before.some(s=>heat.includes(s.station))};});
 const after=seen.some(x=>x.after),mu=stationUnitMerge(o,l),joined=!!mu&&seen.length>0&&seen.every(x=>x.scans.some(s=>s.station===mu&&s.unit));
 const stage=joined?'assembled':seen.some(x=>x.tempered)?'tempered':seen.some(x=>x.scans.length)?'cut':'uncut';
 if(stage==='uncut')return {stage,after,charge:0,glass:0,works:0};
 if(!p.complete)return {stage,after,charge:null,glass:null,works:null};
 if(joined)return {stage,after,charge:p.unit,glass:null,works:null};
 /* Стекло: порезано — цена отожжённого, прошло печь — цена закалённого. */
 const area=p.areas.billable,money=v=>v==null?null:+v,lam=salesRouteStationOf('lamination','LAM'),glued=new Set();let glass=0,known=true;
 seen.forEach(x=>{
  if(!x.c||!x.scans.length)return;const spec=x.c.spec||{},g=glassProductById(spec.glassProductId);
  /* Плиты уже склеены — лайт идёт целиком, с плёнкой. */
  if(x.c.ply){const plies=seen.filter(y=>y.c&&y.c.paneId===x.c.paneId);
   if(plies.length>1&&plies.every(y=>y.scans.some(s=>s.station===lam&&s.joined))){if(glued.has(x.c.paneId))return;glued.add(x.c.paneId);const v=x.c.pane.priceOverride!=null?x.c.pane.priceOverride:salesPaneCatalogPrice(x.c.pane);if(v==null)known=false;else glass+=v*area;return;}}
  const full=x.c.ply?salesPlyPrice(spec):(x.c.pane.priceOverride!=null?x.c.pane.priceOverride:salesPaneCatalogPrice(x.c.pane));
  /* Цену продавца не превышаем: отожжённое по прайсу — не дороже цены лайта в заказе. */
  const rate=x.tempered||full==null?money(full):money(g&&g.salePriceAnnealed!=null?Math.min(g.salePriceAnnealed,full):full);
  if(rate==null)known=false;else glass+=rate*area;
 });
 if(!known)return {stage,after,charge:null,glass:null,works:null};
 /* Работы строки — доля стёкол юнита, прошедших станцию этой работы до at. */
 let works=0;const allTempered=seen.every(x=>x.tempered);
 salesLineChargeRows(l).forEach(row=>{
  const rate=salesChargePricingState(l,row).effectiveRate;if(rate==null)return;
  const station=unitRowStation(row),share=station?seen.filter(x=>x.scans.some(s=>s.station===station)).length/seen.length:allTempered?1:0;
  works+=row.basis*rate*share;
 });
 const rules=salesMetricRules(o),base=salesMoney(glass+works);let running=base;
 p.adjustments.forEach(a=>{running=salesMoney(running+salesMoney((rules.combination==='compound'?running:base)*a.percent/100));});
 return {stage,after,charge:running,glass:salesMoney(glass),works:salesMoney(works)};
});}
function unitLine(orderId,lineId){
 const o=salesRecord(orderId),l=o&&(o.lines||[]).find(x=>x.id===lineId);
 unitAssert(o&&l&&!salesIsQuote(o)&&!['closed','cancelled'].includes(o.status),'This order cannot change.');return {o,l};
}
function unitLineNo(o,l){return 'line '+(o.lines.indexOf(l)+1);}
function unitHoldable(o,l){return unitList(o,l);}
function unitHold(orderId,lineId,count,reason){return storageCommand(()=>{
 const {o,l}=unitLine(orderId,lineId),n=Math.floor(+count),why=String(reason||'').trim().slice(0,200);
 unitAssert(Number.isSafeInteger(n)&&n>0,'Enter how many units.');unitAssert(why,'Enter a reason for the hold.');
 const free=unitHoldable(o,l);unitAssert(n<=free.length,free.length?'Only '+shippingCount(free.length,'unit')+' can be held.':'No units left to hold.');
 const now=new Date().toISOString();l.heldUnits=(l.heldUnits||[]).concat(free.slice(0,n).map(u=>({id:salesUid('HU'),pieces:u.pieces.slice(),at:now,reason:why})));
 o.updatedAt=now;orderLogPush(o,'Units on hold',unitLineNo(o,l)+' · '+shippingCount(n,'unit')+' · '+why);shippingSyncOrder(o,now);salesSyncRecordLifecycle(o);return l;
});}
function unitRelease(orderId,lineId){return storageCommand(()=>{
 const {o,l}=unitLine(orderId,lineId),n=(l.heldUnits||[]).length;unitAssert(n,'No units on hold.');
 const now=new Date().toISOString();delete l.heldUnits;o.updatedAt=now;orderLogPush(o,'Hold released',unitLineNo(o,l)+' · '+shippingCount(n,'unit'));shippingSyncOrder(o,now);salesSyncRecordLifecycle(o);return l;
});}
/* Что будет отменено: сначала юниты на Hold (цена — по их времени Hold),
   потом остальные по порядку выбора (цена — на сейчас). */
function unitCancelPlan(o,l,count,now){
 const held=(l.heldUnits||[]).map(h=>({pieces:h.pieces.slice(),heldAt:h.at})),rest=unitHoldable(o,l).map(u=>({pieces:u.pieces,heldAt:''}));
 const all=held.concat(rest);
 return {max:all.length,units:all.slice(0,Math.max(0,Math.floor(+count)||0)).map(u=>Object.assign(u,unitCharge(o,l,u,u.heldAt||now)))};
}
const UNIT_GLASS=['scrap','customer','stock'];
function unitChargeOf(c){return c.chargeOverride!=null?c.chargeOverride:c.charge;}
/* opts: glass — что делать со стеклом порезанных юнитов; chargeOverride —
   сумма продавца (обязательна, когда цена строки неполная). */
function unitCancel(orderId,lineId,count,reason,opts){return storageCommand(()=>{
 opts=opts||{};const {o,l}=unitLine(orderId,lineId),n=Math.floor(+count),why=String(reason||'').trim().slice(0,200),now=new Date().toISOString();
 unitAssert(Number.isSafeInteger(n)&&n>0,'Enter how many units.');unitAssert(why,'Enter a reason.');
 const plan=unitCancelPlan(o,l,n,now);unitAssert(n<=plan.max,plan.max?'Only '+shippingCount(plan.max,'unit')+' can be cancelled.':'No units left to cancel.');
 const glass=UNIT_GLASS.includes(opts.glass)?opts.glass:'scrap',heat=unitHeatStations();
 unitAssert(glass!=='stock'||!plan.units.some(u=>u.pieces.some(p=>stationScansFor(p).some(s=>heat.includes(s.station)))),'Tempered glass cannot go to stock.');
 const override=opts.chargeOverride===''||opts.chargeOverride==null?null:salesNonNegOrNull(opts.chargeOverride);
 unitAssert(opts.chargeOverride===''||opts.chargeOverride==null||override!=null,'Check the charge.');
 const known=plan.units.every(u=>u.charge!=null),charge=known?salesMoney(plan.units.reduce((s,u)=>s+u.charge,0)):null;
 unitAssert(charge!=null||override!=null,'Pricing is not complete. Enter the charge.');
 const pieces=new Set(plan.units.flatMap(u=>u.pieces)),who=orderLogActor();
 const rec={id:salesUid('CU'),at:now,by:who.by||'',lineId:l.id,reason:why,units:plan.units.map(u=>({pieces:u.pieces.slice(),stage:u.stage,heldAt:u.heldAt||'',charge:u.charge,glass:u.stage==='uncut'?'':glass})),charge,chargeOverride:override};
 /* Порезанное в сток: размер реза и стекло каждого лайта. */
 if(glass==='stock'){const index=stationPieceIndex(),comps=glassBatchComponents(o,l);rec.units.forEach(u=>{if(!u.glass)return;u.pieces.forEach(id=>{
  if(!stationScansFor(id).length)return;const h=index.get(id),c=h&&comps.find(x=>x.key===h.key);if(!c||c.missing)return;
  let d=null;try{d=finWithOrder(o,()=>stkGlassData('production',o,l,c,h.unit,{}));}catch(e){d=null;}const size=d&&(d.cut||d.finished);
  if(size)stockOffcutAdd({glass:c.glass,mm:+(c.spec&&c.spec.thicknessMm)||0,w:size.w,h:size.h,at:now});
 });});}
 o.cancellations=(o.cancellations||[]).concat(rec);l.cancelledUnits=unitCancelled(l)+rec.units.length;
 const held=(l.heldUnits||[]).filter(h=>!h.pieces.some(p=>pieces.has(p)));if(held.length)l.heldUnits=held;else delete l.heldUnits;
 glassBatchCancelPieces([...pieces],now);
 o.updatedAt=now;orderLogPush(o,'Units cancelled',unitLineNo(o,l)+' · '+shippingCount(rec.units.length,'unit')+' · '+why);
 shippingSyncOrder(o,now);salesSyncRecordLifecycle(o);return rec;
});}
function unitSetCharge(orderId,cancelId,value){return storageCommand(()=>{
 const o=salesRecord(orderId),c=o&&(o.cancellations||[]).find(x=>x.id===cancelId);unitAssert(o&&c&&!['closed','cancelled'].includes(o.status),'This order cannot change.');
 const v=value===''||value==null?null:salesNonNegOrNull(value);unitAssert(value===''||value==null||v!=null,'Check the charge.');unitAssert(v!=null||c.charge!=null,'Pricing is not complete. Enter the charge.');
 c.chargeOverride=v;o.updatedAt=new Date().toISOString();orderLogPush(o,'Cancellation charge',finFmt(unitChargeOf(c)));salesSyncRecordLifecycle(o);return c;
});}
/* Стекло, которое клиент забирает: ждёт следующего PS этого заказа. */
function unitTakes(o){
 return (o&&o.cancellations||[]).flatMap(c=>{const n=c.units.filter(u=>u.glass==='customer'&&!u.takenPs).reduce((s,u)=>s+u.pieces.length,0),l=(o.lines||[]).find(x=>x.id===c.lineId);return n&&l?[{c,l,line:o.lines.indexOf(l)+1,pieces:n}]:[];});
}
/* Отменённое стекло на скиде (аудит Shipping, 6.10.2026): из содержимого скида
   система убирает его сразу, а физически оно лежит там, пока его не снимут.
   Снятие — скан его стикера на станции отгрузки (u.off — снятые стёкла); до
   этого скид на SHIP не грузится. Стекло, которое забирает клиент, едет с PS. */
function unitCancelOf(o,piece){for(const c of (o&&o.cancellations||[]))for(const u of c.units)if(u.pieces.includes(piece))return u;return null;}
function unitPieceSkid(piece){
 const s=stationScansFor(piece).sort((a,b)=>String(a.at).localeCompare(String(b.at))||String(a.id).localeCompare(String(b.id))).pop();
 return s&&/^S[LA]-/.test(s.on||'')?s.on:'';
}
function unitOnSkid(skid){
 return (DB.salesOrder||[]).flatMap(o=>(o.cancellations||[]).flatMap(c=>c.units.filter(u=>u.glass!=='customer').map(u=>({o,u,pieces:u.pieces.filter(p=>!(u.off||[]).includes(p)&&unitPieceSkid(p)===skid)})))).filter(x=>x.pieces.length);
}
/* Собранный IGU снимают целиком: скан любого его стекла снимает все. */
function unitTakeOff(piece){return storageCommand(()=>{
 const g=stationGlass(piece),u=g&&unitCancelOf(g.o,piece),skid=unitPieceSkid(piece);
 unitAssert(u&&u.glass!=='customer'&&skid&&!(u.off||[]).includes(piece),'Nothing to take off.');
 const joined=p=>stationScansFor(p).some(s=>s.unit),pieces=joined(piece)?u.pieces.filter(p=>joined(p)&&unitPieceSkid(p)===skid):[piece];
 u.off=[...new Set((u.off||[]).concat(pieces))];g.o.updatedAt=new Date().toISOString();
 orderLogPush(g.o,'Taken off '+skid,pieces.join(', '));salesSyncRecordLifecycle(g.o);return {skid,pieces};
});}
function unitTakesShipped(o,psId){(o&&o.cancellations||[]).forEach(c=>c.units.forEach(u=>{if(u.glass==='customer'&&!u.takenPs)u.takenPs=psId;}));}
function unitTakesRolledBack(psId){(DB.salesOrder||[]).forEach(o=>(o.cancellations||[]).forEach(c=>c.units.forEach(u=>{if(u.takenPs===psId)delete u.takenPs;})));}
function normalizeUnitFields(line,src){
 const ids=v=>Array.isArray(v)?v.filter(glassPieceValid):[],iso=v=>typeof v==='string'&&!isNaN(Date.parse(v));
 const held=(Array.isArray(src.heldUnits)?src.heldUnits:[]).filter(h=>h&&typeof h==='object'&&ids(h.pieces).length&&iso(h.at)).map(h=>({id:salesEntityId(h.id,'HU'),pieces:ids(h.pieces),at:h.at,reason:salesString(h.reason).slice(0,200)}));
 if(held.length)line.heldUnits=held;
 if(Number.isSafeInteger(src.cancelledUnits)&&src.cancelledUnits>0)line.cancelledUnits=Math.min(src.cancelledUnits,line.qty);
 return line;
}
function normalizeCancellations(list,lines){
 const ids=v=>Array.isArray(v)?v.filter(glassPieceValid):[],iso=v=>typeof v==='string'&&!isNaN(Date.parse(v)),money=v=>v==null?null:salesNonNegOrNull(v);
 return (Array.isArray(list)?list:[]).filter(c=>c&&typeof c==='object'&&iso(c.at)&&lines.some(l=>l.id===c.lineId)&&Array.isArray(c.units)&&c.units.length).map(c=>({id:salesEntityId(c.id,'CU'),at:c.at,by:salesString(c.by).slice(0,80),lineId:c.lineId,reason:salesString(c.reason).slice(0,200),
  units:c.units.filter(u=>u&&typeof u==='object').map(u=>{const pieces=ids(u.pieces),off=ids(u.off).filter(p=>pieces.includes(p));return Object.assign({pieces,stage:UNIT_STAGES.includes(u.stage)?u.stage:'uncut',heldAt:iso(u.heldAt)?u.heldAt:'',charge:money(u.charge),glass:UNIT_GLASS.includes(u.glass)?u.glass:''},salesRefId(u.takenPs)?{takenPs:u.takenPs}:{},off.length?{off}:{});}),
  charge:money(c.charge),chargeOverride:money(c.chargeOverride)}));
}
