/* =====================================================================
   reports/facts-plan  ·  facts-1.0
   План раскроя против факта и склад сейчас — для Reports.
   IN : раскрой батча (DB.cutPlan), листы по скану резчика (invCutSheets),
        лопнувшие листы (invBreaks), стекло батча и разбитое стекло (сканы
        broken), склад листов, обрезков, расходников и Stock items
   OUT: repPlanFacts() — строка: батч × стекло; repStockFacts() — строка:
        позиция склада сейчас
   Правило: файл ничего не рисует.

   Владелец, 03.11.2026: «все переменные — что было реально, а что было
   оптимизировано, чтобы выявлять проблемы и решать их». Лопнувший лист — не
   порезанный, это другой раздел: в «порезано» и в отход по факту не идёт.
   · План — раскрой батча: листы, ft² листов, годное (used), отход (net).
   · Факт — листы, порезанные по скану (первый рез с листа), их ft²;
     годное — стекло батча, порезанное и не разбитое (Recut — своей
     колонкой); отход по факту — ft² порезанных листов минус годное.
   ===================================================================== */
let repPlanCache={stamp:'',rows:null};
function repPlanFacts(){
 const stamp=readMemo('repPlanStamp',[DB.glassBatch,DB.cutPlan,DB.sheetBreak,DB.stationScan],()=>{
  const b=(DB.glassBatch||[]).map(x=>{let cut=0;x.items.forEach(i=>{if(i.cutStartedAt)cut++;});return x.number+':'+x.items.length+':'+cut;}).join(',');
  let undone=0;(DB.stationScan||[]).forEach(s=>{if(s.undoneAt)undone++;});
  return [b,(DB.cutPlan||[]).map(p=>p&&p.batch+(p.at||'')+(p.reset?'R':'')).join(','),(DB.sheetBreak||[]).length,(DB.stationScan||[]).length,undone].join('|');
 });
 if(repPlanCache.stamp===stamp&&repPlanCache.rows)return repPlanCache.rows;
 const rows=new Map(),row=(batch,glass)=>{const k=batch+'|'+glass;let r=rows.get(k);
  if(!r){const g=glassProductByCode(glass);rows.set(k,r={id:k,batch,glass,mm:g&&g.thicknessMm||null,at:'',built:'',cutAt:'',person:'',status:'',planSheets:0,planFt2:0,glassFt2:0,planWaste:0,
   cutSheets:0,cutFt2:0,brokenSheets:0,brokenFt2:0,goodFt2:0,recutFt2:0,recutN:0,cutters:new Map()});}
  return r;};
 const byNo=new Map();(DB.glassBatch||[]).forEach(b=>{if(!byNo.has(b.number))byNo.set(b.number,b);});
 (DB.cutPlan||[]).forEach(p=>{if(!p||p.reset||!Array.isArray(p.groups))return;const b=byNo.get(p.batch);if(!b)return;
  p.groups.forEach(g=>{const r=row(p.batch,g.glass);r.at=r.built=b.createdAt||p.at||'';r.status=SHEET_USAGE_STATUS[glassBatchStatus(b)]||'';
   g.sheets.forEach(s=>{const z=s.size||g.sheet||{};r.planSheets++;r.planFt2+=cutArea(z.w,z.h);r.glassFt2+=+s.used||0;r.planWaste+=+s.net||0;});});});
 if(typeof invCutSheets==='function')invCutSheets().forEach(s=>{if(!s.batch)return;const r=row(s.batch,s.glass);r.cutSheets++;r.cutFt2+=s.w&&s.h?s.w*s.h/144:0;
  if(!r.cutAt||s.at<r.cutAt)r.cutAt=s.at;const who=s.by||'';if(who)r.cutters.set(who,(r.cutters.get(who)||0)+1);});
 if(typeof invBreaks==='function')invBreaks(true).forEach(({x,size})=>{if(x.undoneAt||!x.batch)return;const r=row(x.batch,x.glass);r.brokenSheets++;r.brokenFt2+=size?size.w*size.h/144:0;});
 /* Годное — порезанное стекло батча без разбитого; разбитое — Recut. */
 const broken=new Set();(DB.stationScan||[]).forEach(s=>{if(s.broken&&!s.undoneAt)broken.add(s.piece);});
 byNo.forEach(b=>glassBatchActiveItems(b).forEach(i=>{if(!i.cutStartedAt)return;const sn=(b.parts[i.part]||{}).snapshot||{},code=sn.glass||'';if(!rows.has(b.number+'|'+code))return;
  const r=rows.get(b.number+'|'+code),a=sn.width>0&&sn.height>0?sn.width*sn.height/144:0;if(broken.has(i.piece)){r.recutFt2+=a;r.recutN++;}else r.goodFt2+=a;}));
 const out=[...rows.values()].map(r=>{
  const top=[...r.cutters.entries()].sort((a,b)=>b[1]-a[1])[0];delete r.cutters;
  const f=v=>Math.round(v*100)/100;
  return Object.assign(r,{person:top?top[0]:'',cut:repDay(r.cutAt),planFt2:f(r.planFt2),glassFt2:f(r.glassFt2),planWaste:f(r.planWaste),cutFt2:f(r.cutFt2),brokenFt2:f(r.brokenFt2),goodFt2:f(r.goodFt2),recutFt2:f(r.recutFt2),
   diffSheets:r.cutSheets-r.planSheets,actualWaste:f(Math.max(0,r.cutFt2-r.goodFt2-r.recutFt2)),cutDone:r.cutSheets?1:0});
 });
 repPlanCache={stamp,rows:out};
 return out;
}
/* Склад сейчас: листы, обрезки на полке, расходники, Stock items — всё на
   складе одной таблицей. */
