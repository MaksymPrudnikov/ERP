/* =====================================================================
   erp/production/cut-layout  ·  cut-1.0
   Свой раскрой батча по листам. Гильотинные полосы, прямоугольники.
   IN : батч (erp/production/glass-batches), размеры листов (DB.glassSheet),
        параметры реза по толщине (masterdata/cutting)
   OUT: DB.cutPlan — листы с местами стёкол, остаток, выход

   Владелец, 1 сентября 2026: «оптимизатор пишем свой»; раскрой работает не с
   фигурой, а с прямоугольником — фигурная деталь режется из своего
   прямоугольника, форма делается потом.
   Владелец, 17 сентября 2026: на листе можно смешивать заказы, лишь бы стекло
   одно; остаток храним, учёт остатков — отдельным этапом; расход листов
   раскрой уже записывает, чтобы склад потом списывал и предупреждал заранее.
   Раскрой ничего не решает за цех: он не меняет ни размеры, ни статусы —
   только раскладывает то, что уже посчитано планом резки позиции.
   ===================================================================== */
DEFAULT.cutPlan=[];
function cutRound(v){return Math.round(v*16)/16;}
function cutArea(w,h){return (+w||0)*(+h||0)/144;}
/* Стёкла батча как прямоугольники реза. Размер тот же, что печатает стикер:
   план позиции, лайт этого стекла. */
function cutPieces(batch){
 const out=[];
 (typeof glassBatchActiveItems==='function'?glassBatchActiveItems(batch):[]).forEach(item=>{
  const part=batch.parts[item.part],o=salesRecord(part.orderId),l=o&&(o.lines||[]).find(x=>x.id===part.lineId);
  if(!o||!l)return;
  const c=glassBatchComponents(o,l).find(x=>x.key===part.key);if(!c||c.missing)return;
  const plan=finWithOrder(o,()=>{try{return salesEffectiveCuttingPlan(l,salesLineGeometryShape(l),o);}catch(e){return {valid:false};}});
  const lite=plan.valid&&(plan.lites||[]).find(x=>x.index===c.index);if(!lite||!(+lite.cutW>0)||!(+lite.cutH>0))return;
  const g=glassProductById(c.glassId);
  out.push({piece:item.piece,key:part.key,unit:item.unit,order:o.businessNumber||'',orderId:o.id,line:o.lines.indexOf(l)+1,lite:c.lite,
   glass:c.glass,mm:+((g&&g.thicknessMm)||lite.thickness)||0,w:cutRound(+lite.cutW),h:cutRound(+lite.cutH)});
 });
 /* Порядок входа задаёт порядок при равных размерах — раскрой детерминирован. */
 return out.sort((a,b)=>a.piece.localeCompare(b.piece));
}
function cutSheetFor(glassCode){
 const rows=(typeof glassSheetsFor==='function'?glassSheetsFor(glassCode):[]).filter(s=>s&&s.availability!=='inactive'&&+s.sheetWIn>0&&+s.sheetHIn>0);
 if(!rows.length)return null;
 /* Самый большой лист: из него выходит больше деталей, остаток крупнее. */
 const best=rows.slice().sort((a,b)=>(+b.sheetWIn*+b.sheetHIn)-(+a.sheetWIn*+a.sheetHIn)||String(a.supplier).localeCompare(String(b.supplier)))[0];
 return {w:+best.sheetWIn,h:+best.sheetHIn,supplier:best.supplier||'',productCode:best.productCode||glassCode};
}
/* Полосы по убыванию высоты: классический гильотинный раскрой — каждый рез
   идёт через весь лист, как режет стол. */
