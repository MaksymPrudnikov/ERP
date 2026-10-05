/* Номера стёкол и реестр резки.
   Каждое стекло — отдельный объект. Glass ID G-0000001 выдаётся при сохранении
   заказа, не меняется и не используется повторно (счётчик DB.glassPieceSeq).
   Владелец, 17 сентября 2026: стикер печатают сразу — стекло из стока режут
   без Verify и батча, а сканирование потом отмечает пройденные этапы. Место
   стекла в заказе — позиция, изделие «7 of 50», Lite — берётся из связей.
   DB.glassPiece: {key: заказ|позиция|панель|плита, ids[изделие-1] = Glass ID}.
   DB.glassBatch: номер; parts — снимок стекла позиции на момент батча;
   items — одно стекло {piece, part, unit}; history — по номерам стёкол.
   Остаток — места без активной записи. Позиция под замком, пока её стекло в батче. */
DEFAULT.glassBatch=[];DEFAULT.glassPiece=[];DEFAULT.glassPieceSeq=0;DEFAULT.glassUnitId=[];DEFAULT.glassUnitIdSeq=0;
const GLASS_WAITING_STATUSES=['verified','batched','ready','done'];
/* Номер стекла в батче — как в Perfect Cut: по порядку списка батча, у
   каждого батча свой счёт с 1. Место в списке не меняется: убранное или
   перенесённое стекло остаётся записью, его номер больше никому не даётся,
   добавленное позже получает следующий (владелец, 5 октября 2026). */
function glassBatchNumbers(b){const m=new Map();(b&&b.items||[]).forEach((i,k)=>{if(!i.releasedAt)m.set(i.piece,k+1);});return m;}
function glassBatchClone(v){return v==null?null:JSON.parse(JSON.stringify(v));}
function glassPieceValid(id){return typeof id==='string'&&/^G-\d{7,}$/.test(id);}
function glassPieceNumber(id){return glassPieceValid(id)?+id.slice(2):0;}
/* Номер юнита U-0000001 — для финального стикера на весь DGU/TGU или ламинат:
   G-номер одного стекла отметил бы при скане только это стекло. Выдаётся
   позиции, где стёкол два и больше, по номеру на изделие, по тем же правилам,
   что Glass ID. DB.glassUnitId: {key: заказ|позиция, ids[изделие-1]}. */
function unitIdValid(id){return typeof id==='string'&&/^U-\d{7,}$/.test(id);}
function unitIdNumber(id){return unitIdValid(id)?+id.slice(2):0;}
function unitIdNext(){DB.glassUnitIdSeq=(Number.isSafeInteger(DB.glassUnitIdSeq)&&DB.glassUnitIdSeq>0?DB.glassUnitIdSeq:0)+1;return 'U-'+String(DB.glassUnitIdSeq).padStart(7,'0');}
function unitIdAt(orderId,lineId,unit){const r=(DB.glassUnitId||[]).find(x=>x.key===orderId+'|'+lineId);return r&&r.ids[unit-1]||'';}
function glassPieceNextId(){DB.glassPieceSeq=(Number.isSafeInteger(DB.glassPieceSeq)&&DB.glassPieceSeq>0?DB.glassPieceSeq:0)+1;return 'G-'+String(DB.glassPieceSeq).padStart(7,'0');}
/* Высший выданный номер G и U живёт и вне базы, в своём ключе браузера.
   Старая выгрузка откатывает базу, но не этот ключ: номер с уже
   напечатанного стикера второй раз не выдаётся. Ключ пишется до базы —
   при сбое записи остаётся пропуск, а не повтор. */
const GLASS_ID_MARK_KEY='glazing_system_v1-id-mark';
function glassIdSeq(v){return Number.isSafeInteger(v)&&v>0?v:0;}
function glassIdMarkRead(){try{const m=JSON.parse(localStorage.getItem(GLASS_ID_MARK_KEY)||'null')||{};return {g:glassIdSeq(m.g),u:glassIdSeq(m.u)};}catch(e){return {g:0,u:0};}}
function glassIdMarkApply(){const m=glassIdMarkRead();DB.glassPieceSeq=Math.max(glassIdSeq(DB.glassPieceSeq),m.g);DB.glassUnitIdSeq=Math.max(glassIdSeq(DB.glassUnitIdSeq),m.u);}
function glassIdMarkSave(){
 const m=glassIdMarkRead(),g=Math.max(m.g,glassIdSeq(DB.glassPieceSeq)),u=Math.max(m.u,glassIdSeq(DB.glassUnitIdSeq));
 if(g!==m.g||u!==m.u)localStorage.setItem(GLASS_ID_MARK_KEY,JSON.stringify({g,u}));
}
/* Стекло позиции — панель, у ламината каждая плита. Позиция без Makeup даёт
   одну запись Glass missing: её количество не теряется из остатка заказа. */
