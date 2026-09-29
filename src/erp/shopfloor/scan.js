/* =====================================================================
   erp/shopfloor/scan  ·  scan-1.0
   Журнал сканов станций и «где стекло ждёт».
   IN : DB.glassPiece · DB.glassBatch · маршрут стекла (stkRoute)
   OUT: DB.stationScan — {id, at, piece, station, by, byId, manual,
        undoneAt, undoneBy[, on, confirmedAt, broken, recut, reason]} · DB.sheetBreak
   confirmedAt — станцию не отсканировали, работу подтвердил рабочий следующей.
   on — долли или скид, на которую положили стекло (erp/shopfloor/carriers).
   Правило: место стекла НЕ хранится, а считается: последний скан +
   маршрут = станция, на которой стекло ждёт. Так было и в Spil —
   «с батча попало на рез и находится в ожидании на следующей станции»
   (владелец, 29 сентября 2026). Запись одна на событие: это готовая
   строка будущей таблицы базы, переезд с localStorage её не меняет.

   Отмена скана (Undo) запись не удаляет, а помечает: журнал — история,
   и «кто отсканировал по ошибке» тоже её часть.
   ===================================================================== */
DEFAULT.stationScan=[];DEFAULT.stationScanSeq=0;DEFAULT.sheetBreak=[];
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
function stationRouteOf(g){
 const key=[g.o.id,g.l.id,g.c?g.c.key:'',g.o.updatedAt||''].join('|');
 if(stationRouteCache.has(key))return stationRouteCache.get(key);
 let r=null;
 try{if(g.c&&!g.c.missing)r=finWithOrder(g.o,()=>stkRoute(g.o,g.l,g.c));}catch(e){r=null;}
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
   следующая. Пройдено всё — стекло отгружено. */
function stationPlace(g,scans){
 const route=stationRouteOf(g).codes;scans=scans||stationScansFor(g.id);
 let far=-1;scans.forEach(s=>{if(s.broken)return;const i=route.indexOf(s.station);if(i>far)far=i;});
 /* Разбитое стекло выходит из маршрута: станции его больше не ждут, вместо
    него едет стекло Recut со своим номером. */
 const broken=scans.find(s=>s.broken)||null;
 if(broken)return {route,far,waiting:'',shipped:false,broken};
 return {route,far,waiting:far+1<route.length?route[far+1]:'',shipped:route.length>0&&far===route.length-1};
}
/* Разбор скана без записи. kind:
   ok · hold — пишется; already · passed · skipped · route · cancelled ·
   unit · unknown — только показывается. */
function stationCheck(station,raw){
 const code=stationCodeOf(raw);
 if(!code)return null;
 if(typeof carrierType==='function'&&carrierType(code))return {kind:'carrier',code};
 if(typeof unitIdValid==='function'&&unitIdValid(code))return stationUnitCheck(station,code);
 if(!glassPieceValid(code))return {kind:'unknown',code};
 const g=stationGlass(code);
 if(!g)return {kind:'unknown',code};
 const scans=stationScansFor(code),place=stationPlace(g,scans),here=scans.filter(s=>s.station===station).pop()||null;
 const base={code,g,scans,place,here,stock:!g.entry,priority:g.o.priority||'normal',due:g.o.dueDate||''};
 if(g.o.status==='cancelled')return Object.assign(base,{kind:'cancelled'});
 if(place.broken)return Object.assign(base,{kind:'broken'});
 if(here)return Object.assign(base,{kind:'already'});
 const i=place.route.indexOf(station),w=place.route.indexOf(place.waiting);
 if(i<0)return Object.assign(base,{kind:'route'});
 if(place.shipped||w>=0&&i<w)return Object.assign(base,{kind:'passed'});
 if(w>=0&&i>w)return Object.assign(base,{kind:'skipped',missed:place.route.slice(w,i)});
 base.mates=stationMatesAt(g,station).map(x=>x.id);
 if(g.o.onHold||g.l.onHold)return Object.assign(base,{kind:'hold',reason:(g.o.onHold?g.o.holdReason:g.l.holdReason)||''});
 return Object.assign(base,{kind:'ok'});
}
/* who: {id, name} — рабочий, вошедший на станцию. */
function stationRecord(station,check,who,opts){
 opts=opts||{};
 if(!check||!STATION_RECORDED.includes(check.kind))return null;
 if(!Array.isArray(DB.stationScan))DB.stationScan=[];
 const now=opts.now||new Date().toISOString();
 const rec={id:stationScanNextId(),at:now,piece:check.code,station,by:String(who&&who.name||''),byId:String(who&&who.id||''),manual:!!opts.manual,undoneAt:'',undoneBy:''};
 if(opts.on&&typeof carrierFind==='function'&&carrierFind(opts.on))rec.on=carrierCode(opts.on);
 if(opts.confirmedAt)rec.confirmedAt=sfCode(opts.confirmedAt);
 DB.stationScan.push(rec);
 /* Скан резки ставит «резка началась» ОДНОМУ стеклу, а не всей позиции:
    позиция узнаёт это через glassBatchSyncLine, как и прежде. */
 const e=check.g&&check.g.entry;
 if(station===stationCutCode()&&e&&!e.item.cutStartedAt){e.item.cutStartedAt=now;glassBatchSyncLine(check.g.o,check.g.l);}
 if(!opts.deferTouch)touch();
 return rec;
}
/* Undo — только последний скан стекла: отменить CUT, когда стекло уже
   прошло EDGE, значило бы оставить его «на EDGE без реза». */
function stationUndo(id,who,opts){
 opts=opts||{};
 const rec=(DB.stationScan||[]).find(s=>s.id===id);
 if(!rec||rec.undoneAt)return {error:'Scan not found.'};
 if(rec.broken)return {error:'Recut is in the order — change it there.'};
 const last=stationScansFor(rec.piece).sort((a,b)=>String(a.at).localeCompare(String(b.at))||String(a.id).localeCompare(String(b.id))).pop();
 if(last!==rec)return {error:'Glass has moved on — undo the later scan first.'};
 rec.undoneAt=opts.now||new Date().toISOString();rec.undoneBy=String(who&&who.name||'');
 if(rec.station===stationCutCode()&&!stationScansFor(rec.piece).some(s=>s.station===rec.station)){
  const e=stationBatchIndex().get(rec.piece);
  if(e&&e.item.cutStartedAt===rec.at){
   e.item.cutStartedAt='';
   const o=salesRecord(e.part.orderId),l=o&&(o.lines||[]).find(x=>x.id===e.part.lineId);
   if(o&&l)glassBatchSyncLine(o,l);
  }
 }
 if(!opts.deferTouch)touch();
 return {ok:true};
}
/* Экран офиса: сколько стёкол ждёт на каждой станции и какие. Берём все
   стёкла активных батчей и все, у кого уже есть скан (порезанные из стока
   тоже едут по цеху). Отгруженные и отменённые — не в цеху. */
function stationWaiting(){
 const index=stationPieceIndex(),batches=stationBatchIndex(),byPiece=new Map();
 (DB.stationScan||[]).forEach(s=>{if(s.undoneAt)return;if(!byPiece.has(s.piece))byPiece.set(s.piece,[]);byPiece.get(s.piece).push(s);});
 const ids=new Set([...batches.keys(),...byPiece.keys()]),out=new Map();
 ids.forEach(id=>{
  const g=stationGlass(id,index,batches);if(!g||g.o.status==='cancelled')return;
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
 const ids=new Set(),iso=v=>typeof v==='string'&&!Number.isNaN(Date.parse(v));
 DB.stationScan=DB.stationScan.filter(s=>s&&typeof s==='object'&&STATION_SCAN_ID_RE.test(String(s.id))&&!ids.has(s.id)&&glassPieceValid(s.piece)&&iso(s.at)&&typeof s.station==='string'&&s.station.trim()&&(ids.add(s.id),true))
  .map(s=>({id:s.id,at:s.at,piece:s.piece,station:sfCode(s.station),by:String(s.by==null?'':s.by).slice(0,80),byId:String(s.byId==null?'':s.byId).slice(0,80),manual:s.manual===true,
   undoneAt:iso(s.undoneAt)?s.undoneAt:'',undoneBy:iso(s.undoneAt)?String(s.undoneBy==null?'':s.undoneBy).slice(0,80):'',
   ...(typeof s.on==='string'&&typeof CARRIER_RE!=='undefined'&&CARRIER_RE.test(s.on)?{on:s.on}:{}),
   ...(typeof s.confirmedAt==='string'&&SF_CODE_RE.test(sfCode(s.confirmedAt))?{confirmedAt:sfCode(s.confirmedAt)}:{}),
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
function stationBreak(station,check,who,reasonId,opts){
 opts=opts||{};
 if(!check||!check.g||!['ok','hold','already','passed','skipped','route','peek'].includes(check.kind))return {error:'Scan the broken glass first.'};
 const g=check.g,o=g.o,l=g.l,c=g.c;
 if(!c||c.missing)return {error:'Glass not found in the order.'};
 const panes=((salesMakeupById(o,l.makeupId)||{}).panes||[]);
 const which=panes.length<2?'unit':String(c.index);
 const made=recutCreate({orderId:o.id,where:station,reasonId,lines:{[l.id]:{on:true,qty:1,which}},note:'Glass '+g.id+' at '+station});
 if(made.error)return made;
 const r=made.recuts[0],now=r.createdAt,ref='R'+r.no;
 const rec=(DB.glassPiece||[]).find(x=>x.key===c.key),fresh=rec&&rec.extra&&rec.extra[ref]?rec.extra[ref].filter(Boolean):[];
 if(!Array.isArray(DB.stationScan))DB.stationScan=[];
 DB.stationScan.push({id:stationScanNextId(),at:now,piece:g.id,station,by:String(who&&who.name||''),byId:String(who&&who.id||''),manual:false,undoneAt:'',undoneBy:'',broken:true,recut:ref,reason:r.reason});
 /* Разбилось на резе — стекло всё равно порезано: лист закрывается. */
 const e=g.entry;if(station===stationCutCode()&&e&&!e.item.cutStartedAt){e.item.cutStartedAt=now;glassBatchSyncLine(o,l);}
 if(!opts.deferTouch)touch();
 return {ok:true,recut:r,ref,newIds:fresh};
}
/* Лопнул лист на столе — режут ту же раскладку заново, стикеры те же
   (владелец, 29.09.2026). Система только записывает потерю листа. */
function stationSheetBreak(batch,glass,sheetNo,who,opts){
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
 DB=next;stationRouteCache=new Map();
 const a=document.activeElement,typing=a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&!(a.dataset&&a.dataset.stationScan!==undefined&&!a.value);
 if(!typing)render();
 return true;
}
window.addEventListener('storage',function(e){
 if(e.key!=='glazing_system_v1'||typeof e.newValue!=='string')return;
 storageLiveReload(e.newValue);
});
/* «Не на эту долли» — стекло понесли в руках (Critical: отложить или отнести
   сразу). Скан остаётся, пропадает только тара. */
function stationScanOff(id){
 const rec=(DB.stationScan||[]).find(s=>s.id===id&&!s.undoneAt);if(!rec||!rec.on)return false;
 delete rec.on;touch();return true;
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
 const svc=(stationRouteOf(check.g).services||[]).filter(s=>(check.missed||[]).includes(s.station));
 return svc.map(s=>({station:s.station,text:s.text}));
}
function stationConfirmSkipped(station,code,who,opts){
 opts=opts||{};
 const check=stationCheck(station,code);
 if(!check||check.kind!=='skipped')return {error:'Nothing to confirm.'};
 const now=opts.now||new Date().toISOString();
 check.missed.forEach(m=>stationRecord(m,{kind:'ok',code,g:check.g},who,{deferTouch:true,manual:true,confirmedAt:station,now}));
 const after=stationCheck(station,code);
 const rec=STATION_RECORDED.includes(after.kind)?stationRecord(station,after,who,{deferTouch:true,on:opts.on,now}):null;
 const mates=rec?stationRecordMates(station,after,who,{deferTouch:true,on:opts.on,now}):[];
 touch();
 return {ok:true,check:after,rec,mates,confirmed:check.missed};
}

/* ---------------------------------------------------------------------
   Юнит после сборки. Владелец, 29.09.2026: после IGU юнит двигается одним
   сканом — и по стикеру U-, и по любому стикеру G- этого юнита. До точки
   слияния стёкла едут каждое само по себе; после неё скан одного стекла
   отмечает всё изделие. Ламинат: плиты одного лайта сходятся на LAM.
   Стёкла Recut (место R1.1) к изделию не привязаны — сканируются сами.
   --------------------------------------------------------------------- */
function stationUnitMerge(o,l){const m=salesMakeupById(o,l.makeupId);return m&&typeof salesRouteMerge==='function'?salesRouteMerge(m.unitType,m.panes):'';}
function stationUnitMates(g){
 if(typeof g.unit!=='number'||!g.c)return [];
 const pieces=glassPieceMap(g.o.id),batches=stationBatchIndex();
 return glassBatchComponents(g.o,g.l).filter(c=>!c.missing&&c.key!==g.c.key).map(c=>{const rec=pieces.get(c.key),id=rec&&rec.ids[g.unit-1];return id?{id,o:g.o,l:g.l,c,unit:g.unit,entry:batches.get(id)||null}:null;}).filter(Boolean);
}
function stationMatesAt(g,station){
 if(!g||!g.c||typeof g.unit!=='number')return [];
 const route=stationRouteOf(g).codes,is=route.indexOf(station);if(is<0)return [];
 const mu=stationUnitMerge(g.o,g.l),lam=typeof salesRouteStationOf==='function'?salesRouteStationOf('lamination','LAM'):'LAM',mates=stationUnitMates(g);
 if(mu&&route.indexOf(mu)>=0&&is>route.indexOf(mu))return mates;
 if(g.c.ply&&route.indexOf(lam)>=0&&is>route.indexOf(lam))return mates.filter(x=>x.c.index===g.c.index);
 return [];
}
/* Скан стикера U-: на точке слияния и после неё — всё изделие разом. */
function stationUnitCheck(station,code){
 const u=glassLookup(code);if(!u)return {kind:'unknown',code};
 const o=salesRecord(u.orderId),l=o&&(o.lines||[]).find(x=>x.id===u.lineId);if(!o||!l)return {kind:'unknown',code};
 const pieces=glassPieceMap(o.id),ids=glassBatchComponents(o,l).filter(c=>!c.missing).map(c=>{const r=pieces.get(c.key);return r&&r.ids[u.unit-1];}).filter(Boolean);
 if(!ids.length)return {kind:'unknown',code};
 const mu=stationUnitMerge(o,l),first=stationGlass(ids[0]),route=first?stationRouteOf(first).codes:[],im=route.indexOf(mu),is=route.indexOf(station);
 if(!mu||im<0||is<im)return {kind:'unit',code};
 /* Главное стекло карточки — первое, которое здесь ждёт. */
 const checks=ids.map(id=>stationCheck(station,id)),main=checks.find(c=>STATION_RECORDED.includes(c.kind))||checks[0];
 return Object.assign(main,{unitCode:code,mates:ids.filter(id=>id!==main.code)});
}
/* Остальные стёкла изделия пишутся тем же сканом — если ждут здесь же. */
function stationRecordMates(station,check,who,opts){
 return (check&&check.mates||[]).map(id=>{const c=stationCheck(station,id);return c&&STATION_RECORDED.includes(c.kind)?stationRecord(station,c,who,Object.assign({},opts,{deferTouch:true})):null;}).filter(Boolean);
}
/* На точке слияния — что из изделия уже здесь, а что ещё в пути. */
function stationUnitStatus(g,station){
 if(!g||typeof g.unit!=='number'||stationUnitMerge(g.o,g.l)!==station)return null;
 const all=[{id:g.id,c:g.c}].concat(stationUnitMates(g).map(x=>({id:x.id,c:x.c}))).map(x=>{
  const gg=stationGlass(x.id),scans=stationScansFor(x.id),here=scans.some(s=>s.station===station&&!s.broken),place=gg?stationPlace(gg,scans):null;
  return {id:x.id,lite:x.c.lite,glass:x.c.glass,here,waiting:place?place.waiting:'',broken:!!(place&&place.broken)};
 });
 all.sort((a,b)=>String(a.lite).localeCompare(String(b.lite),undefined,{numeric:true}));
 return {unit:typeof unitIdAt==='function'?unitIdAt(g.o.id,g.l.id,g.unit):'',n:g.unit,of:g.l.qty,lites:all,complete:all.every(x=>x.here)};
}
