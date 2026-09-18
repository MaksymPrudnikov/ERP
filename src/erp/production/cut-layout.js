/* =====================================================================
   erp/production/cut-layout  ·  cut-2.0
   Раскрой батча по листам: раскладка, правки руками, потери.
   IN : батч (erp/production/glass-batches), листы (DB.glassSheet),
        параметры реза по толщине (masterdata/cutting)
   OUT: DB.cutPlan — листы с местами стёкол, остаток, Used / Gross / Net

   Владелец, 17 сентября 2026, по своему проекту Perfect Cut:
   - между прямоугольниками зазора НЕТ; минимальное расстояние нужно,
     «только когда шейп кривой, имеет скос специфичный»;
   - Trim и Border — отступы от краёв листа (18 сентября): Trim X снизу,
     Trim Y слева, Border X сверху, Border Y справа; детали за эти линии
     не заходят;
   - «основной задачей является оптимизация под низший процент», приоритет
     лишь тянет деталь на первые листы;
   - потери нужно видеть по каждому листу и по всем: по ним считают цену
     большого заказа;
   - раскладку правят руками: снять, положить, повернуть, перенести,
     закрепить деталь, заблокировать лист — «заблокированный лист будет
     первый в очереди, остальные после».
   Счёт потерь как у Perfect Cut: Gross Scrap — весь остаток листа,
   NetScrap — остаток за вычетом куска, который кладут на стеллаж,
   Used % = used / (used + net).
   ===================================================================== */
DEFAULT.cutPlan=[];
const CUT_STRATEGIES=[
 {k:'area',   order:(a,b)=>b.w*b.h-a.w*a.h,                       prefer:'more'},
 {k:'long',   order:(a,b)=>Math.max(b.w,b.h)-Math.max(a.w,a.h),   prefer:'more'},
 {k:'height', order:(a,b)=>b.h-a.h||b.w-a.w,                      prefer:'tall'},
 {k:'width',  order:(a,b)=>b.w-a.w||b.h-a.h,                      prefer:'wide'}
];
function cutRound(v){return Math.round(v*16)/16;}
function cutArea(w,h){return (+w||0)*(+h||0)/144;}
function cutFt2(v){return Math.round(v*100)/100;}
function cutPct(part,whole){return whole>0?Math.round(part/whole*1000)/10:0;}
/* ------------------------------ Детали ------------------------------ */
/* Стёкла батча как прямоугольники реза: тот же размер, что печатает стикер.
   shape — деталь не прямоугольная: вокруг неё нужен зазор. */
function cutPieces(batch,settings){
 const out=[],set=settings||{};
 (typeof glassBatchActiveItems==='function'?glassBatchActiveItems(batch):[]).forEach(item=>{
  const part=batch.parts[item.part],o=salesRecord(part.orderId),l=o&&(o.lines||[]).find(x=>x.id===part.lineId);
  if(!o||!l)return;
  const c=glassBatchComponents(o,l).find(x=>x.key===part.key);if(!c||c.missing)return;
  const plan=finWithOrder(o,()=>{try{return salesEffectiveCuttingPlan(l,salesLineGeometryShape(l),o);}catch(e){return {valid:false};}});
  const lite=plan.valid&&(plan.lites||[]).find(x=>x.index===c.index);if(!lite||!(+lite.cutW>0)||!(+lite.cutH>0))return;
  const g=glassProductById(c.glassId),own=set[item.piece]||{};
  out.push({piece:item.piece,key:part.key,unit:item.unit,orderId:o.id,order:o.businessNumber||'',customer:salesCustomerDisplay(o.customerId),
   line:o.lines.indexOf(l)+1,mark:l.mark||'',lite:c.lite,glass:c.glass,mm:+((g&&g.thicknessMm)||lite.thickness)||0,
   w:cutRound(+lite.cutW),h:cutRound(+lite.cutH),shape:!!(typeof stkShapeOf==='function'&&stkShapeOf(lite)),
   off:!!own.off,priority:cutPriority(own.priority),norot:!!own.norot});
 });
 return out.sort((a,b)=>a.piece.localeCompare(b.piece));
}
function cutPriority(v){const n=Math.round(+v);return Number.isFinite(n)&&n>=1&&n<=10?n:5;}
/* Размеры листов этого стекла из поставок Master Data. Лист всегда лёжа:
   длинная сторона — X по горизонтали, как на столе и в Perfect Cut
   (владелец, 18 сентября 2026: «ориентация щита должна быть по горизонтали»). */
