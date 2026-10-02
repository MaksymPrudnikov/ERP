/* =====================================================================
   erp/sales/cut-estimate  ·  cut-est-1.0
   Прикидка раскроя из Sales: заказы и квоты в любом сочетании.
   IN : заказы и ревизии квот (DB.salesOrder); движок раскроя
        (erp/production/cut-layout) по номеру EST
   OUT: стёкла прикидки, её план в памяти вкладки, «отдельно / вместе»

   Владелец, 2 октября 2026: «иногда батч выглядит очень плохо, например
   потери 40 процентов; мы, как правило, ждём, когда клиент или квота очень
   быстрая, которая станет заказом сегодня-завтра, поможет уменьшить
   вейстедж, и тогда, если всё ок, клиенту с плохой оптимизацией не
   увеличиваем сумму». Это только просмотр: «ни в коем случае не лезть в
   раздел оптимизации, чтобы не спутать и не создать хаоса». Поэтому
   прикидка ничего не сохраняет (закрыл окно — её нет), touch() не зовёт,
   батчей, Glass ID и брони стока у неё нет. Номер стекла свой:
   Q-10003-R2/1/1a/3 — запись / позиция / лайт / изделие; G- в нём нет,
   спутать или отсканировать нечего. Раскрой — тем же движком, что батч,
   и так же только внутри одного стекла и толщины.
   ===================================================================== */
const CUT_EST='EST',CUT_EST_BIG=300;
let cutEst=null;
/* Один показ окна сканирует запись много раз (шапка, черновик, сравнение);
   на время показа скан запоминается, потом забывается — правка квоты в
   другой вкладке видна при следующем показе. */
let cutEstMemo=null;
/* Запись прикидки: заказ — сам заказ, квота — выбранная ревизия.
   Отменённый заказ не режут — в прикидку он не берётся. */
function cutEstUsable(o){return !!o&&(salesIsQuote(o)||o.status!=='cancelled');}
function cutEstRecords(){return cutEst?cutEst.recs.filter(r=>r.on).map(r=>salesRecord(r.id)).filter(cutEstUsable):[];}
function cutEstPieceId(o,line,lite,unit){return String(o.businessNumber||o.id).replace(/[^A-Za-z0-9-]/g,'')+'/'+line+'/'+lite+'/'+unit;}
/* Стёкла записи: все позиции × количество × стёкла (у ламината — каждая
   плита). Что резать нельзя — нет стекла или не сходится геометрия, —
   уходит в skipped с причиной, как в очереди To batch. План резки
   позиции считается один раз на позицию, а не на каждое изделие. */
function cutEstScan(o){
 if(cutEstMemo&&cutEstMemo.has(o.id))return cutEstMemo.get(o.id);
 const pieces=[],skipped=[];
 finWithOrder(o,()=>(o.lines||[]).forEach((l,li)=>{
  let plan=null;
  glassBatchComponents(o,l).forEach(c=>{
   const miss=reason=>skipped.push({order:o.businessNumber||'',line:li+1,lite:c.lite,qty:+l.qty||0,reason});
   if(c.missing||!glassProductById(c.glassId))return miss('Glass missing');
   if(!plan){try{plan=salesEffectiveCuttingPlan(l,salesLineGeometryShape(l),o);}catch(e){plan={valid:false};}}
   const lite=plan.valid&&(plan.lites||[]).find(x=>x.index===c.index);
   if(!lite||!(+lite.cutW>0)||!(+lite.cutH>0))return miss(plan.reason||'Check cutting geometry');
   for(let unit=1;unit<=(+l.qty||0);unit++)pieces.push({l,c,lite,unit,line:li+1});
  });
 }));
 const out={pieces,skipped};
 if(cutEstMemo)cutEstMemo.set(o.id,out);
 return out;
}
/* Стёкла для движка: EST — все записи, EST:<id> — одна запись и только
   общее с другими стекло (cutEst.shared, ставит Build). Стекло одной записи
   отдельно и вместе раскраивается одинаково — второй раз его не считаем:
   типы стекла раскраиваются независимо, цифры общего стекла от этого не
   меняются. На 3 заказах × 5 мейкапов (868 стёкол, 16 типов) прогоны
   «отдельно» стали в несколько раз короче. */