function repStockFacts(){
 const out=[],size=(w,h)=>w&&h?frac16(Math.max(w,h))+' × '+frac16(Math.min(w,h))+'″':'—';
 if(typeof invSheetRows==='function')invSheetRows().forEach(r=>{const ft=r.w&&r.h?r.w*r.h/144:0;
  out.push({id:'S|'+r.key,kind:'Sheet',material:r.code,glass:r.code,mm:r.mm,size:size(r.w,r.h),unit:'sheets',status:r.status,onHand:r.onRack,free:r.free,reserved:r.reserved,onOrder:r.onOrder,min:r.min,ft2:Math.round(r.onRack*ft*100)/100,pcs:r.onRack});});
 if(typeof invOffcutRows==='function')invOffcutRows().forEach(o=>{if(!['On rack','In batch'].includes(o.status))return;
  out.push({id:'O|'+o.id,kind:'Offcut',material:o.glass,glass:o.glass,mm:o.mm||null,size:size(o.w,o.h),unit:'pcs',status:o.status,onHand:1,free:o.status==='On rack'?1:0,reserved:o.status==='In batch'?1:0,onOrder:0,min:null,ft2:o.area||0,pcs:1});});
 if(typeof consRows==='function')consRows().forEach(r=>{if(r.off)return;
  out.push({id:'C|'+r.key,kind:r.group||'Consumable',material:r.name,glass:'',mm:null,size:'',unit:r.unit||'',status:r.status||'',onHand:r.onHand,free:r.free,reserved:r.reserved,onOrder:r.onOrder||0,min:r.min==null?null:r.min,ft2:0,pcs:0});});
 if(typeof sinvBuild==='function')sinvBuild().forEach(r=>{if(r.off)return;
  out.push({id:'I|'+r.id,kind:'Stock item',material:r.name,glass:'',mm:null,size:r.measures||'',unit:'pcs',status:r.status||'',onHand:r.onHand,free:r.available,reserved:r.reserved,onOrder:r.onOrder||0,min:r.min==null?null:r.min,ft2:0,pcs:r.onHand});});
 return out;
}