function cutSheetOptions(glassCode){
 return (typeof glassSheetsFor==='function'?glassSheetsFor(glassCode):[]).filter(s=>s&&s.availability!=='inactive'&&+s.sheetWIn>0&&+s.sheetHIn>0)
  .map(s=>({w:Math.max(+s.sheetWIn,+s.sheetHIn),h:Math.min(+s.sheetWIn,+s.sheetHIn),supplier:s.supplier||'',productCode:s.productCode||glassCode}))
  .sort((a,b)=>b.w*b.h-a.w*a.h||String(a.supplier).localeCompare(String(b.supplier)));
}
function cutSheetKey(size){return size?cutRound(size.w)+'x'+cutRound(size.h):'';}
/* Параметры прогона: по толщине, а отступы от краёв — свои у каждого размера
   листа: «Trim X Y Border для каждого размера индивидуальные… лучше сделать
   их отдельными и флексибл» (владелец, 18 сентября 2026).
   Порядок: размер листа в этом прогоне → весь прогон → размер листа в
   Master Data → толщина. */
function cutRunParams(mm,size,pick){
 const p=cutParamsFor(mm),key=cutSheetKey(size),own=typeof cutSheetTrim==='function'?cutSheetTrim(key):null,run=pick||{};
 const row=Array.isArray(run.sizes)&&run.sizes.find(x=>x&&x.key===key)||{};
 const num=(v,fallback)=>v!=null&&v!==''&&Number.isFinite(+v)&&+v>=0?+v:fallback;
 const edge=(f,base)=>num(row[f],num(run[f],own&&own[f]!=null?own[f]:base));
 return Object.assign({},p,{
  trimX:edge('trimX',p.trim),trimY:edge('trimY',p.trim),borderX:edge('borderX',p.border),borderY:edge('borderY',p.border),
  minDist:num(run.minDist,p.minDist),
  rotate:typeof run.rotate==='boolean'?run.rotate:p.rotate,
  minOffcutW:num(run.minOffcutW,p.minOffcutW),minOffcutH:num(run.minOffcutH,p.minOffcutH)});
}
function cutGroupParams(group,size){
 const use=size||group.sheet;
 const p=cutRunParams(group.mm,use,group.pick);
 return Object.assign(p,group.params&&(!size||cutSheetKey(use)===cutSheetKey(group.sheet))?{minDist:group.params.minDist,rotate:group.params.rotate}:{});
}
/* Рабочее поле листа между линиями: слева Trim Y, снизу Trim X, справа
   Border Y, сверху Border X. Ноль — левый нижний угол листа. */
function cutUsable(size,params){
 const x0=+params.trimY||0,y0=+params.trimX||0,x1=cutRound(size.w-(+params.borderY||0)),y1=cutRound(size.h-(+params.borderX||0));
 return {x0,y0,x1,y1,W:cutRound(x1-x0),H:cutRound(y1-y0)};
}
/* Склад прогона: какие размеры листов берём и сколько их есть. «Иногда мы
   используем 10 листов 130 и 40 листов 144» (владелец, 18 сентября 2026):
   листы берутся по порядку списка, пока не кончится их количество. */
function cutStockFor(glassCode,pick){
 const rows=cutSheetOptions(glassCode);if(!rows.length)return [];
 const own=pick&&Array.isArray(pick.sizes)?pick.sizes:null;
 const out=rows.map(r=>{
  const set=own&&own.find(x=>x&&x.key===cutSheetKey(r));
  return {key:cutSheetKey(r),w:r.w,h:r.h,supplier:r.supplier,limit:set&&+set.limit>0?Math.floor(+set.limit):0,off:!!(set&&set.off)};
 }).filter(r=>!r.off);
 if(own&&own.length)out.sort((a,b)=>{
  const ia=own.findIndex(x=>x&&x.key===a.key),ib=own.findIndex(x=>x&&x.key===b.key);
  return (ia<0?99:ia)-(ib<0?99:ib);
 });
 return out;
}
/* Расстояние между парой деталей: у прямоугольников 0, у формы со скосом —
   Min distance по толщине. */
