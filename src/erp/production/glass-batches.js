/* Реестр резки: выбранные стёкла, неизменяемый состав и история возврата.
   IN: сохранённые заказы, Shape/Effective Cutting; OUT: DB.glassBatch.
   Остаток вычисляется по активным назначениям, а не по статусу заказа.
   Общая позиция остаётся защищённой, пока хотя бы одно её стекло в батче. */
DEFAULT.glassBatch=[];
function glassBatchClone(v){return v==null?null:JSON.parse(JSON.stringify(v));}
function glassBatchItems(orderId,lineId){return (DB.glassBatch||[]).flatMap(b=>b.items.filter(i=>i.orderId===orderId&&(!lineId||i.lineId===lineId)).map(i=>({batch:b,item:i})));}
/* Стекло позиции — панель, у ламината каждая плита. Позиция без Makeup даёт
   одну запись Glass missing: её количество не теряется из остатка заказа. */
function glassBatchComponents(o,l){
 const m=salesMakeupById(o,l.makeupId);
 if(!m||!(m.panes||[]).length)return [{key:[o.id,l.id,'legacy'].join('|'),orderId:o.id,lineId:l.id,paneId:'',index:0,ply:'',qty:l.qty,glassId:'',glass:'Unknown glass',lite:'—',pane:null,spec:{},missing:true}];
 return m.panes.flatMap((p,index)=>(p.category==='laminated'?['outer','inner']:['']).map(ply=>{
  const spec=(ply?p.laminated&&p.laminated[ply]:p)||{},g=glassProductById(spec.glassProductId);
  return {key:[o.id,l.id,p.id,ply||'lite'].join('|'),orderId:o.id,lineId:l.id,paneId:p.id,index,ply,qty:l.qty,
   glassId:spec.glassProductId||'',glass:g?g.code:'Unknown glass',lite:String(index+1)+(ply==='outer'?'a':ply==='inner'?'b':''),pane:p,spec};
 }));
}
function glassBatchAssigned(key){return (DB.glassBatch||[]).reduce((n,b)=>n+b.items.filter(i=>i.key===key&&!i.releasedAt).reduce((s,i)=>s+i.qty,0),0);}
function glassBatchRemaining(o,l){
 const cs=glassBatchComponents(o,l);
 if(!l.batchManaged)return salesLineLocked(l)?0:l.qty*cs.length;
 return cs.reduce((n,c)=>n+Math.max(0,c.qty-glassBatchAssigned(c.key)),0);
}
function glassBatchProgress(o){
 let total=0,left=0;(o.lines||[]).forEach(l=>{total+=l.qty*glassBatchComponents(o,l).length;left+=glassBatchRemaining(o,l);});
 return {total,left,assigned:total-left};
}
/* План резки читает Makeup через soDraft, поэтому считается внутри
   finWithOrder: очередь всегда работает с сохранённой записью. */
function glassBatchRows(orders){
 const rows=[];
 (orders||DB.salesOrder||[]).filter(o=>o&&!salesIsQuote(o)&&['verified','batched','ready','done'].includes(o.status)).forEach(o=>finWithOrder(o,()=>{
  (o.lines||[]).forEach((l,li)=>{
   if(!glassBatchRemaining(o,l))return;
   let plan;try{plan=salesEffectiveCuttingPlan(l,salesLineGeometryShape(l),o);}catch(e){plan={valid:false,reason:'Check cutting geometry'};}
   glassBatchComponents(o,l).forEach(c=>{
    const remaining=l.batchManaged?Math.max(0,c.qty-glassBatchAssigned(c.key)):c.qty;if(!remaining)return;
    const cut=plan.valid&&(plan.lites||[]).find(x=>x.index===c.index),own=c.missing?null:salesLineShapeForLite(l,c.index);
    const reason=o.onHold?'Order on hold: '+(o.holdReason||''):l.onHold?'On Hold: '+(l.holdReason||''):
     !salesFindCustomer(o.customerId)?'Customer missing':c.missing||!glassProductById(c.glassId)?'Glass missing':!cut?(plan.reason||'Check cutting geometry'):'';
    rows.push(Object.assign(c,{o,l,line:li+1,remaining,reason,cut,shape:own,shapeLabel:own&&!salesShapeIsLineRect(own)?'Shape':'Rect',
     width:cut?cut.cutW:null,height:cut?cut.cutH:null,heat:c.missing?'':salesRouteHeatOf(c.spec),coating:c.spec.coatingSurface||'',
     customer:salesCustomerDisplay(o.customerId)}));
   });
  });
 }));
 return rows;
}
function glassBatchFind(number){return (DB.glassBatch||[]).find(b=>b.number===number);}
function glassBatchSyncLine(o,l){
 const active=glassBatchItems(o.id,l.id).filter(x=>!x.item.releasedAt);
 l.batchedAt=active.length?active[0].item.at:'';l.batchNo=active.length?active[active.length-1].batch.number:'';
 l.cutStartedAt=active.map(x=>x.item.cutStartedAt).find(Boolean)||'';
}
function glassBatchSelectionStamp(rows){
 const ids=[...new Set(rows.map(r=>r.orderId))];
 return JSON.stringify([ids.map(salesRecord),DB.glassBatch,DB.shapeDef,DB.glassProduct,DB.serviceRate,DB.customer,DB.receipt]);
}
/* Внутренний commit вызывается только после всех проверок выбранной группы.
   Независимый повторный разбор прямо перед записью исключает двойной запуск.
   dryRun проверяет то же самое и ничего не пишет — так несколько батчей
   создаются все вместе или ни один. */
