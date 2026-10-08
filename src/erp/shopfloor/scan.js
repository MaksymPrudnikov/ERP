/* =====================================================================
   erp/shopfloor/scan  ·  scan-1.0
   Журнал сканов станций и «где стекло ждёт».
   IN : DB.glassPiece · DB.glassBatch · маршрут стекла (stkRoute)
   OUT: DB.stationScan — {id, at, piece, station, by, byId, manual,
        undoneAt, undoneBy[, on, confirmedAt, asm, unit, broken, park, recut,
        reason]} · DB.sheetBreak
   confirmedAt — станцию не отсканировали, работу подтвердил рабочий следующей.
   asm, unit — сборка юнита на IGU и номер собранного юнита (ниже).
   park — стекло вынули из сборки: пара ушла в Recut, оно ждёт на долли.
   on — долли или скид, на которую положили стекло (erp/shopfloor/carriers).
   Правило: место стекла НЕ хранится, а считается: последний скан +
   маршрут = станция, на которой стекло ждёт. Так было и в Spil —
   «с батча попало на рез и находится в ожидании на следующей станции»
   (владелец, 29 сентября 2026). Запись одна на событие: это готовая
   строка будущей таблицы базы, переезд с localStorage её не меняет.

   Отмена скана (Undo) запись не удаляет, а помечает: журнал — история,
   и «кто отсканировал по ошибке» тоже её часть.
   ===================================================================== */
DEFAULT.productionRoute=[];DEFAULT.stationScan=[];DEFAULT.stationScanSeq=0;DEFAULT.sheetBreak=[];
const STATION_SCAN_ID_RE=/^SC-\d{7,}$/;
/* Что записывается, а что только показывается. On Hold записывается: на CUT
   стекло сканируют уже порезанным, и факт реза не отменить — рабочий
   откладывает стекло в сторону. */
const STATION_RECORDED=['ok','hold'];

function stationScanNextId(){
 DB.stationScanSeq=(Number.isSafeInteger(DB.stationScanSeq)&&DB.stationScanSeq>0?DB.stationScanSeq:0)+1;
 return 'SC-'+String(DB.stationScanSeq).padStart(7,'0');
}
/* Станция резки — та, что стоит у работы «cutting». Её скан и есть «резка
   началась» у стекла: поле cutStartedAt ждало этого события с PR #84. */
function stationCutCode(){return typeof salesRouteStationOf==='function'?salesRouteStationOf('cutting','CUT'):'CUT';}
function stationScansFor(piece){return (DB.stationScan||[]).filter(s=>s.piece===piece&&!s.undoneAt);}
/* Номер с клавиатуры: хватает цифр — «1234» это G-0001234. Повреждённый
   стикер не читается, а набирать весь номер у стола никто не будет. */
function stationCodeOf(raw){
 const text=String(raw==null?'':raw).trim().toUpperCase().replace(/\s+/g,'');
 if(/^\d{1,9}$/.test(text))return 'G-'+text.padStart(7,'0');
 /* Юнит — так же коротко: «U5» это U-0000005. */
 if(/^U-?\d{1,9}$/.test(text))return 'U-'+text.replace(/^U-?/,'').padStart(7,'0');
 return text;
}
/* Номер стекла → заказ, позиция, стекло Makeup и активная запись батча.
   index — готовая карта номеров, когда стёкол много (экран офиса). */
function stationPieceIndex(){
 const m=new Map();
 (DB.glassPiece||[]).forEach(r=>{
  const [orderId,lineId]=r.key.split('|');
  r.ids.forEach((id,i)=>{if(id)m.set(id,{orderId,lineId,key:r.key,unit:i+1});});
  Object.keys(r.extra||{}).forEach(nr=>r.extra[nr].forEach((id,k)=>{if(id)m.set(id,{orderId,lineId,key:r.key,unit:nr+'.'+(k+1)});}));
 });
 return m;
}
function stationBatchIndex(){
 const m=new Map();
 (DB.glassBatch||[]).forEach(batch=>batch.items.forEach(item=>{if(!item.releasedAt&&item.piece)m.set(item.piece,{batch,item,part:batch.parts[item.part]});}));
 return m;
}
function stationGlass(id,index,batches){
 const hit=index?index.get(id):(()=>{const h=glassLookup(id);return h&&h.kind==='glass'?h:null;})();
 if(!hit)return null;
 const o=salesRecord(hit.orderId),l=o&&(o.lines||[]).find(x=>x.id===hit.lineId);
 if(!o||!l)return null;
 const c=glassBatchComponents(o,l).find(x=>x.key===hit.key)||null;
 const entry=(batches||stationBatchIndex()).get(id)||null;
 return {id,o,l,c,unit:hit.unit,entry};
}
/* Маршрут стекла — тот же, что печатается на стикере. Кэш по позиции:
   на экране офиса сотни стёкол одной позиции едут одним маршрутом. */
let stationRouteCache=new Map();
/* Зафиксированные маршруты копятся месяцами, а табло спрашивает каждое
   стекло: индекс по ключу пересобирается, только когда меняется список. */
let stationFrozenIndex={list:null,size:-1,map:null};
function stationFrozenRoute(key){
 const list=DB.productionRoute||[];
 if(stationFrozenIndex.list!==list||stationFrozenIndex.size!==list.length)stationFrozenIndex={list,size:list.length,map:new Map(list.map(x=>[x.key,x]))};
 const x=key&&stationFrozenIndex.map.get(key);return x?x.route:null;
}
/* Чертёж стекла: позиции ('') или своего Recut ('R3'). У стекла Recut со
   своим чертежом и маршрут свой: фигура может добавить станции. */
function stationDrawingKey(o,l,unit){const r=typeof recutOfUnit==='function'?recutOfUnit(o.id,l.id,unit):null;return r&&recutHasShape(r)?'R'+r.no:'';}
/* Геометрия стекла для размеров на станциях. */
function stationGeo(g){return g&&typeof glassRecutLine==='function'?glassRecutLine(g.o,g.l,g.unit):g&&g.l;}
/* Группа юнита: Recut всего юнита со своим чертежом — отдельно; Recut
   одного лайта собирается со старыми лайтами (stationDrawingFits). */