function cutGapBetween(a,b,params){
 const g=x=>x&&x.shape?+params.minDist||0:0;
 return Math.max(g(a),g(b));
}
function cutEdgeGap(p,params){return p&&p.shape?+params.minDist||0:0;}
/* Полоска между деталью и линией реза: 0 или не меньше Min distance.
   «1/16 — это ошибка: сломать нельзя, слишком маленькое расстояние;
   отправлять на полировку — это время; а если это LowE — это брак, его
   нельзя полировать» (владелец, 18 сентября 2026). У краёв листа это
   держат линии Border, внутри полосы — это правило. */
function cutSliverOk(rest,params){return rest>=-1e-6&&(rest<=1e-6||rest>=(+params.minDist||0)-1e-6);}

/* ---------------------------- Раскладка ---------------------------- */
/* Гильотинные полосы: рез идёт через весь лист, как режет стол. У каждого
   листа свой размер из склада прогона и свои отступы от краёв. */
function cutPack(list,stock,paramsFor,strategy,fixed,mm){
 const sheets=(fixed||[]).map(s=>cutCloneSheet(s)),unplaced=[];
 const used=new Map();sheets.forEach(s=>used.set(s.size.key,(used.get(s.size.key)||0)+1));
 const room=size=>{const p=paramsFor(size),u=cutUsable(size,p);return {W:u.W,H:u.H,x0:u.x0,y0:u.y0,p};};
 const ways=(p,size)=>{
  const {W,H,p:pr}=room(size),a=[{w:p.w,h:p.h,rot:false}];
  if(pr.rotate&&!p.norot&&p.w!==p.h)a.push({w:p.h,h:p.w,rot:true});
  return a.filter(o=>o.w<=W+1e-6&&o.h<=H+1e-6);
 };
 const best=(list,W)=>list.slice().sort((a,b)=>Math.floor(W/b.w)-Math.floor(W/a.w)||a.h-b.h)[0];
 const order=list.slice().sort((a,b)=>(a.priority-b.priority)*(strategy.prefer==='priority'?1000000:1)||strategy.order(a,b)||a.piece.localeCompare(b.piece));
 const push=(s,st,o,p)=>{
  const {x0,y0,p:pr}=room(s.size),gap=st.pieces.length?cutGapBetween(p,st.pieces[st.pieces.length-1],pr):0;
  const x=st.pieces.length?st.x+gap:st.x;st.x=x+o.w;st.pieces.push(p);
  s.pieces.push({piece:p.piece,shape:!!p.shape,x:cutRound(x0+x),y:cutRound(y0+st.y),w:cutRound(o.w),h:cutRound(o.h),rot:o.rot,locked:false});
 };
 /* Новый лист: первый размер склада, который ещё остался. */
 const open=p=>{
  for(const row of stock){
   if(row.limit&&(used.get(row.key)||0)>=row.limit)continue;
   if(!ways(p,row).length)continue;
   used.set(row.key,(used.get(row.key)||0)+1);
   const s={no:sheets.length+1,size:{key:row.key,w:row.w,h:row.h,supplier:row.supplier},locked:false,pieces:[],strips:[]};
   sheets.push(s);return s;
  }
  return null;
 };
 order.forEach(p=>{
  if(!stock.some(row=>ways(p,row).length)){unplaced.push({piece:p.piece,reason:'Larger than the sheet'});return;}
  for(const s of sheets){
   if(s.locked)continue;
   const {W,H}=room(s.size),list=ways(p,s.size);if(!list.length)continue;
   let done=false;
   for(const st of s.strips){
    const pr=paramsFor(s.size),gap=st.pieces.length?cutGapBetween(p,st.pieces[st.pieces.length-1],pr):0;
    const o=list.find(x=>cutSliverOk(st.h-x.h,pr)&&st.x+gap+x.w<=W+1e-6);
    if(o){push(s,st,o,p);done=true;break;}
   }
   if(done)return;
   const usedH=s.strips.length?Math.max(...s.strips.map(x=>x.y+x.h)):0;
   const vgap=s.strips.length?cutEdgeGap(p,paramsFor(s.size)):0,y=usedH?usedH+vgap:0;
   const o=best(list.filter(x=>y+x.h<=H+1e-6),W);
   if(o){const st={y,h:o.h,x:0,pieces:[]};s.strips.push(st);push(s,st,o,p);return;}
  }
  const s=open(p);
  if(!s){unplaced.push({piece:p.piece,reason:'No sheets left'});return;}
  const {W,H}=room(s.size),o=best(ways(p,s.size).filter(x=>x.h<=H+1e-6),W),st={y:0,h:o.h,x:0,pieces:[]};
  s.strips.push(st);push(s,st,o,p);
 });
 sheets.forEach(s=>{delete s.strips;});
 return {sheets,unplaced};
}
function cutCloneSheet(s){return {no:s.no,size:Object.assign({},s.size),locked:!!s.locked,pieces:s.pieces.map(p=>Object.assign({},p)),strips:[]};}
/* Самый большой свободный прямоугольник листа — тот кусок, который кладут
   на стеллаж. Остальной остаток — брак (NetScrap). */