function glassBatchComponents(o,l){
 const m=salesMakeupById(o,l.makeupId);
 if(!m||!(m.panes||[]).length)return [{key:[o.id,l.id,'legacy','lite'].join('|'),orderId:o.id,lineId:l.id,paneId:'',index:0,ply:'',glassId:'',glass:'Unknown glass',lite:'—',pane:null,spec:{},missing:true}];
 return m.panes.flatMap((p,index)=>(p.category==='laminated'?['outer','inner']:['']).map(ply=>{
  const spec=(ply?p.laminated&&p.laminated[ply]:p)||{},g=glassProductById(spec.glassProductId);
  return {key:[o.id,l.id,p.id,ply||'lite'].join('|'),orderId:o.id,lineId:l.id,paneId:p.id,index,ply,
   glassId:spec.glassProductId||'',glass:g?g.code:'Unknown glass',lite:String(index+1)+(ply==='outer'?'a':ply==='inner'?'b':''),pane:p,spec};
 }));
}
function glassBatchFind(number){return (DB.glassBatch||[]).find(b=>b.number===number);}
/* Все записи заказа (и возвращённые) с их снимком. */
function glassBatchEntries(orderId,lineId){
 return (DB.glassBatch||[]).flatMap(batch=>batch.items.map((item,index)=>({batch,item,index,part:batch.parts[item.part]})).filter(x=>x.part&&x.part.orderId===orderId&&(!lineId||x.part.lineId===lineId)));
}
/* Активные места: «ключ стекла|номер изделия» → запись батча. */
function glassBatchActive(orderId){
 const m=new Map();
 (DB.glassBatch||[]).forEach(batch=>batch.items.forEach((item,index)=>{
  const part=batch.parts[item.part];
  if(!item.releasedAt&&part&&(!orderId||part.orderId===orderId))m.set(part.key+'|'+item.unit,{batch,item,index,part});
 }));
 return m;
}
/* Стекло строки уже в цеху без батча — порезано из стока и отсканировано.
   Это материал клиента: строку менять нельзя, как строку из батча
   (владелец, 05.10.2026). Undo скана снимает защиту. */
function glassLineScanned(orderId,line){
 if(!orderId||!line)return false;
 const pre=orderId+'|'+line.id+'|',ids=new Set();
 (DB.glassPiece||[]).forEach(r=>{if(!r||!String(r.key).startsWith(pre))return;(r.ids||[]).forEach(id=>ids.add(id));Object.values(r.extra||{}).forEach(a=>(a||[]).forEach(id=>ids.add(id)));});
 return ids.size>0&&(DB.stationScan||[]).some(s=>s&&!s.undoneAt&&ids.has(s.piece));
}
function glassPieceMap(orderId){const m=new Map();(DB.glassPiece||[]).forEach(r=>{if(!orderId||r.key.startsWith(orderId+'|'))m.set(r.key,r);});return m;}
/* Места Recut заказа: «ключ стекла|R1.1» (erp/quality/recut). */
function glassRecutSlots(orderId,lineId){return typeof recutSlotsFor==='function'?recutSlotsFor(orderId,lineId):[];}
function glassUnitValid(u){return Number.isSafeInteger(u)&&u>=0||typeof u==='string'&&/^(NCR|R)\d+\.\d+$/.test(u);}
function glassPieceAt(rec,unit){
 if(!rec)return '';
 if(typeof unit==='string'){const [nr,k]=unit.split('.');return rec.extra&&rec.extra[nr]?rec.extra[nr][+k-1]||'':'';}
 return rec.ids[unit-1]||'';
}
/* Скан: G или U → заказ, позиция, стекло и место. Нужен станциям. */
function glassLookup(code){
 const id=String(code==null?'':code).trim().toUpperCase();
 if(unitIdValid(id)){for(const r of DB.glassUnitId||[]){const i=r.ids.indexOf(id);if(i>=0){const [orderId,lineId]=r.key.split('|');return {kind:'unit',id,orderId,lineId,unit:i+1};}}return null;}
 if(!glassPieceValid(id))return null;
 for(const r of DB.glassPiece||[]){
  const [orderId,lineId]=r.key.split('|'),i=r.ids.indexOf(id);
  if(i>=0)return {kind:'glass',id,orderId,lineId,key:r.key,unit:i+1};
  for(const nr of Object.keys(r.extra||{})){const k=r.extra[nr].indexOf(id);if(k>=0)return {kind:'glass',id,orderId,lineId,key:r.key,unit:nr+'.'+(k+1)};}
 }
 return null;
}
function glassBatchTaken(active,key,qty){let n=0;for(let u=1;u<=qty;u++)if(active.has(key+'|'+u))n++;return n;}
function glassBatchRemaining(o,l,active){
 const cs=glassBatchComponents(o,l),recut=glassRecutSlots(o.id,l.id);
 active=active||glassBatchActive(o.id);
 const pending=recut.filter(x=>!active.has(x.key+'|'+x.unit)).length;
 if(!l.batchManaged)return (salesLineLocked(l)?0:l.qty*cs.length)+pending;
 return cs.reduce((n,c)=>n+l.qty-glassBatchTaken(active,c.key,l.qty),0)+pending;
}
function glassBatchProgress(o){
 const active=glassBatchActive(o.id);let total=0,left=0;
 (o.lines||[]).forEach(l=>{total+=l.qty*glassBatchComponents(o,l).length+glassRecutSlots(o.id,l.id).length;left+=glassBatchRemaining(o,l,active);});
 return {total,left,assigned:total-left};
}
/* Номера выдаются сохранённому заказу (не квоте): при сохранении, переходах
   и загрузке. Закрытым и отменённым заказам новые номера не выдаются.
   Изделий стало больше — новые номера; меньше — последние номера снимаются,
   если их стекло не в батче. Номер в оборот не возвращается. */
