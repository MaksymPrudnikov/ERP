/* =====================================================================
   reports/facts-shop  ·  facts-1.0
   Цех сейчас: каждое стекло, которое ещё не отдали клиенту, — где оно
   (заказ не проверен, ждёт батча, ждёт станцию, готово), сколько дней
   ждёт, просрочено ли. Листы по резчику: порезанные и лопнувшие листы.
   IN : заказы, номера стёкол (glassPieceMap), батчи, сканы станций,
        место стекла по маршруту (stationPlace — то же, что Production и
        Overview), листы раскроя (invCutSheets, invBreaks)
   OUT: repShopFacts() — строка на стекло; repSheetCutFacts() — строка на
        порезанный или лопнувший лист
   Правило: файл ничего не рисует.

   Владелец, 26.10.2026: «что ждёт, что не ждёт, что овердью, что уже
   готово, а что нет».
   · Готово — прошло станцию готовности (SHIPR) и ждёт выдачи.
   · Просрочено — срок прошёл, а стекло не готово; у доставки — и готовое,
     пока не уехало: самовывоз вовремя по готовности (как Orders). Due
     state: Overdue · Due today · Due later · No due date · Ready (готово к
     самовывозу — по сроку уже не считается).
   · Ждёт с — последний скан стекла; у стекла без сканов — батч, у
     непорезанного без батча — Verify, у непроверенного заказа — создание.
   ===================================================================== */
const REP_SHOP_DONE=['done','closed','cancelled'];
let repShopCache={stamp:'',rows:null};
function repShopDays(from,now){const t=Date.parse(from);return Number.isNaN(t)?null:Math.max(0,Math.floor((now-t)/864e5));}
function repShopFacts(){
 const today=finToday(),stamp=today+'|'+(typeof prodBoardStamp==='function'?prodBoardStamp():'')+'|'+(DB.shipment||[]).length;
 if(repShopCache.stamp===stamp&&repShopCache.rows)return repShopCache.rows;
 const now=Date.now(),ship=shippingStations().ship,batches=stationBatchIndex(),scansBy=new Map(),rows=[];
 (DB.stationScan||[]).forEach(s=>{if(s.undoneAt)return;if(!scansBy.has(s.piece))scansBy.set(s.piece,[]);scansBy.get(s.piece).push(s);});
 (DB.salesOrder||[]).forEach(o=>{
  if(!o||salesIsQuote(o)||REP_SHOP_DONE.includes(o.status))return;
  try{finWithOrder(o,()=>repShopOrder(o,{today,now,ship,batches,scansBy,rows}));}catch(e){}
 });
 repShopCache={stamp,rows};
 return rows;
}
function repShopOrder(o,x){
 const due=o.dueDate||'',delivery=o.delivery==='delivery',pieces=o.status==='new'?new Map():glassPieceMap(o.id);
 const base=Object.assign({},repOrderInfo(o),{orderId:o.id,order:o.businessNumber||'',customerId:o.customerId||'',due,priority:SALES_LIST_PRIORITY[o.priority]||'Normal',
  hold:o.onHold?'On hold':'Not on hold',status:salesStatusLabel(o)});
 const put=(c,l,r)=>{
  const ready=r.where==='Ready',over=!!due&&due<x.today&&(!ready||delivery);
  x.rows.push(Object.assign({},base,{glass:c.glass,mm:repCompMm(c),area:r.area,glassN:r.n,id:o.id+'#'+x.rows.length,
   stage:r.where==='To verify'||r.where==='To batch'?'Not started':ready?'Ready':'In production',since:r.since||'',days:r.since?repShopDays(r.since,x.now):null,
   state:over?'Overdue':ready&&!delivery?'Ready':!due?'No due date':due===x.today?'Due today':'Due later',over:over?r.n:0,daysOver:over?repDaysBetween(due,x.today):null,overOrder:over?base.order:''},repLineInfo(l),r));
 };
 (o.lines||[]).forEach(l=>{
  const a=salesLineAreas(l,o),per=a&&a.valid?a.actual:null,live=Math.max(0,salesPositiveInt(l.qty,1)-unitCancelled(l));
  glassBatchComponents(o,l).forEach(c=>{
   if(c.missing)return;
   const rec=pieces.get(c.key);
   /* Без номеров стёкол — заказ ещё не проверен: стекло строкой на позицию. */
   if(!rec){if(live)put(c,l,{where:'To verify',n:live,area:per==null?null:per*live,since:o.createdAt||''});return;}
   const ids=rec.ids.map((id,i)=>[id,i+1]).concat(...Object.keys(rec.extra||{}).map(nr=>rec.extra[nr].map((id,k)=>[id,nr+'.'+(k+1)]))).filter(v=>v[0]);
   ids.forEach(([id,unit])=>{
    const e=x.batches.get(id)||null,scans=x.scansBy.get(id)||[],g={id,o,l,c,unit,entry:e};
    if(unitPieceCancelled(g))return;
    const place=stationPlace(g,scans);if(place.broken)return;
    /* В очереди батча — только то, что режут (как Production). */
    if(!e&&!scans.length&&glassComponentCut(c)){put(c,l,{where:'To batch',n:1,area:per,piece:id,since:o.statusDates&&o.statusDates.verified||o.createdAt||''});return;}
    if(place.shipped||!place.waiting)return;
    const last=scans.slice().sort((p,q)=>String(p.at).localeCompare(String(q.at))).pop()||null;
    put(c,l,{where:place.waiting===x.ship?'Ready':place.waiting,n:1,area:per,piece:id,batch:e?e.batch.number:'',from:last?last.station:'',on:last&&last.on||'',
     since:last?last.at:e&&e.item&&e.item.at||''});
   });
  });
 });
}