function glassBatchAssign(rows,opts){
 opts=opts||{};if(!rows||!rows.length)return null;
 const keys=new Set(rows.map(r=>r.key));if(keys.size!==rows.length)return null;
 const current=glassBatchRows([...new Set(rows.map(r=>r.orderId))].map(salesRecord).filter(Boolean));
 const chosen=rows.map(r=>current.find(c=>c.key===r.key));
 if(chosen.some((c,i)=>!c||c.reason||!c.cut||rows[i].remaining!==c.remaining))return null;
 const number=salesBatchNumber(opts.batchNo)||salesNextBatchNumber();
 if(opts.dryRun)return {number};
 const now=opts.now||new Date().toISOString();
 let batch=glassBatchFind(number);const added=!!batch;if(!batch){batch={number,createdAt:now,items:[],history:[]};(DB.glassBatch||(DB.glassBatch=[])).push(batch);}
 const items=chosen.map(r=>{
  const item={id:salesUid('BI'),key:r.key,orderId:r.orderId,lineId:r.lineId,paneId:r.paneId,ply:r.ply,qty:r.remaining,at:now,releasedAt:'',cutStartedAt:'',
   snapshot:{order:r.o.businessNumber,customer:r.customer,line:r.line,lite:r.lite,glassId:r.glassId,glass:r.glass,width:r.width,height:r.height,shape:r.shapeLabel,heat:r.heat,coating:r.coating,
    production:{pane:glassBatchClone(r.pane),shape:glassBatchClone(r.shape),cuttingPoints:glassBatchClone(r.cut.cuttingPoints||[]),line:salesLockedLineSnapshot(r.o,r.l)}}};
  batch.items.push(item);r.l.batchManaged=true;glassBatchSyncLine(r.o,r.l);return item;
 });
 batch.history.push({at:now,action:added?'Added':'Created',itemIds:items.map(i=>i.id),qty:items.reduce((n,i)=>n+i.qty,0)});
 [...new Set(chosen.map(r=>r.orderId))].forEach(id=>{
  const o=salesRecord(id);o.status='batched';o.batchNo=number;o.batchHistory=[...new Set((o.batchHistory||[]).concat(number))];
  o.statusDates=Object.assign({},o.statusDates,{batched:now});['ready','done','closed'].forEach(k=>delete o.statusDates[k]);o.fulfilledVia='';o.updatedAt=now;salesSyncRecordLifecycle(o);
 });
 if(!opts.deferTouch)touch();return batch;
}
/* Возврат стекла из батча. Заказ возвращается в New, как у прежнего Unbatch:
   перед следующим батчем его проверяют заново. Другие батчи не меняются. */
function glassBatchRelease(entries,opts){
 opts=opts||{};if(!opts.confirmed||!entries||!entries.length)return false;
 if(new Set(entries.map(x=>x.item.id)).size!==entries.length)return false;
 if(entries.some(x=>{
  const o=salesRecord(x.item.orderId),l=o&&o.lines.find(l=>l.id===x.item.lineId);
  return !glassBatchFind(x.batch.number)||!x.batch.items.includes(x.item)||!o||!l||!salesUnbatchEligible(o)||x.item.releasedAt||x.item.cutStartedAt||l.cutStartedAt;
 }))return false;
 const now=opts.now||new Date().toISOString();entries.forEach(x=>x.item.releasedAt=now);
 [...new Set(entries.map(x=>x.batch))].forEach(b=>{const a=entries.filter(x=>x.batch===b);b.history.push({at:now,action:'Unbatched',itemIds:a.map(x=>x.item.id),qty:a.reduce((n,x)=>n+x.item.qty,0)});});
 [...new Set(entries.map(x=>x.item.orderId))].forEach(id=>{
  const o=salesRecord(id),a=entries.filter(x=>x.item.orderId===id),lineIds=[...new Set(a.map(x=>x.item.lineId))];
  lineIds.forEach(id=>glassBatchSyncLine(o,o.lines.find(l=>l.id===id)));
  const numbers=[...new Set(a.map(x=>x.batch.number))];o.batchHistory=[...new Set((o.batchHistory||[]).concat(numbers))];o.unbatchHistory=(o.unbatchHistory||[]).concat({at:now,batchNumbers:numbers,lineIds});
  const active=o.lines.filter(salesLineLocked);o.batchNo=active.length?active[active.length-1].batchNo:'';
  o.status='new';o.statusDates={new:now};o.fulfilledVia='';o.updatedAt=now;salesSyncRecordLifecycle(o);
 });
 if(!opts.deferTouch)touch();return true;
}
/* Старые батчи импортируются как уже назначенные стёкла. Повторный запуск
   нормализации не создаёт новых записей; возвращённые записи не исчезают.
   Позиция с замком, но без активных записей, тоже импортируется: замок
   важнее — такое стекло нельзя снова выпустить в резку. */