function stationUnitTag(o,l,unit){const r=typeof recutOfUnit==='function'?recutOfUnit(o.id,l.id,unit):null;return r&&recutHasShape(r)&&r.which==='unit'?'R'+r.no:'';}
function stationRouteKey(g){if(!g||!g.c)return '';const d=stationDrawingKey(g.o,g.l,g.unit);return g.c.key+(d?'|'+d:'');}
function stationRouteOf(g){
 const rk=stationRouteKey(g),frozen=g.c&&stationFrozenRoute(rk);if(frozen)return frozen;
 const geo=typeof glassRecutLine==='function'?glassRecutLine(g.o,g.l,g.unit):g.l;
 const key=[g.o.id,g.l.id,rk,geo===g.l?'':geo.shapeRef.id+'#'+geo.shapeRef.revision,g.o.updatedAt||''].join('|');
 if(stationRouteCache.has(key))return stationRouteCache.get(key);
 let r=null;
 try{if(g.c&&!g.c.missing)r=finWithOrder(g.o,()=>stkRoute(g.o,geo,g.c));}catch(e){r=null;}
 if(!r||!Array.isArray(r.codes)||!r.codes.length){
  /* Маршрут не собрался (нет стекла в Makeup) — стекло всё равно проходит
     резку и отгрузку: станции «always». */
  const codes=(DB.station||[]).filter(s=>s.always).sort((a,b)=>a.seq-b.seq).map(s=>s.code);
  r={codes,shipping:codes.filter(c=>c!==stationCutCode()),services:[]};
 }
 if(stationRouteCache.size>2000)stationRouteCache=new Map();
 stationRouteCache.set(key,r);return r;
}
/* Где стекло: самая дальняя отсканированная станция его маршрута, дальше —
   следующая. Пройдено всё — стекло отгружено. Станция может стоять в
   маршруте дважды: CNC Shape Polish до закалки и CNC Lami Polish после
   ламинации — один станок (владелец, 29.09.2026). Поэтому сканы идут по
   порядку, и каждый продвигает стекло к БЛИЖАЙШЕМУ впереди заходу на эту
   станцию; повтор уже пройденной станции место не меняет. */
function stationRouteStep(route,station,far){const i=route.indexOf(station,far+1);return i>=0?i:route.lastIndexOf(station);}
function stationPlace(g,scans){
 const route=stationRouteOf(g).codes;scans=scans||stationScansFor(g.id);
 let far=-1;scans.filter(s=>!s.broken&&!s.park).sort((a,b)=>String(a.at).localeCompare(String(b.at))||String(a.id).localeCompare(String(b.id)))
  .forEach(s=>{const i=Number.isInteger(s.step)&&route[s.step]===s.station?s.step:stationRouteStep(route,s.station,far);if(i>far)far=i;});
 /* Разбитое стекло выходит из маршрута: станции его больше не ждут, вместо
    него едет стекло Recut со своим номером. */
 const broken=scans.find(s=>s.broken)||null;
 if(broken)return {route,far,waiting:'',shipped:false,broken};
 /* Сборка на IGU не закрыта — стекло ещё на IGU, юнит не собран. */
 if(far>=0&&scans.some(s=>s.asm&&!s.unit&&!s.joined&&s.station===route[far]))return {route,far:far-1,waiting:route[far],shipped:false,assembling:true};
 return {route,far,waiting:far+1<route.length?route[far+1]:'',shipped:route.length>0&&far===route.length-1};
}
/* Разбор скана без записи. kind:
   ok · hold — пишется; held · already · passed · skipped · route ·
   cancelled · unit · unknown — только показывается.
   held — Hold на станции, которую стекло не ждёт (пропущены сканы, уже
   прошло, не его маршрут): Hold виден на любой станции, но скан не пишется
   и вопроса «сделано?» нет — иначе «Yes, done» записал бы CUT…IGU стеклу,
   которое не резали (аудит Shipping, 6.10.2026). */
function stationCheck(station,raw){
 const code=stationCodeOf(raw);
 if(!code)return null;
 if(typeof carrierType==='function'&&carrierType(code))return {kind:'carrier',code};
 if(typeof unitIdValid==='function'&&unitIdValid(code))return stationUnitCheck(station,code);
 if(!glassPieceValid(code))return {kind:'unknown',code};
 const g=stationGlass(code);
 if(!g)return {kind:'unknown',code};
 const scans=stationScansFor(code),place=stationPlace(g,scans),here=scans.filter(s=>s.station===station&&!s.park).pop()||null;
 const base={code,g,scans,place,here,stock:!g.entry,priority:g.o.priority||'normal',due:g.o.dueDate||''};
 if(g.o.status==='cancelled')return Object.assign(base,{kind:'cancelled'});
 /* Отменённый юнит (erp/sales/unit-cancel): стекло откладывают, а если его
    забирает клиент — оно едет с заказом. skid — скид, с которого его ещё не сняли. */
 if(unitPieceCancelled(g)){
  const u=unitCancelOf(g.o,code),takes=!!u&&u.glass==='customer'&&!u.takenPs;
  return Object.assign(base,{kind:'cancelled',unit:true,takes,skid:u&&u.glass!=='customer'&&!(u.off||[]).includes(code)?unitPieceSkid(code):''});
 }
 if(place.broken)return Object.assign(base,{kind:'broken'});
 /* Следующий заход на эту станцию — ближайший впереди по маршруту. */
 const w=place.waiting?place.far+1:-1,i=w>=0?place.route.indexOf(station,w):-1;
 const kind=place.route.indexOf(station)<0?'route':i<0||place.assembling&&i===w?(here?'already':'passed'):i>w?'skipped':'ok';
 const held=unitPieceHold(g);
 if(g.o.onHold||g.l.onHold||held){
  if(kind==='ok')base.mates=stationMatesAt(g,station).map(x=>x.id);
  return Object.assign(base,{kind:kind==='ok'?'hold':'held',reason:(g.o.onHold?g.o.holdReason:g.l.onHold?g.l.holdReason:held.reason)||'',unit:!g.o.onHold&&!g.l.onHold});
 }
 if(kind==='skipped')return Object.assign(base,{kind,missed:place.route.slice(w,i)});
 if(kind!=='ok')return Object.assign(base,{kind});
 base.mates=stationMatesAt(g,station).map(x=>x.id);
 return Object.assign(base,{kind:'ok'});
}
/* who: {id, name} — рабочий, вошедший на станцию. */
function stationRecord(station,check,who,opts){
 if(storageDepth||opts&&opts.deferTouch)return stationRecordCommand(station,check,who,opts);
 const out=storageCommand(()=>stationRecordCommand(station,check,who,opts));
 return out.ok?out.value:null;
}
function stationRecordCommand(station,check,who,opts){
 opts=opts||{};
 if(!check||!STATION_RECORDED.includes(check.kind))return null;
 if(!Array.isArray(DB.stationScan))DB.stationScan=[];
 const now=opts.now||new Date().toISOString();
 const rec={id:stationScanNextId(),at:now,piece:check.code,station,by:String(who&&who.name||''),byId:String(who&&who.id||''),manual:!!opts.manual,undoneAt:'',undoneBy:''};
 rec.actionId=opts.actionId||rec.id;check.actionId=rec.actionId;check.recordedAt=rec.at;
 if(check.g&&check.g.c){
  const route=stationRouteOf(check.g);rec.step=stationRouteStep(route.codes,station,stationPlace(check.g).far);
  const rk=stationRouteKey(check.g);if(!stationFrozenRoute(rk))DB.productionRoute.push({key:rk,at:now,route:JSON.parse(JSON.stringify(route))});
 }
 if(opts.on&&typeof carrierFind==='function'&&carrierFind(opts.on))rec.on=carrierCode(opts.on);
 if(opts.confirmedAt)rec.confirmedAt=sfCode(opts.confirmedAt);
 DB.stationScan.push(rec);
 if(check.g)stationAsmJoin(rec,check.g,station,opts.asm);
 /* Скан резки ставит «резка началась» ОДНОМУ стеклу, а не всей позиции:
    позиция узнаёт это через glassBatchSyncLine, как и прежде. */
 const e=check.g&&check.g.entry;
 if(station===stationCutCode()&&e&&!e.item.cutStartedAt){e.item.cutStartedAt=now;glassBatchSyncLine(check.g.o,check.g.l);}
 if(check.g&&station===shippingStations().ready)shippingSyncOrder(check.g.o,now);
 if(!opts.deferTouch)touch();
 return rec;
}
function stationMove(station,check,who,opts){
 return storageCommand(()=>{
  const rec=stationRecord(station,check,who,Object.assign({},opts,{deferTouch:true}));
  if(!rec)throw new Error('Nothing was recorded.');
  const mates=stationRecordMates(station,check,who,opts);
  return {rec,mates};
 });
}
/* Undo — только последний скан стекла: отменить CUT, когда стекло уже
   прошло EDGE, значило бы оставить его «на EDGE без реза». */