function glassPieceEnsure(o){
 if(!o||salesIsQuote(o))return false;
 const active=glassBatchActive(o.id);
 if(['closed','cancelled'].includes(o.status)&&!active.size)return false;
 if(!Array.isArray(DB.glassPiece))DB.glassPiece=[];
 const map=glassPieceMap(o.id),keep=new Set([...active.values()].map(x=>x.part.key));let changed=false;
 (o.lines||[]).forEach(l=>glassBatchComponents(o,l).forEach(c=>{
  keep.add(c.key);let rec=map.get(c.key);
  if(!rec){rec={key:c.key,ids:[]};DB.glassPiece.push(rec);map.set(c.key,rec);changed=true;}
  let want=l.qty;active.forEach(x=>{if(x.part.key===c.key)want=Math.max(want,x.item.unit);});
  for(let i=0;i<want;i++)if(!glassPieceValid(rec.ids[i])){rec.ids[i]=glassPieceNextId();changed=true;}
  if(rec.ids.length>want){rec.ids.length=want;changed=true;}
 }));
 /* Стёкла Recut получают свои номера сразу при создании Recut. */
 glassRecutSlots(o.id).forEach(x=>{
  keep.add(x.key);let rec=map.get(x.key);
  if(!rec){rec={key:x.key,ids:[]};DB.glassPiece.push(rec);map.set(x.key,rec);changed=true;}
  if(!rec.extra||typeof rec.extra!=='object')rec.extra={};const list=rec.extra[x.ref]||(rec.extra[x.ref]=[]);
  if(!glassPieceValid(list[x.k-1])){list[x.k-1]=glassPieceNextId();changed=true;}
 });
 const next=DB.glassPiece.filter(r=>!r.key.startsWith(o.id+'|')||keep.has(r.key));
 if(next.length!==DB.glassPiece.length){DB.glassPiece=next;changed=true;}
 if(!Array.isArray(DB.glassUnitId))DB.glassUnitId=[];
 const units=new Set();
 (o.lines||[]).forEach(l=>{
  if(glassBatchComponents(o,l).filter(c=>!c.missing).length<2)return;
  const key=o.id+'|'+l.id;units.add(key);let rec=DB.glassUnitId.find(r=>r.key===key);
  if(!rec){rec={key,ids:[]};DB.glassUnitId.push(rec);changed=true;}
  for(let i=0;i<l.qty;i++)if(!unitIdValid(rec.ids[i])){rec.ids[i]=unitIdNext();changed=true;}
  if(rec.ids.length>l.qty){rec.ids.length=l.qty;changed=true;}
 });
 const nextUnits=DB.glassUnitId.filter(r=>!r.key.startsWith(o.id+'|')||units.has(r.key));
 if(nextUnits.length!==DB.glassUnitId.length){DB.glassUnitId=nextUnits;changed=true;}
 return changed;
}
/* Строки очереди — отдельные стёкла. План резки читает Makeup через soDraft,
   поэтому считается внутри finWithOrder: очередь работает с сохранённой записью. */
function glassBatchRows(orders){
 const rows=[];
 /* Заказ New в очередь не попадает, кроме его Recut: стекло из стока режут без
    Verify, и сломанное стекло должно уйти в батч сразу. */
 (orders||DB.salesOrder||[]).filter(o=>o&&!salesIsQuote(o)&&(GLASS_WAITING_STATUSES.includes(o.status)||o.status==='new'&&glassRecutSlots(o.id).length)).forEach(o=>finWithOrder(o,()=>{
  const regular=GLASS_WAITING_STATUSES.includes(o.status),active=glassBatchActive(o.id),pieces=glassPieceMap(o.id),customer=salesCustomerDisplay(o.customerId),hasCustomer=!!salesFindCustomer(o.customerId);
  (o.lines||[]).forEach((l,li)=>{
   if(!glassBatchRemaining(o,l,active))return;
   let plan;try{plan=salesEffectiveCuttingPlan(l,salesLineGeometryShape(l),o);}catch(e){plan={valid:false,reason:'Check cutting geometry'};}
   glassBatchComponents(o,l).forEach(c=>{
    const cut=plan.valid&&(plan.lites||[]).find(x=>x.index===c.index),own=c.missing?null:salesLineShapeForLite(l,c.index),rec=pieces.get(c.key);
    const hold=o.onHold?'Order on hold: '+(o.holdReason||''):l.onHold?'On Hold: '+(l.holdReason||''):
     !hasCustomer?'Customer missing':c.missing||!glassProductById(c.glassId)?'Glass missing':!cut?(plan.reason||'Check cutting geometry'):'';
    const base={o,l,line:li+1,of:l.qty,cut,shape:own,shapeLabel:own&&!salesShapeIsLineRect(own)?'Shape':'Rect',width:cut?cut.cutW:null,height:cut?cut.cutH:null,
     heat:c.missing?'':salesRouteHeatOf(c.spec),coating:c.missing?'':(salesCoatingSurfaceOf(c.pane,c.index,c.ply)||''),customer};
    for(let unit=1;regular&&unit<=l.qty;unit++){
     if(active.has(c.key+'|'+unit))continue;
     const piece=rec&&glassPieceValid(rec.ids[unit-1])?rec.ids[unit-1]:'';
     rows.push(Object.assign({},c,base,{slot:c.key+'|'+unit,unit,piece,reason:hold||(piece?'':'Glass ID missing')}));
    }
    glassRecutSlots(o.id,l.id).filter(x=>x.key===c.key&&!active.has(x.key+'|'+x.unit)).forEach(x=>{
     const piece=glassPieceValid(glassPieceAt(rec,x.unit))?glassPieceAt(rec,x.unit):'';
     rows.push(Object.assign({},c,base,{slot:x.key+'|'+x.unit,unit:x.unit,k:x.k,of:x.of,recut:x.ref,recutLabel:x.label,piece,reason:hold||(piece?'':'Glass ID missing')}));
    });
   });
  });
 }));
 return rows;
}
function glassBatchSyncLine(o,l){
 const active=glassBatchEntries(o.id,l.id).filter(x=>!x.item.releasedAt);
 l.batchedAt=active.length?active[0].item.at:'';l.batchNo=active.length?active[active.length-1].batch.number:'';
 l.cutStartedAt=active.map(x=>x.item.cutStartedAt).find(Boolean)||'';
}
function glassBatchSelectionStamp(rows){
 const ids=[...new Set(rows.map(r=>r.orderId))];
 return JSON.stringify([ids.map(salesRecord),DB.glassBatch,DB.glassPiece,DB.shapeDef,DB.glassProduct,DB.serviceRate,DB.customer,DB.receipt]);
}
function glassBatchPartSnapshot(r){
 return {order:r.o.businessNumber,customer:r.customer,line:r.line,of:r.of,...(r.recut?{recut:r.recut}:{}),lite:r.lite,glassId:r.glassId,glass:r.glass,width:r.width,height:r.height,shape:r.shapeLabel,heat:r.heat,coating:r.coating,
  production:{pane:glassBatchClone(r.pane),shape:glassBatchClone(r.shape),cuttingPoints:glassBatchClone(r.cut.cuttingPoints||[]),line:salesLockedLineSnapshot(r.o,r.l)}};
}
/* Внутренний commit вызывается только после всех проверок выбранной группы.
   Независимый повторный разбор прямо перед записью исключает двойной запуск.
   dryRun проверяет то же самое и ничего не пишет — так несколько батчей
   создаются все вместе или ни один. */