function cutFreeRect(sheet,size,params){
 const {x0,y0,W,H}=cutUsable(size,params);
 if(!(W>0&&H>0))return null;
 const xs=[0,W],ys=[0,H];
 sheet.pieces.forEach(p=>{xs.push(cutRound(p.x-x0),cutRound(p.x-x0+p.w));ys.push(cutRound(p.y-y0),cutRound(p.y-y0+p.h));});
 const X=[...new Set(xs.filter(v=>v>=0&&v<=W))].sort((a,b)=>a-b),Y=[...new Set(ys.filter(v=>v>=0&&v<=H))].sort((a,b)=>a-b);
 const cols=X.length-1,rows=Y.length-1;if(cols<1||rows<1)return null;
 const busy=[];
 for(let r=0;r<rows;r++){busy.push(new Array(cols).fill(false));}
 sheet.pieces.forEach(p=>{
  const px=cutRound(p.x-x0),py=cutRound(p.y-y0);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
   if(X[c]>=px-1e-6&&X[c+1]<=px+p.w+1e-6&&Y[r]>=py-1e-6&&Y[r+1]<=py+p.h+1e-6)busy[r][c]=true;
  }
 });
 let best=null;
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
  if(busy[r][c])continue;
  let maxC=cols;
  for(let r2=r;r2<rows;r2++){
   let c2=c;while(c2<maxC&&!busy[r2][c2])c2++;
   maxC=Math.min(maxC,c2);if(maxC<=c)break;
   const w=X[maxC]-X[c],h=Y[r2+1]-Y[r];
   if(!best||w*h>best.w*best.h)best={x:cutRound(x0+X[c]),y:cutRound(y0+Y[r]),w:cutRound(w),h:cutRound(h)};
  }
 }
 if(!best)return null;
 const minW=+params.minOffcutW||0,minH=+params.minOffcutH||0;
 const ok=Math.min(best.w,best.h)>=Math.min(minW,minH)-1e-6&&Math.max(best.w,best.h)>=Math.max(minW,minH)-1e-6;
 return ok?best:null;
}
/* Цифры листа: Used, Gross Scrap, NetScrap — как в Perfect Cut. */
function cutSheetNumbers(sheet,size,params){
 size=sheet.size||size;
 const used=sheet.pieces.reduce((a,p)=>a+cutArea(p.w,p.h),0),total=cutArea(size.w,size.h);
 const offcut=cutFreeRect(sheet,size,params),keep=offcut?cutArea(offcut.w,offcut.h):0;
 sheet.offcut=offcut;sheet.used=cutFt2(used);sheet.gross=cutFt2(total-used);sheet.net=cutFt2(Math.max(0,total-used-keep));sheet.keep=cutFt2(keep);
 return sheet;
}
function cutGroupNumbers(group,paramsFor){group.sheets.forEach(s=>cutSheetNumbers(s,s.size||group.sheet,paramsFor(s.size||group.sheet)));return group;}
function cutTotals(groups){
 const t={pieces:0,placed:0,sheets:0,used:0,gross:0,net:0,keep:0,area:0};
 groups.forEach(g=>g.sheets.forEach(s=>{
  const size=s.size||g.sheet;t.sheets++;t.placed+=s.pieces.length;t.used+=s.used;t.gross+=s.gross;t.net+=s.net;t.keep+=s.keep;t.area+=cutArea(size.w,size.h);
 }));
 ['used','gross','net','keep','area'].forEach(k=>{t[k]=cutFt2(t[k]);});
 t.usedPct=cutPct(t.used,t.used+t.net);t.grossPct=cutPct(t.gross,t.area);t.netPct=cutPct(t.net,t.area);
 return t;
}
/* Потери по заказу: NetScrap делится по площади деталей заказа. По этой
   цифре владелец считает цену большого заказа. */
