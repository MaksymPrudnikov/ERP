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
DEFAULT.glassBatch=[];DEFAULT.glassPiece=[];DEFAULT.glassPieceSeq=0;
const GLASS_WAITING_STATUSES=['verified','batched','ready','done'];
function glassBatchClone(v){return v==null?null:JSON.parse(JSON.stringify(v));}
function glassPieceValid(id){return typeof id==='string'&&/^G-\d{7,}$/.test(id);}
function glassPieceNumber(id){return glassPieceValid(id)?+id.slice(2):0;}
function glassPieceNextId(){DB.glassPieceSeq=(Number.isSafeInteger(DB.glassPieceSeq)&&DB.glassPieceSeq>0?DB.glassPieceSeq:0)+1;return 'G-'+String(DB.glassPieceSeq).padStart(7,'0');}
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
function glassPieceMap(orderId){const m=new Map();(DB.glassPiece||[]).forEach(r=>{if(!orderId||r.key.startsWith(orderId+'|'))m.set(r.key,r);});return m;}
function glassBatchTaken(active,key,qty){let n=0;for(let u=1;u<=qty;u++)if(active.has(key+'|'+u))n++;return n;}
function glassBatchRemaining(o,l,active){
 const cs=glassBatchComponents(o,l);
 if(!l.batchManaged)return salesLineLocked(l)?0:l.qty*cs.length;
 active=active||glassBatchActive(o.id);
 return cs.reduce((n,c)=>n+l.qty-glassBatchTaken(active,c.key,l.qty),0);
}
function glassBatchProgress(o){
 const active=glassBatchActive(o.id);let total=0,left=0;
 (o.lines||[]).forEach(l=>{total+=l.qty*glassBatchComponents(o,l).length;left+=glassBatchRemaining(o,l,active);});
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
 const next=DB.glassPiece.filter(r=>!r.key.startsWith(o.id+'|')||keep.has(r.key));
 if(next.length!==DB.glassPiece.length){DB.glassPiece=next;changed=true;}
 return changed;
}
/* Строки очереди — отдельные стёкла. План резки читает Makeup через soDraft,
   поэтому считается внутри finWithOrder: очередь работает с сохранённой записью. */
