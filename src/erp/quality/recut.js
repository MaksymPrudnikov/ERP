/* =====================================================================
   erp/quality/recut  ·  recut-1.0
   Recut — брак до выдачи заказа клиенту. Это часть заказа, а не NCR: новые
   стёкла позиции уходят в To batch этого же заказа, и заказ не выдаётся, пока
   их не отправят в батч. NCR — повреждение после выдачи (erp/quality/ncr).
   IN : DB.salesOrder, DB.ncrReason
   OUT: DB.recut {id, orderId, no, createdAt, lineId, line, mark, which, lite,
        keys, qty, where, reasonId, reason, note}; места стёкол «ключ|R1.k»
   Владелец, 17 сентября 2026: «Recut — это то, что можно решить, пока заказ
   ещё не выдан, и он должен упасть в заказ; NCR — повредили при
   транспортировке, скретч внутри стекла по нашей вине, поцарапанное»; кнопка
   доступна сразу — «вдруг я дал стикер резать из стока… и потом он сломался»;
   нумерация внутри заказа, отдельный блок над Notes. Следующий этап — окно
   RECUT на станции производства: сломалось — ввели — ушло в батч.
   ===================================================================== */
DEFAULT.recut=[];
const RECUT_OPEN_STATUSES=['new','verified','batched','ready','shipping'];
function recutForOrder(orderId){return (DB.recut||[]).filter(r=>r.orderId===orderId).sort((a,b)=>a.no-b.no);}
function recutCanOpen(o){return !!o&&!salesIsQuote(o)&&!!salesRecord(o.id)&&RECUT_OPEN_STATUSES.includes(o.status);}
function recutNextNo(orderId){return (DB.recut||[]).filter(r=>r&&r.orderId===orderId).reduce((n,r)=>Math.max(n,+r.no||0),0)+1;}
function recutSlots(r){
 return (r&&r.keys||[]).flatMap(key=>Array.from({length:Math.max(0,Math.floor(+r.qty)||0)},(_,i)=>({key,lineId:r.lineId,unit:'R'+r.no+'.'+(i+1),k:i+1,of:+r.qty,ref:'R'+r.no,label:'Recut '+r.no})));
}
function recutSlotsFor(orderId,lineId){return (DB.recut||[]).filter(r=>r&&r.orderId===orderId&&(!lineId||r.lineId===lineId)).flatMap(recutSlots);}
/* «Recut 1 · 2 of 3» по месту стекла; старые места NCR1001.2 — до переноса. */
function recutUnitText(unit,of){const [ref,k]=String(unit).split('.');return 'Recut '+(ref.startsWith('R')?ref.slice(1):ref)+' · '+k+' of '+(of||'?');}
function recutStatus(r){
 const active=glassBatchActive(r.orderId),slots=recutSlots(r),pending=slots.some(s=>!active.has(s.key+'|'+s.unit));
 return pending?'In queue':'Batched · '+[...new Set(slots.map(s=>active.get(s.key+'|'+s.unit).batch.number))].join(', ');
}
/* ---------- Свой чертёж Recut ----------
   Владелец, 7 октября 2026 (заказ 76004: позиции 13–24 порезаны по неверному
   чертежу, Recut 1–12 «Office · Drawing wrong»): «в рикат идёт новый шейп и
   новый чертёж — чтобы был трек самой ошибки». Строка заказа, её цена и Work
   order остаются как заказано; стекло Recut режется, клеится и печатается по
   чертежу Recut. Править можно, пока стекло Recut не порезано и не
   отсканировано. Формы — копии в DB.shapeDef с ownerLineId позиции.
   Поля записи: shapeRef, liteShapes, width16, height16 — только у Recut со
   своим чертежом. */
function recutFind(id){return (DB.recut||[]).find(r=>r&&r.id===id)||null;}
function recutHasShape(r){return !!(r&&r.shapeRef&&r.shapeRef.id);}
/* Место стекла «R3.1» → его Recut. */
function recutOfUnit(orderId,lineId,unit){
 if(typeof unit!=='string'||!/^R\d+\.\d+$/.test(unit))return null;
 const no=+unit.slice(1).split('.')[0];
 return (DB.recut||[]).find(r=>r&&r.orderId===orderId&&r.lineId===lineId&&r.no===no)||null;
}
/* Вид строки только для геометрии: чертёж и размер Recut, остальное — строки.
   Настоящая строка нужна для всего прочего: номер, indexOf, правки. */
