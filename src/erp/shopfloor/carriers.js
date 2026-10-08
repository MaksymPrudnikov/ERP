/* =====================================================================
   erp/shopfloor/carriers  ·  carriers-1.0
   Долли и скиды: тара, на которой стекло едет между станциями.
   IN : DB.stationScan (поле on у скана)
   OUT: DB.carrier {code, note, active}
   Владелец, 29 сентября 2026:
   - «нужно L A shape dolly & skids… если мне нужно срочно найти, система
     скажет L-34, и я знаю, какой формы искать»; скиды тоже бывают L и A →
     четыре типа, код говорит оба признака: DL, DA, SL, SA;
   - «сначала скан скида или долли и потом то, что на ней»;
   - «иногда 2 долли свободно, иногда 3 — решает человек»: система не
     назначает тару, она записывает, на что положили.
   Префикс S- занят остатками стока (S-0000001) — у скидов вторая буква
   формы, спутать нельзя.
   Где стекло физически: последний скан стекла с полем on — оно лежит на этой
   таре, пока его не отсканируют снова.
   ===================================================================== */
DEFAULT.carrier=[];
const CARRIER_TYPES=[
 {k:'DL',kind:'Dolly',shape:'L',label:'L-shape dolly'},
 {k:'DA',kind:'Dolly',shape:'A',label:'A-shape dolly'},
 {k:'SL',kind:'Skid',shape:'L',label:'L-shape skid'},
 {k:'SA',kind:'Skid',shape:'A',label:'A-shape skid'}
];
const CARRIER_RE=/^(DL|DA|SL|SA)-([1-9]\d{0,4})$/;
function carrierCode(v){return String(v==null?'':v).trim().toUpperCase().replace(/\s+/g,'');}
function carrierType(code){const m=CARRIER_RE.exec(carrierCode(code));return m?CARRIER_TYPES.find(t=>t.k===m[1]):null;}
function carrierFind(code){const c=carrierCode(code);return (DB.carrier||[]).find(x=>x.code===c)||null;}
/* Номер — следующий внутри своего типа: DL-1, DL-2… и отдельно DA-1… */
function carrierAdd(prefix,count,opts){if(storageDepth||opts&&opts.deferTouch)return carrierAddCommand(prefix,count,opts);const out=storageCommand(()=>carrierAddCommand(prefix,count,opts));return out.ok?out.value:{error:out.error};}
function carrierAddCommand(prefix,count,opts){
 opts=opts||{};const t=CARRIER_TYPES.find(x=>x.k===prefix);if(!t)return {error:'Unknown type.'};
 const n=Math.max(1,Math.min(50,Math.floor(+count)||1));if(!Array.isArray(DB.carrier))DB.carrier=[];
 let top=DB.carrier.reduce((m,c)=>{const x=CARRIER_RE.exec(c.code);return x&&x[1]===prefix?Math.max(m,+x[2]):m;},0);
 const made=[];for(let i=0;i<n;i++){const code=prefix+'-'+(++top);DB.carrier.push({code,note:'',active:true});made.push(code);}
 if(!opts.deferTouch)touch();return {codes:made};
}
function carrierSet(code,field,value){const out=storageCommand(()=>carrierSetCommand(code,field,value));return out.ok&&out.value;}
function carrierSetCommand(code,field,value){
 const c=carrierFind(code);if(!c)return false;
 if(field==='active')c.active=!!value;else if(field==='note')c.note=String(value==null?'':value).slice(0,80);else return false;
 touch();return true;
}
/* Что сейчас на таре: стекло, чей последний скан положил его на неё, и
   которое с тех пор не сканировали, не разбили и не отгрузили. */
function carrierContents(){
 /* Сканы стекла собираются одним проходом: иначе каждое стекло на таре
    заново перебирало весь журнал (на SHIP — на каждый скан скида). */
 const last=new Map(),scans=new Map(),out=new Map();
 (DB.stationScan||[]).forEach(s=>{if(s.undoneAt)return;last.set(s.piece,s);if(!scans.has(s.piece))scans.set(s.piece,[]);scans.get(s.piece).push(s);});
 const index=stationPieceIndex(),batches=stationBatchIndex();
 last.forEach((s,piece)=>{
  if(!s.on||s.broken)return;
  const g=stationGlass(piece,index,batches);if(!g||unitPieceCancelled(g))return;
  const place=stationPlace(g,scans.get(piece));if(place.broken||place.shipped)return;
  if(!out.has(s.on))out.set(s.on,[]);
  out.get(s.on).push({id:piece,g,place,scan:s});
 });
 /* Стопка: сверху — положенное последним. */
 out.forEach(list=>list.sort((a,b)=>String(b.scan.at).localeCompare(String(a.scan.at))||b.scan.id.localeCompare(a.scan.id)));
 return out;
}
/* Обнулить тару: всё, что на ней лежит, становится «без тары» — как «Not on
   DL-1» у одного стекла. Скид пересобирают заново теми же сканами (владелец,
   6.10.2026). Отгруженное и погруженное на таре уже не числится. */
/* Отменённое стекло в содержимом скида не видно, но скид на SHIP держит
   (unitOnSkid): обнулённый скид пуст и от него — иначе «призрак» не дал бы
   грузить скид, пока кто-то не наберёт номер выброшенного стекла. */