function cutByOrder(plan,pieces){
 const by=new Map();
 plan.groups.forEach(g=>g.sheets.forEach(s=>s.pieces.forEach(p=>{
  const src=pieces.find(x=>x.piece===p.piece);if(!src)return;
  const row=by.get(src.order)||{order:src.order,customer:src.customer,pieces:0,used:0};
  row.pieces++;row.used+=cutArea(p.w,p.h);by.set(src.order,row);
 })));
 const total=plan.stats.used||0;
 return [...by.values()].map(r=>Object.assign(r,{used:cutFt2(r.used),
  net:cutFt2(total?plan.stats.net*r.used/total:0),
  pct:total?cutPct(plan.stats.net*r.used/total,r.used+plan.stats.net*r.used/total):0})).sort((a,b)=>b.used-a.used);
}

/* ------------------------------ Прогон ------------------------------ */
function cutPlanFor(number){return (DB.cutPlan||[]).find(p=>p&&p.batch===number)||null;}
function cutStamp(pieces){return pieces.filter(p=>!p.off).map(p=>p.piece+':'+p.w+'x'+p.h).join('|');}
function cutSettingsOf(number){const p=cutPlanFor(number);return p&&p.settings&&typeof p.settings==='object'?p.settings:{};}
function cutPlanRun(number){
 const b=glassBatchFind(number);if(!b)return {error:'Batch not found.'};
 const settings=cutSettingsOf(number),prev=cutPlanFor(number);
 const all=cutPieces(b,settings),live=all.filter(p=>!p.off);
 if(!live.length)return {error:'No glass to optimize.'};
 const groups=[],missing=[];
 const byGlass=new Map();live.forEach(p=>{const k=p.glass+'|'+p.mm;if(!byGlass.has(k))byGlass.set(k,[]);byGlass.get(k).push(p);});
 [...byGlass.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([k,list])=>{
  const glass=list[0].glass,mm=list[0].mm,pick=(prev&&prev.sheetPick&&prev.sheetPick[glass])||null,stock=cutStockFor(glass,pick);
  if(!stock.length){missing.push(glass);return;}
  const paramsFor=size=>cutRunParams(mm,size,pick);
  /* Заблокированные листы прошлого прогона остаются как есть и идут первыми. */
  const keptSheets=[],keptIds=new Set();
  const old=prev&&prev.groups.find(g=>g.glass===glass&&g.mm===mm);
  if(old)old.sheets.filter(s=>s.locked).forEach(s=>{
   const alive=s.pieces.filter(p=>list.some(x=>x.piece===p.piece));
   if(alive.length){keptSheets.push({no:keptSheets.length+1,size:s.size||old.sheet,locked:true,pieces:alive.map(p=>Object.assign({},p))});alive.forEach(p=>keptIds.add(p.piece));}
  });
  const rest=list.filter(p=>!keptIds.has(p.piece));
  /* Несколько стратегий — берём вариант с наименьшим NetScrap. */
  let win=null;
  CUT_STRATEGIES.forEach(strategy=>{
   const packed=cutPack(rest,stock,paramsFor,strategy,keptSheets,mm);
   const first=packed.sheets[0]&&packed.sheets[0].size||stock[0];
   /* pick — правки прогона на экране: по ним же проверяются ручные правки и рисуется лист. */
   const g={glass,mm,sheet:first,stock,pick,params:paramsFor(first),sheets:packed.sheets,unplaced:packed.unplaced};
   cutGroupNumbers(g,paramsFor);
   const net=g.sheets.reduce((a,s)=>a+s.net,0),score=[net,g.sheets.length];
   if(!win||score[0]<win.score[0]-1e-9||(Math.abs(score[0]-win.score[0])<1e-9&&score[1]<win.score[1]))win={g,score,strategy:strategy.k};
  });
  win.g.strategy=win.strategy;groups.push(win.g);
 });
 if(!groups.length)return {error:missing.length?'No sheet size for '+missing.join(', ')+'. Add it in Master Data.':'No glass to optimize.'};
 const plan={batch:number,at:new Date().toISOString(),stamp:cutStamp(all),settings,sheetPick:(prev&&prev.sheetPick)||{},groups,missing,
  excluded:all.filter(p=>p.off).map(p=>p.piece),stats:{}};
 cutPlanRefresh(plan,all);
 DB.cutPlan=(DB.cutPlan||[]).filter(p=>p&&p.batch!==number).concat([plan]);
 touch();
 return {plan};
}
/* Пересчёт цифр после любой правки руками. */
function cutPlanRefresh(plan,pieces){
 const b=glassBatchFind(plan.batch);
 pieces=pieces||cutPieces(b,plan.settings||{});
 plan.groups.forEach(g=>cutGroupNumbers(g,size=>cutGroupParams(g,size)));
 const t=cutTotals(plan.groups),live=pieces.filter(p=>!p.off);
 plan.stats=Object.assign(t,{total:live.length,excluded:pieces.length-live.length,
  unplaced:plan.groups.reduce((n,g)=>n+(g.unplaced||[]).length,0)});
 plan.orders=cutByOrder(plan,pieces);
 return plan;
}
function cutPlanStale(number){
 const plan=cutPlanFor(number),b=glassBatchFind(number);
 return !!(plan&&b&&plan.stamp!==cutStamp(cutPieces(b,plan.settings||{})));
}
function cutPlanIndex(number){
 const plan=cutPlanFor(number),m=new Map();if(!plan)return m;
 plan.groups.forEach(g=>g.sheets.forEach(s=>s.pieces.forEach((p,i)=>m.set(p.piece,{sheet:s.no,pos:i+1,glass:g.glass}))));
 return m;
}