function glassBatchAssign(rows,opts){
 if(storageDepth||opts&&(opts.deferTouch||opts.dryRun))return glassBatchAssignCommand(rows,opts);
 const out=storageCommand(()=>{const value=glassBatchAssignCommand(rows,opts);if(value==null)throw new Error('Nothing could be assigned to this batch.');return value;});return out.ok?out.value:null;
}
function glassBatchAssignCommand(rows,opts){
 opts=opts||{};if(!rows||!rows.length)return null;
 if(new Set(rows.map(r=>r.slot)).size!==rows.length)return null;
 const current=new Map(glassBatchRows([...new Set(rows.map(r=>r.orderId))].map(salesRecord).filter(Boolean)).map(r=>[r.slot,r]));
 const chosen=rows.map(r=>current.get(r.slot));
 if(chosen.some((c,i)=>!c||c.reason||!c.cut||!c.piece||c.piece!==rows[i].piece))return null;
 const number=salesBatchNumber(opts.batchNo)||salesNextBatchNumber();
 if(opts.dryRun)return {number};
 const now=opts.now||new Date().toISOString();
 let batch=glassBatchFind(number);const added=!!batch;
 if(!batch){batch={number,createdAt:now,parts:[],items:[],history:[]};(DB.glassBatch||(DB.glassBatch=[])).push(batch);}
 const parts=new Map();
 chosen.forEach(r=>{
  if(!parts.has(r.key)){
   const snapshot=glassBatchPartSnapshot(r),text=JSON.stringify(snapshot);let part=batch.parts.findIndex(p=>p.key===r.key&&JSON.stringify(p.snapshot)===text);
   if(part<0){part=batch.parts.length;batch.parts.push({key:r.key,orderId:r.orderId,lineId:r.lineId,snapshot});}
   parts.set(r.key,part);
  }
  batch.items.push({piece:r.piece,part:parts.get(r.key),unit:r.unit,at:now,releasedAt:'',cutStartedAt:''});
 });
 new Map(chosen.map(r=>[r.l,r.o])).forEach((o,l)=>{l.batchManaged=true;glassBatchSyncLine(o,l);});
 batch.history.push({at:now,action:added?'Added':'Created',pieces:chosen.map(r=>r.piece),qty:chosen.length});
 [...new Set(chosen.map(r=>r.orderId))].forEach(id=>{
  const o=salesRecord(id);if(o.status==='new'){o.updatedAt=now;salesSyncRecordLifecycle(o);return;}o.status='batched';o.batchNo=number;o.batchHistory=[...new Set((o.batchHistory||[]).concat(number))];
  o.statusDates=Object.assign({},o.statusDates,{batched:now});['ready','done','closed'].forEach(k=>delete o.statusDates[k]);o.fulfilledVia='';o.updatedAt=now;salesSyncRecordLifecycle(o);
 });
 if(!opts.deferTouch)touch();return batch;
}
/* Возврат стёкол из батча — entries {batch,item}. Заказ возвращается в New,
   как у прежнего Unbatch: перед следующим батчем его проверяют заново.
   Номера стёкол сохраняются; другие батчи не меняются. */