function stationUndo(id,who,opts){
 if(storageDepth||opts&&opts.deferTouch)return stationUndoCommand(id,who,opts);
 const out=storageCommand(()=>stationUndoCommand(id,who,opts));
 return out.ok?out.value:{error:out.error};
}
function stationUndoCommand(id,who,opts){
 opts=opts||{};
 const rec=(DB.stationScan||[]).find(s=>s.id===id);
 if(!rec||rec.undoneAt)return {error:'Scan not found.'};
 if(rec.broken)return {error:'Recut is in the order — change it there.'};
 /* Скан погрузки открытого рейса отменяет сам рабочий: юниты возвращаются в
    Ready, PS остаётся planned (erp/shipping/loading). */
 const ps=opts.shippingRollback?null:(DB.shipment||[]).find(s=>shippingActive(s)&&s.items.some(i=>i.pieces.includes(rec.piece)));
 /* Повторный скан SHIPR — перенос на другой скид, а не готовность: его
    откатывают и у planned PS (аудит Shipping, F5). */
 const restack=rec.station===shippingStations().ready&&stationScansFor(rec.piece).some(s=>s!==rec&&s.station===rec.station&&!s.park&&String(s.at)<=String(rec.at));
 if(ps&&!(ps.status==='planned'&&(rec.station===shippingStations().ship||restack)))return {error:'Glass is on a packing slip. Undo or cancel that packing slip first.'};
 const group=rec.actionId?(DB.stationScan||[]).filter(s=>s.actionId===rec.actionId&&!s.undoneAt):[rec];
 const ordered=id=>stationScansFor(id).sort((a,b)=>String(a.at).localeCompare(String(b.at))||String(a.id).localeCompare(String(b.id)));
 if(group.some(r=>ordered(r.piece).pop()!==r))return {error:'Glass has moved on — undo the later scan first.'};
 if(rec.asm){
  const assembly=(DB.stationScan||[]).filter(s=>s.asm===rec.asm&&!s.undoneAt);
  if(assembly.some(s=>{const last=ordered(s.piece).pop();return last&&!assembly.includes(last)&&!group.includes(last);} ))return {error:'The unit has moved on — undo its later move first.'};
 }
 const at=opts.now||new Date().toISOString();
 group.forEach(r=>{
  r.undoneAt=at;r.undoneBy=String(who&&who.name||'');stationAsmReopen(r);
  if(r.station===stationCutCode()&&!stationScansFor(r.piece).some(s=>s.station===r.station)){
   const e=stationBatchIndex().get(r.piece);
   if(e&&e.item.cutStartedAt===r.at){e.item.cutStartedAt='';const o=salesRecord(e.part.orderId),l=o&&(o.lines||[]).find(x=>x.id===e.part.lineId);if(o&&l)glassBatchSyncLine(o,l);}
  }
 });
 shippingLoadUndone(group);
 shippingSyncOrders(group.map(s=>{const g=stationGlass(s.piece);return g&&g.o.id;}).filter(Boolean));
 if(!opts.deferTouch)touch();
 return {ok:true,pieces:group.map(s=>s.piece)};
}
/* Экран офиса: сколько стёкол ждёт на каждой станции и какие. Берём все
   стёкла активных батчей и все, у кого уже есть скан (порезанные из стока
   тоже едут по цеху). Отгруженные и отменённые — не в цеху. */