function cutPack(pieces,sheet,params){
 const trim=+params.trim||0,gap=+params.gap||0,W=cutRound(sheet.w-2*trim),H=cutRound(sheet.h-2*trim),sheets=[],skipped=[];
 const fits=(w,h)=>w<=W+1e-6&&h<=H+1e-6;
 const order=pieces.map((p,i)=>({p,i})).sort((a,b)=>{
  const ah=Math.max(a.p.w,a.p.h),bh=Math.max(b.p.w,b.p.h);
  return bh-ah||(b.p.w*b.p.h)-(a.p.w*a.p.h)||a.p.piece.localeCompare(b.p.piece);
 });
 const newSheet=()=>{const s={no:sheets.length+1,pieces:[],strips:[],usedH:0};sheets.push(s);return s;};
 order.forEach(({p})=>{
  /* Деталь кладётся длинной стороной вдоль полосы; поворот — если разрешён
     или если иначе не влезает. */
  let w=p.w,h=p.h,rot=false;
  if(params.rotate&&p.w<p.h){w=p.h;h=p.w;rot=true;}
  if(!fits(w,h)){if(fits(p.w,p.h)){w=p.w;h=p.h;rot=false;}else{skipped.push(p);return;}}
  for(const s of sheets){
   const strip=s.strips.find(st=>st.h>=h-1e-6&&st.x+ (st.pieces?gap:0)+w<=W+1e-6);
   if(strip){const x=strip.x+(strip.pieces?gap:0);strip.pieces++;strip.x=x+w;s.pieces.push({piece:p.piece,src:p,x:cutRound(trim+x),y:cutRound(trim+strip.y),w:cutRound(w),h:cutRound(h),rot});return;}
   const y=s.usedH?s.usedH+gap:0;
   if(y+h<=H+1e-6){const st={y,h,x:w,pieces:1};s.strips.push(st);s.usedH=y+h;s.pieces.push({piece:p.piece,src:p,x:cutRound(trim+0),y:cutRound(trim+y),w:cutRound(w),h:cutRound(h),rot});return;}
  }
  const s=newSheet(),st={y:0,h,x:w,pieces:1};s.strips.push(st);s.usedH=h;
  s.pieces.push({piece:p.piece,src:p,x:cutRound(trim+0),y:cutRound(trim+0),w:cutRound(w),h:cutRound(h),rot});
 });
 /* Остаток — полоса под последней деталью во всю ширину: её и хранят. */
 const minW=+params.minOffcutW||0,minH=+params.minOffcutH||0;
 sheets.forEach(s=>{
  const left=cutRound(H-s.usedH);
  s.offcut=left>=minH&&W>=minW?{x:cutRound(trim),y:cutRound(trim+s.usedH+(s.usedH?gap:0)),w:W,h:cutRound(left-(s.usedH?gap:0))}:null;
  if(s.offcut&&s.offcut.h<minH)s.offcut=null;
  s.used=s.pieces.reduce((a,x)=>a+cutArea(x.w,x.h),0);
  delete s.strips;delete s.usedH;
 });
 return {sheets,skipped};
}
function cutPlanFor(number){return (DB.cutPlan||[]).find(p=>p&&p.batch===number)||null;}
/* Отпечаток состава: по нему видно, что батч изменился после раскроя. */
function cutStamp(pieces){return pieces.map(p=>p.piece+':'+p.w+'x'+p.h).join('|');}
function cutPlanRun(number){
 const b=glassBatchFind(number);if(!b)return {error:'Batch not found.'};
 const pieces=cutPieces(b);if(!pieces.length)return {error:'No glass to optimize.'};
 const groups=[],byGlass=new Map();
 pieces.forEach(p=>{const k=p.glass+'|'+p.mm;if(!byGlass.has(k))byGlass.set(k,[]);byGlass.get(k).push(p);});
 let missing=[];
 [...byGlass.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([k,list])=>{
  const glass=list[0].glass,sheet=cutSheetFor(glass);
  if(!sheet){missing.push(glass);return;}
  const params=cutParamsFor(list[0].mm),pack=cutPack(list,sheet,params);
  groups.push({glass,mm:list[0].mm,sheet,params:{trim:params.trim,gap:params.gap,rotate:params.rotate},
   sheets:pack.sheets.map(s=>({no:s.no,pieces:s.pieces.map(x=>({piece:x.piece,order:x.src.order,line:x.src.line,lite:x.src.lite,unit:x.src.unit,x:x.x,y:x.y,w:x.w,h:x.h,rot:x.rot})),offcut:s.offcut,used:Math.round(s.used*100)/100})),
   skipped:pack.skipped.map(p=>({piece:p.piece,w:p.w,h:p.h}))});
 });
 if(!groups.length)return {error:missing.length?'No sheet size for '+missing.join(', ')+'. Add it in Master Data.':'No glass to optimize.'};
 const sheets=groups.reduce((n,g)=>n+g.sheets.length,0);
 const sheetArea=groups.reduce((a,g)=>a+g.sheets.length*cutArea(g.sheet.w,g.sheet.h),0);
 const used=groups.reduce((a,g)=>a+g.sheets.reduce((s,x)=>s+x.used,0),0);
 const plan={batch:number,at:new Date().toISOString(),stamp:cutStamp(pieces),groups,missing,
  stats:{pieces:pieces.length,sheets,placed:groups.reduce((n,g)=>n+g.sheets.reduce((s,x)=>s+x.pieces.length,0),0),
   skipped:groups.reduce((n,g)=>n+g.skipped.length,0),usedFt2:Math.round(used*100)/100,sheetFt2:Math.round(sheetArea*100)/100,
   yield:sheetArea?Math.round(used/sheetArea*1000)/10:0}};
 DB.cutPlan=(DB.cutPlan||[]).filter(p=>p&&p.batch!==number).concat([plan]);
 touch();
 return {plan};
}
function cutPlanStale(number){
 const plan=cutPlanFor(number),b=glassBatchFind(number);
 return !!(plan&&b&&plan.stamp!==cutStamp(cutPieces(b)));
}
/* Место стекла: «лист 2, место 6» — для стикера и печати «по листу». */
function cutPlanIndex(number){
 const plan=cutPlanFor(number),m=new Map();if(!plan)return m;
 plan.groups.forEach(g=>g.sheets.forEach(s=>s.pieces.forEach((p,i)=>m.set(p.piece,{sheet:s.no,pos:i+1,glass:g.glass}))));
 return m;
}
function normalizeCutPlans(){
 if(!Array.isArray(DB.cutPlan))DB.cutPlan=[];
 const seen=new Set();
 DB.cutPlan=DB.cutPlan.filter(p=>p&&typeof p==='object'&&typeof p.batch==='string'&&Array.isArray(p.groups)&&!seen.has(p.batch)&&(seen.add(p.batch),true)&&(typeof glassBatchFind!=='function'||glassBatchFind(p.batch)))
  .map(p=>Object.assign({},p,{groups:p.groups.filter(g=>g&&Array.isArray(g.sheets)).map(g=>Object.assign({},g,{
   sheets:g.sheets.filter(s=>s&&Array.isArray(s.pieces)).map(s=>Object.assign({},s,{pieces:s.pieces.filter(x=>x&&typeof x.piece==='string')}))}))}));
}
function validateCutPlanPayload(src){
 if(src.cutPlan==null)return;
 if(!Array.isArray(src.cutPlan))throw new Error('Cut plans must be an array.');
 const seen=new Set();
 src.cutPlan.forEach(p=>{
  if(!p||typeof p!=='object'||typeof p.batch!=='string'||!p.batch||!Array.isArray(p.groups))throw new Error('Invalid cut plan.');
  if(seen.has(p.batch))throw new Error('Duplicate cut plan for '+p.batch+'.');seen.add(p.batch);
 });
}