function normalizeGlassBatches(){
 if(!Array.isArray(DB.glassBatch))DB.glassBatch=[];
 DB.glassBatch=DB.glassBatch.filter(b=>b&&typeof b==='object'&&salesBatchNumber(b.number)&&Array.isArray(b.items));
 DB.glassBatch.forEach(b=>{
  if(!Array.isArray(b.history))b.history=[];if(typeof b.createdAt!=='string')b.createdAt='';
  b.items=b.items.filter(i=>i&&typeof i==='object'&&typeof i.key==='string'&&Number.isSafeInteger(i.qty)&&i.qty>0);
  b.items.forEach(i=>{['releasedAt','cutStartedAt','at'].forEach(k=>{if(typeof i[k]!=='string')i[k]='';});if(!i.snapshot||typeof i.snapshot!=='object')i.snapshot={};});
 });
 (DB.salesOrder||[]).filter(o=>!salesIsQuote(o)).forEach(o=>(o.lines||[]).forEach((l,li)=>{
  if(!salesLineLocked(l)||glassBatchItems(o.id,l.id).some(x=>!x.item.releasedAt))return;
  const number=salesBatchNumber(l.batchNo)||salesBatchNumber(o.batchNo)||salesNextBatchNumber(),at=l.batchedAt||l.cutStartedAt||o.updatedAt||o.createdAt||'';
  let b=glassBatchFind(number);if(!b){b={number,createdAt:at,items:[],history:[]};DB.glassBatch.push(b);}
  const cs=glassBatchComponents(o,l),items=cs.map(c=>({id:salesUid('BI'),key:c.key,orderId:o.id,lineId:l.id,paneId:c.paneId,ply:c.ply,qty:l.qty,at,releasedAt:'',cutStartedAt:l.cutStartedAt||'',
   snapshot:{order:o.businessNumber,customer:salesCustomerDisplay(o.customerId),line:li+1,lite:c.lite,glass:c.glass,glassId:c.glassId||'',width:l.width16/16,height:l.height16/16,shape:'Legacy',heat:'',coating:'',production:null}}));
  b.items.push(...items);b.history.push({at,action:'Imported legacy batch',itemIds:items.map(i=>i.id),qty:l.qty*items.length});
  l.batchManaged=true;l.batchNo=number;o.batchHistory=[...new Set((o.batchHistory||[]).concat(number))];
 }));
 (DB.salesOrder||[]).forEach(o=>(o.lines||[]).forEach(l=>{if(l.batchManaged){const active=glassBatchItems(o.id,l.id).filter(x=>!x.item.releasedAt);if(active.length){if(l.cutStartedAt)active.forEach(x=>{if(!x.item.cutStartedAt)x.item.cutStartedAt=l.cutStartedAt;});glassBatchSyncLine(o,l);}}}));
}
function validateGlassBatchesPayload(src){
 if(src.glassBatch==null)return;
 if(!Array.isArray(src.glassBatch))throw new Error('Glass batches must be an array.');
 const nums=new Set(),ids=new Set(),active=new Map();
 src.glassBatch.forEach(b=>{
  if(!b||!salesBatchNumber(b.number)||nums.has(b.number)||!Array.isArray(b.items)||!Array.isArray(b.history))throw new Error('Invalid or duplicate glass batch.');nums.add(b.number);
  b.items.forEach(i=>{
   if(!i||!salesRefId(i.id)||ids.has(i.id)||!salesRefId(i.orderId)||!salesRefId(i.lineId)||typeof i.key!=='string'||!i.key.startsWith(i.orderId+'|'+i.lineId+'|')||!Number.isSafeInteger(i.qty)||i.qty<=0||typeof i.at!=='string'||!i.at||typeof i.releasedAt!=='string'||typeof i.cutStartedAt!=='string'||!i.snapshot||typeof i.snapshot!=='object')throw new Error('Invalid glass batch item.');ids.add(i.id);
   if(!i.releasedAt){const key=i.key;active.set(key,(active.get(key)||0)+i.qty);const o=(src.salesOrder||[]).find(o=>o&&o.id===i.orderId),l=o&&(o.lines||[]).find(l=>l&&l.id===i.lineId);if(!l||active.get(key)>Number(l.qty))throw new Error('Glass batch quantity or order reference is invalid.');}
  });
  b.history.forEach(h=>{if(!h||typeof h.at!=='string'||typeof h.action!=='string'||!Array.isArray(h.itemIds)||!Number.isFinite(h.qty))throw new Error('Invalid batch history.');});
 });
}