function cutEstPieces(number,settings){
 if(!cutEst)return [];
 const only=number.indexOf(':')>0?number.slice(number.indexOf(':')+1):'',set=settings||{},out=[];
 const keep=only&&cutEst.shared?cutEst.shared:null;
 cutEstRecords().filter(o=>!only||o.id===only).forEach(o=>cutEstScan(o).pieces.forEach(x=>{
  const id=cutEstPieceId(o,x.line,x.c.lite,x.unit),row=cutPieceFrom(o,x.l,x.c,x.lite,id,x.unit,set[id]||{});
  if(!keep||keep.has(row.glass+'|'+row.mm))out.push(row);
 }));
 return out.sort((a,b)=>a.piece.localeCompare(b.piece,undefined,{numeric:true}));
}
function cutEstSkipped(){return cutEstRecords().flatMap(o=>cutEstScan(o).skipped);}
/* План прикидки — только в памяти. EST:<id> строится пробой и не хранится. */
function cutEstPlan(number){return cutEst&&number===CUT_EST?cutEst.plan:null;}
function cutEstPlanSet(number,plan){if(!cutEst||number!==CUT_EST)return;cutEst.plan=plan;if(plan&&plan.reset)cutEst.alone=null;}
/* Отмеченные строки Sales → записи прикидки. Квота в списке — одна строка
   на все ревизии; берём выбранную (won) или последнюю, в окне её меняют.
   Выигранная квота и заказ из неё — одно и то же стекло: если отмечены оба,
   берётся заказ, иначе стекло посчиталось бы дважды. */
function cutEstOpen(ids){
 const recs=[],seen=new Set(),picked=(ids||[]).map(salesRecord).filter(cutEstUsable);
 const orders=picked.filter(o=>!salesIsQuote(o)),made=new Set(orders.map(o=>o.id)),from=new Set(orders.map(o=>o.fromQuoteId).filter(Boolean));
 picked.forEach(o=>{
  const q=salesIsQuote(o),key=q?salesQuoteGroupId(o):o.id;
  if(seen.has(key)||q&&salesQuoteMembers(o).some(m=>made.has(m.wonOrderId)||from.has(m.id)))return;seen.add(key);
  recs.push({key,id:q?salesQuoteRepresentative(o).id:o.id,on:true});
 });
 if(!recs.length)return false;
 cutEst={recs,plan:null,alone:null};
 cutWhat=null;cutNotice='';cutInfo=null;cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};
 return true;
}
function cutEstClose(){
 if(cutBusy&&cutEstIs(cutBusy.batch))cutBusy.stop=true;
 cutEst=null;cutWhat=null;cutNotice='';cutInfo=null;
 if(cutEstIs(cutUi.batch))cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};
}
/* Запись выключена или выбрана другая ревизия — раскрой сбрасывается, как
   Reset у батча: размеры листов и отступы прикидки остаются, Build заново. */
function cutEstChange(key,fn){
 const r=cutEst&&cutEst.recs.find(x=>x.key===key);if(!r||cutBusy)return false;
 if(fn(r)===false)return false;
 cutWhat=null;cutNotice='';cutEst.alone=null;cutPlanReset(CUT_EST);return true;
}
function cutEstToggle(key,on){return cutEstChange(key,r=>{r.on=!!on;});}
function cutEstRevision(key,id){
 const o=salesRecord(id);
 return cutEstChange(key,r=>{if(!o||!salesIsQuote(o)||salesQuoteGroupId(o)!==key)return false;r.id=id;});
}
/* Стекло и толщина → сколько стёкол и у каких записей. Смешивать можно
   только там, где записей две и больше: раскрой идёт по стеклу. Владелец,
   2 октября 2026: «не пишет, сколько какого стекла в штуках… если
   мейкапов 15, нужно точно понимать: 6CL 520, 6 blue 221». by — штуки
   по записям, в порядке записей. */