function stationWaiting(){
 const index=stationPieceIndex(),batches=stationBatchIndex(),byPiece=new Map();
 (DB.stationScan||[]).forEach(s=>{if(s.undoneAt)return;if(!byPiece.has(s.piece))byPiece.set(s.piece,[]);byPiece.get(s.piece).push(s);});
 const ids=new Set([...batches.keys(),...byPiece.keys()]),out=new Map();
 ids.forEach(id=>{
  const g=stationGlass(id,index,batches);if(!g||g.o.status==='cancelled'||unitPieceCancelled(g))return;
  const scans=byPiece.get(id)||[],place=stationPlace(g,scans);if(place.broken||place.shipped||!place.waiting)return;
  const last=scans.slice().sort((a,b)=>String(a.at).localeCompare(String(b.at))).pop()||null;
  if(!out.has(place.waiting))out.set(place.waiting,[]);
  out.get(place.waiting).push({id,g,place,last,since:last?last.at:(g.entry?g.entry.item.at:''),from:last?last.station:''});
 });
 out.forEach(list=>list.sort((a,b)=>stationUrgency(b.g.o)-stationUrgency(a.g.o)||String(a.since).localeCompare(String(b.since))||a.id.localeCompare(b.id)));
 return out;
}
/* Срочность задаёт продажник: Critical и дата в заказе («будут выбирать
   опцию Критикал и указывать дату», владелец 29.09.2026). Своих правил по
   сроку система не придумывает. */
function stationUrgency(o){return o&&o.priority==='critical'?2:o&&o.priority==='rush'?1:0;}

function normalizeStationScans(){
 if(!Array.isArray(DB.stationScan))DB.stationScan=[];
 if(!Array.isArray(DB.productionRoute))DB.productionRoute=[];
 DB.productionRoute=DB.productionRoute.filter(x=>x&&typeof x.key==='string'&&x.route&&Array.isArray(x.route.codes)&&x.route.codes.length&&x.route.codes.every(c=>typeof c==='string'&&SF_CODE_RE.test(c))&&Array.isArray(x.route.services));
 const ids=new Set(),iso=v=>typeof v==='string'&&!Number.isNaN(Date.parse(v));
 DB.stationScan=DB.stationScan.filter(s=>s&&typeof s==='object'&&STATION_SCAN_ID_RE.test(String(s.id))&&!ids.has(s.id)&&glassPieceValid(s.piece)&&iso(s.at)&&typeof s.station==='string'&&s.station.trim()&&(ids.add(s.id),true))
  .map(s=>({id:s.id,at:s.at,piece:s.piece,station:sfCode(s.station),by:String(s.by==null?'':s.by).slice(0,80),byId:String(s.byId==null?'':s.byId).slice(0,80),manual:s.manual===true,
   undoneAt:iso(s.undoneAt)?s.undoneAt:'',undoneBy:iso(s.undoneAt)?String(s.undoneBy==null?'':s.undoneBy).slice(0,80):'',
   ...(typeof s.on==='string'&&typeof CARRIER_RE!=='undefined'&&CARRIER_RE.test(s.on)?{on:s.on}:{}),
   ...(s.moved&&typeof s.moved==='object'&&iso(s.moved.at)?{moved:{from:typeof s.moved.from==='string'&&typeof CARRIER_RE!=='undefined'&&CARRIER_RE.test(s.moved.from)?s.moved.from:'',at:s.moved.at,by:String(s.moved.by==null?'':s.moved.by).slice(0,80)}}:{}),
   ...(typeof s.confirmedAt==='string'&&SF_CODE_RE.test(sfCode(s.confirmedAt))?{confirmedAt:sfCode(s.confirmedAt)}:{}),
   ...(Number.isInteger(s.step)&&s.step>=0?{step:s.step}:{}),
   ...(STATION_SCAN_ID_RE.test(String(s.actionId))?{actionId:s.actionId}:{}),
   ...(STATION_SCAN_ID_RE.test(String(s.asm))?{asm:s.asm}:{}),
   ...(s.joined===true&&STATION_SCAN_ID_RE.test(String(s.asm))?{joined:true}:{}),
   ...(STATION_SCAN_ID_RE.test(String(s.asm))&&Number.isInteger(s.unit)&&s.unit>0&&s.unit<1e5?{unit:s.unit}:{}),
   ...(s.park===true&&s.broken!==true?{park:true,recut:String(s.recut==null?'':s.recut).slice(0,20),reason:String(s.reason==null?'':s.reason).slice(0,80)}:{}),
   ...(s.broken===true?{broken:true,recut:String(s.recut==null?'':s.recut).slice(0,20),reason:String(s.reason==null?'':s.reason).slice(0,80)}:{})}));
 let top=Number.isSafeInteger(DB.stationScanSeq)&&DB.stationScanSeq>0?DB.stationScanSeq:0;
 DB.stationScan.forEach(s=>{top=Math.max(top,+s.id.slice(3));});DB.stationScanSeq=top;
 /* Скан резки — правда о «резка началась»: у импортированных данных поле
    стекла могло потеряться, журнал его восстанавливает. */
 const cut=stationCutCode(),first=new Map();
 DB.stationScan.forEach(s=>{if(!s.undoneAt&&s.station===cut&&(!first.has(s.piece)||s.at<first.get(s.piece)))first.set(s.piece,s.at);});
 normalizeSheetBreaks();
 if(!first.size)return;
 const lines=new Set();
 stationBatchIndex().forEach((e,piece)=>{if(first.has(piece)&&!e.item.cutStartedAt){e.item.cutStartedAt=first.get(piece);lines.add(e.part.orderId+'|'+e.part.lineId);}});
 lines.forEach(k=>{const [oid,lid]=k.split('|'),o=salesRecord(oid),l=o&&(o.lines||[]).find(x=>x.id===lid);if(o&&l)glassBatchSyncLine(o,l);});
}
function validateStationScanPayload(src){
 if(src&&src.productionRoute!=null){
  if(!Array.isArray(src.productionRoute))throw new Error('Saved production routes must be an array.');
  const keys=new Set();src.productionRoute.forEach(x=>{
   if(!x||typeof x.key!=='string'||!x.key||keys.has(x.key)||!x.route||!Array.isArray(x.route.codes)||!x.route.codes.length||!x.route.codes.every(c=>typeof c==='string'&&SF_CODE_RE.test(c))||!Array.isArray(x.route.services)||!x.route.services.every(s=>s&&typeof s.text==='string'&&x.route.codes.includes(s.station)&&(s.step==null||Number.isInteger(s.step)&&x.route.codes[s.step]===s.station)))throw new Error('Invalid or duplicate saved production route.');keys.add(x.key);
  });
 }

 if(src&&Object.prototype.hasOwnProperty.call(src,'stationScan')&&!Array.isArray(src.stationScan))throw new Error('The "stationScan" field must be an array.');
 if(src&&Object.prototype.hasOwnProperty.call(src,'sheetBreak')&&!Array.isArray(src.sheetBreak))throw new Error('The "sheetBreak" field must be an array.');
}