function glassBatchRelease(entries,opts){
 if(storageDepth||opts&&(opts.deferTouch||opts.dryRun))return glassBatchReleaseCommand(entries,opts);
 const out=storageCommand(()=>{const value=glassBatchReleaseCommand(entries,opts);if(value==null)throw new Error('Nothing could be assigned to this batch.');return value;});return out.ok&&out.value;
}
function glassBatchReleaseCommand(entries,opts){
 opts=opts||{};if(!opts.confirmed||!entries||!entries.length)return false;
 if(new Set(entries.map(x=>x.item)).size!==entries.length)return false;
 const lineOf=x=>{const part=x.batch.parts[x.item.part],o=part&&salesRecord(part.orderId);return {part,o,l:o&&o.lines.find(l=>l.id===part.lineId)};};
 if(entries.some(x=>{const {part,o,l}=lineOf(x);return glassBatchFind(x.batch.number)!==x.batch||!x.batch.items.includes(x.item)||!part||!o||!l||!salesUnbatchEligible(o)||x.item.releasedAt||x.item.cutStartedAt||l.cutStartedAt;}))return false;
 const now=opts.now||new Date().toISOString();entries.forEach(x=>x.item.releasedAt=now);
 [...new Set(entries.map(x=>x.batch))].forEach(b=>{const a=entries.filter(x=>x.batch===b);b.history.push({at:now,action:'Unbatched',pieces:a.map(x=>x.item.piece),qty:a.length});});
 const byOrder=new Map();entries.forEach(x=>{const {o,l}=lineOf(x);if(!byOrder.has(o))byOrder.set(o,{lines:new Set(),numbers:new Set()});byOrder.get(o).lines.add(l);byOrder.get(o).numbers.add(x.batch.number);});
 byOrder.forEach((a,o)=>{
  a.lines.forEach(l=>glassBatchSyncLine(o,l));
  const numbers=[...a.numbers];o.batchHistory=[...new Set((o.batchHistory||[]).concat(numbers))];o.unbatchHistory=(o.unbatchHistory||[]).concat({at:now,batchNumbers:numbers,lineIds:[...a.lines].map(l=>l.id)});
  const locked=o.lines.filter(salesLineLocked);o.batchNo=locked.length?locked[locked.length-1].batchNo:'';
  o.status='new';o.statusDates={new:now};o.fulfilledVia='';o.updatedAt=now;salesSyncRecordLifecycle(o);
 });
 if(!opts.deferTouch)touch();return true;
}
/* Перенос стёкол в новый батч. Последний лист с большим пустым местом бывает
   выгоднее не резать — его стёкла уходят в новый батч; решает человек, «есть
   такая переменная как день ожидания» (владелец, 18 сентября 2026). Запись
   в старом батче закрывается с пометкой movedTo, в новом открывается запись с
   тем же Glass ID; заказы остаются в Batched. Начатый рез не переносится. */
function glassBatchMove(number,pieceIds,opts){
 if(storageDepth||opts&&(opts.deferTouch||opts.dryRun))return glassBatchMoveCommand(number,pieceIds,opts);
 const out=storageCommand(()=>{const value=glassBatchMoveCommand(number,pieceIds,opts);if(value==null)throw new Error('Nothing could be assigned to this batch.');return value;});return out.ok?out.value:{error:out.error};
}
function glassBatchMoveCommand(number,pieceIds,opts){
 opts=opts||{};const from=glassBatchFind(number);if(!from)return {error:'Batch not found.'};
 const ids=new Set(pieceIds||[]),items=from.items.filter(i=>!i.releasedAt&&ids.has(i.piece));
 if(!items.length||items.length!==ids.size)return {error:'Nothing to move.'};
 const lineOf=i=>{const p=from.parts[i.part],o=p&&salesRecord(p.orderId);return {p,o,l:o&&(o.lines||[]).find(x=>x.id===p.lineId)};};
 /* Проверка по стеклу, а не по позиции: последний лист переносят, когда
    остальные листы уже режутся, и стёкла одной позиции лежат на обоих. */
 if(items.some(i=>i.cutStartedAt))return {error:'Cutting has started on this glass.'};
 const now=opts.now||new Date().toISOString();
 /* opts.to — уже открытый батч: стёкла добавляются к нему. */
 let to=opts.to?glassBatchFind(opts.to):null;const added=!!to;
 if(opts.to&&(!to||to===from))return {error:'Batch not found.'};
 if(to&&to.items.some(i=>!i.releasedAt&&i.cutStartedAt))return {error:'Cutting has started in '+to.number+'.'};
 if(!to)to={number:salesNextBatchNumber(),createdAt:now,parts:[],items:[],history:[]};
 const parts=new Map();
 items.forEach(i=>{
  if(!parts.has(i.part)){
   const src=from.parts[i.part],text=JSON.stringify(src.snapshot);let at=to.parts.findIndex(p=>p.key===src.key&&JSON.stringify(p.snapshot)===text);
   if(at<0){at=to.parts.length;to.parts.push(glassBatchClone(src));}
   parts.set(i.part,at);
  }
  /* from — батч, откуда стекло пришло: оно ждёт дольше, раскрой даёт ему
     приоритет 10 (erp/production/cut-layout, cutPieces). */
  to.items.push({piece:i.piece,part:parts.get(i.part),unit:i.unit,at:now,releasedAt:'',cutStartedAt:'',from:number});
  i.releasedAt=now;i.movedTo=to.number;
 });
 if(!added)DB.glassBatch.push(to);
 const pieces=items.map(i=>i.piece);
 from.history.push({at:now,action:'Moved to '+to.number,pieces,qty:pieces.length});
 to.history.push({at:now,action:(added?'Added from ':'Created from ')+number,pieces,qty:pieces.length});
 const orders=new Map();items.forEach(i=>{const {o,l}=lineOf(i);if(!o||!l)return;if(!orders.has(o))orders.set(o,new Set());orders.get(o).add(l);});
 orders.forEach((lines,o)=>{lines.forEach(l=>glassBatchSyncLine(o,l));o.batchNo=to.number;o.batchHistory=[...new Set((o.batchHistory||[]).concat(number,to.number))];o.updatedAt=now;});
 if(!opts.deferTouch)touch();
 return {ok:true,number:to.number,pieces};
}
/* Черновой формат PR #84 до номеров стёкол: запись несла количество.
   Каждое стекло получает своё место; номера проставляются после Ensure. */