/* Листы по резчику: первый рез с листа (invCutSheets — тот же лист, что
   списывает склад) и лопнувший на столе лист; отменённый (Undo) — нет. */
let repSheetCutCache={stamp:'',rows:null};
function repSheetCutFacts(){
 const scans=DB.stationScan||[],breaks=DB.sheetBreak||[];let undone=0;scans.forEach(s=>{if(s.undoneAt)undone++;});breaks.forEach(b=>{if(b.undoneAt)undone++;});
 const stamp=[scans.length,undone,breaks.length,(DB.cutPlan||[]).length,(DB.cutPlan||[]).map(p=>p&&p.at||'').join(',')].join('|');
 if(repSheetCutCache.stamp===stamp&&repSheetCutCache.rows)return repSheetCutCache.rows;
 const rows=[],mm=code=>{const g=glassProductByCode(code);return g&&g.thicknessMm||null;},sz=(w,h)=>w&&h?frac16(Math.max(w,h))+' × '+frac16(Math.min(w,h))+'″':'—';
 if(typeof invCutSheets==='function')invCutSheets().forEach(s=>rows.push({id:'C|'+s.id,at:s.at,day:repDay(s.at),person:s.by||'',event:'Cut',glass:s.glass,mm:mm(s.glass),size:sz(s.w,s.h),
  kind:s.stock?'Offcut':'Sheet',batch:s.batch,sheets:1,broke:0,area:s.w&&s.h?s.w*s.h/144:null}));
 if(typeof invBreaks==='function')invBreaks(true).forEach(({x,size,stock})=>{if(x.undoneAt)return;
  rows.push({id:'B|'+x.id,at:x.at,day:repDay(x.at),person:x.by||'',event:'Broke',glass:x.glass,mm:mm(x.glass),size:size?sz(size.w,size.h):'—',kind:stock?'Offcut':'Sheet',batch:x.batch,sheets:0,broke:1,area:null});});
 repSheetCutCache={stamp,rows};
 return rows;
}