/* ---------------------------------------------------------------------
   Разбитое стекло со станции. Recut — тот же, что из заказа (erp/quality/
   recut): одно стекло позиции, место «R1.1», новый номер стекла, очередь
   To batch. Владелец, 29.09.2026: новое стекло ждёт следующего батча;
   маленькое рабочие сами режут из остатка — такой скан CUT примет как рез
   из стока. Разбитое стекло получает запись broken и выходит из маршрута.
   --------------------------------------------------------------------- */
function stationBreakPlan(g,station,asmId){
 const panes=((salesMakeupById(g.o,g.l.makeupId)||{}).panes||[]),mu=stationUnitMerge(g.o,g.l);
 /* asmId — Recut недостающего лайта из сборки: у света его пара оказалась
    поцарапанной, её не сканируют, а жмут Recut у лайта в сборке. */
 let a=mu?stationAsmOf(g,mu):null;
 if(!a&&asmId&&station===mu)a=stationAsms(g.o,g.l,mu).find(x=>x.asm===asmId&&!x.unit)||null;
 /* Юнит уже собран и уехал с IGU (разбили на скиде через пару дней) —
    переделывается весь юнит. */
 if(a&&a.unit&&!a.broken&&station!==mu)return {which:'unit',whole:true,asm:a,pieces:[...a.lites.values()],out:[]};
 const which=panes.length<2?'unit':String(g.c.index),keys=ncrGlassKeys(g.o,g.l,which);
 /* На IGU перед закрытием — контроль: поцарапан один лайт, остальные
    вынимают из машины, они ждут пару на долли (владелец, 29.09.2026). */
 const out=a&&!a.broken&&station===mu?[...a.lites.entries()].filter(([k,id])=>id!==g.id&&!keys.includes(k)).map(([k,id])=>id):[];
 const same=a&&!a.broken&&station===mu?[...a.lites.entries()].filter(([k,id])=>id!==g.id&&keys.includes(k)).map(([k,id])=>id):[];
 return {which,whole:false,asm:a,pieces:[g.id].concat(same),out};
}
function stationBreak(station,check,who,reasonId,opts){
 if(storageDepth||opts&&opts.deferTouch)return stationBreakCommand(station,check,who,reasonId,opts);
 const out=storageCommand(()=>stationBreakCommand(station,check,who,reasonId,opts));
 return out.ok?out.value:{error:out.error};
}
function stationBreakCommand(station,check,who,reasonId,opts){
 opts=opts||{};
 if(!check||!check.g||!['ok','hold','held','already','passed','skipped','route','peek'].includes(check.kind))return {error:'Scan the broken glass first.'};
 const g=check.g,o=g.o,l=g.l,c=g.c;
 if(shippingPrintedPiece(g.id)||(DB.shipment||[]).some(s=>shippingSent(s)&&s.items.some(i=>i.pieces.includes(g.id))))return {error:'Packing slip printed or shipped — use NCR.'};
 if(!c||c.missing)return {error:'Glass not found in the order.'};
 const plan=stationBreakPlan(g,station,opts.asm);
 const made=recutCreate({orderId:o.id,where:station,reasonId,lines:{[l.id]:{on:true,qty:1,which:plan.which}},note:(plan.whole?'Unit '+(typeof unitIdAt==='function'?unitIdAt(o.id,l.id,plan.asm.unit):plan.asm.unit)+' · glass ':'Glass ')+g.id+' at '+station});
 if(made.error)return made;
 const r=made.recuts[0],now=r.createdAt,ref='R'+r.no;
 /* Стекло было из Recut со своим чертежом (или собрано с ним) — чертёж
    переходит в новый Recut (erp/quality/recut). */
 const index=stationPieceIndex(),src=[g.id].concat(plan.pieces).map(id=>index.get(id)).filter(Boolean).map(h=>recutOfUnit(o.id,l.id,h.unit)).find(recutHasShape);
 if(src)recutInheritDrawing(r,src);
 const rec=(DB.glassPiece||[]).find(x=>x.key===c.key),fresh=rec&&rec.extra&&rec.extra[ref]?rec.extra[ref].filter(Boolean):[];
 const allNew=(r.keys||[]).flatMap(k=>{const x=(DB.glassPiece||[]).find(p=>p.key===k);return x&&x.extra&&x.extra[ref]?x.extra[ref].filter(Boolean):[];});
 if(!Array.isArray(DB.stationScan))DB.stationScan=[];
 const by=String(who&&who.name||''),byId=String(who&&who.id||'');
 plan.pieces.forEach(id=>DB.stationScan.push({id:stationScanNextId(),at:now,piece:id,station,by,byId,manual:false,undoneAt:'',undoneBy:'',broken:true,recut:ref,reason:r.reason}));
 /* Вынутые из машины: скан IGU снимается (сборка открыта заново), запись
    park — «ждёт пару», дальше рабочий сканирует долли, на которую положил. */
 const parked=plan.out.map(id=>{
  (DB.stationScan||[]).forEach(s=>{if(s.piece===id&&s.station===station&&s.asm&&!s.undoneAt){s.undoneAt=now;s.undoneBy='Recut '+r.no+' · taken out';}});
  const p={id:stationScanNextId(),at:now,piece:id,station,by,byId,manual:false,undoneAt:'',undoneBy:'',park:true,recut:ref,reason:'Waits for a pair'};
  DB.stationScan.push(p);return p;
 });
 /* Разбилось на резе — стекло всё равно порезано: лист закрывается. */
 const e=g.entry;if(station===stationCutCode()&&e&&!e.item.cutStartedAt){e.item.cutStartedAt=now;glassBatchSyncLine(o,l);}
 shippingSyncOrder(o,now);
 if(!opts.deferTouch)touch();
 return {ok:true,recut:r,ref,newIds:fresh,allNew,whole:plan.whole,broken:plan.pieces,parked};
}
/* Лопнул лист на столе — режут ту же раскладку заново, стикеры те же
   (владелец, 29.09.2026). Система только записывает потерю листа. */