/* --------------------------- Правки руками --------------------------- */
function cutFind(plan,pieceId){
 for(const g of plan.groups)for(const s of g.sheets){
  const i=s.pieces.findIndex(p=>p.piece===pieceId);
  if(i>=0)return {group:g,sheet:s,piece:s.pieces[i],index:i};
 }
 return null;
}
/* Всё, чем управляет владелец прямо на экране: склад листов прогона и
   параметры реза. «Чтобы в моменте никуда не нужно лезть в Master Data»
   (владелец, 18 сентября 2026) — Master Data остаётся значением по умолчанию. */
function cutRunPick(plan,glass){
 if(!plan.sheetPick||typeof plan.sheetPick!=='object')plan.sheetPick={};
 return plan.sheetPick[glass]||(plan.sheetPick[glass]={});
}
function cutSetStock(number,glass,key,field,value){
 const plan=cutPlanFor(number);if(!plan)return {error:'Optimize first.'};
 let edge=null;
 if(CUT_EDGES.includes(field)&&String(value==null?'':value).trim()!==''){
  edge=typeof cutIn==='function'?cutIn(value,null):+value;
  if(edge==null||!Number.isFinite(edge))return {error:'Enter a size like 3/4 or 1 1/2.'};
 }
 const pick=cutRunPick(plan,glass);
 if(!Array.isArray(pick.sizes))pick.sizes=cutSheetOptions(glass).map(r=>({key:cutSheetKey(r),limit:0,off:false}));
 let row=pick.sizes.find(x=>x&&x.key===key);if(!row){row={key,limit:0,off:false};pick.sizes.push(row);}
 if(field==='limit'){const n=Math.floor(+value);row.limit=Number.isFinite(n)&&n>0?n:0;}
 if(field==='off')row.off=!!value;
 if(field==='first')pick.sizes=[row].concat(pick.sizes.filter(x=>x!==row));
 /* Пусто — снова значение из Master Data. */
 if(CUT_EDGES.includes(field)){if(edge==null)delete row[field];else row[field]=edge;}
 touch();return cutPlanRun(number);
}
const CUT_RUN_FIELDS=['trimX','trimY','borderX','borderY','minDist','minOffcutW','minOffcutH','rotate'];
function cutSetParam(number,glass,field,value){
 const plan=cutPlanFor(number);if(!plan)return {error:'Optimize first.'};
 if(!CUT_RUN_FIELDS.includes(field))return {error:'Unknown cutting parameter.'};
 const pick=cutRunPick(plan,glass);
 if(field==='rotate')pick.rotate=!!value;
 else{const v=typeof cutIn==='function'?cutIn(value,null):+value;if(v==null||!Number.isFinite(v))return {error:'Enter a size like 3/4 or 1 1/2.'};pick[field]=v;}
 touch();return cutPlanRun(number);
}
function cutResetParams(number,glass){
 const plan=cutPlanFor(number);if(!plan)return {error:'Optimize first.'};
 if(plan.sheetPick)delete plan.sheetPick[glass];
 touch();return cutPlanRun(number);
}
function cutSetting(number,pieceId,field,value){
 const plan=cutPlanFor(number);if(!plan)return {error:'Optimize first.'};
 if(!plan.settings||typeof plan.settings!=='object')plan.settings={};
 const own=plan.settings[pieceId]||(plan.settings[pieceId]={});
 if(field==='off'){own.off=!!value;if(own.off){const at=cutFind(plan,pieceId);if(at)at.sheet.pieces.splice(at.index,1);}}
 if(field==='priority')own.priority=cutPriority(value);
 if(field==='norot')own.norot=!!value;
 cutPlanRefresh(plan);touch();return {ok:true};
}
/* Помещается ли деталь: внутри листа и не задевает соседей с их зазором. */
function cutRoom(group,sheet,box,params,ignore,src){
 const u=cutUsable(sheet.size||group.sheet,params);
 if(box.x<u.x0-1e-6||box.y<u.y0-1e-6||box.x+box.w>u.x1+1e-6||box.y+box.h>u.y1+1e-6)return 'Outside the sheet';
 const hit=sheet.pieces.find(p=>{
  if(p.piece===ignore)return false;
  const gap=cutGapBetween(src,{shape:p.shape},params);
  return box.x<p.x+p.w+gap-1e-6&&p.x<box.x+box.w+gap-1e-6&&box.y<p.y+p.h+gap-1e-6&&p.y<box.y+box.h+gap-1e-6;
 });
 return hit?'Overlaps '+hit.piece:'';
}
function cutPieceTake(number,pieceId){
 const plan=cutPlanFor(number),at=plan&&cutFind(plan,pieceId);if(!at)return {error:'Piece is not on a sheet.'};
 if(at.sheet.locked)return {error:'Sheet is locked.'};
 at.sheet.pieces.splice(at.index,1);cutPlanRefresh(plan);touch();return {ok:true};
}
function cutPiecePlace(number,pieceId,sheetNo,x,y,turn){
 const plan=cutPlanFor(number);if(!plan)return {error:'Optimize first.'};
 const pieces=cutPieces(glassBatchFind(number),plan.settings||{}),src=pieces.find(p=>p.piece===pieceId);
 if(!src||src.off)return {error:'Piece is not in this cut.'};
 const group=plan.groups.find(g=>g.glass===src.glass&&g.mm===src.mm);if(!group)return {error:'No layout for this glass.'};
 const at=cutFind(plan,pieceId);
 const sheet=group.sheets.find(s=>s.no===+sheetNo)||(at&&at.sheet);if(!sheet)return {error:'No such sheet.'};
 const params=cutGroupParams(group,sheet.size);
 if(sheet.locked)return {error:'Sheet is locked.'};
 const rot=typeof turn==='boolean'?turn:at?!!at.piece.rot:false,w=rot?src.h:src.w,h=rot?src.w:src.h;
 const box={x:cutRound(+x),y:cutRound(+y),w,h},bad=cutRoom(group,sheet,box,params,pieceId,src);
 if(bad)return {error:bad};
 if(at)at.sheet.pieces.splice(at.index,1);
 sheet.pieces.push({piece:pieceId,shape:!!src.shape,x:box.x,y:box.y,w,h,rot,locked:at?!!at.piece.locked:false});
 cutPlanRefresh(plan);touch();return {ok:true};
}
/* Положить деталь на лист самому: первое свободное место сверху вниз.
   Так работает бросок на вкладку листа — координаты человеку не нужны. */