function glassBatchConvertCounted(b){
 const parts=[],items=[],byId=new Map();
 (b.items||[]).forEach(old=>{
  if(!old||typeof old.key!=='string')return;
  const k=old.key.split('|'),key=[k[0],k[1],k[2]||'legacy',k[3]||'lite'].join('|'),snapshot=old.snapshot&&typeof old.snapshot==='object'?old.snapshot:{},text=JSON.stringify(snapshot);
  let part=parts.findIndex(p=>p.key===key&&JSON.stringify(p.snapshot)===text);
  if(part<0){part=parts.length;parts.push({key,orderId:k[0],lineId:k[1],snapshot});}
  const made=[];for(let n=0;n<(Number.isSafeInteger(old.qty)&&old.qty>0?old.qty:1);n++){const item={piece:'',part,unit:0,at:String(old.at||''),releasedAt:String(old.releasedAt||''),cutStartedAt:String(old.cutStartedAt||'')};items.push(item);made.push(item);}
  if(old.id)byId.set(old.id,made);
 });
 b.parts=parts;b.items=items;
 b.history=(Array.isArray(b.history)?b.history:[]).filter(h=>h&&typeof h==='object').map(h=>({at:String(h.at||''),action:String(h.action||''),pieces:[],qty:Number(h.qty)||0,convert:(Array.isArray(h.itemIds)?h.itemIds:[]).flatMap(id=>byId.get(id)||[])}));
}
/* Старые батчи импортируются как уже назначенные стёкла. Повторный запуск
   нормализации не создаёт новых записей; возвращённые записи не исчезают.
   Позиция с замком, но без активных записей, тоже импортируется: замок
   важнее — такое стекло нельзя снова выпустить в резку. */