function stationSheetBreak(batch,glass,sheetNo,who,opts){
 if(storageDepth||opts&&opts.deferTouch)return stationSheetBreakCommand(batch,glass,sheetNo,who,opts);
 const out=storageCommand(()=>stationSheetBreakCommand(batch,glass,sheetNo,who,opts));
 return out.ok?out.value:{error:out.error};
}
function stationSheetBreakCommand(batch,glass,sheetNo,who,opts){
 opts=opts||{};
 const plan=typeof cutPlanFor==='function'?cutPlanFor(batch):null,g=plan&&plan.groups.find(x=>x.glass===glass),sh=g&&g.sheets.find(s=>s.no===sheetNo);
 if(!sh)return {error:'Sheet not found.'};
 if(!Array.isArray(DB.sheetBreak))DB.sheetBreak=[];
 const size=sh.size||{},rec={id:'SB-'+String(DB.sheetBreak.reduce((n,x)=>Math.max(n,+String(x.id).slice(3)||0),0)+1).padStart(5,'0'),at:opts.now||new Date().toISOString(),batch,glass,sheet:sheetNo,w:+size.w||0,h:+size.h||0,by:String(who&&who.name||'')};
 DB.sheetBreak.push(rec);if(!opts.deferTouch)touch();
 return {ok:true,rec};
}
function normalizeSheetBreaks(){
 if(!Array.isArray(DB.sheetBreak))DB.sheetBreak=[];
 const ids=new Set();
 DB.sheetBreak=DB.sheetBreak.filter(x=>x&&typeof x==='object'&&/^SB-\d{5,}$/.test(String(x.id))&&!ids.has(x.id)&&(ids.add(x.id),true)&&typeof x.batch==='string')
  .map(x=>({id:x.id,at:String(x.at||''),batch:x.batch,glass:String(x.glass||''),sheet:Math.max(1,Math.floor(+x.sheet)||1),w:+x.w||0,h:+x.h||0,by:String(x.by||'').slice(0,80)}));
}

/* ---------------------------------------------------------------------
   Живые данные между окнами. Станция и офис открыты в двух вкладках одного
   браузера: вкладка держит базу в памяти и при сохранении пишет её ЦЕЛИКОМ.
   Без этого офис, сохранив что угодно, стёр бы сканы станции, сделанные
   после его загрузки. Браузер сообщает о чужой записи событием storage —
   перечитываем базу. Экран перерисовываем, только если никто не печатает:
   иначе курсор выпрыгивал бы из поля на каждом скане станции.
   --------------------------------------------------------------------- */
function storageLiveReload(text){
 let next;
 try{next=prepareImportedState(JSON.parse(text));}catch(e){console.warn('live reload skipped:',e.message);return false;}
 /* Несохранённый заказ этой вкладки едет поверх свежей базы со своими
    формами строк (владелец, 2 октября 2026: большой заказ в одной вкладке,
    клиент у стойки — в другой). */
 if(typeof salesDraftKeepShapes==='function')salesDraftKeepShapes(DB,next);
 DB=next;storageBaseline=text;storageInvalidate();
 const a=document.activeElement,typing=a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&!(a.dataset&&a.dataset.stationScan!==undefined&&!a.value);
 if(!typing)(typeof storageRerender==='function'?storageRerender:render)();
 return true;
}
window.addEventListener('storage',function(e){
 if(e.key!=='glazing_system_v1'||typeof e.newValue!=='string')return;
 // An old event can arrive after this tab has saved a newer value during handoff.
 // Read the current durable value instead of replaying the queued event payload.
 const current=storageRead('glazing_system_v1');
 if(current&&current!==storageBaseline)storageLiveReload(current);
});
/* «Не на эту долли» — стекло понесли в руках (Critical: отложить или отнести
   сразу). Скан остаётся, пропадает только тара — у всего юнита, который
   переехал одним сканом (общий actionId; аудит 05.10.2026: половина
   собранного юнита оставалась на DL-1). */
function stationScanOff(id){const out=storageCommand(()=>stationScanOffCommand(id));return out.ok&&out.value;}
function stationScanOffCommand(id){
 const rec=(DB.stationScan||[]).find(s=>s.id===id&&!s.undoneAt);if(!rec||!rec.on)return false;
 DB.stationScan.forEach(s=>{if(s===rec||!s.undoneAt&&s.on&&s.station===rec.station&&rec.actionId&&s.actionId===rec.actionId)delete s.on;});touch();return true;
}

/* ---------------------------------------------------------------------
   Пропущенная станция. Стекло принесли на HEAT, а EDGE его не сканировал.
   Не блокируем и не пишем молча: рабочий видит работы пропущенной станции
   и отвечает. Yes — работа сделана, просто не отсканировали: пропущенные
   станции отмечаются с пометкой «подтверждено на HEAT, кто», потом скан
   этой станции. No — стекло назад. (Владелец, 29.09.2026: закалённое не
   досверлишь — вопрос задаётся, пока стекло ещё можно вернуть.)
   --------------------------------------------------------------------- */
function stationSkippedWorks(check){
 const start=check.place.far+1,end=start+(check.missed||[]).length;
 const svc=(stationRouteOf(check.g).services||[]).filter(s=>(check.missed||[]).includes(s.station)&&(s.step==null||s.step>=start&&s.step<end));
 return svc.map(s=>({station:s.station,text:s.text}));
}
function stationConfirmSkipped(station,code,who,opts){
 if(storageDepth||opts&&opts.deferTouch)return stationConfirmSkippedCommand(station,code,who,opts);
 const out=storageCommand(()=>stationConfirmSkippedCommand(station,code,who,opts));
 return out.ok?out.value:{error:out.error};
}
function stationConfirmSkippedCommand(station,code,who,opts){
 opts=opts||{};
 const check=stationCheck(station,code);
 if(!check||check.kind!=='skipped')return {error:'Nothing to confirm.'};
 if(check.place.assembling)return {error:'The pair must be assembled before it can move on.'};
 const now=opts.now||new Date().toISOString();
 check.missed.forEach(m=>stationRecord(m,{kind:'ok',code,g:check.g},who,{deferTouch:true,manual:true,confirmedAt:station,now}));
 const after=stationCheck(station,code);
 /* Станция отгрузки пишет свой скан сама — по правилам рейса. */
 if(opts.missedOnly){touch();return {ok:true,check:after,rec:null,mates:[],confirmed:check.missed};}
 const rec=STATION_RECORDED.includes(after.kind)?stationRecord(station,after,who,{deferTouch:true,on:opts.on,now}):null;
 if(!rec)throw new Error('The pair must be assembled before it can move on.');
 const mates=stationRecordMates(station,after,who,{deferTouch:true,on:opts.on,now});
 touch();
 return {ok:true,check:after,rec,mates,confirmed:check.missed};
}