function cutPieceAuto(number,pieceId,sheetNo){
 const plan=cutPlanFor(number);if(!plan)return {error:'Optimize first.'};
 const pieces=cutPieces(glassBatchFind(number),plan.settings||{}),src=pieces.find(p=>p.piece===pieceId);
 if(!src||src.off)return {error:'Piece is not in this cut.'};
 const group=plan.groups.find(g=>g.glass===src.glass&&g.mm===src.mm);if(!group)return {error:'No layout for this glass.'};
 const sheet=group.sheets.find(x=>x.no===+sheetNo);if(!sheet)return {error:'No such sheet.'};
 const params=cutGroupParams(group,sheet.size),u=cutUsable(sheet.size||group.sheet,params),xs=[u.x0].concat(sheet.pieces.map(p=>cutRound(p.x+p.w))),ys=[u.y0].concat(sheet.pieces.map(p=>cutRound(p.y+p.h)));
 /* Своя ориентация, а если не лезет и поворот разрешён — повёрнутая. */
 const turns=[false].concat(params.rotate&&!src.norot&&src.w!==src.h?[true]:[]);
 for(const y of [...new Set(ys)].sort((a,b)=>a-b))for(const x of [...new Set(xs)].sort((a,b)=>a-b))for(const rot of turns){
  const box={x,y,w:rot?src.h:src.w,h:rot?src.w:src.h};
  if(!cutRoom(group,sheet,box,params,pieceId,src))return cutPiecePlace(number,pieceId,sheetNo,x,y,rot);
 }
 return {error:'No room on this sheet.'};
}
function cutPieceRotate(number,pieceId){
 const plan=cutPlanFor(number),at=plan&&cutFind(plan,pieceId);if(!at)return {error:'Piece is not on a sheet.'};
 if(at.sheet.locked)return {error:'Sheet is locked.'};
 const params=cutGroupParams(at.group,at.sheet.size),p=at.piece,box={x:p.x,y:p.y,w:p.h,h:p.w};
 const src=cutPieces(glassBatchFind(number),plan.settings||{}).find(x=>x.piece===pieceId)||{};
 const bad=cutRoom(at.group,at.sheet,box,params,pieceId,src);if(bad)return {error:bad};
 p.w=box.w;p.h=box.h;p.rot=!p.rot;cutPlanRefresh(plan);touch();return {ok:true};
}
function cutPieceLock(number,pieceId){
 const plan=cutPlanFor(number),at=plan&&cutFind(plan,pieceId);if(!at)return {error:'Piece is not on a sheet.'};
 at.piece.locked=!at.piece.locked;cutPlanRefresh(plan);touch();return {ok:true};
}
function cutSheetLock(number,glass,sheetNo){
 const plan=cutPlanFor(number);if(!plan)return {error:'Optimize first.'};
 const g=plan.groups.find(x=>x.glass===glass);const s=g&&g.sheets.find(x=>x.no===+sheetNo);
 if(!s)return {error:'No such sheet.'};
 s.locked=!s.locked;cutPlanRefresh(plan);touch();return {ok:true};
}