function cutEstGlass(pieces){
 const m=new Map();
 (pieces||[]).filter(p=>!p.off).forEach(p=>{
  const k=p.glass+'|'+p.mm;
  if(!m.has(k))m.set(k,{glass:p.glass,mm:p.mm,ids:new Set(),pcs:0,by:new Map()});
  const g=m.get(k);g.ids.add(p.orderId);g.pcs++;
  const r=g.by.get(p.orderId)||{order:p.order,pcs:0};r.pcs++;g.by.set(p.orderId,r);
 });
 return [...m.values()].sort((a,b)=>(a.glass+'|'+a.mm).localeCompare(b.glass+'|'+b.mm));
}
function cutEstSum(g){const t=cutTotals([g]);return {glass:g.glass,mm:g.mm,sheets:t.sheets,area:t.area,used:t.used,net:t.net,unplaced:(g.unplaced||[]).length};}
/* Build прикидки: сначала все записи вместе (план EST), потом каждая запись,
   у которой есть общее с другими стекло, отдельно — пробой, тем же движком
   и с теми же размерами листов и отступами, только по общему стеклу. Если
   общего стекла у записи больше 300 штук, она считается быстрым вариантом,
   как прикидки What if, и помечается ≈. */
function* cutEstSteps(){
 const groups=cutEstGlass(cutPiecesOf(CUT_EST));
 if(cutEst)cutEst.shared=new Set(groups.filter(g=>g.ids.size>1).map(g=>g.glass+'|'+g.mm));
 const solo=cutEstRecords().filter(o=>groups.some(g=>g.ids.size>1&&g.ids.has(o.id)));
 const runs=1+solo.length;
 let it=cutPlanSteps(CUT_EST),r=it.next();
 while(!r.done){yield r.value/runs;r=it.next();}
 const out=r.value;
 if(!out||out.error||!cutEst||!cutEst.plan)return out;
 const pick=cutEst.plan.sheetPick||{},alone={};
 for(let i=0;i<solo.length;i++){
  const o=solo[i],n=CUT_EST+':'+o.id,quick=cutPiecesOf(n).length>CUT_EST_BIG;
  it=cutPlanSteps(n,glass=>pick[glass]||null,quick);r=it.next();
  while(!r.done){yield (1+i+r.value)/runs;r=it.next();}
  const p=r.value&&r.value.plan;
  if(p)alone[o.id]={quick,groups:p.groups.map(cutEstSum)};
 }
 if(cutEst)cutEst.alone=alone;
 return out;
}
/* «Отдельно / вместе» по стеклу, где записей больше одной. Waste % — как в
   Waste by order: Net / (стекло + Net). Вместе Net делится по площади
   стекла записей, поэтому у всех записей одного стекла процент один —
   его и сравнивают с процентом записи отдельно. */
function cutEstCompare(){
 const plan=cutEst&&cutEst.plan;if(!plan||plan.reset||!cutEst.alone)return [];
 const src=new Map(cutPiecesOf(CUT_EST,plan.settings||{}).map(p=>[p.piece,p]));
 return plan.groups.map(g=>{
  const t=cutTotals([g]),by=new Map();
  g.sheets.forEach(s=>s.pieces.forEach(p=>{
   const q=src.get(p.piece);if(!q)return;
   const r=by.get(q.orderId)||{id:q.orderId,order:q.order,customer:q.customer,pcs:0,used:0};
   r.pcs++;r.used+=cutArea(p.w,p.h);by.set(q.orderId,r);
  }));
  const rows=[...by.values()].map(r=>{
   const own=cutEst.alone[r.id],a=own&&own.groups.find(x=>x.glass===g.glass&&x.mm===g.mm)||null;
   return Object.assign(r,{used:cutFt2(r.used),alone:a,quick:!!(own&&own.quick),alonePct:a?cutPct(a.net,a.used+a.net):null});
  });
  return {glass:g.glass,mm:g.mm,sheets:t.sheets,used:t.used,net:t.net,pct:cutPct(t.net,t.used+t.net),rows};
 }).filter(x=>x.rows.length>1);
}