/* ---------------------------------------------------------------------
   Юнит собирается на IGU из того, что там сканируют. Владелец, 29.09.2026:
   «30 юнитов одинаковых — никто не будет собирать 1 со вторым лайтом, они
   пойдут так, что первый с 16-м, а 15-й с 29-м: при закрывании важно, чтобы
   тип стекла соответствовал Makeup, и размер». Поэтому юнит — не номер со
   стикера стекла, а сборка: лайт встаёт в самую раннюю открытую сборку своей
   позиции, где его места ещё нет, иначе начинает новую (asm — номер первого
   скана сборки). Собрана — получает номер юнита: наименьший свободный в
   позиции (unit на всех сканах сборки). Пока сборка открыта, её стёкла
   ждут на IGU. После IGU юнит двигается одним сканом — по любому G- сборки
   или по U-. Ламинат: плиты одного лайта сходятся на LAM и дальше едут
   вместе, как и раньше, по номеру стекла.
   --------------------------------------------------------------------- */
function stationUnitMerge(o,l){const m=salesMakeupById(o,l.makeupId);return m&&typeof salesRouteMerge==='function'?salesRouteMerge(m.unitType,m.panes):'';}
function stationLineKeys(o,l){return glassBatchComponents(o,l).filter(c=>!c.missing).map(c=>c.key);}
/* Сборки позиции на станции слияния — из журнала. */
/* pre — готовые сканы этой строки и разбитые стёкла (erp/shipping/data,
   shippingCtx): экран Shipping не перебирает весь журнал на каждую строку. */
function stationAsms(o,l,station,index,pre){
 index=index||stationPieceIndex();
 const broken=pre?pre.broken:new Set(),out=new Map();
 if(!pre)(DB.stationScan||[]).forEach(s=>{if(s.broken&&!s.undoneAt)broken.add(s.piece);});
 (pre?pre.scans:DB.stationScan||[]).forEach(s=>{
  if(s.undoneAt||!s.asm||s.station!==station)return;
  const hit=index.get(s.piece);if(!hit||hit.orderId!==o.id||hit.lineId!==l.id)return;
  if(!out.has(s.asm))out.set(s.asm,{asm:s.asm,lites:new Map(),recs:[],unit:0,broken:false,complete:false});
  const a=out.get(s.asm);a.lites.set(hit.key,s.piece);a.recs.push(s);if(s.unit)a.unit=s.unit;if(s.unit||s.joined)a.complete=true;if(broken.has(s.piece))a.broken=true;
 });
 return [...out.values()].sort((a,b)=>a.asm.localeCompare(b.asm));
}
function stationAsmOf(g,station){
 const rec=stationScansFor(g.id).find(s=>s.asm&&s.station===station);if(!rec)return null;
 return stationAsms(g.o,g.l,station).find(a=>a.asm===rec.asm)||null;
}
/* Скан на станции слияния: в сборку; сборка полная — номер юнита. */
function stationAssemblyKeys(g,station){
 const lam=salesRouteStationOf('lamination','LAM');
 return glassBatchComponents(g.o,g.l).filter(c=>!c.missing&&(station!==lam||!g.c.ply||c.index===g.c.index)).map(c=>c.key);
}
/* Юнит собирается только из стекла одного чертежа: старое неверное стекло
   с новым из Recut не сходится (владелец, 7 октября 2026). Recut одного лайта
   со своим чертежом идёт к лайтам, которых он не касается. a, b — {key, unit}. */
function stationDrawingFits(o,l,a,b){
 const ta=stationDrawingKey(o,l,a.unit),tb=stationDrawingKey(o,l,b.unit);if(ta===tb)return true;
 const covers=(t,key)=>!!t&&(DB.recut||[]).some(r=>r&&r.orderId===o.id&&r.lineId===l.id&&'R'+r.no===t&&(r.keys||[]).includes(key));
 return !covers(ta,b.key)&&!covers(tb,a.key);
}
/* Стекло p подходит к сборке a: со всеми её стёклами. */
function stationAsmFits(a,o,l,index,p){return a.recs.every(s=>{const h=index.get(s.piece);return !h||stationDrawingFits(o,l,h,p);});}
/* want — сборка, в которую встаёт стекло (erp/shopfloor/skip): id открытой
   сборки или 'new'. Без want — самая ранняя открытая, как у сканера. */