/* ------------------------------ Хранение ------------------------------ */
function normalizeCutPlans(){
 if(!Array.isArray(DB.cutPlan))DB.cutPlan=[];
 const seen=new Set();
 DB.cutPlan=DB.cutPlan.filter(p=>p&&typeof p==='object'&&typeof p.batch==='string'&&Array.isArray(p.groups)&&!seen.has(p.batch)&&(seen.add(p.batch),true)&&(typeof glassBatchFind!=='function'||glassBatchFind(p.batch)))
  .map(p=>{
   const plan=Object.assign({},p,{settings:p.settings&&typeof p.settings==='object'&&!Array.isArray(p.settings)?p.settings:{},
    groups:p.groups.filter(g=>g&&Array.isArray(g.sheets)&&g.sheet).map(g=>Object.assign({},g,{
     sheets:g.sheets.filter(s=>s&&Array.isArray(s.pieces)).map((s,i)=>Object.assign({},s,{no:i+1,locked:!!s.locked,
      pieces:s.pieces.filter(x=>x&&typeof x.piece==='string'&&+x.w>0&&+x.h>0)})),
     unplaced:Array.isArray(g.unplaced)?g.unplaced:[]}))});
   if(typeof cutParamsFor==='function')try{cutPlanRefresh(plan);}catch(e){}
   return plan;
  });
}
function validateCutPlanPayload(src){
 if(src.cutPlan==null)return;
 if(!Array.isArray(src.cutPlan))throw new Error('Cut plans must be an array.');
 const seen=new Set();
 src.cutPlan.forEach(p=>{
  if(!p||typeof p!=='object'||typeof p.batch!=='string'||!p.batch||!Array.isArray(p.groups))throw new Error('Invalid cut plan.');
  if(seen.has(p.batch))throw new Error('Duplicate cut plan for '+p.batch+'.');seen.add(p.batch);
  if(p.settings!=null&&(typeof p.settings!=='object'||Array.isArray(p.settings)))throw new Error('Invalid cut plan settings.');
 });
}