/* Правки кромок строки относятся к контуру строки — у чертежа Recut их нет. */
function recutLine(r,l){return recutHasShape(r)&&l?Object.assign({},l,{shapeRef:r.shapeRef,liteShapes:r.liteShapes||{},width16:r.width16,height16:r.height16,serviceOverrides:{pinnedTopology:'',edges:{}}}):l;}
function recutGeoLine(orderId,l,unit){return l?recutLine(recutOfUnit(orderId,l.id,unit),l):l;}
function recutPieces(r){const pieces=glassPieceMap(r.orderId);return recutSlots(r).map(s=>glassPieceAt(pieces.get(s.key),s.unit)).filter(glassPieceValid);}
/* Почему чертёж Recut больше не правится; '' — можно. */
function recutDrawingLock(r){
 const o=r&&salesRecord(r.orderId),l=o&&(o.lines||[]).find(x=>x.id===r.lineId);
 if(!o||!l)return 'Order line not found.';
 const pieces=new Set(recutPieces(r));
 if((DB.glassBatch||[]).some(b=>(b.items||[]).some(i=>i.cutStartedAt&&pieces.has(i.piece))))return 'Recut glass is already cut.';
 if((DB.stationScan||[]).some(s=>s&&!s.undoneAt&&pieces.has(s.piece)))return 'Recut glass is already in production.';
 return '';
}
/* Какую форму открыть: свою форму выбранного лайта, иначе общую. */
function recutDrawingLite(r,view){return r&&/^\d+$/.test(String(r.which))&&salesLineLiteShape(view,+r.which)?+r.which:null;}
/* Запись чертежа — внутри storageCommand. shape — новая форма из редактора.
   Первый свой чертёж копирует формы позиции: остальное стекло Recut остаётся
   по чертежу позиции. Стекло Recut в батче, но не порезано, уходит обратно
   в To batch — батч подсвечивается Re-optimize (glassBatchStale). */
function recutDrawingCommand(id,shape,liteIndex,now){
 const r=recutFind(id),o=r&&salesRecord(r.orderId),l=o&&(o.lines||[]).find(x=>x.id===r.lineId);
 if(!r||!o||!l)return {error:'Recut not found.'};
 const lock=recutDrawingLock(r);if(lock)return {error:lock};
 now=now||new Date().toISOString();
 const ref=s=>normalizeShapeRef({id:s.id,revision:s.revision||0});
 const copy=s=>{const c=normalizeShapeDef(JSON.parse(JSON.stringify(s)));c.id=newShapeId();c.ownerLineId=l.id;DB.shapeDef.push(c);return c;};
 const drop=x=>{const i=x&&x.id?DB.shapeDef.findIndex(s=>s.id===x.id):-1;if(i>=0)DB.shapeDef.splice(i,1);};
 /* Форма из редактора — всегда новая запись: id формы позиции не повторяется. */
 if(!shape.id||DB.shapeDef.some(s=>s&&s.id===shape.id))shape.id=newShapeId();
 shape.ownerLineId=l.id;DB.shapeDef.push(shape);
 const key=liteIndex==null?null:String(liteIndex);
 if(!recutHasShape(r)){
  const base=key==null?shape:copy(salesLineGeometryShape(l)),lites={};
  Object.keys(l.liteShapes||{}).forEach(k=>{const s=k!==key&&salesLineLiteShape(l,+k);if(s)lites[k]=ref(copy(s));});
  if(key!=null)lites[key]=ref(shape);
  r.shapeRef=ref(base);r.liteShapes=lites;
 }else if(key==null){drop(r.shapeRef);r.shapeRef=ref(shape);}
 else{drop((r.liteShapes||{})[key]);r.liteShapes=Object.assign({},r.liteShapes,{[key]:ref(shape)});}
 const main=salesShapeByRef(r.shapeRef),res=main&&ShapeModule.compute(main);
 if(!res||!(res.valid||res.externalFile&&res.sourceValid))return {error:'Check the drawing.'};
 r.shapeRef=salesShapeRefFrom(main);r.width16=Math.round(res.width*16);r.height16=Math.round(res.height*16);
 /* После Undo разрешён новый чертёж: старый замороженный маршрут только
    этого Recut больше не описывает его отверстия и обработку. Lock выше
    гарантирует отсутствие действующих сканов всех его стёкол. */
 const routeKeys=new Set(recutPieces(r).map(id=>stationRouteKey(stationGlass(id))));
 DB.productionRoute=(DB.productionRoute||[]).filter(x=>!routeKeys.has(x.key));
 const active=glassBatchActive(o.id),out=recutSlots(r).map(s=>active.get(s.key+'|'+s.unit)).filter(Boolean),batches=[...new Set(out.map(x=>x.batch.number))];
 if(out.length)glassBatchCancelPieces(out.map(x=>x.item.piece),now,'Recut drawing');
 /* Кэши станций (маршрут, площадь, табло, чертежи) живут по версии заказа. */
 o.updatedAt=now;
 orderLogPush(o,'Recut drawing','Recut '+r.no+' · line '+r.line+(out.length?' · '+out.length+' glass out of '+batches.join(', '):''));
 return {orderId:o.id,recut:r,released:out.length,batches};
}
/* Размер прямоугольного Recut правится прямо в строке блока Recuts, как в
   строке заказа (владелец, 7 октября 2026: «вводил 55 7/8, а должно быть
   55 1/8 — нужно лезть в шейп?»). Фигура и свои формы лайтов — через Shape. */