function normalizeGlassBatches(){
 if(!Array.isArray(DB.glassBatch))DB.glassBatch=[];
 if(!Array.isArray(DB.glassPiece))DB.glassPiece=[];
 const ids=new Set();
 DB.glassPiece=DB.glassPiece.filter(r=>r&&typeof r.key==='string'&&r.key.split('|').length===4&&Array.isArray(r.ids)&&salesRecord(r.key.split('|')[0]))
  .map(r=>{
   const out={key:r.key,ids:r.ids.map(id=>glassPieceValid(id)&&!ids.has(id)?(ids.add(id),id):'')};
   if(r.extra&&typeof r.extra==='object'){const extra={};Object.keys(r.extra).filter(nr=>/^(NCR|R)\d+$/.test(nr)&&Array.isArray(r.extra[nr])).forEach(nr=>{extra[nr]=r.extra[nr].map(id=>glassPieceValid(id)&&!ids.has(id)?(ids.add(id),id):'');});if(Object.keys(extra).length)out.extra=extra;}
   return out;
  });
 DB.glassBatch=DB.glassBatch.filter(b=>b&&typeof b==='object'&&salesBatchNumber(b.number)&&Array.isArray(b.items));
 DB.glassBatch.forEach(b=>{
  if(!Array.isArray(b.parts))glassBatchConvertCounted(b);
  if(!Array.isArray(b.history))b.history=[];if(typeof b.createdAt!=='string')b.createdAt='';
  if(b.cutOrder!=null&&!(Number.isSafeInteger(b.cutOrder)&&b.cutOrder>0))delete b.cutOrder;
  b.parts=b.parts.map(p=>{p=p&&typeof p==='object'?p:{};const k=String(p.key||'').split('|');return Object.assign(p,{key:String(p.key||''),orderId:k[0]||'',lineId:k[1]||'',snapshot:p.snapshot&&typeof p.snapshot==='object'?p.snapshot:{}});});
  b.items=b.items.filter(i=>i&&typeof i==='object'&&Number.isSafeInteger(i.part)&&b.parts[i.part]&&b.parts[i.part].key.split('|').length===4&&glassUnitValid(i.unit));
  b.items.forEach(i=>{['at','releasedAt','cutStartedAt'].forEach(k=>{if(typeof i[k]!=='string')i[k]='';});if(!glassPieceValid(i.piece))i.piece='';if(i.from!=null&&!salesBatchNumber(i.from))delete i.from;if(i.movedTo!=null&&(!salesBatchNumber(i.movedTo)||!i.releasedAt))delete i.movedTo;});
  b.history.forEach(h=>{if(!Array.isArray(h.pieces))h.pieces=[];});
 });
 /* Перенесённые до 5 октября 2026 стёкла пометки from не имели — она
    восстанавливается по movedTo старого батча. */
 const byNo=new Map(DB.glassBatch.map(b=>[b.number,b]));
 DB.glassBatch.forEach(b=>b.items.forEach(i=>{const to=i.movedTo&&byNo.get(i.movedTo);if(!to)return;const n=to.items.find(x=>x.piece===i.piece&&!x.from&&x.at>=i.releasedAt);if(n)n.from=b.number;}));
 let top=Number.isSafeInteger(DB.glassPieceSeq)&&DB.glassPieceSeq>0?DB.glassPieceSeq:0;
 DB.glassPiece.forEach(r=>r.ids.concat(...Object.values(r.extra||{})).forEach(id=>{top=Math.max(top,glassPieceNumber(id));}));
 DB.glassBatch.forEach(b=>b.items.forEach(i=>{top=Math.max(top,glassPieceNumber(i.piece));}));
 DB.glassPieceSeq=top;
 /* Места для записей без номера изделия: активные — первые свободные. */
 const taken=new Set();DB.glassBatch.forEach(b=>b.items.forEach(i=>{if(i.unit!==0&&!i.releasedAt)taken.add(b.parts[i.part].key+'|'+i.unit);}));
 DB.glassBatch.forEach(b=>{const released=new Map();b.items.forEach(i=>{
  if(i.unit!==0)return;const key=b.parts[i.part].key;
  if(i.releasedAt){const n=(released.get(key)||0)+1;released.set(key,n);i.unit=n;return;}
  let u=1;while(taken.has(key+'|'+u))u++;i.unit=u;taken.add(key+'|'+u);
 });});
 (DB.salesOrder||[]).filter(o=>!salesIsQuote(o)).forEach(o=>(o.lines||[]).forEach((l,li)=>{
  if(!salesLineLocked(l)||glassBatchEntries(o.id,l.id).some(x=>!x.item.releasedAt))return;
  const number=salesBatchNumber(l.batchNo)||salesBatchNumber(o.batchNo)||salesNextBatchNumber(),at=l.batchedAt||l.cutStartedAt||o.updatedAt||o.createdAt||'';
  let b=glassBatchFind(number);if(!b){b={number,createdAt:at,parts:[],items:[],history:[]};DB.glassBatch.push(b);}
  const made=[];
  glassBatchComponents(o,l).forEach(c=>{
   const part=b.parts.length;b.parts.push({key:c.key,orderId:o.id,lineId:l.id,snapshot:{order:o.businessNumber,customer:salesCustomerDisplay(o.customerId),line:li+1,of:l.qty,lite:c.lite,glass:c.glass,glassId:c.glassId||'',width:l.width16/16,height:l.height16/16,shape:'Legacy',heat:'',coating:'',production:null}});
   for(let unit=1;unit<=l.qty;unit++){const item={piece:'',part,unit,at,releasedAt:'',cutStartedAt:l.cutStartedAt||''};b.items.push(item);made.push(item);}
  });
  b.history.push({at,action:'Imported legacy batch',pieces:[],qty:made.length,convert:made});
  l.batchManaged=true;l.batchNo=number;o.batchHistory=[...new Set((o.batchHistory||[]).concat(number))];
 }));
 if(!Array.isArray(DB.glassUnitId))DB.glassUnitId=[];
 const unitIds=new Set(),unitKeys=new Set();
 DB.glassUnitId=DB.glassUnitId.filter(r=>r&&typeof r.key==='string'&&r.key.split('|').length===2&&Array.isArray(r.ids)&&salesRecord(r.key.split('|')[0])&&!unitKeys.has(r.key)&&unitKeys.add(r.key))
  .map(r=>({key:r.key,ids:r.ids.map(id=>unitIdValid(id)&&!unitIds.has(id)?(unitIds.add(id),id):'')}));
 DB.glassUnitIdSeq=Math.max(Number.isSafeInteger(DB.glassUnitIdSeq)&&DB.glassUnitIdSeq>0?DB.glassUnitIdSeq:0,...DB.glassUnitId.flatMap(r=>r.ids.map(unitIdNumber)));
 (DB.salesOrder||[]).forEach(o=>glassPieceEnsure(o));
 const pieces=glassPieceMap();
 DB.glassBatch.forEach(b=>{
  b.items.forEach(i=>{if(glassPieceValid(i.piece))return;const id=glassPieceAt(pieces.get(b.parts[i.part].key),i.unit);i.piece=glassPieceValid(id)?id:glassPieceNextId();});
  b.history.forEach(h=>{if(h.convert){h.pieces=h.convert.map(i=>i.piece);delete h.convert;}});
 });
 (DB.salesOrder||[]).forEach(o=>(o.lines||[]).forEach(l=>{
  const active=glassBatchEntries(o.id,l.id).filter(x=>!x.item.releasedAt);if(!active.length)return;
  /* Замок позиции без отметок стёкол — старые данные: резку отмечали всей
     позицией. Со сканом станции отметка у каждого стекла своя, и позиция
     лишь повторяет первую из них — раздавать её всем стёклам нельзя: одно
     порезанное стекло сделало бы порезанными все пятьдесят. */
  l.batchManaged=true;if(l.cutStartedAt&&!active.some(x=>x.item.cutStartedAt))active.forEach(x=>{x.item.cutStartedAt=l.cutStartedAt;});glassBatchSyncLine(o,l);
 }));
}
function validateGlassBatchesPayload(src){
 if(src.glassPieceSeq!=null&&!(Number.isSafeInteger(src.glassPieceSeq)&&src.glassPieceSeq>=0))throw new Error('Glass ID counter is invalid.');
 const orders=new Map((Array.isArray(src.salesOrder)?src.salesOrder:[]).filter(o=>o&&o.id).map(o=>[o.id,o]));
 const lineOf=(orderId,lineId)=>{const o=orders.get(orderId);return o&&(o.lines||[]).find(l=>l&&l.id===lineId);};
 const seen=new Set(),slotPiece=new Map();
 (Array.isArray(src.glassPiece)?src.glassPiece:[]).forEach(r=>{
  if(!r||typeof r.key!=='string'||r.key.split('|').length!==4||!Array.isArray(r.ids))throw new Error('Invalid glass ID record.');
  r.ids.forEach((id,i)=>{if(!glassPieceValid(id)||seen.has(id))throw new Error('Invalid or duplicate Glass ID.');seen.add(id);slotPiece.set(r.key+'|'+(i+1),id);});
  if(r.extra!=null){if(typeof r.extra!=='object'||Array.isArray(r.extra))throw new Error('Invalid glass ID record.');Object.keys(r.extra).forEach(nr=>{if(!/^(NCR|R)\d+$/.test(nr)||!Array.isArray(r.extra[nr]))throw new Error('Invalid glass ID record.');r.extra[nr].forEach((id,i)=>{if(!glassPieceValid(id)||seen.has(id))throw new Error('Invalid or duplicate Glass ID.');seen.add(id);slotPiece.set(r.key+'|'+nr+'.'+(i+1),id);});});}
 });
 if(src.glassUnitIdSeq!=null&&!(Number.isSafeInteger(src.glassUnitIdSeq)&&src.glassUnitIdSeq>=0))throw new Error('Unit ID counter is invalid.');
 const unitSeen=new Set();
 (Array.isArray(src.glassUnitId)?src.glassUnitId:[]).forEach(r=>{
  if(!r||typeof r.key!=='string'||r.key.split('|').length!==2||!Array.isArray(r.ids))throw new Error('Invalid unit ID record.');
  r.ids.forEach(id=>{if(!unitIdValid(id)||unitSeen.has(id))throw new Error('Invalid or duplicate Unit ID.');unitSeen.add(id);});
 });
 if(src.glassBatch==null)return;
 if(!Array.isArray(src.glassBatch))throw new Error('Glass batches must be an array.');
 const nums=new Set(),slots=new Set(),active=new Set();
 src.glassBatch.forEach(b=>{
  if(!b||!salesBatchNumber(b.number)||nums.has(b.number)||!Array.isArray(b.items)||!Array.isArray(b.history))throw new Error('Invalid or duplicate glass batch.');nums.add(b.number);
  if(!Array.isArray(b.parts))return;
  b.parts.forEach(p=>{if(!p||typeof p.key!=='string'||p.key.split('|').length!==4||!salesRefId(p.orderId)||!salesRefId(p.lineId)||!p.key.startsWith(p.orderId+'|'+p.lineId+'|')||!p.snapshot||typeof p.snapshot!=='object')throw new Error('Invalid glass batch part.');});
  b.items.forEach(i=>{
   if(!i||!glassPieceValid(i.piece)||!Number.isSafeInteger(i.part)||!b.parts[i.part]||!glassUnitValid(i.unit)||i.unit===0||typeof i.at!=='string'||!i.at||typeof i.releasedAt!=='string'||typeof i.cutStartedAt!=='string')throw new Error('Invalid glass batch item.');
   if(i.releasedAt)return;
   const p=b.parts[i.part],slot=p.key+'|'+i.unit,l=lineOf(p.orderId,p.lineId);
   if(!l||typeof i.unit==='number'&&i.unit>Number(l.qty)||slots.has(slot)||active.has(i.piece)||slotPiece.has(slot)&&slotPiece.get(slot)!==i.piece)throw new Error('Glass batch quantity or order reference is invalid.');
   slots.add(slot);active.add(i.piece);
  });
  b.history.forEach(h=>{if(!h||typeof h.at!=='string'||typeof h.action!=='string'||!Array.isArray(h.pieces)||!Number.isFinite(h.qty))throw new Error('Invalid batch history.');});
 });
}
/* Очередь резки. Порядок задаёт офис (владелец, 29 сентября 2026): ▲▼ в
   Optimization → Batches; резчик видит его во вкладке Queue станции CUT.
   В очереди — батчи, где есть непорезанное стекло; новый батч встаёт в
   конец. */
function glassBatchCutQueue(){
 return (DB.glassBatch||[]).filter(b=>{const a=b.items.filter(i=>!i.releasedAt);return a.length&&a.some(i=>!i.cutStartedAt);})
  .sort((x,y)=>(x.cutOrder||1e9)-(y.cutOrder||1e9)||String(x.number).localeCompare(String(y.number)));
}
function glassBatchCutMove(number,dir){
 const q=glassBatchCutQueue(),i=q.findIndex(b=>b.number===number),j=i+(dir<0?-1:1);
 if(i<0||j<0||j>=q.length)return false;
 [q[i],q[j]]=[q[j],q[i]];q.forEach((b,k)=>{b.cutOrder=k+1;});touch();return true;
}