function stationAsmJoin(rec,g,station,want){
 if(!g||!g.c||g.c.missing)return;
 const mu=stationUnitMerge(g.o,g.l),lam=salesRouteStationOf('lamination','LAM');
 if(station!==mu&&!(station===lam&&g.c.ply))return;
 const expected=stationAssemblyKeys(g,station),index=stationPieceIndex(),me={key:g.c.key,unit:g.unit};
 const open=stationAsms(g.o,g.l,station,index).filter(a=>!a.complete&&!a.broken&&!a.lites.has(g.c.key)&&!a.recs.includes(rec)&&[...a.lites.keys()].every(k=>expected.includes(k))&&stationAsmFits(a,g.o,g.l,index,me));
 rec.asm=want==='new'?rec.id:want&&open.some(a=>a.asm===want)?want:open.length?open[0].asm:rec.id;
 const all=stationAsms(g.o,g.l,station,index),a=all.find(x=>x.asm===rec.asm);
 if(!a||!expected.every(k=>a.lites.has(k)))return;
 if(station!==mu){a.recs.forEach(r=>{r.joined=true;});return;}
 const used=new Set(all.filter(x=>x.unit&&!x.broken).map(x=>x.unit));let n=1;while(used.has(n))n++;
 a.recs.forEach(r=>{r.unit=n;});
}
/* Отмена скана на станции слияния: сборка снова открыта. */
function stationAsmReopen(rec){
 if(!rec||!rec.asm)return;
 (DB.stationScan||[]).forEach(s=>{if(s.asm===rec.asm){delete s.unit;delete s.joined;}});
}
/* Остальные стёкла юнита после станции слияния. */
function stationUnitMates(g,merge){
 const a=stationAsmOf(g,merge);if(!a||!a.unit||a.broken)return [];
 return [...a.lites.values()].filter(id=>id!==g.id).map(id=>({id}));
}
/* Ламинат: плиты одного лайта — по номеру стекла, как и раньше. */
function stationPlyMates(g){
 const lam=salesRouteStationOf('lamination','LAM'),assembly=stationAsmOf(g,lam);
 if(assembly&&assembly.complete&&!assembly.broken)return [...assembly.lites.values()].filter(id=>id!==g.id).map(id=>({id}));
 if(typeof g.unit!=='number'||!g.c)return [];
 const pieces=glassPieceMap(g.o.id);
 return glassBatchComponents(g.o,g.l).filter(c=>!c.missing&&c.key!==g.c.key&&c.index===g.c.index).map(c=>{const rec=pieces.get(c.key),id=rec&&rec.ids[g.unit-1];return id?{id}:null;}).filter(Boolean);
}
function stationMatesAt(g,station){
 if(!g||!g.c)return [];
 const route=stationRouteOf(g).codes,is=stationRouteStep(route,station,stationPlace(g).far);if(is<0)return [];
 const mu=stationUnitMerge(g.o,g.l),lam=typeof salesRouteStationOf==='function'?salesRouteStationOf('lamination','LAM'):'LAM';
 if(mu&&route.indexOf(mu)>=0&&is>route.indexOf(mu))return stationUnitMates(g,mu);
 if(g.c.ply&&route.indexOf(lam)>=0&&is>route.indexOf(lam))return stationPlyMates(g);
 return [];
}
/* Скан стикера U-: после станции слияния — весь юнит с этим номером. */
function stationUnitCheck(station,code){
 const u=glassLookup(code);if(!u)return {kind:'unknown',code};
 const o=salesRecord(u.orderId),l=o&&(o.lines||[]).find(x=>x.id===u.lineId);if(!o||!l)return {kind:'unknown',code};
 const mu=stationUnitMerge(o,l),a=mu?stationAsms(o,l,mu).find(x=>x.unit===u.unit&&!x.broken):null;
 const first=a?stationGlass([...a.lites.values()][0]):null,route=first?stationRouteOf(first).codes:[];
 /* Юнит ещё не собран (лайт в перерезке, в пути) — так и сказать, а не
    «Unit number» (проход 7.10.2026: U-0000028 на SHIPR). */
 if(!a)return {kind:'unit',code,open:mu||''};
 if(route.lastIndexOf(station)<=route.indexOf(mu))return {kind:'unit',code};
 const ids=[...a.lites.values()],checks=ids.map(id=>stationCheck(station,id)),main=checks.find(c=>STATION_RECORDED.includes(c.kind))||checks[0];
 return Object.assign(main,{unitCode:code,mates:ids.filter(id=>id!==main.code)});
}
/* Остальные стёкла изделия пишутся тем же сканом — если ждут здесь же. */
function stationRecordMates(station,check,who,opts){
 return (check&&check.mates||[]).map(id=>{const c=stationCheck(station,id);return c&&STATION_RECORDED.includes(c.kind)?stationRecord(station,c,who,Object.assign({},opts,{deferTouch:true,actionId:check.actionId,now:opts&&opts.now||check.recordedAt})):null;}).filter(Boolean);
}
/* Какое стекло отметить разбитым, когда пару забраковали у света, не
   сканируя: лайты позиции взаимозаменяемы — берём то, что ждёт здесь
   дольше всех, иначе то, что ближе всех к станции. */
/* mates — стёкла сборки {key, unit}: пара берётся из стекла, которое к ним
   подходит по чертежу. */
function stationPairCandidate(o,l,key,station,mates){
 const inAsm=id=>stationScansFor(id).some(s=>s.asm&&s.station===station),same=g=>(mates||[]).every(m=>stationDrawingFits(o,l,m,{key,unit:g.unit}));
 const here=(stationWaiting().get(station)||[]).filter(x=>x.g.l.id===l.id&&x.g.c&&x.g.c.key===key&&!inAsm(x.id)&&same(x.g));
 if(here.length)return here[0].id;
 const rec=(DB.glassPiece||[]).find(x=>x.key===key);if(!rec)return '';
 const ids=rec.ids.concat(...Object.values(rec.extra||{})).filter(Boolean).map(id=>stationGlass(id)).filter(g=>g&&!inAsm(g.id)&&same(g));
 const live=ids.map(g=>({g,p:stationPlace(g)})).filter(x=>!x.p.broken&&!x.p.shipped).sort((a,b)=>b.p.far-a.p.far);
 return live.length?live[0].g.id:'';
}
/* Вынутые из сборки стёкла ждут пару: последняя запись — park. */
function stationParked(filter){
 const last=new Map();(DB.stationScan||[]).forEach(s=>{if(!s.undoneAt)last.set(s.piece,s);});
 const index=stationPieceIndex(),out=[];
 last.forEach((s,piece)=>{if(!s.park)return;const hit=index.get(piece);if(!hit||filter&&!filter(hit,s))return;out.push({id:piece,hit,rec:s});});
 return out.sort((a,b)=>String(a.rec.at).localeCompare(String(b.rec.at)));
}
/* На станции слияния — что в сборке уже есть, чего ждёт и где его взять. */
function stationUnitStatus(g,station){
 if(!g||!g.c||stationUnitMerge(g.o,g.l)!==station)return null;
 const a=stationAsmOf(g,station);if(!a||a.broken)return null;
 const index=stationPieceIndex(),waiting=stationWaiting().get(station)||[],fits=(key,unit)=>stationAsmFits(a,g.o,g.l,index,{key,unit});
 const lites=glassBatchComponents(g.o,g.l).filter(c=>!c.missing).map(c=>{
  const id=a.lites.get(c.key),base={lite:c.lite,glass:c.glass,key:c.key};
  if(id)return Object.assign(base,{here:true,id});
  const park=stationParked((h)=>h.orderId===g.o.id&&h.lineId===g.l.id&&h.key===c.key&&fits(h.key,h.unit))[0];
  if(park)return Object.assign(base,{here:false,parked:park.rec.on||'set aside',parkId:park.id});
  const n=waiting.filter(x=>x.g.l.id===g.l.id&&x.g.c&&x.g.c.key===c.key&&fits(c.key,x.g.unit)&&!stationScansFor(x.id).some(s=>s.asm&&s.station===station)).length;
  return Object.assign(base,{here:false,waitingHere:n});
 });
 lites.sort((x,y)=>String(x.lite).localeCompare(String(y.lite),undefined,{numeric:true}));
 return {unit:a.unit&&typeof unitIdAt==='function'?unitIdAt(g.o.id,g.l.id,a.unit):'',n:a.unit,of:g.l.qty,lites,complete:!!a.unit,asm:a.asm};
}