function recutSizeEditable(r,l){
 const g=recutLine(r,l),s=g&&salesLineGeometryShape(g);
 return !!s&&s.type==='rectangle'&&!(s.features||[]).length&&!shapeIsDxfSource(s)&&!Object.keys(g.liteShapes||{}).length;
}
function recutSizeCommand(id,w16,h16,now){
 const r=recutFind(id),o=r&&salesRecord(r.orderId),l=o&&(o.lines||[]).find(x=>x.id===r.lineId);
 if(!r||!l)return {error:'Recut not found.'};
 if(!recutSizeEditable(r,l))return {error:'Change this drawing with Shape.'};
 const g=recutLine(r,l),base=salesLineGeometryShape(g),s=normalizeShapeDef(JSON.parse(JSON.stringify(base)));
 s.id=newShapeId();s.w=salesDimFrom16(w16);s.h=salesDimFrom16(h16);s.revision=(+base.revision||0)+1;
 if(!recutHasShape(r))s.name='Recut '+r.no+' · Line '+r.line;
 return recutDrawingCommand(id,s,null,now);
}
/* Разбилось стекло Recut со своим чертежом — новый перерез режется по тому
   же чертежу, а не по неверному чертежу позиции. Формы — свои копии. */
function recutInheritDrawing(r,src){
 /* Чертёж Recut одного лайта не годится юниту целиком. */
 if(!recutHasShape(src)||recutHasShape(r)||!(r.keys||[]).every(k=>(src.keys||[]).includes(k)))return false;
 const copy=ref=>{const s=salesShapeByRef(ref);if(!s)return null;const c=normalizeShapeDef(JSON.parse(JSON.stringify(s)));c.id=newShapeId();DB.shapeDef.push(c);return c.id;};
 const main=copy(src.shapeRef);if(!main)return false;
 const lites={};Object.keys(src.liteShapes||{}).forEach(k=>{const id=copy(src.liteShapes[k]);if(id)lites[k]=Object.assign({},src.liteShapes[k],{id});});
 Object.assign(r,{shapeRef:Object.assign({},src.shapeRef,{id:main}),liteShapes:lites,width16:src.width16,height16:src.height16});
 return true;
}
/* Одна позиция формы — один Recut. Всё проверяется до записи. */
function recutCreate(d){
 const o=salesRecord(d&&d.orderId);
 if(!recutCanOpen(o))return {error:'Recut not available'};
 if(d.stamp&&d.stamp!==ncrOrderStamp(o))return {error:'Order changed. Reopen Recut.'};
 const reason=ncrReasonsFor(d.where,{activeOnly:true}).find(r=>r.id===d.reasonId);
 if(!reason)return {error:'Choose where and what happened.'};
 const picks=[];
 for(let i=0;i<o.lines.length;i++){
  const l=o.lines[i],x=d.lines&&d.lines[l.id];if(!x||!x.on)continue;
  const qty=Number(x.qty);if(shippingPrintedQty(o,l)>0&&qty>l.qty-shippingPrintedQty(o,l))return {error:'Packing slip printed — use NCR for those units.'};if(!Number.isInteger(qty)||qty<1||qty>l.qty)return {error:'Line '+(i+1)+': 1 to '+l.qty+' pcs'};
  const which=String(x.which||'unit'),keys=ncrGlassKeys(o,l,which),opt=ncrLiteOptions(o,l).find(v=>v.value===which);
  if(!keys.length||!opt)return {error:'Line '+(i+1)+': choose which glass.'};
  picks.push({lineId:l.id,line:i+1,mark:l.mark||'',which,lite:opt.label,keys,qty});
 }
 if(!picks.length)return {error:'Select the affected glass.'};
 const now=new Date().toISOString();let no=recutNextNo(o.id);
 const made=picks.map(p=>Object.assign({id:salesUid('RC'),orderId:o.id,no:no++,createdAt:now},p,{where:d.where,reasonId:reason.id,reason:reason.name,note:salesString(d.note).slice(0,500)}));
 /* Запись не прошла — Recut не создан, форма остаётся открытой (аудит 05.10.2026). */
 const out=storageCommand(()=>{DB.recut.push(...made);glassPieceEnsure(o);o.updatedAt=now;return true;});
 return out.ok?{recuts:made}:{error:out.error};
}
/* Recut, записанный раньше как действие NCR, переносится в заказ один раз:
   номер внутри заказа, места стёкол NCR1001.k → R1.k, номера стёкол те же. */