function glassBatchRows(orders){
 const rows=[];
 (orders||DB.salesOrder||[]).filter(o=>o&&!salesIsQuote(o)&&GLASS_WAITING_STATUSES.includes(o.status)).forEach(o=>finWithOrder(o,()=>{
  const active=glassBatchActive(o.id),pieces=glassPieceMap(o.id),customer=salesCustomerDisplay(o.customerId),hasCustomer=!!salesFindCustomer(o.customerId);
  (o.lines||[]).forEach((l,li)=>{
   if(!glassBatchRemaining(o,l,active))return;
   let plan;try{plan=salesEffectiveCuttingPlan(l,salesLineGeometryShape(l),o);}catch(e){plan={valid:false,reason:'Check cutting geometry'};}
   glassBatchComponents(o,l).forEach(c=>{
    const cut=plan.valid&&(plan.lites||[]).find(x=>x.index===c.index),own=c.missing?null:salesLineShapeForLite(l,c.index),rec=pieces.get(c.key);
    const hold=o.onHold?'Order on hold: '+(o.holdReason||''):l.onHold?'On Hold: '+(l.holdReason||''):
     !hasCustomer?'Customer missing':c.missing||!glassProductById(c.glassId)?'Glass missing':!cut?(plan.reason||'Check cutting geometry'):'';
    const base={o,l,line:li+1,of:l.qty,cut,shape:own,shapeLabel:own&&!salesShapeIsLineRect(own)?'Shape':'Rect',width:cut?cut.cutW:null,height:cut?cut.cutH:null,
     heat:c.missing?'':salesRouteHeatOf(c.spec),coating:c.spec.coatingSurface||'',customer};
    for(let unit=1;unit<=l.qty;unit++){
     if(active.has(c.key+'|'+unit))continue;
     const piece=rec&&glassPieceValid(rec.ids[unit-1])?rec.ids[unit-1]:'';
     rows.push(Object.assign({},c,base,{slot:c.key+'|'+unit,unit,piece,reason:hold||(piece?'':'Glass ID missing')}));
    }
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
 return {order:r.o.businessNumber,customer:r.customer,line:r.line,of:r.of,lite:r.lite,glassId:r.glassId,glass:r.glass,width:r.width,height:r.height,shape:r.shapeLabel,heat:r.heat,coating:r.coating,
  production:{pane:glassBatchClone(r.pane),shape:glassBatchClone(r.shape),cuttingPoints:glassBatchClone(r.cut.cuttingPoints||[]),line:salesLockedLineSnapshot(r.o,r.l)}};
}
/* Внутренний commit вызывается только после всех проверок выбранной группы.
   Независимый повторный разбор прямо перед записью исключает двойной запуск.
   dryRun проверяет то же самое и ничего не пишет — так несколько батчей
   создаются все вместе или ни один. */
function glassBatchAssign(rows,opts){
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
  const o=salesRecord(id);o.status='batched';o.batchNo=number;o.batchHistory=[...new Set((o.batchHistory||[]).concat(number))];
  o.statusDates=Object.assign({},o.statusDates,{batched:now});['ready','done','closed'].forEach(k=>delete o.statusDates[k]);o.fulfilledVia='';o.updatedAt=now;salesSyncRecordLifecycle(o);
 });
 if(!opts.deferTouch)touch();return batch;
}
/* Возврат стёкол из батча — entries {batch,item}. Заказ возвращается в New,
   как у прежнего Unbatch: перед следующим батчем его проверяют заново.
   Номера стёкол сохраняются; другие батчи не меняются. */
function glassBatchRelease(entries,opts){
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
  .map(r=>({key:r.key,ids:r.ids.map(id=>glassPieceValid(id)&&!ids.has(id)?(ids.add(id),id):'')}));
 DB.glassBatch=DB.glassBatch.filter(b=>b&&typeof b==='object'&&salesBatchNumber(b.number)&&Array.isArray(b.items));
 DB.glassBatch.forEach(b=>{
  if(!Array.isArray(b.parts))glassBatchConvertCounted(b);
  if(!Array.isArray(b.history))b.history=[];if(typeof b.createdAt!=='string')b.createdAt='';
  b.parts=b.parts.map(p=>{p=p&&typeof p==='object'?p:{};const k=String(p.key||'').split('|');return Object.assign(p,{key:String(p.key||''),orderId:k[0]||'',lineId:k[1]||'',snapshot:p.snapshot&&typeof p.snapshot==='object'?p.snapshot:{}});});
  b.items=b.items.filter(i=>i&&typeof i==='object'&&Number.isSafeInteger(i.part)&&b.parts[i.part]&&b.parts[i.part].key.split('|').length===4&&Number.isSafeInteger(i.unit)&&i.unit>=0);
  b.items.forEach(i=>{['at','releasedAt','cutStartedAt'].forEach(k=>{if(typeof i[k]!=='string')i[k]='';});if(!glassPieceValid(i.piece))i.piece='';});
  b.history.forEach(h=>{if(!Array.isArray(h.pieces))h.pieces=[];});
 });
 let top=Number.isSafeInteger(DB.glassPieceSeq)&&DB.glassPieceSeq>0?DB.glassPieceSeq:0;
 DB.glassPiece.forEach(r=>r.ids.forEach(id=>{top=Math.max(top,glassPieceNumber(id));}));
 DB.glassBatch.forEach(b=>b.items.forEach(i=>{top=Math.max(top,glassPieceNumber(i.piece));}));
 DB.glassPieceSeq=top;
 /* Места для записей без номера изделия: активные — первые свободные. */
 const taken=new Set();DB.glassBatch.forEach(b=>b.items.forEach(i=>{if(i.unit>0&&!i.releasedAt)taken.add(b.parts[i.part].key+'|'+i.unit);}));
 DB.glassBatch.forEach(b=>{const released=new Map();b.items.forEach(i=>{
  if(i.unit>0)return;const key=b.parts[i.part].key;
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
 (DB.salesOrder||[]).forEach(o=>glassPieceEnsure(o));
 const pieces=glassPieceMap();
 DB.glassBatch.forEach(b=>{
  b.items.forEach(i=>{if(glassPieceValid(i.piece))return;const rec=pieces.get(b.parts[i.part].key),id=rec&&rec.ids[i.unit-1];i.piece=glassPieceValid(id)?id:glassPieceNextId();});
  b.history.forEach(h=>{if(h.convert){h.pieces=h.convert.map(i=>i.piece);delete h.convert;}});
 });
 (DB.salesOrder||[]).forEach(o=>(o.lines||[]).forEach(l=>{
  const active=glassBatchEntries(o.id,l.id).filter(x=>!x.item.releasedAt);if(!active.length)return;
  l.batchManaged=true;if(l.cutStartedAt)active.forEach(x=>{if(!x.item.cutStartedAt)x.item.cutStartedAt=l.cutStartedAt;});glassBatchSyncLine(o,l);
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
 });
 if(src.glassBatch==null)return;
 if(!Array.isArray(src.glassBatch))throw new Error('Glass batches must be an array.');
 const nums=new Set(),slots=new Set(),active=new Set();
 src.glassBatch.forEach(b=>{
  if(!b||!salesBatchNumber(b.number)||nums.has(b.number)||!Array.isArray(b.items)||!Array.isArray(b.history))throw new Error('Invalid or duplicate glass batch.');nums.add(b.number);
  if(!Array.isArray(b.parts))return;
  b.parts.forEach(p=>{if(!p||typeof p.key!=='string'||p.key.split('|').length!==4||!salesRefId(p.orderId)||!salesRefId(p.lineId)||!p.key.startsWith(p.orderId+'|'+p.lineId+'|')||!p.snapshot||typeof p.snapshot!=='object')throw new Error('Invalid glass batch part.');});
  b.items.forEach(i=>{
   if(!i||!glassPieceValid(i.piece)||!Number.isSafeInteger(i.part)||!b.parts[i.part]||!Number.isSafeInteger(i.unit)||i.unit<1||typeof i.at!=='string'||!i.at||typeof i.releasedAt!=='string'||typeof i.cutStartedAt!=='string')throw new Error('Invalid glass batch item.');
   if(i.releasedAt)return;
   const p=b.parts[i.part],slot=p.key+'|'+i.unit,l=lineOf(p.orderId,p.lineId);
   if(!l||i.unit>Number(l.qty)||slots.has(slot)||active.has(i.piece)||slotPiece.has(slot)&&slotPiece.get(slot)!==i.piece)throw new Error('Glass batch quantity or order reference is invalid.');
   slots.add(slot);active.add(i.piece);
  });
  b.history.forEach(h=>{if(!h||typeof h.at!=='string'||typeof h.action!=='string'||!Array.isArray(h.pieces)||!Number.isFinite(h.qty))throw new Error('Invalid batch history.');});
 });
}