/* Любая тара на любой станции и в Master Data (владелец, 7.10.2026: «опция на
   скид или на долли — стереть всё, что на ней, иначе много лишнего
   подвиснет»). Рядом со сканом — откуда, кто и когда (moved), как у
   переноса; Undo возвращает. */
function carrierEmpty(code,who){const out=storageCommand(()=>{
 const c=carrierCode(code),list=carrierContents().get(c)||[],now=new Date().toISOString(),was=[],off=[];
 list.forEach(x=>{was.push({id:x.scan.id,on:x.scan.on||'',moved:x.scan.moved||null});x.scan.moved={from:c,at:now,by:String(who&&who.name||'')};delete x.scan.on;});
 const ghosts=typeof unitOnSkid==='function'?unitOnSkid(c):[];ghosts.forEach(x=>{off.push({orderId:x.o.id,pieces:x.u.pieces.slice(),off:(x.u.off||[]).slice()});x.u.off=[...new Set((x.u.off||[]).concat(x.pieces))];x.o.updatedAt=now;salesSyncRecordLifecycle(x.o);});
 return {code:c,count:list.length+ghosts.reduce((n,x)=>n+x.pieces.length,0),was,off};
});return out.ok?out.value:{error:out.error};}
/* Undo обнуления: тара возвращается тем сканам, что так и остались без тары. */
function carrierEmptyUndo(r){
 const out=storageCommand(()=>{
  const by=new Map((DB.stationScan||[]).map(s=>[s.id,s])),last=new Map();(DB.stationScan||[]).forEach(s=>{if(!s.undoneAt)last.set(s.piece,s);});let n=0;
  (r&&r.was||[]).forEach(w=>{const s=by.get(w.id);if(!s||s.undoneAt||s.on||last.get(s.piece)!==s)return;s.on=w.on;if(w.moved)s.moved=w.moved;else delete s.moved;n++;});
  (r&&r.off||[]).forEach(w=>{const o=salesRecord(w.orderId),u=o&&(o.cancellations||[]).flatMap(c=>c.units).find(u=>u.pieces.join()===w.pieces.join());if(!u)return;u.off=w.off;if(!u.off.length)delete u.off;o.updatedAt=new Date().toISOString();salesSyncRecordLifecycle(o);n++;});
  if(!n)throw new Error('Nothing to undo.');
  return n;
 });
 return out.ok?out.value:{error:out.error};
}
/* Перенос стёкол на другую тару — исправление ошибки рабочего (владелец,
   6 октября 2026: «он знает, что на долли №3 у него 30 стёкол этого батча,
   выбирает с 31 по 60 и говорит: это на №4»; «ошибку можно исправить»).
   Меняется тара последнего скана каждого стекла, рядом — откуда, кто и
   когда (moved). Стекло на packing slip не переносится: его скид грузят
   по своим правилам. Возвращает, что было, — для Undo. */
function carrierMove(pieces,to,who){
 const out=storageCommand(()=>{
  const c=carrierFind(to);if(!c||!c.active)throw new Error('Unknown dolly or skid.');
  const last=new Map();(DB.stationScan||[]).forEach(s=>{if(!s.undoneAt)last.set(s.piece,s);});
  const now=new Date().toISOString(),was=[];
  (pieces||[]).forEach(p=>{
   const s=last.get(p);if(!s||s.broken||s.on===c.code)return;
   if(typeof shippingActive==='function'&&(DB.shipment||[]).some(x=>shippingActive(x)&&x.items.some(i=>i.pieces.includes(p))))throw new Error('Glass is on a packing slip — not moved.');
   was.push({id:s.id,on:s.on||'',moved:s.moved||null});
   s.moved={from:s.on||'',at:now,by:String(who&&who.name||'')};s.on=c.code;
  });
  if(!was.length)throw new Error('Nothing to move.');
  return {to:c.code,was};
 });
 return out.ok?out.value:{error:out.error};
}
/* Undo переноса: тара возвращается тем сканам, что всё ещё на новой таре. */
function carrierMoveUndo(move){
 const out=storageCommand(()=>{
  const by=new Map((DB.stationScan||[]).map(s=>[s.id,s]));let n=0;
  (move&&move.was||[]).forEach(w=>{const s=by.get(w.id);if(!s||s.undoneAt||s.on!==move.to)return;if(w.on)s.on=w.on;else delete s.on;if(w.moved)s.moved=w.moved;else delete s.moved;n++;});
  if(!n)throw new Error('Nothing to undo.');
  return n;
 });
 return out.ok?out.value:{error:out.error};
}
function normalizeCarriers(){
 if(!Array.isArray(DB.carrier))DB.carrier=[];
 const seen=new Set();
 DB.carrier=DB.carrier.filter(c=>c&&typeof c==='object'&&CARRIER_RE.test(carrierCode(c.code))&&!seen.has(carrierCode(c.code))&&(seen.add(carrierCode(c.code)),true))
  .map(c=>({code:carrierCode(c.code),note:String(c.note==null?'':c.note).slice(0,80),active:c.active!==false}));
}
function validateCarrierPayload(src){
 if(src&&Object.prototype.hasOwnProperty.call(src,'carrier')&&!Array.isArray(src.carrier))throw new Error('The "carrier" field must be an array.');
}