function recutMigrateFromNcr(){
 const legacy=(Array.isArray(DB.ncr)?DB.ncr:[]).filter(n=>n&&typeof n==='object'&&n.action==='Recut');
 if(!legacy.length)return;
 legacy.forEach(n=>{
  const old=String(n.number||'');
  (Array.isArray(n.glass)?n.glass:[]).filter(g=>g&&typeof g==='object').forEach(g=>{
   const no=recutNextNo(n.orderId),ref='R'+no,keys=(Array.isArray(g.keys)?g.keys:[]).filter(k=>typeof k==='string');
   DB.recut.push({id:salesUid('RC'),orderId:salesString(n.orderId),no,createdAt:salesString(n.createdAt),lineId:salesString(g.lineId),line:g.line,mark:g.mark,which:g.which,lite:g.lite,keys,qty:g.qty,where:n.where,reasonId:n.reasonId,reason:n.reason,note:n.note});
   keys.forEach(key=>{
    const rec=(DB.glassPiece||[]).find(r=>r&&r.key===key);
    if(rec&&rec.extra&&Array.isArray(rec.extra[old])){rec.extra[ref]=rec.extra[old];delete rec.extra[old];}
    (DB.glassBatch||[]).forEach(b=>(Array.isArray(b&&b.items)?b.items:[]).forEach(it=>{
     const p=(b.parts||[])[it&&it.part];
     if(p&&p.key===key&&typeof it.unit==='string'&&it.unit.startsWith(old+'.')){it.unit=ref+it.unit.slice(old.length);if(p.snapshot&&p.snapshot.recut===old)p.snapshot.recut=ref;}
    }));
   });
  });
 });
 DB.ncr=DB.ncr.filter(n=>!(n&&n.action==='Recut'));
}
function normalizeRecuts(){
 if(!Array.isArray(DB.recut))DB.recut=[];
 recutMigrateFromNcr();
 const ids=new Set();
 DB.recut=DB.recut.filter(r=>r&&typeof r==='object').map(r=>({id:typeof r.id==='string'&&r.id?r.id:salesUid('RC'),orderId:salesString(r.orderId),no:Math.max(1,Math.floor(+r.no)||1),createdAt:salesString(r.createdAt),
  lineId:salesString(r.lineId),line:Math.max(1,Math.floor(+r.line)||1),mark:salesString(r.mark),which:r.which==null?'unit':String(r.which),lite:salesString(r.lite),
  keys:(Array.isArray(r.keys)?r.keys:[]).filter(k=>typeof k==='string'&&k.split('|').length===4),qty:Math.max(1,Math.floor(+r.qty)||1),
  where:salesString(r.where).toUpperCase(),reasonId:salesString(r.reasonId),reason:ncrName(r.reason),note:salesString(r.note).slice(0,500),
  /* Свой чертёж — только у тех, кому его дали: старые записи не меняются. */
  ...(r.shapeRef&&typeof r.shapeRef==='object'&&salesRefId(r.shapeRef.id)&&salesStoredDim16(r.width16)&&salesStoredDim16(r.height16)?{shapeRef:normalizeShapeRef(r.shapeRef),liteShapes:normalizeSalesLiteShapes(r.liteShapes),width16:+r.width16,height16:+r.height16}:{})}))
  .filter(r=>{if(!r.orderId||!r.lineId||!r.keys.length||ids.has(r.id))return false;ids.add(r.id);return true;});
}
function validateRecutPayload(src){
 if(src.recut==null||!Array.isArray(src.recut))return;
 const seen=new Set();
 src.recut.forEach(r=>{
  if(!r||typeof r!=='object'||Array.isArray(r)||!salesRefId(r.orderId)||!Number.isSafeInteger(r.no)||r.no<1)throw new Error('Invalid recut record.');
  const k=r.orderId+'#'+r.no;if(seen.has(k))throw new Error('Duplicate recut number.');seen.add(k);
  if(r.shapeRef!=null&&(typeof r.shapeRef!=='object'||!salesRefId(r.shapeRef.id)||!salesStoredDim16(r.width16)||!salesStoredDim16(r.height16)||r.liteShapes!=null&&(typeof r.liteShapes!=='object'||Array.isArray(r.liteShapes))))throw new Error('Invalid recut drawing.');
 });
}
